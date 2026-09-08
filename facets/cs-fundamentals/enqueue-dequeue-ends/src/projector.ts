/**
 * enqueue-dequeue-ends projector — 큐 이벤트를 궤도 위 자리로 옮긴다.
 *
 * 이 조각의 화면은 정거장 하나로 이어진 가로 궤도이고 (stage 파일 참조), 값이 어느
 * 정거장에 서는지를 정하는 것이 이 파일의 일이다. algorithm 은 "몇 번째로 들어왔는지"
 * 까지만 말하고 좌표는 모른다.
 *
 *   나온 자리 0 … c-1 · 줄 c … 2c-1 · 대기 2c … 3c-1     (c = 값 개수)
 *
 * 들어올 때는 order 번째 값이 대기 정거장 2c+order 에서 줄의 c+order 로 흘러간다.
 * 나갈 때는 계산할 것이 없다 — 이미 들어온 것 전부가 한 칸씩 앞으로 간다. 그 한 줄이
 * 이 조각의 주장이다.
 *
 * 화면 문안은 `FacetJson.messages` 에 있고 여기에는 키와 en 원본만 남는다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';

/** stage view 계약 (C9 — 열린 ViewInstance 를 이 구체형으로 한 번만 좁힌다). */
type FlowStage = {
  init(p: { values: number[] }): void;
  showDoors(): Promise<void>;
  admit(p: { order: number; toStation: number }): Promise<void>;
  advance(p: { toStations: number[] }): Promise<void>;
  matchOrder(): void;
  setCaption(text: string): void;
};

/** 차례를 잇는 기호 — 문안이 아니라 표기다 (C10 판정 3번). */
const ORDER_SEP = ' → ';

function toNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((n): n is number => typeof n === 'number');
}

export const enqueueDequeueEndsProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as FlowStage;
  const tr = runtime?.t ?? makeTranslator();

  let values: number[] = [];
  /** 이미 들어온 값들이 지금 서 있는 정거장 — 들어온 차례 그대로. */
  let stations: number[] = [];

  const reset = (): void => {
    stations = [];
    stage.init({ values });
  };

  const instance: ProjectorInstance = {
    onInit(initialData: unknown): void {
      const data = initialData as { values?: unknown } | undefined;
      values = toNumbers(data?.values);
      reset();
    },

    onEvent(event): void | Promise<void> {
      const capacity = values.length;
      switch (event.type) {
        case 'lane-ready': {
          stage.setCaption(tr('caption.doors', 'Two doors, one at each end.'));
          return stage.showDoors();
        }

        case 'enqueue': {
          const p = event.payload as { value?: number; order?: number } | undefined;
          if (typeof p?.value !== 'number' || typeof p?.order !== 'number') return;
          const toStation = capacity + p.order;
          stations.push(toStation);
          stage.setCaption(
            tr('caption.in', 'In through the back door — {value}', { value: p.value }),
          );
          return stage.admit({ order: p.order, toStation });
        }

        case 'dequeue': {
          const p = event.payload as { value?: number } | undefined;
          if (typeof p?.value !== 'number') return;
          // 들어온 것 전부가 한 칸 앞으로. 맨 앞은 그 한 칸에 앞쪽 문을 넘는다.
          stations = stations.map((station) => station - 1);
          stage.setCaption(
            tr('caption.out', 'Out through the front door — {value}', { value: p.value }),
          );
          return stage.advance({ toStations: [...stations] });
        }

        case 'done': {
          const p = event.payload as { inOrder?: unknown; outOrder?: unknown } | undefined;
          const inOrder = toNumbers(p?.inOrder);
          const outOrder = toNumbers(p?.outOrder);
          stage.setCaption(
            tr('caption.sameOrder', 'In {inOrder} — out {outOrder}. The order held.', {
              inOrder: inOrder.join(ORDER_SEP),
              outOrder: outOrder.join(ORDER_SEP),
            }),
          );
          stage.matchOrder();
          return;
        }

        case 'rewind': {
          reset();
          return;
        }

        default:
          // 이 facet 의 algorithm 은 위 다섯 외의 이벤트를 발신하지 않는다.
          // 그 밖의 것이 들어오면 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      // 러너가 곧 onInit 을 다시 부르지만, 그 사이에 낡은 자리를 들고 있지 않는다.
      stations = [];
    },
  };

  return instance;
};
