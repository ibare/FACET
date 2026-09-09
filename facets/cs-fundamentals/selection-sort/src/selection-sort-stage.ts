/**
 * 선택 정렬 전용 stage view.
 *
 * 화면은 둘로 나뉜다.
 *
 *   위 — 배열 한 줄. 왼쪽에 **확정된 구간이 자라고**, 그 오른쪽 첫 칸이 이번
 *        바퀴가 채울 자리다. 훑는 자리는 주황, 최솟값 표식은 노랑 `min` 딱지가
 *        머리 위에 붙어 옮겨 다닌다. 훑는 동안 값은 하나도 움직이지 않는다.
 *
 *   아래 — 바퀴마다 한 줄인 **견줌 장부**. 견줌 하나가 칸 하나로 쌓여, 바퀴가
 *        돌수록 줄이 한 칸씩 짧아지는 계단이 남는다 (6·5·4·3·2·1). 오른쪽 끝에
 *        이동 표시가 한 열로 서므로 "견줌은 많고 이동은 적다" 가 두 그림의
 *        길이 차이로 보인다. 이동이 없던 바퀴는 그 자리에 짧은 줄만 남는다.
 *
 * 세로는 mount 에서 자료 길이를 보고 한 번 정하고 그 뒤로 바꾸지 않는다 (S-view).
 * 스스로 도는 타이머도, 예약도 두지 않는다 — `destroy()` 는 붙인 노드를 거두는
 * 것이 전부다.
 *
 * 색은 전부 design-tokens 경유다 (S-view 결정 트리). 상태색은 state 어휘를 그대로
 * 쓴다 — 견줌 = itemComparing, 맞바꿈 = itemSwapping, 확정 = itemSorted,
 * 표식 = itemPivot. 확정 구간 tint 는 region 어휘 (sortedTailBg/Border).
 *
 * 화면 문안은 이 파일에 없다. `params.t` 로 키를 조회하고 문장은 `facet.ts` 의
 * `messages` 에 있다 (C10). 도형에 새겨진 `min` 과 코드의 변수를 그대로 부르는
 * `i=0` 은 표식이라 상수로 둔다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 도형에 새겨진 표식 — 번역하지 않는다 (C10 "표식이냐 문안이냐" 1·3). */
const MIN_MARK = 'min';
const SEAT_VAR = 'i';

const W = PIECE_CANVAS_W;
const PAD = 24;

const CAPTION_Y1 = 20;
const CAPTION_Y2 = 36;
const CHIP_Y = 46;
const CHIP_H = 16;
const CELL_Y = 70;
const CELL_H = 46;
const INDEX_Y = 134;
const LEDGER_HEAD_Y = 158;
const LEDGER_TOP = 168;
const ROW_H = 24;

const CELL_GAP = 8;
const CELL_MAX_W = 62;
const UNIT_PITCH_MAX = 34;
const UNIT_H = 13;
const LABEL_W = 40;
const COUNT_W = 40;
const MOVE_W = 26;
const CAPTION_MAX_CHARS = 78;

type CellState = 'comparing' | 'swapping' | null;

/** 자료 길이 하나로 정해지는 캔버스 세로. mount 에서 한 번만 쓴다. */
function canvasHeight(n: number): number {
  const rows = Math.max(1, n - 1);
  return LEDGER_TOP + rows * ROW_H + 22 + 16;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

/** 캡션을 두 줄까지 접는다. SVG text 는 스스로 줄바꿈하지 않는다. */
function wrap(text: string, max: number): [string, string] {
  if (text.length <= max) return [text, ''];
  const words = text.split(' ');
  let first = '';
  let rest = '';
  for (const word of words) {
    if (rest === '' && (first === '' || first.length + 1 + word.length <= max)) {
      first = first === '' ? word : `${first} ${word}`;
    } else {
      rest = rest === '' ? word : `${rest} ${word}`;
    }
  }
  return [first, rest];
}

export const selectionSortStageView: CanvasView = {
  canvas: { height: canvasHeight(7) },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽만 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const seed = params.initialData as { values?: unknown } | undefined;
    const initial = Array.isArray(seed?.values)
      ? seed.values.filter((x): x is number => typeof x === 'number')
      : [];
    const n = initial.length > 0 ? initial.length : 7;
    const rows = Math.max(1, n - 1);
    const H = canvasHeight(n);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const root = el('g', {});
    svg.appendChild(root);

    // ── 기하 ────────────────────────────────────────────────────────────
    const cellW = Math.min(CELL_MAX_W, (W - PAD * 2 - CELL_GAP * (n - 1)) / n);
    const rowW = n * cellW + CELL_GAP * (n - 1);
    const cellX0 = (W - rowW) / 2;
    const cellCx = (i: number): number => cellX0 + i * (cellW + CELL_GAP) + cellW / 2;

    const pitch = Math.min(UNIT_PITCH_MAX, Math.floor(400 / rows));
    const unitW = Math.max(4, pitch - 6);
    const ledgerW = LABEL_W + 8 + rows * pitch + 8 + COUNT_W + 18 + MOVE_W;
    const ledgerX0 = Math.max(PAD, (W - ledgerW) / 2);
    const unitX0 = ledgerX0 + LABEL_W + 8;
    const countX = unitX0 + rows * pitch + 8;
    const moveCx = countX + COUNT_W + 18 + MOVE_W / 2;
    const rowY = (p: number): number => LEDGER_TOP + p * ROW_H;

    // ── 캡션 ────────────────────────────────────────────────────────────
    const caption1 = el('text', {
      x: W / 2,
      y: CAPTION_Y1,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.text,
    });
    const caption2 = el('text', {
      x: W / 2,
      y: CAPTION_Y2,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.text,
    });
    root.appendChild(caption1);
    root.appendChild(caption2);

    // ── 확정 구간 tint (칸보다 뒤에 그린다) ─────────────────────────────
    const settledBand = el('rect', {
      x: cellX0 - 5,
      y: CELL_Y - 5,
      width: 0,
      height: CELL_H + 10,
      rx: 6,
      fill: c.sortedTailBg,
      stroke: c.sortedTailBorder,
      'stroke-width': 1,
      'stroke-opacity': 0.35,
      visibility: 'hidden',
    });
    root.appendChild(settledBand);

    // ── min 딱지 ────────────────────────────────────────────────────────
    const chip = el('g', { visibility: 'hidden' });
    const chipBox = el('rect', {
      x: 0,
      y: CHIP_Y,
      width: 34,
      height: CHIP_H,
      rx: 4,
      fill: c.itemPivot,
    });
    const chipText = el('text', {
      x: 0,
      y: CHIP_Y + 12,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      fill: c.stateInk,
    });
    chipText.textContent = MIN_MARK;
    const chipTip = el('polygon', { points: '0,0 0,0 0,0', fill: c.itemPivot });
    chip.appendChild(chipBox);
    chip.appendChild(chipTip);
    chip.appendChild(chipText);
    root.appendChild(chip);

    // ── 배열 칸 ─────────────────────────────────────────────────────────
    const cellRects: SVGRectElement[] = [];
    const cellTexts: SVGTextElement[] = [];
    const indexTexts: SVGTextElement[] = [];
    for (let i = 0; i < n; i++) {
      const x = cellX0 + i * (cellW + CELL_GAP);
      const rect = el('rect', {
        x,
        y: CELL_Y,
        width: cellW,
        height: CELL_H,
        rx: 5,
        fill: c.itemDefault,
        stroke: c.border,
        'stroke-width': 1,
      });
      const text = el('text', {
        x: x + cellW / 2,
        y: CELL_Y + CELL_H / 2 + 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        fill: c.text,
      });
      const label = el('text', {
        x: x + cellW / 2,
        y: INDEX_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      label.textContent = String(i);
      root.appendChild(rect);
      root.appendChild(text);
      root.appendChild(label);
      cellRects.push(rect);
      cellTexts.push(text);
      indexTexts.push(label);
    }

    // ── 장부 머리 ───────────────────────────────────────────────────────
    const headCompares = el('text', {
      x: unitX0,
      y: LEDGER_HEAD_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });
    headCompares.textContent = tr('label.compares', 'Comparisons');
    const headMoves = el('text', {
      x: moveCx,
      y: LEDGER_HEAD_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });
    headMoves.textContent = tr('label.moves', 'Moves');
    root.appendChild(headCompares);
    root.appendChild(headMoves);

    // ── 장부 줄 ─────────────────────────────────────────────────────────
    type LedgerRow = {
      band: SVGRectElement;
      label: SVGTextElement;
      units: SVGRectElement[];
      count: SVGTextElement;
      moveDot: SVGCircleElement;
      moveDash: SVGLineElement;
      filled: number;
    };
    const ledger: LedgerRow[] = [];
    for (let p = 0; p < rows; p++) {
      const y = rowY(p);
      const band = el('rect', {
        x: ledgerX0 - 6,
        y: y + 1,
        width: ledgerW + 12,
        height: ROW_H - 2,
        rx: 4,
        fill: c.bgSubtle,
        visibility: 'hidden',
      });
      const label = el('text', {
        x: ledgerX0,
        y: y + ROW_H / 2 + 4,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      label.textContent = `${SEAT_VAR}=${p}`;
      root.appendChild(band);
      root.appendChild(label);

      const capacity = rows - p;
      const units: SVGRectElement[] = [];
      for (let u = 0; u < capacity; u++) {
        const unit = el('rect', {
          x: unitX0 + u * pitch,
          y: y + (ROW_H - UNIT_H) / 2,
          width: unitW,
          height: UNIT_H,
          rx: 2,
          fill: 'none',
          stroke: c.border,
          'stroke-width': 1,
        });
        root.appendChild(unit);
        units.push(unit);
      }

      const count = el('text', {
        x: unitX0 + capacity * pitch + 8,
        y: y + ROW_H / 2 + 4,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      const moveDot = el('circle', {
        cx: moveCx,
        cy: y + ROW_H / 2,
        r: 6,
        fill: c.itemSwapping,
        visibility: 'hidden',
      });
      const moveDash = el('line', {
        x1: moveCx - 5,
        y1: y + ROW_H / 2,
        x2: moveCx + 5,
        y2: y + ROW_H / 2,
        stroke: c.textMuted,
        'stroke-width': 1.5,
        visibility: 'hidden',
      });
      root.appendChild(count);
      root.appendChild(moveDot);
      root.appendChild(moveDash);

      ledger.push({ band, label, units, count, moveDot, moveDash, filled: 0 });
    }

    // ── 합계 ────────────────────────────────────────────────────────────
    const totalText = el('text', {
      x: W / 2,
      y: LEDGER_TOP + rows * ROW_H + 20,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.text,
    });
    root.appendChild(totalText);

    // ── 상태 ────────────────────────────────────────────────────────────
    // 러너는 mount 직후 projector 의 onInit 이 `setData` 를 부르지만, 러너 밖에서
    // 그냥 띄웠을 때도 빈 칸으로 남지 않도록 씨앗 자료로 한 번 채워 둔다.
    let values: number[] = [...initial];
    for (let i = 0; i < n; i++) {
      const text = cellTexts[i];
      const value = values[i];
      if (text !== undefined && value !== undefined) text.textContent = String(value);
    }
    const cellStates: CellState[] = new Array<CellState>(n).fill(null);
    const settled: boolean[] = new Array<boolean>(n).fill(false);
    let seat: number | null = null;
    let minMarker: number | null = null;
    let cursor: number | null = null;

    function paintCell(i: number): void {
      const rect = cellRects[i];
      const text = cellTexts[i];
      if (rect === undefined || text === undefined) return;
      let fill = c.itemDefault;
      let ink = c.text;
      if (settled[i] === true) {
        fill = c.itemSorted;
        ink = c.textInverse;
      } else if (cellStates[i] === 'swapping') {
        fill = c.itemSwapping;
        ink = c.stateInk;
      } else if (cellStates[i] === 'comparing') {
        fill = c.itemComparing;
        ink = c.stateInk;
      } else if (minMarker === i) {
        fill = c.itemPivot;
        ink = c.stateInk;
      }
      rect.setAttribute('fill', fill);
      text.setAttribute('fill', ink);
      const isSeat = seat === i && settled[i] !== true;
      rect.setAttribute('stroke', isSeat ? c.text : c.border);
      rect.setAttribute('stroke-width', isSeat ? '2.5' : '1');
      const label = indexTexts[i];
      if (label !== undefined) label.setAttribute('fill', isSeat ? c.text : c.textMuted);
    }

    function paintAll(): void {
      for (let i = 0; i < n; i++) paintCell(i);
    }

    function paintChip(): void {
      if (minMarker === null) {
        chip.setAttribute('visibility', 'hidden');
        return;
      }
      const cx = cellCx(minMarker);
      chip.setAttribute('visibility', 'visible');
      chipBox.setAttribute('x', String(cx - 17));
      chipText.setAttribute('x', String(cx));
      chipTip.setAttribute(
        'points',
        `${cx - 5},${CHIP_Y + CHIP_H} ${cx + 5},${CHIP_Y + CHIP_H} ${cx},${CHIP_Y + CHIP_H + 6}`,
      );
    }

    function paintSettledBand(): void {
      let count = 0;
      while (count < n && settled[count] === true) count += 1;
      if (count === 0) {
        settledBand.setAttribute('visibility', 'hidden');
        return;
      }
      const width = count * cellW + (count - 1) * CELL_GAP + 10;
      settledBand.setAttribute('visibility', 'visible');
      settledBand.setAttribute('width', String(width));
    }

    function setActiveRow(pass: number | null): void {
      for (let p = 0; p < ledger.length; p++) {
        const row = ledger[p];
        if (row === undefined) continue;
        const active = pass !== null && p === pass - 1;
        row.band.setAttribute('visibility', active ? 'visible' : 'hidden');
        row.label.setAttribute('fill', active ? c.text : c.textMuted);
      }
    }

    const instance: ViewInstance = {
      destroy(): void {
        // 타이머도 옵저버도 없다. 붙인 것은 이 <g> 하나뿐이라 그것만 거둔다.
        root.remove();
      },

      setData(next: number[]): void {
        values = [...next];
        for (let i = 0; i < n; i++) {
          const text = cellTexts[i];
          if (text === undefined) continue;
          const value = values[i];
          text.textContent = value === undefined ? '' : String(value);
        }
        paintAll();
      },

      setCaption(text: string): void {
        const [a, b] = wrap(text, CAPTION_MAX_CHARS);
        caption1.textContent = a;
        caption2.textContent = b;
      },

      setSeat(index: number | null): void {
        const previous = seat;
        seat = index;
        if (previous !== null) paintCell(previous);
        if (seat !== null) paintCell(seat);
      },

      setMinMarker(index: number | null): void {
        const previous = minMarker;
        minMarker = index;
        if (previous !== null) paintCell(previous);
        if (minMarker !== null) paintCell(minMarker);
        paintChip();
      },

      setCursor(index: number | null): void {
        const previous = cursor;
        if (previous !== null && cellStates[previous] === 'comparing') {
          cellStates[previous] = null;
          paintCell(previous);
        }
        cursor = index;
        if (cursor !== null) {
          cellStates[cursor] = 'comparing';
          paintCell(cursor);
        }
      },

      flashSwap(i: number, j: number): void {
        for (const k of [i, j]) {
          if (k < 0 || k >= n) continue;
          cellStates[k] = 'swapping';
          paintCell(k);
        }
      },

      clearTransient(): void {
        cursor = null;
        for (let i = 0; i < n; i++) {
          if (cellStates[i] === null) continue;
          cellStates[i] = null;
          paintCell(i);
        }
      },

      swapValues(i: number, j: number): void {
        const a = values[i];
        const b = values[j];
        if (a === undefined || b === undefined) return;
        values[i] = b;
        values[j] = a;
        const ti = cellTexts[i];
        const tj = cellTexts[j];
        if (ti !== undefined) ti.textContent = String(b);
        if (tj !== undefined) tj.textContent = String(a);
      },

      markSettled(index: number): void {
        if (index < 0 || index >= n) return;
        settled[index] = true;
        paintCell(index);
        paintSettledBand();
      },

      beginPass(pass: number): void {
        setActiveRow(pass);
      },

      addCompare(pass: number): void {
        const row = ledger[pass - 1];
        if (row === undefined) return;
        const unit = row.units[row.filled];
        if (unit === undefined) return;
        unit.setAttribute('fill', c.itemComparing);
        unit.setAttribute('stroke', 'none');
        row.filled += 1;
        row.count.setAttribute('fill', c.text);
        row.count.textContent = String(row.filled);
      },

      endPass(pass: number, compares: number, swapped: boolean): void {
        const row = ledger[pass - 1];
        if (row === undefined) return;
        row.count.textContent = String(compares);
        row.count.setAttribute('fill', c.text);
        row.moveDot.setAttribute('visibility', swapped ? 'visible' : 'hidden');
        row.moveDash.setAttribute('visibility', swapped ? 'hidden' : 'visible');
        // 바퀴가 끝나면 "지금 도는 줄" 표시는 거둔다. 쌓인 칸과 셈은 남는다.
        setActiveRow(null);
      },

      setTotals(compares: number, moves: number): void {
        totalText.textContent = tr(
          'label.total',
          '{compares} comparisons, {moves} moves',
          { compares, moves },
        );
      },

      reset(): void {
        for (let i = 0; i < n; i++) {
          cellStates[i] = null;
          settled[i] = false;
        }
        seat = null;
        minMarker = null;
        cursor = null;
        paintAll();
        paintChip();
        paintSettledBand();
        setActiveRow(null);
        for (const row of ledger) {
          row.filled = 0;
          for (const unit of row.units) {
            unit.setAttribute('fill', 'none');
            unit.setAttribute('stroke', c.border);
          }
          row.count.textContent = '';
          row.moveDot.setAttribute('visibility', 'hidden');
          row.moveDash.setAttribute('visibility', 'hidden');
        }
        totalText.textContent = '';
        caption1.textContent = '';
        caption2.textContent = '';
      },
    };

    return instance;
  },
};
