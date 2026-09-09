/**
 * 백트래킹 Projector — 알고리즘 이벤트를 stage(backtracking-stage) 와
 * codePanel(code-view) 로 번역한다.
 *
 * 화면 문안은 이 파일에 없다. 키와 en 원본만 있고 실제 문장은 `facet.ts` 의
 * `messages` 에 있다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type BacktrackingStage = {
  setBoardSize(size: number): void;
  setCurrentRow(row: number | null): void;
  showCheck(row: number, col: number, safe: boolean, blockerRow: number, blockerCol: number): void;
  clearCheck(): void;
  placeQueen(row: number, col: number): void;
  removeQueen(row: number): void;
  addSolution(cols: number[]): void;
  pushTrail(kind: 'place' | 'undo', depth: number): void;
  markTrailSolution(): void;
  setCaption(text: string): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

export const backtrackingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as BacktrackingStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  // en 원본은 호출부 리터럴로 남긴다 — 추출기가 리터럴만 읽는다 (C10).
  const tr: Translate = runtime?.t ?? makeTranslator();

  /** 판의 한 변. `descend` 가 판 밖으로 내려가는 순간을 가려내는 데 쓴다. */
  let size = 4;

  return {
    onInit(initialData) {
      const data = initialData as { n?: number } | undefined;
      const n = num(data?.n) ?? 4;
      size = n;
      stage?.setBoardSize(n);
      stage?.setCaption(
        tr('caption.start', 'Fill one row at a time — find every way to seat four queens.'),
      );
    },

    onEvent(event) {
      switch (event.type) {
        case 'row-enter': {
          const row = num((event.payload as { row?: number } | undefined)?.row);
          if (row === undefined) break;
          stage?.clearCheck();
          stage?.setCurrentRow(row);
          stage?.setCaption(
            tr('caption.enterRow', 'Row {row}: which column can take a queen?', { row }),
          );
          break;
        }

        case 'column-check': {
          const p = event.payload as
            | {
                row?: number;
                col?: number;
                safe?: boolean;
                blockerRow?: number;
                blockerCol?: number;
                reason?: string;
              }
            | undefined;
          const row = num(p?.row);
          const col = num(p?.col);
          if (row === undefined || col === undefined) break;
          const safe = p?.safe === true;
          const blockerRow = num(p?.blockerRow) ?? -1;
          const blockerCol = num(p?.blockerCol) ?? -1;
          stage?.showCheck(row, col, safe, blockerRow, blockerCol);
          if (safe) {
            stage?.setCaption(
              tr('caption.safe', 'Column {col} is clear — no queen above reaches it.', { col }),
            );
          } else if (p?.reason === 'column') {
            stage?.setCaption(
              tr('caption.blockedColumn', 'Column {col} is already taken by the queen in row {r}.', {
                col,
                r: blockerRow,
              }),
            );
          } else {
            stage?.setCaption(
              tr(
                'caption.blockedDiagonal',
                'Column {col} sits on the diagonal of the queen in row {r}.',
                { col, r: blockerRow },
              ),
            );
          }
          break;
        }

        case 'place': {
          const p = event.payload as { row?: number; col?: number } | undefined;
          const row = num(p?.row);
          const col = num(p?.col);
          if (row === undefined || col === undefined) break;
          stage?.placeQueen(row, col);
          stage?.pushTrail('place', row + 1);
          stage?.setCaption(
            tr('caption.place', 'Seat a queen at row {row}, column {col}.', { row, col }),
          );
          break;
        }

        case 'descend': {
          const p = event.payload as { from?: number; to?: number } | undefined;
          const from = num(p?.from);
          const to = num(p?.to);
          if (from === undefined || to === undefined) break;
          stage?.clearCheck();
          stage?.setCurrentRow(to);
          // 마지막 행에서 내려가면 판 밖이다. 그 한 걸음이 곧 해를 알아채는 자리다.
          stage?.setCaption(
            to >= size
              ? tr('caption.descendFull', 'Every row holds a queen now — go down and see.')
              : tr('caption.descend', 'Row {from} holds — go down to row {to}.', { from, to }),
          );
          break;
        }

        case 'undo': {
          const p = event.payload as { row?: number; col?: number } | undefined;
          const row = num(p?.row);
          const col = num(p?.col);
          if (row === undefined || col === undefined) break;
          stage?.removeQueen(row);
          stage?.pushTrail('undo', row);
          stage?.setCurrentRow(row);
          stage?.setCaption(
            tr(
              'caption.undo',
              'Take the queen back from row {row}, column {col} and try the next column.',
              { row, col },
            ),
          );
          break;
        }

        case 'solution': {
          const p = event.payload as { index?: number; cols?: unknown } | undefined;
          const index = num(p?.index);
          const raw: unknown[] = Array.isArray(p?.cols) ? p.cols : [];
          const cols: number[] = [];
          for (const c of raw) if (typeof c === 'number') cols.push(c);
          if (index === undefined || cols.length === 0) break;
          stage?.addSolution(cols);
          stage?.markTrailSolution();
          // `[1, 3, 0, 2]` 는 각 행의 열 번호를 적은 수식 표기다 (C10 표식).
          stage?.setCaption(
            tr('caption.solution', 'Solution {index}: {cols}. The search does not stop here.', {
              index,
              cols: `[${cols.join(', ')}]`,
            }),
          );
          break;
        }

        case 'row-exit': {
          const p = event.payload as { row?: number; found?: number } | undefined;
          const row = num(p?.row);
          const found = num(p?.found);
          if (row === undefined || found === undefined) break;
          stage?.clearCheck();
          stage?.setCaption(
            found === 0
              ? tr('caption.rowExitEmpty', 'No column works in row {row} — step back up.', { row })
              : tr('caption.rowExitFound', 'Row {row} hands {found} solutions back up.', {
                  row,
                  found,
                }),
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
            | { solutions?: number; places?: number; undos?: number }
            | undefined;
          const count = num(p?.solutions);
          const places = num(p?.places);
          const undos = num(p?.undos);
          codePanel?.clearHighlight();
          stage?.clearCheck();
          stage?.setCurrentRow(null);
          if (count !== undefined && places !== undefined && undos !== undefined) {
            stage?.setCaption(
              tr(
                'caption.done',
                '{count} solutions. Placed {places} times, took back {undos} times.',
                { count, places, undos },
              ),
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
