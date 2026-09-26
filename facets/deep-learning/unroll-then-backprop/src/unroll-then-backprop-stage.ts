/**
 * unroll-then-backprop stage — 펼친 셀 넷 위에 무게 한 벌과 그 기울기 한 칸.
 *
 * 동사는 "모인다". 앞으로는 h 가 셀에서 셀로 건너가고, 뒤로는 기울기(δ)가 아래 길을 따라
 * 마지막 걸음에서 첫 걸음 쪽으로 거슬러 간다. 걸음마다 w_x 에 보탤 몫이 제 셀을 떠나 위의
 * **하나뿐인** w_x 기울기 칸으로 날아가 앉고, 모인 합이 바뀐다.
 *
 * 정적 그리기(`drawStatic`)가 정본이다. 운동은 아직 못 온 값을 가려 두고 떠 있는 표를
 * 끝 자리로 옮긴 뒤, 정적 그리기를 한 번 더 한다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { formatGiven, formatValue } from './algorithm.js';
import type { UnrollScene } from './scene.js';

const H = 352;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 세로 자리
const BOX_TOP = 12;
const BOX_BOTTOM = 84;
const CELL_TOP = 124;
const CELL_H = 56;
const CELL_MID = CELL_TOP + CELL_H / 2;
const INPUT_ARROW_TOP = 202;
const INPUT_TEXT_Y = 219;
const LANE_Y = 252;
const ROW_D_Y = 284;
const ROW_SHARE_Y = 306;
const CAPTION_Y = 338;

// 가로 자리 (가로 폭에서 역산하고 상수는 상한만)
const MARGIN = 16;
const LEFT_COL_X = 50;
const LOSS_R = 24;
const CELL_W_MAX = 84;
const PILL_W_MAX = 66;
const PILL_H = 22;
const SLOT_W = 56;
const SLOT_OP = 22;
const SUM_W = 72;
const SLOT_H = 26;
const DIVIDER_X = 162;

// 운동 시간
const FORWARD_MS = 420;
const LOSS_MS = 420;
const BACK_SLIDE_MS = 260;
const BACK_FLY_MS = 380;

const SM = parseFloat(fontSizes.sm);
const MONO_CHAR = 0.6;

type Layout = {
  n: number;
  cellXs: number[];
  cellW: number;
  pillW: number;
  lossX: number;
  slotXs: number[];
  sumX: number;
};

function layoutFor(n: number): Layout {
  const lossX = PIECE_CANVAS_W - MARGIN - LOSS_R - 8;
  const areaLeft = LEFT_COL_X + 54;
  const areaRight = lossX - LOSS_R - 36;
  const gap = (areaRight - areaLeft) / n;
  const cellW = Math.min(CELL_W_MAX, gap * 0.76);
  const pillW = Math.min(PILL_W_MAX, gap * 0.62);
  const cellXs = Array.from({ length: n }, (_, i) => areaLeft + gap * (i + 0.5));
  // 기울기 칸 — 보탠 차례대로 자리 n 개 + 합 자리. 넘치면 자리 폭을 줄인다
  const slotLeft = DIVIDER_X + 16;
  const room = PIECE_CANVAS_W - MARGIN - 12 - slotLeft;
  const want = n * SLOT_W + n * SLOT_OP + SUM_W;
  const k = Math.min(1, room / want);
  const slotW = SLOT_W * k;
  const step = (SLOT_W + SLOT_OP) * k;
  const slotXs = Array.from({ length: n }, (_, i) => slotLeft + step * i + slotW / 2);
  const sumX = slotLeft + step * n + (SUM_W * k) / 2;
  return { n, cellXs, cellW, pillW, lossX, slotXs, sumX };
}

/** 자리 · 입력을 꺼낸다. 없으면 0 을 지어 그리지 않고 던진다. */
function at<T>(list: readonly T[], i: number, what: string): T {
  const v = list[i];
  if (v === undefined) throw new Error(`unroll-then-backprop 무대: ${what}[${i}] 가 없다`);
  return v;
}

function known(v: number | null | undefined, what: string): number {
  if (v === null || v === undefined) {
    throw new Error(`unroll-then-backprop 무대: ${what} 를 아직 셈하지 않은 장면이다`);
  }
  return v;
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

type Handles = {
  hValues: Array<SVGElement | null>;
  lossValue: SVGElement | null;
  lossPill: SVGElement | null;
  backRows: Map<number, { pill: SVGElement; rowD: SVGElement; rowShare: SVGElement }>;
  slotValues: Array<SVGElement | null>;
  sumValue: SVGElement;
  motion: SVGGElement;
};

export const unrollThenBackpropStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      content: string,
      opts: { size?: string; mono?: boolean; fill?: string; anchor?: string; weight?: string } = {},
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'middle',
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        fill: opts.fill ?? colors.text,
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = content;
      return node;
    }

    function arrow(parent: Element, x1: number, y1: number, x2: number, y2: number, stroke: string): void {
      el(parent, 'line', { x1, y1, x2, y2, stroke, 'stroke-width': 1.4 });
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const s = 6;
      const ax = x2 - s * Math.cos(ang - 0.45);
      const ay = y2 - s * Math.sin(ang - 0.45);
      const bx = x2 - s * Math.cos(ang + 0.45);
      const by = y2 - s * Math.sin(ang + 0.45);
      el(parent, 'path', {
        d: `M${round(x2)} ${round(y2)} L${round(ax)} ${round(ay)} L${round(bx)} ${round(by)} Z`,
        fill: stroke,
      });
    }

    /** 값 표 하나 — 둥근 네모 안의 글자. 떠다니는 표와 앉은 표가 같은 모양이다. */
    function chip(
      parent: Element,
      cx: number,
      cy: number,
      w: number,
      h: number,
      content: string,
      look: { fill: string; stroke: string; ink: string },
    ): SVGGElement {
      const g = el(parent, 'g', {});
      el(g, 'rect', {
        x: cx - w / 2,
        y: cy - h / 2,
        width: w,
        height: h,
        rx: 6,
        fill: look.fill,
        stroke: look.stroke,
        'stroke-width': 1.4,
      });
      label(g, cx, cy + SM * 0.36, content, { mono: true, fill: look.ink });
      return g;
    }

    const lookForward = () => ({ fill: colors.bg, stroke: colors.primary, ink: colors.text });
    const lookBack = () => ({ fill: colors.bg, stroke: colors.itemActive, ink: colors.text });
    const lookShare = () => ({ fill: colors.bgSubtle, stroke: colors.itemActive, ink: colors.text });

    function drawStatic(scene: UnrollScene): Handles {
      svg.textContent = '';
      const { base } = scene;
      const sym = base.symbols;
      const n = base.xs.length;
      const L = layoutFor(n);
      const step = scene.step;
      const done = scene.back.length === n;

      // ── 무게 한 벌과 그 기울기 한 칸 ──
      el(svg, 'rect', {
        x: MARGIN,
        y: BOX_TOP,
        width: PIECE_CANVAS_W - MARGIN * 2,
        height: BOX_BOTTOM - BOX_TOP,
        rx: 8,
        fill: colors.bgSubtle,
        stroke: colors.border,
      });
      label(svg, MARGIN + 14, BOX_TOP + 18, t('label.shared', 'shared by every step'), {
        anchor: 'start',
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      label(svg, MARGIN + 14, BOX_TOP + 42, `${sym.wx} ${formatGiven(base.wx)}`, {
        anchor: 'start',
        mono: true,
        size: fontSizes.lg,
        weight: '600',
      });
      label(
        svg,
        MARGIN + 14,
        BOX_TOP + 62,
        `${sym.wh} ${formatGiven(base.wh)} · ${sym.b} ${formatGiven(base.b)}`,
        { anchor: 'start', mono: true, size: fontSizes.xs, fill: colors.textMuted },
      );
      el(svg, 'line', {
        x1: DIVIDER_X,
        y1: BOX_TOP + 10,
        x2: DIVIDER_X,
        y2: BOX_BOTTOM - 10,
        stroke: colors.border,
      });
      label(svg, DIVIDER_X + 16, BOX_TOP + 18, sym.grad, {
        anchor: 'start',
        mono: true,
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      label(
        svg,
        DIVIDER_X + 16 + sym.grad.length * parseFloat(fontSizes.xs) * MONO_CHAR + 8,
        BOX_TOP + 18,
        t('label.grad', 'gradient'),
        { anchor: 'start', size: fontSizes.xs, fill: colors.textMuted },
      );

      const slotY = BOX_TOP + 46;
      const slotW = Math.min(SLOT_W, (n > 1 ? at(L.slotXs, 1, 'slotXs') : L.sumX) - at(L.slotXs, 0, 'slotXs') - 12);
      const slotValues: Array<SVGElement | null> = [];
      for (let i = 0; i < n; i += 1) {
        const sx = at(L.slotXs, i, 'slotXs');
        const entry = scene.back[i];
        if (entry) {
          slotValues.push(chip(svg, sx, slotY, slotW, SLOT_H, formatValue(entry.share), lookShare()));
        } else {
          el(svg, 'rect', {
            x: sx - slotW / 2,
            y: slotY - SLOT_H / 2,
            width: slotW,
            height: SLOT_H,
            rx: 6,
            fill: 'none',
            stroke: colors.border,
            'stroke-dasharray': '3 3',
          });
          label(svg, sx, slotY + SM * 0.36, `${sym.step}${n - i}`, {
            mono: true,
            size: fontSizes.xs,
            fill: colors.textMuted,
          });
          slotValues.push(null);
        }
        const opX = sx + slotW / 2 + (SLOT_OP + (SLOT_W - slotW)) / 2;
        label(svg, opX, slotY + SM * 0.36, i === n - 1 ? '=' : '+', {
          mono: true,
          fill: colors.textMuted,
        });
      }
      const sumW = Math.min(SUM_W, PIECE_CANVAS_W - MARGIN - 8 - (L.sumX - SUM_W / 2) + SUM_W / 2);
      const sumValue = chip(svg, L.sumX, slotY, sumW, SLOT_H + 4, formatValue(scene.sum), {
        fill: done ? colors.accent : colors.bg,
        stroke: colors.text,
        ink: done ? colors.stateInk : colors.text,
      });

      // ── 무게 한 벌에서 셀 넷으로 — 따로 넷이 아니라 하나 ──
      const fanX = MARGIN + 34;
      for (const cx of L.cellXs) {
        el(svg, 'line', {
          x1: fanX,
          y1: BOX_BOTTOM,
          x2: cx,
          y2: CELL_TOP,
          stroke: colors.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '2 4',
        });
      }

      // ── 처음 상태 h0 ──
      el(svg, 'rect', {
        x: LEFT_COL_X - 22,
        y: CELL_TOP + 8,
        width: 44,
        height: CELL_H - 16,
        rx: 6,
        fill: colors.bg,
        stroke: colors.border,
      });
      label(svg, LEFT_COL_X, CELL_TOP + 22, `${sym.h}0`, {
        mono: true,
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      label(svg, LEFT_COL_X, CELL_TOP + 40, formatGiven(base.h0), { mono: true });

      // ── 펼친 셀 ──
      const hValues: Array<SVGElement | null> = [];
      for (let i = 0; i < n; i += 1) {
        const cx = at(L.cellXs, i, 'cellXs');
        const tIdx = i + 1;
        const fromX = i === 0 ? LEFT_COL_X + 22 : at(L.cellXs, i - 1, 'cellXs') + L.cellW / 2;
        const hNow = scene.hs[i];
        arrow(
          svg,
          fromX,
          CELL_MID,
          cx - L.cellW / 2,
          CELL_MID,
          hNow !== null && hNow !== undefined ? colors.primary : colors.border,
        );
        const current =
          (step.kind === 'forward' || step.kind === 'backward') && step.t === tIdx;
        const stroke = !current
          ? colors.border
          : step.kind === 'forward'
            ? colors.primary
            : colors.itemActive;
        el(svg, 'rect', {
          x: cx - L.cellW / 2,
          y: CELL_TOP,
          width: L.cellW,
          height: CELL_H,
          rx: 8,
          fill: colors.bg,
          stroke,
          'stroke-width': current ? 2.2 : 1.2,
        });
        label(svg, cx, CELL_TOP + 16, `${sym.h}${tIdx}`, {
          mono: true,
          size: fontSizes.xs,
          fill: colors.textMuted,
        });
        if (hNow !== null && hNow !== undefined) {
          hValues.push(
            label(svg, cx, CELL_TOP + 40, formatValue(hNow), {
              mono: true,
              size: fontSizes.lg,
              weight: '600',
            }),
          );
        } else {
          label(svg, cx, CELL_TOP + 40, sym.tanh, { mono: true, fill: colors.textMuted });
          hValues.push(null);
        }
        // 입력
        arrow(svg, cx, INPUT_ARROW_TOP, cx, CELL_TOP + CELL_H + 2, colors.textMuted);
        label(svg, cx, INPUT_TEXT_Y, `${sym.x}${tIdx} ${formatGiven(at(base.xs, i, 'xs'))}`, {
          mono: true,
        });
      }

      // ── 손실 ──
      const lastX = at(L.cellXs, n - 1, 'cellXs') + L.cellW / 2;
      arrow(svg, lastX, CELL_MID, L.lossX - LOSS_R, CELL_MID, scene.loss ? colors.primary : colors.border);
      el(svg, 'circle', {
        cx: L.lossX,
        cy: CELL_MID,
        r: LOSS_R,
        fill: colors.bg,
        stroke: step.kind === 'loss' ? colors.primary : colors.border,
        'stroke-width': step.kind === 'loss' ? 2.2 : 1.2,
      });
      let lossValue: SVGElement | null = null;
      if (scene.loss) {
        label(svg, L.lossX, CELL_MID - 6, sym.loss, { mono: true, size: fontSizes.xs, fill: colors.textMuted });
        lossValue = label(svg, L.lossX, CELL_MID + 12, formatValue(scene.loss.value), {
          mono: true,
          weight: '600',
        });
      } else {
        label(svg, L.lossX, CELL_MID + 5, sym.loss, { mono: true, size: fontSizes.md });
      }
      arrow(svg, L.lossX, INPUT_ARROW_TOP, L.lossX, CELL_MID + LOSS_R + 2, colors.textMuted);
      label(svg, L.lossX, INPUT_TEXT_Y, `${sym.y} ${formatGiven(base.y)}`, { mono: true });

      // ── 뒤로 가는 길 ──
      const reached = new Set(scene.back.map((e) => e.t));
      const firstX = at(L.cellXs, 0, 'cellXs');
      el(svg, 'line', {
        x1: firstX,
        y1: LANE_Y,
        x2: L.lossX,
        y2: LANE_Y,
        stroke: colors.border,
        'stroke-dasharray': '3 4',
      });
      for (let i = n - 1; i >= 0; i -= 1) {
        const tIdx = i + 1;
        if (!reached.has(tIdx)) continue;
        const to = at(L.cellXs, i, 'cellXs');
        const from = i === n - 1 ? L.lossX : at(L.cellXs, i + 1, 'cellXs');
        el(svg, 'line', { x1: from, y1: LANE_Y, x2: to, y2: LANE_Y, stroke: colors.itemActive, 'stroke-width': 1.6 });
        if (i < n - 1) {
          label(svg, (from + to) / 2, LANE_Y - 8, `×${formatGiven(base.wh)}`, {
            mono: true,
            size: fontSizes.xs,
            fill: colors.itemActive,
          });
        }
      }
      // 줄 머리 — 기호로만
      label(svg, MARGIN + 4, LANE_Y + SM * 0.36, sym.delta, { anchor: 'start', mono: true, fill: colors.textMuted });
      label(svg, MARGIN + 4, ROW_D_Y, `×(${sym.slope})`, {
        anchor: 'start',
        mono: true,
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      label(svg, MARGIN + 4, ROW_SHARE_Y, `×${sym.x}`, {
        anchor: 'start',
        mono: true,
        size: fontSizes.xs,
        fill: colors.textMuted,
      });

      let lossPill: SVGElement | null = null;
      // 손실에서 나온 δ 는 뒤로 첫 걸음에 셀로 옮겨 간다 — 떠난 자리에 남기지 않는다
      if (scene.loss && scene.back.length === 0) {
        lossPill = chip(svg, L.lossX, LANE_Y, L.pillW, PILL_H, `${sym.delta}${n} ${formatValue(scene.loss.delta)}`, lookBack());
      }
      const backRows = new Map<number, { pill: SVGElement; rowD: SVGElement; rowShare: SVGElement }>();
      for (const entry of scene.back) {
        const cx = at(L.cellXs, entry.t - 1, 'cellXs');
        const pill = chip(svg, cx, LANE_Y, L.pillW, PILL_H, `${sym.delta}${entry.t} ${formatValue(entry.delta)}`, lookBack());
        const rowD = label(svg, cx, ROW_D_Y, `×${formatValue(entry.slope)} → ${formatValue(entry.d)}`, {
          mono: true,
          fill: colors.textMuted,
        });
        const x = at(base.xs, entry.t - 1, 'xs');
        const rowShare = label(svg, cx, ROW_SHARE_Y, `×${formatGiven(x)} → ${formatValue(entry.share)}`, {
          mono: true,
          weight: '600',
        });
        backRows.set(entry.t, { pill, rowD, rowShare });
      }

      // ── 캡션 — 지금 일어나는 일만 ──
      label(svg, PIECE_CANVAS_W / 2, CAPTION_Y, caption(scene), { size: fontSizes.md });

      const motion = el(svg, 'g', {});
      return { hValues, lossValue, lossPill, backRows, slotValues, sumValue, motion };
    }

    function caption(scene: UnrollScene): string {
      const step = scene.step;
      const n = scene.base.xs.length;
      switch (step.kind) {
        case 'start':
          return t('caption.start', 'The same cell, unrolled. Cells: {n}', { n });
        case 'forward': {
          const h = known(scene.hs[step.t - 1], `h${step.t}`);
          return t('caption.forward', 'Forward · cell {t} · hidden state: {h}', {
            t: step.t,
            h: formatValue(h),
          });
        }
        case 'loss':
          if (!scene.loss) throw new Error('unroll-then-backprop 무대: 손실 걸음인데 손실이 없다');
          return t('caption.loss', 'Loss: {loss} · gradient sent back: {delta}', {
            loss: formatValue(scene.loss.value),
            delta: formatValue(scene.loss.delta),
          });
        case 'backward': {
          const entry = at(scene.back, step.slot, 'back');
          const vars = { t: step.t, share: formatValue(entry.share), sum: formatValue(scene.sum) };
          return scene.back.length === n
            ? t('caption.backLast', 'Backward · cell {t} · share added: {share} · gradient of the shared weight: {sum}', vars)
            : t('caption.back', 'Backward · cell {t} · share added: {share} · running sum: {sum}', vars);
        }
      }
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = () => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function hide(node: SVGElement | null | undefined): void {
      node?.setAttribute('visibility', 'hidden');
    }
    function show(node: SVGElement | null | undefined): void {
      node?.removeAttribute('visibility');
    }

    async function animate(next: UnrollScene, handles: Handles, mine: number): Promise<void> {
      const step = next.step;
      const { base } = next;
      const sym = base.symbols;
      const n = base.xs.length;
      const L = layoutFor(n);
      const motion = handles.motion;

      if (step.kind === 'forward') {
        const i = step.t - 1;
        const cx = at(L.cellXs, i, 'cellXs');
        const hPrev = i === 0 ? base.h0 : known(next.hs[i - 1], `h${i}`);
        const fromX = i === 0 ? LEFT_COL_X : at(L.cellXs, i - 1, 'cellXs');
        const x = at(base.xs, i, 'xs');
        hide(handles.hValues[i]);
        const hText = i === 0 ? formatGiven(hPrev) : formatValue(hPrev);
        const hChip = chip(motion, 0, 0, 44, 20, hText, lookForward());
        const xChip = chip(motion, 0, 0, 36, 20, formatGiven(x), lookForward());
        await tween(FORWARD_MS, mine, (p) => {
          const e = ease(p);
          hChip.setAttribute('transform', `translate(${round(lerp(fromX, cx - 14, e))} ${CELL_MID - 18})`);
          xChip.setAttribute('transform', `translate(${cx + 14} ${round(lerp(INPUT_TEXT_Y - 4, CELL_MID + 14, e))})`);
        });
        return;
      }

      if (step.kind === 'loss') {
        if (!next.loss) throw new Error('unroll-then-backprop 무대: 손실 걸음인데 손실이 없다');
        const lastH = known(next.hs[n - 1], `h${n}`);
        const fromX = at(L.cellXs, n - 1, 'cellXs');
        hide(handles.lossValue);
        hide(handles.lossPill);
        const hChip = chip(motion, 0, 0, 44, 20, formatValue(lastH), lookForward());
        const yChip = chip(motion, 0, 0, 40, 20, formatGiven(base.y), lookForward());
        await tween(LOSS_MS, mine, (p) => {
          const e = ease(p);
          hChip.setAttribute('transform', `translate(${round(lerp(fromX, L.lossX, e))} ${CELL_MID})`);
          yChip.setAttribute('transform', `translate(${L.lossX} ${round(lerp(INPUT_TEXT_Y - 4, CELL_MID + 10, e))})`);
        });
        return;
      }

      if (step.kind === 'backward') {
        const entry = at(next.back, step.slot, 'back');
        const i = entry.t - 1;
        const cx = at(L.cellXs, i, 'cellXs');
        const fromX = i === n - 1 ? L.lossX : at(L.cellXs, i + 1, 'cellXs');
        const rows = handles.backRows.get(entry.t);
        if (!rows) throw new Error(`unroll-then-backprop 무대: 걸음 ${entry.t} 의 뒤로 줄이 그려지지 않았다`);
        const slot = at(handles.slotValues, step.slot, 'slotValues');
        if (!slot) throw new Error(`unroll-then-backprop 무대: 기울기 칸 ${step.slot} 이 비어 있다`);
        const slotX = at(L.slotXs, step.slot, 'slotXs');
        const slotY = BOX_TOP + 46;
        hide(rows.pill);
        hide(rows.rowD);
        hide(rows.rowShare);
        hide(slot);
        // 합 자리는 몫이 닿기 전까지 보태기 전의 합을 보인다
        const sumText = handles.sumValue.querySelector('text');
        const sumRect = handles.sumValue.querySelector('rect');
        if (!sumText || !sumRect) throw new Error('unroll-then-backprop 무대: 합 자리가 그려지지 않았다');
        sumText.textContent = formatValue(step.before);
        sumRect.setAttribute('fill', colors.bg);
        sumText.setAttribute('fill', colors.text);
        const pill = chip(motion, 0, 0, L.pillW, PILL_H, `${sym.delta}${entry.t} ${formatValue(entry.delta)}`, lookBack());
        await tween(BACK_SLIDE_MS, mine, (p) => {
          pill.setAttribute('transform', `translate(${round(lerp(fromX, cx, ease(p)))} ${LANE_Y})`);
        });
        if (destroyed || mine !== gen) return;
        show(rows.pill);
        show(rows.rowD);
        show(rows.rowShare);
        pill.remove();
        const share = chip(motion, 0, 0, SLOT_W - 4, SLOT_H, formatValue(entry.share), lookShare());
        await tween(BACK_FLY_MS, mine, (p) => {
          const e = ease(p);
          const x = lerp(cx, slotX, e);
          // 몫은 곧게 오르지 않고 셀 위로 솟았다가 칸에 앉는다
          const y = lerp(ROW_SHARE_Y - 4, slotY, e) - Math.sin(Math.PI * e) * 18;
          share.setAttribute('transform', `translate(${round(x)} ${round(y)})`);
        });
        if (!destroyed && mine === gen) sumText.textContent = formatValue(next.sum);
      }
    }

    const renderer: SceneRenderer<UnrollScene> & ViewInstance = {
      render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        if (!opts.animate || next.step.kind === 'start') return;
        return animate(next, handles, mine).then(() => {
          if (destroyed || mine !== gen) return;
          drawStatic(next);
        });
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
