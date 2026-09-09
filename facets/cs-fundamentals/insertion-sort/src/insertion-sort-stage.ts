/**
 * 삽입 정렬 전용 stage view — 세 가지를 한 폭에 담는다.
 *
 *   1. **손에 든 값** — 집어 든 값은 배열에서 떠나 위 칸에 뜬다. 떠난 자리는
 *      빈 자리(gap)가 되어 왼쪽으로 걸어간다. 이것이 밀기와 맞바꿈을 가르는
 *      그림이다 — 맞바꿈이라면 빈 자리가 생기지 않는다.
 *   2. **자라는 줄** — 왼쪽의 줄 선 구간을 옅은 띠로 감싼다. 한 바퀴마다 한 칸씩
 *      자란다.
 *   3. **값마다 다른 비켜섬** — 아래에 넣은 값별 비켜섬 수를 네모로 쌓는다.
 *      90 의 칸이 텅 비는 것이 이 알고리즘의 성격을 말한다.
 *
 * 세로는 mount 에서 한 번 정하고 그 뒤 바꾸지 않는다 (S-view). 타이머를 걸지
 * 않으므로 destroy 는 붙인 노드를 떼는 것으로 끝난다.
 *
 * 문안은 이 파일에 없다 — 키와 en 원본만 있고 문장은 `facet.ts` 의 `messages`
 * 에 있다 (C10). `key` 는 도형에 새긴 표식이라 상수로 둔다 (C10 표식 판정 1·2).
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, makeTranslator, fonts, fontSizes } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 도형에 새긴 표식. 이 분야에서 원어 그대로 통용되는 한 단어다 (C10). */
const KEY_MARK = 'key';

const W = 660;
const CELL_W = 58;
const CELL_GAP = 8;
const CELL_H = 52;
const ROW_TOP = 88;
const CAPTION_Y = 20;
const CARD_TOP = 34;
const CARD_H = 40;
const IDX_Y = 162;
const BAND_PAD = 7;
const BAND_LABEL_Y = 180;
const LEDGER_TITLE_Y = 202;
const BAR_BASE = 266;
const SQ = 7;
const SQ_GAP = 2;
const SQ_W = 20;
const VALUE_Y = 282;
const HEIGHT = 298;

/** 한 칸이 어떤 상태로 그려지는가. */
type CellState = 'default' | 'comparing' | 'moved' | 'placed' | 'sorted' | 'gap';

type ShiftRecord = { value: number; shifts: number };

export type InsertionSortStageInstance = ViewInstance & {
  setData(values: number[]): void;
  setCaption(text: string): void;
  setSortedRun(end: number): void;
  liftKey(index: number, value: number): void;
  aimKey(slot: number): void;
  setCompare(index: number | null): void;
  shiftCell(from: number, to: number): void;
  dropKey(slot: number): void;
  addShiftRecord(pass: number, value: number, shifts: number): void;
  markAllSorted(): void;
  reset(): void;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

function text(
  value: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el('text', attrs);
  node.textContent = value;
  return node;
}

export const insertionSortStageView: CanvasView = {
  canvas: { width: W, height: HEIGHT, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): InsertionSortStageInstance {
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;

    const root = el('g', {});
    canvas.appendChild(root);

    let values: (number | null)[] = [];
    let held: { value: number; slot: number } | null = null;
    let compareIndex: number | null = null;
    let movedIndex: number | null = null;
    let placedIndex: number | null = null;
    let sortedEnd = -1;
    let allSorted = false;
    let caption = '';
    const records = new Map<number, ShiftRecord>();

    /** 칸 왼쪽 x. 칸 묶음을 가로 가운데에 둔다. */
    function cellX(i: number): number {
      const n = Math.max(values.length, 1);
      const total = n * CELL_W + (n - 1) * CELL_GAP;
      const left = (W - total) / 2;
      return left + i * (CELL_W + CELL_GAP);
    }

    function leftEdge(): number {
      return cellX(0);
    }

    function stateOf(i: number): CellState {
      if (values[i] === null) return 'gap';
      if (allSorted) return 'sorted';
      if (i === compareIndex) return 'comparing';
      if (i === placedIndex) return 'placed';
      if (i === movedIndex) return 'moved';
      return 'default';
    }

    function fillOf(state: CellState): string {
      switch (state) {
        case 'comparing':
          return colors.itemComparing;
        case 'moved':
          return colors.itemSwapping;
        case 'placed':
          return colors.itemPivot;
        case 'sorted':
          return colors.itemSorted;
        case 'gap':
          return colors.bg;
        default:
          return colors.itemDefault;
      }
    }

    function inkOf(state: CellState): string {
      switch (state) {
        case 'comparing':
        case 'moved':
        case 'placed':
          return colors.stateInk;
        case 'sorted':
          return colors.textInverse;
        default:
          return colors.text;
      }
    }

    function drawBand(): void {
      if (sortedEnd < 0 || values.length === 0) return;
      const x = cellX(0) - BAND_PAD;
      const end = Math.min(sortedEnd, values.length - 1);
      const w = cellX(end) + CELL_W + BAND_PAD - x;
      root.appendChild(
        el('rect', {
          x,
          y: ROW_TOP - BAND_PAD,
          width: w,
          height: CELL_H + BAND_PAD * 2,
          rx: 8,
          fill: colors.sortedTailBg,
          stroke: colors.sortedTailBorder,
          'stroke-width': 1,
        }),
      );
      root.appendChild(
        text(tr('label.sortedRun', 'in order'), {
          x: x + w / 2,
          y: BAND_LABEL_Y,
          'text-anchor': 'middle',
          fill: colors.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        }),
      );
    }

    function drawCells(): void {
      for (let i = 0; i < values.length; i++) {
        const state = stateOf(i);
        const x = cellX(i);
        const rect = el('rect', {
          x,
          y: ROW_TOP,
          width: CELL_W,
          height: CELL_H,
          rx: 6,
          fill: fillOf(state),
          stroke: state === 'gap' ? colors.ghostOutline : colors.border,
          'stroke-width': 1,
        });
        if (state === 'gap') rect.setAttribute('stroke-dasharray', '4 3');
        root.appendChild(rect);

        const value = values[i];
        if (value !== null) {
          root.appendChild(
            text(String(value), {
              x: x + CELL_W / 2,
              y: ROW_TOP + CELL_H / 2 + 6,
              'text-anchor': 'middle',
              fill: inkOf(state),
              'font-family': fonts.mono,
              'font-size': fontSizes.lg,
            }),
          );
        }

        root.appendChild(
          text(String(i), {
            x: x + CELL_W / 2,
            y: IDX_Y,
            'text-anchor': 'middle',
            fill: colors.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          }),
        );
      }
    }

    function drawHeldKey(): void {
      if (held === null || values.length === 0) return;
      const slot = Math.max(0, Math.min(held.slot, values.length - 1));
      const x = cellX(slot);

      // 손에 든 값이 노리는 자리로 내려가는 길.
      const midX = x + CELL_W / 2;
      const guide = el('line', {
        x1: midX,
        y1: CARD_TOP + CARD_H,
        x2: midX,
        y2: ROW_TOP - 4,
        stroke: colors.itemPivot,
        'stroke-width': 2,
      });
      guide.setAttribute('stroke-dasharray', '3 3');
      root.appendChild(guide);
      root.appendChild(
        el('polygon', {
          points: `${midX - 5},${ROW_TOP - 8} ${midX + 5},${ROW_TOP - 8} ${midX},${ROW_TOP - 1}`,
          fill: colors.itemPivot,
        }),
      );

      root.appendChild(
        el('rect', {
          x,
          y: CARD_TOP,
          width: CELL_W,
          height: CARD_H,
          rx: 6,
          fill: colors.itemPivot,
          stroke: colors.itemPivot,
          'stroke-width': 1,
        }),
      );
      root.appendChild(
        text(String(held.value), {
          x: x + CELL_W / 2,
          y: CARD_TOP + CARD_H / 2 + 6,
          'text-anchor': 'middle',
          fill: colors.stateInk,
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
        }),
      );
      root.appendChild(
        text(KEY_MARK, {
          x: leftEdge() - 10,
          y: CARD_TOP + CARD_H / 2 + 4,
          'text-anchor': 'end',
          fill: colors.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        }),
      );
    }

    function drawLedger(): void {
      if (values.length === 0) return;
      root.appendChild(
        text(tr('label.ledger', 'Shifts per inserted value'), {
          x: leftEdge(),
          y: LEDGER_TITLE_Y,
          fill: colors.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        }),
      );
      const lastX = cellX(values.length - 1) + CELL_W;
      root.appendChild(
        el('line', {
          x1: leftEdge(),
          y1: BAR_BASE + 2,
          x2: lastX,
          y2: BAR_BASE + 2,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      for (const [pass, record] of records) {
        const cx = cellX(pass) + CELL_W / 2;
        for (let k = 0; k < record.shifts; k++) {
          root.appendChild(
            el('rect', {
              x: cx - SQ_W / 2,
              y: BAR_BASE - (k + 1) * SQ - k * SQ_GAP,
              width: SQ_W,
              height: SQ,
              rx: 2,
              fill: colors.itemSwapping,
            }),
          );
        }
        root.appendChild(
          text(`${record.value}`, {
            x: cx,
            y: VALUE_Y,
            'text-anchor': 'middle',
            fill: colors.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          }),
        );
        root.appendChild(
          text(`${record.shifts}`, {
            x: cx + SQ_W / 2 + 8,
            y: BAR_BASE,
            'text-anchor': 'start',
            fill: record.shifts === 0 ? colors.textMuted : colors.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          }),
        );
      }
    }

    function render(): void {
      while (root.firstChild) root.removeChild(root.firstChild);

      root.appendChild(
        text(caption, {
          x: W / 2,
          y: CAPTION_Y,
          'text-anchor': 'middle',
          fill: colors.text,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
        }),
      );

      drawBand();
      drawCells();
      drawHeldKey();
      drawLedger();
    }

    canvas.setAttribute('viewBox', `0 0 ${W} ${HEIGHT}`);
    render();

    return {
      setData(next) {
        values = [...next];
        held = null;
        compareIndex = null;
        movedIndex = null;
        placedIndex = null;
        allSorted = false;
        sortedEnd = next.length > 0 ? 0 : -1;
        records.clear();
        render();
      },

      setCaption(next) {
        caption = next;
        render();
      },

      setSortedRun(end) {
        sortedEnd = end;
        render();
      },

      liftKey(index, value) {
        held = { value, slot: index };
        values[index] = null;
        compareIndex = null;
        movedIndex = null;
        placedIndex = null;
        render();
      },

      aimKey(slot) {
        if (held !== null) held.slot = slot;
        render();
      },

      setCompare(index) {
        compareIndex = index;
        movedIndex = null;
        placedIndex = null;
        render();
      },

      shiftCell(from, to) {
        values[to] = values[from];
        values[from] = null;
        movedIndex = to;
        compareIndex = null;
        placedIndex = null;
        if (held !== null) held.slot = from;
        render();
      },

      dropKey(slot) {
        if (held !== null) values[slot] = held.value;
        held = null;
        compareIndex = null;
        movedIndex = null;
        placedIndex = slot;
        render();
      },

      addShiftRecord(pass, value, shifts) {
        records.set(pass, { value, shifts });
        render();
      },

      markAllSorted() {
        allSorted = true;
        held = null;
        compareIndex = null;
        movedIndex = null;
        placedIndex = null;
        sortedEnd = values.length - 1;
        render();
      },

      reset() {
        held = null;
        compareIndex = null;
        movedIndex = null;
        placedIndex = null;
        allSorted = false;
        sortedEnd = values.length > 0 ? 0 : -1;
        records.clear();
        caption = '';
        render();
      },

      destroy() {
        root.remove();
      },
    };
  },
};
