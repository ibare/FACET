/**
 * simd-stage — 한꺼번에 밀고, 꼬리는 기어간다.
 *
 * 위: a · b · c 세 줄의 원소 열여덟. 그 뒤에 **묶음 띠**가 깔린다 — 띠 하나가 덧셈 명령
 * 하나이고, 폭이 차선 수만큼이다. 꼬리의 띠는 폭이 한 칸이다. 차선을 돌리면 띠가 늘어나
 * 이웃과 합쳐지고, 끝에 한 칸짜리 꼬리 띠가 자라 나온다.
 *
 * 재생 중에는 **레지스터 틀**이 띠를 따라 옮겨 간다. 묶음에서는 w 칸 폭으로 한 번에
 * 건너뛰며 w 개의 합이 함께 c 로 떨어지고, 꼬리에서는 틀이 한 칸으로 줄어 하나씩 기어간다.
 *
 * 아래: 시간 줄. 칸 하나가 덧셈 명령 하나다 — 위의 띠 j 가 아래 칸 j 가 된다. 공간에서
 * w 칸이던 것이 시간에서는 한 칸이다. 차선을 넓히면 줄이 짧아진다. 점선은 차선 하나일 때의
 * 길이(열여덟)다.
 *
 * 움직임은 스스로 그리는 tween(rAF) 이다. 되짚는 중(`isInstant`)이면 끝 값으로 건너뛴다.
 */

import {
  categorical,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 740;
const H = 280;
/** 원소 열의 왼쪽 끝 (그 왼쪽은 줄 이름). */
const X0 = 84;
/** 원소 한 칸의 간격과 폭. */
const PITCH = 36;
const CELL = 32;
/** 자리를 미리 잡아 두는 원소 수의 상한 — 데이터가 이보다 길면 잘린다. */
const MAX_N = 18;

const Y_CAPTION = 22;
const Y_A = 50;
const Y_B = 86;
const Y_C = 144;
const ROW_H = 30;
const BAND_TOP = 42;
const BAND_H = Y_C + ROW_H + 8 - BAND_TOP;
const Y_SLOT = 208;
const SLOT_H = 24;
const Y_READOUT = 256;

/** tween 한 번의 길이 (ms). */
const DUR = 300;

/** 띠 · 칸의 두 종류 — 묶음과 꼬리. categorical 시드에서 인덱스로 고른다. */
const KIND_PACK = 0;
const KIND_TAIL = 1;

export type SimdStage = {
  setCaption(text: string): void;
  setReadout(text: string): void;
  /** 한 판의 배치 — 띠와 시간 줄을 새 차선에 맞춰 옮긴다. */
  layout(lanes: number, packs: number, tail: number, ops: number): void;
  /** 묶음 덧셈 하나 — c[start..start+width) 를 한꺼번에 채운다. */
  packAdd(start: number, width: number, sums: number[], op: number): void;
  /** 꼬리 덧셈 하나 — c[index] 하나를 채운다. */
  tailAdd(index: number, sum: number, op: number): void;
  /** 판의 끝 — 틀을 거둔다. */
  finish(): void;
  /** 처음 모습으로. */
  clear(): void;
};

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

function numbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is number => typeof x === 'number');
}

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

export const simdStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const kindColor = categorical(2, 'vivid');

    const init = params.initialData ?? {};
    const a = numbers(init['a']).slice(0, MAX_N);
    const b = numbers(init['b']).slice(0, MAX_N);
    const n = Math.min(a.length, b.length);

    const cellX = (i: number): number => X0 + i * PITCH;

    // ── tween
    type Tween = { from: number[]; to: number[]; t0: number; apply: (v: number[]) => void };
    const values = new Map<Element, number[]>();
    const tweens = new Map<Element, Tween>();
    let frame: number | null = null;
    let destroyed = false;
    const canAnimate = typeof requestAnimationFrame === 'function';
    const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const tick = (): void => {
      frame = null;
      if (destroyed) return;
      const t = now();
      for (const [key, tw] of tweens) {
        const p = Math.min(1, (t - tw.t0) / DUR);
        const e = ease(p);
        const v = tw.from.map((f, i) => f + ((tw.to[i] ?? f) - f) * e);
        tw.apply(v);
        values.set(key, v);
        if (p >= 1) tweens.delete(key);
      }
      if (tweens.size > 0) frame = requestAnimationFrame(tick);
    };

    const settle = (): void => {
      for (const [key, tw] of tweens) {
        tw.apply(tw.to);
        values.set(key, tw.to);
      }
      tweens.clear();
      if (frame !== null && canAnimate) cancelAnimationFrame(frame);
      frame = null;
    };

    /** key 의 값들을 to 로 옮긴다. 처음 보는 key 는 곧장 놓는다. */
    const animate = (key: Element, to: number[], apply: (v: number[]) => void, from?: number[]): void => {
      const start = from ?? values.get(key);
      if (start === undefined || destroyed || isInstant() || !canAnimate) {
        tweens.delete(key);
        apply(to);
        values.set(key, to);
        return;
      }
      tweens.set(key, { from: start, to, t0: now(), apply });
      if (frame === null) frame = requestAnimationFrame(tick);
    };

    params.onScrubStart?.(settle);

    // ── 뼈대
    const bandLayer = el('g', {}, svg);
    const cellLayer = el('g', {}, svg);
    const frameLayer = el('g', {}, svg);
    const timeLayer = el('g', {}, svg);

    const caption = el(
      'text',
      { x: X0 - 4, y: Y_CAPTION, 'font-family': fonts.body, 'font-size': 14, fill: palette.text },
      svg,
    );

    const rowLabel = (y: number, text: string): void => {
      const t = el(
        'text',
        {
          x: X0 - 12,
          y: y + ROW_H / 2 + 4,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': 12,
          fill: palette.textMuted,
        },
        cellLayer,
      );
      t.textContent = text;
    };
    rowLabel(Y_A, tr('label.a', 'a'));
    rowLabel(Y_B, tr('label.b', 'b'));
    rowLabel(Y_SLOT - 3, tr('label.time', 'adds'));
    rowLabel(Y_C, tr('label.c', 'c = a + b'));

    // 묶음 띠 — 명령 하나에 하나. 가장 많을 때(차선 하나) 열여덟.
    const bands: SVGRectElement[] = [];
    for (let j = 0; j < MAX_N; j += 1) {
      bands.push(
        el(
          'rect',
          {
            x: cellX(MAX_N) - 2,
            y: BAND_TOP,
            width: 0,
            height: BAND_H,
            rx: 5,
            fill: kindColor[KIND_PACK]!,
            'fill-opacity': 0.14,
            stroke: kindColor[KIND_PACK]!,
            'stroke-width': 1.2,
          },
          bandLayer,
        ),
      );
    }

    // 원소 칸.
    const cellRect = (i: number, y: number): SVGRectElement =>
      el(
        'rect',
        {
          x: cellX(i),
          y,
          width: CELL,
          height: ROW_H,
          rx: 3,
          fill: palette.bg,
          stroke: palette.border,
        },
        cellLayer,
      );
    const cellText = (i: number, y: number, text: string): SVGTextElement => {
      const t = el(
        'text',
        {
          x: cellX(i) + CELL / 2,
          y: y + ROW_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': 12,
          fill: palette.text,
        },
        cellLayer,
      );
      t.textContent = text;
      return t;
    };
    const cTexts: SVGTextElement[] = [];
    for (let i = 0; i < n; i += 1) {
      cellRect(i, Y_A);
      cellText(i, Y_A, String(a[i]));
      cellRect(i, Y_B);
      cellText(i, Y_B, String(b[i]));
      cellRect(i, Y_C);
      cTexts.push(cellText(i, Y_C, ''));
    }

    // 레지스터 틀 — 띠를 따라 옮겨 다닌다.
    const lane = el(
      'rect',
      {
        x: cellX(0) - 4,
        y: BAND_TOP - 4,
        width: PITCH + 4,
        height: BAND_H + 8,
        rx: 7,
        fill: 'none',
        stroke: palette.text,
        'stroke-width': 2.5,
        opacity: 0,
      },
      frameLayer,
    );

    // 시간 줄 — 점선은 차선 하나일 때의 길이.
    el(
      'rect',
      {
        x: cellX(0) - 3,
        y: Y_SLOT - 3,
        width: n * PITCH + 2,
        height: SLOT_H + 6,
        rx: 5,
        fill: 'none',
        stroke: palette.ghostOutline,
        'stroke-dasharray': '4 3',
      },
      timeLayer,
    );
    const ghostLabel = el(
      'text',
      {
        x: cellX(n) - 4,
        y: Y_READOUT,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': 12,
        fill: palette.textMuted,
      },
      timeLayer,
    );
    ghostLabel.textContent = tr('label.scalar', 'one lane: {n}', { n });

    const slots: SVGRectElement[] = [];
    const slotTexts: SVGTextElement[] = [];
    for (let j = 0; j < MAX_N; j += 1) {
      slots.push(
        el(
          'rect',
          {
            x: cellX(j),
            y: Y_SLOT,
            width: 0,
            height: SLOT_H,
            rx: 3,
            fill: kindColor[KIND_PACK]!,
            'fill-opacity': 0,
            stroke: kindColor[KIND_PACK]!,
            'stroke-width': 1.2,
          },
          timeLayer,
        ),
      );
      const t = el(
        'text',
        {
          x: cellX(j) + CELL / 2,
          y: Y_SLOT + SLOT_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': 11,
          fill: palette.text,
        },
        timeLayer,
      );
      slotTexts.push(t);
    }
    // 시간 줄의 끝 — 명령 수만큼의 자리.
    const endMark = el(
      'line',
      {
        x1: cellX(n) - 2,
        x2: cellX(n) - 2,
        y1: Y_SLOT - 8,
        y2: Y_SLOT + SLOT_H + 8,
        stroke: palette.text,
        'stroke-width': 2,
      },
      timeLayer,
    );

    const readout = el(
      'text',
      { x: X0, y: Y_READOUT, 'font-family': fonts.body, 'font-size': 12, fill: palette.text },
      timeLayer,
    );

    // ── 지금 판의 배치
    let cur = { lanes: 1, packs: 0, tail: 0, ops: 0 };
    /** 띠 j 가 덮는 원소 [시작, 개수]. */
    const bandSpan = (j: number): [number, number] => {
      if (j < cur.packs) return [j * cur.lanes, cur.lanes];
      if (j < cur.packs + cur.tail) return [cur.packs * cur.lanes + (j - cur.packs), 1];
      return [n, 0];
    };

    const placeBand = (j: number): void => {
      const band = bands[j]!;
      const [start, count] = bandSpan(j);
      const kind = j < cur.packs ? KIND_PACK : KIND_TAIL;
      band.setAttribute('fill', kindColor[kind]!);
      band.setAttribute('stroke', kindColor[kind]!);
      band.setAttribute('stroke-dasharray', kind === KIND_TAIL ? '3 2' : '');
      const x = cellX(start) - 2;
      const w = Math.max(0, count * PITCH - 0.5);
      animate(band, [x, w], ([bx, bw]) => {
        band.setAttribute('x', String(bx));
        band.setAttribute('width', String(Math.max(0, bw ?? 0)));
      });
    };

    const placeSlot = (j: number): void => {
      const slot = slots[j]!;
      const kind = j < cur.packs ? KIND_PACK : KIND_TAIL;
      slot.setAttribute('fill', kindColor[kind]!);
      slot.setAttribute('stroke', kindColor[kind]!);
      slot.setAttribute('stroke-dasharray', kind === KIND_TAIL ? '3 2' : '');
      slot.setAttribute('fill-opacity', '0');
      slotTexts[j]!.textContent = '';
      const w = j < cur.ops ? CELL : 0;
      animate(slot, [w], ([sw]) => slot.setAttribute('width', String(Math.max(0, sw ?? 0))));
    };

    const moveLane = (start: number, count: number): void => {
      lane.setAttribute('opacity', '1');
      animate(lane, [cellX(start) - 4, count * PITCH + 4], ([lx, lw]) => {
        lane.setAttribute('x', String(lx));
        lane.setAttribute('width', String(lw));
      });
    };

    /** c[i] 에 합을 놓고, b 줄 높이에서 c 줄로 떨어뜨린다. */
    const drop = (i: number, sum: number): void => {
      const t = cTexts[i];
      if (!t) return;
      t.textContent = String(sum);
      const base = Y_C + ROW_H / 2 + 4;
      animate(
        t,
        [base],
        ([y]) => t.setAttribute('y', String(y)),
        [Y_B + ROW_H / 2 + 4],
      );
    };

    const fillSlot = (op: number, width: number): void => {
      const slot = slots[op];
      if (!slot) return;
      slot.setAttribute('fill-opacity', '0.55');
      slotTexts[op]!.textContent = String(width);
    };

    const layout = (lanes: number, packs: number, tail: number, ops: number): void => {
      cur = { lanes, packs, tail, ops };
      for (let j = 0; j < MAX_N; j += 1) {
        placeBand(j);
        placeSlot(j);
      }
      for (const t of cTexts) t.textContent = '';
      lane.setAttribute('opacity', '0');
      const endX = cellX(Math.min(ops, MAX_N)) - 2;
      animate(endMark, [endX], ([x]) => {
        endMark.setAttribute('x1', String(x));
        endMark.setAttribute('x2', String(x));
      });
    };

    // 처음 모습 — 띠도 칸도 접혀 있다. 곧장 놓아 기준값을 잡는다.
    const rest = (): void => {
      cur = { lanes: 1, packs: 0, tail: 0, ops: 0 };
      settle();
      for (let j = 0; j < MAX_N; j += 1) {
        const band = bands[j]!;
        band.setAttribute('x', String(cellX(n) - 2));
        band.setAttribute('width', '0');
        values.set(band, [cellX(n) - 2, 0]);
        const slot = slots[j]!;
        slot.setAttribute('width', '0');
        slot.setAttribute('fill-opacity', '0');
        values.set(slot, [0]);
        slotTexts[j]!.textContent = '';
      }
      for (const t of cTexts) t.textContent = '';
      lane.setAttribute('opacity', '0');
      values.delete(lane);
      endMark.setAttribute('x1', String(cellX(n) - 2));
      endMark.setAttribute('x2', String(cellX(n) - 2));
      values.set(endMark, [cellX(n) - 2]);
      readout.textContent = '';
    };
    rest();
    caption.textContent = tr('caption.idle', 'c = a + b over {n} elements', { n });

    const stage: SimdStage = {
      setCaption(text) {
        caption.textContent = text;
      },
      setReadout(text) {
        readout.textContent = text;
      },
      layout,
      packAdd(start, width, sums, op) {
        moveLane(start, width);
        sums.forEach((s, k) => drop(start + k, s));
        fillSlot(op, width);
      },
      tailAdd(index, sum, op) {
        moveLane(index, 1);
        drop(index, sum);
        fillSlot(op, 1);
      },
      finish() {
        lane.setAttribute('opacity', '0');
      },
      clear() {
        rest();
      },
    };

    return {
      ...stage,
      destroy() {
        destroyed = true;
        tweens.clear();
        if (frame !== null && canAnimate) cancelAnimationFrame(frame);
        frame = null;
      },
    };
  },
};
