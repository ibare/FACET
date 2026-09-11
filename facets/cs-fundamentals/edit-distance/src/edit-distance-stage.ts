/**
 * edit-distance-stage — 왼쪽에 표, 오른쪽에 고침 목록.
 *
 * 표가 차는 것은 이 그림의 주제가 아니라 **전제**다. 수가 조용히 들어차고, 그
 * 뒤에 마지막 칸에서 구석까지 길이 그어진다. 길 위의 칸은 그 자리에서 무엇을
 * 했는지로 물든다 — 지움 · 넣음 · 바꿈, 그리고 그냥 지나간 칸.
 *
 * 오른쪽은 그 길을 읽는 차례로 되돌려 놓은 목록이다. **손잡이가 바꾸는 것이
 * 숫자가 아니라 이 목록**이라, 표와 목록이 한 화면에 나란히 있어야 한다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 낱말이 길어지면 칸을 줄여 담고
 * 판을 키우지 않는다.
 *
 * 타이머도 프레임 루프도 두지 않는다. 걸음의 박자는 algorithm 의 `ctx.sleep` 이
 * 잡으므로 이 view 의 메서드는 전부 동기로 즉시 반영한다 — `destroy()` 뒤에 깨어날
 * 것이 아무것도 없다. 색이 번지는 것은 CSS transition 이 진다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const VIEW_W = 720;
const VIEW_H = 380;

/** 표가 앉는 자리. 오른쪽 목록과 부딪히지 않게 폭을 미리 잘라 둔다. */
const GRID_X = 16;
const GRID_Y = 46;
const GRID_MAX_W = 288;
const GRID_MAX_H = 268;
const CELL_MAX_W = 26;
const CELL_MAX_H = 24;

const PANEL_X = 330;
const WORD_X = PANEL_X + 92;
const BEFORE_Y = 50;
const AFTER_Y = 72;
const ANSWER_Y = 108;
const LIST_LABEL_Y = 140;
const LIST_TOP = 162;
const ROW_H = 23;
/**
 * 목록이 넘치면 그때부터는 그리지 않는다. 판을 늘리지 않는다 (S-view).
 *
 * 여덟은 여유가 아니라 **딱 맞는 수**다 — 지금 낱말 쌍에서 고침이 가장 많은 판
 * (교체 비용 3)이 정확히 여덟이다. `initialData` 의 낱말을 바꾸면 목록이 조용히
 * 잘리므로, 그때는 이 수와 판의 세로를 함께 다시 재야 한다.
 */
const LIST_MAX = 8;

const CAPTION_Y = 362;

function el<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

function text(
  content: string,
  x: number,
  y: number,
  size: string,
  fill: string,
  anchor: 'start' | 'middle' | 'end',
): SVGTextElement {
  const t = el('text');
  t.setAttribute('x', String(x));
  t.setAttribute('y', String(y));
  t.setAttribute('font-family', fonts.body);
  t.setAttribute('font-size', size);
  t.setAttribute('fill', fill);
  t.setAttribute('text-anchor', anchor);
  t.setAttribute('dominant-baseline', 'middle');
  t.textContent = content;
  return t;
}

/** 걸음이 무엇이었는가에 따른 칸 색. 어휘는 state 토큰을 그대로 쓴다 (S-view). */
function fillForOp(op: string, colors: Palette): string {
  switch (op) {
    case 'delete':
      return colors.itemSwapping;
    case 'insert':
      return colors.itemComparing;
    case 'replace':
      return colors.itemPivot;
    default:
      // keep — 손질이 아니라 그냥 지나간 칸.
      return colors.itemSorted;
  }
}

/** 고정 타일 위는 `stateInk`, 테마를 따라 뒤집는 타일 위는 `textInverse`. */
function inkForOp(op: string, colors: Palette): string {
  return op === 'keep' ? colors.textInverse : colors.stateInk;
}

type Cell = { rect: SVGRectElement; label: SVGTextElement };

type Scene = { source: string; target: string };

/** initialData 를 이 그림이 쓰는 만큼만 좁힌다. 좁히는 자리는 mount 하나다 (C9). */
function readScene(initialData: ViewMountParams['initialData']): Scene {
  if (typeof initialData !== 'object' || initialData === null) return { source: '', target: '' };
  const d = initialData as Record<string, unknown>;
  return {
    source: typeof d.source === 'string' ? d.source : '',
    target: typeof d.target === 'string' ? d.target : '',
  };
}

export const editDistanceStageView: CanvasView = {
  canvas: { width: VIEW_W, height: VIEW_H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;

    // 컨테이너를 비우지 않는다 — 러너가 캔버스를 먼저 붙여 두었다 (S-view).
    const root = el('g');
    canvas.appendChild(root);

    const gridLayer = el('g');
    const pathLayer = el('g');
    const listLayer = el('g');
    const chromeLayer = el('g');
    root.append(gridLayer, pathLayer, listLayer, chromeLayer);

    // ── 오른쪽 패널의 붙박이 글자.
    const beforeLabel = text(
      tr('label.before', 'before'),
      PANEL_X,
      BEFORE_Y,
      fontSizes.xs,
      colors.textMuted,
      'start',
    );
    const afterLabel = text(
      tr('label.after', 'after'),
      PANEL_X,
      AFTER_Y,
      fontSizes.xs,
      colors.textMuted,
      'start',
    );
    const answerLabel = text(
      tr('label.answer', 'Answer'),
      PANEL_X,
      ANSWER_Y,
      fontSizes.xs,
      colors.textMuted,
      'start',
    );
    const listLabel = text(
      tr('label.fixList', 'Fix list'),
      PANEL_X,
      LIST_LABEL_Y,
      fontSizes.xs,
      colors.textMuted,
      'start',
    );
    const sourceWord = text('', WORD_X, BEFORE_Y, fontSizes.md, colors.text, 'start');
    sourceWord.setAttribute('font-family', fonts.mono);
    const targetWord = text('', WORD_X, AFTER_Y, fontSizes.md, colors.text, 'start');
    targetWord.setAttribute('font-family', fonts.mono);
    const answerValue = text('', WORD_X, ANSWER_Y, fontSizes.xl, colors.text, 'start');
    answerValue.setAttribute('font-family', fonts.mono);

    const caption = text('', VIEW_W / 2, CAPTION_Y, fontSizes.sm, colors.text, 'middle');

    chromeLayer.append(
      beforeLabel,
      afterLabel,
      answerLabel,
      listLabel,
      sourceWord,
      targetWord,
      answerValue,
      caption,
    );

    // ── 갈아 끼워지는 것들.
    let cells: Cell[][] = [];
    let cellW = CELL_MAX_W;
    let cellH = CELL_MAX_H;
    let originX = GRID_X;
    /** 방금 짚은 칸의 테. 다음 걸음에서 거둔다. */
    let ringed: SVGRectElement | null = null;

    const cx = (j: number): number => originX + (j + 1) * cellW + cellW / 2;
    const cy = (i: number): number => GRID_Y + (i + 1) * cellH + cellH / 2;

    function paintDefault(cell: Cell): void {
      cell.rect.setAttribute('fill', colors.itemDefault);
      cell.rect.setAttribute('stroke', colors.border);
      cell.rect.setAttribute('stroke-width', '1');
      cell.label.setAttribute('fill', colors.text);
      cell.label.textContent = '';
    }

    /** 표를 처음부터 다시 세운다. 낱말은 바뀌지 않으므로 자리도 늘 같다. */
    function initTable(rows: number, cols: number, source: string, target: string): void {
      gridLayer.textContent = '';
      pathLayer.textContent = '';
      listLayer.textContent = '';
      cells = [];
      ringed = null;
      answerValue.textContent = '';
      sourceWord.textContent = source;
      targetWord.textContent = target;

      cellW = Math.min(CELL_MAX_W, GRID_MAX_W / Math.max(1, cols + 1));
      cellH = Math.min(CELL_MAX_H, GRID_MAX_H / Math.max(1, rows + 1));
      originX = GRID_X;

      // 머리 줄과 머리 칸의 글자. 데이터에서 온 글자라 문안이 아니다 (C10).
      for (let j = 1; j < cols; j += 1) {
        gridLayer.appendChild(
          text(
            target[j - 1] ?? '',
            cx(j),
            GRID_Y + cellH / 2,
            fontSizes.sm,
            colors.textMuted,
            'middle',
          ),
        );
      }
      for (let i = 1; i < rows; i += 1) {
        gridLayer.appendChild(
          text(
            source[i - 1] ?? '',
            originX + cellW / 2,
            cy(i),
            fontSizes.sm,
            colors.textMuted,
            'middle',
          ),
        );
      }

      for (let i = 0; i < rows; i += 1) {
        const row: Cell[] = [];
        for (let j = 0; j < cols; j += 1) {
          const rect = el('rect');
          rect.setAttribute('x', String(cx(j) - cellW / 2 + 1));
          rect.setAttribute('y', String(cy(i) - cellH / 2 + 1));
          rect.setAttribute('width', String(cellW - 2));
          rect.setAttribute('height', String(cellH - 2));
          rect.setAttribute('rx', '3');
          rect.style.transition = 'fill 220ms ease';
          const label = text('', cx(j), cy(i), fontSizes.xs, colors.text, 'middle');
          label.setAttribute('font-family', fonts.mono);
          const cell: Cell = { rect, label };
          paintDefault(cell);
          gridLayer.append(rect, label);
          row.push(cell);
        }
        cells.push(row);
      }
    }

    function setCell(i: number, j: number, value: number): void {
      const cell = cells[i]?.[j];
      if (!cell) return;
      cell.label.textContent = String(value);
    }

    function setAnswer(value: number): void {
      answerValue.textContent = String(value);
    }

    function ring(rect: SVGRectElement): void {
      if (ringed) {
        ringed.setAttribute('stroke', colors.border);
        ringed.setAttribute('stroke-width', '1');
      }
      rect.setAttribute('stroke', colors.auxCursor);
      rect.setAttribute('stroke-width', '2');
      ringed = rect;
    }

    /** 되짚은 한 걸음 — 칸을 물들이고 이웃까지 줄을 긋는다. */
    function markPath(i: number, j: number, pi: number, pj: number, op: string): void {
      const cell = cells[i]?.[j];
      if (!cell) return;
      cell.rect.setAttribute('fill', fillForOp(op, colors));
      cell.label.setAttribute('fill', inkForOp(op, colors));

      const line = el('line');
      line.setAttribute('x1', String(cx(j)));
      line.setAttribute('y1', String(cy(i)));
      line.setAttribute('x2', String(cx(pj)));
      line.setAttribute('y2', String(cy(pi)));
      line.setAttribute('stroke', colors.auxCursor);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-linecap', 'round');
      pathLayer.appendChild(line);
    }

    /** 고침 한 줄. 표의 그 칸에 테를 둘러 어디서 온 줄인지 잇는다. */
    function addFix(index: number, i: number, j: number, op: string, label: string): void {
      const cell = cells[i]?.[j];
      if (cell) ring(cell.rect);
      if (index >= LIST_MAX) return;

      const y = LIST_TOP + index * ROW_H;
      const swatch = el('rect');
      swatch.setAttribute('x', String(PANEL_X));
      swatch.setAttribute('y', String(y - 5));
      swatch.setAttribute('width', '10');
      swatch.setAttribute('height', '10');
      swatch.setAttribute('rx', '2');
      swatch.setAttribute('fill', fillForOp(op, colors));
      const order = text(
        String(index + 1),
        PANEL_X + 26,
        y,
        fontSizes.xs,
        colors.textMuted,
        'end',
      );
      order.setAttribute('font-family', fonts.mono);
      listLayer.append(swatch, order, text(label, PANEL_X + 36, y, fontSizes.sm, colors.text, 'start'));
    }

    function setCaption(value: string): void {
      caption.textContent = value;
    }

    /** 길과 목록만 거둔다. 표의 수는 곧 다시 채워진다. */
    function clearAll(): void {
      pathLayer.textContent = '';
      listLayer.textContent = '';
      answerValue.textContent = '';
      caption.textContent = '';
      ringed = null;
      for (const row of cells) for (const cell of row) paintDefault(cell);
    }

    // ── 마운트 즉시 빈 표를 그려 둔다. 러너가 곧 table-init 으로 다시 부르지만,
    //    그 전에도 빈 캔버스가 보이는 일이 없어야 한다.
    const seed = readScene(params.initialData);
    initTable(seed.source.length + 1, seed.target.length + 1, seed.source, seed.target);

    return {
      destroy() {
        // 타이머도 리스너도 두지 않았다. 붙인 것은 이 `<g>` 하나뿐이라 그것만 거둔다.
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      initTable,
      setCell,
      setAnswer,
      markPath,
      addFix,
      setCaption,
      clearAll,
    };
  },
};
