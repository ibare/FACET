/**
 * selectMinEachPass Projector — 걸음 이벤트를 무대 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 한 번 좁혀 정형 객체로 무대에 넘긴다 (C9). 무대는 이미
 * 좁혀진 값만 보고, 화면 문안은 여기서 키로 조회해 넘긴다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
} from '@ffacet/core/runtime';

type Stage = {
  init(values: number[]): void;
  reset(): void;
  setCaption(text: string): void;
  placeMarker(p: { index: number; value: number }): Promise<void>;
  scan(p: { index: number; value: number; bestIndex: number; smaller: boolean }): Promise<void>;
  hopMarker(p: { from: number; to: number; value: number }): Promise<void>;
  endScan(): Promise<void>;
  moveValue(p: { from: number; to: number; values: number[] }): Promise<void>;
};

const isNumberArray = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((n) => typeof n === 'number');

export const selectMinEachPassProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown): void {
      const data = initialData as { values?: unknown } | undefined;
      if (!stage || !isNumberArray(data?.values)) return;
      stage.init(data.values);
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!stage) return;

      switch (event.type) {
        case 'mark-init': {
          const p = event.payload as { index?: unknown; value?: unknown } | undefined;
          if (typeof p?.index !== 'number' || typeof p.value !== 'number') return;
          stage.setCaption(
            tr('caption.remember', 'Remember the first cell as the smallest so far.'),
          );
          await stage.placeMarker({ index: p.index, value: p.value });
          return;
        }

        case 'scan-step': {
          const p = event.payload as
            | {
                index?: unknown;
                value?: unknown;
                bestIndex?: unknown;
                bestValue?: unknown;
                smaller?: unknown;
              }
            | undefined;
          if (
            typeof p?.index !== 'number' ||
            typeof p.value !== 'number' ||
            typeof p.bestIndex !== 'number' ||
            typeof p.bestValue !== 'number' ||
            typeof p.smaller !== 'boolean'
          ) {
            return;
          }
          stage.setCaption(
            tr('caption.compare', 'Is {value} smaller than {best}?', {
              value: p.value,
              best: p.bestValue,
            }),
          );
          await stage.scan({
            index: p.index,
            value: p.value,
            bestIndex: p.bestIndex,
            smaller: p.smaller,
          });
          if (!p.smaller) {
            stage.setCaption(tr('caption.keep', 'No. The marker stays where it is.'));
          }
          return;
        }

        case 'mark-hop': {
          const p = event.payload as
            | { from?: unknown; to?: unknown; value?: unknown }
            | undefined;
          if (
            typeof p?.from !== 'number' ||
            typeof p.to !== 'number' ||
            typeof p.value !== 'number'
          ) {
            return;
          }
          stage.setCaption(tr('caption.hop', 'Yes. The marker hops over to {value}.', { value: p.value }));
          await stage.hopMarker({ from: p.from, to: p.to, value: p.value });
          return;
        }

        case 'scan-end': {
          const p = event.payload as { compares?: unknown; hops?: unknown } | undefined;
          if (typeof p?.compares !== 'number' || typeof p.hops !== 'number') return;
          await stage.endScan();
          stage.setCaption(
            tr(
              'caption.scanEnd',
              'Scan over: {compares} comparisons, {hops} marker hop, and not one value has moved.',
              { compares: p.compares, hops: p.hops },
            ),
          );
          return;
        }

        case 'value-move': {
          const p = event.payload as
            | { from?: unknown; to?: unknown; values?: unknown }
            | undefined;
          if (typeof p?.from !== 'number' || typeof p.to !== 'number' || !isNumberArray(p.values)) {
            return;
          }
          stage.setCaption(
            tr('caption.move', 'Only now does anything move: the marked value goes to the front.'),
          );
          await stage.moveValue({ from: p.from, to: p.to, values: p.values });
          return;
        }

        case 'done': {
          const p = event.payload as { compares?: unknown; moves?: unknown } | undefined;
          if (typeof p?.compares !== 'number' || typeof p.moves !== 'number') return;
          stage.setCaption(
            tr('caption.done', 'One pass: {compares} comparisons, {moves} value move.', {
              compares: p.compares,
              moves: p.moves,
            }),
          );
          return;
        }

        case 'rewind': {
          stage.reset();
          return;
        }

        // algorithm 이 내는 이벤트는 위 일곱이 전부다. 그 밖은 조용히 흘린다.
        default:
          return;
      }
    },

    onReset(): void {
      stage?.reset();
    },
  };
};
