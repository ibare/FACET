/**
 * hold-out-some 의 무대.
 *
 * 동사 — 떨어져 나가고 닿지 않는다. 떼어 둘 셋은 맞추기 전에 그림판 아래 받침으로 떨어져 내려가
 * 따로 선다. 직선은 남은 점의 평균점을 축으로 누운 자리에서 기울어 놓이고, 받침의 셋에는 닿지 않는다.
 * 훈련 쪽을 잰 뒤, 셋이 제자리로 올라와 같은 직선에서 벗어남을 드러낸다.
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
import { formatValue, lineAt } from './algorithm';
import type { HoldOutSomeScene } from './scene';

const H = 360;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 자리 — 캔버스에서 역산한다
const PAD_X = 20;
const AXIS_GUTTER = 28;
const PLOT_L = PAD_X + AXIS_GUTTER;
const PLOT_R = W - PAD_X;
const CAPTION_Y = 22;
const PLOT_T = 44;
const PLOT_B = 232;
const TICK_Y = PLOT_B + 16;
const TRAY_LABEL_Y = 270;
const TRAY_T = 278;
const TRAY_B = 312;
const TRAY_Y = (TRAY_T + TRAY_B) / 2;
const BADGE_T = 326;
const BADGE_H = 26;
const DOT_R = 5;

// 운동 (ms) — 모두 600 안쪽
const MOVE_SPLIT = 520;
const MOVE_FIT = 560;
const MOVE_TRAIN = 460;
const MOVE_HELD = 600;

const FONT_SM = parseFloat(fontSizes.sm);
const FONT_XS = parseFloat(fontSizes.xs);

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, text: string, attrs: Attrs): SVGTextElement {
  const node = el('text', { x, y, 'font-family': fonts.body, ...attrs }, parent);
  node.textContent = text;
  return node;
}

function draw(svg: SVGSVGElement, scene: HoldOutSomeScene, p: number, colors: Palette, t: Translate): void {
  svg.textContent = '';
  const range = scene.range;
  if (!range) return;

  const sx = (x: number): number => PLOT_L + ((x - range.xMin) / (range.xMax - range.xMin)) * (PLOT_R - PLOT_L);
  const sy = (y: number): number => PLOT_B - ((y - range.yMin) / (range.yMax - range.yMin)) * (PLOT_B - PLOT_T);
  const kind = scene.step.kind;
  const pointAt = (i: number): { x: number; y: number } => {
    const pt = scene.points[i];
    if (!pt) throw new Error(`hold-out-some stage: 점 자리 ${i} 가 없다`);
    return pt;
  };

  // 캡션 — 지금 일어나는 일
  let caption: string;
  switch (kind) {
    case 'points':
      caption = t('caption.points', 'Points: {n}. Nothing fitted yet.', { n: scene.points.length });
      break;
    case 'split': {
      if (!scene.split) throw new Error('hold-out-some stage: 가름 없이 split 걸음이다');
      const xs = [...scene.split.held].map((i) => pointAt(i).x).sort((a, b) => a - b).join(', ');
      caption = t('caption.split', 'Set aside before fitting — x: {xs}', { xs });
      break;
    }
    case 'fit': {
      if (!scene.fit) throw new Error('hold-out-some stage: 직선 없이 fit 걸음이다');
      caption = t('caption.fit', 'Fitted to the training points only: ŷ = {a} + {b}·x', {
        a: formatValue(scene.fit.a, 3),
        b: formatValue(scene.fit.b, 3),
      });
      break;
    }
    case 'measure-train':
      if (!scene.onTrain) throw new Error('hold-out-some stage: 훈련 잼 없이 measure-train 걸음이다');
      caption = t('caption.train', 'Measured on the training points — MSE: {mse}', {
        mse: formatValue(scene.onTrain.mse),
      });
      break;
    case 'measure-held':
      if (!scene.onHeld) throw new Error('hold-out-some stage: 떼어 둔 잼 없이 measure-held 걸음이다');
      caption = t('caption.held', 'Same line, measured on the held-out points — MSE: {mse}', {
        mse: formatValue(scene.onHeld.mse),
      });
      break;
  }
  label(svg, PAD_X, CAPTION_Y, caption, { 'font-size': fontSizes.md, fill: colors.text });

  // 격자와 눈금
  const grid = el('g', {}, svg);
  for (let y = Math.ceil(range.yMin); y <= Math.floor(range.yMax); y += 1) {
    el('line', { x1: PLOT_L, y1: sy(y), x2: PLOT_R, y2: sy(y), stroke: colors.border, 'stroke-width': 1 }, grid);
    label(grid, PLOT_L - 8, sy(y) + FONT_SM / 3, String(y), {
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
      'text-anchor': 'end',
    });
  }
  for (let x = Math.ceil(range.xMin); x <= Math.floor(range.xMax); x += 1) {
    label(grid, sx(x), TICK_Y, String(x), { 'font-size': fontSizes.xs, fill: colors.textMuted, 'text-anchor': 'middle' });
  }
  el('line', { x1: PLOT_L, y1: PLOT_B, x2: PLOT_R, y2: PLOT_B, stroke: colors.textMuted, 'stroke-width': 1 }, grid);
  el('line', { x1: PLOT_L, y1: PLOT_T, x2: PLOT_L, y2: PLOT_B, stroke: colors.textMuted, 'stroke-width': 1 }, grid);

  const heldSet = new Set(scene.split ? scene.split.held : []);

  // 받침 — 떼어 둔 셋이 따로 서는 자리
  if (scene.split) {
    label(svg, PLOT_L, TRAY_LABEL_Y, t('label.held', 'Held out'), {
      'font-size': fontSizes.sm,
      fill: colors.itemComparing,
      'font-weight': 600,
    });
    el(
      'rect',
      {
        x: PLOT_L,
        y: TRAY_T,
        width: PLOT_R - PLOT_L,
        height: TRAY_B - TRAY_T,
        rx: 6,
        fill: colors.bgSubtle,
        stroke: colors.itemComparing,
        'stroke-width': 1,
        'stroke-dasharray': '4 3',
      },
      svg,
    );
  }

  // 직선 — 훈련 점의 평균점을 축으로 누운 자리에서 기울어 놓인다
  if (scene.fit) {
    const slope = kind === 'fit' ? scene.fit.b * ease(p) : scene.fit.b;
    const pivot = { a: scene.fit.meanY - slope * scene.fit.meanX, b: slope };
    el(
      'line',
      {
        x1: sx(range.xMin),
        y1: sy(lineAt(pivot, range.xMin)),
        x2: sx(range.xMax),
        y2: sy(lineAt(pivot, range.xMax)),
        stroke: colors.accent,
        'stroke-width': 3,
        'stroke-linecap': 'round',
      },
      svg,
    );
  }

  // 떼어 둔 셋이 올라오는 정도 (measure-held 의 앞 절반) 와 벗어남이 자라는 정도 (뒤 절반)
  const heldRise = kind === 'measure-held' ? ease(clamp01(p * 2)) : scene.onHeld ? 1 : 0;
  const heldGrow = kind === 'measure-held' ? ease(clamp01(p * 2 - 1)) : 1;
  const trainGrow = kind === 'measure-train' ? ease(p) : 1;

  // 벗어남 — 점에서 직선까지 세로로
  const residualLayer = el('g', {}, svg);
  const drawResiduals = (list: { index: number; residual: number }[], grow: number, color: string): void => {
    for (const r of list) {
      const pt = pointAt(r.index);
      const y0 = sy(pt.y);
      const y1 = sy(pt.y - r.residual * grow);
      el('line', { x1: sx(pt.x), y1: y0, x2: sx(pt.x), y2: y1, stroke: color, 'stroke-width': 2 }, residualLayer);
      if (grow >= 1) {
        // 오른쪽 끝에 붙은 점은 글자를 왼쪽에 둔다 — 캔버스 밖으로 새지 않게
        const text = formatValue(r.residual);
        const room = sx(pt.x) + 8 + text.length * FONT_XS * 0.62 <= W - 2;
        label(residualLayer, room ? sx(pt.x) + 8 : sx(pt.x) - 8, (y0 + y1) / 2 + FONT_SM / 3, text, {
          'font-size': fontSizes.xs,
          fill: color,
          'text-anchor': room ? 'start' : 'end',
        });
      }
    }
  };
  if (scene.onTrain) drawResiduals(scene.onTrain.residuals, trainGrow, colors.textMuted);
  if (scene.onHeld && heldRise >= 1) drawResiduals(scene.onHeld.residuals, heldGrow, colors.itemComparing);

  // 점
  const dots = el('g', {}, svg);
  for (const [i, pt] of scene.points.entries()) {
    const cx = sx(pt.x);
    if (!heldSet.has(i)) {
      el('circle', { cx, cy: sy(pt.y), r: DOT_R, fill: colors.primary }, dots);
      continue;
    }
    // 떼어 둔 점 — split 걸음에서 떨어져 내려가고, measure-held 걸음에서 올라온다
    let cy: number;
    if (kind === 'split') cy = sy(pt.y) + (TRAY_Y - sy(pt.y)) * ease(p);
    else cy = TRAY_Y + (sy(pt.y) - TRAY_Y) * heldRise;
    if (heldRise > 0) {
      el(
        'circle',
        { cx, cy: TRAY_Y, r: DOT_R, fill: 'none', stroke: colors.itemComparing, 'stroke-width': 1, 'stroke-dasharray': '2 2' },
        dots,
      );
    }
    el('circle', { cx, cy, r: DOT_R, fill: colors.bg, stroke: colors.itemComparing, 'stroke-width': 2.5 }, dots);
  }

  // 두 점수
  const badgeW = (PLOT_R - PLOT_L - 16) / 2;
  const badge = (x: number, text: string, fill: string, ink: string): void => {
    el('rect', { x, y: BADGE_T, width: badgeW, height: BADGE_H, rx: 6, fill }, svg);
    label(svg, x + badgeW / 2, BADGE_T + BADGE_H / 2 + FONT_SM / 3 + 1, text, {
      'font-size': fontSizes.md,
      fill: ink,
      'text-anchor': 'middle',
      'font-weight': 600,
    });
  };
  if (scene.onTrain) {
    badge(PLOT_L, t('label.mseTrain', 'Training MSE: {v}', { v: formatValue(scene.onTrain.mse) }), colors.primary, colors.textInverse);
  }
  if (scene.onHeld && heldGrow >= 1) {
    badge(
      PLOT_L + badgeW + 16,
      t('label.mseHeld', 'Held-out MSE: {v}', { v: formatValue(scene.onHeld.mse) }),
      colors.itemComparing,
      colors.stateInk,
    );
  }
}

export const holdOutSomeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            done();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            done();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function motionMs(scene: HoldOutSomeScene): number {
      switch (scene.step.kind) {
        case 'points':
          return 0;
        case 'split':
          return MOVE_SPLIT;
        case 'fit':
          return MOVE_FIT;
        case 'measure-train':
          return MOVE_TRAIN;
        case 'measure-held':
          return MOVE_HELD;
      }
    }

    return {
      async render(next: HoldOutSomeScene, prev: HoldOutSomeScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const ms = motionMs(next);
        const moves = opts.animate && next.range !== null && prev !== null && prev.step.kind !== next.step.kind && ms > 0;
        if (!moves) {
          draw(svg, next, 1, colors, t);
          return;
        }
        await tween(ms, mine, (p) => draw(svg, next, p, colors, t));
        if (mine !== gen || destroyed) return;
        draw(svg, next, 1, colors, t);
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
