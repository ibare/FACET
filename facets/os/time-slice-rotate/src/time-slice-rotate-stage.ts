/**
 * time-slice-rotate stage — 몫을 다 쓴 것이 고리를 타고 줄 끝으로 돌아간다.
 *
 * 화면이 쥐는 것은 돌아 들어오는 줄과 각자의 남은 양이다.
 *   - 왼쪽 CPU 칸, 그 오른쪽으로 준비 줄. 줄의 앞은 CPU 쪽이다
 *   - CPU 위에서 줄 끝으로 넘어가는 고리 — 몫을 다 쓴 패가 이 길로 돌아간다
 *   - 패마다 길이만큼의 칸. 쓴 칸은 비고 남은 칸은 찬다. 돌아간 횟수는 패 위의 점
 *   - 아래 왼쪽은 끝난 것, 아래 오른쪽은 아직 오지 않은 것
 *
 * 걸음의 운동 (한 render 안에서 차례로):
 *   A. CPU 의 것이 틱을 써서 칸이 빈다 — 시계와 몫 칸이 함께 찬다
 *   B. 끝난 것은 아래로 내려가고, 몫을 다 쓴 것은 고리를 타고 오르며, 도착한 것은 줄 끝으로 걸어 든다
 *   C. 고리를 탄 것이 도착한 것 뒤, 줄 끝에 내려앉는다
 *   D. 줄이 한 칸씩 당겨지고 맨 앞이 CPU 에 오른다
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { RotateProc, TimeSliceRotateScene } from './scene.js';

const H = 360;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 16;
const ARROW_GAP = 28;
const SLOT_GAP = 10;
const TOKEN_H = 30;
const LABEL_W = 18;
const PAD = 6;
const CELL_MAX = 18;

const LANE_Y = 160;
const CPU_TOP = 112;
const CPU_BOTTOM = 204;
const ARC_Y = 50;
const RIDE_Y = 26;
const BOTTOM_HEAD_Y = 234;
const BOTTOM_Y = 258;
const BOTTOM_SUB_Y = 290;
const CAPTION_TOP = 316;

const MS_PER_TICK = 150;
const MS_LEAVE = 220;
const MS_LAND = 220;
const MS_SHIFT = 240;

type Pt = { x: number; y: number };

function r1(v: number): number {
  const n = Math.round(v * 10) / 10;
  return n === 0 ? 0 : n;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
}

function lerp(a: Pt, b: Pt, p: number): Pt {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, s: number): Pt {
  const u = 1 - s;
  return {
    x: u * u * u * p0.x + 3 * u * u * s * p1.x + 3 * u * s * s * p2.x + s * s * s * p3.x,
    y: u * u * u * p0.y + 3 * u * u * s * p1.y + 3 * u * s * s * p2.y + s * s * s * p3.y,
  };
}

/** 캔버스 폭에서 역산한 자리. 줄의 칸은 프로세스 수만큼 둔다 — 모두가 줄에 설 수 있다. */
type Geo = {
  slotW: number;
  cell: number;
  cpuX: number;
  cpuW: number;
  cpu: Pt;
  slot(i: number): Pt;
  doneAt(i: number): Pt;
  pendingAt(j: number): Pt;
  tokenW(len: number): number;
};

function geometry(n: number, maxLen: number): Geo {
  const slotW = (W - 2 * MARGIN - 20 - ARROW_GAP - n * SLOT_GAP) / (n + 1);
  const cell = Math.min(CELL_MAX, (slotW - LABEL_W - 2 * PAD) / maxLen);
  const cpuX = MARGIN;
  const cpuW = slotW + 20;
  const laneX = cpuX + cpuW + ARROW_GAP;
  return {
    slotW,
    cell,
    cpuX,
    cpuW,
    cpu: { x: cpuX + cpuW / 2, y: LANE_Y },
    slot: (i) => ({ x: laneX + i * (slotW + SLOT_GAP) + slotW / 2, y: LANE_Y }),
    doneAt: (i) => ({ x: MARGIN + i * (slotW + SLOT_GAP) + slotW / 2, y: BOTTOM_Y }),
    pendingAt: (j) => ({ x: W - MARGIN - j * (slotW + SLOT_GAP) - slotW / 2, y: BOTTOM_Y }),
    tokenW: (len) => LABEL_W + 2 * PAD + len * cell,
  };
}

function placeOf(scene: TimeSliceRotateScene, geo: Geo, id: string): Pt {
  if (scene.cpu === id) return geo.cpu;
  const q = scene.queue.indexOf(id);
  if (q >= 0) return geo.slot(q);
  const d = scene.done.indexOf(id);
  if (d >= 0) return geo.doneAt(d);
  const pend = scene.procs.filter((p) => p.where === 'pending').map((p) => p.id);
  const j = pend.indexOf(id);
  if (j >= 0) return geo.pendingAt(j);
  throw new Error(`time-slice-rotate stage: ${id} 의 자리가 없다`);
}

type TokenHandle = { g: SVGGElement; cells: SVGRectElement[]; len: number; color: string };

export const timeSliceRotateStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const small = parseFloat(fontSizes.xs);
    const body = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    let tokens = new Map<string, TokenHandle>();
    let clock: SVGTextElement | null = null;
    let meter: SVGRectElement[] = [];
    let doneSubs = new Map<string, SVGTextElement>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      text: string,
      x: number,
      y: number,
      opts: { size: number; fill: string; anchor?: 'start' | 'middle' | 'end'; weight?: number; mono?: boolean },
      parent: Element,
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size,
          'font-weight': opts.weight ?? 400,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'start',
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    function symbol(id: string): string {
      return id.toUpperCase();
    }

    function fillCells(h: TokenHandle, left: number): void {
      h.cells.forEach((c, k) => {
        const full = k >= h.len - left;
        c.setAttribute('fill', full ? h.color : 'none');
      });
    }

    function moveTo(h: TokenHandle, p: Pt): void {
      h.g.setAttribute('transform', `translate(${r1(p.x)},${r1(p.y)})`);
    }

    function drawToken(p: RotateProc, color: string, geo: Geo, at: Pt, parent: Element): TokenHandle {
      const g = el('g', {}, parent);
      const w = geo.tokenW(p.len);
      el(
        'rect',
        {
          x: -w / 2,
          y: -TOKEN_H / 2,
          width: w,
          height: TOKEN_H,
          rx: 6,
          fill: p.where === 'done' ? colors.bgSubtle : colors.bg,
          stroke: color,
          'stroke-width': p.where === 'cpu' ? 2.5 : 1.5,
        },
        g,
      );
      label(symbol(p.id), -w / 2 + PAD + LABEL_W / 2, 5, { size: body + 1, fill: colors.text, anchor: 'middle', weight: 700, mono: true }, g);
      const cells: SVGRectElement[] = [];
      const cx0 = -w / 2 + PAD + LABEL_W;
      const ch = Math.min(geo.cell - 3, TOKEN_H - 12);
      for (let k = 0; k < p.len; k += 1) {
        cells.push(
          el(
            'rect',
            {
              x: cx0 + k * geo.cell + 1.5,
              y: -ch / 2,
              width: geo.cell - 3,
              height: ch,
              rx: 2,
              fill: 'none',
              stroke: color,
              'stroke-width': 1,
            },
            g,
          ),
        );
      }
      for (let k = 0; k < p.laps; k += 1) {
        el('circle', { cx: w / 2 - 5 - k * 8, cy: -TOKEN_H / 2 - 6, r: 2.8, fill: color }, g);
      }
      const h: TokenHandle = { g, cells, len: p.len, color };
      fillCells(h, p.left);
      moveTo(h, at);
      return h;
    }

    function arrowHead(tip: Pt, dir: 'down' | 'left', fill: string, parent: Element): void {
      const s = 5;
      const pts =
        dir === 'down'
          ? [tip, { x: tip.x - s, y: tip.y - s * 1.4 }, { x: tip.x + s, y: tip.y - s * 1.4 }]
          : [tip, { x: tip.x + s * 1.4, y: tip.y - s }, { x: tip.x + s * 1.4, y: tip.y + s }];
      el('polygon', { points: pts.map((q) => `${r1(q.x)},${r1(q.y)}`).join(' '), fill }, parent);
    }

    function captionLines(scene: TimeSliceRotateScene): string[] {
      const step = scene.step;
      if (step === null) return [t('caption.start', 'Quantum in ticks: {q}', { q: scene.quantum })];
      const lines: string[] = [];
      if (step.finished !== null) {
        lines.push(t('caption.finish', 'Finished: {name} (tick {tick})', { name: symbol(step.finished), tick: scene.tick }));
      }
      if (step.arrived.length > 0) {
        lines.push(t('caption.arrive', 'Arrived: {names}', { names: step.arrived.map(symbol).join(', ') }));
      }
      if (step.back !== null) {
        lines.push(
          t('caption.expire', 'Quantum used up: {name} → back of the line (left: {left})', {
            name: symbol(step.back.id),
            left: step.back.left,
          }),
        );
      }
      if (step.picked !== null) {
        lines.push(t('caption.pick', 'On the CPU: {name}', { name: symbol(step.picked) }));
      }
      if (scene.done.length === scene.procs.length) {
        lines.push(t('caption.backs', 'Trips back to the line: {n}', { n: scene.backs }));
      }
      return lines;
    }

    function drawStatic(scene: TimeSliceRotateScene): void {
      svg.textContent = '';
      tokens = new Map();
      doneSubs = new Map();
      meter = [];
      const n = scene.procs.length;
      const geo = geometry(n, Math.max(...scene.procs.map((p) => p.len)));
      const palette = categorical(n);
      const root = el('g', {}, svg);

      clock = label(t('label.tick', 'Tick {tick}', { tick: scene.tick }), MARGIN, 30, {
        size: parseFloat(fontSizes.lg),
        fill: colors.text,
        weight: 700,
      }, root);

      // CPU 칸
      el(
        'rect',
        {
          x: geo.cpuX,
          y: CPU_TOP,
          width: geo.cpuW,
          height: CPU_BOTTOM - CPU_TOP,
          rx: 8,
          fill: colors.bgSubtle,
          stroke: colors.itemActive,
          'stroke-width': 2,
        },
        root,
      );
      label(t('label.cpu', 'CPU'), geo.cpuX + 8, CPU_TOP + 15, { size: small, fill: colors.textMuted, weight: 700 }, root);
      // 몫 칸 — 이번 차례에 쓴 틱
      const q = scene.quantum;
      const mCell = Math.min(14, (geo.cpuW - 64) / q);
      const mx0 = geo.cpuX + geo.cpuW - 8 - mCell * q;
      label(t('label.quantum', 'Quantum'), geo.cpuX + 8, CPU_BOTTOM - 8, { size: small, fill: colors.textMuted }, root);
      for (let k = 0; k < q; k += 1) {
        meter.push(
          el(
            'rect',
            {
              x: mx0 + k * mCell + 1,
              y: CPU_BOTTOM - 16,
              width: mCell - 2,
              height: 8,
              rx: 1.5,
              fill: 'none',
              stroke: colors.itemActive,
              'stroke-width': 1,
            },
            root,
          ),
        );
      }

      // 준비 줄
      const first = geo.slot(0);
      const last = geo.slot(n - 1);
      const laneL = first.x - geo.slotW / 2 - SLOT_GAP / 2;
      const laneR = last.x + geo.slotW / 2 + SLOT_GAP / 2;
      el(
        'rect',
        {
          x: laneL,
          y: LANE_Y - TOKEN_H / 2 - 8,
          width: laneR - laneL,
          height: TOKEN_H + 16,
          rx: 8,
          fill: 'none',
          stroke: colors.border,
          'stroke-dasharray': '4 4',
        },
        root,
      );
      label(t('label.queue', 'Ready queue'), laneL, LANE_Y - TOKEN_H / 2 - 14, { size: small, fill: colors.textMuted, weight: 700 }, root);
      // 줄 앞 → CPU
      const arrowR = laneL - 4;
      const arrowL = geo.cpuX + geo.cpuW + 4;
      el('line', { x1: arrowR, y1: LANE_Y, x2: arrowL + 6, y2: LANE_Y, stroke: colors.textMuted, 'stroke-width': 1.5 }, root);
      arrowHead({ x: arrowL, y: LANE_Y }, 'left', colors.textMuted, root);

      // 돌아가는 고리 — CPU 위에서 줄 끝으로
      const arcFrom = { x: geo.cpu.x, y: CPU_TOP };
      const arcTo = { x: last.x, y: LANE_Y - TOKEN_H / 2 - 12 };
      el(
        'path',
        {
          d: `M ${r1(arcFrom.x)} ${r1(arcFrom.y)} C ${r1(arcFrom.x)} ${ARC_Y} ${r1(arcTo.x)} ${ARC_Y} ${r1(arcTo.x)} ${r1(arcTo.y - 6)}`,
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 4',
        },
        root,
      );
      arrowHead(arcTo, 'down', colors.textMuted, root);
      const apex = bezier(arcFrom, { x: arcFrom.x, y: ARC_Y }, { x: arcTo.x, y: ARC_Y }, arcTo, 0.5);
      label(t('label.back', 'Back of the line'), apex.x, apex.y - 8, { size: small, fill: colors.textMuted, anchor: 'middle' }, root);

      // 아래 줄 — 끝난 것 · 아직 안 온 것
      label(t('label.done', 'Done'), MARGIN, BOTTOM_HEAD_Y, { size: small, fill: colors.textMuted, weight: 700 }, root);
      const pendingIds = scene.procs.filter((p) => p.where === 'pending');
      if (pendingIds.length > 0) {
        label(t('label.pending', 'Not yet arrived'), W - MARGIN, BOTTOM_HEAD_Y, {
          size: small,
          fill: colors.textMuted,
          weight: 700,
          anchor: 'end',
        }, root);
      }

      const tokenLayer = el('g', {}, root);
      scene.procs.forEach((p, i) => {
        const color = palette[i] as string;
        const at = placeOf(scene, geo, p.id);
        tokens.set(p.id, drawToken(p, color, geo, at, tokenLayer));
        if (p.where === 'done' && p.doneAt !== null) {
          doneSubs.set(
            p.id,
            label(t('label.doneAt', 'tick {tick}', { tick: p.doneAt }), at.x, BOTTOM_SUB_Y, {
              size: small,
              fill: colors.textMuted,
              anchor: 'middle',
            }, root),
          );
        }
        if (p.where === 'pending') {
          label(t('label.arrives', 'Arrives: tick {tick}', { tick: p.arrive }), at.x, BOTTOM_SUB_Y, {
            size: small,
            fill: colors.textMuted,
            anchor: 'middle',
          }, root);
        }
      });

      const lines = captionLines(scene);
      const pitch = Math.min(18, (H - 8 - CAPTION_TOP) / Math.max(1, lines.length - 1));
      lines.forEach((line, k) => {
        label(line, MARGIN, CAPTION_TOP + k * pitch, { size: body + 1, fill: colors.text }, root);
      });
    }

    function cancelAll(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    }

    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<boolean> {
      return new Promise((resolve) => {
        const start = Date.now();
        let settled = false;
        const finish = (ok: boolean): void => {
          if (settled) return;
          settled = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const frame = (): void => {
          if (destroyed || mine !== gen) return finish(false);
          const p = Math.min(1, (Date.now() - start) / ms);
          draw(p);
          if (p >= 1) return finish(true);
          const id = setTimeout(() => {
            timers.delete(id);
            frame();
          }, 16);
          timers.add(id);
        };
        frame();
      });
    }

    async function play(next: TimeSliceRotateScene, mine: number): Promise<void> {
      const step = next.step;
      if (step === null) return;
      const geo = geometry(next.procs.length, Math.max(...next.procs.map((p) => p.len)));
      const handle = (id: string): TokenHandle => {
        const h = tokens.get(id);
        if (h === undefined) throw new Error(`time-slice-rotate stage: ${id} 의 패가 없다`);
        return h;
      };

      // 출발 자리 — 이 경계 앞의 자리 (step.was)
      const start = new Map<string, Pt>();
      if (step.was.cpu !== null) start.set(step.was.cpu, geo.cpu);
      step.was.queue.forEach((id, i) => start.set(id, geo.slot(i)));
      step.was.pending.forEach((id, j) => start.set(id, geo.pendingAt(j)));
      step.was.done.forEach((id, i) => start.set(id, geo.doneAt(i)));
      for (const [id, p] of start) moveTo(handle(id), p);
      for (const [id, sub] of doneSubs) if (!step.was.done.includes(id)) sub.setAttribute('visibility', 'hidden');

      // 오르기 앞의 줄 = 앞 줄 + 도착한 것 + 돌아간 것
      const prePick = [...step.was.queue, ...step.arrived, ...(step.back === null ? [] : [step.back.id])];

      // A. 틱을 쓴다
      if (step.ran !== null) {
        const ran = step.ran;
        const h = handle(ran.id);
        const used = ran.before - ran.after;
        fillCells(h, ran.before);
        if (clock) clock.textContent = t('label.tick', 'Tick {tick}', { tick: step.fromTick });
        const ok = await tween(MS_PER_TICK * Math.max(1, used), mine, (p) => {
          const k = p >= 1 ? used : Math.min(used, Math.floor(p * used + 0.5));
          fillCells(h, ran.before - k);
          meter.forEach((m, i) => m.setAttribute('fill', i < k ? colors.itemActive : 'none'));
          if (clock) clock.textContent = t('label.tick', 'Tick {tick}', { tick: step.fromTick + k });
        });
        if (!ok) return;
      }

      // B. 떠나고 · 고리에 오르고 · 걸어 든다
      const backId = step.back === null ? null : step.back.id;
      const tailPt = geo.slot(prePick.length - 1);
      const rideFrom = geo.cpu;
      const c1 = { x: geo.cpu.x, y: RIDE_Y };
      const c2 = { x: tailPt.x, y: RIDE_Y };
      if (step.finished !== null || backId !== null || step.arrived.length > 0) {
        const fin = step.finished;
        const ok = await tween(MS_LEAVE, mine, (p) => {
          const e = ease(p);
          if (fin !== null) moveTo(handle(fin), lerp(geo.cpu, geo.doneAt(step.was.done.length), e));
          if (backId !== null) moveTo(handle(backId), bezier(rideFrom, c1, c2, tailPt, e * 0.5));
          step.arrived.forEach((id) => {
            const from = start.get(id);
            if (from === undefined) throw new Error(`time-slice-rotate stage: ${id} 의 출발 자리가 없다`);
            moveTo(handle(id), lerp(from, geo.slot(prePick.indexOf(id)), e));
          });
          meter.forEach((m) => m.setAttribute('fill', 'none'));
        });
        if (!ok) return;
      }

      // C. 줄 끝에 내려앉는다
      if (backId !== null) {
        const ok = await tween(MS_LAND, mine, (p) => {
          moveTo(handle(backId), bezier(rideFrom, c1, c2, tailPt, 0.5 + ease(p) * 0.5));
        });
        if (!ok) return;
      }

      // D. 줄이 당겨지고 맨 앞이 오른다
      if (step.picked !== null) {
        const ok = await tween(MS_SHIFT, mine, (p) => {
          const e = ease(p);
          prePick.forEach((id, i) => moveTo(handle(id), lerp(geo.slot(i), placeOf(next, geo, id), e)));
        });
        if (!ok) return;
      }

      if (mine === gen && !destroyed) drawStatic(next);
    }

    return {
      render(next: TimeSliceRotateScene, _prev: TimeSliceRotateScene | null, opts: { animate: boolean }): void | Promise<void> {
        const mine = (gen += 1);
        cancelAll();
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || next.step === null) return;
        return play(next, mine);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        cancelAll();
        svg.textContent = '';
      },
    };
  },
};
