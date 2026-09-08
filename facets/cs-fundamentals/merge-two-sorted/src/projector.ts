/**
 * merge-two-sorted projector — 걸음 이벤트를 무대 동작으로 옮긴다.
 *
 * payload 는 여기서 한 번 좁힌 뒤 정형 객체로 무대에 넘긴다 (C9). 무대는
 * `event` 도 `payload` 도 모르며 제 메서드만 안다.
 *
 * 화면 문안은 키로만 남고 문장은 `facet.ts` 의 `messages` 에 있다 (C10).
 */

import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';

/** 무대의 호출 계약. 구조적 열린 타입(ViewInstance)을 좁히는 자리다 (C9). */
type MergeStage = {
  init?(data: { left: number[]; right: number[] }): void;
  setCaption?(text: string): void;
  showCompare?(p: { leftIndex: number; rightIndex: number }): void;
  takeDown?(p: { side: 'left' | 'right'; index: number; slot: number }): Promise<void>;
  finish?(): void;
};

type ComparePayload = {
  leftIndex?: unknown;
  rightIndex?: unknown;
  leftValue?: unknown;
  rightValue?: unknown;
};

type TakePayload = {
  side?: unknown;
  index?: unknown;
  value?: unknown;
  slot?: unknown;
  compared?: unknown;
};

type DonePayload = { comparisons?: unknown };

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number');
}

export const mergeTwoSortedProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as MergeStage;
  const tr = runtime?.t ?? makeTranslator();

  // 데이터 원본은 알고리즘의 ctx.data 다. 되감기에 필요한 만큼만 그림자로 든다.
  let snapshot: { left: number[]; right: number[] } = { left: [], right: [] };

  const premise = (): string => tr('caption.premise', 'Both rows are already in order.');

  const showStart = (): void => {
    stage.init?.(snapshot);
    stage.setCaption?.(premise());
  };

  return {
    onInit(initialData: unknown): void {
      const d = initialData as { left?: unknown; right?: unknown } | undefined;
      snapshot = { left: numberArray(d?.left), right: numberArray(d?.right) };
      showStart();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'compare': {
          const p = event.payload as ComparePayload | undefined;
          if (typeof p?.leftIndex !== 'number' || typeof p.rightIndex !== 'number') return;
          if (typeof p.leftValue !== 'number' || typeof p.rightValue !== 'number') return;
          stage.showCompare?.({ leftIndex: p.leftIndex, rightIndex: p.rightIndex });
          stage.setCaption?.(
            tr('caption.compare', 'Only the fronts are compared: {left} vs {right}', {
              left: p.leftValue,
              right: p.rightValue,
            }),
          );
          return;
        }

        case 'take': {
          const p = event.payload as TakePayload | undefined;
          const side = p?.side === 'left' || p?.side === 'right' ? p.side : undefined;
          if (side === undefined) return;
          if (typeof p?.index !== 'number' || typeof p.slot !== 'number') return;
          if (typeof p.value !== 'number') return;
          stage.setCaption?.(
            p.compared === true
              ? tr('caption.take', 'The smaller front is {value} — down it goes', {
                  value: p.value,
                })
              : tr('caption.drain', 'Nothing left to compare — the rest just follows down'),
          );
          await stage.takeDown?.({ side, index: p.index, slot: p.slot });
          return;
        }

        case 'rewind': {
          showStart();
          return;
        }

        case 'done': {
          const p = event.payload as DonePayload | undefined;
          if (typeof p?.comparisons !== 'number') return;
          stage.finish?.();
          stage.setCaption?.(
            tr('caption.done', 'One pass, {comparisons} comparisons, and nothing was re-sorted', {
              comparisons: p.comparisons,
            }),
          );
          return;
        }

        default:
          // 이 facet 의 알고리즘은 위 넷만 발신한다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      showStart();
    },
  };
};
