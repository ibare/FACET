import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { RescaleBatchState, RescaleEachBatchScene } from './scene';

const H = 330;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 한 걸음의 운동 — 걸음 벽시계는 이것 + stepMs */
const MOVE_MS = 600;
const FRAME_MS = 16;

const CAPTION_Y = 22;
const ROWS_TOP = 58;
const AXIS_GAP = 40;
const ROW_H_MAX = 80;
const LABEL_W = 48;
const READOUT_W = 122;
const PLOT_PAD = 12;
const DOT_R_MAX = 6;

type Handles = {
  dots: SVGCircleElement[];
  band: SVGRectElement;
  tick: SVGLineElement;
};

/** 소수 둘째 자리 표시. 0 근처의 아주 작은 음수가 `-0.00` 으로 뜨지 않게 한다 */
function fmt(v: number): string {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
}

export const rescaleEachBatchStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

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

    function label(x: number, y: number, s: string, attrs: Record<string, string | number>): SVGTextElement {
      const node = el('text', { x: round(x), y: round(y), ...attrs });
      node.textContent = s;
      return node;
    }

    function geometry(scene: RescaleEachBatchScene) {
      const range = scene.range;
      if (range === null) throw new Error('rescale-each-batch-stage: 축 범위가 서지 않았다');
      const x0 = LABEL_W + PLOT_PAD;
      const x1 = W - READOUT_W - PLOT_PAD;
      const axisY = H - AXIS_GAP;
      const rowH = Math.min(ROW_H_MAX, (axisY - ROWS_TOP) / scene.batches.length);
      const sx = (v: number): number => round(x0 + ((v - range.min) / (range.max - range.min)) * (x1 - x0));
      return { range, x0, x1, axisY, rowH, sx };
    }

    function drawStatic(scene: RescaleEachBatchScene): Map<string, Handles> {
      svg.textContent = '';
      const handles = new Map<string, Handles>();
      if (scene.range === null) return handles;
      const { range, x0, x1, axisY, rowH, sx } = geometry(scene);
      const hues = categorical(scene.batches.length);
      const step = scene.step;
      const active = step.kind === 'start' ? null : step.batch;
      const dotR = Math.min(DOT_R_MAX, rowH / 10);

      // 캡션 — 지금 일어나는 일만. 둘째 줄은 이 걸음이 바꾼 폭
      let caption: string;
      if (step.kind === 'start') {
        caption = t('caption.start', 'As given: each batch with its own mean and width.');
      } else if (step.kind === 'center') {
        caption = t('caption.center', 'Batch {batch}: subtract its own mean, μ = {mu}', {
          batch: step.batch,
          mu: fmt(step.mu),
        });
      } else {
        caption = t('caption.scale', 'Batch {batch}: divide by its own width, √(σ² + ε) = {div}', {
          batch: step.batch,
          div: fmt(step.divisor),
        });
      }
      label(W / 2, CAPTION_Y, caption, {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      if (step.kind !== 'start') {
        label(
          W / 2,
          CAPTION_Y + smPx + 8,
          t('caption.width', 'Width σ: {from} → {to}', { from: fmt(step.stdBefore), to: fmt(step.stdAfter) }),
          { 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted },
        );
      }

      // 이번 걸음의 묶음 줄 — 머무는 강조
      scene.batches.forEach((b, i) => {
        if (b.id !== active) return;
        el('rect', {
          x: 8,
          y: round(ROWS_TOP + i * rowH + 2),
          width: W - 16,
          height: round(rowH - 4),
          rx: 6,
          fill: colors.bgSubtle,
          stroke: colors.border,
        });
      });

      // 0 의 자리 — 모두가 모일 곳
      const zx = sx(0);
      if (0 >= range.min && 0 <= range.max) {
        el('line', {
          x1: zx,
          y1: ROWS_TOP,
          x2: zx,
          y2: axisY,
          stroke: colors.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '3 4',
        });
      }

      // 축과 눈금
      el('line', { x1: x0, y1: axisY, x2: x1, y2: axisY, stroke: colors.border, 'stroke-width': 1 });
      const span = range.max - range.min;
      const tickStep = span > 8 ? 2 : 1;
      for (let v = Math.ceil(range.min / tickStep) * tickStep; v <= range.max; v += tickStep) {
        const x = sx(v);
        el('line', { x1: x, y1: axisY, x2: x, y2: axisY + 5, stroke: colors.border, 'stroke-width': 1 });
        label(x, axisY + 5 + smPx + 2, String(v === 0 ? 0 : v), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: v === 0 ? colors.text : colors.textMuted,
        });
      }

      scene.batches.forEach((b, i) => {
        handles.set(b.id, drawRow(b, i, hues[i]!, b.id === active));
      });

      function drawRow(b: RescaleBatchState, i: number, hue: string, isActive: boolean): Handles {
        if (b.mean === null || b.std === null) throw new Error(`rescale-each-batch-stage: 묶음 ${b.id} 의 통계가 없다`);
        const top = ROWS_TOP + i * rowH;
        const cy = round(top + rowH * 0.42);
        const bandH = round(Math.min(24, rowH * 0.34));

        label(20, cy + smPx / 2 - 1, b.id, {
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': isActive ? 700 : 400,
          fill: colors.text,
        });
        el('line', { x1: x0, y1: cy, x2: x1, y2: cy, stroke: colors.border, 'stroke-width': 1 });

        // 폭 — μ ± σ 의 띠
        const band = el('rect', {
          x: sx(b.mean - b.std),
          y: round(cy - bandH / 2),
          width: round(sx(b.mean + b.std) - sx(b.mean - b.std)),
          height: bandH,
          rx: 4,
          fill: hue,
          'fill-opacity': 0.18,
          stroke: hue,
          'stroke-width': 1.5,
        });
        // 자리 — μ 의 눈금
        const tick = el('line', {
          x1: sx(b.mean),
          y1: round(cy - bandH / 2 - 5),
          x2: sx(b.mean),
          y2: round(cy + bandH / 2 + 5),
          stroke: hue,
          'stroke-width': 2.5,
        });
        const dots = b.values.map((v) =>
          el('circle', { cx: sx(v), cy, r: round(dotR), fill: hue, stroke: colors.bg, 'stroke-width': 1.5 }),
        );

        // 지금 값 — 묶음 안 차례 그대로
        label(x0, round(cy + bandH / 2 + 8 + smPx), b.values.map(fmt).join('  '), {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });

        const rx = W - READOUT_W + 4;
        label(rx, round(cy - 4), t('label.mean', 'Mean: {v}', { v: fmt(b.mean) }), {
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.text,
        });
        label(rx, round(cy - 4 + smPx + 6), t('label.width', 'Width: {v}', { v: fmt(b.std) }), {
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.text,
        });
        return { dots, band, tick };
      }

      return handles;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          timers.delete(id);
          resolve();
        };
        const id = setTimeout(wake, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function move(scene: RescaleEachBatchScene, handles: Map<string, Handles>, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind === 'start') return;
      const h = handles.get(step.batch);
      if (!h) throw new Error(`rescale-each-batch-stage: 묶음 ${step.batch} 의 손잡이가 없다`);
      const b = scene.batches.find((x) => x.id === step.batch);
      if (!b || b.mean === null || b.std === null) {
        throw new Error(`rescale-each-batch-stage: 묶음 ${step.batch} 이 장면에 없다`);
      }
      if (step.from.length !== h.dots.length) throw new Error('rescale-each-batch-stage: 옮길 값의 수가 다르다');
      const { sx } = geometry(scene);
      const toMean = b.mean;
      const toStd = b.std;
      const toValues = b.values;

      const frame = (u: number): void => {
        const k = ease(u);
        const lerp = (a: number, c: number): number => a + (c - a) * k;
        h.dots.forEach((dot, j) => dot.setAttribute('cx', String(sx(lerp(step.from[j]!, toValues[j]!)))));
        const m = lerp(step.meanBefore, toMean);
        const s = lerp(step.stdBefore, toStd);
        h.band.setAttribute('x', String(sx(m - s)));
        h.band.setAttribute('width', String(round(sx(m + s) - sx(m - s))));
        h.tick.setAttribute('x1', String(sx(m)));
        h.tick.setAttribute('x2', String(sx(m)));
      };

      frame(0);
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const u = Math.min(1, (Date.now() - start) / MOVE_MS);
        frame(u);
        if (u >= 1) return;
        await wait(FRAME_MS);
      }
    }

    return {
      async render(next: RescaleEachBatchScene, _prev: RescaleEachBatchScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        if (!opts.animate || next.range === null || next.step.kind === 'start') return;
        await move(next, handles, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy() {
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
