/**
 * linear-search-stage — 선형 탐색 전용 stage view.
 *
 * 이 완제품의 주인공은 코드 패널이다. 그래서 stage 는 욕심내지 않고 **지금 보는
 * 칸과 이미 본 자취** 만 정직하게 보인다. 세 층뿐이다 —
 *
 *   1. 찾는 값 — 왼쪽 표찰 하나. 찾았으면 노랑, 못 찾았으면 빨강으로 물든다.
 *   2. 줄 — 칸 여덟. 커서가 얹힌 칸 하나가 주황, 지나온 칸은 옅게 가라앉는다.
 *      줄이 서 있지 않다는 것이 눈에 남아야 하므로 값의 크기는 그리지 않는다.
 *   3. 기록 — 훑기가 끝날 때마다 한 줄. "몇을 찾아 몇 칸을 봤는가" 만 적는다.
 *
 * 조각 `scanUntilFound` 가 두 훑기의 **길이 차이** 를 그렸으므로 여기서는
 * 그것을 그리지 않는다. 기록은 길이의 비교가 아니라 결과의 장부다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 칸 수가 늘면 칸 폭을 줄이고,
 * 기록이 늘면 줄 간격을 줄여 담는다 — 높이를 늘리지 않는다.
 *
 * 타이머도 관찰자도 두지 않는다. `destroy()` 는 자기가 만든 노드만 거둔다.
 *
 * 색은 전부 design-tokens 경유다 (S-view 결정 트리):
 *   커서 얹힌 칸 = state `itemComparing` / 찾은 칸 = state `itemPivot`
 *   못 찾음 표찰 = severity `danger` / 지나온 칸 · 뼈대 = structural
 */

import type { ViewInstance, ViewMountParams, CanvasView } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, makeTranslator } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_W = 660;
const CANVAS_H = 266;

/** 좌우 여백. 모든 층이 이 안쪽에 정렬한다. */
const PAD_X = 70;
const BAND_W = CANVAS_W - PAD_X * 2;

const CHIP_Y = 14;
const CHIP_W = 92;
const CHIP_H = 32;

const CELL_Y = 70;
const CELL_H = 56;
const CELL_GAP = 8;
const INDEX_BASELINE = 142;

const CAPTION_Y1 = 176;
const CAPTION_Y2 = 194;

const LOG_HEAD_BASELINE = 220;
const LOG_TOP = 238;
const LOG_BOTTOM = 258;
const LOG_STEP_MAX = 18;

/** 줄바꿈 폭 계산에 쓰는 캡션 글자 크기 (토큰 문자열에서 뽑는다). */
const CAPTION_PX = Number.parseFloat(fontSizes.md);

export type LinearSearchCellState = 'looking' | 'seen' | 'found' | null;

/** 훑기 하나의 결과. */
export type LinearSearchRecord = { target: number; index: number; examined: number };

type Outcome = 'hit' | 'miss' | null;

/** 대략적인 글자 폭. 한글·아랍·데바나가리는 넓고 라틴은 좁다. */
function glyphWidth(ch: string, size: number): number {
  const code = ch.codePointAt(0) ?? 0;
  const wide =
    (code >= 0x0600 && code <= 0x08ff) || // 아랍
    (code >= 0x0900 && code <= 0x0dff) || // 데바나가리 등
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x3000 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7a3);
  return wide ? size : size * 0.55;
}

function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += glyphWidth(ch, size);
  return w;
}

/** 두 줄까지 담는 단순 줄바꿈. 넘치면 마지막 줄을 잘라 말줄임한다. */
function wrapTwo(text: string, size: number, maxW: number): [string, string] {
  const words = text.split(' ').filter((w) => w.length > 0);
  const lines: string[] = ['', ''];
  let cursor = 0;
  for (const word of words) {
    const candidate = lines[cursor].length === 0 ? word : `${lines[cursor]} ${word}`;
    if (textWidth(candidate, size) <= maxW) {
      lines[cursor] = candidate;
      continue;
    }
    if (cursor === 0) {
      cursor = 1;
      lines[1] = word;
      continue;
    }
    let trimmed = `${lines[1]} ${word}`;
    while (trimmed.length > 1 && textWidth(`${trimmed}…`, size) > maxW) {
      trimmed = trimmed.slice(0, -1);
    }
    lines[1] = `${trimmed}…`;
    break;
  }
  return [lines[0], lines[1]];
}

export const linearSearchStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽만 비운다 (S-view — 컨테이너를 비우면
    // 러너가 먼저 붙여 둔 이 캔버스가 통째로 떨어져 나간다).
    svg.textContent = '';

    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      return node;
    };

    const label = (
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end',
      family: string,
    ): SVGTextElement => {
      const node = el('text', {
        x,
        y,
        'font-size': size,
        'font-family': family,
        fill,
        'text-anchor': anchor,
      });
      svg.appendChild(node);
      return node;
    };

    // ── 상태 ─────────────────────────────
    let values: number[] = [];
    let states: LinearSearchCellState[] = [];
    let cursor: number | null = null;
    let target: number | null = null;
    let outcome: Outcome = null;
    const records: LinearSearchRecord[] = [];

    // ── 층 1. 찾는 값 표찰 ────────────────
    const chip = el('rect', {
      x: PAD_X,
      y: CHIP_Y,
      width: CHIP_W,
      height: CHIP_H,
      rx: 6,
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 1,
    });
    svg.appendChild(chip);
    const chipText = label(
      PAD_X + CHIP_W / 2,
      CHIP_Y + CHIP_H / 2 + 6,
      fontSizes.lg,
      colors.text,
      'middle',
      fonts.mono,
    );

    const targetLabel = label(
      PAD_X + CHIP_W + 14,
      CHIP_Y + 13,
      fontSizes.xs,
      colors.textMuted,
      'start',
      fonts.body,
    );
    targetLabel.textContent = tr('label.target', 'Looking for');

    const roundLabel = label(
      PAD_X + CHIP_W + 14,
      CHIP_Y + 29,
      fontSizes.sm,
      colors.text,
      'start',
      fonts.body,
    );

    // ── 층 2. 줄 ──────────────────────────
    const cursorCaret = el('path', { d: 'M 0 0', fill: colors.text, opacity: 0 });
    svg.appendChild(cursorCaret);

    let cellRects: SVGRectElement[] = [];
    let cellTexts: SVGTextElement[] = [];
    let indexTexts: SVGTextElement[] = [];

    const cellGeometry = (i: number, count: number): { x: number; w: number } => {
      const w = (BAND_W - CELL_GAP * (count - 1)) / count;
      return { x: PAD_X + i * (w + CELL_GAP), w };
    };

    function buildCells(): void {
      for (const node of [...cellRects, ...cellTexts, ...indexTexts]) node.remove();
      cellRects = [];
      cellTexts = [];
      indexTexts = [];

      const count = values.length;
      if (count === 0) return;

      for (let i = 0; i < count; i++) {
        const { x, w } = cellGeometry(i, count);
        const rect = el('rect', {
          x,
          y: CELL_Y,
          width: w,
          height: CELL_H,
          rx: 5,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1,
        });
        svg.appendChild(rect);
        cellRects.push(rect);

        const valueText = label(
          x + w / 2,
          CELL_Y + CELL_H / 2 + 6,
          fontSizes.lg,
          colors.text,
          'middle',
          fonts.mono,
        );
        valueText.textContent = String(values[i]);
        cellTexts.push(valueText);

        const indexText = label(
          x + w / 2,
          INDEX_BASELINE,
          fontSizes.xs,
          colors.textMuted,
          'middle',
          fonts.mono,
        );
        indexText.textContent = String(i);
        indexTexts.push(indexText);
      }
      // 커서 삼각형이 칸 위에 얹혀야 하므로 다시 맨 앞으로 올린다.
      svg.appendChild(cursorCaret);
    }

    function paintCell(i: number): void {
      const rect = cellRects[i];
      const text = cellTexts[i];
      if (!rect || !text) return;
      const state = states[i] ?? null;
      if (state === 'looking') {
        rect.setAttribute('fill', colors.itemComparing);
        rect.setAttribute('stroke', colors.itemComparing);
        text.setAttribute('fill', colors.stateInk);
      } else if (state === 'found') {
        rect.setAttribute('fill', colors.itemPivot);
        rect.setAttribute('stroke', colors.itemPivot);
        text.setAttribute('fill', colors.stateInk);
      } else if (state === 'seen') {
        rect.setAttribute('fill', colors.bgSubtle);
        rect.setAttribute('stroke', colors.border);
        text.setAttribute('fill', colors.textMuted);
      } else {
        rect.setAttribute('fill', colors.itemDefault);
        rect.setAttribute('stroke', colors.border);
        text.setAttribute('fill', colors.text);
      }
    }

    function paintCursor(): void {
      if (cursor === null || cursor < 0 || cursor >= values.length) {
        cursorCaret.setAttribute('opacity', '0');
        return;
      }
      const { x, w } = cellGeometry(cursor, values.length);
      const cx = x + w / 2;
      const tip = CELL_Y - 4;
      const top = tip - 11;
      cursorCaret.setAttribute('d', `M ${cx - 8} ${top} L ${cx + 8} ${top} L ${cx} ${tip} Z`);
      cursorCaret.setAttribute('opacity', '1');
    }

    function paintChip(): void {
      chipText.textContent = target === null ? '' : String(target);
      if (outcome === 'hit') {
        chip.setAttribute('fill', colors.itemPivot);
        chip.setAttribute('stroke', colors.itemPivot);
        chipText.setAttribute('fill', colors.stateInk);
      } else if (outcome === 'miss') {
        chip.setAttribute('fill', colors.danger);
        chip.setAttribute('stroke', colors.danger);
        chipText.setAttribute('fill', colors.stateInk);
      } else {
        chip.setAttribute('fill', colors.bgSubtle);
        chip.setAttribute('stroke', colors.border);
        chipText.setAttribute('fill', colors.text);
      }
    }

    // ── 층 3. 캡션과 기록 ──────────────────
    const captionA = label(PAD_X, CAPTION_Y1, fontSizes.md, colors.text, 'start', fonts.body);
    const captionB = label(PAD_X, CAPTION_Y2, fontSizes.md, colors.text, 'start', fonts.body);

    const logHead = label(
      PAD_X,
      LOG_HEAD_BASELINE,
      fontSizes.xs,
      colors.textMuted,
      'start',
      fonts.body,
    );
    logHead.textContent = tr('label.log', 'Searches so far');

    let logRows: SVGTextElement[] = [];

    function paintLog(): void {
      for (const node of logRows) node.remove();
      logRows = [];
      if (records.length === 0) return;

      // 기록이 늘면 줄 간격을 줄여 담는다. 높이는 늘리지 않는다 (S-view).
      const band = LOG_BOTTOM - LOG_TOP;
      const step =
        records.length <= 1 ? 0 : Math.min(LOG_STEP_MAX, band / (records.length - 1));

      records.forEach((row, i) => {
        const node = label(
          PAD_X,
          LOG_TOP + step * i,
          fontSizes.sm,
          colors.text,
          'start',
          fonts.body,
        );
        node.textContent =
          row.index >= 0
            ? tr('label.rowHit', '{target} — seat {index}, {count} cells looked at', {
                target: row.target,
                index: row.index,
                count: row.examined,
              })
            : tr('label.rowMiss', '{target} — not here, all {count} cells looked at', {
                target: row.target,
                count: row.examined,
              });
        logRows.push(node);
      });
    }

    return {
      setData(next: number[]): void {
        values = [...next];
        states = values.map(() => null);
        cursor = null;
        buildCells();
        for (let i = 0; i < values.length; i++) paintCell(i);
        paintCursor();
      },

      setTarget(value: number | null, round: number, total: number): void {
        target = value;
        outcome = null;
        roundLabel.textContent =
          value === null
            ? ''
            : tr('label.round', 'Search {n} of {total}', { n: round + 1, total });
        paintChip();
      },

      setOutcome(next: Outcome): void {
        outcome = next;
        paintChip();
      },

      setCursor(index: number | null): void {
        cursor = index;
        paintCursor();
      },

      setCellState(index: number, state: LinearSearchCellState): void {
        if (index < 0 || index >= states.length) return;
        states[index] = state;
        paintCell(index);
      },

      clearCells(): void {
        states = values.map(() => null);
        cursor = null;
        for (let i = 0; i < values.length; i++) paintCell(i);
        paintCursor();
      },

      setCaption(text: string): void {
        const [a, b] = wrapTwo(text, CAPTION_PX, BAND_W);
        captionA.textContent = a;
        captionB.textContent = b;
      },

      addRecord(row: LinearSearchRecord): void {
        records.push(row);
        paintLog();
      },

      reset(): void {
        values = [];
        states = [];
        cursor = null;
        target = null;
        outcome = null;
        records.length = 0;
        roundLabel.textContent = '';
        captionA.textContent = '';
        captionB.textContent = '';
        buildCells();
        paintChip();
        paintCursor();
        paintLog();
      },

      destroy(): void {
        // 타이머도 관찰자도 걸지 않았다. 만든 노드만 거둔다.
        for (const node of [...cellRects, ...cellTexts, ...indexTexts, ...logRows]) {
          node.remove();
        }
        cellRects = [];
        cellTexts = [];
        indexTexts = [];
        logRows = [];
        chip.remove();
        chipText.remove();
        targetLabel.remove();
        roundLabel.remove();
        cursorCaret.remove();
        captionA.remove();
        captionB.remove();
        logHead.remove();
      },
    };
  },
};
