/**
 * 기수 정렬 Projector — 알고리즘 이벤트를 stage(radix-sort-stage) 와
 * codePanel(code-view) 로 번역한다.
 *
 * 화면 문안은 이 파일에 없다. 키와 en 원본만 있고 실제 문장은
 * `facet.ts` 의 `messages` 에 있다 (C10).
 */

import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator, toIndexArray } from '@ffacet/core/runtime';

type RadixStage = {
  setData(values: number[]): void;
  setMax(maxValue: number): void;
  beginRound(round: number, exp: number): void;
  readDigit(index: number, value: number, exp: number, digit: number): void;
  releaseCell(index: number): void;
  setBucketValue(digit: number, value: number): void;
  showPrefixAdd(digit: number, added: number): void;
  linkToSlot(digit: number, slot: number, value: number): void;
  commitRound(values: number[]): void;
  markDone(): void;
  setCaption(text: string): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

export const radixSortProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as RadixStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  // en 원본은 호출부 리터럴로 남긴다 — 추출기가 리터럴만 읽는다 (C10).
  const tr: Translate = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData) {
      const data = initialData as { values?: number[] } | undefined;
      const values = Array.isArray(data?.values) ? [...data.values] : [];
      stage?.setData(values);
      stage?.setCaption(
        tr('caption.start', 'One digit at a time, starting from the lowest place.'),
      );
    },

    onEvent(event) {
      switch (event.type) {
        case 'scan-max': {
          const maxValue = num((event.payload as { maxValue?: number } | undefined)?.maxValue);
          if (maxValue === undefined) break;
          stage?.setMax(maxValue);
          stage?.setCaption(
            tr('caption.scanMax', 'The largest value is {max} — it decides how many places to visit.', {
              max: maxValue,
            }),
          );
          break;
        }

        case 'round-begin': {
          const p = event.payload as { round?: number; exp?: number } | undefined;
          const round = num(p?.round);
          const exp = num(p?.exp);
          if (round === undefined || exp === undefined) break;
          stage?.beginRound(round, exp);
          stage?.setCaption(
            tr('caption.round', 'Round {round} — line them up by the place worth {exp}.', {
              round,
              exp,
            }),
          );
          break;
        }

        case 'highlight': {
          const p = event.payload as
            | { kind?: string; value?: number; digit?: number; exp?: number }
            | undefined;
          if (p?.kind !== 'reading') break;
          const value = num(p.value);
          const digit = num(p.digit);
          const exp = num(p.exp);
          if (value === undefined || digit === undefined || exp === undefined) break;
          for (const i of toIndexArray(event.target)) stage?.readDigit(i, value, exp, digit);
          stage?.setCaption(
            tr('caption.read', 'The place-{exp} digit of {value} is {digit}.', {
              exp,
              value,
              digit,
            }),
          );
          break;
        }

        case 'unhighlight': {
          for (const i of toIndexArray(event.target)) stage?.releaseCell(i);
          break;
        }

        case 'bucket-count': {
          const p = event.payload as { digit?: number; count?: number } | undefined;
          const digit = num(p?.digit);
          const count = num(p?.count);
          if (digit === undefined || count === undefined) break;
          stage?.setBucketValue(digit, count);
          stage?.setCaption(
            tr('caption.count', 'Bucket {digit} now holds {count}.', { digit, count }),
          );
          break;
        }

        case 'bucket-prefix': {
          const p = event.payload as
            | { digit?: number; value?: number; added?: number }
            | undefined;
          const digit = num(p?.digit);
          const value = num(p?.value);
          const added = num(p?.added);
          if (digit === undefined || value === undefined || added === undefined) break;
          stage?.setBucketValue(digit, value);
          stage?.showPrefixAdd(digit, added);
          stage?.setCaption(
            tr(
              'caption.prefix',
              'Bucket {digit} takes {added} from its left neighbour — {value} values sit at digit {digit} or below.',
              { digit, added, value },
            ),
          );
          break;
        }

        case 'place': {
          const p = event.payload as
            | { value?: number; digit?: number; slot?: number }
            | undefined;
          const value = num(p?.value);
          const digit = num(p?.digit);
          const slot = num(p?.slot);
          if (value === undefined || digit === undefined || slot === undefined) break;
          stage?.setBucketValue(digit, slot);
          stage?.linkToSlot(digit, slot, value);
          stage?.setCaption(
            tr(
              'caption.place',
              'Read from the back: bucket {digit} drops to {slot}, so {value} takes seat {slot}.',
              { digit, slot, value },
            ),
          );
          break;
        }

        case 'round-end': {
          const p = event.payload as
            | { round?: number; exp?: number; values?: unknown }
            | undefined;
          const round = num(p?.round);
          const exp = num(p?.exp);
          const values = Array.isArray(p?.values)
            ? p.values.filter((x): x is number => typeof x === 'number')
            : [];
          if (values.length > 0) stage?.commitRound(values);
          if (round === undefined || exp === undefined) break;
          stage?.setCaption(
            tr(
              'caption.roundEnd',
              'Place {exp} is settled. Round {round} kept the earlier order untouched.',
              { exp, round },
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
          const p = event.payload as { rounds?: number; places?: number } | undefined;
          const rounds = num(p?.rounds);
          const places = num(p?.places);
          codePanel?.clearHighlight();
          stage?.markDone();
          if (rounds === undefined || places === undefined) break;
          stage?.setCaption(
            tr(
              'caption.done',
              'Sorted in {rounds} rounds and {places} placements — without comparing two values even once.',
              { rounds, places },
            ),
          );
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
