/**
 * compare-and-swap projector — 이벤트를 stage 메서드 호출로 번역한다.
 *
 * payload 는 오픈 타입이므로 여기서 한 번에 좁힌 뒤 정형 객체로 넘긴다 (C9).
 * 화면 문안은 코드에 키와 en 원본만 두고, 저작 문안은 FacetJson.messages 가
 * 갖는다 (C10). 짝 번호는 target `index:<i>` 에서 parseTarget 경유로 얻는다.
 */

import {
  makeTranslator,
  toIndexArray,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
} from '@ffacet/core/runtime';
import type { PairOrder } from './algorithm.js';

/** stage 가 노출하는 메서드. ViewInstance 는 오픈 타입이라 여기서 한 번 좁힌다 (C9). */
type CompareAndSwapStage = {
  init?(pairs: [number, number][]): void;
  reset?(): void;
  setCaption?(text: string): void;
  compare?(arg: { pair: number; left: number; right: number; order: PairOrder }): Promise<void>;
  cross?(arg: { pair: number }): Promise<void>;
  settle?(arg: { pair: number }): Promise<void>;
};

const ORDERS: readonly PairOrder[] = ['greater', 'less', 'equal'];

function isOrder(value: unknown): value is PairOrder {
  return typeof value === 'string' && (ORDERS as readonly string[]).includes(value);
}

function pairIndex(event: FacetRuntimeEvent): number | null {
  const [index] = toIndexArray(event.target);
  return typeof index === 'number' ? index : null;
}

function readPairs(raw: unknown): [number, number][] {
  if (!Array.isArray(raw)) return [];
  const out: [number, number][] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [a, b] = entry;
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    out.push([a, b]);
  }
  return out;
}

export const compareAndSwapProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as CompareAndSwapStage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown): void {
      const data = initialData as { pairs?: unknown } | undefined;
      stage.init?.(readPairs(data?.pairs));
    },

    onReset(): void {
      stage.reset?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'compare': {
          const pair = pairIndex(event);
          const p = event.payload as { left?: unknown; right?: unknown; order?: unknown } | undefined;
          if (pair === null) return;
          if (typeof p?.left !== 'number' || typeof p.right !== 'number' || !isOrder(p.order)) return;
          stage.setCaption?.(
            tr('caption.compare', 'Comparing {left} and {right} — the test itself moves nothing.', {
              left: p.left,
              right: p.right,
            }),
          );
          await stage.compare?.({ pair, left: p.left, right: p.right, order: p.order });
          return;
        }

        case 'swap': {
          const pair = pairIndex(event);
          if (pair === null) return;
          stage.setCaption?.(
            tr('caption.swap', "Out of order, so the two values cross into each other's seats."),
          );
          await stage.cross?.({ pair });
          return;
        }

        case 'hold': {
          const pair = pairIndex(event);
          const p = event.payload as { reason?: unknown } | undefined;
          if (pair === null) return;
          stage.setCaption?.(
            p?.reason === 'equal'
              ? tr('caption.holdEqual', 'The two are equal — there is nothing to put in order.')
              : tr('caption.holdOrdered', 'Already in order — the comparison ends there and nothing moves.'),
          );
          await stage.settle?.({ pair });
          return;
        }

        case 'rewind': {
          stage.reset?.();
          return;
        }

        case 'done': {
          const p = event.payload as { compares?: unknown; swaps?: unknown } | undefined;
          if (typeof p?.compares !== 'number' || typeof p.swaps !== 'number') return;
          stage.setCaption?.(
            tr('caption.summary', '{compares} comparisons, and only {swaps} of them moved anything.', {
              compares: p.compares,
              swaps: p.swaps,
            }),
          );
          return;
        }

        default:
          // 이 algorithm 이 내는 이벤트는 위 다섯이 전부다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },
  };
};
