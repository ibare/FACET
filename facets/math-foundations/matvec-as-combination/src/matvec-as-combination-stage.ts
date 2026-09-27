/**
 * matvec-as-combination 무대.
 *
 * 윗단에 A · v · 합을 수로 적고, 아랫단에 열마다 막대 둘(윗칸 · 아랫칸)을 세운다.
 * 한 걸음은 셋으로 흐른다 — v 의 수가 열 위로 내려가 걸리고(무게), 그 열의 막대가
 * 무게만큼 늘거나 뒤집히거나 줄고(원래 모양은 점선으로 남는다), 바뀐 막대의 복제가
 * 합 칸으로 건너가 합의 막대를 옮긴다. 합 칸에는 열마다 더한 몫이 계단으로 쌓인다.
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
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { formatNumber, formatVec, type Vec2 } from './algorithm.js';
import type { MatvecScene } from './scene.js';

const H = 360;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 20;
const LABEL_Y = 16;
const BRACKET_TOP = 26;
const BRACKET_BOTTOM = 86;
const ROW_Y: readonly [number, number] = [50, 76];
const CHIP_Y = 110;
const BAR_TOP = 140;
const BAR_BOTTOM_ROOM = 50;
const MAX_UNIT = 30;
const CAPTION_Y = H - 14;

const HANG_MS = 300;
const SCALE_MS = 400;
const CARRY_MS = 400;

type Layout = {
  n: number;
  slotW: number;
  colCenter: (j: number) => number;
  barW: number;
  barX: (j: number, c: 0 | 1) => number;
  vx: number;
  vRowY: (j: number) => number;
  eqX: number;
  sumCenter: number;
  groupX: (c: 0 | 1) => number;
  ladderW: number;
  ladderX: (c: 0 | 1, j: number) => number;
  totalW: number;
  totalX: (c: 0 | 1) => number;
  aLeft: number;
  aRight: number;
  sumLeft: number;
  sumRight: number;
};

function layoutFor(n: number): Layout {
  if (n < 1) throw new Error('matvec-as-combination-stage: 열이 없다');
  const W = PIECE_CANVAS_W;
  const ladderStep = 16;
  const ladderW = 12;
  const totalW = 28;
  const groupW = n * ladderStep + 8 + totalW;
  const groupGap = 18;
  const sumW = groupW * 2 + groupGap;
  const sumRight = W - MARGIN;
  const sumLeft = sumRight - sumW;
  const eqX = sumLeft - 22;
  const vx = eqX - 38;
  const aLeft = MARGIN + 8;
  const aRight = vx - 30;
  const slotW = Math.min(110, (aRight - aLeft - 12) / n);
  const slotsLeft = (aLeft + aRight) / 2 - (slotW * n) / 2;
  const colCenter = (j: number): number => slotsLeft + slotW * (j + 0.5);
  const barW = Math.min(26, slotW * 0.28);
  const groupX = (c: 0 | 1): number => sumLeft + c * (groupW + groupGap);
  return {
    n,
    slotW,
    colCenter,
    barW,
    barX: (j, c) => colCenter(j) + (c === 0 ? -barW * 1.15 : barW * 0.15),
    vx,
    vRowY: (j) => BRACKET_TOP + ((BRACKET_BOTTOM - BRACKET_TOP) * (j + 0.5)) / n + 4,
    eqX,
    sumCenter: sumLeft + sumW / 2,
    groupX,
    ladderW,
    ladderX: (c, j) => groupX(c) + j * ladderStep,
    totalW,
    totalX: (c) => groupX(c) + n * ladderStep + 8,
    aLeft: slotsLeft - 6,
    aRight: slotsLeft + slotW * n + 6,
    sumLeft,
    sumRight,
  };
}

/** 값 → 세로 자리. 위가 + 다. */
type Scale = { y: (v: number) => number; zero: number };

function scaleFor(range: { lo: number; hi: number }): Scale {
  const avail = H - BAR_BOTTOM_ROOM - BAR_TOP;
  const unit = Math.min(MAX_UNIT, avail / (range.hi - range.lo));
  const zero = BAR_TOP + range.hi * unit;
  return { y: (v) => Math.round((zero - v * unit) * 100) / 100, zero };
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function round2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

/** 흐르는 도중의 모습. 무게를 거는 열 하나와 그 국면. */
type Motion = { col: number; phase: 'hang' | 'scale' | 'carry'; p: number };

export const matvecAsCombinationStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(round2(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      x: number,
      y: number,
      str: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; family?: string },
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'middle',
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        'font-weight': opts.weight ?? '400',
        fill: opts.fill ?? colors.text,
      });
      node.textContent = str;
      return node;
    }

    function bracket(x0: number, x1: number, y0: number, y1: number): void {
      const k = 6;
      el('path', {
        d: `M ${round2(x0 + k)} ${y0} L ${round2(x0)} ${y0} L ${round2(x0)} ${y1} L ${round2(x0 + k)} ${y1}`,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 1.5,
      });
      el('path', {
        d: `M ${round2(x1 - k)} ${y0} L ${round2(x1)} ${y0} L ${round2(x1)} ${y1} L ${round2(x1 - k)} ${y1}`,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 1.5,
      });
    }

    /** 0 과 값 사이를 막대로 — 또는 from 과 to 사이. */
    function bar(
      x: number,
      w: number,
      sc: Scale,
      from: number,
      to: number,
      style: Record<string, string | number>,
    ): void {
      const y0 = sc.y(from);
      const y1 = sc.y(to);
      el('rect', {
        x,
        y: Math.min(y0, y1),
        width: w,
        height: Math.max(Math.abs(y1 - y0), 1),
        ...style,
      });
    }

    function valueLabel(x: number, sc: Scale, v: number, fill: string): void {
      const y = v >= 0 ? sc.y(v) - 5 : sc.y(v) + 13;
      label(x, y, formatNumber(v), { size: fontSizes.xs, fill, family: fonts.mono });
    }

    function caption(scene: MatvecScene): string | null {
      const step = scene.step;
      if (scene.sum === null) return null;
      if (step.kind === 'start') {
        return t('caption.start', 'Sum starts at {sum}', { sum: formatVec(scene.sum) });
      }
      if (step.kind === 'result') {
        return t('caption.result', 'Columns added: {n}. A v = {av}', {
          n: step.count,
          av: formatVec(scene.sum),
        });
      }
      const a = scene.applied[step.col];
      const column = scene.columns[step.col];
      if (a === undefined || column === undefined) {
        throw new Error(`matvec-as-combination-stage: 열 ${step.col + 1} 의 자취가 없다`);
      }
      const vars = {
        j: step.col + 1,
        w: formatNumber(a.weight),
        col: formatVec(column),
        scaled: formatVec(a.scaled),
        sum: formatVec(a.after),
      };
      if (a.effect === 'stretch') {
        return t('caption.stretch', 'Column {j} × {w} stretches: {col} → {scaled}. Sum: {sum}', vars);
      }
      if (a.effect === 'flip') {
        return t('caption.flip', 'Column {j} × {w} flips: {col} → {scaled}. Sum: {sum}', vars);
      }
      return t('caption.shrink', 'Column {j} × {w} shrinks: {col} → {scaled}. Sum: {sum}', vars);
    }

    function draw(scene: MatvecScene, motion: Motion | null): void {
      svg.textContent = '';
      const L = layoutFor(scene.columns.length);
      const hues = categorical(L.n, 'vivid');
      const hue = (j: number): string => {
        const c = hues[j];
        if (c === undefined) throw new Error(`matvec-as-combination-stage: 열 ${j + 1} 의 색이 없다`);
        return c;
      };
      const current = scene.step.kind === 'weigh' ? scene.step.col : null;

      // 지금 무게를 받는 열의 칸 — 머무는 강조
      if (current !== null) {
        el('rect', {
          x: L.colCenter(current) - L.slotW / 2 + 4,
          y: BRACKET_TOP - 4,
          width: L.slotW - 8,
          height: H - BAR_BOTTOM_ROOM + 18 - (BRACKET_TOP - 4),
          rx: 6,
          fill: colors.bgSubtle,
        });
      }

      // ── 윗단: A · v · 합 ──
      label((L.aLeft + L.aRight) / 2, LABEL_Y, t('label.matrix', 'A'), {
        size: fontSizes.md,
        weight: '600',
      });
      bracket(L.aLeft, L.aRight, BRACKET_TOP, BRACKET_BOTTOM);
      scene.columns.forEach((column, j) => {
        for (const c of [0, 1] as const) {
          label(L.colCenter(j), ROW_Y[c], formatNumber(column[c]), {
            size: fontSizes.md,
            fill: hue(j),
            family: fonts.mono,
            weight: '600',
          });
        }
      });

      label(L.vx, LABEL_Y, t('label.vector', 'v'), { size: fontSizes.md, weight: '600' });
      bracket(L.vx - 20, L.vx + 20, BRACKET_TOP, BRACKET_BOTTOM);
      scene.weights.forEach((w, j) => {
        label(L.vx, L.vRowY(j), formatNumber(w), {
          size: fontSizes.sm,
          fill: hue(j),
          family: fonts.mono,
          weight: j === current ? '700' : '400',
        });
      });

      label(L.eqX, (ROW_Y[0] + ROW_Y[1]) / 2 + 4, '=', { size: fontSizes.lg });

      const shownSum: Vec2 | null =
        motion !== null ? scene.applied[motion.col]?.before ?? null : scene.sum;
      if (motion !== null && shownSum === null) {
        throw new Error('matvec-as-combination-stage: 흐르는 열의 자취가 없다');
      }
      label(
        L.sumCenter,
        LABEL_Y,
        scene.done ? t('label.result', 'A v') : t('label.sum', 'Sum'),
        { size: fontSizes.md, weight: '600' },
      );
      bracket(L.sumCenter - 26, L.sumCenter + 26, BRACKET_TOP, BRACKET_BOTTOM);
      if (shownSum !== null) {
        for (const c of [0, 1] as const) {
          label(L.sumCenter, ROW_Y[c], formatNumber(shownSum[c]), {
            size: fontSizes.md,
            family: fonts.mono,
            weight: '600',
          });
        }
      }

      // ── 무게 표 (열 위에 걸린 v 의 수) ──
      scene.applied.forEach((a) => {
        let x = L.colCenter(a.col);
        let y = CHIP_Y;
        if (motion !== null && motion.col === a.col && motion.phase === 'hang') {
          const p = ease(motion.p);
          x = lerp(L.vx, x, p);
          y = lerp(L.vRowY(a.col), y, p);
        }
        label(x, y, t('label.weight', '× {w}', { w: formatNumber(a.weight) }), {
          size: fontSizes.md,
          fill: hue(a.col),
          family: fonts.mono,
          weight: '700',
        });
      });

      // 범위가 서기 전(init 전)에는 아랫단이 없다
      if (scene.range === null) {
        const cap = caption(scene);
        if (cap !== null) label(PIECE_CANVAS_W / 2, CAPTION_Y, cap, { size: fontSizes.md });
        return;
      }
      const sc = scaleFor(scene.range);

      // 0 줄
      el('line', {
        x1: L.aLeft,
        x2: L.aRight,
        y1: sc.zero,
        y2: sc.zero,
        stroke: colors.border,
        'stroke-width': 1,
      });
      el('line', {
        x1: L.sumLeft - 6,
        x2: L.sumRight,
        y1: sc.zero,
        y2: sc.zero,
        stroke: colors.border,
        'stroke-width': 1,
      });

      // ── 열 막대: 무게를 받기 전은 원래 열, 받은 뒤는 바뀐 열 + 원래 모양 점선 ──
      scene.columns.forEach((column, j) => {
        const a = scene.applied.find((x) => x.col === j);
        let shown: Vec2 = column;
        let ghost = false;
        if (a !== undefined) {
          shown = a.scaled;
          ghost = true;
          if (motion !== null && motion.col === j) {
            if (motion.phase === 'hang') {
              shown = column;
              ghost = false;
            } else if (motion.phase === 'scale') {
              const p = ease(motion.p);
              const k = lerp(1, a.weight, p);
              shown = [column[0] * k, column[1] * k];
            }
          }
        }
        for (const c of [0, 1] as const) {
          const x = L.barX(j, c);
          if (ghost) {
            bar(x, L.barW, sc, 0, column[c], {
              fill: 'none',
              stroke: colors.textMuted,
              'stroke-width': 1,
              'stroke-dasharray': '3 3',
            });
          }
          bar(x, L.barW, sc, 0, shown[c], {
            fill: hue(j),
            'fill-opacity': a !== undefined ? 0.9 : 0.35,
            stroke: hue(j),
            'stroke-width': 1,
          });
          const settled = motion === null || motion.col !== j || motion.phase !== 'scale';
          if (settled) valueLabel(x + L.barW / 2, sc, shown[c], colors.text);
        }
      });

      // ── 합 칸: 열마다 더한 몫의 계단 + 합 막대 ──
      for (const c of [0, 1] as const) {
        scene.applied.forEach((a, idx) => {
          const moving = motion !== null && motion.col === a.col;
          if (moving && motion.phase !== 'carry') return;
          if (moving && motion.phase === 'carry') {
            // 바뀐 열 막대의 복제가 열 칸에서 합 칸으로 건너간다
            const p = ease(motion.p);
            const x = lerp(L.barX(a.col, c), L.ladderX(c, a.col), p);
            const w = lerp(L.barW, L.ladderW, p);
            const base = lerp(0, a.before[c], p);
            bar(x, w, sc, base, base + a.scaled[c], {
              fill: hue(a.col),
              'fill-opacity': 0.9,
              stroke: hue(a.col),
              'stroke-width': 1,
            });
            return;
          }
          bar(L.ladderX(c, a.col), L.ladderW, sc, a.before[c], a.after[c], {
            fill: hue(a.col),
            'fill-opacity': 0.9,
            stroke: hue(a.col),
            'stroke-width': 1,
          });
          // 계단 이음 — 이 몫이 끝난 자리에서 다음 몫이 출발한다
          const nextSettled = scene.applied[idx + 1];
          const joinTo =
            nextSettled !== undefined && !(motion !== null && motion.col === nextSettled.col)
              ? L.ladderX(c, nextSettled.col)
              : L.totalX(c);
          el('line', {
            x1: L.ladderX(c, a.col) + L.ladderW,
            x2: joinTo,
            y1: sc.y(a.after[c]),
            y2: sc.y(a.after[c]),
            stroke: colors.textMuted,
            'stroke-width': 1,
            'stroke-dasharray': '2 2',
          });
        });

        let total: number | null = scene.sum === null ? null : scene.sum[c];
        if (motion !== null) {
          const a = scene.applied[motion.col];
          if (a === undefined) throw new Error('matvec-as-combination-stage: 흐르는 열의 자취가 없다');
          total = motion.phase === 'carry' ? lerp(a.before[c], a.after[c], ease(motion.p)) : a.before[c];
        }
        if (total === null) continue;
        bar(L.totalX(c), L.totalW, sc, 0, total, {
          fill: scene.done ? colors.accent : colors.bgSubtle,
          stroke: colors.text,
          'stroke-width': 1.5,
        });
        if (motion === null || motion.phase !== 'carry') {
          valueLabel(L.totalX(c) + L.totalW / 2, sc, total, colors.text);
        }
      }

      const cap = caption(scene);
      if (cap !== null) label(PIECE_CANVAS_W / 2, CAPTION_Y, cap, { size: fontSizes.md });
    }

    function drawStatic(scene: MatvecScene): void {
      draw(scene, null);
    }

    function now(): number {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let finished = false;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const t0 = now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (now() - t0) / ms);
          frame(p);
          if (p >= 1) {
            finish();
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

    async function render(
      next: MatvecScene,
      prev: MatvecScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      const flows =
        opts.animate &&
        step.kind === 'weigh' &&
        prev !== null &&
        prev.applied.length === next.applied.length - 1;
      if (!flows) {
        drawStatic(next);
        return;
      }
      const col = step.col;
      await tween(mine, HANG_MS, (p) => draw(next, { col, phase: 'hang', p }));
      if (destroyed || mine !== gen) return;
      await tween(mine, SCALE_MS, (p) => draw(next, { col, phase: 'scale', p }));
      if (destroyed || mine !== gen) return;
      await tween(mine, CARRY_MS, (p) => draw(next, { col, phase: 'carry', p }));
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render,
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
