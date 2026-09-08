/**
 * heap-sort-extract Projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁힌다. stage 는 필수 필드 타입만 받는다 (C9).
 * 문안은 키와 en 원본만 여기 남고, 문장 자체는 facet.ts 의 messages 에 있다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { ProjectorFactory, ProjectorInstance, ProjectorViews, ProjectorRuntime } from '@ffacet/core/runtime';

type HeapSortExtractStage = {
  reset(values: number[]): void;
  setCaption(text: string): void;
  liftTop(value: number): Promise<void>;
  placeAndShrink(step: { boundary: number; value: number; order: number[] }): Promise<void>;
  finish(values: number[]): Promise<void>;
};

type StepPayload = {
  values?: unknown;
  value?: unknown;
  boundary?: unknown;
  order?: unknown;
};

function numberArray(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const x of v) {
    if (typeof x !== 'number') return null;
    out.push(x);
  }
  return out;
}

export const heapSortExtractProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as HeapSortExtractStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  let initialValues: number[] = [];

  return {
    onInit(initialData: unknown): void {
      const d = initialData as { values?: unknown } | undefined;
      initialValues = numberArray(d?.values) ?? [];
      stage?.reset(initialValues);
    },

    onEvent(event): void | Promise<void> {
      const p = event.payload as StepPayload | undefined;

      switch (event.type) {
        case 'rewind': {
          stage?.reset(numberArray(p?.values) ?? initialValues);
          return;
        }
        case 'heap-shown': {
          stage?.setCaption(
            tr('caption.heap', 'A max heap laid out in one row — the biggest value sits on top.'),
          );
          return;
        }
        case 'top-lifted': {
          const value = p?.value;
          if (typeof value !== 'number') return;
          stage?.setCaption(tr('caption.take', 'Take out the top — {value}.', { value }));
          return stage?.liftTop(value);
        }
        case 'boundary-moved': {
          const value = p?.value;
          const boundary = p?.boundary;
          const order = numberArray(p?.order);
          if (typeof value !== 'number' || typeof boundary !== 'number' || !order) return;
          stage?.setCaption(
            tr(
              'caption.place',
              'The heap hands back its last slot, and that is exactly where {value} sits down.',
              { value },
            ),
          );
          return stage?.placeAndShrink({ boundary, value, order });
        }
        case 'done': {
          const values = numberArray(p?.values);
          stage?.setCaption(
            tr('caption.done', 'Sorted inside the same row — not one extra slot was borrowed.'),
          );
          if (!values) return;
          return stage?.finish(values);
        }
        default:
          // 이 facet 이 내는 이벤트는 위가 전부다. 나머지는 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.reset(initialValues);
    },
  };
};
