/**
 * 퀵 정렬 Projector — 알고리즘 이벤트를 stage(quick-sort-stage) 와
 * codePanel(code-view) 로 번역한다.
 *
 * 화면 문안은 이 파일에 없다. 키와 en 원본만 있고 실제 문장은
 * `facet.ts` 의 `messages` 에 있다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator, toIndexArray } from '@ffacet/core/runtime';

type PartitionRow = { lo: number; hi: number; pivotIndex: number; pivotValue: number };

type QuickSortStage = {
  setData(values: number[]): void;
  setCaption(text: string): void;
  setRange(lo: number, hi: number): void;
  setPivot(index: number | null): void;
  setCursor(index: number | null): void;
  setBoundary(index: number | null): void;
  setScanned(index: number | null): void;
  setCellState(index: number, state: 'comparing' | 'swapping' | null): void;
  clearCellStates(): void;
  swapValues(i: number, j: number): void;
  markSettled(index: number): void;
  addPartition(row: PartitionRow): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

export const quickSortProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as QuickSortStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  // en 원본은 호출부 리터럴로 남긴다 — 추출기가 리터럴만 읽는다 (C10).
  const tr: Translate = runtime?.t ?? makeTranslator();

  /** 알고리즘의 배열을 그림자로 따라간다 (맞바꿈 문안에 두 값이 필요하다). */
  let values: number[] = [];

  return {
    onInit(initialData) {
      const data = initialData as { values?: number[] } | undefined;
      values = Array.isArray(data?.values) ? [...data.values] : [];
      stage?.setData(values);
      if (values.length > 0) stage?.setRange(0, values.length - 1);
      stage?.setCaption(tr('caption.start', 'Each round picks the last cell as pivot.'));
    },

    onEvent(event) {
      switch (event.type) {
        case 'range-enter': {
          const p = event.payload as
            | { lo?: number; hi?: number; side?: string }
            | undefined;
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          if (lo === undefined || hi === undefined) break;
          stage?.setRange(lo, hi);
          if (p?.side === 'left') {
            stage?.setCaption(
              tr('caption.rangeLeft', 'Left of the pivot: [{lo}..{hi}].', { lo, hi }),
            );
          } else if (p?.side === 'right') {
            stage?.setCaption(
              tr('caption.rangeRight', 'Right of the pivot: [{lo}..{hi}].', { lo, hi }),
            );
          } else {
            stage?.setCaption(
              tr('caption.rangeRoot', 'Sort the whole array [{lo}..{hi}].', { lo, hi }),
            );
          }
          break;
        }

        case 'range-done': {
          const p = event.payload as { kind?: string; value?: number } | undefined;
          if (p?.kind === 'single') {
            const value = num(p.value);
            if (value !== undefined) {
              stage?.setCaption(
                tr('caption.rangeSingle', 'One cell alone — {value} is already home.', { value }),
              );
            }
          } else {
            stage?.setCaption(tr('caption.rangeEmpty', 'Nothing on this side.'));
          }
          break;
        }

        case 'partition-begin': {
          const p = event.payload as
            | { lo?: number; hi?: number; pivotIndex?: number; pivotValue?: number; boundary?: number }
            | undefined;
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          const pivotIndex = num(p?.pivotIndex);
          const pivotValue = num(p?.pivotValue);
          const boundary = num(p?.boundary);
          if (pivotIndex !== undefined) stage?.setPivot(pivotIndex);
          if (boundary !== undefined) stage?.setBoundary(boundary);
          stage?.setScanned(null);
          stage?.setCursor(null);
          if (lo !== undefined && hi !== undefined && pivotValue !== undefined) {
            stage?.setCaption(
              tr('caption.pickPivot', 'Pivot {value} — the last cell of [{lo}..{hi}].', {
                value: pivotValue,
                lo,
                hi,
              }),
            );
          }
          break;
        }

        case 'highlight': {
          const p = event.payload as { value?: number; pivotValue?: number } | undefined;
          const value = num(p?.value);
          const pivotValue = num(p?.pivotValue);
          for (const i of toIndexArray(event.target)) {
            stage?.setCursor(i);
            stage?.setCellState(i, 'comparing');
          }
          if (value !== undefined && pivotValue !== undefined) {
            stage?.setCaption(
              tr('caption.compare', 'Compare {value} with pivot {pivot}.', {
                value,
                pivot: pivotValue,
              }),
            );
          }
          break;
        }

        case 'state-changed': {
          const p = event.payload as { kind?: string; i?: number; j?: number } | undefined;
          const i = num(p?.i);
          const j = num(p?.j);
          if (p?.kind !== 'swap' || i === undefined || j === undefined) break;
          const a = values[i];
          const b = values[j];
          const tmp = values[i];
          values[i] = values[j];
          values[j] = tmp;
          stage?.setCellState(i, 'swapping');
          stage?.setCellState(j, 'swapping');
          stage?.swapValues(i, j);
          if (typeof a === 'number' && typeof b === 'number') {
            stage?.setCaption(tr('caption.swap', 'Exchange {a} and {b}.', { a, b }));
          }
          break;
        }

        case 'side-decided': {
          const p = event.payload as
            | { index?: number; j?: number; value?: number; side?: string; moved?: boolean; boundary?: number }
            | undefined;
          const index = num(p?.index);
          const j = num(p?.j);
          const value = num(p?.value);
          const boundary = num(p?.boundary);
          if (boundary !== undefined) stage?.setBoundary(boundary);
          if (j !== undefined) stage?.setScanned(j);
          if (p?.side === 'small') {
            if (index !== undefined) stage?.setCellState(index, null);
            if (value !== undefined) {
              stage?.setCaption(
                p.moved === true
                  ? tr('caption.sendLeft', '{value} is not larger — it moves to the small side.', {
                      value,
                    })
                  : tr('caption.stay', '{value} is not larger — it is already on the small side.', {
                      value,
                    }),
              );
            }
          } else if (value !== undefined) {
            stage?.setCaption(
              tr('caption.keepRight', '{value} is larger — it stays on the big side.', { value }),
            );
          }
          break;
        }

        case 'unhighlight': {
          for (const i of toIndexArray(event.target)) stage?.setCellState(i, null);
          break;
        }

        case 'mark': {
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          if (kind !== 'sorted') break;
          for (const i of toIndexArray(event.target)) stage?.markSettled(i);
          break;
        }

        case 'partition-end': {
          const p = event.payload as
            | { lo?: number; hi?: number; pivotIndex?: number; pivotValue?: number }
            | undefined;
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          const pivotIndex = num(p?.pivotIndex);
          const pivotValue = num(p?.pivotValue);
          if (
            lo !== undefined &&
            hi !== undefined &&
            pivotIndex !== undefined &&
            pivotValue !== undefined
          ) {
            stage?.addPartition({ lo, hi, pivotIndex, pivotValue });
            stage?.setCaption(
              tr('caption.placePivot', 'Pivot {value} takes seat {index}. It never moves again.', {
                value: pivotValue,
                index: pivotIndex,
              }),
            );
          }
          // 기준을 앉히는 맞바꿈에서 맨 뒤 칸이 'swapping' 으로 남는다 — 여기서 거둔다.
          stage?.clearCellStates();
          stage?.setPivot(null);
          stage?.setCursor(null);
          stage?.setBoundary(null);
          stage?.setScanned(null);
          break;
        }

        case 'phase': {
          const phase = (event.payload as { phase?: string } | undefined)?.phase ?? null;
          codePanel?.highlightPhase(phase);
          break;
        }

        case 'done': {
          const count = num((event.payload as { partitions?: number } | undefined)?.partitions);
          codePanel?.clearHighlight();
          if (values.length > 0) stage?.setRange(0, values.length - 1);
          if (count !== undefined) {
            stage?.setCaption(tr('caption.done', 'Sorted after {count} partitions.', { count }));
          }
          break;
        }

        // 그 외 이벤트는 없다. 알고리즘이 발신하는 전부를 위에서 다룬다 (C2).
      }
    },

    onReset() {
      // stage 의 값 복원은 러너가 reset 뒤 onInit 을 다시 불러 setData 로 한다.
      values = [];
      stage?.reset();
      codePanel?.clearHighlight();
    },
  };
};
