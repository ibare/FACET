/**
 * train-down-val-up 의 무대.
 *
 * 왼쪽은 지금 차수의 맞춤 — 훈련 점(채운 점)과 검증 점(빈 고리), 곡선, 점마다 곡선까지의 벗어남.
 * 오른쪽은 차수 축 위의 두 오차 — 훈련(실선)과 검증(점선), 그 사이의 띠.
 * 차수를 하나 올리면 곡선이 앞 차수의 모양에서 새 모양으로 휘고, 두 오차 선의 끝이 한 칸 앞으로
 * 나아가며 제 값으로 내려가거나 올라간다. 두 선 사이의 띠가 그 걸음만큼 넓어지거나 좁아진다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { curveXs, evalPoly, type FitRecord } from './algorithm.js';
import type { TrainDownValUpScene } from './scene.js';

const H = 372;
const NS = 'http://www.w3.org/2000/svg';
/** 차수 한 칸 운동의 길이 */
const MOVE_MS = 560;
const FRAME_MS = 16;

const W = PIECE_CANVAS_W;
const MARGIN = 20;
const GUTTER = 44;
/** 왼쪽 맞춤 판의 폭 비율 */
const FIT_SHARE = 0.4;
/** 오른쪽 끝 값 글자가 설 자리 */
const TIP_ROOM = 40;

const TOP = 88;
const BOTTOM = 304;

const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function digits(n: number, table: readonly string[]): string {
  return String(n)
    .split('')
    .map((ch) => {
      const g = table[Number(ch)];
      if (g === undefined) throw new Error(`자리 글자를 만들 수 없다: ${n}`);
      return g;
    })
    .join('');
}

/** 모형의 꼴 — 수학 표기 그대로. 넷째 항부터는 줄여 쓴다 */
function modelFormula(d: number): string {
  const term = (k: number): string =>
    k === 0 ? `c${digits(0, SUB)}` : k === 1 ? `c${digits(1, SUB)}x` : `c${digits(k, SUB)}x${digits(k, SUP)}`;
  const terms: string[] = [];
  if (d <= 3) {
    for (let k = 0; k <= d; k += 1) terms.push(term(k));
  } else {
    terms.push(term(0), term(1), '…', term(d));
  }
  return `ŷ = ${terms.join(' + ')}`;
}

function fmt2(v: number): string {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function r1(v: number): number {
  const n = Math.round(v * 10) / 10;
  return Object.is(n, -0) ? 0 : n;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

type Tip = { pos: number; train: number; val: number };

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  content: string,
  opts: { fill: string; size: string; anchor?: string; family?: string; weight?: string },
): SVGTextElement {
  const node = el(parent, 'text', {
    x: r1(x),
    y: r1(y),
    fill: opts.fill,
    'font-size': opts.size,
    'font-family': opts.family ?? fonts.body,
    'text-anchor': opts.anchor ?? 'start',
  });
  if (opts.weight) node.setAttribute('font-weight', opts.weight);
  node.textContent = content;
  return node;
}

function points(list: readonly { x: number; y: number }[]): string {
  return list.map((p) => `${r1(p.x)},${r1(p.y)}`).join(' ');
}

/** 한 장면을 걸음 진행 p(0 → 1)에서 그린다. p = 1 이 정적 그림이다 */
function drawFrame(
  svg: SVGSVGElement,
  scene: TrainDownValUpScene,
  p: number,
  colors: Palette,
  t: Translate,
): void {
  svg.textContent = '';
  const range = scene.range;
  const last = scene.fits[scene.fits.length - 1];
  if (range === null || last === undefined) return;

  const step = scene.step;
  const moving = step !== null && p < 1;
  const from: FitRecord = step === null ? last : step.from;
  if (step !== null && step.degree !== last.degree) throw new Error('장면: 이번 걸음의 차수가 자취의 끝과 다르다');

  // ── 캡션 — 지금 일어난 일
  const capSize = fontSizes.md;
  if (step === null) {
    label(svg, MARGIN, 26, t('caption.start', 'Degree {d}: one constant fitted to the train points', { d: last.degree }), {
      fill: colors.text,
      size: capSize,
      weight: '600',
    });
  } else {
    label(svg, MARGIN, 26, t('caption.raise', 'Degree {d}: refitted to the train points', { d: last.degree }), {
      fill: colors.text,
      size: capSize,
      weight: '600',
    });
  }
  const trText = step === null ? fmt2(last.trainMse) : `${fmt2(from.trainMse)} → ${fmt2(last.trainMse)}`;
  const vaText = step === null ? fmt2(last.valMse) : `${fmt2(from.valMse)} → ${fmt2(last.valMse)}`;
  label(svg, MARGIN, 48, t('caption.errors', 'Train MSE: {tr} · validation MSE: {va}', { tr: trText, va: vaText }), {
    fill: colors.textMuted,
    size: fontSizes.sm,
  });

  // ── 왼쪽: 맞춤
  const fitX0 = MARGIN;
  const fitX1 = MARGIN + (W - 2 * MARGIN - GUTTER) * FIT_SHARE;
  const padX = (range.xMax - range.xMin) * 0.05;
  const padY = (range.yMax - range.yMin) * 0.08;
  const sx = (x: number): number =>
    fitX0 + ((x - (range.xMin - padX)) / (range.xMax - range.xMin + 2 * padX)) * (fitX1 - fitX0);
  const sy = (y: number): number =>
    BOTTOM - ((y - (range.yMin - padY)) / (range.yMax - range.yMin + 2 * padY)) * (BOTTOM - TOP);

  const fitLayer = el(svg, 'g', {});
  el(fitLayer, 'rect', {
    x: r1(fitX0),
    y: TOP,
    width: r1(fitX1 - fitX0),
    height: BOTTOM - TOP,
    fill: colors.bgSubtle,
    stroke: colors.border,
    rx: 4,
  });
  label(fitLayer, fitX0, TOP - 10, modelFormula(last.degree), {
    fill: colors.text,
    size: fontSizes.sm,
    family: fonts.mono,
  });

  const e = moving ? ease(p) : 1;
  const curveAt = (x: number): number => lerp(evalPoly(from.coef, x), evalPoly(last.coef, x), e);

  // 벗어남 — 점에서 곡선까지
  for (const pt of scene.train) {
    el(fitLayer, 'line', {
      x1: r1(sx(pt.x)),
      y1: r1(sy(pt.y)),
      x2: r1(sx(pt.x)),
      y2: r1(sy(curveAt(pt.x))),
      stroke: colors.textMuted,
      'stroke-width': 1,
    });
  }
  for (const pt of scene.validation) {
    el(fitLayer, 'line', {
      x1: r1(sx(pt.x)),
      y1: r1(sy(pt.y)),
      x2: r1(sx(pt.x)),
      y2: r1(sy(curveAt(pt.x))),
      stroke: colors.itemComparing,
      'stroke-width': 1,
      'stroke-dasharray': '2 2',
    });
  }

  const curve = curveXs(range.xMin, range.xMax).map((x) => ({ x: sx(x), y: sy(curveAt(x)) }));
  el(fitLayer, 'polyline', {
    points: points(curve),
    fill: 'none',
    stroke: colors.text,
    'stroke-width': 2,
    'stroke-linejoin': 'round',
  });

  for (const pt of scene.train) {
    el(fitLayer, 'circle', { cx: r1(sx(pt.x)), cy: r1(sy(pt.y)), r: 4, fill: colors.text });
  }
  for (const pt of scene.validation) {
    el(fitLayer, 'circle', {
      cx: r1(sx(pt.x)),
      cy: r1(sy(pt.y)),
      r: 4,
      fill: colors.bg,
      stroke: colors.itemComparing,
      'stroke-width': 2,
    });
  }

  // 범례
  const legendY = BOTTOM + 44;
  el(svg, 'circle', { cx: fitX0 + 5, cy: legendY - 4, r: 4, fill: colors.text });
  label(svg, fitX0 + 14, legendY, t('label.train', 'train'), { fill: colors.text, size: fontSizes.sm });
  const legendMid = fitX0 + (fitX1 - fitX0) / 2;
  el(svg, 'circle', {
    cx: legendMid + 5,
    cy: legendY - 4,
    r: 4,
    fill: colors.bg,
    stroke: colors.itemComparing,
    'stroke-width': 2,
  });
  label(svg, legendMid + 14, legendY, t('label.validation', 'validation'), { fill: colors.text, size: fontSizes.sm });

  // ── 오른쪽: 차수 축 위의 두 오차
  const ex0 = fitX1 + GUTTER + 12;
  const ex1 = W - MARGIN - TIP_ROOM;
  const top = Math.ceil(range.mseMax * 2) / 2;
  const cx = (d: number): number => ex0 + ((ex1 - ex0) * d) / scene.maxDegree;
  const cy = (v: number): number => BOTTOM - (v / top) * (BOTTOM - TOP);

  const chart = el(svg, 'g', {});
  for (let v = 0; v <= Math.floor(top); v += 1) {
    el(chart, 'line', {
      x1: r1(ex0),
      y1: r1(cy(v)),
      x2: r1(ex1 + TIP_ROOM / 2),
      y2: r1(cy(v)),
      stroke: colors.border,
      'stroke-width': 1,
    });
    label(chart, ex0 - 8, cy(v) + 4, String(v), { fill: colors.textMuted, size: fontSizes.xs, anchor: 'end' });
  }
  label(chart, ex0 - 8, TOP - 10, 'MSE', { fill: colors.textMuted, size: fontSizes.xs, anchor: 'start' });
  for (let d = 0; d <= scene.maxDegree; d += 1) {
    label(chart, cx(d), BOTTOM + 18, String(d), {
      fill: d === last.degree ? colors.text : colors.textMuted,
      size: fontSizes.xs,
      anchor: 'middle',
      weight: d === last.degree ? '700' : '400',
    });
  }
  label(chart, (ex0 + ex1) / 2, BOTTOM + 44, t('label.degreeAxis', 'degree (model flexibility)'), {
    fill: colors.textMuted,
    size: fontSizes.sm,
    anchor: 'middle',
  });

  // 끝 자리 — 운동 중이면 앞 차수에서 이번 차수로 가는 길 위
  const done = moving ? scene.fits.slice(0, -1) : scene.fits;
  const tip: Tip = moving
    ? {
        pos: lerp(from.degree, last.degree, e),
        train: lerp(from.trainMse, last.trainMse, e),
        val: lerp(from.valMse, last.valMse, e),
      }
    : { pos: last.degree, train: last.trainMse, val: last.valMse };

  // 지금 차수의 기둥
  el(chart, 'rect', {
    x: r1(cx(tip.pos) - 9),
    y: TOP,
    width: 18,
    height: BOTTOM - TOP,
    fill: colors.bgSubtle,
  });

  const trainPath = [...done.map((f) => ({ x: cx(f.degree), y: cy(f.trainMse) }))];
  const valPath = [...done.map((f) => ({ x: cx(f.degree), y: cy(f.valMse) }))];
  if (moving) {
    trainPath.push({ x: cx(tip.pos), y: cy(tip.train) });
    valPath.push({ x: cx(tip.pos), y: cy(tip.val) });
  }

  // 두 선 사이의 띠
  el(chart, 'polygon', {
    points: points([...trainPath, ...valPath.slice().reverse()]),
    fill: colors.accent,
    'fill-opacity': 0.35,
    stroke: 'none',
  });

  // 가장 낮았던 검증 — 그 뒤로 검증이 올랐을 때만
  if (last.lowDegree !== last.degree) {
    const lx = cx(last.lowDegree);
    el(chart, 'line', {
      x1: r1(lx),
      y1: TOP,
      x2: r1(lx),
      y2: BOTTOM,
      stroke: colors.itemComparing,
      'stroke-width': 1,
      'stroke-dasharray': '3 3',
    });
    label(chart, lx + 5, TOP + 12, t('label.valLow', 'lowest validation MSE'), {
      fill: colors.itemComparing,
      size: fontSizes.xs,
    });
  }

  el(chart, 'polyline', {
    points: points(trainPath),
    fill: 'none',
    stroke: colors.text,
    'stroke-width': 2,
    'stroke-linejoin': 'round',
  });
  el(chart, 'polyline', {
    points: points(valPath),
    fill: 'none',
    stroke: colors.itemComparing,
    'stroke-width': 2,
    'stroke-dasharray': '5 3',
    'stroke-linejoin': 'round',
  });

  for (const f of done) {
    if (!moving && f.degree === last.degree) continue;
    el(chart, 'circle', { cx: r1(cx(f.degree)), cy: r1(cy(f.trainMse)), r: 3, fill: colors.text });
    el(chart, 'circle', {
      cx: r1(cx(f.degree)),
      cy: r1(cy(f.valMse)),
      r: 3,
      fill: colors.bg,
      stroke: colors.itemComparing,
      'stroke-width': 1.5,
    });
  }

  // 끝의 두 표지와 값 — 두 자리 표시는 이번 차수의 셈한 값
  const tx = cx(tip.pos);
  el(chart, 'circle', { cx: r1(tx), cy: r1(cy(tip.train)), r: 5, fill: colors.text });
  el(chart, 'circle', {
    cx: r1(tx),
    cy: r1(cy(tip.val)),
    r: 5,
    fill: colors.bg,
    stroke: colors.itemComparing,
    'stroke-width': 2,
  });
  if (!moving) {
    // 두 값 글자가 겹치지 않게 위아래로 벌린다
    const yT = cy(tip.train);
    const yV = cy(tip.val);
    const apart = 13;
    let ly = yT;
    let lv = yV;
    if (Math.abs(yT - yV) < apart) {
      const mid = (yT + yV) / 2;
      const trainBelow = yT >= yV;
      ly = mid + (trainBelow ? apart / 2 : -apart / 2);
      lv = mid + (trainBelow ? -apart / 2 : apart / 2);
    }
    label(chart, tx + 9, ly + 4, fmt2(last.trainMse), {
      fill: colors.text,
      size: fontSizes.xs,
      family: fonts.mono,
      weight: '700',
    });
    label(chart, tx + 9, lv + 4, fmt2(last.valMse), {
      fill: colors.itemComparing,
      size: fontSizes.xs,
      family: fonts.mono,
      weight: '700',
    });
  }
}

export const trainDownValUpStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

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

    const renderer: SceneRenderer<TrainDownValUpScene> & ViewInstance = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        drawFrame(svg, next, 1, colors, t);
        if (!opts.animate || next.step === null) return;
        // 한 시계로 곡선의 휨과 두 오차 선의 나아감을 함께 흘린다
        const start = Date.now();
        drawFrame(svg, next, 0, colors, t);
        for (;;) {
          if (mine !== gen || destroyed) return;
          const p = Math.min(1, (Date.now() - start) / MOVE_MS);
          if (p >= 1) break;
          drawFrame(svg, next, p, colors, t);
          await wait(FRAME_MS);
        }
        if (mine !== gen || destroyed) return;
        drawFrame(svg, next, 1, colors, t);
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
    return renderer;
  },
};
