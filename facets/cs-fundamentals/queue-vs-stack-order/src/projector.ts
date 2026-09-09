/**
 * queue-vs-stack-order projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 열린 타입이므로 여기서 한 번에 좁힌다 (C9). stage 는 필수 필드만
 * 받는 정형 객체를 보고, 검사는 이 파일 밖으로 나가지 않는다.
 *
 * 화면 문안은 키로만 다룬다 (C10). 문안 자체는 facet.ts 의 messages 에 있다.
 */

import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type {
  QueueVsStackOrderOffer,
  QueueVsStackOrderSeed,
  QueueVsStackOrderTake,
} from './queue-vs-stack-order-stage.js';

type QueueVsStackOrderStage = {
  setGraph(graph: { vertices: number[]; edges: number[][]; start: number }): void;
  setCaption(text: string): void;
  seed(step: QueueVsStackOrderSeed): Promise<void>;
  take(step: QueueVsStackOrderTake): Promise<void>;
  offer(step: QueueVsStackOrderOffer): Promise<void>;
  reset(): void;
};

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

function asEdges(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  const out: number[][] = [];
  for (const entry of value) {
    const pair = asNumbers(entry);
    if (pair.length >= 2) out.push([pair[0], pair[1]]);
  }
  return out;
}

export const queueVsStackOrderProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as QueueVsStackOrderStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const readyCaption = (): string =>
    tr('caption.ready', 'Same graph, same neighbour order — only the vessels differ.');

  return {
    onInit(initialData: unknown) {
      const data = initialData as
        | { vertices?: unknown; edges?: unknown; start?: unknown }
        | undefined;
      const vertices = asNumbers(data?.vertices);
      const edges = asEdges(data?.edges);
      const start = asNumber(data?.start) ?? vertices[0] ?? 0;
      stage?.setGraph({ vertices, edges, start });
      stage?.setCaption(readyCaption());
    },

    async onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'seed': {
          const p = event.payload as
            | { vertex?: unknown; fifoPending?: unknown; lifoPending?: unknown }
            | undefined;
          const vertex = asNumber(p?.vertex);
          if (vertex === null) return;
          stage?.setCaption(
            tr('caption.seed', 'The start, {vertex}, goes into both vessels.', { vertex }),
          );
          await stage?.seed({
            vertex,
            fifoPending: asNumbers(p?.fifoPending),
            lifoPending: asNumbers(p?.lifoPending),
          });
          return;
        }

        case 'take': {
          const p = event.payload as
            | {
                fifoTaken?: unknown;
                lifoTaken?: unknown;
                fifoPending?: unknown;
                lifoPending?: unknown;
                diverged?: unknown;
              }
            | undefined;
          const fifoTaken = asNumber(p?.fifoTaken);
          const lifoTaken = asNumber(p?.lifoTaken);
          if (fifoTaken === null || lifoTaken === null) return;
          const diverged = p?.diverged === true;
          stage?.setCaption(
            diverged
              ? tr(
                  'caption.diverge',
                  'Here the orders part — {fifo} from the front, {lifo} from the top.',
                  { fifo: fifoTaken, lifo: lifoTaken },
                )
              : tr('caption.take', 'Out — {fifo} from the front, {lifo} from the top.', {
                  fifo: fifoTaken,
                  lifo: lifoTaken,
                }),
          );
          await stage?.take({
            fifoTaken,
            lifoTaken,
            fifoPending: asNumbers(p?.fifoPending),
            lifoPending: asNumbers(p?.lifoPending),
            diverged,
          });
          return;
        }

        case 'offer': {
          const p = event.payload as
            | {
                fifoFrom?: unknown;
                lifoFrom?: unknown;
                fifoAdded?: unknown;
                lifoAdded?: unknown;
                fifoPending?: unknown;
                lifoPending?: unknown;
              }
            | undefined;
          const fifoFrom = asNumber(p?.fifoFrom);
          const lifoFrom = asNumber(p?.lifoFrom);
          if (fifoFrom === null || lifoFrom === null) return;
          stage?.setCaption(
            tr(
              'caption.offer',
              'The new neighbours go in, smallest number first — the same rule on both sides.',
            ),
          );
          await stage?.offer({
            fifoFrom,
            lifoFrom,
            fifoAdded: asNumbers(p?.fifoAdded),
            lifoAdded: asNumbers(p?.lifoAdded),
            fifoPending: asNumbers(p?.fifoPending),
            lifoPending: asNumbers(p?.lifoPending),
          });
          return;
        }

        case 'rewind': {
          stage?.reset();
          stage?.setCaption(readyCaption());
          return;
        }

        case 'done': {
          stage?.setCaption(
            tr('caption.done', 'Only the vessel differed, and the visiting order split.'),
          );
          return;
        }

        default:
          // 위 다섯이 이 알고리즘이 발신하는 전부다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },

    onReset() {
      stage?.reset();
      stage?.setCaption(readyCaption());
    },
  };
};
