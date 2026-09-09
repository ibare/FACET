/**
 * 삽입 정렬 Projector — 알고리즘 이벤트를 stage(insertion-sort-stage) 와
 * codePanel(code-view) 로 번역한다.
 *
 * 화면 문안은 이 파일에 없다. 키와 en 원본만 있고 실제 문장은 `facet.ts` 의
 * `messages` 에 있다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator, toIndexArray } from '@ffacet/core/runtime';

type InsertionSortStage = {
  setData(values: number[]): void;
  setCaption(text: string): void;
  setSortedRun(end: number): void;
  liftKey(index: number, value: number): void;
  aimKey(slot: number): void;
  setCompare(index: number | null): void;
  shiftCell(from: number, to: number): void;
  dropKey(slot: number): void;
  addShiftRecord(pass: number, value: number, shifts: number): void;
  markAllSorted(): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

export const insertionSortProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as InsertionSortStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  // en 원본은 호출부 리터럴로 남긴다 — 추출기가 리터럴만 읽는다 (C10).
  const tr: Translate = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData) {
      const data = initialData as { values?: number[] } | undefined;
      const values = Array.isArray(data?.values) ? [...data.values] : [];
      stage?.setData(values);
      stage?.setCaption(
        tr('caption.start', 'The first cell alone is already a sorted run.'),
      );
    },

    onEvent(event) {
      switch (event.type) {
        case 'pass-begin': {
          const p = event.payload as
            | { i?: number; key?: number; sortedEnd?: number }
            | undefined;
          const i = num(p?.i);
          const key = num(p?.key);
          const sortedEnd = num(p?.sortedEnd);
          if (sortedEnd !== undefined) stage?.setSortedRun(sortedEnd);
          if (i === undefined || key === undefined) break;
          stage?.liftKey(i, key);
          stage?.setCaption(
            tr('caption.pick', 'Take {value} out. {count} cells on the left are in order.', {
              value: key,
              count: (sortedEnd ?? i - 1) + 1,
            }),
          );
          break;
        }

        case 'highlight': {
          const p = event.payload as { value?: number; key?: number } | undefined;
          const value = num(p?.value);
          const key = num(p?.key);
          for (const i of toIndexArray(event.target)) stage?.setCompare(i);
          if (value !== undefined && key !== undefined) {
            stage?.setCaption(
              tr('caption.compare', 'Is {value} greater than {key}?', { value, key }),
            );
          }
          break;
        }

        case 'state-changed': {
          const p = event.payload as
            | { kind?: string; from?: number; to?: number; index?: number; value?: number }
            | undefined;
          const value = num(p?.value);
          if (p?.kind === 'shift') {
            const from = num(p.from);
            const to = num(p.to);
            if (from === undefined || to === undefined) break;
            stage?.shiftCell(from, to);
            if (value !== undefined) {
              stage?.setCaption(
                tr('caption.shift', '{value} is greater — it steps one cell to the right.', {
                  value,
                }),
              );
            }
          } else if (p?.kind === 'place') {
            const index = num(p.index);
            if (index === undefined) break;
            stage?.dropKey(index);
            if (value !== undefined) {
              stage?.setCaption(
                tr('caption.place', '{value} settles into seat {index}.', { value, index }),
              );
            }
          }
          break;
        }

        case 'scan-stop': {
          const p = event.payload as
            | { reason?: string; value?: number; key?: number; slot?: number }
            | undefined;
          const slot = num(p?.slot);
          const value = num(p?.value);
          const key = num(p?.key);
          if (slot !== undefined) stage?.aimKey(slot);
          stage?.setCompare(null);
          if (p?.reason === 'smaller' && value !== undefined && key !== undefined) {
            stage?.setCaption(
              tr(
                'caption.stopSmaller',
                '{value} is not greater than {key} — the walk stops here.',
                { value, key },
              ),
            );
          } else if (key !== undefined) {
            stage?.setCaption(
              tr('caption.stopEdge', 'The left end is passed — {key} is the smallest so far.', {
                key,
              }),
            );
          }
          break;
        }

        case 'pass-end': {
          const p = event.payload as
            | { i?: number; key?: number; shifts?: number; sortedEnd?: number }
            | undefined;
          const i = num(p?.i);
          const key = num(p?.key);
          const shifts = num(p?.shifts);
          const sortedEnd = num(p?.sortedEnd);
          if (sortedEnd !== undefined) stage?.setSortedRun(sortedEnd);
          if (i !== undefined && key !== undefined && shifts !== undefined) {
            stage?.addShiftRecord(i, key, shifts);
            stage?.setCaption(
              shifts === 0
                ? tr(
                    'caption.settleNone',
                    '{value} was already home — nothing stepped aside.',
                    { value: key },
                  )
                : tr(
                    'caption.settle',
                    '{count} cells are in order now. {value} cost {shifts} steps aside.',
                    { count: (sortedEnd ?? i) + 1, value: key, shifts },
                  ),
            );
          }
          break;
        }

        case 'phase': {
          const phase = (event.payload as { phase?: string } | undefined)?.phase ?? null;
          codePanel?.highlightPhase(phase);
          break;
        }

        case 'done': {
          const p = event.payload as
            | { compares?: number; shifts?: number }
            | undefined;
          const compares = num(p?.compares);
          const shifts = num(p?.shifts);
          codePanel?.clearHighlight();
          stage?.markAllSorted();
          if (compares !== undefined && shifts !== undefined) {
            stage?.setCaption(
              tr('caption.done', 'Sorted with {compares} comparisons and {shifts} steps aside.', {
                compares,
                shifts,
              }),
            );
          }
          break;
        }

        default:
          // 여기 오는 이벤트는 없다 — 알고리즘이 발신하는 전부를 위에서 다룬다.
          // 새 이벤트를 늘리면서 위에 가지를 빼먹으면 조용히 이 자리로 떨어지므로,
          // 그때 이 주석이 눈에 걸리도록 자리를 비워 둔다 (C2).
          break;
      }
    },

    onReset() {
      // 값 복원은 러너가 reset 뒤 onInit 을 다시 불러 setData 로 한다.
      stage?.reset();
      codePanel?.clearHighlight();
    },
  };
};
