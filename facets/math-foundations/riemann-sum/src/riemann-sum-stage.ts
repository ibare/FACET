/**
 * riemann-sum 무대 — 왼쪽은 곡선 아래 넓이를 덮은 조각들, 오른쪽은 잰 합의 수열.
 *
 * 동사 "쪼개진다": 걸음마다 조각이 둘로 갈라지고, 오른쪽 자식이 부모 높이에서 제 높이로
 * 내려앉으며 곡선 위로 삐져나간 몫(강조색)이 깎인다. 같은 시계로 오른쪽의 합 점이
 * 다음 칸으로 내려오고, 점과 π 선 사이의 강조색 막대(넘친 몫)가 짧아진다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { showNumber, showRaw } from './algorithm.js';
import type { RiemannBase, RiemannSumScene } from './scene.js';

const H = 360;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOTION_MS = 550;
const FRAME_MS = 16;

/** 좌표 글자가 부동소수 끝자리로 갈리지 않게 */
function r(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function ease(e: number): number {
  return e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2;
}

type Layout = {
  px0: number;
  plotTop: number;
  plotBottom: number;
  plotSize: number;
  cx0: number;
  cxEnd: number;
  chartTop: number;
  chartBottom: number;
  colX(i: number): number;
  xs(x: number): number;
  ys(y: number): number;
  cy(v: number): number;
};

function layoutFor(base: RiemannBase): Layout {
  const W = PIECE_CANVAS_W;
  const px0 = 44;
  const plotTop = 56;
  const plotSize = Math.min(H - plotTop - 40, Math.floor(W * 0.44));
  const plotBottom = plotTop + plotSize;
  const cx0 = px0 + plotSize + 56;
  const cxEnd = W - 64;
  const chartTop = 164;
  const chartBottom = plotBottom;
  const span = base.to - base.from;
  const spread = base.sumHi - base.sumLo;
  const lo = base.sumLo - spread * 0.18;
  const hi = base.sumHi + spread * 0.1;
  const cols = base.counts.length;
  const colL = cx0 + 12;
  const colR = cxEnd - 24;
  return {
    px0,
    plotTop,
    plotBottom,
    plotSize,
    cx0,
    cxEnd,
    chartTop,
    chartBottom,
    colX: (i) => (cols === 1 ? colL : colL + ((colR - colL) * i) / (cols - 1)),
    xs: (x) => px0 + ((x - base.from) / span) * plotSize,
    ys: (y) => plotBottom - (y / base.yMax) * plotSize,
    cy: (v) => chartBottom - ((v - lo) / (hi - lo)) * (chartBottom - chartTop),
  };
}

export const riemannSumStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      text: string,
      x: number,
      y: number,
      parent: Element,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ): void {
      const node = el(
        'text',
        {
          x: r(x),
          y: r(y),
          fill: opts.fill ?? colors.text,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = text;
    }

    /** 진행 e(0..1) 의 화면 전체. e = 1 이 정적 그리기(정본)다. */
    function draw(scene: RiemannSumScene, e: number): void {
      svg.textContent = '';
      const base = scene.base;
      if (base === null) return;
      const L = layoutFor(base);
      const step = scene.step;
      const moving = e < 1;

      // 캡션 — 지금 일어나는 일
      const caption = (() => {
        switch (step.kind) {
          case 'start':
            return t('caption.start', 'Area under the curve');
          case 'cover': {
            if (scene.pieces === null) throw new Error('riemann-sum stage: cover 장면에 조각이 없다');
            return t('caption.cover', 'Flat pieces cover the area. Pieces: {n}', { n: scene.pieces.n });
          }
          case 'split': {
            if (scene.pieces === null) throw new Error('riemann-sum stage: split 장면에 조각이 없다');
            return t('caption.split', 'Every piece splits in two. Pieces: {n}', { n: scene.pieces.n });
          }
          case 'limit':
            return t('caption.limit', 'Value the sums approach: π = {pi}', { pi: showNumber(base.truth, 3) });
        }
      })();
      label(caption, 20, 28, svg, { size: fontSizes.md });

      // ── 왼쪽: 곡선 아래 넓이와 조각
      const plot = el('g', {}, svg);
      const pieces = scene.pieces;
      const rects: { x: number; w: number; h: number }[] = [];
      if (pieces !== null) {
        const growing = step.kind === 'cover' ? 0 : null;
        const was = step.kind === 'split' ? step.was : null;
        const k = ease(e);
        pieces.heights.forEach((h, i) => {
          let hNow = h;
          if (moving && growing !== null) hNow = h * k;
          if (moving && was !== null) {
            const w0 = was[i];
            if (w0 === undefined) throw new Error(`riemann-sum stage: step.was[${i}] 가 없다`);
            hNow = w0 + (h - w0) * k;
          }
          rects.push({ x: base.from + i * pieces.width, w: pieces.width, h: hNow });
        });
      }
      // 조각 채움(강조색) — 곡선 아래 넓이가 위를 덮어, 곡선 위로 삐져나간 몫만 강조색으로 남는다
      for (const q of rects) {
        const x0 = L.xs(q.x);
        const x1 = L.xs(q.x + q.w);
        const y0 = L.ys(q.h);
        el('rect', { x: r(x0), y: r(y0), width: r(x1 - x0), height: r(L.plotBottom - y0), fill: colors.accent }, plot);
      }
      const pts = base.samples.map(([x, y]) => `${r(L.xs(x))},${r(L.ys(y))}`);
      el(
        'polygon',
        {
          points: [`${r(L.xs(base.from))},${r(L.plotBottom)}`, ...pts, `${r(L.xs(base.to))},${r(L.plotBottom)}`].join(' '),
          fill: colors.border,
        },
        plot,
      );
      for (const q of rects) {
        const x0 = L.xs(q.x);
        const x1 = L.xs(q.x + q.w);
        const y0 = L.ys(q.h);
        el(
          'rect',
          {
            x: r(x0),
            y: r(y0),
            width: r(x1 - x0),
            height: r(L.plotBottom - y0),
            fill: 'none',
            stroke: colors.text,
            'stroke-width': 1,
          },
          plot,
        );
      }
      el('polyline', { points: pts.join(' '), fill: 'none', stroke: colors.text, 'stroke-width': 2.5 }, plot);
      // 축
      el('line', { x1: r(L.px0), y1: r(L.plotBottom), x2: r(L.xs(base.to) + 8), y2: r(L.plotBottom), stroke: colors.textMuted, 'stroke-width': 1 }, plot);
      el('line', { x1: r(L.px0), y1: r(L.plotBottom), x2: r(L.px0), y2: r(L.plotTop - 8), stroke: colors.textMuted, 'stroke-width': 1 }, plot);
      for (let v = Math.ceil(base.from); v <= Math.floor(base.to); v += 1) {
        label(String(v), L.xs(v), L.plotBottom + 18, plot, { anchor: 'middle', fill: colors.textMuted, mono: true });
      }
      for (let v = 1; v <= Math.floor(base.yMax); v += 1) {
        label(String(v), L.px0 - 8, L.ys(v) + 4, plot, { anchor: 'end', fill: colors.textMuted, mono: true });
      }
      label('x', L.xs(base.to) + 14, L.plotBottom + 4, plot, { fill: colors.textMuted, mono: true });
      label('y', L.px0, L.plotTop - 14, plot, { anchor: 'middle', fill: colors.textMuted, mono: true });

      // ── 오른쪽: 읽는 값
      const side = el('g', {}, svg);
      if (pieces !== null) {
        const showNew = !moving || step.kind === 'limit';
        label(t('label.n', 'n = {n}', { n: pieces.n }), L.cx0, 70, side, { mono: true });
        label(t('label.width', 'Width {w}', { w: showRaw(pieces.width) }), L.cx0 + 96, 70, side, { fill: colors.textMuted });
        let sumText: string | null = null;
        let overText: string | null = null;
        if (showNew) {
          sumText = showNumber(pieces.sum, 3);
          overText = showNumber(pieces.over, 3);
        } else if (step.kind === 'split') {
          sumText = showNumber(step.fromSum, 3);
          overText = showNumber(step.fromOver, 3);
        }
        if (sumText !== null && overText !== null) {
          label(t('label.sum', 'Sum {sum}', { sum: sumText }), L.cx0, 102, side, { size: fontSizes.lg, weight: '600' });
          el('rect', { x: r(L.cx0), y: 118, width: 10, height: 10, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 }, side);
          label(t('label.over', 'Overshoot {over}', { over: overText }), L.cx0 + 16, 127, side);
        }
      }

      // ── 오른쪽: 합의 수열
      const chart = el('g', {}, svg);
      const yTruth = L.cy(base.truth);
      el(
        'line',
        {
          x1: r(L.cx0),
          y1: r(yTruth),
          x2: r(L.cxEnd),
          y2: r(yTruth),
          stroke: scene.reachedLimit && !moving ? colors.text : colors.textMuted,
          'stroke-width': scene.reachedLimit && !moving ? 2 : 1,
          'stroke-dasharray': scene.reachedLimit && !moving ? 'none' : '4 3',
        },
        chart,
      );
      label('π', L.cxEnd + 8, yTruth + 4, chart, { mono: true, size: fontSizes.md });
      label(t('label.truth', 'True area π'), L.cxEnd, yTruth + 14, chart, { anchor: 'end', fill: colors.textMuted, size: fontSizes.xs });
      el('line', { x1: r(L.cx0), y1: r(L.chartBottom), x2: r(L.cxEnd), y2: r(L.chartBottom), stroke: colors.textMuted, 'stroke-width': 1 }, chart);
      base.counts.forEach((n, i) => {
        label(String(n), L.colX(i), L.chartBottom + 18, chart, { anchor: 'middle', fill: colors.textMuted, mono: true });
      });
      label('n', L.cx0 - 8, L.chartBottom + 18, chart, { anchor: 'end', fill: colors.textMuted, mono: true });

      const k = ease(e);
      const trail = scene.sums.map((s, i) => ({ x: L.colX(i), y: L.cy(s.sum) }));
      const last = trail.length - 1;
      if (last >= 0 && moving && step.kind === 'split') {
        const from = { x: L.colX(step.fromIndex), y: L.cy(step.fromSum) };
        const to = trail[last]!;
        trail[last] = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      }
      if (trail.length > 1) {
        el('polyline', { points: trail.map((p) => `${r(p.x)},${r(p.y)}`).join(' '), fill: 'none', stroke: colors.textMuted, 'stroke-width': 1.5 }, chart);
      }
      const showHead = last >= 0 && !(moving && step.kind === 'cover');
      if (showHead) {
        const head = trail[last]!;
        // 넘친 몫 — 지금 점과 π 선 사이
        el('line', { x1: r(head.x), y1: r(head.y), x2: r(head.x), y2: r(yTruth), stroke: colors.accent, 'stroke-width': 5 }, chart);
      }
      trail.forEach((p, i) => {
        if (i === last && !showHead) return;
        el(
          'circle',
          { cx: r(p.x), cy: r(p.y), r: i === last ? 5 : 3.5, fill: i === last ? colors.text : colors.bg, stroke: colors.text, 'stroke-width': 1.5 },
          chart,
        );
      });
      if (moving && step.kind === 'cover' && last >= 0) {
        // 첫 합 점이 π 선에서 제 자리로 솟는다 — 조각이 솟는 것과 한 시계
        const to = trail[last]!;
        el('circle', { cx: r(to.x), cy: r(yTruth + (to.y - yTruth) * k), r: 5, fill: colors.text }, chart);
      }
      if (scene.reachedLimit && last >= 0) {
        // 마지막 합에서 π 선의 끝으로 미끄러져 닿는 표식
        const from = trail[last]!;
        const endX = L.cxEnd;
        const x = moving ? from.x + (endX - from.x) * k : endX;
        const y = moving ? from.y + (yTruth - from.y) * k : yTruth;
        el('circle', { cx: r(x), cy: r(y), r: 6, fill: colors.accent, stroke: colors.text, 'stroke-width': 1.5 }, chart);
      }
    }

    function wait(ms: number, mine: number): Promise<boolean> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve(false);
        };
        const id = setTimeout(() => {
          timers.delete(id);
          waiters.delete(wake);
          resolve(mine === gen && !destroyed);
        }, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function run(next: RiemannSumScene, mine: number): Promise<void> {
      draw(next, 0);
      const started = Date.now();
      for (;;) {
        if (!(await wait(FRAME_MS, mine))) return;
        const e = Math.min(1, (Date.now() - started) / MOTION_MS);
        if (e >= 1) break;
        draw(next, e);
      }
      if (mine === gen && !destroyed) draw(next, 1);
    }

    return {
      render(next: RiemannSumScene, _prev: RiemannSumScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        const animated = next.step.kind !== 'start' && next.base !== null;
        if (!opts.animate || !animated) {
          draw(next, 1);
          return;
        }
        return run(next, mine);
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
