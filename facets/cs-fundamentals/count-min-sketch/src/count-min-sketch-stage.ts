/**
 * count-min-sketch-stage — 표 한 폭과 키 열둘의 막대를 한 캔버스에 그린다.
 *
 * 위는 줄 × 칸의 표이고 아래는 키마다의 막대다. 막대는 읽힌 값까지 솟고, 참값 위로
 * 솟은 만큼이 부풀음이다. **자는 판이 바뀌어도 고정이다** — 손잡이를 밀 때 막대가
 * 같은 자 위에서 내려앉는 것이 이 그림의 논증이라, 판마다 자를 다시 재면 그 논증이
 * 사라진다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 폭은 4~16, 깊이는 1~4 로 달라지지만
 * 표가 놓일 자리는 가장 큰 경우에 맞춰 잡아 두고 칸 크기만 그 안에서 줄인다.
 *
 * 타이머도 프레임 루프도 두지 않는다. 걸음의 박자는 algorithm 의 `ctx.sleep` 이
 * 잡으므로 이 view 의 메서드는 전부 동기로 즉시 반영한다 — `destroy()` 뒤에 깨어날
 * 것이 아무것도 없다.
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
const VIEW_H = 320;
const PAD_X = 16;

/** 줄 표식(`r0`..`r3`)이 앉는 자리. */
const ROW_MARK_W = 34;
const GRID_X = PAD_X + ROW_MARK_W;
const GRID_Y = 34;
const GRID_W = VIEW_W - GRID_X - PAD_X;
const CELL_MAX_W = 42;
const CELL_MAX_H = 28;
/** 깊이 4 까지 담을 자리를 미리 잡아 둔다. */
const GRID_MAX_H = 4 * CELL_MAX_H;

const BAR_BASE_Y = 276;
const BAR_MAX_H = 96;
const BAR_MAX_W = 30;

const LEGEND_Y = 22;
const CAPTION_Y = 304;

/** 막대 한 칸의 최소 높이 — 값이 있는데 보이지 않는 일이 없게 한다. */
const BAR_MIN_H = 2;

export type SketchCellRef = { row: number; col: number };

/** 칸이 지금 무엇으로 읽혀야 하는지. 색은 여기서 토큰으로 갈린다. */
export type CellMark = 'hashed' | 'bumped' | 'probed' | 'chosen';

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

/** 표식 위의 잉크. 고정 타일 위는 `stateInk`, 타일 없는 자리는 `text` (design-tokens). */
function inkFor(mark: CellMark | null, colors: Palette): string {
  return mark === null ? colors.text : colors.stateInk;
}

function fillFor(mark: CellMark | null, colors: Palette): string {
  switch (mark) {
    case 'hashed':
      return colors.itemComparing;
    case 'bumped':
      return colors.itemSwapping;
    case 'probed':
      return colors.itemComparing;
    case 'chosen':
      return colors.itemPivot;
    default:
      return colors.itemDefault;
  }
}

type Cell = { rect: SVGRectElement; label: SVGTextElement; mark: CellMark | null };

type Bar = {
  truthRect: SVGRectElement;
  overRect: SVGRectElement;
  truthTick: SVGLineElement;
  readLabel: SVGTextElement;
};

export const countMinSketchStageView: CanvasView = {
  canvas: { width: VIEW_W, height: VIEW_H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;

    // 컨테이너를 비우지 않는다 — 러너가 캔버스를 먼저 붙여 두었다 (S-view).
    const root = el('g');
    canvas.appendChild(root);

    const gridLayer = el('g');
    const barLayer = el('g');
    const chromeLayer = el('g');
    root.append(gridLayer, barLayer, chromeLayer);

    // ── 고정 장식: 범례와 캡션 자리.
    const legendTruth = text(
      tr('label.true', 'true'),
      PAD_X + 14,
      LEGEND_Y,
      fontSizes.xs,
      colors.textMuted,
      'start',
    );
    const legendOver = text(
      tr('label.over', 'overshoot'),
      PAD_X + 92,
      LEGEND_Y,
      fontSizes.xs,
      colors.textMuted,
      'start',
    );
    const truthSwatch = el('rect');
    truthSwatch.setAttribute('x', String(PAD_X));
    truthSwatch.setAttribute('y', String(LEGEND_Y - 5));
    truthSwatch.setAttribute('width', '10');
    truthSwatch.setAttribute('height', '10');
    truthSwatch.setAttribute('fill', colors.itemSorted);
    const overSwatch = el('rect');
    overSwatch.setAttribute('x', String(PAD_X + 78));
    overSwatch.setAttribute('y', String(LEGEND_Y - 5));
    overSwatch.setAttribute('width', '10');
    overSwatch.setAttribute('height', '10');
    overSwatch.setAttribute('fill', colors.danger);
    chromeLayer.append(truthSwatch, legendTruth, overSwatch, legendOver);

    const caption = text(
      '',
      VIEW_W / 2,
      CAPTION_Y,
      fontSizes.sm,
      colors.text,
      'middle',
    );
    chromeLayer.appendChild(caption);

    // ── 갈아 끼워지는 것들.
    let cells: Cell[][] = [];
    let bars: Bar[] = [];
    let marked: SketchCellRef[] = [];
    let scaleMax = 1;

    function paintCell(cell: Cell): void {
      cell.rect.setAttribute('fill', fillFor(cell.mark, colors));
      cell.label.setAttribute('fill', inkFor(cell.mark, colors));
    }

    function clearMarks(): void {
      for (const ref of marked) {
        const cell = cells[ref.row]?.[ref.col];
        if (!cell) continue;
        cell.mark = null;
        paintCell(cell);
      }
      marked = [];
    }

    /** 표와 막대를 처음부터 다시 세운다. */
    function initTable(
      width: number,
      depth: number,
      keys: string[],
      nextScaleMax: number,
    ): void {
      gridLayer.textContent = '';
      barLayer.textContent = '';
      cells = [];
      bars = [];
      marked = [];
      scaleMax = Math.max(1, nextScaleMax);

      const cellW = Math.min(CELL_MAX_W, GRID_W / Math.max(1, width));
      const cellH = Math.min(CELL_MAX_H, GRID_MAX_H / Math.max(1, depth));
      const startX = GRID_X + (GRID_W - cellW * width) / 2;

      for (let r = 0; r < depth; r += 1) {
        const row: Cell[] = [];
        const y = GRID_Y + r * cellH;
        gridLayer.appendChild(
          text(`r${r}`, GRID_X - 10, y + cellH / 2, fontSizes.xs, colors.textMuted, 'end'),
        );
        for (let c = 0; c < width; c += 1) {
          const x = startX + c * cellW;
          const rect = el('rect');
          rect.setAttribute('x', String(x));
          rect.setAttribute('y', String(y));
          rect.setAttribute('width', String(cellW));
          rect.setAttribute('height', String(cellH));
          rect.setAttribute('rx', '2');
          rect.setAttribute('fill', colors.itemDefault);
          rect.setAttribute('stroke', colors.border);
          rect.setAttribute('stroke-width', '1');
          const label = text(
            '0',
            x + cellW / 2,
            y + cellH / 2,
            fontSizes.xs,
            colors.text,
            'middle',
          );
          label.setAttribute('font-family', fonts.mono);
          gridLayer.append(rect, label);
          row.push({ rect, label, mark: null });
        }
        cells.push(row);
      }

      // ── 막대 열둘.
      const slot = (VIEW_W - 2 * PAD_X) / Math.max(1, keys.length);
      const barW = Math.min(BAR_MAX_W, slot - 10);
      for (let i = 0; i < keys.length; i += 1) {
        const cx = PAD_X + slot * (i + 0.5);
        const x = cx - barW / 2;

        const truthRect = el('rect');
        truthRect.setAttribute('x', String(x));
        truthRect.setAttribute('y', String(BAR_BASE_Y));
        truthRect.setAttribute('width', String(barW));
        truthRect.setAttribute('height', '0');
        truthRect.setAttribute('fill', colors.itemSorted);

        const overRect = el('rect');
        overRect.setAttribute('x', String(x));
        overRect.setAttribute('y', String(BAR_BASE_Y));
        overRect.setAttribute('width', String(barW));
        overRect.setAttribute('height', '0');
        overRect.setAttribute('fill', colors.danger);

        const truthTick = el('line');
        truthTick.setAttribute('x1', String(x - 3));
        truthTick.setAttribute('x2', String(x + barW + 3));
        truthTick.setAttribute('y1', String(BAR_BASE_Y));
        truthTick.setAttribute('y2', String(BAR_BASE_Y));
        truthTick.setAttribute('stroke', colors.textMuted);
        truthTick.setAttribute('stroke-width', '1');
        truthTick.setAttribute('stroke-dasharray', '2 2');
        truthTick.setAttribute('opacity', '0');

        const readLabel = text('', cx, BAR_BASE_Y - 8, fontSizes.xs, colors.text, 'middle');
        readLabel.setAttribute('font-family', fonts.mono);

        const keyLabel = text(
          keys[i],
          cx,
          BAR_BASE_Y + 12,
          fontSizes.xs,
          colors.textMuted,
          'middle',
        );

        const baseline = el('line');
        baseline.setAttribute('x1', String(x - 3));
        baseline.setAttribute('x2', String(x + barW + 3));
        baseline.setAttribute('y1', String(BAR_BASE_Y));
        baseline.setAttribute('y2', String(BAR_BASE_Y));
        baseline.setAttribute('stroke', colors.border);
        baseline.setAttribute('stroke-width', '1');

        barLayer.append(baseline, truthRect, overRect, truthTick, readLabel, keyLabel);
        bars.push({ truthRect, overRect, truthTick, readLabel });
      }
    }

    function setCellValue(row: number, col: number, value: number): void {
      const cell = cells[row]?.[col];
      if (!cell) return;
      cell.label.textContent = String(value);
    }

    function markCells(refs: SketchCellRef[], mark: CellMark): void {
      clearMarks();
      for (const ref of refs) {
        const cell = cells[ref.row]?.[ref.col];
        if (!cell) continue;
        cell.mark = mark;
        paintCell(cell);
        marked.push(ref);
      }
    }

    function setBar(index: number, truth: number, read: number): void {
      const bar = bars[index];
      if (!bar) return;
      const unit = BAR_MAX_H / scaleMax;
      const truthH = Math.min(BAR_MAX_H, Math.max(BAR_MIN_H, truth * unit));
      const readH = Math.min(BAR_MAX_H, Math.max(truthH, read * unit));
      const overH = readH - truthH;

      bar.truthRect.setAttribute('y', String(BAR_BASE_Y - truthH));
      bar.truthRect.setAttribute('height', String(truthH));
      bar.overRect.setAttribute('y', String(BAR_BASE_Y - readH));
      bar.overRect.setAttribute('height', String(overH));
      bar.truthTick.setAttribute('y1', String(BAR_BASE_Y - truthH));
      bar.truthTick.setAttribute('y2', String(BAR_BASE_Y - truthH));
      bar.truthTick.setAttribute('opacity', '1');
      bar.readLabel.setAttribute('y', String(BAR_BASE_Y - readH - 8));
      bar.readLabel.textContent = String(read);
      bar.readLabel.setAttribute('fill', read === truth ? colors.textMuted : colors.danger);
    }

    function setCaption(value: string): void {
      caption.textContent = value;
    }

    // ── 마운트 즉시 한 판을 그려 둔다. 러너가 onInit 으로 다시 부르지만, 그 전에도
    //    빈 캔버스가 보이는 일이 없어야 한다.
    const seed = params.initialData as
      | { width?: unknown; depth?: unknown; keys?: unknown; counts?: unknown }
      | undefined;
    const seedWidth = typeof seed?.width === 'number' ? seed.width : 12;
    const seedDepth = typeof seed?.depth === 'number' ? seed.depth : 3;
    const seedKeys = Array.isArray(seed?.keys)
      ? (seed.keys as unknown[]).filter((k): k is string => typeof k === 'string')
      : [];
    const seedCounts = Array.isArray(seed?.counts)
      ? (seed.counts as unknown[]).filter((n): n is number => typeof n === 'number')
      : [];
    const seedTotal = seedCounts.reduce((a, b) => a + b, 0);
    initTable(seedWidth, seedDepth, seedKeys, Math.max(1, Math.ceil(seedTotal / 2)));

    return {
      destroy() {
        // 타이머도 리스너도 두지 않았다. 붙인 것은 이 `<g>` 하나뿐이라 그것만 거둔다.
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      initTable,
      setCellValue,
      markCells,
      clearMarks,
      setBar,
      setCaption,
    };
  },
};
