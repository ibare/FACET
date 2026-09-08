/**
 * take-best-now projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다 (C9). stage 는 `unknown` 을 보지 않는다.
 * 화면 문안은 키로만 들고 있고 (C10) 문안 자체는 facet.ts 의 messages 에 있다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 가 노출하는 계약. 없는 메서드는 `?.()` 로 넘어간다. */
type TakeBestNowStage = {
  setGoal?(target: number): void;
  setRemaining?(remaining: number, reachable: number[]): void;
  takeCoin?(pick: { index: number; slot: number }): Promise<void>;
  setCaption?(text: string): void;
  rewind?(): void;
};

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readIndices(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isInteger(v));
}

export const takeBestNowProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as TakeBestNowStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'goal-set': {
          const p = event.payload as { target?: unknown } | undefined;
          const target = readNumber(p?.target);
          if (target === null) return;
          stage?.setGoal?.(target);
          stage?.setCaption?.(
            tr('caption.goal', 'Make {target} out of these.', { target }),
          );
          return;
        }

        case 'reach-updated': {
          const p = event.payload as { remaining?: unknown; reachable?: unknown } | undefined;
          const remaining = readNumber(p?.remaining);
          if (remaining === null) return;
          stage?.setRemaining?.(remaining, readIndices(p?.reachable));
          return;
        }

        case 'coin-taken': {
          const p = event.payload as
            | { index?: unknown; value?: unknown; before?: unknown; slot?: unknown }
            | undefined;
          const index = readNumber(p?.index);
          const value = readNumber(p?.value);
          const before = readNumber(p?.before);
          const slot = readNumber(p?.slot);
          if (index === null || value === null || before === null || slot === null) return;
          // 집는 이유를 먼저 말하고, 그 결과로 동전이 내려간다. 문안이 집기 직전의
          // 몫(before)을 가리키므로 남은 몫이 줄어든 뒤에도 그대로 참이다.
          stage?.setCaption?.(
            tr('caption.take', 'Takes {coin} — the largest that fits in {before}.', {
              coin: value,
              before,
            }),
          );
          await stage?.takeCoin?.({ index, slot });
          return;
        }

        case 'done': {
          const p = event.payload as { count?: unknown; target?: unknown } | undefined;
          const count = readNumber(p?.count);
          const target = readNumber(p?.target);
          if (count === null || target === null) return;
          stage?.setCaption?.(
            tr('caption.done', '{count} coins make {target}. Not one was put back.', {
              count,
              target,
            }),
          );
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          return;
        }

        default:
          // 이 algorithm 은 위 다섯 가지만 발신한다. 그 밖의 것은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
