/**
 * dynamic-programming 전용 stage view — 0/1 배낭의 2차원 표.
 *
 * 그리는 것은 하나다. **칸 하나가 윗줄 두 칸에서 값을 받아 온다.** 그래서 행과 행
 * 사이에 12px 홈을 내고 화살을 그 홈으로만 지나가게 했다 — 칸 위를 가로지르는
 * 얕은 대각선은 아래 숫자를 가려서 무엇이 무엇을 먹였는지 읽히지 않는다.
 *
 *   ┌ 곧은 화살 (회색) : 윗줄 같은 자리. 이 물건을 안 넣었을 때의 값.
 *   └ 굽은 화살 (노랑) : 무게만큼 왼쪽. 이 물건을 넣을 자리를 비운 뒤의 값.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 행이 다섯보다 많거나 열이 열하나보다
 * 많은 자료가 오면 칸을 줄여 담는다 — 캔버스를 키우지 않는다.
 *
 * 화면 문안은 `params.t` 로만 조회한다. 문안 자체는 `facet.ts` 의 `messages` 에
 * 있고 여기에는 키와 en 원본만 있다 (C10). 칸에 찍히는 숫자와 열 머리의 한도
 * 값은 자료이지 문안이 아니라 그대로 그린다.
 *
 * 뒷일을 남기지 않는다 — 타이머도 리스너도 옵저버도 걸지 않으므로 `destroy()` 는
 * 자기가 붙인 노드를 거두기만 한다.
 */

import type { ViewInstance, ViewMountParams, CanvasView } from '@ffacet/core/runtime';
import {
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_W = 720;
const CANVAS_H = 316;

/** 상단 한 줄 (한도 · 범례 · 답) 의 baseline. */
const HEAD_BASELINE = 22;
/** 열 머리 (한도 값) 영역. */
const COL_HEAD_TOP = 38;
const COL_HEAD_H = 22;
/** 행 영역. 위아래 한계를 고정해 두고 그 안에서 줄여 담는다. */
const ROWS_TOP = 68;
const ROWS_BOTTOM = 268;
const CAPTION_BASELINE = 294;

const ROW_LABEL_W = 96;
const MAX_CELL_W = 52;
const MAX_CELL_H = 28;
const ROW_GAP = 12;
const MIN_CELL_H = 14;

/** 화살이 지나가는 세로선의 좌우 벌림. 곧은 화살과 굽은 화살이 겹치지 않는다. */
const ARROW_SPLIT = 9;
/** 화살이 출발 칸 안에서 얼마나 위에서 시작하는가. */
const ARROW_LEAD = 6;

/** 칸 값 옆에 찍는 자국의 반지름 — 이 칸이 물건을 넣어 얻은 값이라는 표시. */
const TAKE_DOT_R = 2.6;

/** 도형에 새겨진 표식 (C10 — 번역하지 않는다). */
const MARK_WEIGHT = 'w';
const MARK_VALUE = 'v';
const MARK_DOT = '●';

/** 칸이 지금 어떤 상태로 그려지는가. */
type CellPaint = 'empty' | 'base' | 'filled' | 'source' | 'cursor' | 'answer';

/** 한 칸이 값을 어디서 받았는가. */
export type DynamicProgrammingCellOrigin = 'base' | 'skip' | 'take';

/** 화살 하나. `kind` 가 곧은 화살(skip)과 굽은 화살(take)을 가른다. */
export type DynamicProgrammingSource = {
  row: number;
  col: number;
  kind: 'skip' | 'take';
};

type Item = { weight: number; value: number };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

export const dynamicProgrammingStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    // 러너가 캔버스를 컨테이너에 먼저 붙여 두었다. 컨테이너를 비우면 그것이
    // 떨어져 나가므로 손대지 않는다 (S-view).
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    // ── 자료에 따라 정해지는 기하. mount 에서 한 번 정하고 그 뒤로 바꾸지 않는다.
    let rows = 1;
    let cols = 1;
    let cellW = MAX_CELL_W;
    let cellH = MAX_CELL_H;
    let rowPitch = MAX_CELL_H + ROW_GAP;
    let tableX = 0;
    let items: Item[] = [];

    // ── 상태
    let values: (number | null)[][] = [];
    let origins: (DynamicProgrammingCellOrigin | null)[][] = [];
    let cursor: { row: number; col: number } | null = null;
    let sources: DynamicProgrammingSource[] = [];
    let winner: 'skip' | 'take' | null = null;
    let answer: { row: number; col: number } | null = null;
    let capacity = 0;

    // ── DOM 뼈대. 한 번 만들고 속성만 갈아 끼운다.
    const gGrid = el('g', {});
    const gArrows = el('g', {});
    const gLabels = el('g', {});
    const gHead = el('g', {});
    svg.appendChild(gGrid);
    svg.appendChild(gArrows);
    svg.appendChild(gLabels);
    svg.appendChild(gHead);

    const capacityText = el('text', {
      x: 22,
      y: HEAD_BASELINE,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    const legendText = el('text', {
      x: CANVAS_W / 2,
      y: HEAD_BASELINE,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });
    const answerBox = el('rect', {
      x: CANVAS_W - 150,
      y: HEAD_BASELINE - 15,
      width: 128,
      height: 21,
      rx: 4,
      fill: c.itemSorted,
      opacity: 0,
    });
    const answerText = el('text', {
      x: CANVAS_W - 86,
      y: HEAD_BASELINE,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      'font-weight': '600',
      fill: c.textInverse,
      opacity: 0,
    });
    const captionText = el('text', {
      x: CANVAS_W / 2,
      y: CAPTION_BASELINE,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    gHead.appendChild(capacityText);
    gHead.appendChild(legendText);
    gHead.appendChild(answerBox);
    gHead.appendChild(answerText);
    gHead.appendChild(captionText);

    legendText.textContent = tr('label.takeMark', '{dot} = the item went in here', {
      dot: MARK_DOT,
    });

    // 칸 · 값 · 자국. rows × cols 로 만들고 그 뒤로는 속성만 바꾼다.
    let cellRects: SVGRectElement[][] = [];
    let cellTexts: SVGTextElement[][] = [];
    let cellDots: SVGCircleElement[][] = [];
    let colHeadTexts: SVGTextElement[] = [];
    let rowLabelBoxes: SVGRectElement[] = [];
    let rowLabelIndex: SVGTextElement[] = [];
    let rowLabelDetail: SVGTextElement[] = [];

    const colX = (col: number): number => tableX + ROW_LABEL_W + col * cellW;
    const colCenter = (col: number): number => colX(col) + cellW / 2;
    const rowY = (row: number): number => ROWS_TOP + row * rowPitch;
    const rowBottom = (row: number): number => rowY(row) + cellH;

    function clearGroup(g: SVGGElement): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    /** 표를 새로 만든다. 자료가 바뀌는 유일한 자리. */
    function build(nextRows: number, nextCols: number, nextItems: Item[], cap: number): void {
      rows = Math.max(1, nextRows);
      cols = Math.max(1, nextCols);
      items = nextItems;
      capacity = cap;

      cellW = Math.min(MAX_CELL_W, (CANVAS_W - 44 - ROW_LABEL_W) / cols);
      rowPitch = Math.min(MAX_CELL_H + ROW_GAP, (ROWS_BOTTOM - ROWS_TOP) / rows);
      cellH = Math.max(MIN_CELL_H, rowPitch - ROW_GAP);
      tableX = (CANVAS_W - (ROW_LABEL_W + cols * cellW)) / 2;

      values = Array.from({ length: rows }, () => new Array<number | null>(cols).fill(null));
      origins = Array.from({ length: rows }, () =>
        new Array<DynamicProgrammingCellOrigin | null>(cols).fill(null),
      );
      cursor = null;
      sources = [];
      winner = null;
      answer = null;

      clearGroup(gGrid);
      clearGroup(gArrows);
      clearGroup(gLabels);

      capacityText.textContent = tr('label.capacity', 'limit {n}', { n: capacity });

      // 열 머리 — 한도 값 0..capacity.
      const cornerText = el('text', {
        x: tableX + ROW_LABEL_W - 8,
        y: COL_HEAD_TOP + COL_HEAD_H - 7,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      cornerText.textContent = tr('label.axisLimit', 'limit →');
      gLabels.appendChild(cornerText);

      colHeadTexts = [];
      for (let col = 0; col < cols; col++) {
        const t = el('text', {
          x: colCenter(col),
          y: COL_HEAD_TOP + COL_HEAD_H - 7,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        });
        t.textContent = String(col);
        gLabels.appendChild(t);
        colHeadTexts.push(t);
      }

      // 행 이름표 — 물건 번호와 그 무게 · 값.
      rowLabelBoxes = [];
      rowLabelIndex = [];
      rowLabelDetail = [];
      for (let row = 0; row < rows; row++) {
        const box = el('rect', {
          x: tableX,
          y: rowY(row),
          width: ROW_LABEL_W - 8,
          height: cellH,
          rx: 4,
          fill: c.bg,
        });
        gLabels.appendChild(box);
        rowLabelBoxes.push(box);

        const idxT = el('text', {
          x: tableX + 12,
          y: rowY(row) + cellH / 2 + 4,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': '600',
          fill: c.text,
        });
        idxT.textContent = row === 0 ? '–' : String(row);
        gLabels.appendChild(idxT);
        rowLabelIndex.push(idxT);

        const detT = el('text', {
          x: tableX + 32,
          y: rowY(row) + cellH / 2 + 4,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        const item = items[row - 1];
        detT.textContent =
          row === 0 || item === undefined
            ? tr('label.noItem', 'none')
            : `${MARK_WEIGHT}${item.weight}  ${MARK_VALUE}${item.value}`;
        gLabels.appendChild(detT);
        rowLabelDetail.push(detT);
      }

      // 칸.
      cellRects = [];
      cellTexts = [];
      cellDots = [];
      for (let row = 0; row < rows; row++) {
        const rr: SVGRectElement[] = [];
        const tt: SVGTextElement[] = [];
        const dd: SVGCircleElement[] = [];
        for (let col = 0; col < cols; col++) {
          const r = el('rect', {
            x: colX(col) + 1,
            y: rowY(row),
            width: cellW - 2,
            height: cellH,
            rx: 3,
            fill: c.bg,
            stroke: c.border,
            'stroke-width': 1,
          });
          gGrid.appendChild(r);
          rr.push(r);

          const t = el('text', {
            x: colCenter(col),
            y: rowY(row) + cellH / 2 + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: c.text,
          });
          gGrid.appendChild(t);
          tt.push(t);

          const d = el('circle', {
            cx: colX(col) + cellW - 8,
            cy: rowY(row) + cellH - 7,
            r: TAKE_DOT_R,
            fill: c.text,
            opacity: 0,
          });
          gGrid.appendChild(d);
          dd.push(d);
        }
        cellRects.push(rr);
        cellTexts.push(tt);
        cellDots.push(dd);
      }

      paint();
    }

    function paintOf(row: number, col: number): CellPaint {
      if (answer !== null && answer.row === row && answer.col === col) return 'answer';
      if (cursor !== null && cursor.row === row && cursor.col === col) return 'cursor';
      for (const s of sources) if (s.row === row && s.col === col) return 'source';
      if (values[row]?.[col] === null || values[row]?.[col] === undefined) return 'empty';
      return row === 0 ? 'base' : 'filled';
    }

    /** 타일이 테마를 따라 뒤집으면 잉크도 뒤집고, 고정이면 잉크도 고정한다 (design-tokens). */
    function inkOf(paintKind: CellPaint): string {
      if (paintKind === 'cursor' || paintKind === 'source') return c.stateInk;
      if (paintKind === 'answer') return c.textInverse;
      if (paintKind === 'base') return c.textMuted;
      return c.text;
    }

    function fillOf(paintKind: CellPaint): string {
      switch (paintKind) {
        case 'cursor':
          return c.itemPivot;
        case 'source':
          return c.itemComparing;
        case 'answer':
          return c.itemSorted;
        case 'base':
        case 'filled':
          return c.bgSubtle;
        case 'empty':
          return c.bg;
      }
    }

    function paint(): void {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const kind = paintOf(row, col);
          const rect = cellRects[row][col];
          rect.setAttribute('fill', fillOf(kind));
          rect.setAttribute(
            'stroke',
            kind === 'cursor' || kind === 'answer' ? c.text : c.border,
          );
          rect.setAttribute('stroke-width', kind === 'cursor' || kind === 'answer' ? '2' : '1');

          const v = values[row][col];
          const text = cellTexts[row][col];
          text.textContent = v === null ? '' : String(v);
          text.setAttribute('fill', inkOf(kind));

          const dot = cellDots[row][col];
          dot.setAttribute('opacity', origins[row][col] === 'take' ? '1' : '0');
          dot.setAttribute('fill', inkOf(kind));
        }
      }

      for (let col = 0; col < cols; col++) {
        const on = cursor !== null && cursor.col === col;
        colHeadTexts[col].setAttribute('fill', on ? c.text : c.textMuted);
        colHeadTexts[col].setAttribute('font-weight', on ? '700' : '400');
      }

      for (let row = 0; row < rows; row++) {
        const on = cursor !== null && cursor.row === row;
        rowLabelBoxes[row].setAttribute('fill', on ? c.itemActive : c.bg);
        rowLabelIndex[row].setAttribute('fill', on ? c.stateInk : c.text);
        rowLabelDetail[row].setAttribute('fill', on ? c.stateInk : c.textMuted);
      }
    }

    /** 홈을 지나가는 화살 하나. `dim` 이면 견줌에서 진 쪽이다. */
    function drawArrow(src: DynamicProgrammingSource, dst: { row: number; col: number }): void {
      if (src.row < 0 || src.row >= rows || src.col < 0 || src.col >= cols) return;
      const lane = src.kind === 'take' ? ARROW_SPLIT : -ARROW_SPLIT;
      const x1 = colCenter(src.col) + lane;
      const x2 = colCenter(dst.col) + lane;
      const y1 = rowBottom(src.row) - ARROW_LEAD;
      const yGutter = rowBottom(src.row) + ROW_GAP / 2;
      const y2 = rowY(dst.row) + 1;
      const stroke = src.kind === 'take' ? c.accent : c.textMuted;
      const dim = winner !== null && winner !== src.kind;

      const path = el('path', {
        d: `M ${x1} ${y1} L ${x1} ${yGutter} L ${x2} ${yGutter} L ${x2} ${y2 - 5}`,
        fill: 'none',
        stroke,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        opacity: dim ? 0.28 : 1,
      });
      gArrows.appendChild(path);

      const head = el('path', {
        d: `M ${x2 - 4} ${y2 - 5} L ${x2 + 4} ${y2 - 5} L ${x2} ${y2 + 1} Z`,
        fill: stroke,
        opacity: dim ? 0.28 : 1,
      });
      gArrows.appendChild(head);
    }

    function repaintArrows(): void {
      clearGroup(gArrows);
      if (cursor === null) return;
      for (const s of sources) drawArrow(s, cursor);
    }

    return {
      destroy() {
        for (const g of [gGrid, gArrows, gLabels, gHead]) {
          if (g.parentNode) g.parentNode.removeChild(g);
        }
      },

      /** 표를 새로 만든다. 행 0 은 아직 비어 있고 `setCell` 이 채운다. */
      setTable(nextRows: number, nextCols: number, nextItems: Item[], cap: number) {
        build(nextRows, nextCols, nextItems, cap);
      },

      /** 행 하나를 통째로 값으로 채운다 (0 행의 바닥). */
      setRow(row: number, rowValues: number[]) {
        if (row < 0 || row >= rows) return;
        for (let col = 0; col < cols && col < rowValues.length; col++) {
          values[row][col] = rowValues[col];
          origins[row][col] = 'base';
        }
        paint();
      },

      /** 지금 채우는 칸. `null` 이면 아무 칸도 짚지 않는다. */
      setCursor(row: number | null, col: number | null) {
        cursor = row === null || col === null ? null : { row, col };
        paint();
        repaintArrows();
      },

      /** 윗줄에서 값을 받아 오는 칸들. 화살이 여기서 그려진다. */
      setSources(next: DynamicProgrammingSource[]) {
        sources = next;
        winner = null;
        paint();
        repaintArrows();
      },

      /** 견줌의 승자. 진 화살이 옅어진다. */
      setWinner(next: 'skip' | 'take' | null) {
        winner = next;
        repaintArrows();
      },

      /** 칸에 값을 앉힌다. */
      setCell(row: number, col: number, value: number, origin: DynamicProgrammingCellOrigin) {
        if (row < 0 || row >= rows || col < 0 || col >= cols) return;
        values[row][col] = value;
        origins[row][col] = origin;
        paint();
      },

      /** 마지막 칸을 답으로 굳힌다. */
      setAnswer(row: number, col: number, value: number) {
        answer = { row, col };
        cursor = null;
        sources = [];
        winner = null;
        clearGroup(gArrows);
        answerBox.setAttribute('opacity', '1');
        answerText.setAttribute('opacity', '1');
        answerText.textContent = tr('label.best', 'best {v}', { v: value });
        paint();
      },

      setCaption(text: string) {
        captionText.textContent = text;
      },

      reset() {
        clearGroup(gGrid);
        clearGroup(gArrows);
        clearGroup(gLabels);
        cellRects = [];
        cellTexts = [];
        cellDots = [];
        colHeadTexts = [];
        rowLabelBoxes = [];
        rowLabelIndex = [];
        rowLabelDetail = [];
        values = [];
        origins = [];
        rows = 1;
        cols = 1;
        cursor = null;
        sources = [];
        winner = null;
        answer = null;
        answerBox.setAttribute('opacity', '0');
        answerText.setAttribute('opacity', '0');
        capacityText.textContent = '';
        captionText.textContent = '';
      },
    };
  },
};
