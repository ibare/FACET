/**
 * clt-bell 무대 — 평균 400 개를 점 400 개로 칸에 쌓는다.
 *
 * 동사는 "몰린다 · 좁혀진다". 걸음마다 무리가 통째로 새로 나오므로, 앞 무리와 새 무리를
 * 값의 차례(칸 차례 → 칸 안의 층 차례)로 짝지어 점 하나하나가 앞 무리의 자리에서 새 무리의
 * 자리로 옮겨 간다. 가장자리의 점들이 가운데 칸으로 모여 쌓이고, 아래의 평균 ± 표준편차
 * 막대가 함께 좁아진다. 첫 무리(n = 1)는 바닥에서 솟는다.
 */
import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { binCenter } from './algorithm.js';
import type { CltBellScene, Crowd } from './scene.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 600;
const TICK_MS = 16;
/** 좌우 여백 */
const PAD_X = 30;
const Y_CAPTION = 24;
const Y_STATS = 46;
const PLOT_TOP = 74;
const BASELINE = 312;
const Y_TICK = 330;
const Y_SPREAD = 352;
const Y_SPREAD_LABEL = 372;
const Y_AXIS = 392;
/** 걸음 0 의 눈 막대 높이 */
const FACE_BAR_H = 64;
/** 칸 안 점 무리 좌우 틈 */
const BIN_GAP = 6;

type Pt = { x: number; y: number };

type Layout = {
  x(v: number): number;
  binPitch: number;
  cols: number;
  pitch: number;
};

function round2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function layoutFor(scene: CltBellScene): Layout {
  const lo = binCenter(0) - 0.25;
  const hi = binCenter(scene.binCount - 1) + 0.25;
  const plotW = PIECE_CANVAS_W - 2 * PAD_X;
  const x = (v: number): number => PAD_X + ((v - lo) / (hi - lo)) * plotW;
  const binPitch = plotW / scene.binCount;
  let cols = 1;
  let pitch = 0;
  if (scene.peakMax !== null) {
    const availH = BASELINE - PLOT_TOP - 18;
    for (let c = 1; c <= 16; c++) {
      const p = Math.min((binPitch - BIN_GAP) / c, availH / Math.ceil(scene.peakMax / c));
      if (p > pitch) {
        pitch = p;
        cols = c;
      }
    }
  }
  return { x, binPitch, cols, pitch };
}

/** 칸 개수에서 점 자리 — 칸 차례, 칸 안에서는 아래층부터. 이 차례가 짝짓기의 차례다. */
function dotPositions(counts: number[], L: Layout): Pt[] {
  const out: Pt[] = [];
  counts.forEach((c, j) => {
    const left = L.x(binCenter(j)) - (L.cols * L.pitch) / 2;
    for (let r = 0; r < c; r++) {
      out.push({
        x: round2(left + ((r % L.cols) + 0.5) * L.pitch),
        y: round2(BASELINE - (Math.floor(r / L.cols) + 0.5) * L.pitch),
      });
    }
  });
  return out;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export const cltBellStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 정적 그리기가 새로 짓는 손잡이 — 운동이 만진다 */
    let dotEls: SVGCircleElement[] = [];
    let spreadEls: { line: SVGLineElement; capL: SVGLineElement; capR: SVGLineElement; mid: SVGCircleElement } | null = null;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      text: string,
      x: number,
      y: number,
      opts: { size: string; fill: string; anchor?: string; weight?: number },
      parent: Element,
    ): SVGTextElement {
      const node = el(
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
      node.textContent = text;
      return node;
    }

    function drawSpread(c: Crowd, L: Layout, root: Element): void {
      const a = round2(L.x(c.mean - c.sd));
      const b = round2(L.x(c.mean + c.sd));
      const m = round2(L.x(c.mean));
      const stroke = colors.itemActive;
      spreadEls = {
        line: el('line', { x1: a, y1: Y_SPREAD, x2: b, y2: Y_SPREAD, stroke, 'stroke-width': 2 }, root),
        capL: el('line', { x1: a, y1: Y_SPREAD - 6, x2: a, y2: Y_SPREAD + 6, stroke, 'stroke-width': 2 }, root),
        capR: el('line', { x1: b, y1: Y_SPREAD - 6, x2: b, y2: Y_SPREAD + 6, stroke, 'stroke-width': 2 }, root),
        mid: el('circle', { cx: m, cy: Y_SPREAD, r: 3.5, fill: stroke }, root),
      };
      label(t('label.spread', 'mean ± SD'), m, Y_SPREAD_LABEL, { size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle' }, root);
    }

    function setSpread(mean: number, sd: number, L: Layout): void {
      if (spreadEls === null) throw new Error('clt-bell stage: 평균 ± 표준편차 막대가 없다');
      const a = String(round2(L.x(mean - sd)));
      const b = String(round2(L.x(mean + sd)));
      spreadEls.line.setAttribute('x1', a);
      spreadEls.line.setAttribute('x2', b);
      spreadEls.capL.setAttribute('x1', a);
      spreadEls.capL.setAttribute('x2', a);
      spreadEls.capR.setAttribute('x1', b);
      spreadEls.capR.setAttribute('x2', b);
      spreadEls.mid.setAttribute('cx', String(round2(L.x(mean))));
    }

    function drawStatic(scene: CltBellScene): void {
      svg.textContent = '';
      dotEls = [];
      spreadEls = null;
      const L = layoutFor(scene);
      const root = el('g', {}, svg);
      const crowd = scene.crowd;

      // n 수열 — 지금 n 에 동그라미
      const chipW = 30;
      const rowRight = PIECE_CANVAS_W - PAD_X;
      scene.ns.forEach((n, i) => {
        const cx = rowRight - (scene.ns.length - 1 - i) * chipW - chipW / 2;
        const on = crowd !== null && crowd.n === n;
        if (on) el('circle', { cx: round2(cx), cy: Y_CAPTION - 5, r: 12, fill: colors.accent }, root);
        label(String(n), cx, Y_CAPTION, {
          size: fontSizes.md,
          fill: on ? colors.stateInk : colors.textMuted,
          anchor: 'middle',
          weight: on ? 700 : 400,
        }, root);
      });
      const rowLeft = rowRight - scene.ns.length * chipW;
      label(t('label.n', 'n'), rowLeft - 6, Y_CAPTION, { size: fontSizes.md, fill: colors.textMuted, anchor: 'end' }, root);

      // 가운데 값 (눈의 가운데) 표지 — 눈금 글자 뒤에 강조 띠
      const mid = (1 + scene.faces) / 2;
      const midX = round2(L.x(mid));
      el('rect', {
        x: round2(midX - 15), y: Y_TICK - 12, width: 30, height: 16, rx: 8,
        fill: colors.accent,
      }, root);

      // 가로축과 칸 가운데 눈금
      el('line', { x1: PAD_X, y1: BASELINE, x2: PIECE_CANVAS_W - PAD_X, y2: BASELINE, stroke: colors.border, 'stroke-width': 1 }, root);
      for (let j = 0; j < scene.binCount; j++) {
        const v = binCenter(j);
        const whole = Number.isInteger(v);
        const x = L.x(v);
        el('line', { x1: round2(x), y1: BASELINE, x2: round2(x), y2: BASELINE + 4, stroke: colors.border, 'stroke-width': 1 }, root);
        label(v.toFixed(1), x, Y_TICK, {
          size: fontSizes.xs,
          fill: v === mid ? colors.stateInk : whole ? colors.text : colors.textMuted,
          anchor: 'middle',
          weight: v === mid ? 700 : 400,
        }, root);
      }

      if (crowd === null) {
        // 걸음 0 — 주사위 하나의 눈, 눈마다 같은 높이
        label(t('caption.source', 'One die: faces 1 … {faces}, each with chance 1 / {faces}', { faces: scene.faces }),
          PAD_X - 14, Y_CAPTION, { size: fontSizes.md, fill: colors.text, weight: 600 }, root);
        label(t('caption.noMeans', 'No means yet.'), PAD_X - 14, Y_STATS, { size: fontSizes.sm, fill: colors.textMuted }, root);
        const barW = L.binPitch * 0.7;
        for (let f = 1; f <= scene.faces; f++) {
          const x = L.x(f);
          el('rect', {
            x: round2(x - barW / 2), y: BASELINE - FACE_BAR_H, width: round2(barW), height: FACE_BAR_H,
            fill: colors.bgSubtle, stroke: colors.primary, 'stroke-width': 1.5,
          }, root);
        }
        label(t('label.axisFace', 'Face of one die'), PIECE_CANVAS_W / 2, Y_AXIS, { size: fontSizes.sm, fill: colors.textMuted, anchor: 'middle' }, root);
        return;
      }

      if (scene.peakMax === null) throw new Error('clt-bell stage: 무리가 있는데 peakMax 가 없다');

      label(t('caption.crowd', 'Dice per mean: {n} · Means: {count}', { n: crowd.n, count: scene.perN }),
        PAD_X - 14, Y_CAPTION, { size: fontSizes.md, fill: colors.text, weight: 600 }, root);
      const peakCount = crowd.counts[crowd.peak];
      if (peakCount === undefined) throw new Error(`clt-bell stage: 가장 높은 칸 ${crowd.peak} 이 없다`);
      label(t('label.stats', 'Mean of means: {mean} · SD of means: {sd} · Tallest bin: {bin} ({c})', {
        mean: crowd.mean.toFixed(2),
        sd: crowd.sd.toFixed(2),
        bin: binCenter(crowd.peak).toFixed(1),
        c: peakCount,
      }), PAD_X - 14, Y_STATS, { size: fontSizes.sm, fill: colors.textMuted }, root);

      // 칸마다 개수
      crowd.counts.forEach((c, j) => {
        const rows = Math.ceil(c / L.cols);
        const top = BASELINE - rows * L.pitch;
        label(String(c), L.x(binCenter(j)), round2(top - 5), {
          size: fontSizes.xs,
          fill: j === crowd.peak ? colors.text : colors.textMuted,
          anchor: 'middle',
          weight: j === crowd.peak ? 700 : 400,
        }, root);
      });

      // 점 400 개
      const dots = el('g', {}, root);
      const r = round2(L.pitch * 0.4);
      for (const p of dotPositions(crowd.counts, L)) {
        dotEls.push(el('circle', { cx: p.x, cy: p.y, r, fill: colors.primary }, dots));
      }

      drawSpread(crowd, L, root);
      label(t('label.axis', 'Mean of the dice'), PIECE_CANVAS_W / 2, Y_AXIS, { size: fontSizes.sm, fill: colors.textMuted, anchor: 'middle' }, root);
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    /** 앞 무리의 자리에서 새 무리의 자리로 — 값의 차례로 짝지은 점이 옮겨 간다 */
    async function gather(scene: CltBellScene, from: Crowd | null, mine: number): Promise<void> {
      const crowd = scene.crowd;
      if (crowd === null) throw new Error('clt-bell stage: 몰릴 무리가 없다');
      const L = layoutFor(scene);
      const end = dotPositions(crowd.counts, L);
      if (end.length !== dotEls.length) throw new Error('clt-bell stage: 점 수가 무리와 다르다');
      const start: Pt[] = from === null
        ? end.map((p) => ({ x: p.x, y: BASELINE }))
        : dotPositions(from.counts, L);
      if (start.length !== end.length) throw new Error('clt-bell stage: 앞 무리와 점 수가 다르다');
      const m0 = from === null ? crowd.mean : from.mean;
      const s0 = from === null ? 0 : from.sd;

      const apply = (p: number): void => {
        const k = ease(p);
        dotEls.forEach((node, i) => {
          const a = start[i];
          const b = end[i];
          if (a === undefined || b === undefined) throw new Error(`clt-bell stage: 점 ${i} 의 자리가 없다`);
          node.setAttribute('cx', String(round2(a.x + (b.x - a.x) * k)));
          node.setAttribute('cy', String(round2(a.y + (b.y - a.y) * k)));
        });
        setSpread(m0 + (crowd.mean - m0) * k, s0 + (crowd.sd - s0) * k, L);
      };

      apply(0);
      const t0 = Date.now();
      for (;;) {
        await wait(TICK_MS);
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (Date.now() - t0) / MOVE_MS);
        apply(p);
        if (p >= 1) return;
      }
    }

    return {
      async render(next: CltBellScene, prev: CltBellScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || prev === null || next.step.kind !== 'crowd') return;
        await gather(next, next.step.from, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
