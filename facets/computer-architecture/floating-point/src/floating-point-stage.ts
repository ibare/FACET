/**
 * floating-point-stage — 8비트 부동소수점 형식 한 벌을 한 폭에 그린다.
 *
 * 위에서 아래로 넷이다.
 *   1. 비트 띠     여덟 칸을 부호 · 지수 · 가수 세 무리로 칠한다.
 *   2. 읽을 수 넷  치우침 · 담는 최대값 · 최소 정규값 · 1.0 옆 간격.
 *   3. 눈금자      1 과 2 사이에 실제로 놓이는 값들을 그대로 그린다.
 *   4. 담아 보기   실수 하나를 담으면 무엇이 되는지.
 *
 * ── 세로는 마운트한 뒤 바뀌지 않는다 (S-view)
 *
 * 눈금 수가 32 에서 4 로 바뀌어도 눈금자의 길이는 그대로다. 눈금은 미리 최대
 * 개수만큼 만들어 두고 쓰지 않는 것을 숨긴다 — 지우고 다시 만들면 DOM 이 흔들리고,
 * 높이를 다시 재면 글 안에 박힌 그림의 위아래 문단이 밀린다.
 *
 * ── 뒷일
 *
 * 타이머도 전역 구독도 두지 않는다. `destroy()` 는 자기가 캔버스에 붙인 뿌리
 * 그룹 하나만 떼면 끝이다. 컨테이너는 건드리지 않는다 — 러너가 캔버스를 먼저
 * 붙여 두므로 컨테이너를 비우면 그 캔버스가 떨어져 나간다 (S-view).
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, categorical, fonts, makeTranslator } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 620;
const H = 300;

/**
 * 도형에 새겨진 글자와 수식 표기 — 번역하면 오히려 화면과 어긋난다.
 * 상수로 두고 키를 만들지 않는다 (C10 판정 1·3).
 */
const MARK_SIGN = 'S';
const MARK_EXP = 'E';
const MARK_MAN = 'M';
const MARK_ONE = '1';
const MARK_TWO = '2';
const MARK_EMPTY = '—';

/** 세 비트 무리를 가르는 색 — n 개 카테고리 식별 (S-view 결정 트리 3). */
const GROUP_SIGN = 0;
const GROUP_EXP = 1;
const GROUP_MAN = 2;

/** 눈금자가 품을 수 있는 최대 눈금 수 = 2^5 (가수가 다섯 비트일 때). */
const MAX_TICKS = 32;

/** 읽을 수 넷의 자리. `measure` 이벤트의 name 이 그대로 색인이다. */
const SLOTS = ['bias', 'max-value', 'min-normal', 'gap'] as const;

function groupDigits(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 있는 그대로 적고 세 자리마다 쉼표만 넣는다.
 *
 * 반올림하거나 줄이지 않는다 — 이 화면이 보이는 수는 전부 2의 거듭제곱에서
 * 나온 유한소수라 그대로 적어도 길어야 열여섯 자다 (0.00006103515625).
 */
function fmt(v: number): string {
  const s = String(v);
  const dot = s.indexOf('.');
  if (dot < 0) return groupDigits(s);
  return `${groupDigits(s.slice(0, dot))}${s.slice(dot)}`;
}

export const floatingPointStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const tone = categorical(3, 'vivid');

    const root = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(root);

    const add = (name: string, attrs: Record<string, string | number>): SVGElement => {
      const node = document.createElementNS(SVG_NS, name);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      root.appendChild(node);
      return node;
    };

    /**
     * 글자 하나. SVG 안의 크기는 viewBox 사용자 단위라 그림이 정하는 값이고,
     * 토큰이 정하는 것은 문서 층의 리듬이다 (S-view). 글꼴만 토큰을 쓴다.
     */
    const label = (
      x: number,
      y: number,
      size: number,
      fill: string,
      anchor: string,
      mono = false,
    ): SVGElement =>
      add('text', {
        x,
        y,
        'font-size': size,
        fill,
        'text-anchor': anchor,
        'font-family': mono ? fonts.mono : fonts.body,
        'dominant-baseline': 'middle',
      });

    // ── 1. 머리말 + 비트 띠 ────────────────────────────────
    const headerEl = label(W / 2, 20, 12, colors.text, 'middle');

    const CELL_W = 54;
    const CELL_H = 34;
    const CELL_GAP = 2;
    const STRIP_W = 8 * CELL_W + 7 * CELL_GAP;
    const STRIP_X = (W - STRIP_W) / 2;
    const STRIP_Y = 32;

    const cells: SVGElement[] = [];
    const cellMarks: SVGElement[] = [];
    for (let i = 0; i < 8; i += 1) {
      const x = STRIP_X + i * (CELL_W + CELL_GAP);
      cells.push(
        add('rect', {
          x,
          y: STRIP_Y,
          width: CELL_W,
          height: CELL_H,
          rx: 3,
          fill: colors.bgSubtle,
          stroke: colors.border,
        }),
      );
      cellMarks.push(label(x + CELL_W / 2, STRIP_Y + CELL_H / 2, 13, colors.stateInk, 'middle', true));
    }

    // ── 2. 읽을 수 넷 ─────────────────────────────────────
    const BOX_W = 142;
    const BOX_H = 48;
    const BOX_GAP = 10;
    const BOX_Y = 92;
    const BOX_X = (W - (4 * BOX_W + 3 * BOX_GAP)) / 2;

    const SLOT_KEYS: Record<string, string> = {
      bias: t('label.bias', 'Bias'),
      'max-value': t('label.maxValue', 'Largest value'),
      'min-normal': t('label.minNormal', 'Smallest normal'),
      gap: t('label.gap', 'Gap next to 1.0'),
    };

    const values = new Map<string, SVGElement>();
    SLOTS.forEach((name, i) => {
      const x = BOX_X + i * (BOX_W + BOX_GAP);
      add('rect', {
        x,
        y: BOX_Y,
        width: BOX_W,
        height: BOX_H,
        rx: 4,
        fill: colors.bgSubtle,
        stroke: colors.border,
      });
      const head = label(x + 9, BOX_Y + 15, 10, colors.textMuted, 'start');
      head.textContent = SLOT_KEYS[name] ?? name;
      const value = label(x + 9, BOX_Y + 34, 14, colors.text, 'start', true);
      value.textContent = MARK_EMPTY;
      values.set(name, value);
    });

    // ── 3. 눈금자 ─────────────────────────────────────────
    const rulerCaption = label(W / 2, 160, 11, colors.text, 'middle');

    const RULER_Y = 186;
    const RULER_X0 = 70;
    const RULER_X1 = 550;

    add('line', {
      x1: RULER_X0,
      y1: RULER_Y,
      x2: RULER_X1,
      y2: RULER_Y,
      stroke: colors.border,
      'stroke-width': 2,
    });

    // 미리 다 만들어 두고 쓰지 않는 것만 숨긴다 — 세로도 DOM 도 흔들리지 않는다.
    const ticks: SVGElement[] = [];
    for (let i = 0; i <= MAX_TICKS; i += 1) {
      ticks.push(
        add('line', {
          x1: RULER_X0,
          y1: RULER_Y - 7,
          x2: RULER_X0,
          y2: RULER_Y + 7,
          stroke: colors.text,
          'stroke-width': 1,
        }),
      );
    }

    const oneEl = label(RULER_X0, RULER_Y + 22, 11, colors.textMuted, 'middle', true);
    oneEl.textContent = MARK_ONE;
    const twoEl = label(RULER_X1, RULER_Y + 22, 11, colors.textMuted, 'middle', true);
    twoEl.textContent = MARK_TWO;

    // ── 4. 담아 보기 + 주장 ───────────────────────────────
    const storedCaption = label(W / 2, 238, 12, colors.text, 'middle');
    const tradeoffCaption = label(W / 2, 266, 11, colors.textMuted, 'middle');
    tradeoffCaption.textContent = t(
      'caption.tradeoff',
      'Give the exponent more and you reach further with a coarser ruler.',
    );

    // ── 메서드 ────────────────────────────────────────────

    const setSplit = (
      totalBits: number,
      signBits: number,
      expBits: number,
      manBits: number,
    ): void => {
      headerEl.textContent = t('label.split', 'Sign {s} · Exponent {e} · Mantissa {m}', {
        s: signBits,
        e: expBits,
        m: manBits,
      });
      for (let i = 0; i < cells.length; i += 1) {
        const group =
          i < signBits ? GROUP_SIGN : i < signBits + expBits ? GROUP_EXP : GROUP_MAN;
        const shown = i < totalBits;
        cells[i]!.setAttribute('fill', shown ? tone[group] ?? colors.bgSubtle : colors.bgSubtle);
        const mark = group === GROUP_SIGN ? MARK_SIGN : group === GROUP_EXP ? MARK_EXP : MARK_MAN;
        cellMarks[i]!.textContent = shown ? mark : '';
      }
    };

    const setMeasure = (name: string, value: number): void => {
      const el = values.get(name);
      if (el) el.textContent = fmt(value);
    };

    const setRuler = (tickCount: number): void => {
      rulerCaption.textContent = t('caption.ruler', 'From 1 to 2 in {n} steps', { n: tickCount });
      const span = RULER_X1 - RULER_X0;
      for (let i = 0; i < ticks.length; i += 1) {
        const used = i <= tickCount;
        const tick = ticks[i]!;
        if (!used) {
          tick.setAttribute('opacity', '0');
          continue;
        }
        const x = RULER_X0 + (span * i) / tickCount;
        const edge = i === 0 || i === tickCount;
        tick.setAttribute('opacity', '1');
        tick.setAttribute('x1', String(x));
        tick.setAttribute('x2', String(x));
        tick.setAttribute('y1', String(RULER_Y - (edge ? 11 : 7)));
        tick.setAttribute('y2', String(RULER_Y + (edge ? 11 : 7)));
        tick.setAttribute('stroke', edge ? colors.text : colors.textMuted);
      }
    };

    const setStored = (input: number, stored: number): void => {
      storedCaption.textContent = t('caption.stored', 'Store {x} and you get back {v}', {
        x: fmt(input),
        v: fmt(stored),
      });
    };

    const reset = (): void => {
      for (const el of values.values()) el.textContent = MARK_EMPTY;
      rulerCaption.textContent = '';
      storedCaption.textContent = '';
      for (const tick of ticks) tick.setAttribute('opacity', '0');
    };

    reset();

    return {
      destroy() {
        // 타이머도 리스너도 없다. 붙인 것은 이 그룹 하나뿐이다.
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      setSplit,
      setMeasure,
      setRuler,
      setStored,
      reset,
    };
  },
};
