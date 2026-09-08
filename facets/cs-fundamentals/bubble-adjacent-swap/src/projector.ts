/**
 * 인접 교환 조각의 Projector — algorithm 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 `unknown` 이라 여기서 한 번 좁혀 정형 객체로 만들고, stage 는 필수
 * 필드 타입만 받는다 (C9). 화면 문안은 키로만 다루고 실제 문장은
 * `facet.ts` 의 `messages` 에 있다 (C10).
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** stage 가 노출하는 계약. 없는 메서드는 `?.()` 로 건너뛴다. */
type BubbleAdjacentSwapStage = {
  init?(values: number[]): void;
  rewind?(values: number[]): void;
  setCaption?(text: string): void;
  showCompare?(p: { left: number; right: number }): Promise<void> | void;
  carry?(p: { left: number; right: number }): Promise<void> | void;
  handOver?(p: { left: number; right: number }): Promise<void> | void;
  settle?(p: { index: number }): Promise<void> | void;
};

type PairPayload = { left: number; right: number };

/** 견주는 두 칸의 번호. 하나라도 수가 아니면 걸음을 건너뛴다. */
function readPair(payload: unknown): PairPayload | null {
  const p = payload as { left?: unknown; right?: unknown } | undefined;
  if (typeof p?.left !== 'number' || typeof p?.right !== 'number') return null;
  return { left: p.left, right: p.right };
}

function readNumber(payload: unknown, key: string): number | null {
  const p = payload as Record<string, unknown> | undefined;
  const v = p?.[key];
  return typeof v === 'number' ? v : null;
}

function readValues(payload: unknown): number[] | null {
  const p = payload as { values?: unknown } | undefined;
  if (!Array.isArray(p?.values)) return null;
  return p.values.filter((v): v is number => typeof v === 'number');
}

export const bubbleAdjacentSwapProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as BubbleAdjacentSwapStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const caption = (text: string): void => stage?.setCaption?.(text);

  return {
    onInit(initialData: unknown): void {
      const values = readValues(initialData);
      stage?.init?.(values ?? []);
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'compare-begin': {
          const pair = readPair(event.payload);
          if (!pair) return;
          const a = readNumber(event.payload, 'leftValue');
          const b = readNumber(event.payload, 'rightValue');
          if (a !== null && b !== null) {
            caption(
              tr('caption.compare', 'Compare {a} and {b} — only these two, side by side.', {
                a,
                b,
              }),
            );
          }
          await stage?.showCompare?.(pair);
          return;
        }

        case 'swap-adjacent': {
          const pair = readPair(event.payload);
          if (!pair) return;
          const moved = readNumber(event.payload, 'movedValue');
          if (moved !== null) {
            caption(
              tr('caption.swap', '{big} is larger — it rises over its neighbour, one slot right.', {
                big: moved,
              }),
            );
          }
          await stage?.carry?.(pair);
          return;
        }

        case 'keep-adjacent': {
          const pair = readPair(event.payload);
          if (!pair) return;
          const b = readNumber(event.payload, 'rightValue');
          if (b !== null) {
            caption(
              tr('caption.keep', '{b} is already larger — nothing moves, and the lead is now {b}.', {
                b,
              }),
            );
          }
          await stage?.handOver?.(pair);
          return;
        }

        case 'pass-settled': {
          const index = readNumber(event.payload, 'settledIndex');
          const value = readNumber(event.payload, 'settledValue');
          const comparisons = readNumber(event.payload, 'comparisons');
          if (value !== null && comparisons !== null) {
            caption(
              tr(
                'caption.settled',
                '{n} neighbour comparisons, and {max} is at the far right. No step ever went looking for it.',
                { n: comparisons, max: value },
              ),
            );
          }
          if (index !== null) await stage?.settle?.({ index });
          return;
        }

        case 'rewind': {
          const values = readValues(event.payload);
          stage?.rewind?.(values ?? []);
          return;
        }

        default:
          // 이 algorithm 이 발신하는 이벤트는 위가 전부다. 그 밖은 조용히 버린다.
          return;
      }
    },

    onReset(): void {
      caption('');
    },
  };
};
