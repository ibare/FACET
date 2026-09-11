/**
 * coin-flip-height projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 정형 객체로 넘긴다. stage 는 `unknown` 을 받지 않는다 (C9).
 * 문안은 facet.ts 의 `messages` 에 있고 여기에는 키와 en 원본만 남는다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

/** stage 가 내주는 표면. 없는 메서드를 불러도 터지지 않게 optional 로 잡는다 (C9). */
type CoinFlipHeightStage = {
  setCaption?(text: string): void;
  stackTower?(row: {
    index: number;
    value: number;
    flips: string[];
    height: number;
  }): Promise<void> | void;
  packLevels?(counts: number[]): Promise<void> | void;
  markHalves?(): Promise<void> | void;
  rewind?(): void;
};

type StackPayload = {
  index?: unknown;
  value?: unknown;
  flips?: unknown;
  heads?: unknown;
  height?: unknown;
};

export const coinFlipHeightProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CoinFlipHeightStage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event) {
      switch (event.type) {
        case 'stack': {
          const p = event.payload as StackPayload | undefined;
          if (!p) break;
          if (
            typeof p.index !== 'number' ||
            typeof p.value !== 'number' ||
            typeof p.height !== 'number'
          ) {
            break;
          }
          const flips = Array.isArray(p.flips)
            ? (p.flips as unknown[]).filter((f): f is string => typeof f === 'string')
            : [];
          const heads = typeof p.heads === 'number' ? p.heads : p.height - 1;
          stage.setCaption?.(
            tr('caption.stack', 'Heads: {heads}. Tails stops it. Height: {height}.', {
              heads,
              height: p.height,
            }),
          );
          await stage.stackTower?.({
            index: p.index,
            value: p.value,
            flips,
            height: p.height,
          });
          break;
        }

        case 'level-counts': {
          const raw = (event.payload as { counts?: unknown } | undefined)?.counts;
          if (!Array.isArray(raw)) break;
          const counts = (raw as unknown[]).filter((n): n is number => typeof n === 'number');
          if (counts.length === 0) break;
          stage.setCaption?.(
            tr('caption.pack', 'Line the levels up. Each level keeps about half.'),
          );
          await stage.packLevels?.(counts);
          break;
        }

        case 'done': {
          stage.setCaption?.(tr('caption.done', 'Nobody balanced the shape. The coin did.'));
          await stage.markHalves?.();
          break;
        }

        case 'rewind': {
          stage.rewind?.();
          break;
        }

        default:
          // 이 알고리즘은 위 넷만 발신한다. 그 밖의 것은 조용히 흘린다 (C2).
          break;
      }
    },
  };
};
