/**
 * 동적 계획법 Projector — 알고리즘 이벤트를 stage(dynamic-programming-stage) 와
 * codePanel(code-view) 로 번역한다.
 *
 * 화면 문안은 이 파일에 없다. 키와 en 원본만 있고 실제 문장은 `facet.ts` 의
 * `messages` 에 있다 (C10).
 *
 * 칸의 자리는 `payload.row` / `payload.col` 이 정규 경로다. target 의
 * `cell:<행>-<열>` 은 어느 칸이 바뀌었는지의 표시이며, 여기서 문자열을 쪼개
 * 읽지 않는다 (C1).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type Item = { weight: number; value: number };

type Source = { row: number; col: number; kind: 'skip' | 'take' };

type DynamicProgrammingStage = {
  setTable(rows: number, cols: number, items: Item[], capacity: number): void;
  setRow(row: number, values: number[]): void;
  setCursor(row: number | null, col: number | null): void;
  setSources(sources: Source[]): void;
  setWinner(winner: 'skip' | 'take' | null): void;
  setCell(row: number, col: number, value: number, origin: 'base' | 'skip' | 'take'): void;
  setAnswer(row: number, col: number, value: number): void;
  setCaption(text: string): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/** payload 의 `items` 를 무게/값 쌍으로 좁힌다. 하나라도 어긋나면 빈 배열. */
function toItems(raw: unknown): Item[] {
  if (!Array.isArray(raw)) return [];
  const out: Item[] = [];
  for (const entry of raw) {
    const e = entry as { weight?: unknown; value?: unknown } | undefined;
    const weight = num(e?.weight);
    const value = num(e?.value);
    if (weight === undefined || value === undefined) return [];
    out.push({ weight, value });
  }
  return out;
}

export const dynamicProgrammingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as DynamicProgrammingStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  // en 원본은 호출부 리터럴로 남긴다 — 추출기가 리터럴만 읽는다 (C10).
  const tr: Translate = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData) {
      // 재생을 누르기 전에도 빈 표가 보여야 한다. 크기는 선언된 자료에서 얻고,
      // 값은 알고리즘이 `table-ready` 부터 하나씩 채운다.
      stage?.reset();
      const d = initialData as
        | { weights?: unknown; values?: unknown; capacity?: unknown }
        | undefined;
      const items = toItems(
        Array.isArray(d?.weights) && Array.isArray(d?.values)
          ? d.weights.map((weight, k) => ({ weight, value: (d.values as unknown[])[k] }))
          : [],
      );
      const capacity = num(d?.capacity);
      if (items.length > 0 && capacity !== undefined) {
        stage?.setTable(items.length + 1, capacity + 1, items, capacity);
      }
      stage?.setCaption(tr('caption.start', 'Fill the table left to right, top to bottom.'));
    },

    onEvent(event) {
      switch (event.type) {
        case 'table-ready': {
          const p = event.payload as
            | { rows?: number; cols?: number; capacity?: number; items?: unknown }
            | undefined;
          const rows = num(p?.rows);
          const cols = num(p?.cols);
          const capacity = num(p?.capacity);
          if (rows === undefined || cols === undefined || capacity === undefined) break;
          stage?.setTable(rows, cols, toItems(p?.items), capacity);
          // 0 행 — 아무 물건도 안 썼으니 어느 한도에서도 값어치는 0 이다.
          stage?.setRow(0, new Array<number>(cols).fill(0));
          stage?.setCaption(
            tr(
              'caption.tableReady',
              'Row 0 means no item at all — every limit is worth 0.',
            ),
          );
          break;
        }

        case 'cell-pick': {
          const p = event.payload as
            | { row?: number; col?: number; item?: number; itemWeight?: number; itemValue?: number }
            | undefined;
          const row = num(p?.row);
          const col = num(p?.col);
          const item = num(p?.item);
          const itemWeight = num(p?.itemWeight);
          const itemValue = num(p?.itemValue);
          if (row === undefined || col === undefined) break;
          stage?.setSources([]);
          stage?.setCursor(row, col);
          if (item !== undefined && itemWeight !== undefined && itemValue !== undefined) {
            stage?.setCaption(
              tr(
                'caption.pickCell',
                'Items 1..{item} with limit {limit}. Item {item} weighs {weight} and is worth {value}.',
                { item, limit: col, weight: itemWeight, value: itemValue },
              ),
            );
          }
          break;
        }

        case 'weight-checked': {
          const p = event.payload as
            | { itemWeight?: number; limit?: number; fits?: boolean; item?: number }
            | undefined;
          const itemWeight = num(p?.itemWeight);
          const limit = num(p?.limit);
          const item = num(p?.item);
          if (itemWeight === undefined || limit === undefined || item === undefined) break;
          stage?.setCaption(
            p?.fits === true
              ? tr('caption.fits', 'Weight {weight} fits in limit {limit} — both routes are open.', {
                  weight: itemWeight,
                  limit,
                })
              : tr(
                  'caption.tooHeavy',
                  'Weight {weight} does not fit in limit {limit} — item {item} cannot go in.',
                  { weight: itemWeight, limit, item },
                ),
          );
          break;
        }

        case 'carry-down': {
          const p = event.payload as
            | { row?: number; col?: number; fromRow?: number; fromCol?: number; value?: number }
            | undefined;
          const row = num(p?.row);
          const col = num(p?.col);
          const fromRow = num(p?.fromRow);
          const fromCol = num(p?.fromCol);
          const value = num(p?.value);
          if (row === undefined || col === undefined || value === undefined) break;
          if (fromRow !== undefined && fromCol !== undefined) {
            stage?.setSources([{ row: fromRow, col: fromCol, kind: 'skip' }]);
            stage?.setWinner('skip');
          }
          stage?.setCell(row, col, value, 'skip');
          stage?.setCaption(
            tr('caption.carryDown', 'Copy {value} straight down from the row above.', { value }),
          );
          break;
        }

        case 'candidates': {
          const p = event.payload as
            | {
                skipRow?: number;
                skipCol?: number;
                skipValue?: number;
                takeRow?: number;
                takeCol?: number;
                takeBase?: number;
                takeGain?: number;
                takeValue?: number;
              }
            | undefined;
          const skipRow = num(p?.skipRow);
          const skipCol = num(p?.skipCol);
          const skipValue = num(p?.skipValue);
          const takeRow = num(p?.takeRow);
          const takeCol = num(p?.takeCol);
          const takeBase = num(p?.takeBase);
          const takeGain = num(p?.takeGain);
          const takeValue = num(p?.takeValue);
          if (skipRow === undefined || skipCol === undefined) break;
          if (takeRow === undefined || takeCol === undefined) break;
          stage?.setSources([
            { row: skipRow, col: skipCol, kind: 'skip' },
            { row: takeRow, col: takeCol, kind: 'take' },
          ]);
          stage?.setWinner(null);
          if (
            skipValue !== undefined &&
            takeBase !== undefined &&
            takeGain !== undefined &&
            takeValue !== undefined
          ) {
            stage?.setCaption(
              tr(
                'caption.candidates',
                'Leave it out: {skip}. Put it in: {base} + {gain} = {take}.',
                { skip: skipValue, base: takeBase, gain: takeGain, take: takeValue },
              ),
            );
          }
          break;
        }

        case 'cell-filled': {
          const p = event.payload as
            | { row?: number; col?: number; value?: number; origin?: string }
            | undefined;
          const row = num(p?.row);
          const col = num(p?.col);
          const value = num(p?.value);
          if (row === undefined || col === undefined || value === undefined) break;
          const origin = p?.origin === 'take' ? 'take' : 'skip';
          stage?.setWinner(origin);
          stage?.setCell(row, col, value, origin);
          stage?.setCaption(
            origin === 'take'
              ? tr('caption.fillTake', 'Putting it in wins — the cell becomes {value}.', { value })
              : tr('caption.fillSkip', 'Leaving it out wins — the cell becomes {value}.', { value }),
          );
          break;
        }

        case 'phase': {
          const phase = (event.payload as { phase?: string } | undefined)?.phase ?? null;
          codePanel?.highlightPhase(phase);
          break;
        }

        case 'done': {
          const p = event.payload as
            | { best?: number; row?: number; col?: number; cells?: number }
            | undefined;
          const best = num(p?.best);
          const row = num(p?.row);
          const col = num(p?.col);
          const cells = num(p?.cells);
          codePanel?.clearHighlight();
          if (best !== undefined && row !== undefined && col !== undefined) {
            stage?.setAnswer(row, col, best);
          }
          if (best !== undefined && cells !== undefined) {
            stage?.setCaption(
              tr('caption.done', '{cells} cells filled once each. The best is {best}.', {
                cells,
                best,
              }),
            );
          }
          break;
        }

        // 그 외 이벤트는 없다. 알고리즘이 발신하는 전부를 위에서 다룬다 (C2).
      }
    },

    onReset() {
      stage?.reset();
      codePanel?.clearHighlight();
    },
  };
};
