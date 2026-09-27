/**
 * euclid-gcd 무대.
 *
 * 위아래 두 막대가 두 수다 (위 = 왼쪽 수, 아래 = 오른쪽 수). 그 사이 세 줄이 약수 칸이다 —
 * 위 수의 약수 줄, 공약수 줄, 아래 수의 약수 줄. 칸 차례는 재생 내내 나오는 약수 전부라
 * 한 수(數)는 늘 같은 칸에 선다.
 *
 * 뺄셈 한 번: 작은 막대의 복제가 큰 막대 끝으로 올라가 제 길이만큼을 덮고, 덮인 몫과 함께
 * 밖으로 덜어져 나간다. 줄어든 수의 약수 줄은 칸이 빠지고 들어오지만 공약수 줄은 움직이지 않는다.
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
  type Translate,
} from '@ffacet/core/runtime';
import { isStopped, type EuclidGcdScene, type Side } from './scene.js';

const H = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 14;
/** 막대 앞 수 글자 자리 */
const LABEL_W = 48;
/** 막대 뒤 약수 개수 글자 자리 */
const COUNT_W = 100;
const BAR_H = 24;
const CHIP_H = 20;
/** 칸 폭의 상한 — 칸이 적으면 이만큼만 벌린다 */
const COL_W_MAX = 34;

const Y_BAR: Record<Side, number> = { left: 34, right: 214 };
const Y_ROW: Record<Side, number> = { left: 82, right: 166 };
const Y_COMMON = 124;
const Y_CAPTION_1 = 256;
const Y_CAPTION_2 = 280;

/** 운동 두 마디 — 올라가 덮기 · 덜어져 나가기. 합이 800 안쪽 */
const RISE_MS = 320;
const TAKE_MS = 440;
/** 덜어진 몫이 밖으로 밀려나는 거리 */
const TAKE_SHIFT = 64;
/** 빠지고 들어오는 약수 칸이 움직이는 거리 */
const CHIP_SHIFT = 16;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

type Geometry = {
  barX0: number;
  scale: number;
  colW: number;
  gridX0: number;
  slot: Map<number, number>;
};

function geometry(basis: { columns: number[]; top: number }): Geometry {
  const top = basis.top;
  const barX0 = PAD + LABEL_W;
  const barMax = PIECE_CANVAS_W - PAD - COUNT_W - barX0;
  const columns = basis.columns;
  if (columns.length === 0) throw new Error('euclid-gcd stage: 약수 칸이 없다');
  const colW = Math.min(COL_W_MAX, (PIECE_CANVAS_W - 2 * PAD) / columns.length);
  const gridX0 = (PIECE_CANVAS_W - colW * columns.length) / 2;
  const slot = new Map<number, number>();
  columns.forEach((d, i) => slot.set(d, gridX0 + colW * i + colW / 2));
  return { barX0, scale: barMax / top, colW, gridX0, slot };
}

function slotX(g: Geometry, d: number): number {
  const x = g.slot.get(d);
  if (x === undefined) throw new Error(`euclid-gcd stage: 약수 ${d} 의 칸이 없다`);
  return x;
}

type Handles = {
  barLabel: Record<Side, SVGTextElement>;
  countLabel: Record<Side, SVGTextElement>;
  chips: Record<Side, Map<number, SVGGElement>>;
  taken: SVGGElement | null;
  overlay: SVGGElement;
};

export const euclidGcdStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const [leftColor, rightColor] = categorical(2, 'vivid');
    if (leftColor === undefined || rightColor === undefined) {
      throw new Error('euclid-gcd stage: categorical(2) 가 색 둘을 주지 않았다');
    }
    const sideColor: Record<Side, string> = { left: leftColor, right: rightColor };

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function text(
      parent: Element,
      x: number,
      y: number,
      s: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; family?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.family ?? fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'central',
        },
        parent,
      );
      if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
      node.textContent = s;
      return node;
    }

    function drawChip(parent: Element, g: Geometry, d: number, y: number, kind: Side | 'common'): SVGGElement {
      const grp = el('g', {}, parent);
      const w = g.colW - 3;
      const x = slotX(g, d);
      const common = kind === 'common';
      el(
        'rect',
        {
          x: x - w / 2,
          y: y - CHIP_H / 2,
          width: w,
          height: CHIP_H,
          rx: 3,
          fill: common ? colors.accent : colors.bg,
          stroke: common ? colors.accent : sideColor[kind],
          'stroke-width': 1.5,
        },
        grp,
      );
      text(grp, x, y, String(d), {
        size: fontSizes.xs,
        fill: common ? colors.stateInk : colors.text,
        anchor: 'middle',
        family: fonts.mono,
      });
      return grp;
    }

    function drawStatic(scene: EuclidGcdScene): Handles {
      const basis = scene.basis;
      const lists = scene.lists;
      if (basis === null || lists === null) throw new Error('euclid-gcd stage: init 전 장면은 그리지 않는다');
      svg.textContent = '';
      const g = geometry(basis);
      el('rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: colors.bg }, svg);

      const stopped = isStopped(scene);
      const step = scene.step;
      const chips: Record<Side, Map<number, SVGGElement>> = { left: new Map(), right: new Map() };

      // 약수 칸 — 공약수 칸을 잇는 세로줄이 뒤에, 칸이 앞에
      {
        const grid = el('g', {}, svg);
        for (const d of lists.common) {
          el(
            'line',
            {
              x1: slotX(g, d),
              y1: Y_ROW.left,
              x2: slotX(g, d),
              y2: Y_ROW.right,
              stroke: colors.accent,
              'stroke-width': 3,
            },
            grid,
          );
        }
        for (const side of ['left', 'right'] as const) {
          const mine = new Set(lists[side]);
          for (const d of basis.columns) {
            if (mine.has(d)) continue;
            el('circle', { cx: slotX(g, d), cy: Y_ROW[side], r: 1.5, fill: colors.border }, grid);
          }
          for (const d of lists[side]) chips[side].set(d, drawChip(grid, g, d, Y_ROW[side], side));
        }
        for (const d of lists.common) drawChip(grid, g, d, Y_COMMON, 'common');
        const lastCommon = lists.common[lists.common.length - 1];
        if (lastCommon === undefined) throw new Error('euclid-gcd stage: 공약수가 없다 (1 은 늘 공약수다)');
        text(
          grid,
          slotX(g, lastCommon) + g.colW / 2 + 8,
          Y_COMMON,
          t('label.common', 'Common divisors: {n}', { n: lists.common.length }),
          { size: fontSizes.sm, weight: '600' },
        );
        if (stopped) {
          // 멈춘 수의 약수가 곧 공약수 — 가장 큰 공약수 칸에 테두리를 두른다
          const w = g.colW + 3;
          el(
            'rect',
            {
              x: slotX(g, lastCommon) - w / 2,
              y: Y_COMMON - CHIP_H / 2 - 3,
              width: w,
              height: CHIP_H + 6,
              rx: 4,
              fill: 'none',
              stroke: colors.text,
              'stroke-width': 1.5,
            },
            grid,
          );
        }
      }

      // 두 막대
      const barLabel = {} as Record<Side, SVGTextElement>;
      const countLabel = {} as Record<Side, SVGTextElement>;
      let taken: SVGGElement | null = null;
      for (const side of ['left', 'right'] as const) {
        const v = scene[side];
        const y = Y_BAR[side];
        barLabel[side] = text(svg, PAD + LABEL_W - 10, y, String(v), {
          size: fontSizes.lg,
          weight: '700',
          anchor: 'end',
          family: fonts.mono,
        });
        el(
          'rect',
          { x: g.barX0, y: y - BAR_H / 2, width: v * g.scale, height: BAR_H, rx: 2, fill: sideColor[side] },
          svg,
        );
        if (step.kind === 'subtract' && step.side === side) {
          taken = el('g', {}, svg);
          const x0 = g.barX0 + step.to * g.scale;
          const w = step.by * g.scale;
          el(
            'rect',
            {
              x: x0,
              y: y - BAR_H / 2,
              width: w,
              height: BAR_H,
              rx: 2,
              fill: 'none',
              stroke: colors.textMuted,
              'stroke-width': 1,
              'stroke-dasharray': '4 3',
            },
            taken,
          );
          text(taken, x0 + w / 2, y, t('label.removed', '−{n}', { n: step.by }), {
            size: fontSizes.xs,
            fill: colors.textMuted,
            anchor: 'middle',
            family: fonts.mono,
          });
        }
        countLabel[side] = text(
          svg,
          PIECE_CANVAS_W - PAD,
          y,
          t('label.divisors', 'Divisors: {n}', { n: lists[side].length }),
          { size: fontSizes.sm, anchor: 'end', fill: colors.textMuted },
        );
      }

      // 캡션 — 지금 일어난 일
      if (step.kind === 'start') {
        text(svg, PIECE_CANVAS_W / 2, Y_CAPTION_1, t('caption.start', 'Start: ({a}, {b})', { a: scene.left, b: scene.right }), {
          size: fontSizes.md,
          anchor: 'middle',
          weight: '600',
        });
        text(
          svg,
          PIECE_CANVAS_W / 2,
          Y_CAPTION_2,
          t('caption.listsStart', 'Divisors: {x} and {y} · Common divisors: {c}', {
            x: lists.left.length,
            y: lists.right.length,
            c: lists.common.length,
          }),
          { size: fontSizes.sm, anchor: 'middle', fill: colors.textMuted },
        );
      } else {
        text(
          svg,
          PIECE_CANVAS_W / 2,
          Y_CAPTION_1,
          t('caption.subtract', 'Take away: {from} − {by} = {to} → ({a}, {b})', {
            by: step.by,
            from: step.from,
            to: step.to,
            a: scene.left,
            b: scene.right,
          }),
          { size: fontSizes.md, anchor: 'middle', weight: '600' },
        );
        if (stopped) {
          text(
            svg,
            PIECE_CANVAS_W / 2,
            Y_CAPTION_2,
            t('caption.stop', 'Equal: {a} = {b}. Stop · GCD: {g} · Common divisors: {c}', {
              a: scene.left,
              b: scene.right,
              g: scene.left,
              c: lists.common.length,
            }),
            { size: fontSizes.sm, anchor: 'middle', fill: colors.text, weight: '600' },
          );
        } else {
          text(
            svg,
            PIECE_CANVAS_W / 2,
            Y_CAPTION_2,
            t('caption.lists', 'Divisors: {x} → {y} · Common divisors: {c} → {d}', {
              x: step.fromDivisors.length,
              y: lists[step.side].length,
              c: step.fromCommon.length,
              d: lists.common.length,
            }),
            { size: fontSizes.sm, anchor: 'middle', fill: colors.textMuted },
          );
        }
      }

      const overlay = el('g', {}, svg);
      return { barLabel, countLabel, chips, taken, overlay };
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = Date.now();
        let done = false;
        const wake = (): void => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            wake();
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

    async function animateSubtract(scene: EuclidGcdScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'subtract' || scene.lists === null || scene.basis === null) {
        throw new Error('euclid-gcd stage: 뺄셈 운동에 뺄셈 장면이 오지 않았다');
      }
      const taken = h.taken;
      if (taken === null) throw new Error('euclid-gcd stage: 덜어진 몫의 손잡이가 없다');
      const g = geometry(scene.basis);
      const side = step.side;
      const other: Side = side === 'left' ? 'right' : 'left';
      const x0 = g.barX0 + step.to * g.scale;
      const w = step.by * g.scale;
      const yThis = Y_BAR[side] - BAR_H / 2;
      const yOther = Y_BAR[other] - BAR_H / 2;

      // 아직 덜어지기 전 — 수 글자와 개수는 뺄셈 전 값, 덜어질 몫은 제 막대 색으로 차 있다
      h.barLabel[side].textContent = String(step.from);
      h.countLabel[side].textContent = t('label.divisors', 'Divisors: {n}', { n: step.fromDivisors.length });
      taken.setAttribute('opacity', '0');
      const piece = el(
        'rect',
        { x: x0, y: yThis, width: w, height: BAR_H, rx: 2, fill: sideColor[side] },
        h.overlay,
      );
      const ghost = el(
        'rect',
        {
          x: g.barX0,
          y: yOther,
          width: w,
          height: BAR_H,
          rx: 2,
          fill: 'none',
          stroke: sideColor[other],
          'stroke-width': 2.5,
        },
        h.overlay,
      );

      // 빠지는 약수 칸(겹쳐 그린 복제)과 들어오는 약수 칸(정본을 잠시 숨긴다)
      const now = new Set(scene.lists[side]);
      const before = new Set(step.fromDivisors);
      const outward = side === 'left' ? -1 : 1;
      const leaving: SVGGElement[] = [];
      for (const d of step.fromDivisors) {
        if (!now.has(d)) leaving.push(drawChip(h.overlay, g, d, Y_ROW[side], side));
      }
      const arriving: SVGGElement[] = [];
      for (const [d, chip] of h.chips[side]) {
        if (before.has(d)) continue;
        chip.setAttribute('opacity', '0');
        arriving.push(chip);
      }

      // 1. 작은 막대의 복제가 큰 막대 끝으로 올라가 제 길이만큼을 덮는다
      await tween(RISE_MS, mine, (p) => {
        ghost.setAttribute('x', String(r2(g.barX0 + (x0 - g.barX0) * p)));
        ghost.setAttribute('y', String(r2(yOther + (yThis - yOther) * p)));
      });
      if (mine !== gen || destroyed) return;

      // 2. 덮인 몫이 복제와 함께 덜어져 나간다 · 약수 칸이 빠지고 들어온다
      h.barLabel[side].textContent = String(step.to);
      h.countLabel[side].textContent = t('label.divisors', 'Divisors: {n}', { n: scene.lists[side].length });
      await tween(TAKE_MS, mine, (p) => {
        const shift = String(r2(TAKE_SHIFT * p));
        const fade = String(r2(1 - p));
        piece.setAttribute('transform', `translate(${shift} 0)`);
        piece.setAttribute('opacity', fade);
        ghost.setAttribute('transform', `translate(${shift} 0)`);
        ghost.setAttribute('opacity', fade);
        const takenIn = String(r2(p));
        taken.setAttribute('opacity', takenIn);
        for (const c of leaving) {
          c.setAttribute('transform', `translate(0 ${r2(outward * CHIP_SHIFT * p)})`);
          c.setAttribute('opacity', fade);
        }
        for (const c of arriving) {
          c.setAttribute('transform', `translate(0 ${r2(outward * CHIP_SHIFT * (1 - p))})`);
          c.setAttribute('opacity', takenIn);
        }
      });
    }

    return {
      async render(next: EuclidGcdScene, _prev: EuclidGcdScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        // init 이 걸음 0 을 갈아 끼우기 전 — 셈한 바탕이 없으니 빈 캔버스로 둔다
        if (next.basis === null || next.lists === null) {
          svg.textContent = '';
          return;
        }
        const h = drawStatic(next);
        if (!opts.animate || next.step.kind !== 'subtract') return;
        await animateSubtract(next, h, mine);
        if (mine === gen && !destroyed) drawStatic(next);
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
