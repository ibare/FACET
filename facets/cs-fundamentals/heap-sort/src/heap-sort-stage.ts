/**
 * heap-sort-stage — 힙 정렬 전용 stage view.
 *
 * **배열 한 줄만 그린다.** 트리를 따로 그려 옆에 두면 자료가 둘로 보이는데,
 * 힙의 요점은 정반대다 — 자리 번호의 셈(`2i+1` · `2i+2`)만으로 그 한 줄이 이미
 * 트리라는 것. 그래서 부모-자식 관계를 **줄 아래로 걸린 활**로 그린다. 활은
 * 힙에 속한 칸 사이에만 걸리므로, 힙이 줄면 오른쪽부터 활이 사라진다. 배열이
 * 트리에서 빠져나와 정렬된 꼬리가 되는 것이 그 자체로 보인다.
 *
 * 줄 위쪽 띠는 힙의 층이다. 한 층이 다음 층에서 두 배가 되는 것과, 힙이 줄면
 * 마지막 층부터 짧아지는 것을 함께 보인다. 그 위 빈 자리는 꼭대기와 끝을
 * 맞바꾸는 순간에만 쓰이는 **뽑기 활**의 길이다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 칸 수가 늘면 칸 폭과 활 깊이를
 * 줄여 담고 높이는 그대로 둔다.
 *
 * 타이머도 옵서버도 두지 않는다. `destroy()` 는 캔버스에 붙인 그룹만 거둔다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  PIECE_CANVAS_W,
  depthVeil,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';

/** 칸의 한때 상태. 확정된 칸(`settled`)은 따로 관리한다. */
export type HeapSortCellState = 'comparing' | 'swapping' | null;

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 232;

const CAPTION_Y = 18;
const LABEL_Y = 80;
const LEVEL_Y = 86;
const LEVEL_H = 6;
const CELL_Y = 96;
const CELL_H = 46;
const INDEX_Y = 156;
const ARC_Y = 162;
const ARC_MIN_DIP = 16;
const ARC_MAX_DIP = 58;
const ARC_DIP_PER_STEP = 9;

const MARGIN_X = 24;
const CELL_GAP = 8;
const CELL_MAX_W = 60;
const CELL_MIN_W = 16;

const EXTRACT_ARCH_MIN_TOP = 34;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

function group(): SVGGElement {
  return document.createElementNS(SVG_NS, 'g');
}

/** 한 칸의 폭 — 칸이 많아지면 좁아진다. 높이는 건드리지 않는다. */
function cellWidth(n: number): number {
  if (n <= 0) return CELL_MAX_W;
  const usable = W - MARGIN_X * 2 - CELL_GAP * (n - 1);
  return Math.max(CELL_MIN_W, Math.min(CELL_MAX_W, usable / n));
}

export const heapSortStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 러너가 붙여 준 캔버스를
    // 떼어내면 그림이 통째로 사라진다 (S-view).
    svg.textContent = '';

    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const gRegion = group();
    const gLevel = group();
    const gArcs = group();
    const gExtract = group();
    const gCells = group();
    const gLabels = group();
    const gCaption = group();
    for (const g of [gRegion, gLevel, gArcs, gExtract, gCells, gLabels, gCaption]) {
      svg.appendChild(g);
    }

    // ── 상태 ────────────────────────────────────────────────────────
    let values: number[] = [];
    let heapSize = 0;
    let focus: number | null = null;
    let edgeParent: number | null = null;
    let edgeBigger: number | null = null;
    let extractFrom: number | null = null;
    let extractTo: number | null = null;
    const cellStates = new Map<number, HeapSortCellState>();
    const settled = new Set<number>();

    const initial = params.initialData as { values?: number[] } | undefined;
    if (Array.isArray(initial?.values)) {
      values = initial.values.filter((x): x is number => typeof x === 'number');
      heapSize = values.length;
    }

    // ── 좌표 ────────────────────────────────────────────────────────
    let cw = cellWidth(values.length);
    let startX = (W - (cw * values.length + CELL_GAP * Math.max(0, values.length - 1))) / 2;

    const relayout = (): void => {
      cw = cellWidth(values.length);
      const total = cw * values.length + CELL_GAP * Math.max(0, values.length - 1);
      startX = (W - total) / 2;
    };

    const left = (i: number): number => startX + i * (cw + CELL_GAP);
    const cx = (i: number): number => left(i) + cw / 2;

    // ── 그리기 ──────────────────────────────────────────────────────
    const clear = (g: SVGGElement): void => {
      g.textContent = '';
    };

    function drawRegion(): void {
      clear(gRegion);
      const n = values.length;
      if (n === 0 || heapSize >= n) return;
      const x = left(heapSize) - CELL_GAP / 2;
      const w = left(n - 1) + cw + CELL_GAP / 2 - x;
      gRegion.appendChild(
        el('rect', {
          x,
          y: LEVEL_Y - 4,
          width: Math.max(0, w),
          height: CELL_H + (CELL_Y - LEVEL_Y) + 8,
          rx: 6,
          fill: colors.sortedTailBg,
          stroke: colors.sortedTailBorder,
          'stroke-width': 1,
          'stroke-opacity': 0.35,
        }),
      );
    }

    function drawLevels(): void {
      clear(gLevel);
      if (heapSize <= 0) return;
      for (let level = 0; ; level++) {
        const first = (1 << level) - 1;
        if (first >= heapSize) break;
        const last = Math.min((1 << (level + 1)) - 2, heapSize - 1);
        const veil = depthVeil(level + 1, params.theme);
        gLevel.appendChild(
          el('rect', {
            x: left(first),
            y: LEVEL_Y,
            width: left(last) + cw - left(first),
            height: LEVEL_H,
            rx: LEVEL_H / 2,
            fill: veil.fill,
            'fill-opacity': veil.alpha,
          }),
        );
      }
    }

    function arcPath(p: number, c: number): string {
      const dip = Math.min(ARC_MAX_DIP, ARC_MIN_DIP + (c - p) * ARC_DIP_PER_STEP);
      const x0 = cx(p);
      const x1 = cx(c);
      const ctrlY = ARC_Y + dip * 2;
      return `M ${x0} ${ARC_Y} Q ${(x0 + x1) / 2} ${ctrlY} ${x1} ${ARC_Y}`;
    }

    function drawArcs(): void {
      clear(gArcs);
      const moving =
        cellStates.get(edgeParent ?? -1) === 'swapping' &&
        cellStates.get(edgeBigger ?? -1) === 'swapping';
      for (let p = 0; p * 2 + 1 < heapSize; p++) {
        for (const c of [p * 2 + 1, p * 2 + 2]) {
          if (c >= heapSize) continue;
          const active = edgeParent === p;
          const winner = active && edgeBigger === c;
          let stroke = colors.border;
          let width = 1.4;
          if (active) {
            stroke = moving && winner ? colors.itemSwapping : colors.itemComparing;
            width = winner ? 3.4 : 2;
          }
          gArcs.appendChild(
            el('path', {
              d: arcPath(p, c),
              fill: 'none',
              stroke,
              'stroke-width': width,
              'stroke-linecap': 'round',
            }),
          );
          if (winner) {
            gArcs.appendChild(
              el('circle', { cx: cx(c), cy: ARC_Y, r: 3.2, fill: colors.risingMarker }),
            );
          }
        }
      }
    }

    function drawExtract(): void {
      clear(gExtract);
      if (extractFrom === null || extractTo === null) return;
      if (extractFrom >= values.length || extractTo >= values.length) return;
      const x0 = cx(extractFrom);
      const x1 = cx(extractTo);
      const span = Math.abs(x1 - x0);
      const archTop = Math.max(EXTRACT_ARCH_MIN_TOP, Math.min(CELL_Y - 16, CELL_Y - 12 - span * 0.12));
      const ctrlY = 2 * archTop - CELL_Y;
      gExtract.appendChild(
        el('path', {
          d: `M ${x0} ${CELL_Y} Q ${(x0 + x1) / 2} ${ctrlY} ${x1} ${CELL_Y}`,
          fill: 'none',
          stroke: colors.itemSwapping,
          'stroke-width': 2.4,
          'stroke-linecap': 'round',
        }),
      );
      for (const x of [x0, x1]) {
        gExtract.appendChild(el('circle', { cx: x, cy: CELL_Y, r: 3.2, fill: colors.itemSwapping }));
      }
    }

    function cellFill(i: number): { fill: string; ink: string } {
      const state = cellStates.get(i) ?? null;
      if (state === 'swapping') return { fill: colors.itemSwapping, ink: colors.stateInk };
      if (state === 'comparing') return { fill: colors.itemComparing, ink: colors.stateInk };
      if (settled.has(i)) return { fill: colors.itemSorted, ink: colors.textInverse };
      return { fill: colors.itemDefault, ink: colors.text };
    }

    function drawCells(): void {
      clear(gCells);
      for (let i = 0; i < values.length; i++) {
        const { fill, ink } = cellFill(i);
        gCells.appendChild(
          el('rect', {
            x: left(i),
            y: CELL_Y,
            width: cw,
            height: CELL_H,
            rx: 5,
            fill,
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
        if (focus === i) {
          gCells.appendChild(
            el('rect', {
              x: left(i) - 3,
              y: CELL_Y - 3,
              width: cw + 6,
              height: CELL_H + 6,
              rx: 7,
              fill: 'none',
              stroke: colors.auxCursor,
              'stroke-width': 2.4,
            }),
          );
        }
        const value = el('text', {
          x: cx(i),
          y: CELL_Y + CELL_H / 2 + 6,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          fill: ink,
        });
        value.textContent = String(values[i]);
        gCells.appendChild(value);

        const label = el('text', {
          x: cx(i),
          y: INDEX_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        label.textContent = String(i);
        gCells.appendChild(label);
      }
    }

    /** 배경 판을 깐 영역 이름 — 뽑기 활이 지나가도 글자가 묻히지 않는다. */
    function drawRegionLabel(text: string, from: number, to: number): void {
      if (from > to || to >= values.length) return;
      const center = (left(from) + left(to) + cw) / 2;
      // 글자 폭 실측(`getComputedTextLength`)은 마운트 전에 못 부르므로 어림한다.
      // 글자당 폭이 큰 문자(ar · hi)에서도 판이 모자라지 않게 넉넉히 잡는다.
      const width = Math.max(34, text.length * 8 + 18);
      gLabels.appendChild(
        el('rect', {
          x: center - width / 2,
          y: LABEL_Y - 11,
          width,
          height: 15,
          rx: 4,
          fill: colors.bg,
        }),
      );
      const node = el('text', {
        x: center,
        y: LABEL_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      node.textContent = text;
      gLabels.appendChild(node);
    }

    function drawLabels(): void {
      clear(gLabels);
      const n = values.length;
      if (n === 0) return;
      if (heapSize > 0) drawRegionLabel(tr('label.heap', 'Heap'), 0, heapSize - 1);
      if (heapSize < n) drawRegionLabel(tr('label.sorted', 'Sorted'), heapSize, n - 1);
    }

    const captionNode = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    gCaption.appendChild(captionNode);

    function render(): void {
      relayout();
      drawRegion();
      drawLevels();
      drawArcs();
      drawCells();
      drawExtract();
      drawLabels();
    }

    render();

    return {
      destroy() {
        for (const g of [gRegion, gLevel, gArcs, gExtract, gCells, gLabels, gCaption]) {
          g.remove();
        }
      },

      setData(next: number[]): void {
        values = [...next];
        heapSize = values.length;
        cellStates.clear();
        settled.clear();
        focus = null;
        edgeParent = null;
        edgeBigger = null;
        extractFrom = null;
        extractTo = null;
        render();
      },

      setCaption(text: string): void {
        captionNode.textContent = text;
      },

      setHeapSize(size: number): void {
        heapSize = Math.max(0, Math.min(values.length, size));
        render();
      },

      setFocus(index: number | null): void {
        focus = index;
        render();
      },

      setEdges(parent: number | null, bigger: number | null): void {
        edgeParent = parent;
        edgeBigger = bigger;
        render();
      },

      setCellState(index: number, state: HeapSortCellState): void {
        if (state === null) cellStates.delete(index);
        else cellStates.set(index, state);
        render();
      },

      clearCellStates(): void {
        cellStates.clear();
        render();
      },

      swapValues(i: number, j: number): void {
        const a = values[i];
        const b = values[j];
        if (typeof a !== 'number' || typeof b !== 'number') return;
        values[i] = b;
        values[j] = a;
        render();
      },

      markSettled(index: number): void {
        settled.add(index);
        render();
      },

      setExtractArc(from: number | null, to: number | null): void {
        extractFrom = from;
        extractTo = to;
        render();
      },

      reset(): void {
        heapSize = values.length;
        cellStates.clear();
        settled.clear();
        focus = null;
        edgeParent = null;
        edgeBigger = null;
        extractFrom = null;
        extractTo = null;
        captionNode.textContent = '';
        render();
      },
    };
  },
};
