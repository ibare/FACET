/**
 * 카운팅 정렬 Projector — 알고리즘 이벤트를 stage(counting-sort-stage) 와
 * codePanel(code-view) 로 번역한다.
 *
 * phase 는 두 곳으로 간다. 코드 패널의 줄 짚기와 stage 의 걸음 표시가 같은
 * 어휘를 쓰므로, 별도 이벤트를 만들지 않고 `phase` 하나가 둘을 함께 몬다.
 *
 * 화면 문안은 이 파일에 없다. 키와 en 원본만 있고 실제 문장은 `facet.ts` 의
 * `messages` 에 있다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator, toIndexArray } from '@ffacet/core/runtime';

type CountingSortStage = {
  setData(values: number[], range?: number): void;
  setCaption(text: string): void;
  setStep(step: 'count' | 'prefix' | 'place' | null): void;
  setCursor(index: number | null): void;
  setInputState(index: number, state: 'idle' | 'active' | 'counted' | 'consumed'): void;
  setActiveBucket(value: number | null): void;
  setCount(value: number, count: number): void;
  setStart(value: number, start: number): void;
  placeInto(slot: number, value: number): void;
  setLink(index: number | null, value: number | null, slot: number | null): void;
  clearLink(): void;
  finish(): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

/** phase 어휘를 stage 의 걸음 셋으로 접는다. 마련하기와 마무리는 걸음이 아니다. */
const STEP_OF_PHASE: Record<string, 'count' | 'prefix' | 'place' | null> = {
  alloc: null,
  count: 'count',
  'prefix-sum': 'prefix',
  place: 'place',
  advance: 'place',
  finish: null,
};

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

export const countingSortProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CountingSortStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  // en 원본은 호출부 리터럴로 남긴다 — 추출기가 리터럴만 읽는다 (C10).
  const tr: Translate = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData) {
      const data = initialData as { values?: number[]; range?: number } | undefined;
      const values = Array.isArray(data?.values) ? [...data.values] : [];
      stage?.setData(values, num(data?.range));
      stage?.setCaption(
        tr('caption.start', 'No value is ever compared with another. Count first, then place.'),
      );
    },

    onEvent(event) {
      switch (event.type) {
        case 'init': {
          const p = event.payload as { values?: number[]; range?: number } | undefined;
          if (!Array.isArray(p?.values)) break;
          stage?.setData([...p.values], num(p.range));
          stage?.setCaption(
            tr('caption.alloc', 'Make one slot per value and one seat per item.'),
          );
          break;
        }

        case 'highlight': {
          const p = event.payload as { kind?: string; value?: number } | undefined;
          const value = num(p?.value);
          const indices = toIndexArray(event.target);
          const index = indices.length > 0 ? indices[0] : undefined;
          if (index === undefined || value === undefined) break;
          stage?.setCursor(index);
          stage?.setActiveBucket(value);
          stage?.setLink(index, value, null);
          if (p?.kind === 'placing') {
            stage?.setCaption(
              tr('caption.readForPlace', 'Read {value} — where does it sit?', { value }),
            );
          } else {
            stage?.setCaption(
              tr('caption.readForCount', 'Read {value} — one more for its slot.', { value }),
            );
          }
          break;
        }

        case 'count-bumped': {
          const p = event.payload as { value?: number; count?: number } | undefined;
          const value = num(p?.value);
          const count = num(p?.count);
          if (value === undefined || count === undefined) break;
          stage?.setCount(value, count);
          stage?.setCaption(
            tr('caption.count', 'Slot {value} now holds {count}.', { value, count }),
          );
          break;
        }

        case 'unhighlight': {
          stage?.setCursor(null);
          stage?.setActiveBucket(null);
          stage?.clearLink();
          break;
        }

        case 'counts-done': {
          stage?.setCaption(
            tr('caption.countsDone', 'Every item is counted. Slots nobody visited stay empty.'),
          );
          break;
        }

        case 'prefix-step': {
          const p = event.payload as
            | { value?: number; start?: number; count?: number }
            | undefined;
          const value = num(p?.value);
          const start = num(p?.start);
          const count = num(p?.count);
          if (value === undefined || start === undefined) break;
          stage?.setActiveBucket(value);
          stage?.setStart(value, start);
          stage?.setCaption(
            count === 0
              ? tr('caption.prefixEmpty', 'Nothing of value {value} — seat {start} stays free for the next value.', {
                  value,
                  start,
                })
              : tr('caption.prefix', 'Value {value} starts at seat {start}.', { value, start }),
          );
          break;
        }

        case 'starts-done': {
          stage?.setActiveBucket(null);
          stage?.clearLink();
          stage?.setCaption(
            tr('caption.startsDone', 'Every value knows its first seat. Now place them in order.'),
          );
          break;
        }

        case 'place-into': {
          const p = event.payload as { index?: number; value?: number; slot?: number } | undefined;
          const index = num(p?.index);
          const value = num(p?.value);
          const slot = num(p?.slot);
          if (index === undefined || value === undefined || slot === undefined) break;
          stage?.placeInto(slot, value);
          stage?.setLink(index, value, slot);
          stage?.setCaption(tr('caption.place', '{value} takes seat {slot}.', { value, slot }));
          break;
        }

        case 'state-changed': {
          const p = event.payload as { kind?: string; value?: number; start?: number } | undefined;
          if (p?.kind !== 'advance') break;
          const value = num(p.value);
          const start = num(p.start);
          if (value === undefined || start === undefined) break;
          stage?.setStart(value, start);
          stage?.setCaption(
            tr('caption.advance', 'Push the seat of {value} on to {start} — the next one waits there.', {
              value,
              start,
            }),
          );
          break;
        }

        case 'mark': {
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          if (kind !== 'consumed') break;
          for (const i of toIndexArray(event.target)) stage?.setInputState(i, 'consumed');
          break;
        }

        case 'phase': {
          const phase = (event.payload as { phase?: string } | undefined)?.phase ?? null;
          codePanel?.highlightPhase(phase);
          stage?.setStep(phase === null ? null : STEP_OF_PHASE[phase] ?? null);
          break;
        }

        case 'done': {
          const p = event.payload as { placements?: number; comparisons?: number } | undefined;
          const placements = num(p?.placements) ?? 0;
          const comparisons = num(p?.comparisons) ?? 0;
          codePanel?.clearHighlight();
          stage?.finish();
          stage?.setCaption(
            tr('caption.done', '{placements} placements, {comparisons} comparisons.', {
              placements,
              comparisons,
            }),
          );
          break;
        }

        // 그 외 이벤트는 없다. 알고리즘이 발신하는 전부를 위에서 다룬다 (C2).
      }
    },

    onReset() {
      // stage 의 자료 복원은 러너가 reset 뒤 onInit 을 다시 불러 setData 로 한다.
      stage?.reset();
      codePanel?.clearHighlight();
    },
  };
};
