/**
 * 선형 탐색 Projector — 알고리즘 이벤트를 stage(linear-search-stage) 와
 * codePanel(code-view) 로 번역한다.
 *
 * 화면 문안은 이 파일에 없다. 키와 en 원본만 있고 실제 문장은
 * `facet.ts` 의 `messages` 에 있다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator, toIndexArray } from '@ffacet/core/runtime';

type CellState = 'looking' | 'seen' | 'found' | null;

type LinearSearchStage = {
  setData(values: number[]): void;
  setTarget(value: number | null, round: number, total: number): void;
  setOutcome(outcome: 'hit' | 'miss' | null): void;
  setCursor(index: number | null): void;
  setCellState(index: number, state: CellState): void;
  clearCells(): void;
  setCaption(text: string): void;
  addRecord(row: { target: number; index: number; examined: number }): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

export const linearSearchProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as LinearSearchStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  // en 원본은 호출부 리터럴로 남긴다 — 추출기가 리터럴만 읽는다 (C10).
  const tr: Translate = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData) {
      const data = initialData as { values?: number[] } | undefined;
      stage?.setData(Array.isArray(data?.values) ? [...data.values] : []);
      stage?.setTarget(null, 0, 0);
      stage?.setCaption(
        tr('caption.start', 'The line is not sorted, so there is no way to stop early.'),
      );
    },

    onEvent(event) {
      switch (event.type) {
        case 'search-begin': {
          const p = event.payload as
            | { round?: number; total?: number; target?: number }
            | undefined;
          const round = num(p?.round);
          const total = num(p?.total);
          const target = num(p?.target);
          if (round === undefined || total === undefined || target === undefined) break;
          stage?.clearCells();
          stage?.setOutcome(null);
          stage?.setTarget(target, round, total);
          stage?.setCaption(
            tr('caption.begin', 'Start at the front and look for {target}.', { target }),
          );
          break;
        }

        case 'highlight': {
          const p = event.payload as { index?: number; value?: number } | undefined;
          const value = num(p?.value);
          for (const i of toIndexArray(event.target)) {
            stage?.setCursor(i);
            stage?.setCellState(i, 'looking');
          }
          const index = num(p?.index);
          if (index !== undefined && value !== undefined) {
            stage?.setCaption(
              tr('caption.look', 'Seat {index} holds {value}.', { index, value }),
            );
          }
          break;
        }

        case 'compare-result': {
          const p = event.payload as
            | { value?: number; target?: number; equal?: boolean }
            | undefined;
          const value = num(p?.value);
          const target = num(p?.target);
          if (value === undefined || target === undefined) break;
          stage?.setCaption(
            p?.equal === true
              ? tr('caption.same', '{value} is {target} — stop here.', { value, target })
              : tr('caption.differ', '{value} is not {target} — go on.', { value, target }),
          );
          break;
        }

        case 'state-changed': {
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          if (kind !== 'seen') break;
          for (const i of toIndexArray(event.target)) stage?.setCellState(i, 'seen');
          break;
        }

        case 'mark': {
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          if (kind !== 'found') break;
          for (const i of toIndexArray(event.target)) stage?.setCellState(i, 'found');
          break;
        }

        case 'search-end': {
          const p = event.payload as
            | { target?: number; found?: boolean; index?: number; examined?: number }
            | undefined;
          const target = num(p?.target);
          const index = num(p?.index);
          const examined = num(p?.examined);
          if (target === undefined || index === undefined || examined === undefined) break;
          const found = p?.found === true;
          stage?.setCursor(null);
          stage?.setOutcome(found ? 'hit' : 'miss');
          stage?.addRecord({ target, index, examined });
          stage?.setCaption(
            found
              ? tr('caption.found', 'Found {target} at seat {index} — {count} cells looked at.', {
                  target,
                  index,
                  count: examined,
                })
              : tr(
                  'caption.notFound',
                  '{target} is not here — every one of the {count} cells had to be looked at.',
                  { target, count: examined },
                ),
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
            | { searches?: number; compares?: number; hits?: number }
            | undefined;
          const searches = num(p?.searches);
          const compares = num(p?.compares);
          codePanel?.clearHighlight();
          stage?.setCursor(null);
          if (searches !== undefined && compares !== undefined) {
            stage?.setCaption(
              tr('caption.done', '{searches} searches took {compares} comparisons in all.', {
                searches,
                compares,
              }),
            );
          }
          break;
        }

        // 그 외 이벤트는 없다. 알고리즘이 발신하는 전부를 위에서 다룬다 (C2).
      }
    },

    onReset() {
      // stage 의 값 복원은 러너가 reset 뒤 onInit 을 다시 불러 setData 로 한다.
      stage?.reset();
      codePanel?.clearHighlight();
    },
  };
};
