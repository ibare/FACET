/**
 * sawtooth stage — 창 하나가 펜처럼 시간 축을 따라 오르내리고, 왕복마다 값 하나를 남긴다.
 *
 * - 펜: 지금 왕복의 창을 조각 칸으로 쌓은 기둥. 용량 위의 칸은 위험색
 * - 자취: 지나간 왕복의 창이 점으로 남아 선으로 이어진다 — 톱니가 된다
 * - 잃은 왕복: 점 대신 위험색 × · 닫힌 톱니마다 그 구간에 평균 창의 가로선
 *
 * 운동 (한 시계, MOVE_MS): 펜이 앞 왕복 자리에서 이번 자리로 옮기며 높이가 앞 창에서
 * 이번 창으로 바뀐다 (떨어질 때는 위 칸이 접혀 사라진다). 자취 선이 펜 끝을 따라
 * 늘어나고, 톱니가 닫히는 걸음에는 평균선이 왼쪽에서 그어진다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';
import type { SawtoothScene } from './scene';

const H = 330;
const MOVE_MS = 250;
const FRAME_MS = 16;
const SVG_NS = 'http://www.w3.org/2000/svg';

const SM_PX = parseFloat(fontSizes.sm);
const MD_PX = parseFloat(fontSizes.md);
const XS_PX = parseFloat(fontSizes.xs);

/** 캔버스에서 역산하는 자리. 상수는 여백과 상한만 */
const PAD_LEFT = 40;
const PAD_RIGHT = 18;
const CAPTION_TOP = 22;
const PLOT_TOP = 78;
const PLOT_BOTTOM_GAP = 44;
const COLUMN_MAX_W = 30;

type Geo = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  slotW: number;
  cellH: number;
  colW: number;
  yMax: number;
};

function round2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function geometry(scene: SawtoothScene): Geo {
  const left = PAD_LEFT;
  const right = PIECE_CANVAS_W - PAD_RIGHT;
  const top = PLOT_TOP;
  const bottom = H - PLOT_BOTTOM_GAP;
  // 규약상 창은 용량보다 하나 넘는 데서 꺾인다 — 그 위로 한 칸 여유
  const yMax = scene.capacity + 2;
  const slotW = (right - left) / scene.rounds;
  return {
    left,
    right,
    top,
    bottom,
    slotW,
    cellH: (bottom - top) / yMax,
    colW: Math.min(slotW * 0.62, COLUMN_MAX_W),
    yMax,
  };
}

/** 왕복 r (1부터) 의 가로 가운데 */
function slotX(g: Geo, r: number): number {
  return round2(g.left + g.slotW * (r - 0.5));
}

function valueY(g: Geo, v: number): number {
  return round2(g.bottom - v * g.cellH);
}

function ease(e: number): number {
  return e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
}

export const sawtoothStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function node<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const n = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      parent.appendChild(n);
      return n;
    }

    function words(
      s: string,
      x: number,
      y: number,
      parent: Element,
      opts: { size: number; fill: string; anchor?: string; weight?: number },
    ): void {
      const n = node(
        'text',
        {
          x: round2(x),
          y: round2(y),
          'font-family': fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 400,
        },
        parent,
      );
      n.textContent = s;
    }

    function captions(scene: SawtoothScene): [string, string | null] {
      const s = scene.step;
      if (!s) {
        return [
          t('caption.start', 'Capacity per round trip: {cap} · starting window: {w}', {
            cap: scene.capacity,
            w: scene.startWindow,
          }),
          null,
        ];
      }
      if (s.kind === 'rise') {
        return [
          t('caption.rise', 'Round trip {r} · window: {w} · no loss · next window: {next}', {
            r: s.round,
            w: s.window,
            next: s.next,
          }),
          null,
        ];
      }
      const tooth = scene.teeth[scene.teeth.length - 1];
      const first = t(
        'caption.loss',
        'Round trip {r} · window: {w} > capacity: {cap} · loss · next window: {next}',
        { r: s.round, w: s.window, cap: scene.capacity, next: s.next },
      );
      if (!tooth) return [first, null];
      return [
        first,
        t('caption.tooth', 'Tooth, round trips {a}–{b} · mean window: {mean} · mean ÷ capacity: {ratio}', {
          a: tooth.from,
          b: tooth.to,
          mean: tooth.mean.toFixed(2),
          ratio: tooth.ratio.toFixed(2),
        }),
      ];
    }

    /**
     * 장면 전체를 세운다. `e` 는 이번 걸음의 운동이 온 만큼 (1 = 끝, 정본).
     */
    function draw(scene: SawtoothScene, e: number): void {
      svg.textContent = '';
      const g = geometry(scene);
      const step = scene.step;
      const moving = e < 1 && step !== null;

      // 캡션 — 지금 일어나는 일만
      const [line1, line2] = captions(scene);
      words(line1, PAD_LEFT, CAPTION_TOP, svg, { size: MD_PX, fill: colors.text, weight: 600 });
      if (line2) {
        words(line2, PAD_LEFT, CAPTION_TOP + MD_PX + 8, svg, { size: SM_PX, fill: colors.text });
      }

      // 격자와 축
      const axes = node('g', {}, svg);
      for (let v = 0; v <= g.yMax; v++) {
        const y = valueY(g, v);
        node(
          'line',
          { x1: g.left, x2: g.right, y1: y, y2: y, stroke: colors.border, 'stroke-width': v === 0 ? 1.5 : 0.5 },
          axes,
        );
        if (v % 2 === 0) {
          words(String(v), g.left - 8, y + XS_PX / 3, axes, {
            size: XS_PX,
            fill: colors.textMuted,
            anchor: 'end',
          });
        }
      }
      for (let r = 1; r <= scene.rounds; r++) {
        words(String(r), slotX(g, r), g.bottom + XS_PX + 6, axes, {
          size: XS_PX,
          fill: colors.textMuted,
          anchor: 'middle',
        });
      }
      words(t('label.axisRound', 'Round trip'), g.right, g.bottom + XS_PX * 2 + 14, axes, {
        size: XS_PX,
        fill: colors.textMuted,
        anchor: 'end',
      });
      words(t('label.axisWindow', 'Window (segments)'), g.left - 30, g.top - 10, axes, {
        size: XS_PX,
        fill: colors.textMuted,
      });

      // 용량 선
      const capY = valueY(g, scene.capacity);
      node(
        'line',
        {
          x1: g.left,
          x2: g.right,
          y1: capY,
          y2: capY,
          stroke: colors.danger,
          'stroke-width': 1.5,
          'stroke-dasharray': '6 4',
        },
        axes,
      );
      words(t('label.capacity', 'Capacity: {cap}', { cap: scene.capacity }), g.right, capY - 6, axes, {
        size: XS_PX,
        fill: colors.danger,
        anchor: 'end',
      });

      // 닫힌 톱니의 평균선 — 이번 걸음이 닫은 것은 운동만큼만 그어진다
      const teethLayer = node('g', {}, svg);
      scene.teeth.forEach((tooth, i) => {
        const fresh = moving && step?.kind === 'drop' && i === scene.teeth.length - 1;
        const x1 = round2(slotX(g, tooth.from) - g.slotW / 2);
        const full = round2(slotX(g, tooth.to) + g.slotW / 2);
        const x2 = fresh ? round2(x1 + (full - x1) * ease(e)) : full;
        const y = valueY(g, tooth.mean);
        node(
          'line',
          { x1, x2, y1: y, y2: y, stroke: colors.accent, 'stroke-width': 3, 'stroke-linecap': 'butt' },
          teethLayer,
        );
        if (!fresh) {
          words(t('label.mean', 'Mean: {mean}', { mean: tooth.mean.toFixed(2) }), slotX(g, tooth.from) + 6, y + XS_PX + 4, teethLayer, {
            size: XS_PX,
            fill: colors.text,
            weight: 600,
          });
        }
      });

      // 펜의 자리 — 운동 중이면 앞 자리에서 이번 자리로 가는 길 위
      const k = ease(e);
      let penX: number;
      let penH: number;
      let cells: number;
      if (!step) {
        penX = slotX(g, 1);
        penH = scene.startWindow;
        cells = scene.startWindow;
      } else {
        const was = step.was;
        if (moving && was !== null) {
          penX = round2(slotX(g, step.round - 1) + (slotX(g, step.round) - slotX(g, step.round - 1)) * k);
          penH = was + (step.window - was) * k;
          cells = Math.max(was, step.window);
        } else {
          penX = slotX(g, step.round);
          penH = step.window;
          cells = step.window;
        }
      }

      // 펜 기둥 — 조각 칸을 쌓는다
      const pen = node('g', {}, svg);
      const colX = round2(penX - g.colW / 2);
      for (let i = 1; i <= cells; i++) {
        const frac = Math.max(0, Math.min(1, penH - (i - 1)));
        if (frac <= 0) continue;
        const cellTop = valueY(g, i - 1 + frac);
        const hgt = round2(g.cellH * frac - 1.5);
        if (hgt <= 0) continue;
        node(
          'rect',
          {
            x: colX,
            y: cellTop,
            width: round2(g.colW),
            height: hgt,
            rx: 2,
            fill: i > scene.capacity ? colors.danger : colors.primary,
            'fill-opacity': 0.6,
          },
          pen,
        );
      }

      // 자취 — 남은 값들을 잇는다
      const trail = node('g', {}, svg);
      const settled = moving ? scene.marks.slice(0, -1) : scene.marks;
      if (settled.length > 1) {
        node(
          'polyline',
          {
            points: settled.map((m) => `${slotX(g, m.round)},${valueY(g, m.window)}`).join(' '),
            fill: 'none',
            stroke: colors.text,
            'stroke-width': 2,
            'stroke-linejoin': 'round',
          },
          trail,
        );
      }
      const lastSettled = settled[settled.length - 1];
      if (moving && lastSettled) {
        // 새 마디가 펜 끝을 따라 늘어난다
        node(
          'line',
          {
            x1: slotX(g, lastSettled.round),
            y1: valueY(g, lastSettled.window),
            x2: penX,
            y2: valueY(g, penH),
            stroke: colors.text,
            'stroke-width': 2,
          },
          trail,
        );
      }
      for (const m of settled) {
        const x = slotX(g, m.round);
        const y = valueY(g, m.window);
        if (m.loss) {
          const a = 5;
          const cross = `M${round2(x - a)},${round2(y - a)} L${round2(x + a)},${round2(y + a)} M${round2(x - a)},${round2(y + a)} L${round2(x + a)},${round2(y - a)}`;
          node('path', { d: cross, stroke: colors.danger, 'stroke-width': 2.5, fill: 'none' }, trail);
        } else {
          node('circle', { cx: x, cy: y, r: 4, fill: colors.text }, trail);
        }
      }
      // 첫 왕복은 펜이 제자리에 있어 값이 점으로 찍히는 것이 운동이다
      if (moving && step && step.was === null) {
        node(
          'circle',
          {
            cx: slotX(g, step.round),
            cy: valueY(g, step.window),
            r: round2(4 * k),
            fill: step.kind === 'drop' ? colors.danger : colors.text,
          },
          trail,
        );
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms);
        timers.add(id);
      });
    }

    return {
      async render(next: SawtoothScene, prev: SawtoothScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const stepped = next.step !== null && next.marks.length !== (prev?.marks.length ?? -1);
        if (!opts.animate || !stepped) {
          draw(next, 1);
          return;
        }
        const start = Date.now();
        draw(next, 0);
        let e = 0;
        while (e < 1) {
          await wait(FRAME_MS);
          if (mine !== gen || destroyed) return;
          e = Math.min(1, (Date.now() - start) / MOVE_MS);
          if (e < 1) draw(next, e);
        }
        draw(next, 1);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
