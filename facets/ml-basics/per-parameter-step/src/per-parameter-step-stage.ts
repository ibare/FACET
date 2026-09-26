/**
 * per-parameter-step 무대.
 *
 * 로그 축 하나를 세 줄(기울기 · 보폭 · 움직임)이 함께 쓴다. 로그 축에서는 곱이 거리의 합이라
 * "백 배 차이" 가 같은 길이가 된다. 한 갱신마다
 *   - 보폭 줄 — 두 자리의 보폭이 η 한 점에서 반대쪽으로 갈라져 나간다 (동사)
 *   - 움직임 줄 — 학습률 하나였다면의 움직임(속 빈 표시, 백 배 벌어져 있다)에서 실제 움직임으로 옮겨 가고,
 *     두 자리의 실제 움직임은 축 위 같은 자리에 선다
 *   - 기울기 줄 — 앞 갱신의 기울기에서 이번 기울기로 옮겨 간다
 * a 는 축 위쪽, b 는 아래쪽에 선다 — 같은 크기가 되면 위아래로 겹쳐 선다.
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
} from '@ffacet/core/runtime';
import type { Pair } from './algorithm.js';
import type { PerParameterStepScene, PerParameterStepShown } from './scene.js';

const H = 460;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOTION_MS = 600;
const FRAME_MS = 16;

/** 축 양끝의 여백 — 끝에 선 표시의 반지름과 값 글자 반쪽이 들어간다 */
const PAD_X = 40;
const CAPTION_Y = 24;
/** 세 줄의 윗머리 */
const ROW_TOPS = [48, 170, 292] as const;
/** 줄 윗머리에서 축 선까지 */
const AXIS_DROP = 60;
/** 줄 바탕 띠의 높이 — 줄 간격(122)보다 조금 작다 */
const ROW_BAND = 110;
/** 축 선에서 표시 중심까지 (a 는 위, b 는 아래) */
const MARK_OFF = 15;
const MARK_R = 9;
const TICK_Y = 414;
const FOOT_Y = 446;

/** 사양의 표시 자리수 — [a 쪽, b 쪽] */
const DIGITS = {
  g: [2, 3],
  plain: [2, 3],
  rate: [3, 2],
  move: [3, 3],
} as const;

type Handles = {
  gMarks: [SVGGElement, SVGGElement];
  rateMarks: [SVGGElement, SVGGElement];
  rateLines: [SVGLineElement, SVGLineElement];
  moveMarks: [SVGGElement, SVGGElement];
  moveLines: [SVGLineElement, SVGLineElement];
};

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function tickLabel(k: number): string {
  return k < 0 ? (10 ** k).toFixed(-k) : (10 ** k).toFixed(0);
}

export const perParameterStepStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const cats = categorical(2);
    const [inkA, inkB] = cats;
    if (inkA === undefined || inkB === undefined) throw new Error('per-parameter-step 무대: 식별 색 둘을 얻지 못했다');
    const inkOf: [string, string] = [inkA, inkB];
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

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

    function text(
      parent: Element,
      x: number,
      y: number,
      content: string,
      opts: { size?: string; fill?: string; anchor?: 'start' | 'middle' | 'end'; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r1(x),
          y: r1(y),
          'font-family': fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
        },
        parent,
      );
      if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
      node.textContent = content;
      return node;
    }

    function xOf(range: { lo: number; hi: number }, v: number): number {
      if (!(v > 0)) throw new Error(`per-parameter-step 무대: 로그 축에 ${v} 를 올릴 수 없다`);
      const d = Math.log10(v);
      if (d < range.lo - 1e-9 || d > range.hi + 1e-9) {
        throw new Error(`per-parameter-step 무대: ${v} 가 축 범위 [1e${range.lo}, 1e${range.hi}] 밖이다`);
      }
      return PAD_X + ((d - range.lo) / (range.hi - range.lo)) * (PIECE_CANVAS_W - 2 * PAD_X);
    }

    /** 무게 한 자리의 표시 — 원 안에 기호, 원 바깥(a 는 위 · b 는 아래)에 값 */
    function mark(
      parent: Element,
      x: number,
      axisY: number,
      j: 0 | 1,
      id: string,
      value: string,
      hollow: boolean,
    ): SVGGElement {
      const g = el('g', {}, parent);
      const cy = j === 0 ? axisY - MARK_OFF : axisY + MARK_OFF;
      const ink = inkOf[j];
      el(
        'circle',
        hollow
          ? { cx: r1(x), cy, r: MARK_R, fill: colors.bg, stroke: ink, 'stroke-width': 1.5, 'stroke-dasharray': '3 2' }
          : { cx: r1(x), cy, r: MARK_R, fill: ink },
        g,
      );
      text(g, x, cy + smPx * 0.35, id, {
        anchor: 'middle',
        fill: hollow ? ink : colors.stateInk,
        weight: '600',
      });
      const vy = j === 0 ? cy - MARK_R - 5 : cy + MARK_R + smPx + 3;
      text(g, x, vy, value, { anchor: 'middle', fill: hollow ? colors.textMuted : colors.text });
      return g;
    }

    function drawStatic(scene: PerParameterStepScene): Handles | null {
      svg.textContent = '';
      const [na, nb] = scene.base.ids;
      const u = scene.update;

      const caption =
        u === null
          ? t('caption.start', 'Before any update — one learning rate η: {eta}', {
              eta: scene.base.eta.toFixed(2),
            })
          : t('caption.update', 'Update #{n} — step size {nb} / {na}: {ratio}; movement {na}: {ma}, {nb}: {mb}', {
              n: u.t,
              na,
              nb,
              ratio: u.ratio.toFixed(0),
              ma: u.move[0].toFixed(DIGITS.move[0]),
              mb: u.move[1].toFixed(DIGITS.move[1]),
            });
      text(svg, PAD_X, CAPTION_Y, caption, { size: fontSizes.md, weight: '600' });

      text(
        svg,
        PIECE_CANVAS_W - PAD_X,
        FOOT_Y,
        t('label.weights', 'Weights — {na}: {a}, {nb}: {b}', {
          na,
          nb,
          a: scene.weights[0].toFixed(2),
          b: scene.weights[1].toFixed(2),
        }),
        { anchor: 'end' },
      );

      const range = scene.base.range;
      if (range === null) return null;

      // 줄마다 바탕 띠 — 축 아래 b 표시가 다음 줄에 붙어 읽히지 않게
      for (const top of ROW_TOPS) {
        el('rect', { x: 12, y: top, width: PIECE_CANVAS_W - 24, height: ROW_BAND, rx: 6, fill: colors.bgSubtle }, svg);
      }

      // 십진 격자 — 세 줄이 같은 축을 쓴다는 것을 보인다
      const gridTop = ROW_TOPS[0] + AXIS_DROP - 28;
      const gridBottom = TICK_Y - 14;
      for (let k = range.lo; k <= range.hi; k += 1) {
        const x = r1(xOf(range, 10 ** k));
        el('line', { x1: x, x2: x, y1: gridTop, y2: gridBottom, stroke: colors.border, 'stroke-width': 1 }, svg);
        text(svg, x, TICK_Y, tickLabel(k), { size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle' });
      }

      const rowLabels = [
        t('label.grad', 'Gradient g'),
        t('label.rate', 'Step size η / (√v̂ + ε)'),
        t('label.move', 'Movement = step size · m̂'),
      ];
      const axisYs = ROW_TOPS.map((top) => top + AXIS_DROP);
      for (let i = 0; i < 3; i += 1) {
        text(svg, PAD_X, ROW_TOPS[i]! + 12, rowLabels[i]!, { fill: colors.textMuted });
        el(
          'line',
          { x1: PAD_X, x2: PIECE_CANVAS_W - PAD_X, y1: axisYs[i]!, y2: axisYs[i]!, stroke: colors.textMuted, 'stroke-width': 1 },
          svg,
        );
      }

      // η 한 점 — 학습률 하나
      const rateY = axisYs[1]!;
      const xEta = r1(xOf(range, scene.base.eta));
      el('line', { x1: xEta, x2: xEta, y1: rateY - 26, y2: rateY + 26, stroke: colors.text, 'stroke-width': 1.5 }, svg);
      text(svg, xEta + 5, rateY - 5, t('label.eta', 'η = {eta}', { eta: scene.base.eta.toFixed(2) }), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });

      // 속 빈 표시의 뜻
      const legendY = FOOT_Y - smPx * 0.35;
      el(
        'circle',
        { cx: PAD_X + 6, cy: r1(legendY), r: 6, fill: colors.bg, stroke: colors.textMuted, 'stroke-width': 1.5, 'stroke-dasharray': '3 2' },
        svg,
      );
      text(svg, PAD_X + 18, FOOT_Y, t('label.single', 'With one learning rate: η·g'), { fill: colors.textMuted });

      if (u === null) return null;
      return drawUpdate(scene, range, u, axisYs as [number, number, number], xEta);
    }

    function drawUpdate(
      scene: PerParameterStepScene,
      range: { lo: number; hi: number },
      u: PerParameterStepShown,
      axisYs: [number, number, number],
      xEta: number,
    ): Handles {
      const ids = scene.base.ids;
      const lines = el('g', {}, svg);
      const marks = el('g', {}, svg);

      const rateLines: SVGLineElement[] = [];
      const moveLines: SVGLineElement[] = [];
      const gMarks: SVGGElement[] = [];
      const rateMarks: SVGGElement[] = [];
      const moveMarks: SVGGElement[] = [];

      for (const j of [0, 1] as const) {
        const ink = inkOf[j];
        const side = j === 0 ? -MARK_OFF : MARK_OFF;

        // 보폭 — η 에서 갈라져 나간 선
        const xr = r1(xOf(range, u.rate[j]));
        rateLines.push(
          el('line', { x1: xEta, x2: xr, y1: axisYs[1] + side, y2: axisYs[1] + side, stroke: ink, 'stroke-width': 2 }, lines),
        );

        // 움직임 — 학습률 하나였다면의 자리에서 실제 자리로
        const xp = r1(xOf(range, u.plain[j]));
        const xm = r1(xOf(range, u.move[j]));
        moveLines.push(
          el(
            'line',
            { x1: xp, x2: xm, y1: axisYs[2] + side, y2: axisYs[2] + side, stroke: ink, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' },
            lines,
          ),
        );
        mark(marks, xp, axisYs[2], j, ids[j], u.plain[j].toFixed(DIGITS.plain[j]), true);

        gMarks.push(mark(marks, xOf(range, u.g[j]), axisYs[0], j, ids[j], u.g[j].toFixed(DIGITS.g[j]), false));
        rateMarks.push(mark(marks, xr, axisYs[1], j, ids[j], u.rate[j].toFixed(DIGITS.rate[j]), false));
        moveMarks.push(mark(marks, xm, axisYs[2], j, ids[j], u.move[j].toFixed(DIGITS.move[j]), false));
      }

      return {
        gMarks: gMarks as [SVGGElement, SVGGElement],
        rateMarks: rateMarks as [SVGGElement, SVGGElement],
        rateLines: rateLines as [SVGLineElement, SVGLineElement],
        moveMarks: moveMarks as [SVGGElement, SVGGElement],
        moveLines: moveLines as [SVGLineElement, SVGLineElement],
      };
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    function frame(h: Handles, scene: PerParameterStepScene, gFrom: Pair | null, e: number): void {
      const range = scene.base.range;
      const u = scene.update;
      if (range === null || u === null) throw new Error('per-parameter-step 무대: 갱신 걸음인데 축이나 갱신이 없다');
      const xEta = xOf(range, scene.base.eta);
      const axisG = ROW_TOPS[0] + AXIS_DROP;
      for (const j of [0, 1] as const) {
        // 보폭 — η 한 점에서 갈라진다
        const xr = xOf(range, u.rate[j]);
        h.rateMarks[j].setAttribute('transform', `translate(${r1((xEta - xr) * (1 - e))},0)`);
        h.rateLines[j].setAttribute('x2', String(r1(xEta + (xr - xEta) * e)));

        // 움직임 — 한 폭이었다면의 자리에서 모인다
        const xp = xOf(range, u.plain[j]);
        const xm = xOf(range, u.move[j]);
        h.moveMarks[j].setAttribute('transform', `translate(${r1((xp - xm) * (1 - e))},0)`);
        h.moveLines[j].setAttribute('x2', String(r1(xp + (xm - xp) * e)));

        // 기울기 — 앞 갱신의 자리에서 옮겨 온다. 첫 갱신이면 제자리에서 자란다
        const xg = xOf(range, u.g[j]);
        if (gFrom === null) {
          const cy = j === 0 ? axisG - MARK_OFF : axisG + MARK_OFF;
          const s = Math.max(0.01, r1(e * 100) / 100);
          h.gMarks[j].setAttribute(
            'transform',
            `translate(${r1(xg)},${cy}) scale(${s}) translate(${r1(-xg)},${-cy})`,
          );
        } else {
          const xf = xOf(range, gFrom[j]);
          h.gMarks[j].setAttribute('transform', `translate(${r1((xf - xg) * (1 - e))},0)`);
        }
      }
    }

    async function animate(h: Handles, scene: PerParameterStepScene, gFrom: Pair | null, mine: number): Promise<void> {
      const n = Math.max(1, Math.round(MOTION_MS / FRAME_MS));
      frame(h, scene, gFrom, 0);
      for (let i = 1; i <= n; i += 1) {
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return;
        frame(h, scene, gFrom, ease(i / n));
      }
    }

    return {
      async render(next: PerParameterStepScene, _prev: PerParameterStepScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || h === null || next.step.kind !== 'update') return;
        await animate(h, next, next.step.gFrom, mine);
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
