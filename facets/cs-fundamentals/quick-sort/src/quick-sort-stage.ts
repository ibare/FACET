/**
 * quick-sort-stage — 퀵 정렬 전용 stage view.
 *
 * 한 폭에 셋을 겹쳐 놓는다.
 *
 *   1. **지금 다루는 구간** — 점선 테두리가 `[lo..hi]` 를 감싼다. 재귀가
 *      내려갈수록 테두리가 좁아진다.
 *   2. **가르는 중의 두 영역** — 경계 `i` 까지가 작은 쪽 색지, 그 뒤로 훑은
 *      데까지가 큰 쪽 색지. 두 색지 사이를 `i` 표가 밀고 나간다.
 *   3. **확정된 자리가 쌓이는 것** — 기준이 앉은 칸은 `itemSorted` 로 굳고
 *      다시 움직이지 않는다. 아래 기록에는 가르기 한 번이 한 줄씩 남는다.
 *      줄의 막대가 위 칸들과 세로로 맞춰져 있어, 오른쪽 구간이 한 칸씩만
 *      줄어드는 쏠림이 눈에 그대로 들어온다.
 *
 * 세로는 마운트 때 정해지고 이후 바뀌지 않는다 (S-view). 기록이 예약한 일곱
 * 줄을 넘으면 줄 간격을 줄여 같은 자리에 담는다.
 *
 * 타이머 · 애니메이션 · 전역 구독이 없다. 모든 메서드는 상태를 고치고 즉시
 * 다시 그린다. `destroy()` 는 붙여 둔 `<g>` 하나만 떼면 된다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, makeTranslator } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 660;
const H = 314;
const PAD_X = 24;
const GAP = 8;
const CELL_MAX_W = 56;

const CAP_BASE_Y = 14;
const CHIP_W = 20;
const CHIP_H = 16;
const J_CHIP_Y = 24;
const J_TRI_TOP = 40;
const J_TRI_BOT = 46;
const BAND_TOP = 42;
const BAND_BOT = 102;
const CELL_Y = 50;
const CELL_H = 46;
const IDX_BASE_Y = 113;
const I_TRI_TOP = 120;
const I_TRI_BOT = 126;
const I_CHIP_Y = 126;
const DIVIDER_Y = 154;
const LOG_LABEL_BASE_Y = 170;
const LOG_TOP = 178;
const LOG_BOTTOM = H - 8;
const LOG_ROW_PITCH = 18;
const LOG_ROWS_RESERVED = 7;

/** 도식 라벨 — 그래픽에 각인된 표식이라 번역하지 않는다 (C10 판정 1·2). */
const MARK_BOUNDARY = 'i';
const MARK_CURSOR = 'j';

export type QuickSortCellState = 'comparing' | 'swapping';

type LogRow = { lo: number; hi: number; pivotIndex: number; pivotValue: number };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const quickSortStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    void container;
    const canvas = params.canvas;
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    let values: number[] = [];
    let lo: number | null = null;
    let hi: number | null = null;
    let pivot: number | null = null;
    let cursor: number | null = null;
    let boundary: number | null = null;
    let scanned: number | null = null;
    let caption = '';
    const settled = new Set<number>();
    const cellStates = new Map<number, QuickSortCellState>();
    let log: LogRow[] = [];

    const root = el('g', {});
    canvas.appendChild(root);

    // ── 기하 ──────────────────────────────────────────────
    function cellW(): number {
      const n = Math.max(1, values.length);
      const usable = W - 2 * PAD_X;
      return Math.min(CELL_MAX_W, (usable - GAP * (n - 1)) / n);
    }
    function originX(): number {
      const n = Math.max(1, values.length);
      const w = cellW();
      return (W - (n * w + GAP * (n - 1))) / 2;
    }
    function cellX(i: number): number {
      return originX() + i * (cellW() + GAP);
    }
    function cellCx(i: number): number {
      return cellX(i) + cellW() / 2;
    }

    // ── 색 (S-view 결정 트리) ─────────────────────────────
    function fillFor(i: number): string {
      if (settled.has(i)) return colors.itemSorted;
      if (cellStates.get(i) === 'swapping') return colors.itemSwapping;
      if (pivot === i) return colors.itemPivot;
      if (cellStates.get(i) === 'comparing') return colors.itemComparing;
      if (lo !== null && hi !== null && i >= lo && i <= hi) return colors.itemDefault;
      return colors.bgSubtle;
    }
    function inkFor(i: number): string {
      if (settled.has(i)) return colors.textInverse;
      const s = cellStates.get(i);
      if (s === 'swapping' || s === 'comparing' || pivot === i) return colors.stateInk;
      if (lo !== null && hi !== null && i >= lo && i <= hi) return colors.text;
      return colors.textMuted;
    }

    // ── 그리기 ────────────────────────────────────────────
    function text(
      x: number,
      y: number,
      s: string,
      size: string,
      fill: string,
      anchor = 'middle',
      weight = '400',
    ): SVGTextElement {
      const t = el('text', {
        x,
        y,
        'text-anchor': anchor,
        'font-family': fonts.body,
        'font-size': size,
        'font-weight': weight,
        fill,
      });
      t.textContent = s;
      return t;
    }

    function render(): void {
      while (root.firstChild) root.removeChild(root.firstChild);
      const n = values.length;
      const w = cellW();

      // 1. 캡션
      root.appendChild(
        text(PAD_X, CAP_BASE_Y, caption, fontSizes.sm, colors.textMuted, 'start'),
      );

      // 2. 작은 쪽 / 큰 쪽 색지 (region tint)
      if (lo !== null && boundary !== null && boundary >= lo) {
        root.appendChild(
          el('rect', {
            x: cellX(lo) - 2,
            y: BAND_TOP + 2,
            width: cellX(boundary) + w + 2 - (cellX(lo) - 2),
            height: BAND_BOT - BAND_TOP - 4,
            rx: 6,
            fill: colors.subtreeShadeLeft,
          }),
        );
      }
      if (boundary !== null && scanned !== null && scanned > boundary) {
        const from = boundary + 1;
        root.appendChild(
          el('rect', {
            x: cellX(from) - 2,
            y: BAND_TOP + 2,
            width: cellX(scanned) + w + 2 - (cellX(from) - 2),
            height: BAND_BOT - BAND_TOP - 4,
            rx: 6,
            fill: colors.subtreeShadeRight,
          }),
        );
      }

      // 3. 지금 다루는 구간 테두리
      if (lo !== null && hi !== null && lo <= hi && lo >= 0 && hi < n) {
        root.appendChild(
          el('rect', {
            x: cellX(lo) - 4,
            y: BAND_TOP,
            width: cellX(hi) + w + 4 - (cellX(lo) - 4),
            height: BAND_BOT - BAND_TOP,
            rx: 8,
            fill: 'none',
            stroke: colors.text,
            'stroke-width': 1,
            'stroke-dasharray': '4 3',
          }),
        );
      }

      // 4. 칸 + 자리 번호
      for (let i = 0; i < n; i++) {
        root.appendChild(
          el('rect', {
            x: cellX(i),
            y: CELL_Y,
            width: w,
            height: CELL_H,
            rx: 6,
            fill: fillFor(i),
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
        root.appendChild(
          text(cellCx(i), CELL_Y + 30, String(values[i]), fontSizes.lg, inkFor(i), 'middle', '600'),
        );
        root.appendChild(
          text(cellCx(i), IDX_BASE_Y, String(i), fontSizes.xs, colors.textMuted),
        );
      }

      // 5. 훑는 자리 j — 채운 칩 + 아래를 가리키는 삼각
      if (cursor !== null) {
        const cx = cellCx(cursor);
        root.appendChild(
          el('rect', {
            x: cx - CHIP_W / 2,
            y: J_CHIP_Y,
            width: CHIP_W,
            height: CHIP_H,
            rx: 4,
            fill: colors.itemComparing,
          }),
        );
        root.appendChild(
          text(cx, J_CHIP_Y + 12, MARK_CURSOR, fontSizes.xs, colors.stateInk, 'middle', '600'),
        );
        root.appendChild(
          el('polygon', {
            points: `${cx - 5},${J_TRI_TOP} ${cx + 5},${J_TRI_TOP} ${cx},${J_TRI_BOT}`,
            fill: colors.itemComparing,
          }),
        );
      }

      // 6. 경계 i — 외곽 링 칩 + 위를 가리키는 삼각 (보조 커서)
      if (boundary !== null) {
        const cx = cellCx(boundary);
        root.appendChild(
          el('polygon', {
            points: `${cx},${I_TRI_TOP} ${cx - 5},${I_TRI_BOT} ${cx + 5},${I_TRI_BOT}`,
            fill: colors.auxCursor,
          }),
        );
        root.appendChild(
          el('rect', {
            x: cx - CHIP_W / 2,
            y: I_CHIP_Y,
            width: CHIP_W,
            height: CHIP_H,
            rx: 4,
            fill: colors.bg,
            stroke: colors.auxCursor,
            'stroke-width': 1.5,
          }),
        );
        root.appendChild(
          text(cx, I_CHIP_Y + 12, MARK_BOUNDARY, fontSizes.xs, colors.auxCursor, 'middle', '600'),
        );
      }

      // 7. 가르기 기록
      root.appendChild(
        el('line', {
          x1: PAD_X,
          y1: DIVIDER_Y,
          x2: W - PAD_X,
          y2: DIVIDER_Y,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      root.appendChild(
        text(
          PAD_X,
          LOG_LABEL_BASE_Y,
          tr('label.log', 'Partitions'),
          fontSizes.xs,
          colors.textMuted,
          'start',
        ),
      );

      const rows = log.length;
      const pitch =
        rows > LOG_ROWS_RESERVED ? (LOG_BOTTOM - LOG_TOP) / rows : LOG_ROW_PITCH;
      const rowH = Math.max(9, pitch - 4);
      log.forEach((row, r) => {
        const y = LOG_TOP + r * pitch;
        root.appendChild(
          text(
            PAD_X,
            y + rowH * 0.8,
            tr('label.rangeSpan', '[{lo}..{hi}]', { lo: row.lo, hi: row.hi }),
            fontSizes.xs,
            colors.textMuted,
            'start',
          ),
        );
        root.appendChild(
          el('rect', {
            x: cellX(row.lo) - 2,
            y: y + rowH / 2 - 3,
            width: cellX(row.hi) + w + 2 - (cellX(row.lo) - 2),
            height: 6,
            rx: 3,
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
        const cx = cellCx(row.pivotIndex);
        root.appendChild(
          el('rect', {
            x: cx - 12,
            y,
            width: 24,
            height: rowH,
            rx: 3,
            fill: colors.itemPivot,
          }),
        );
        root.appendChild(
          text(
            cx,
            y + rowH * 0.78,
            String(row.pivotValue),
            fontSizes.xs,
            colors.stateInk,
            'middle',
            '600',
          ),
        );
      });
    }

    function clearTransient(): void {
      lo = null;
      hi = null;
      pivot = null;
      cursor = null;
      boundary = null;
      scanned = null;
      cellStates.clear();
    }

    render();

    return {
      setData(next: number[]): void {
        values = [...next];
        settled.clear();
        log = [];
        caption = '';
        clearTransient();
        render();
      },
      setCaption(s: string): void {
        caption = s;
        render();
      },
      setRange(nextLo: number, nextHi: number): void {
        lo = nextLo;
        hi = nextHi;
        boundary = null;
        scanned = null;
        cursor = null;
        pivot = null;
        cellStates.clear();
        render();
      },
      setPivot(index: number | null): void {
        pivot = index;
        render();
      },
      setCursor(index: number | null): void {
        cursor = index;
        render();
      },
      setBoundary(index: number | null): void {
        boundary = index;
        render();
      },
      setScanned(index: number | null): void {
        scanned = index;
        render();
      },
      setCellState(index: number, state: QuickSortCellState | null): void {
        if (state === null) cellStates.delete(index);
        else cellStates.set(index, state);
        render();
      },
      clearCellStates(): void {
        cellStates.clear();
        render();
      },
      swapValues(i: number, j: number): void {
        const tmp = values[i];
        values[i] = values[j];
        values[j] = tmp;
        render();
      },
      markSettled(index: number): void {
        settled.add(index);
        cellStates.delete(index);
        render();
      },
      addPartition(row: LogRow): void {
        log = [...log, row];
        render();
      },
      reset(): void {
        settled.clear();
        log = [];
        caption = '';
        clearTransient();
        render();
      },
      destroy(): void {
        // 타이머도 전역 구독도 없다. 붙여 둔 <g> 하나만 떼면 남는 것이 없다.
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
  },
};
