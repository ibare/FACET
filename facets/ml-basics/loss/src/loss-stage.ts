/**
 * loss-stage — 손실 곡선 L(z) 위의 출력 하나와 그 자리의 미는 크기.
 *
 * 왼쪽: 가로 z · 세로 L 의 손실 곡선. 출력은 곡선 위의 점이고, 그 자리의 접선 기울기가 곧 ∂L/∂z 다.
 * 점에서 뻗는 화살은 다음 갱신이 z 를 옮길 거리(η = 1 이라 −∂L/∂z 그대로)다. 갱신마다 점이 곡선을 따라
 * 그 화살 끝으로 미끄러져 내려간다. 종류를 바꾸면 곡선이 새 모양으로 휜다.
 * 오른쪽: 걸음 이름 · z · p · L, 미는 크기 막대(0 … gMax), 출력 p 의 띠(0 … 1, 0.5 표시).
 *
 * 무대는 셈하지 않는다 — 곡선 표본 · 눈금 · 값 · 0.5 를 넘은 갱신 번호는 모두 payload 로 받는다.
 * 운동 중의 자리는 앞 값과 이 값 사이를 잇는(보간) 그리기뿐이다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 760;
const H = 470;
/** 운동 길이 (재생 속도 1 에서) */
const MOTION_MS = 380;

const PLOT = { left: 70, right: 500, top: 76, bottom: 340 };
const SIDE = { left: 560, width: 176 };

export type LossAxesIn = {
  zMin: number;
  zMax: number;
  zTicks: number[];
  curveZ: number[];
  curves: number[][];
  lMax: number[];
  lTicks: number[][];
  gMax: number;
  gTicks: number[];
  pTicks: number[];
  half: number;
};

export type LossStage = ViewInstance & {
  setup(axes: LossAxesIn): void;
  start(v: { kind: number; z: number; p: number; L: number }, speed: number): Promise<void>;
  slope(v: { kind: number; z: number; p: number; L: number; g: number }, speed: number): Promise<void>;
  update(
    v: {
      kind: number;
      t: number;
      steps: number;
      z: number;
      p: number;
      L: number;
      g: number;
      crossedAt: number | null;
      last: boolean;
    },
    speed: number,
  ): Promise<void>;
  reset(): void;
};

type Shown = {
  kind: number;
  z: number;
  L: number;
  g: number;
  /** 미는 크기 표시의 켜짐 (0 … 1) */
  push: number;
  p: number;
  /** 지금 그린 곡선의 L 표본 */
  curve: number[];
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  parent.appendChild(node);
  return node;
}

export const lossStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const frames = new Set<number>();
    const cancelFrames = (): void => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
    };
    params.onScrubStart?.(() => cancelFrames());

    let root: SVGGElement | null = null;
    let axes: LossAxesIn | null = null;
    let shown: Shown | null = null;
    let destroyed = false;

    // 요소 — setup 에서 만든다
    let kindText: SVGTextElement;
    let formulaText: SVGTextElement;
    let lTickGroup: SVGGElement;
    let curvePath: SVGPathElement;
    let tangent: SVGLineElement;
    let arrow: SVGLineElement;
    let arrowHead: SVGPathElement;
    let dot: SVGCircleElement;
    let stepText: SVGTextElement;
    let zText: SVGTextElement;
    let pText: SVGTextElement;
    let lText: SVGTextElement;
    let barFill: SVGRectElement;
    let gText: SVGTextElement;
    let pMark: SVGPathElement;
    let cap1: SVGTextElement;
    let cap2: SVGTextElement;

    const need = (): LossAxesIn => {
      if (!axes) throw new Error('loss-stage: setup 전에 걸음이 왔다');
      return axes;
    };
    const xOf = (z: number): number => {
      const a = need();
      return PLOT.left + ((z - a.zMin) / (a.zMax - a.zMin)) * (PLOT.right - PLOT.left);
    };
    const lMaxOf = (kind: number): number => {
      const m = need().lMax[kind];
      if (m === undefined) throw new Error(`loss-stage: 종류 ${kind} 의 L 축이 없다`);
      return m;
    };
    const yOf = (L: number, kind: number): number =>
      PLOT.bottom - (L / lMaxOf(kind)) * (PLOT.bottom - PLOT.top);
    const curveOf = (kind: number): number[] => {
      const cv = need().curves[kind];
      if (!cv) throw new Error(`loss-stage: 종류 ${kind} 의 곡선이 없다`);
      return cv;
    };
    const barX = (g: number): number => (Math.abs(g) / need().gMax) * SIDE.width;
    const pX = (p: number): number => SIDE.left + p * SIDE.width;

    /** 표본 곡선 위 z 자리의 L — 표본 사이를 곧게 잇는다 (그리기용 보간) */
    const onCurve = (curve: readonly number[], z: number): number => {
      const zs = need().curveZ;
      const n = zs.length;
      const first = zs[0];
      const lastZ = zs[n - 1];
      if (first === undefined || lastZ === undefined) throw new Error('loss-stage: 곡선 표본이 없다');
      const f = ((z - first) / (lastZ - first)) * (n - 1);
      const i = Math.max(0, Math.min(n - 2, Math.floor(f)));
      const a = curve[i];
      const b = curve[i + 1];
      if (a === undefined || b === undefined) throw new Error('loss-stage: 곡선 표본이 모자라다');
      return a + (b - a) * (f - i);
    };

    const drawLTicks = (kind: number): void => {
      while (lTickGroup.firstChild) lTickGroup.removeChild(lTickGroup.firstChild);
      const ticks = need().lTicks[kind];
      if (!ticks) throw new Error(`loss-stage: 종류 ${kind} 의 L 눈금이 없다`);
      for (const L of ticks) {
        const y = yOf(L, kind);
        el('line', { x1: PLOT.left, x2: PLOT.right, y1: y, y2: y, stroke: c.border, 'stroke-width': 1 }, lTickGroup);
        const lab = el(
          'text',
          { x: PLOT.left - 8, y: y + 4, 'text-anchor': 'end', fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs },
          lTickGroup,
        );
        lab.textContent = Number.isInteger(L) ? String(L) : L.toFixed(2);
      }
    };

    const kindLabel = (kind: number): string => {
      if (kind === 0) return t('label.squared', 'Squared loss');
      if (kind === 1) return t('label.crossEntropy', 'Cross-entropy');
      throw new Error(`loss-stage: 모르는 종류 ${kind}`);
    };
    const formulaOf = (kind: number): string => {
      if (kind === 0) return t('formula.squared', 'L = (p − y)² · ∂L/∂z = 2(p − y)·p(1 − p)');
      if (kind === 1) return t('formula.crossEntropy', 'L = −[y·ln p + (1 − y)·ln(1 − p)] · ∂L/∂z = p − y');
      throw new Error(`loss-stage: 모르는 종류 ${kind}`);
    };

    /** 지금 상태를 그린다. L 을 주면 점을 그 자리에, 없으면 곡선 위 보간 자리에 */
    const paint = (s: Shown, exactL?: number): void => {
      const L = exactL ?? onCurve(s.curve, s.z);
      const cx = xOf(s.z);
      const cy = yOf(L, s.kind);
      // 곡선
      const zs = need().curveZ;
      let d = '';
      zs.forEach((z, i) => {
        const Li = s.curve[i];
        if (Li === undefined) throw new Error('loss-stage: 곡선 표본이 모자라다');
        d += `${i === 0 ? 'M' : 'L'}${xOf(z).toFixed(1)},${yOf(Li, s.kind).toFixed(1)}`;
      });
      curvePath.setAttribute('d', d);
      dot.setAttribute('cx', String(cx));
      dot.setAttribute('cy', String(cy));
      // 접선 — 기울기 ∂L/∂z, z 로 ±1
      const g = s.g * s.push;
      tangent.setAttribute('x1', String(xOf(s.z - 1)));
      tangent.setAttribute('y1', String(yOf(L - g, s.kind)));
      tangent.setAttribute('x2', String(xOf(s.z + 1)));
      tangent.setAttribute('y2', String(yOf(L + g, s.kind)));
      tangent.setAttribute('opacity', String(s.push));
      // 화살 — 다음 갱신이 옮길 z 거리 (η = 1)
      const ax = xOf(s.z - g);
      arrow.setAttribute('x1', String(cx));
      arrow.setAttribute('x2', String(ax));
      arrow.setAttribute('y1', String(cy));
      arrow.setAttribute('y2', String(cy));
      const dir = ax <= cx ? -1 : 1;
      const len = Math.abs(ax - cx);
      arrowHead.setAttribute(
        'd',
        len < 1 ? '' : `M${ax},${cy} L${ax - dir * 8},${cy - 5} L${ax - dir * 8},${cy + 5} Z`,
      );
      // 미는 크기 막대
      barFill.setAttribute('width', String(barX(g)));
      // p 띠
      const px = pX(s.p);
      pMark.setAttribute('d', `M${px},${PLOT.top + 222} L${px - 6},${PLOT.top + 210} L${px + 6},${PLOT.top + 210} Z`);
    };

    const animate = (from: Shown, to: Shown, speed: number, exactL: number): Promise<void> => {
      cancelFrames();
      if (destroyed || isInstant()) {
        paint(to, exactL);
        return Promise.resolve();
      }
      const dur = MOTION_MS / Math.max(0.01, speed);
      const mix = (a: number, b: number, k: number): number => a + (b - a) * k;
      return new Promise((resolve) => {
        const t0 = performance.now();
        const frame = (now: number): void => {
          if (destroyed) return resolve();
          if (isInstant()) {
            paint(to, exactL);
            return resolve();
          }
          const raw = Math.min(1, (now - t0) / dur);
          const k = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
          if (raw >= 1) {
            paint(to, exactL);
            return resolve();
          }
          // 곡선이 바뀌는 중이면 두 곡선을 같은 화면 높이로 섞는다 (종류가 다르면 축도 다르다)
          const curve = from.curve.map((La, i) => {
            const Lb = to.curve[i];
            if (Lb === undefined) throw new Error('loss-stage: 곡선 표본이 모자라다');
            if (from.kind === to.kind) return mix(La, Lb, k);
            const ya = yOf(La, from.kind);
            const yb = yOf(Lb, to.kind);
            const y = mix(ya, yb, k);
            return ((PLOT.bottom - y) / (PLOT.bottom - PLOT.top)) * lMaxOf(to.kind);
          });
          paint({
            kind: to.kind,
            z: mix(from.z, to.z, k),
            L: 0,
            g: mix(from.g * from.push, to.g * to.push, k),
            push: 1,
            p: mix(from.p, to.p, k),
            curve,
          });
          const id = requestAnimationFrame(frame);
          frames.add(id);
        };
        const id = requestAnimationFrame(frame);
        frames.add(id);
      });
    };

    const setReadouts = (step: string, z: number, p: number, L: number, g: number | null): void => {
      stepText.textContent = step;
      zText.textContent = t('readout.z', 'z = {v}', { v: z.toFixed(2) });
      pText.textContent = t('readout.p', 'p = {v}', { v: p.toFixed(3) });
      lText.textContent = t('readout.L', 'L = {v}', { v: L.toFixed(3) });
      gText.textContent = g === null ? '' : Math.abs(g).toFixed(4);
    };

    const build = (a: LossAxesIn): void => {
      axes = a;
      root = el('g', {}, svg);
      el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, root);

      kindText = el('text', { x: 24, y: 28, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.lg, 'font-weight': 600 }, root);
      formulaText = el('text', { x: 24, y: 52, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md, 'xml:space': 'preserve' }, root);

      // 판
      el('rect', { x: PLOT.left, y: PLOT.top, width: PLOT.right - PLOT.left, height: PLOT.bottom - PLOT.top, fill: c.bgSubtle, stroke: c.border }, root);
      lTickGroup = el('g', {}, root);
      for (const z of a.zTicks) {
        const x = xOf(z);
        el('line', { x1: x, x2: x, y1: PLOT.bottom, y2: PLOT.bottom + 5, stroke: c.textMuted }, root);
        const lab = el('text', { x, y: PLOT.bottom + 18, 'text-anchor': 'middle', fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, root);
        lab.textContent = String(z);
      }
      const zLab = el('text', { x: PLOT.right, y: PLOT.bottom + 36, 'text-anchor': 'end', fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm }, root);
      zLab.textContent = t('axis.z', 'Score z');
      const lLab = el('text', { x: PLOT.left, y: PLOT.top - 8, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm }, root);
      lLab.textContent = t('axis.L', 'Loss L');

      curvePath = el('path', { d: '', fill: 'none', stroke: c.textMuted, 'stroke-width': 2.5 }, root);
      tangent = el('line', { stroke: c.accent, 'stroke-width': 2, 'stroke-dasharray': '6 4', opacity: 0 }, root);
      arrow = el('line', { stroke: c.accent, 'stroke-width': 3 }, root);
      arrowHead = el('path', { d: '', fill: c.accent }, root);
      dot = el('circle', { r: 8, fill: c.primary, stroke: c.bg, 'stroke-width': 2 }, root);

      // 옆 칸
      const sx = SIDE.left;
      stepText = el('text', { x: sx, y: PLOT.top + 4, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.lg, 'font-weight': 600 }, root);
      zText = el('text', { x: sx, y: PLOT.top + 30, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.md }, root);
      pText = el('text', { x: sx, y: PLOT.top + 52, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.md }, root);
      lText = el('text', { x: sx, y: PLOT.top + 74, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.md }, root);

      const pushLab = el('text', { x: sx, y: PLOT.top + 110, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm }, root);
      pushLab.textContent = t('label.push', 'Push ∂L/∂z');
      el('rect', { x: sx, y: PLOT.top + 120, width: SIDE.width, height: 16, fill: c.bgSubtle, stroke: c.border }, root);
      barFill = el('rect', { x: sx, y: PLOT.top + 120, width: 0, height: 16, fill: c.accent }, root);
      for (const g of a.gTicks) {
        const x = sx + barX(g);
        const lab = el('text', { x, y: PLOT.top + 150, 'text-anchor': 'middle', fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, root);
        lab.textContent = String(g);
      }
      gText = el('text', { x: sx + SIDE.width, y: PLOT.top + 110, 'text-anchor': 'end', fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 600 }, root);

      const outLab = el('text', { x: sx, y: PLOT.top + 196, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm }, root);
      outLab.textContent = t('label.output', 'Output p');
      el('line', { x1: sx, x2: sx + SIDE.width, y1: PLOT.top + 224, y2: PLOT.top + 224, stroke: c.textMuted, 'stroke-width': 2 }, root);
      for (const p of a.pTicks) {
        const x = pX(p);
        const isHalf = p === a.half;
        el('line', { x1: x, x2: x, y1: PLOT.top + (isHalf ? 204 : 218), y2: PLOT.top + 230, stroke: c.textMuted, 'stroke-dasharray': isHalf ? '3 3' : '' }, root);
        const lab = el('text', { x, y: PLOT.top + 244, 'text-anchor': 'middle', fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, root);
        lab.textContent = String(p);
      }
      pMark = el('path', { d: '', fill: c.primary }, root);

      cap1 = el('text', { x: 24, y: 420, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md }, root);
      cap2 = el('text', { x: 24, y: 446, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600 }, root);
    };

    const clearAll = (): void => {
      cancelFrames();
      if (root) root.remove();
      root = null;
      axes = null;
      shown = null;
    };

    const inst: LossStage = {
      setup(a) {
        if (root) return; // 판마다 같은 축 — 이미 지었으면 둔다 (자리가 옮겨 가도록)
        build(a);
      },
      async start(v, speed) {
        need();
        kindText.textContent = kindLabel(v.kind);
        formulaText.textContent = formulaOf(v.kind);
        drawLTicks(v.kind);
        setReadouts(t('label.initial', 'Start'), v.z, v.p, v.L, null);
        cap1.textContent = t('caption.start', 'The answer is y = 0, yet the output gives p = {p} to the wrong answer. Loss L = {L}.', {
          p: v.p.toFixed(3),
          L: v.L.toFixed(3),
        });
        cap2.textContent = '';
        const to: Shown = { kind: v.kind, z: v.z, L: v.L, g: 0, push: 0, p: v.p, curve: curveOf(v.kind).slice() };
        const from = shown;
        shown = to;
        if (!from) {
          paint(to, v.L);
          return;
        }
        await animate(from, to, speed, v.L);
      },
      async slope(v, speed) {
        const from = shown;
        if (!from) throw new Error('loss-stage: 처음 값 없이 미는 크기가 왔다');
        setReadouts(t('label.beforeUpdate', 'Before update'), v.z, v.p, v.L, v.g);
        cap1.textContent = t('caption.slope', 'Where the output sits now, the loss pushes z with ∂L/∂z = {g}.', { g: v.g.toFixed(4) });
        cap2.textContent = t('caption.slopeHint', 'The arrow ends where the next update moves z (η = 1).');
        const to: Shown = { kind: v.kind, z: v.z, L: v.L, g: v.g, push: 1, p: v.p, curve: curveOf(v.kind).slice() };
        shown = to;
        await animate(from, to, speed, v.L);
      },
      async update(v, speed) {
        const from = shown;
        if (!from) throw new Error('loss-stage: 처음 값 없이 갱신이 왔다');
        setReadouts(t('label.update', 'Update #{t}', { t: v.t }), v.z, v.p, v.L, v.g);
        cap1.textContent = t('caption.update', 'Update #{t}: z ← z − η·∂L/∂z gives z = {z}, p = {p}, L = {L}. New push {g}.', {
          t: v.t,
          z: v.z.toFixed(2),
          p: v.p.toFixed(3),
          L: v.L.toFixed(3),
          g: v.g.toFixed(4),
        });
        if (v.crossedAt !== null) {
          cap2.textContent = t('caption.crossed', 'Update that took p below 0.5: #{n}', { n: v.crossedAt });
        } else if (v.last) {
          cap2.textContent = t('caption.stayed', 'Updates done: {n}. p is still above 0.5.', { n: v.steps });
        } else {
          cap2.textContent = '';
        }
        const to: Shown = { kind: v.kind, z: v.z, L: v.L, g: v.g, push: 1, p: v.p, curve: curveOf(v.kind).slice() };
        shown = to;
        await animate(from, to, speed, v.L);
      },
      reset() {
        clearAll();
      },
      destroy() {
        destroyed = true;
        clearAll();
      },
    };
    return inst;
  },
};
