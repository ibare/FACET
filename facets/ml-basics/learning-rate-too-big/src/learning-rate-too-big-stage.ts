/**
 * learning-rate-too-big stage — 그릇 L = w² 위에서 공이 바닥을 뛰어넘는다.
 *
 * 갱신 한 번마다 공은 떨어져 있던 자리에서 바닥(w = 0) 위를 넘어 건너편에 떨어진다.
 * 떨어진 자리는 매번 바닥에서 더 멀고, 그릇 벽을 따라 더 높다. 앞 높이는 점선 수평선으로
 * 남아 새 자리가 그 위에 떨어졌음을 보인다. 가로축에는 바닥에서 떨어진 자리가 좌우로
 * 번갈아 벌어지며 눈금으로 쌓이고, 이번 움직임 η·g 가 바닥을 건너는 화살로 선다.
 */
import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { LearningRateTooBigScene } from './scene.js';

const H = 412;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 좌우 여백 상한 */
const SIDE = 40;
/** 곡선 위끝 */
const PLOT_TOP = 84;
/** 가로축 */
const AXIS_Y = H - 76;
/** 그릇 바닥 (L = 0) */
const PLOT_BOTTOM = AXIS_Y - 16;
/** 뛰는 호가 위 끝점보다 솟는 높이 상한 */
const HOP_MAX = 44;
/** 한 번 뛰는 데 걸리는 ms */
const LEAP_MS = 700;
const TICK_MS = 16;

type Pt = { x: number; y: number };
/** 2차 베지어 — 출발 · 조종 · 도착 */
type Arc = { a: Pt; c: Pt; b: Pt };

function fmt(x: number): string {
  if (!Number.isFinite(x)) throw new Error(`learning-rate-too-big-stage: 표시할 수가 유한하지 않다 (${x})`);
  const s = x.toFixed(2);
  return (s === '-0.00' ? '0.00' : s).replace('-', '−');
}

function r2(v: number): number {
  const q = Math.round(v * 100) / 100;
  return q === 0 ? 0 : q;
}

function bezier(arc: Arc, u: number): Pt {
  const m = 1 - u;
  return {
    x: m * m * arc.a.x + 2 * m * u * arc.c.x + u * u * arc.b.x,
    y: m * m * arc.a.y + 2 * m * u * arc.c.y + u * u * arc.b.y,
  };
}

/** 호의 앞 u 만큼 (de Casteljau 로 자른 조각). */
function arcHead(arc: Arc, u: number): Arc {
  const c = { x: arc.a.x + (arc.c.x - arc.a.x) * u, y: arc.a.y + (arc.c.y - arc.a.y) * u };
  return { a: arc.a, c, b: bezier(arc, u) };
}

function arcPath(arc: Arc): string {
  return `M ${r2(arc.a.x)} ${r2(arc.a.y)} Q ${r2(arc.c.x)} ${r2(arc.c.y)} ${r2(arc.b.x)} ${r2(arc.b.y)}`;
}

function ease(u: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * u);
}

export const learningRateTooBigStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const x0 = SIDE;
    const x1 = W - SIDE;
    const cx = (x0 + x1) / 2;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    /** 이번 장면에서 운동이 만질 손잡이 — drawStatic 이 새로 짓는다. */
    let ball: SVGCircleElement | null = null;
    let leapTrail: SVGPathElement | null = null;
    let moveArrow: SVGGElement | null = null;
    let drop: SVGLineElement | null = null;

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

    function write(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size: string; fill: string; anchor?: 'start' | 'middle' | 'end'; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r2(x),
          y: r2(y),
          'font-family': fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    function scales(scene: LearningRateTooBigScene): { xOf: (w: number) => number; yOf: (l: number) => number } {
      const base = scene.base;
      if (base === null) throw new Error('learning-rate-too-big-stage: 바탕 없이 축을 셈하려 했다');
      const sx = (x1 - cx) / base.wLim;
      const sy = (PLOT_BOTTOM - PLOT_TOP) / base.lLim;
      return { xOf: (w) => cx + w * sx, yOf: (l) => PLOT_BOTTOM - l * sy };
    }

    /** 두 자리 사이를 바닥 위로 넘는 호. */
    function leapArc(a: Pt, b: Pt): Arc {
      const hop = Math.min(HOP_MAX, 0.25 * Math.abs(b.x - a.x)) + 12;
      return { a, c: { x: cx, y: Math.min(a.y, b.y) - hop }, b };
    }

    function arrowShape(fromX: number, toX: number): { line: string; head: string } {
      const y = AXIS_Y - 8;
      const dir = toX >= fromX ? 1 : -1;
      const len = Math.abs(toX - fromX);
      const hl = Math.min(8, len);
      const tipBack = toX - dir * hl;
      return {
        line: `M ${r2(fromX)} ${r2(y)} L ${r2(tipBack)} ${r2(y)}`,
        head: `${r2(toX)},${r2(y)} ${r2(tipBack)},${r2(y - 4)} ${r2(tipBack)},${r2(y + 4)}`,
      };
    }

    function drawStatic(scene: LearningRateTooBigScene): void {
      svg.textContent = '';
      ball = null;
      leapTrail = null;
      moveArrow = null;
      drop = null;
      el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }, svg);
      const base = scene.base;
      if (base === null) return;
      const { xOf, yOf } = scales(scene);
      const step = scene.step;
      const landings = scene.landings;
      const current = landings[landings.length - 1];
      if (current === undefined) throw new Error('learning-rate-too-big-stage: 바탕이 있는데 처음 자리가 없다');

      // 캡션 — 지금 일어나는 일
      if (step === null) {
        write(svg, x0, 26, t('caption.start', 'Start: w = {w}', { w: fmt(current.w) }), {
          size: fontSizes.md,
          fill: colors.text,
          weight: '600',
        });
        write(svg, x0, 48, t('caption.rate', 'Learning rate: η = {eta}', { eta: fmt(scene.eta) }), {
          size: fontSizes.sm,
          fill: colors.textMuted,
        });
      } else {
        write(
          svg,
          x0,
          26,
          t('caption.update', 'Update #{k}: w ← {from} − η·g = {to}', {
            k: step.k,
            from: fmt(step.from),
            to: fmt(step.to),
          }),
          { size: fontSizes.md, fill: colors.text, weight: '600' },
        );
        write(
          svg,
          x0,
          48,
          t('caption.detail', 'Gradient: g = {g} · η·g = {move}', { g: fmt(step.g), move: fmt(step.move) }),
          { size: fontSizes.sm, fill: colors.textMuted },
        );
      }

      // 그릇
      const d = base.curve
        .map(([w, l], i) => `${i === 0 ? 'M' : 'L'} ${r2(xOf(w))} ${r2(yOf(l))}`)
        .join(' ');
      el('path', { d, fill: 'none', stroke: colors.text, 'stroke-width': 1.5 }, svg);

      // 앞 높이 — 이번 갱신 전의 자리 높이를 그릇 벽에서 오른쪽 끝까지 긋는다
      if (step !== null) {
        const y = yOf(step.lossFrom);
        el(
          'line',
          {
            x1: r2(xOf(-step.distFrom)),
            y1: r2(y),
            x2: x1,
            y2: r2(y),
            stroke: colors.textMuted,
            'stroke-width': 1,
            'stroke-dasharray': '4 4',
          },
          svg,
        );
        write(svg, x1, y - 4, t('label.before', 'height before'), {
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'end',
        });
      }

      // 바닥
      el('line', {
        x1: r2(cx),
        y1: r2(PLOT_BOTTOM),
        x2: r2(cx),
        y2: r2(AXIS_Y),
        stroke: colors.accent,
        'stroke-width': 1.5,
        'stroke-dasharray': '2 3',
      }, svg);
      el('circle', { cx: r2(cx), cy: r2(PLOT_BOTTOM), r: 4.5, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 }, svg);

      // 지나간 호 · 떨어졌던 자리
      const pts = landings.map((l) => ({ x: xOf(l.w), y: yOf(l.loss) }));
      for (let i = 1; i < pts.length - (step === null ? 0 : 1); i += 1) {
        const a = pts[i - 1];
        const b = pts[i];
        if (a === undefined || b === undefined) throw new Error(`learning-rate-too-big-stage: 호 ${i} 의 끝점이 없다`);
        el('path', {
          d: arcPath(leapArc(a, b)),
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '3 4',
        }, svg);
      }
      for (let i = 0; i < pts.length - 1; i += 1) {
        const p = pts[i];
        if (p === undefined) throw new Error(`learning-rate-too-big-stage: 자리 ${i} 가 없다`);
        el('circle', { cx: r2(p.x), cy: r2(p.y), r: 4, fill: colors.bg, stroke: colors.textMuted, 'stroke-width': 1.5 }, svg);
      }

      // 가로축과 떨어졌던 자리의 눈금
      el('line', { x1: x0, y1: AXIS_Y, x2: x1, y2: AXIS_Y, stroke: colors.border, 'stroke-width': 1 }, svg);
      for (let i = 0; i < landings.length - 1; i += 1) {
        const l = landings[i];
        if (l === undefined) throw new Error(`learning-rate-too-big-stage: 눈금 ${i} 의 자리가 없다`);
        const x = r2(xOf(l.w));
        el('line', { x1: x, y1: AXIS_Y - 4, x2: x, y2: AXIS_Y + 4, stroke: colors.textMuted, 'stroke-width': 1 }, svg);
      }
      const curX = xOf(current.w);
      el('line', {
        x1: r2(curX),
        y1: AXIS_Y - 6,
        x2: r2(curX),
        y2: AXIS_Y + 6,
        stroke: colors.itemActive,
        'stroke-width': 2,
      }, svg);
      write(svg, curX, AXIS_Y + 20, t('label.w', 'w = {v}', { v: fmt(current.w) }), {
        size: fontSizes.sm,
        fill: colors.text,
        anchor: 'middle',
      });
      write(svg, cx, AXIS_Y + 38, t('label.bottom', 'bottom (w = 0)'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'middle',
      });

      // 이번 움직임 η·g — 바닥을 건너는 화살
      if (step !== null) {
        const shape = arrowShape(xOf(step.from), xOf(step.to));
        moveArrow = el('g', {}, svg);
        el('path', { d: shape.line, fill: 'none', stroke: colors.primary, 'stroke-width': 2 }, moveArrow);
        el('polygon', { points: shape.head, fill: colors.primary }, moveArrow);
      }

      // 이번 호와 공
      const cur = pts[pts.length - 1];
      if (cur === undefined) throw new Error('learning-rate-too-big-stage: 지금 자리가 없다');
      if (step !== null) {
        const prev = pts[pts.length - 2];
        if (prev === undefined) throw new Error('learning-rate-too-big-stage: 갱신 전 자리가 없다');
        leapTrail = el('path', {
          d: arcPath(leapArc(prev, cur)),
          fill: 'none',
          stroke: colors.itemActive,
          'stroke-width': 1.75,
        }, svg);
      }
      drop = el('line', {
        x1: r2(cur.x),
        y1: r2(cur.y),
        x2: r2(cur.x),
        y2: AXIS_Y,
        stroke: colors.itemActive,
        'stroke-width': 1,
        'stroke-dasharray': '1 3',
      }, svg);
      ball = el('circle', { cx: r2(cur.x), cy: r2(cur.y), r: 7, fill: colors.itemActive, stroke: colors.text, 'stroke-width': 1.25 }, svg);

      // 읽는 값 — 손실과 바닥에서 떨어진 거리
      const readY = H - 14;
      if (step === null) {
        write(svg, x0, readY, t('readout.loss', 'Loss: {v}', { v: fmt(current.loss) }), {
          size: fontSizes.md,
          fill: colors.text,
        });
        write(svg, x1, readY, t('readout.dist', 'Distance from bottom: {v}', { v: fmt(current.dist) }), {
          size: fontSizes.md,
          fill: colors.text,
          anchor: 'end',
        });
      } else {
        write(
          svg,
          x0,
          readY,
          t('readout.lossChange', 'Loss: {from} → {to}', { from: fmt(step.lossFrom), to: fmt(step.lossTo) }),
          { size: fontSizes.md, fill: colors.danger, weight: '600' },
        );
        write(
          svg,
          x1,
          readY,
          t('readout.distChange', 'Distance from bottom: {from} → {to}', {
            from: fmt(step.distFrom),
            to: fmt(step.distTo),
          }),
          { size: fontSizes.md, fill: colors.text, anchor: 'end' },
        );
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
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

    /** 공이 갱신 전 자리에서 바닥을 넘어 새 자리로 뛴다. 화살은 같은 시계로 자란다. */
    async function leap(scene: LearningRateTooBigScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) throw new Error('learning-rate-too-big-stage: 갱신 없는 장면을 흘리려 했다');
      if (ball === null || leapTrail === null || moveArrow === null || drop === null) {
        throw new Error('learning-rate-too-big-stage: 뛰기 손잡이가 없다');
      }
      const { xOf, yOf } = scales(scene);
      const arc = leapArc({ x: xOf(step.from), y: yOf(step.lossFrom) }, { x: xOf(step.to), y: yOf(step.lossTo) });
      const b = ball;
      const trail = leapTrail;
      const arrow = moveArrow;
      const dropLine = drop;
      const arrowLine = arrow.querySelector('path');
      const arrowHead = arrow.querySelector('polygon');
      if (arrowLine === null || arrowHead === null) throw new Error('learning-rate-too-big-stage: 화살 손잡이가 없다');

      const frame = (u: number): void => {
        const e = ease(u);
        const p = bezier(arc, e);
        b.setAttribute('cx', String(r2(p.x)));
        b.setAttribute('cy', String(r2(p.y)));
        trail.setAttribute('d', arcPath(arcHead(arc, e)));
        const shape = arrowShape(arc.a.x, arc.a.x + (arc.b.x - arc.a.x) * e);
        arrowLine.setAttribute('d', shape.line);
        arrowHead.setAttribute('points', shape.head);
        dropLine.setAttribute('x1', String(r2(p.x)));
        dropLine.setAttribute('x2', String(r2(p.x)));
        dropLine.setAttribute('y1', String(r2(p.y)));
      };

      frame(0);
      const start = performance.now();
      for (;;) {
        if (destroyed || mine !== gen) return;
        const u = Math.min(1, (performance.now() - start) / LEAP_MS);
        frame(u);
        if (u >= 1) return;
        await wait(TICK_MS);
      }
    }

    return {
      async render(
        next: LearningRateTooBigScene,
        prev: LearningRateTooBigScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        drawStatic(next);
        const leapt = next.step !== null && next.step !== prev?.step && next.landings.length > (prev?.landings.length ?? 0);
        if (!opts.animate || !leapt) return;
        await leap(next, mine);
        if (destroyed || mine !== gen) return;
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
