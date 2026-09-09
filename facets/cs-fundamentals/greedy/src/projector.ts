/**
 * 그리디 Projector — 알고리즘 이벤트를 stage(greedy-stage) 와
 * codePanel(code-view) 로 번역한다.
 *
 * 화면 문안은 이 파일에 없다. 키와 en 원본만 있고 실제 문장은
 * `facet.ts` 의 `messages` 에 있다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator, toIndexArray } from '@ffacet/core/runtime';

type GreedyStage = {
  setData(starts: number[], ends: number[]): void;
  applyOrder(order: number[]): void;
  setCaption(text: string): void;
  setBoundary(lastEnd: number): void;
  setVisiting(index: number | null): void;
  setProbe(index: number | null, lastEnd: number, accepted: boolean): void;
  setDecision(index: number, state: 'picked' | 'skipped'): void;
  addToRoom(index: number): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

export const greedyProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as GreedyStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  // en 원본은 호출부 리터럴로 남긴다 — 추출기가 리터럴만 읽는다 (C10).
  const tr: Translate = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData) {
      const data = initialData as { starts?: number[]; ends?: number[] } | undefined;
      const starts = Array.isArray(data?.starts) ? [...data.starts] : [];
      const ends = Array.isArray(data?.ends) ? [...data.ends] : [];
      stage?.setData(starts, ends);
      stage?.setBoundary(-1);
      stage?.setCaption(
        tr('caption.start', 'Fit as many meetings as possible into one room.'),
      );
    },

    onEvent(event) {
      switch (event.type) {
        case 'sort-done': {
          const p = event.payload as { order?: unknown; changed?: unknown } | undefined;
          const order = Array.isArray(p?.order)
            ? p.order.filter((x): x is number => typeof x === 'number')
            : [];
          if (order.length > 0) stage?.applyOrder(order);
          stage?.setCaption(
            p?.changed === true
              ? tr('caption.sorted', 'Line them up by finishing time.')
              : tr(
                  'caption.sortedAlready',
                  'Line them up by finishing time — they already are.',
                ),
          );
          break;
        }

        case 'state-changed': {
          const p = event.payload as { kind?: string; lastEnd?: number } | undefined;
          if (p?.kind !== 'boundary') break;
          const lastEnd = num(p.lastEnd);
          if (lastEnd !== undefined) stage?.setBoundary(lastEnd);
          stage?.setCaption(
            tr('caption.init', 'Nothing booked yet — the room is free from the start.'),
          );
          break;
        }

        case 'highlight': {
          const p = event.payload as { start?: number; end?: number } | undefined;
          const start = num(p?.start);
          const end = num(p?.end);
          for (const i of toIndexArray(event.target)) stage?.setVisiting(i);
          if (start !== undefined && end !== undefined) {
            stage?.setCaption(
              tr('caption.visit', 'Look at the meeting {start}–{end}.', { start, end }),
            );
          }
          break;
        }

        case 'compare': {
          const p = event.payload as
            | { index?: number; start?: number; lastEnd?: number; accepted?: boolean }
            | undefined;
          const index = num(p?.index);
          const start = num(p?.start);
          const lastEnd = num(p?.lastEnd);
          const accepted = p?.accepted === true;
          if (index === undefined || start === undefined || lastEnd === undefined) break;
          stage?.setProbe(index, lastEnd, accepted);
          if (lastEnd < 0) {
            stage?.setCaption(
              tr('caption.compareFirst', 'The room is empty, so {start} fits for sure.', {
                start,
              }),
            );
          } else {
            stage?.setCaption(
              accepted
                ? tr('caption.compareFits', 'Starts at {start}, room free since {lastEnd} — it fits.', {
                    start,
                    lastEnd,
                  })
                : tr(
                    'caption.compareClashes',
                    'Starts at {start} but the room is busy until {lastEnd} — they clash.',
                    { start, lastEnd },
                  ),
            );
          }
          break;
        }

        case 'mark': {
          const p = event.payload as
            | { kind?: string; index?: number; start?: number; end?: number; lastEnd?: number }
            | undefined;
          const index = num(p?.index);
          const start = num(p?.start);
          const end = num(p?.end);
          const lastEnd = num(p?.lastEnd);
          if (index === undefined) break;
          if (p?.kind === 'picked') {
            stage?.setDecision(index, 'picked');
            stage?.addToRoom(index);
            if (lastEnd !== undefined) stage?.setBoundary(lastEnd);
            if (start !== undefined && end !== undefined) {
              stage?.setCaption(
                tr('caption.pick', 'Take {start}–{end}. The room is busy until {end} now.', {
                  start,
                  end,
                }),
              );
            }
          } else if (p?.kind === 'skipped') {
            stage?.setDecision(index, 'skipped');
            if (start !== undefined && end !== undefined) {
              stage?.setCaption(
                tr('caption.skip', 'Drop {start}–{end}. The red part is the clash.', {
                  start,
                  end,
                }),
              );
            }
          }
          break;
        }

        case 'unhighlight': {
          stage?.setVisiting(null);
          break;
        }

        case 'phase': {
          const phase = (event.payload as { phase?: string } | undefined)?.phase ?? null;
          codePanel?.highlightPhase(phase);
          break;
        }

        case 'done': {
          const p = event.payload as { picks?: number; skips?: number } | undefined;
          const picks = num(p?.picks);
          const skips = num(p?.skips);
          codePanel?.clearHighlight();
          stage?.setVisiting(null);
          if (picks !== undefined && skips !== undefined) {
            stage?.setCaption(
              tr(
                'caption.done',
                'Took {picks} meetings, dropped {skips} — no two of them overlap.',
                { picks, skips },
              ),
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
