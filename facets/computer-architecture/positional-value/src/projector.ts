/**
 * 자리값과 진법 projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다 (C9). stage 는 이미 좁혀진 값만 받는다.
 * 문안은 코드에 없다 — 키와 en 원본만 있고 문안은 `facet.ts` 의 messages 에
 * 있다 (C10).
 *
 * `onInit` 을 두지 않는다. `initialData` 를 받는 자리는 stage 의 mount 이고,
 * 여기서 다시 좁혀 밀어 넣으면 좁히는 규칙이 두 벌이 된다 (S-piece).
 */

import {
  makeTranslator,
  toIndexArray,
  type FacetRuntimeEvent,
  type ProjectorFactory,
} from '@ffacet/core/runtime';

/** stage 가 내주는 표면. 없을 수도 있으므로 전부 optional 로 받는다 (C9). */
type PositionalValueStage = {
  showNumber?(value: number): Promise<void> | void;
  splitPlaces?(bits: number[], places: number[]): Promise<void> | void;
  markOn?(indices: number[]): Promise<void> | void;
  sumUp?(addends: number[], sum: number): Promise<void> | void;
  cutInto?(row: 'octal' | 'hex', sizes: number[], digits: string[]): Promise<void> | void;
  alignAll?(): Promise<void> | void;
  rewind?(): void;
  setCaption?(text: string): void;
};

type Grouping = { sizes: number[]; digits: string[]; reading: string };

function numbers(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
}

function texts(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function groupingOf(payload: unknown): Grouping {
  const p = payload as { sizes?: unknown; digits?: unknown; reading?: unknown } | undefined;
  return {
    sizes: numbers(p?.sizes),
    digits: texts(p?.digits),
    reading: typeof p?.reading === 'string' ? p.reading : '',
  };
}

export const positionalValueProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as PositionalValueStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'show-number': {
          const p = event.payload as { value?: unknown } | undefined;
          const value = typeof p?.value === 'number' ? p.value : 0;
          stage?.setCaption?.(tr('caption.one', 'A single number: {value}.', { value }));
          await stage?.showNumber?.(value);
          break;
        }

        case 'split-places': {
          const p = event.payload as { bits?: unknown; places?: unknown } | undefined;
          stage?.setCaption?.(
            tr('caption.places', 'Cut it into places — each place is worth twice the one on its right.'),
          );
          await stage?.splitPlaces?.(numbers(p?.bits), numbers(p?.places));
          break;
        }

        case 'mark': {
          const p = event.payload as { values?: unknown } | undefined;
          const values = numbers(p?.values);
          stage?.setCaption?.(
            tr('caption.on', 'The places that are on: {places}.', { places: values.join(', ') }),
          );
          await stage?.markOn?.(toIndexArray(event.target));
          break;
        }

        case 'sum-up': {
          const p = event.payload as { addends?: unknown; sum?: unknown } | undefined;
          const sum = typeof p?.sum === 'number' ? p.sum : 0;
          stage?.setCaption?.(
            tr('caption.sum', 'Add the on places and the number comes back: {sum}.', { sum }),
          );
          await stage?.sumUp?.(numbers(p?.addends), sum);
          break;
        }

        case 'cut-by-three': {
          const g = groupingOf(event.payload);
          stage?.setCaption?.(
            tr('caption.three', 'Cut the same bits three at a time — base 8 reads {reading}.', {
              reading: g.reading,
            }),
          );
          await stage?.cutInto?.('octal', g.sizes, g.digits);
          break;
        }

        case 'cut-by-four': {
          const g = groupingOf(event.payload);
          stage?.setCaption?.(
            tr('caption.four', 'Cut them four at a time — base 16 reads {reading}.', {
              reading: g.reading,
            }),
          );
          await stage?.cutInto?.('hex', g.sizes, g.digits);
          break;
        }

        case 'done': {
          const p = event.payload as { value?: unknown } | undefined;
          const value = typeof p?.value === 'number' ? p.value : 0;
          stage?.setCaption?.(
            tr('caption.same', 'Three notations, one length, one number: {value}.', { value }),
          );
          await stage?.alignAll?.();
          break;
        }

        case 'rewind': {
          stage?.rewind?.();
          stage?.setCaption?.('');
          break;
        }

        default:
          // 이 facet 의 algorithm 은 위 여덟만 발신한다. 그 밖은 조용히 흘린다 (C2).
          break;
      }
    },

    onReset(): void {
      stage?.rewind?.();
      stage?.setCaption?.('');
    },
  };
};
