/**
 * greedyCanFail projector — 두 줄의 걸음을 무대 메서드로 옮긴다.
 *
 * payload 는 열린 타입이라 그대로 넘기지 않는다. `typeof` 로 걸러 정형 객체를
 * 조립한 뒤에만 stage 로 보낸다 (C9). 화면 문안은 여기서 키로 조회하고
 * (C10), stage 는 완성된 한 줄만 받는다.
 */

import {
  makeTranslator,
  type ProjectorFactory,
  type ProjectorInstance,
} from '@ffacet/core/runtime';

type Lane = 'greedy' | 'fewest';

type StagePick = { value: number; remaining: number };

/** 무대의 구조적 계약. 러너가 주는 ViewInstance 를 이 형태로 좁혀 쓴다 (C9). */
type GreedyCanFailStage = {
  init?(spec: { coins: number[]; target: number }): void;
  showGoal?(spec: { target: number; capacity: number }): Promise<void>;
  takeCoins?(picks: Partial<Record<Lane, StagePick>>): Promise<void>;
  settleLane?(spec: { lane: Lane; count: number }): Promise<void>;
  showVerdict?(spec: { greedyCount: number; fewestCount: number }): Promise<void>;
  setCaption?(message: string): void;
};

type GoalPayload = { target?: unknown; capacity?: unknown };
type PickPayload = {
  greedyValue?: unknown;
  greedyRemaining?: unknown;
  fewestValue?: unknown;
  fewestRemaining?: unknown;
};
type SettledPayload = { lane?: unknown; count?: unknown; otherRemaining?: unknown };
type VerdictPayload = { greedyCount?: unknown; fewestCount?: unknown; difference?: unknown };

function readPick(value: unknown, remaining: unknown): StagePick | undefined {
  if (typeof value !== 'number' || typeof remaining !== 'number') return undefined;
  return { value, remaining };
}

export const greedyCanFailProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as GreedyCanFailStage;
  const tr = runtime?.t ?? makeTranslator();

  // 선반과 목표는 다시 세울 때마다 필요하다. 되감기·리셋이 초기 데이터를
  // 다시 주지는 않으므로 여기서 들고 있는다 (원칙 5 — 필요한 만큼만 shadow-copy).
  let coins: number[] = [];
  let target = 0;

  /** 처음 화면. 무대를 세우고 무엇이 놓여 있는지만 말한다. */
  const rebuildStage = (): void => {
    stage.init?.({ coins: [...coins], target });
    stage.setCaption?.(
      tr('caption.setup', 'Both rows share the shelf above and may take any coin as often as they need.'),
    );
  };

  return {
    onInit(initialData) {
      const data = initialData as { coins?: unknown; target?: unknown } | undefined;
      const rawCoins = data?.coins;
      const rawTarget = data?.target;
      coins = Array.isArray(rawCoins)
        ? rawCoins.filter((v): v is number => typeof v === 'number')
        : [];
      target = typeof rawTarget === 'number' ? rawTarget : 0;
      rebuildStage();
    },

    async onEvent(event) {
      switch (event.type) {
        case 'goal-set': {
          const p = event.payload as GoalPayload | undefined;
          const nextTarget = typeof p?.target === 'number' ? p.target : target;
          const capacity = typeof p?.capacity === 'number' ? p.capacity : 0;
          target = nextTarget;
          stage.setCaption?.(
            tr('caption.goal', 'Both rows set out from the same target — {target}.', {
              target: nextTarget,
            }),
          );
          await stage.showGoal?.({ target: nextTarget, capacity });
          return;
        }

        case 'fork-picked':
        case 'round-picked': {
          const p = event.payload as PickPayload | undefined;
          const greedy = readPick(p?.greedyValue, p?.greedyRemaining);
          const fewest = readPick(p?.fewestValue, p?.fewestRemaining);
          if (!greedy && !fewest) return;

          if (event.type === 'fork-picked' && greedy && fewest) {
            stage.setCaption?.(
              tr(
                'caption.fork',
                'The first pick already splits them. One row takes {a}, the other {b}. Left over — {ra} and {rb}.',
                { a: greedy.value, b: fewest.value, ra: greedy.remaining, rb: fewest.remaining },
              ),
            );
          } else if (greedy && fewest) {
            stage.setCaption?.(
              tr('caption.round', 'Each row takes one more coin by its own rule. Left over — {ra} and {rb}.', {
                ra: greedy.remaining,
                rb: fewest.remaining,
              }),
            );
          } else {
            const alone = greedy ?? fewest;
            if (alone) {
              stage.setCaption?.(
                tr('caption.alone', 'Only the row that is still short moves now. It takes {a}, leaving {ra}.', {
                  a: alone.value,
                  ra: alone.remaining,
                }),
              );
            }
          }

          const picks: Partial<Record<Lane, StagePick>> = {};
          if (greedy) picks.greedy = greedy;
          if (fewest) picks.fewest = fewest;
          await stage.takeCoins?.(picks);
          return;
        }

        case 'lane-settled': {
          const p = event.payload as SettledPayload | undefined;
          const lane: Lane | undefined =
            p?.lane === 'greedy' ? 'greedy' : p?.lane === 'fewest' ? 'fewest' : undefined;
          const count = typeof p?.count === 'number' ? p.count : 0;
          const otherRemaining = typeof p?.otherRemaining === 'number' ? p.otherRemaining : 0;
          if (!lane || count <= 0) return;
          stage.setCaption?.(
            tr('caption.settled', 'One row is already finished with {n} coins. The other is still short — {r}.', {
              n: count,
              r: otherRemaining,
            }),
          );
          await stage.settleLane?.({ lane, count });
          return;
        }

        case 'verdict': {
          const p = event.payload as VerdictPayload | undefined;
          const greedyCount = typeof p?.greedyCount === 'number' ? p.greedyCount : 0;
          const fewestCount = typeof p?.fewestCount === 'number' ? p.fewestCount : 0;
          const difference = typeof p?.difference === 'number' ? p.difference : greedyCount - fewestCount;
          if (greedyCount <= 0 || fewestCount <= 0) return;
          stage.setCaption?.(
            tr(
              'caption.verdict',
              'Same coins, same target: {g} coins for largest first, {f} for fewest. The bigger first pick cost {d} more.',
              { g: greedyCount, f: fewestCount, d: difference },
            ),
          );
          await stage.showVerdict?.({ greedyCount, fewestCount });
          return;
        }

        case 'rewind': {
          // 처음으로 돌아간다. 무대를 다시 세우면 놓인 동전도 잣대도 함께 걷힌다.
          rebuildStage();
          return;
        }

        default:
          // 이 조각이 발신하는 이벤트는 위가 전부다. 그 밖은 조용히 흘린다.
          return;
      }
    },

    onReset() {
      // 러너가 곧 onInit 을 다시 부르지만, 그 사이에도 화면이 걸음을 남기고 있지
      // 않게 여기서 한 번 되돌린다.
      rebuildStage();
    },
  };
};
