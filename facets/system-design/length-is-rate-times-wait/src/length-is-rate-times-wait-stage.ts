/**
 * length-is-rate-times-wait 의 stage.
 *
 * 위: 요청마다 한 줄 — 도착 눈금에서 떠남까지 1 초 한 칸. 처리 칸은 앞 요청이 비켜 줄 때까지
 *     오른쪽으로 밀리고, 밀린 자리가 기다림 칸이 된다.
 * 오른쪽: 요청마다 한 기둥 — 드러난 머묾 칸이 줄에서 날아와 쌓인다 (머묾의 합).
 * 아래: 시각마다 한 기둥 — 마지막 걸음에 같은 칸들이 제 시각 자리로 떨어져 쌓인다 (시스템 안 요청 수).
 * 두 기둥 무리는 같은 칸들이라 넓이가 같고, 평균 높이 선이 W 와 L 이다.
 */
import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { LengthIsRateTimesWaitScene, RevealedStay } from './scene.js';

const H = 330;
const SVG_NS = 'http://www.w3.org/2000/svg';

const LEFT = 34;
const GAP = 34;
/** 오른쪽 기둥 끝 뒤에 W 글자 자리 */
const RIGHT = 44;
const ROWS_TOP = 52;
const CELL_W_MAX = 24;
const BAR_H_MAX = 16;
const AXIS_BAND = 18;
const HIST_TITLE_BAND = 20;
const BOTTOM_BAND = 22;

const SLIDE_MS = 260;
const FLY_MS = 420;
const FALL_MS = 620;

type Layout = {
  u: number;
  bh: number;
  rp: number;
  xAt: (sec: number) => number;
  rowY: (row: number) => number;
  axisY: number;
  histTitleY: number;
  base: number;
  colX: (k: number) => number;
  colsRight: number;
  timeRight: number;
};

function layoutFor(scene: LengthIsRateTimesWaitScene, maxInSystem: number): Layout {
  const n = scene.requests.length;
  const u = Math.min(CELL_W_MAX, Math.floor((PIECE_CANVAS_W - LEFT - GAP - RIGHT) / (scene.window + n)));
  // 세로는 고정 — 줄 수와 가장 긴 줄에 맞춰 칸 높이를 줄인다
  const room = H - ROWS_TOP - AXIS_BAND - HIST_TITLE_BAND - BOTTOM_BAND;
  const bh = Math.min(BAR_H_MAX, Math.floor((room - n * 4) / (n + maxInSystem)));
  if (bh < 4) throw new Error('length-is-rate-times-wait stage: 칸이 너무 많아 담을 수 없다');
  const rp = bh + 4;
  const timeRight = LEFT + scene.window * u;
  const colsLeft = timeRight + GAP;
  const axisY = ROWS_TOP + n * rp + 2;
  const histTitleY = axisY + AXIS_BAND + 12;
  const base = histTitleY + 8 + maxInSystem * bh;
  return {
    u,
    bh,
    rp,
    xAt: (sec) => LEFT + sec * u,
    rowY: (row) => ROWS_TOP + row * rp,
    axisY,
    histTitleY,
    base,
    colX: (k) => colsLeft + k * u,
    colsRight: colsLeft + n * u,
    timeRight,
  };
}

/** 표시할 때만 반올림 — 소수 둘째 자리까지, 끝의 0 과 -0 을 걷는다 */
function shown(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function part(p: number, from: number, to: number): number {
  if (p <= from) return 0;
  if (p >= to) return 1;
  return (p - from) / (to - from);
}

type Mover = { el: SVGRectElement; dx: number; dy: number; x: number; y: number };
type Reveal = { el: SVGElement; at: number };

export const lengthIsRateTimesWaitStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // 운동이 잡아 쓰는 손잡이 — drawStatic 이 매번 새로 채운다
    let slideCells: Mover[] = [];
    let waitReveals: Reveal[] = [];
    let flyCells: Mover[] = [];
    let fallCells: Mover[] = [];
    let levelLines: Array<{ el: SVGLineElement; x1: number; x2: number }> = [];
    let lateMarks: SVGElement[] = [];

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function write(x: number, y: number, body: string, opts: { anchor?: string; size?: string; mono?: boolean; fill?: string; weight?: number; halo?: boolean } = {}): SVGTextElement {
      const node = el('text', {
        x: shown(x),
        y: shown(y),
        'text-anchor': opts.anchor ?? 'start',
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.xs,
        fill: opts.fill ?? colors.text,
      });
      if (opts.weight !== undefined) node.setAttribute('font-weight', String(opts.weight));
      if (opts.halo) {
        node.setAttribute('stroke', colors.bg);
        node.setAttribute('stroke-width', '3');
        node.setAttribute('paint-order', 'stroke');
      }
      node.textContent = body;
      return node;
    }

    /** 1 초 한 칸. 기다림 칸은 속이 빈 칸, 처리 칸은 찬 칸 */
    function cell(x: number, y: number, lay: Layout, waiting: boolean, active: boolean): SVGRectElement {
      const ink = active ? colors.itemActive : colors.itemSorted;
      const attrs: Record<string, string | number> = {
        x: shown(x + 1),
        y: shown(y),
        width: shown(lay.u - 2),
        height: shown(lay.bh),
        rx: 2,
        stroke: ink,
        'stroke-width': 1.5,
        fill: waiting ? colors.bg : ink,
      };
      return el('rect', attrs);
    }

    function stayOf(scene: LengthIsRateTimesWaitScene, id: string): RevealedStay | undefined {
      return scene.revealed.find((s) => s.id === id);
    }

    function drawStatic(scene: LengthIsRateTimesWaitScene): void {
      svg.textContent = '';
      slideCells = [];
      waitReveals = [];
      flyCells = [];
      fallCells = [];
      levelLines = [];
      lateMarks = [];
      el('rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: colors.bg });
      if (scene.maxInSystem === null || scene.maxStay === null || scene.sum === null) return;
      const lay = layoutFor(scene, scene.maxInSystem);
      const step = scene.step;
      const activeId = step.kind === 'stay' ? step.id : null;

      // ── 캡션: 지금 일어나는 일만
      if (step.kind === 'ready') {
        write(LEFT, 22, t('caption.ready', 'Requests: {n}. Observed from 0 s to {end} s. Stays are not known yet.', {
          n: scene.requests.length,
          end: scene.window,
        }), { size: fontSizes.sm });
      } else if (step.kind === 'stay') {
        const s = stayOf(scene, step.id);
        const req = scene.requests.find((r) => r.id === step.id);
        if (s === undefined || req === undefined) throw new Error(`length-is-rate-times-wait stage: 드러나지 않은 요청 ${step.id}`);
        write(LEFT, 22, t('caption.stay', '{id}: arrives at {a} s, starts at {start} s, leaves at {leave} s. Stay: {stay} s.', {
          id: s.id,
          a: req.arrive,
          start: s.start,
          leave: s.leave,
          stay: s.stay,
        }), { size: fontSizes.sm });
      } else {
        const b = scene.balance;
        if (b === null) throw new Error('length-is-rate-times-wait stage: 셈 맞춤 걸음에 결과가 없다');
        write(LEFT, 18, t('caption.balance', 'λ = {count}/{window} = {rate}/s · W = {sum}/{count} = {w} s · L = {area}/{window} = {l}', {
          count: b.count,
          window: b.window,
          rate: shown(b.rate),
          sum: b.sum,
          w: shown(b.meanStay),
          area: b.area,
          l: shown(b.meanLength),
        }), { size: fontSizes.sm });
        write(LEFT, 37, t('caption.product', 'λ × W = {rate} × {w} = {product}', {
          rate: shown(b.rate),
          w: shown(b.meanStay),
          product: shown(b.product),
        }), { size: fontSizes.sm, weight: 600 });
      }

      // ── 시간 축 (줄과 아래 기둥이 함께 쓴다)
      el('line', { x1: LEFT, y1: lay.axisY, x2: lay.timeRight, y2: lay.axisY, stroke: colors.border, 'stroke-width': 1 });
      for (let sec = 0; sec <= scene.window; sec += 1) {
        const x = lay.xAt(sec);
        el('line', { x1: x, y1: lay.axisY, x2: x, y2: lay.axisY + 4, stroke: colors.textMuted, 'stroke-width': 1 });
        if (sec % 2 === 0) write(x, lay.axisY + 15, String(sec), { anchor: 'middle', fill: colors.textMuted, mono: true });
      }
      write(LEFT - 6, lay.axisY + 15, t('label.seconds', 's'), { anchor: 'end', fill: colors.textMuted });

      // ── 줄: 요청마다 도착에서 떠남까지
      scene.requests.forEach((req, row) => {
        const y = lay.rowY(row);
        const active = req.id === activeId;
        write(LEFT - 6, y + lay.bh - 3, req.id, {
          anchor: 'end',
          mono: true,
          fill: active ? colors.itemActive : colors.text,
          weight: active ? 700 : 400,
        });
        const ax = lay.xAt(req.arrive);
        el('line', { x1: ax, y1: y - 2, x2: ax, y2: y + lay.bh + 2, stroke: colors.text, 'stroke-width': 2 });
        const s = stayOf(scene, req.id);
        if (s === undefined) {
          // 처리 시간만 안다 — 어디서 시작할지는 아직 모른다
          el('rect', {
            x: shown(ax + 1),
            y: shown(y),
            width: shown(req.service * lay.u - 2),
            height: shown(lay.bh),
            rx: 2,
            fill: 'none',
            stroke: colors.ghostOutline,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
          });
          return;
        }
        const waitCells = s.start - req.arrive;
        for (let i = 0; i < s.stay; i += 1) {
          const waiting = i < waitCells;
          const rect = cell(lay.xAt(req.arrive + i), y, lay, waiting, active);
          if (active && waiting) waitReveals.push({ el: rect, at: (i + 1) / waitCells });
          if (active && !waiting) {
            slideCells.push({ el: rect, dx: -waitCells * lay.u, dy: 0, x: lay.xAt(req.arrive + i) + 1, y });
          }
        }
      });

      // ── 오른쪽: 요청마다 한 기둥 (머묾의 합)
      const colTop = lay.base - scene.maxStay * lay.bh;
      write(lay.colX(0), colTop - 20, t('label.perRequest', 'Stay of each request'), { fill: colors.textMuted });
      write(lay.colsRight, colTop - 20, t('label.sum', 'Sum: {sum}', { sum: scene.sum }), {
        anchor: 'end',
        weight: 700,
      });
      el('line', { x1: lay.colX(0), y1: lay.base, x2: lay.colsRight, y2: lay.base, stroke: colors.border, 'stroke-width': 1 });
      scene.requests.forEach((req, k) => {
        const cx = lay.colX(k);
        const active = req.id === activeId;
        write(cx + lay.u / 2, lay.base + 13, req.id, {
          anchor: 'middle',
          mono: true,
          size: fontSizes.xs,
          fill: active ? colors.itemActive : colors.textMuted,
        });
        const s = stayOf(scene, req.id);
        if (s === undefined) return;
        const waitCells = s.start - req.arrive;
        for (let i = 0; i < s.stay; i += 1) {
          const y = lay.base - (i + 1) * lay.bh;
          const rect = cell(cx, y, lay, i < waitCells, active);
          if (active) {
            const fromX = lay.xAt(req.arrive + i);
            const fromY = lay.rowY(k);
            flyCells.push({ el: rect, dx: fromX - cx, dy: fromY - y, x: cx + 1, y });
          }
        }
        const num = write(cx + lay.u / 2, lay.base - s.stay * lay.bh - 4, String(s.stay), {
          anchor: 'middle',
          mono: true,
          fill: active ? colors.itemActive : colors.text,
        });
        if (active) lateMarks.push(num);
      });

      // ── 아래: 시각마다 한 기둥 (시스템 안 요청 수) — 셈을 맞춘 걸음부터
      const b = scene.balance;
      write(LEFT, lay.histTitleY, t('label.perSecond', 'Requests in the system at each second'), { fill: colors.textMuted });
      el('line', { x1: LEFT, y1: lay.base, x2: lay.timeRight, y2: lay.base, stroke: colors.border, 'stroke-width': 1 });
      if (b === null) return;
      write(lay.timeRight, lay.histTitleY, t('label.area', 'Sum: {area}', { area: b.area }), { anchor: 'end', weight: 700 });
      const falling = step.kind === 'balance';
      b.columns.forEach((ids, sec) => {
        ids.forEach((id, j) => {
          const row = scene.requests.findIndex((r) => r.id === id);
          const req = scene.requests[row];
          const s = stayOf(scene, id);
          if (req === undefined || s === undefined) throw new Error(`length-is-rate-times-wait stage: 기둥의 ${id} 가 드러나지 않았다`);
          const x = lay.xAt(sec);
          const y = lay.base - (j + 1) * lay.bh;
          const rect = cell(x, y, lay, sec < s.start, false);
          if (falling) fallCells.push({ el: rect, dx: 0, dy: lay.rowY(row) - y, x: x + 1, y });
        });
      });

      // 평균 높이 선 — 같은 합을 요청 수로 나눈 높이(W)와 시각 수로 나눈 높이(L)
      const wy = lay.base - b.meanStay * lay.bh;
      const wLine = el('line', { x1: lay.colX(0) - 4, y1: shown(wy), x2: lay.colsRight + 4, y2: shown(wy), stroke: colors.accent, 'stroke-width': 2.5 });
      const ly = lay.base - b.meanLength * lay.bh;
      const lLine = el('line', { x1: LEFT - 4, y1: shown(ly), x2: lay.timeRight + 4, y2: shown(ly), stroke: colors.accent, 'stroke-width': 2.5 });
      const wText = write(lay.colsRight + 8, wy + 4, t('label.w', 'W = {w}', { w: shown(b.meanStay) }), { weight: 700 });
      const lText = write(lay.timeRight + 4, ly - 5, t('label.l', 'L = {l}', { l: shown(b.meanLength) }), { anchor: 'end', weight: 700, halo: true });
      if (falling) {
        levelLines.push({ el: wLine, x1: lay.colX(0) - 4, x2: lay.colsRight + 4 });
        levelLines.push({ el: lLine, x1: LEFT - 4, x2: lay.timeRight + 4 });
        lateMarks.push(wText, lText);
      }
    }

    function wait(ms: number, mine: number): Promise<boolean> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve(false);
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          waiters.delete(wake);
          resolve(mine === gen && !destroyed);
        }, ms);
        timers.add(id);
      });
    }

    /** 한 시계 — 진행률 0..1 을 frame 에 넘긴다 */
    async function run(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      const began = Date.now();
      frame(0);
      for (;;) {
        if (!(await wait(16, mine))) return false;
        const p = Math.min(1, (Date.now() - began) / ms);
        frame(p);
        if (p >= 1) return true;
      }
    }

    function place(m: Mover, left: number): void {
      m.el.setAttribute('x', shown(m.x + m.dx * left));
      m.el.setAttribute('y', shown(m.y + m.dy * left));
    }

    async function animateStay(mine: number): Promise<boolean> {
      const total = SLIDE_MS + FLY_MS;
      const slideEnd = SLIDE_MS / total;
      return run(total, mine, (p) => {
        // 처리 칸이 앞 요청이 비켜 줄 때까지 밀리고, 밀린 자리가 기다림으로 드러난다
        const slid = ease(part(p, 0, slideEnd));
        for (const m of slideCells) place(m, 1 - slid);
        for (const r of waitReveals) r.el.setAttribute('opacity', slid >= r.at - 1e-9 ? '1' : '0');
        // 머묾 칸이 줄에서 떠나 제 기둥으로 날아가 쌓인다
        const flown = ease(part(p, slideEnd, 1));
        for (const m of flyCells) {
          place(m, 1 - flown);
          m.el.setAttribute('opacity', p < slideEnd ? '0' : '1');
        }
        for (const node of lateMarks) node.setAttribute('opacity', p >= 1 ? '1' : '0');
      });
    }

    async function animateBalance(mine: number): Promise<boolean> {
      return run(FALL_MS, mine, (p) => {
        // 줄의 칸이 제 시각 자리로 곧장 떨어져 시각마다 쌓인다
        const fallen = ease(part(p, 0, 0.7));
        for (const m of fallCells) place(m, 1 - fallen);
        const drawn = ease(part(p, 0.6, 1));
        for (const line of levelLines) {
          line.el.setAttribute('x2', shown(line.x1 + (line.x2 - line.x1) * drawn));
        }
        for (const node of lateMarks) node.setAttribute('opacity', p >= 1 ? '1' : '0');
      });
    }

    return {
      async render(
        next: LengthIsRateTimesWaitScene,
        prev: LengthIsRateTimesWaitScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || prev === null) return;
        let done = true;
        if (next.step.kind === 'stay' && prev.revealed.length + 1 === next.revealed.length) {
          done = await animateStay(mine);
        } else if (next.step.kind === 'balance' && prev.balance === null) {
          done = await animateBalance(mine);
        }
        if (done && mine === gen && !destroyed) drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
