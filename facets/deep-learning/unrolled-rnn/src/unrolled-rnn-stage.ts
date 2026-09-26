/**
 * 펼친 RNN 무대 — 셀 여덟을 가로로 펼쳐 두고 앞으로 한 번, 뒤로 한 번 지나간다.
 *
 *   위    흔적 띠 — 첫 입력의 흔적 s_t 가 셀에서 셀로 **건너가며** 줄어든다 (높이 ∝ |s_t|)
 *   가운데 펼친 셀 · 셀 사이의 같은 w_h 화살표 · 곱한 몫 · 입력 x
 *   아래  ∂h_T/∂h_k 막대 — 끝에서 **거슬러 가며** 줄어든다. 걸음마다 몫 d·x 한 조각이 오른쪽
 *         w_x 기울기 칸으로 날아가 모인 합이 된다
 *   끝    먼 절반의 자리를 덮고, 앞으로 잰 흔적과 뒤로 닿은 기울기를 두 막대로 나란히
 *
 * 무대는 셈하지 않는다 — 모든 수 · 먼 절반의 셀 수는 payload 로 받는다. 자르는 것(표시)만 한다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type UnrolledInit = { xs: number[]; wx: number; b: number; h0: number; wh: number; steps: number; sum: number };
export type UnrolledForward = {
  tIndex: number;
  x: number;
  a: number;
  h: number;
  trace: number;
  mult: number | null;
  left: number;
};
export type UnrolledBackward = {
  k: number;
  x: number;
  reach: number;
  slope: number;
  d: number;
  contrib: number;
  sum: number;
};
export type UnrolledFarShare = {
  forwardTrace: number;
  backwardTrace: number;
  reachFirst: number;
  share: number;
  farCount: number;
  sum: number;
};

/** projector 가 부르는 무대의 표면. */
export type UnrolledRnnStage = {
  init(p: UnrolledInit): void;
  forward(p: UnrolledForward, durMs: number): void;
  backward(p: UnrolledBackward, durMs: number): void;
  farShare(p: UnrolledFarShare, durMs: number): void;
};

const W = 760;
const H = 400;

// 가로 자리
const LABEL_X = 6;
const H0_X = 125;
const FIRST_X = 188;
const SPAN = 448; // 첫 셀 가운데에서 끝 셀 가운데까지
const BOX_W = 46;
const GAUGE_X = 718;

// 세로 자리
const CAPTION_Y = 18;
const TRACE_LABEL_Y = 38;
const TRACE_BASE = 104;
const BAND_MAX = 58;
const TRACE_TEXT_Y = 118;
const BOX_TOP = 130;
const BOX_H = 50;
const ARROW_Y = 158;
const MULT_Y = 198;
const INPUT_Y = 224;
const REACH_LABEL_Y = 290;
const TOKEN_BACK_Y = 250;
const REACH_BASE = 314;
const REACH_TEXT_Y = 328;
const SHADE_TOP = 238;
const SHADE_BOTTOM = 334;
const FAR_LABEL_Y = 348;
const GAUGE_ZERO = 284;
const GAUGE_SCALE = 200; // 기울기 1 당 픽셀
const GAUGE_HALF = 42;
const SUM_TEXT_Y = 342;
const CMP_Y = [362, 380];
const CMP_SCALE = 420;
const BAND_W = 30;
const PIECE_W = 14;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 표시 규칙 — toFixed(d), 0 이 되는 음수는 부호를 떼고, 음수 부호는 U+2212. */
function fx(v: number, d: number): string {
  if (!Number.isFinite(v)) throw new Error(`[unrolled-rnn-stage] 띄울 수가 유한하지 않다: ${String(v)}`);
  const s = v.toFixed(d);
  const plain = Number(s) === 0 ? s.replace('-', '') : s;
  return plain.replace('-', '−');
}

/** 데이터 값은 적힌 모양 그대로 (0.2 · −0.2 · 0.6). */
function raw(v: number): string {
  return String(v).replace('-', '−');
}

type Cell = {
  box: SVGRectElement;
  hText: SVGTextElement;
  band: SVGRectElement;
  traceText: SVGTextElement;
  multText: SVGTextElement;
  inputText: SVGTextElement;
  reach: SVGRectElement;
  reachText: SVGTextElement;
};

export const unrolledRnnStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const frames = new Set<number>();
    const finishers = new Set<() => void>();
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
    const text = (
      x: number,
      y: number,
      parent: Element,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement =>
      el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.xs,
          fill: opts.fill ?? c.text,
          'text-anchor': opts.anchor ?? 'middle',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );

    /** 시간에 걸친 운동 — 되짚는 중이거나 길이가 0 이면 끝 상태로 건너뛴다. */
    const tween = (durMs: number, draw: (p: number) => void): void => {
      if (destroyed) return;
      const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
      if (isInstant() || durMs <= 0 || raf === null) {
        draw(1);
        return;
      }
      const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const finish = (): void => draw(1);
      finishers.add(finish);
      const frame = (now: number): void => {
        if (destroyed) return;
        const p = Math.min(1, (now - start) / durMs);
        const eased = 1 - (1 - p) * (1 - p);
        draw(eased);
        if (p < 1) {
          const id = raf(frame);
          frames.add(id);
        } else {
          finishers.delete(finish);
        }
      };
      const id = raf(frame);
      frames.add(id);
    };
    /** 걸려 있던 운동을 끝 상태로 마치고 거둔다 — 다음 걸음이 앞 운동과 겹치지 않게. */
    const settle = (): void => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      const pending = [...finishers];
      finishers.clear();
      for (const f of pending) f();
    };
    params.onScrubStart?.(settle);

    const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

    // ── 늘 있는 층 ─────────────────────────────────────────────
    const root = el('g', {}, svg);
    const shadeLayer = el('g', {}, root);
    const staticLayer = el('g', {}, root);
    const cellLayer = el('g', {}, root);
    const moveLayer = el('g', {}, root);

    const caption = text(W / 2, CAPTION_Y, root, { size: fontSizes.sm });

    // ── 판마다 갈아 끼우는 것 ──────────────────────────────────
    let steps = 0;
    let cells: Cell[] = [];
    let cellX: number[] = [];
    let traceHeights: number[] = [];
    let reachHeights: number[] = [];
    let sumShown = 0;
    let lastForward: SVGRectElement | null = null;
    let lastBackward: SVGRectElement | null = null;

    let h0Text: SVGTextElement | null = null;
    let whText: SVGTextElement | null = null;
    let sumBar: SVGRectElement | null = null;
    let sumText: SVGTextElement | null = null;
    let piece: SVGRectElement | null = null;
    let fwdToken: SVGCircleElement | null = null;
    let backToken: SVGCircleElement | null = null;
    let shade: SVGRectElement | null = null;
    let farLabel: SVGTextElement | null = null;
    const cmpBars: SVGRectElement[] = [];
    const cmpTexts: SVGTextElement[] = [];
    const cmpLabels: SVGTextElement[] = [];

    const xOf = (k: number): number => {
      const x = cellX[k];
      if (x === undefined) throw new Error(`[unrolled-rnn-stage] 셀 ${k} 의 자리가 없다`);
      return x;
    };
    const cellOf = (k: number): Cell => {
      const cell = cells[k - 1];
      if (cell === undefined) throw new Error(`[unrolled-rnn-stage] 셀 ${k} 이 펼쳐지지 않았다`);
      return cell;
    };
    const bandHeight = (v: number): number => Math.min(1, Math.abs(v)) * BAND_MAX;
    const drawSum = (sum: number): void => {
      if (sumBar === null) throw new Error('[unrolled-rnn-stage] 기울기 칸이 없다');
      const hgt = Math.min(GAUGE_HALF, Math.abs(sum) * GAUGE_SCALE);
      sumBar.setAttribute('y', String(sum >= 0 ? GAUGE_ZERO - hgt : GAUGE_ZERO));
      sumBar.setAttribute('height', String(hgt));
    };

    /** 펼친 셀 여덟의 자리 — 셀 수가 바뀔 때만 새로 짓는다. */
    const build = (count: number): void => {
      for (const layer of [shadeLayer, staticLayer, cellLayer, moveLayer]) {
        while (layer.firstChild) layer.removeChild(layer.firstChild);
      }
      cmpBars.length = 0;
      cmpTexts.length = 0;
      cmpLabels.length = 0;
      steps = count;
      const pitch = count > 1 ? SPAN / (count - 1) : 0;
      cellX = [H0_X];
      for (let k = 1; k <= count; k += 1) cellX.push(FIRST_X + (k - 1) * pitch);

      // 줄 이름
      text(LABEL_X, TRACE_LABEL_Y, staticLayer, { anchor: 'start', fill: c.textMuted }).textContent = t(
        'label.trace',
        'Trace ∂h_t/∂x1',
      );
      text(LABEL_X, ARROW_Y + 4, staticLayer, { anchor: 'start', fill: c.textMuted }).textContent = t(
        'label.hidden',
        'Hidden state h',
      );
      text(LABEL_X, MULT_Y, staticLayer, { anchor: 'start', fill: c.textMuted }).textContent = t(
        'label.mult',
        'Multiplied share',
      );
      text(LABEL_X, INPUT_Y, staticLayer, { anchor: 'start', fill: c.textMuted }).textContent = t(
        'label.input',
        'Input x',
      );
      text(LABEL_X, REACH_LABEL_Y, staticLayer, { anchor: 'start', fill: c.textMuted }).textContent = t(
        'label.reach',
        'Gradient ∂h{T}/∂h_k',
        { T: count },
      );
      text(GAUGE_X, SHADE_TOP, staticLayer, { fill: c.textMuted }).textContent = t('label.sum', 'w_x gradient');

      // 흔적 · 막대의 바닥선
      el('line', { x1: FIRST_X - BOX_W, x2: xOf(count) + BOX_W / 2, y1: TRACE_BASE, y2: TRACE_BASE, stroke: c.border }, staticLayer);
      el('line', { x1: FIRST_X - BOX_W, x2: xOf(count) + BOX_W / 2, y1: REACH_BASE, y2: REACH_BASE, stroke: c.border }, staticLayer);

      // h0 자리
      el('rect', { x: H0_X - BOX_W / 2, y: BOX_TOP, width: BOX_W, height: BOX_H, rx: 6, fill: c.bgSubtle, stroke: c.border, 'stroke-dasharray': '4 3' }, cellLayer);
      text(H0_X, BOX_TOP + 14, cellLayer, { fill: c.textMuted }).textContent = 'h0';
      h0Text = text(H0_X, BOX_TOP + 34, cellLayer, { size: fontSizes.md, mono: true });

      cells = [];
      for (let k = 1; k <= count; k += 1) {
        const x = xOf(k);
        const prevX = xOf(k - 1);
        // 셀 사이 화살표 — 모두 같은 w_h (h0 위의 표지 하나가 가리킨다)
        const fromX = prevX + BOX_W / 2;
        const toX = x - BOX_W / 2;
        el('line', { x1: fromX, x2: toX - 4, y1: ARROW_Y, y2: ARROW_Y, stroke: c.textMuted, 'stroke-width': 1.5 }, staticLayer);
        el('path', { d: `M ${toX} ${ARROW_Y} l -6 -4 l 0 8 z`, fill: c.textMuted }, staticLayer);
        // 입력 화살표
        el('line', { x1: x, x2: x, y1: INPUT_Y - 12, y2: BOX_TOP + BOX_H + 4, stroke: c.border, 'stroke-width': 1 }, staticLayer);

        const band = el('rect', { x: x - BAND_W / 2, y: TRACE_BASE, width: BAND_W, height: 0, rx: 2, fill: c.itemActive }, cellLayer);
        const reach = el('rect', { x: x - BAND_W / 2, y: REACH_BASE, width: BAND_W, height: 0, rx: 2, fill: c.accent, stroke: c.text, 'stroke-width': 0.6 }, cellLayer);
        const box = el('rect', { x: x - BOX_W / 2, y: BOX_TOP, width: BOX_W, height: BOX_H, rx: 6, fill: c.itemDefault, stroke: c.border, 'stroke-width': 1 }, cellLayer);
        text(x, BOX_TOP + 12, cellLayer, { fill: c.textMuted }).textContent = `t${k}`;
        const hText = text(x, BOX_TOP + 34, cellLayer, { size: fontSizes.sm, mono: true });
        const traceText = text(x, TRACE_TEXT_Y, cellLayer, { mono: true });
        const multText = text((fromX + toX) / 2, MULT_Y, cellLayer, { mono: true });
        const inputText = text(x, INPUT_Y, cellLayer, { mono: true });
        const reachText = text(x, REACH_TEXT_Y, cellLayer, { mono: true });
        cells.push({ box, hText, band, traceText, multText, inputText, reach, reachText });
      }

      // w_x 기울기 칸
      el('rect', { x: GAUGE_X - 18, y: GAUGE_ZERO - GAUGE_HALF, width: 36, height: GAUGE_HALF * 2, fill: c.bgSubtle, stroke: c.border }, staticLayer);
      el('line', { x1: GAUGE_X - 22, x2: GAUGE_X + 22, y1: GAUGE_ZERO, y2: GAUGE_ZERO, stroke: c.textMuted }, staticLayer);
      sumBar = el('rect', { x: GAUGE_X - 10, y: GAUGE_ZERO, width: 20, height: 0, fill: c.itemSorted }, cellLayer);
      sumText = text(GAUGE_X, SUM_TEXT_Y, cellLayer, { mono: true });

      shade = el('rect', { x: 0, y: SHADE_TOP, width: 0, height: SHADE_BOTTOM - SHADE_TOP, rx: 6, fill: c.bgSubtle, stroke: c.textMuted, 'stroke-dasharray': '5 4' }, shadeLayer);
      farLabel = text(0, FAR_LABEL_Y, shadeLayer, { anchor: 'start', fill: c.text });

      for (let i = 0; i < 2; i += 1) {
        const y = CMP_Y[i]!;
        cmpLabels.push(text(LABEL_X, y + 9, staticLayer, { anchor: 'start', fill: c.textMuted }));
        cmpBars.push(el('rect', { x: FIRST_X - BOX_W / 2, y, width: 0, height: 11, rx: 2, fill: i === 0 ? c.itemActive : c.accent, stroke: i === 0 ? 'none' : c.text, 'stroke-width': 0.6 }, cellLayer));
        cmpTexts.push(text(FIRST_X - BOX_W / 2, y + 10, cellLayer, { anchor: 'start', mono: true }));
      }

      piece = el('rect', { x: 0, y: 0, width: PIECE_W, height: 0, fill: c.accent, stroke: c.text, 'stroke-width': 0.6, visibility: 'hidden' }, moveLayer);
      fwdToken = el('circle', { cx: H0_X, cy: BOX_TOP, r: 6, fill: c.itemActive, stroke: c.text, 'stroke-width': 1, visibility: 'hidden' }, moveLayer);
      backToken = el('circle', { cx: H0_X, cy: TOKEN_BACK_Y, r: 6, fill: c.accent, stroke: c.text, 'stroke-width': 1, visibility: 'hidden' }, moveLayer);
    };

    const mark = (box: SVGRectElement | null, stroke: string, width: number): void => {
      if (box === null) return;
      box.setAttribute('stroke', stroke);
      box.setAttribute('stroke-width', String(width));
    };

    const stage: UnrolledRnnStage = {
      init(p) {
        settle();
        if (p.steps !== steps || cells.length === 0) build(p.steps);
        if (p.xs.length !== steps) throw new Error('[unrolled-rnn-stage] 입력 수와 셀 수가 다르다');
        traceHeights = new Array<number>(steps + 1).fill(0);
        reachHeights = new Array<number>(steps + 2).fill(0);
        lastForward = null;
        lastBackward = null;
        // 결론은 걷고 자리만 남긴다
        for (let k = 1; k <= steps; k += 1) {
          const cell = cellOf(k);
          mark(cell.box, c.border, 1);
          cell.hText.textContent = '';
          cell.traceText.textContent = '';
          cell.multText.textContent = '';
          cell.reachText.textContent = '';
          cell.inputText.textContent = `x ${raw(p.xs[k - 1]!)}`;
          cell.band.setAttribute('height', '0');
          cell.band.setAttribute('y', String(TRACE_BASE));
          cell.band.setAttribute('x', String(xOf(k) - BAND_W / 2));
          cell.reach.setAttribute('height', '0');
          cell.reach.setAttribute('y', String(REACH_BASE));
          cell.reach.setAttribute('x', String(xOf(k) - BAND_W / 2));
        }
        if (h0Text === null || sumText === null || shade === null || farLabel === null) {
          throw new Error('[unrolled-rnn-stage] 무대가 지어지지 않았다');
        }
        h0Text.textContent = fx(p.h0, 2);
        sumShown = p.sum;
        drawSum(p.sum);
        sumText.textContent = fx(p.sum, 3);
        shade.setAttribute('width', '0');
        farLabel.textContent = '';
        for (const bar of cmpBars) bar.setAttribute('width', '0');
        for (const label of cmpTexts) label.textContent = '';
        for (const label of cmpLabels) label.textContent = '';
        piece?.setAttribute('visibility', 'hidden');
        fwdToken?.setAttribute('visibility', 'hidden');
        backToken?.setAttribute('visibility', 'hidden');
        if (whText === null) whText = text(H0_X, BOX_TOP - 8, cellLayer, { fill: c.textMuted, mono: true });
        whText.textContent = `w_h ${raw(p.wh)}`;
        caption.textContent = t('caption.ready', 'Unrolled cells: {steps} · h0: {h0} · w_h: {wh}', {
          steps: p.steps,
          h0: fx(p.h0, 2),
          wh: raw(p.wh),
        });
      },

      forward(p, durMs) {
        settle();
        const k = p.tIndex;
        const cell = cellOf(k);
        mark(lastForward, c.border, 1);
        mark(cell.box, c.itemActive, 2.5);
        lastForward = cell.box;
        cell.hText.textContent = fx(p.h, 2);
        cell.traceText.textContent = fx(p.trace, 3);
        if (p.mult !== null) cell.multText.textContent = `×${fx(p.mult, 2)}`;

        const fromX = xOf(k - 1);
        const toX = xOf(k);
        const fromH = traceHeights[k - 1]!;
        const toH = bandHeight(p.trace);
        traceHeights[k] = toH;
        const band = cell.band;
        const token = fwdToken;
        if (token === null) throw new Error('[unrolled-rnn-stage] h 표식이 없다');
        token.setAttribute('visibility', 'visible');
        // h 가 셀에서 셀로 건너가고, 흔적 띠가 옮겨 가며 줄어든다
        tween(durMs, (q) => {
          const x = lerp(fromX, toX, q);
          const hgt = lerp(fromH, toH, q);
          band.setAttribute('x', String(x - BAND_W / 2));
          band.setAttribute('y', String(TRACE_BASE - hgt));
          band.setAttribute('height', String(hgt));
          token.setAttribute('cx', String(x));
        });
        caption.textContent =
          p.mult === null
            ? t('caption.forwardFirst', 'Forward t{step} · x: {x} · a: {a} · h: {h} · trace: {trace}', {
                step: k,
                x: raw(p.x),
                a: fx(p.a, 2),
                h: fx(p.h, 2),
                trace: fx(p.trace, 3),
              })
            : t('caption.forward', 'Forward t{step} · x: {x} · a: {a} · h: {h} · multiplied share: {mult} · trace: {trace}', {
                step: k,
                x: raw(p.x),
                a: fx(p.a, 2),
                h: fx(p.h, 2),
                mult: fx(p.mult, 2),
                trace: fx(p.trace, 3),
              });
      },

      backward(p, durMs) {
        settle();
        const k = p.k;
        const cell = cellOf(k);
        mark(lastForward, c.border, 1);
        lastForward = null;
        mark(lastBackward, c.border, 1);
        mark(cell.box, c.text, 2.5);
        lastBackward = cell.box;
        fwdToken?.setAttribute('visibility', 'hidden');
        cell.reachText.textContent = fx(p.reach, 3);

        const start = k === steps ? k : k + 1;
        const fromX = xOf(start);
        const toX = xOf(k);
        const fromH = reachHeights[k + 1]!;
        const toH = bandHeight(p.reach);
        reachHeights[k] = toH;
        const bar = cell.reach;
        const token = backToken;
        const chip = piece;
        if (token === null || chip === null) throw new Error('[unrolled-rnn-stage] 기울기 표식이 없다');
        token.setAttribute('visibility', 'visible');

        // 몫 한 조각이 셀 k 에서 w_x 기울기 칸으로 날아가 모인 합 위에 얹힌다
        const chipH = Math.min(GAUGE_HALF, Math.abs(p.contrib) * GAUGE_SCALE);
        const before = sumShown;
        const landTop =
          p.contrib >= 0
            ? GAUGE_ZERO - before * GAUGE_SCALE - chipH
            : GAUGE_ZERO - before * GAUGE_SCALE;
        const chipFromY = REACH_BASE - chipH;
        const chipToY = Math.max(GAUGE_ZERO - GAUGE_HALF - chipH, Math.min(GAUGE_ZERO + GAUGE_HALF, landTop));
        chip.setAttribute('height', String(chipH));
        chip.setAttribute('visibility', 'visible');
        const sumLabel = sumText;
        if (sumLabel === null) throw new Error('[unrolled-rnn-stage] 모인 합 글자가 없다');
        const sum = p.sum;
        sumShown = sum;

        // 기울기가 셀에서 셀로 거슬러 가고, ∂h_T/∂h_k 막대가 옮겨 가며 줄어든다
        tween(durMs, (q) => {
          const x = lerp(fromX, toX, q);
          const hgt = lerp(fromH, toH, q);
          bar.setAttribute('x', String(x - BAND_W / 2));
          bar.setAttribute('y', String(REACH_BASE - hgt));
          bar.setAttribute('height', String(hgt));
          token.setAttribute('cx', String(x));
          chip.setAttribute('x', String(lerp(toX, GAUGE_X, q) - PIECE_W / 2));
          chip.setAttribute('y', String(lerp(chipFromY, chipToY, q)));
          if (q >= 1) {
            chip.setAttribute('visibility', 'hidden');
            drawSum(sum);
            sumLabel.textContent = fx(sum, 3);
          }
        });
        caption.textContent = t(
          'caption.backward',
          'Backward t{k} · ∂h{T}/∂h{k}: {reach} · 1 − h²: {slope} · d: {d} · share d·x: {contrib} · sum: {sum}',
          {
            k,
            T: steps,
            reach: fx(p.reach, 3),
            slope: fx(p.slope, 2),
            d: fx(p.d, 3),
            contrib: fx(p.contrib, 3),
            sum: fx(p.sum, 3),
          },
        );
      },

      farShare(p, durMs) {
        settle();
        mark(lastBackward, c.border, 1);
        lastBackward = null;
        backToken?.setAttribute('visibility', 'hidden');
        if (shade === null || farLabel === null) throw new Error('[unrolled-rnn-stage] 먼 절반 자리가 없다');
        if (p.farCount < 1 || p.farCount > steps) throw new Error(`[unrolled-rnn-stage] 먼 절반의 셀 수가 어긋난다: ${p.farCount}`);
        const left = xOf(1) - BOX_W / 2 - 4;
        const right = xOf(p.farCount) + BOX_W / 2 + 4;
        const region = shade;
        region.setAttribute('x', String(left));
        farLabel.setAttribute('x', String(left + 4));
        farLabel.textContent = t('label.farHalf', 'Far half: {share}', { share: fx(p.share, 2) });

        const values = [p.forwardTrace, p.backwardTrace];
        cmpLabels[0]!.textContent = t('label.forwardTrace', 'Forward trace s{T}', { T: steps });
        cmpLabels[1]!.textContent = t('label.backwardTrace', 'Reached back ∂h{T}/∂x1', { T: steps });
        const widths = values.map((v) => Math.min(1, Math.abs(v)) * CMP_SCALE);
        for (let i = 0; i < 2; i += 1) cmpTexts[i]!.textContent = fx(values[i]!, 3);
        const bars = [...cmpBars];
        const labels = [...cmpTexts];
        // 먼 절반의 자리가 끝에서부터 첫 셀 쪽으로 덮이고, 두 수가 자라 나란히 선다
        tween(durMs, (q) => {
          region.setAttribute('width', String((right - left) * q));
          region.setAttribute('x', String(right - (right - left) * q));
          for (let i = 0; i < 2; i += 1) {
            const w = widths[i]! * q;
            bars[i]!.setAttribute('width', String(w));
            labels[i]!.setAttribute('x', String(FIRST_X - BOX_W / 2 + w + 6));
          }
        });
        caption.textContent = t(
          'caption.end',
          'Forward trace s{T}: {fwd} · reached back ∂h{T}/∂x1: {bwd} · far-half share: {share}',
          { T: steps, fwd: fx(p.forwardTrace, 3), bwd: fx(p.backwardTrace, 3), share: fx(p.share, 2) },
        );
      },
    };

    return {
      ...stage,
      destroy() {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        finishers.clear();
        while (root.firstChild) root.removeChild(root.firstChild);
        root.remove();
      },
    };
  },
};
