/**
 * overfitting-stage — 불어나는 훈련 점 · 누그러지는 곡선 · 다가서는 두 오차 표지.
 *
 * 왼쪽 판: x–y 평면. 훈련 점(채운 원)은 n 에 따라 제자리에서 돋아나거나 스러지고, 검증 점 스물(빈 원)은 늘 그 자리다.
 * 곡선은 앞 판의 모양(걸음 0 에 점선으로 남는 자리)에서 새 맞춤으로 옮겨 간다. 걸음 2 · 3 에 점마다 벗어남 막대가 선다.
 * 오른쪽 눈금: 오차(MSE) 한 줄. 훈련 표지 · 검증 표지가 앞 판의 자리에서 새 자리로 미끄러진다. 벌어짐은 두 표지
 * 사이의 거리(띠)로만 보이고 수로 띄우지 않는다.
 *
 * 무대는 셈하지 않는다 — 세로 범위 · 눈금 끝 · ŷ 은 payload 로 받고, 곡선을 찍는 `polyValue` 만 algorithm 에서 가져온다.
 */

import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { polyValue } from './algorithm.js';

const W = 840;
const H = 470;
const PLOT = { left: 56, right: 590, top: 52, bottom: 404 };
const GAUGE = { axis: 722, top: 72, bottom: 404 };
const POINT_R = 4.5;
const CURVE_SAMPLES = 160;

export type StagePoint = { x: number; y: number };
export type StageTrainPoint = StagePoint & { level: number };
export type StageSetup = {
  xLo: number;
  xHi: number;
  yLo: number;
  yHi: number;
  errMax: number;
  train: StageTrainPoint[];
  val: StagePoint[];
  n: number;
  d: number;
  active: number[];
};
export type StageResidual = { index: number; yhat: number };

/** projector 가 부르는 무대의 표면 */
export type OverfittingStage = ViewInstance & {
  setup(s: StageSetup): void;
  showRound(n: number, d: number, active: number[], ms: number): Promise<void>;
  showFit(d: number, coefficients: number[], ms: number): Promise<void>;
  showTrainErr(mse: number, residuals: StageResidual[], ms: number): Promise<void>;
  showValErr(mse: number, trainMse: number, residuals: StageResidual[], ms: number): Promise<void>;
  reset(): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

/** ŷ = c₀ + c₁x + … + c_d x^d — 식 기호라 번역하지 않는다 */
function modelFormula(d: number): string {
  const terms: string[] = [];
  for (let i = 0; i <= d; i += 1) {
    const c = `c${SUB[i]}`;
    terms.push(i === 0 ? c : i === 1 ? `${c}x` : `${c}x${SUP[i]}`);
  }
  return `ŷ = ${terms.join(' + ')}`;
}

export const overfittingStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const pal = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const [trainColor, valColor] = categorical(2, 'deep');
    if (!trainColor || !valColor) throw new Error('overfitting-stage: 색 토큰이 비었다');
    const numPx = parseFloat(fontSizes.sm);

    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (content: string, attrs: Record<string, string | number>, parent: Element): SVGTextElement => {
      const node = el('text', { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: pal.text, ...attrs }, parent);
      node.textContent = content;
      return node;
    };
    const clear = (g: Element) => {
      while (g.firstChild) g.removeChild(g.firstChild);
    };

    /** 진행률 0 → 1 을 ms 동안 그린다. 되짚는 중이면 곧장 끝을 그린다 */
    const tween = (ms: number, draw: (k: number) => void): Promise<void> =>
      new Promise((resolve) => {
        if (destroyed || isInstant() || ms <= 0 || typeof requestAnimationFrame !== 'function') {
          draw(1);
          resolve();
          return;
        }
        const start = performance.now();
        const done = () => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const frame = (now: number) => {
          frames.delete(id);
          if (destroyed || isInstant()) {
            draw(1);
            done();
            return;
          }
          const raw = Math.min(1, (now - start) / ms);
          draw(raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2);
          if (raw < 1) {
            id = requestAnimationFrame(frame);
            frames.add(id);
          } else done();
        };
        let id = requestAnimationFrame(frame);
        frames.add(id);
      });
    const stopMotion = () => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    };
    params.onScrubStart?.(stopMotion);

    // ── 층
    const gFrame = el('g', {}, svg);
    const gGhost = el('g', {}, svg);
    const gResidual = el('g', {}, svg);
    const gCurve = el('g', {}, svg);
    const gPoints = el('g', {}, svg);
    const gGauge = el('g', {}, svg);
    const caption = text('', { x: 20, y: 28, 'font-size': fontSizes.md, 'font-weight': 600 }, svg);
    // 식은 판 바깥 위에 — 판 안에 두면 위쪽 점(y 7.6)을 가린다
    const formula = text('', { x: PLOT.right, y: PLOT.top - 8, 'text-anchor': 'end', 'font-family': fonts.mono, fill: pal.textMuted }, svg);

    // ── 판의 상태
    let setupData: StageSetup | null = null;
    let sx = (x: number) => x;
    let sy = (y: number) => y;
    let se = (e: number) => e;
    let trainDots: SVGCircleElement[] = [];
    let active = new Set<number>();
    let curvePath: SVGPathElement | null = null;
    let curveYs: number[] | null = null; // 지금 곡선의 표본 (옮겨 갈 자리)
    let trainMark: { g: SVGGElement; shape: SVGPathElement; label: SVGTextElement; e: number | null } | null = null;
    let valMark: { g: SVGGElement; shape: SVGPathElement; label: SVGTextElement; e: number | null } | null = null;
    let gapBand: SVGRectElement | null = null;

    const need = (): StageSetup => {
      if (!setupData) throw new Error('overfitting-stage: setup 전에 걸음이 왔다');
      return setupData;
    };
    const sampleXs = (s: StageSetup) =>
      Array.from({ length: CURVE_SAMPLES + 1 }, (_, k) => s.xLo + (k * (s.xHi - s.xLo)) / CURVE_SAMPLES);
    const pathOf = (xs: number[], ys: number[], upto = xs.length) =>
      xs
        .slice(0, upto)
        .map((x, k) => `${k === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(ys[k]!).toFixed(1)}`)
        .join(' ');

    const drawFrame = (s: StageSetup) => {
      clear(gFrame);
      el('rect', { x: PLOT.left, y: PLOT.top, width: PLOT.right - PLOT.left, height: PLOT.bottom - PLOT.top, fill: pal.bgSubtle, stroke: pal.border }, gFrame);
      // 가로 눈금: x 는 적힌 값 그대로 — 눈금은 0.5 간격
      for (let v = Math.ceil(s.xLo * 2) / 2; v <= s.xHi + 1e-9; v += 0.5) {
        el('line', { x1: sx(v), x2: sx(v), y1: PLOT.bottom, y2: PLOT.bottom + 4, stroke: pal.textMuted }, gFrame);
        text(v.toFixed(1), { x: sx(v), y: PLOT.bottom + 17, 'text-anchor': 'middle', fill: pal.textMuted, 'font-size': fontSizes.xs }, gFrame);
      }
      for (let v = Math.ceil(s.yLo / 2) * 2; v <= s.yHi + 1e-9; v += 2) {
        el('line', { x1: PLOT.left, x2: PLOT.right, y1: sy(v), y2: sy(v), stroke: pal.border }, gFrame);
        text(String(v), { x: PLOT.left - 6, y: sy(v) + 4, 'text-anchor': 'end', fill: pal.textMuted, 'font-size': fontSizes.xs }, gFrame);
      }
      // 범례
      const ly = H - 22;
      el('circle', { cx: PLOT.left + 6, cy: ly - 4, r: POINT_R, fill: trainColor }, gFrame);
      text(t('label.trainPoints', 'Training points'), { x: PLOT.left + 16, y: ly }, gFrame);
      el('circle', { cx: PLOT.left + 146, cy: ly - 4, r: POINT_R, fill: pal.bg, stroke: valColor, 'stroke-width': 2 }, gFrame);
      text(t('label.valPoints', 'Validation points'), { x: PLOT.left + 156, y: ly }, gFrame);
      el('line', { x1: PLOT.left + 290, x2: PLOT.left + 314, y1: ly - 4, y2: ly - 4, stroke: pal.text, 'stroke-width': 2.5 }, gFrame);
      text(t('label.curve', 'Fitted curve'), { x: PLOT.left + 320, y: ly }, gFrame);

      // 오차 눈금
      text(t('label.gauge', 'Error (MSE)'), { x: GAUGE.axis, y: GAUGE.top - 30, 'text-anchor': 'middle', 'font-weight': 600 }, gFrame);
      text(t('label.formula', 'MSE = Σ(ŷ − y)² / n'), { x: GAUGE.axis, y: GAUGE.top - 14, 'text-anchor': 'middle', fill: pal.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, gFrame);
      el('line', { x1: GAUGE.axis, x2: GAUGE.axis, y1: GAUGE.top, y2: GAUGE.bottom, stroke: pal.textMuted, 'stroke-width': 1.5 }, gFrame);
      for (let v = 0; v <= s.errMax + 1e-9; v += 1) {
        el('line', { x1: GAUGE.axis - 4, x2: GAUGE.axis + 4, y1: se(v), y2: se(v), stroke: pal.textMuted }, gFrame);
        text(String(v), { x: GAUGE.axis + 44, y: se(v) + 4, 'text-anchor': 'end', fill: pal.textMuted, 'font-size': fontSizes.xs }, gFrame);
      }
      text(t('label.train', 'Training'), { x: GAUGE.axis - 12, y: GAUGE.bottom + 22, 'text-anchor': 'end', fill: trainColor, 'font-weight': 600 }, gFrame);
      text(t('label.val', 'Validation'), { x: GAUGE.axis + 12, y: GAUGE.bottom + 22, fill: valColor, 'font-weight': 600 }, gFrame);
    };

    const makeMark = (side: -1 | 1, color: string) => {
      const g = el('g', { opacity: 0 }, gGauge);
      // 눈금 쪽을 가리키는 세모
      const tip = side * 6;
      const back = side * 20;
      const shape = el('path', { d: `M${tip},0 L${back},-7 L${back},7 Z`, fill: color, stroke: color, 'stroke-width': 1.5 }, g);
      const label = text('', { x: side * 26, y: numPx / 3, 'text-anchor': side < 0 ? 'end' : 'start', fill: color, 'font-weight': 600, 'font-family': fonts.mono }, g);
      return { g, shape, label, e: null as number | null };
    };
    const placeMark = (m: NonNullable<typeof trainMark>, e: number) => {
      m.g.setAttribute('transform', `translate(${GAUGE.axis},${se(e).toFixed(1)})`);
    };
    const ghostMark = (m: NonNullable<typeof trainMark>, color: string) => {
      m.label.textContent = '';
      m.shape.setAttribute('fill', pal.bg);
      m.shape.setAttribute('stroke', color);
      m.shape.setAttribute('stroke-dasharray', '2 2');
      m.g.setAttribute('opacity', m.e === null ? '0' : '0.6');
    };
    const solidMark = (m: NonNullable<typeof trainMark>, color: string) => {
      m.shape.setAttribute('fill', color);
      m.shape.removeAttribute('stroke-dasharray');
      m.g.setAttribute('opacity', '1');
    };
    const slideMark = async (m: NonNullable<typeof trainMark>, color: string, e: number, ms: number) => {
      const from = m.e ?? 0;
      solidMark(m, color);
      m.label.textContent = '';
      await tween(ms, (k) => placeMark(m, from + (e - from) * k));
      m.e = e;
      m.label.textContent = e.toFixed(2);
    };

    const residualLines = (pts: StagePoint[], res: StageResidual[], color: string, ms: number) => {
      const lines = res.map((r) => {
        const p = pts[r.index];
        if (!p) throw new Error(`overfitting-stage: 없는 점 ${r.index}`);
        const line = el('line', { x1: sx(p.x), x2: sx(p.x), y1: sy(p.y), y2: sy(p.y), stroke: color, 'stroke-width': 2, opacity: 0.75 }, gResidual);
        return { line, p, yhat: r.yhat };
      });
      return tween(ms, (k) => {
        for (const { line, p, yhat } of lines) line.setAttribute('y2', sy(p.y + (yhat - p.y) * k).toFixed(1));
      });
    };

    /** 판을 비운다 — 무대 틀만 남기고 점 · 곡선 · 표지를 걷는다 */
    const wipe = () => {
      stopMotion();
      clear(gGhost);
      clear(gResidual);
      clear(gCurve);
      clear(gPoints);
      clear(gGauge);
      caption.textContent = '';
      formula.textContent = '';
      trainDots = [];
      active = new Set();
      curvePath = null;
      curveYs = null;
      trainMark = null;
      valMark = null;
      gapBand = null;
    };

    const captionPoints = (n: number, d: number, m: number) =>
      t('caption.points', 'Training points: {n} · Validation points: {m} · Degree: {d}', { n, m, d });

    const stage: OverfittingStage = {
      setup(s) {
        wipe();
        setupData = s;
        const yPad = (s.yHi - s.yLo) * 0.04;
        const xPad = (s.xHi - s.xLo) * 0.03;
        const x0 = s.xLo - xPad;
        const x1 = s.xHi + xPad;
        const y0 = s.yLo - yPad;
        const y1 = s.yHi + yPad;
        sx = (x) => PLOT.left + ((x - x0) / (x1 - x0)) * (PLOT.right - PLOT.left);
        sy = (y) => PLOT.bottom - ((y - y0) / (y1 - y0)) * (PLOT.bottom - PLOT.top);
        const eTop = s.errMax * 1.08;
        se = (e) => GAUGE.bottom - (e / eTop) * (GAUGE.bottom - GAUGE.top);
        drawFrame(s);
        for (const p of s.val) {
          el('circle', { cx: sx(p.x), cy: sy(p.y), r: POINT_R, fill: pal.bg, stroke: valColor, 'stroke-width': 2 }, gPoints);
        }
        active = new Set(s.active);
        trainDots = s.train.map((p, i) =>
          el('circle', { cx: sx(p.x), cy: sy(p.y), r: active.has(i) ? POINT_R : 0, fill: trainColor, stroke: pal.bg, 'stroke-width': 1 }, gPoints),
        );
        gapBand = el('rect', { x: GAUGE.axis - 3, width: 6, y: GAUGE.bottom, height: 0, fill: pal.accent, opacity: 0 }, gGauge);
        trainMark = makeMark(-1, trainColor);
        valMark = makeMark(1, valColor);
        caption.textContent = captionPoints(s.n, s.d, s.val.length);
      },

      async showRound(n, d, next, ms) {
        const s = need();
        if (!trainMark || !valMark || !gapBand) throw new Error('overfitting-stage: 표지가 없다');
        stopMotion();
        // 앞 판의 결론을 걷는다 — 벗어남 · 값 글자 · 띠 · 식. 곡선과 표지는 옮겨 갈 자리로만 남긴다
        clear(gResidual);
        clear(gGhost);
        formula.textContent = '';
        gapBand.setAttribute('opacity', '0');
        ghostMark(trainMark, trainColor);
        ghostMark(valMark, valColor);
        if (curvePath && curveYs) {
          el('path', { d: pathOf(sampleXs(s), curveYs), fill: 'none', stroke: pal.ghostOutline, 'stroke-width': 2, 'stroke-dasharray': '5 4' }, gGhost);
          curvePath.remove();
          curvePath = null;
        }
        caption.textContent = captionPoints(n, d, s.val.length);
        const nextSet = new Set(next);
        const grow = trainDots.map((dot, i) => ({ dot, from: active.has(i) ? POINT_R : 0, to: nextSet.has(i) ? POINT_R : 0 }));
        active = nextSet;
        await tween(ms, (k) => {
          for (const { dot, from, to } of grow) {
            // 새로 드는 점은 한 번 부풀었다가 제 크기로 — 돋아나는 것이 보이게
            const pop = to > from ? Math.sin(Math.PI * k) * 3 : 0;
            dot.setAttribute('r', Math.max(0, from + (to - from) * k + pop).toFixed(2));
          }
        });
      },

      async showFit(d, coefficients, ms) {
        const s = need();
        stopMotion();
        const xs = sampleXs(s);
        const target = xs.map((x) => polyValue(coefficients, x));
        const from = curveYs;
        clear(gGhost);
        if (!curvePath) {
          curvePath = el('path', { d: '', fill: 'none', stroke: pal.text, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, gCurve);
        }
        const path = curvePath;
        formula.textContent = modelFormula(d);
        caption.textContent = t('caption.fit', 'Fitted on the training points only · Coefficients: {k}', { k: coefficients.length });
        if (from && from.length === target.length) {
          await tween(ms, (k) => path.setAttribute('d', pathOf(xs, target.map((y, i) => from[i]! + (y - from[i]!) * k))));
        } else {
          // 앞 판이 없으면 왼쪽에서 오른쪽으로 긋는다
          await tween(ms, (k) => path.setAttribute('d', pathOf(xs, target, Math.max(2, Math.round(k * xs.length)))));
        }
        curveYs = target;
      },

      async showTrainErr(mse, residuals, ms) {
        const s = need();
        if (!trainMark) throw new Error('overfitting-stage: 표지가 없다');
        stopMotion();
        caption.textContent = t('caption.train', 'Training MSE: {v}', { v: mse.toFixed(2) });
        await Promise.all([residualLines(s.train, residuals, trainColor, ms), slideMark(trainMark, trainColor, mse, ms)]);
      },

      async showValErr(mse, trainMse, residuals, ms) {
        const s = need();
        if (!valMark || !gapBand) throw new Error('overfitting-stage: 표지가 없다');
        stopMotion();
        // 훈련 벗어남은 흐리게 남긴다
        for (const line of Array.from(gResidual.children)) line.setAttribute('opacity', '0.25');
        caption.textContent = t('caption.val', 'Validation MSE: {v} · Training MSE: {tr}', { v: mse.toFixed(2), tr: trainMse.toFixed(2) });
        await Promise.all([residualLines(s.val, residuals, valColor, ms), slideMark(valMark, valColor, mse, ms)]);
        // 벌어짐 — 두 표지 사이의 띠 (수로 띄우지 않는다)
        const top = Math.min(se(mse), se(trainMse));
        const band = gapBand;
        band.setAttribute('y', top.toFixed(1));
        band.setAttribute('height', Math.abs(se(mse) - se(trainMse)).toFixed(1));
        await tween(ms / 3, (k) => band.setAttribute('opacity', (0.55 * k).toFixed(2)));
      },

      reset() {
        wipe();
        setupData = null;
        clear(gFrame);
      },

      destroy() {
        destroyed = true;
        stopMotion();
        svg.replaceChildren();
      },
    };
    return stage;
  },
};
