/**
 * 역파일 색인 projector — algorithm 의 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 캡션 문안은 여기서 조회한다 (`runtime.t`). 코드에는 키와 en 원본만 남고 문안
 * 자체는 `facet.ts` 의 messages 에 있다 (C10).
 *
 * payload 는 여기서 좁혀 정형 객체로 만들어 넘긴다 (C9). stage 는 필수 필드
 * 타입으로 받는다. `initialData` 를 좁히는 일은 stage 의 mount 가 이미 하므로
 * 여기서 다시 하지 않는다.
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core';

/** stage 가 내주는 표면. 없는 메서드는 `?.()` 로 부른다. */
type Stage = {
  setCaption?(text: string): void;
  beginRound?(args: { truth: number[]; cells: number[][] }): void | Promise<void>;
  showOrder?(args: { order: number[] }): void | Promise<void>;
  openCell?(args: { cell: number; scanned: number[]; answer: number[] }): void | Promise<void>;
  finishRound?(args: { opened: number[] }): void;
  reset?(): void;
};

function numberList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number');
}

function numberMatrix(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => numberList(row));
}

function integer(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export const invertedFileIndexProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'round-begin': {
          const p = event.payload as { truth?: unknown; cells?: unknown } | undefined;
          stage?.setCaption?.(
            tr('caption.begin', 'The query sits at the center. A ring marks the true five nearest.'),
          );
          await stage?.beginRound?.({
            truth: numberList(p?.truth),
            cells: numberMatrix(p?.cells),
          });
          return;
        }
        case 'probe-order': {
          const p = event.payload as { order?: unknown } | undefined;
          const order = numberList(p?.order);
          stage?.setCaption?.(
            tr('caption.order', 'Distance to each centroid sets the order: {order}.', {
              // 화면의 칸 번호는 1 부터 센다 — 평면의 마름모와 색인 줄머리가 같은 수를 단다.
              order: order.map((cell) => cell + 1).join(' · '),
            }),
          );
          await stage?.showOrder?.({ order });
          return;
        }
        case 'cell-opened': {
          const p = event.payload as
            | { cell?: unknown; scanned?: unknown; answer?: unknown }
            | undefined;
          const scanned = numberList(p?.scanned);
          const cell = integer(p?.cell);
          stage?.setCaption?.(
            tr('caption.open', 'Cell opened: {cell}. Points seen: {seen}.', {
              cell: cell + 1,
              seen: scanned.length,
            }),
          );
          await stage?.openCell?.({ cell, scanned, answer: numberList(p?.answer) });
          return;
        }
        case 'round-end': {
          const p = event.payload as
            | { seen?: unknown; total?: unknown; hit?: unknown; recall?: unknown; opened?: unknown }
            | undefined;
          stage?.setCaption?.(
            tr(
              'caption.result',
              'Points seen: {seen} of {total}. Of the true five, found {hit}. Recall: {recall}%.',
              {
                seen: integer(p?.seen),
                total: integer(p?.total),
                hit: integer(p?.hit),
                recall: integer(p?.recall),
              },
            ),
          );
          stage?.finishRound?.({ opened: numberList(p?.opened) });
          return;
        }
        default:
          // 이 algorithm 이 내는 것은 위 넷뿐이다. 그 밖의 type 은 조용히 흘린다.
          return;
      }
    },

    onReset(): void {
      stage?.reset?.();
    },
  };
};
