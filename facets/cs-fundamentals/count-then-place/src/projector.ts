/**
 * count-then-place projector — algorithm 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 `unknown` 이므로 여기서 한 번 좁히고, stage 는 이미 좁혀진 값만 받는다 (C9).
 * 캡션 문안은 algorithm 이 보낸 키를 여기서 해석한다 — 문안을 정하는 것은 표현 계층의
 * 일이고, en 원본은 추출기가 읽을 수 있게 호출부에 리터럴로 둔다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';

type CountThenPlaceStage = {
  init(model: { values: number[]; range: number }): void;
  setCaption(text: string): void;
  countTick(step: { index: number; value: number; height: number }): Promise<void>;
  settleBucket(step: { value: number; start: number; count: number }): Promise<void>;
  placeValue(step: {
    index: number;
    value: number;
    slot: number;
    bucketFull: boolean;
  }): Promise<void>;
  signalDone(): void;
  rewind(): void;
};

export const countThenPlaceProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CountThenPlaceStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 캡션 키를 문안으로. 키가 동적이라도 en 원본은 리터럴로 남아야 한다 (C10). */
  const captionFor = (key: string): string => {
    switch (key) {
      case 'caption.count':
        return tr('caption.count', 'Tally how many of each value there are');
      case 'caption.settle':
        return tr('caption.settle', 'The tallies harden into starting slot numbers');
      case 'caption.place':
        return tr('caption.place', 'Each value goes straight to its own number');
      case 'caption.done':
        return tr('caption.done', 'Sorted without comparing a single pair');
      default:
        return '';
    }
  };

  return {
    onInit(initialData: unknown): void {
      const raw = initialData as { values?: unknown; range?: unknown } | undefined;
      if (!Array.isArray(raw?.values)) return;
      const values = raw.values.filter((v): v is number => typeof v === 'number');
      if (values.length !== raw.values.length) return;
      const range = typeof raw.range === 'number' && raw.range > 0
        ? raw.range
        : Math.max(...values, -1) + 1;
      stage?.init({ values, range });
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'caption-changed': {
          const p = event.payload as { textKey?: unknown } | undefined;
          if (typeof p?.textKey !== 'string') break;
          stage?.setCaption(captionFor(p.textKey));
          break;
        }
        case 'count-tick': {
          const p = event.payload as
            | { index?: unknown; value?: unknown; height?: unknown }
            | undefined;
          if (
            typeof p?.index !== 'number' ||
            typeof p.value !== 'number' ||
            typeof p.height !== 'number'
          ) break;
          await stage?.countTick({ index: p.index, value: p.value, height: p.height });
          break;
        }
        case 'bucket-settle': {
          const p = event.payload as
            | { value?: unknown; start?: unknown; count?: unknown }
            | undefined;
          if (
            typeof p?.value !== 'number' ||
            typeof p.start !== 'number' ||
            typeof p.count !== 'number'
          ) break;
          await stage?.settleBucket({ value: p.value, start: p.start, count: p.count });
          break;
        }
        case 'place': {
          const p = event.payload as
            | { index?: unknown; value?: unknown; slot?: unknown; bucketFull?: unknown }
            | undefined;
          if (
            typeof p?.index !== 'number' ||
            typeof p.value !== 'number' ||
            typeof p.slot !== 'number' ||
            typeof p.bucketFull !== 'boolean'
          ) break;
          await stage?.placeValue({
            index: p.index,
            value: p.value,
            slot: p.slot,
            bucketFull: p.bucketFull,
          });
          break;
        }
        case 'rewind':
          stage?.rewind();
          break;
        case 'done':
          stage?.signalDone();
          break;
        default:
          // 이 facet 의 algorithm 은 위 여섯 가지만 발신한다. 그 밖은 조용히 흘린다.
          break;
      }
    },

    onReset(): void {
      stage?.rewind();
      stage?.setCaption('');
    },
  };
};
