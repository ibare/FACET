/**
 * greedyCanFail — 「눈앞의 최선이 끝의 최선은 아니다」 조각(piece) 알고리즘.
 *
 * 같은 동전 묶음으로 같은 금액을 만드는 두 줄을 나란히 굴린다.
 *   greedy  — 남은 몫에 들어가는 **가장 큰 동전**을 매번 집는다.
 *   fewest  — **개수가 가장 적은 조합**을 DP 로 구해 큰 것부터 늘어놓는다.
 * 걸음마다 두 줄의 남은 몫이 갈라지고, 끝에 닿았을 때 쌓인 개수가 다르다.
 *
 * 두 줄의 계획은 전부 여기서 셈한다 — 걸음표를 손으로 적지 않았고, 결과값을 선언에
 * 박아 두지도 않았다. `coins` / `target` 만 바꾸면 두 줄의 길이도 갈림의 자리도 그에
 * 맞게 다시 셈해진다. 다만 **그 계획에서 파생되는 수는 발신에 싣지 않는다** — 집은
 * 액면만 보내고 남은 몫도 개수도 화면이 그 목록에서 센다.
 *
 * ── 식별자
 * 이 조각은 `index:` / `node:` 류 target 문법을 쓰지 않는다. 다룰 대상이 두 줄
 * 뿐이라 payload 의 `greedy` / `fewest` 접두 필드가 곧 식별자다.
 *
 * ── 이벤트 (전부 facet 고유 확장. silent 는 하나도 없다 — 모두 걸음의 경계다)
 *
 * **payload 는 장면이 셀 수 없는 것만 싣는다.** 남은 몫도 개수도 차이도 차례도 집은
 * 액면의 목록에서 나오므로 여기서 세어 보내지 않는다 — 두 곳에서 세면 언젠가 갈린다
 * (`tasks/scene-migration-protocol.md` 4 절).
 *
 * | type          | payload                                                              |
 * |---------------|----------------------------------------------------------------------|
 * | `goal-set`    | `{ capacity: number }`                                               |
 * |               | capacity = 두 줄 중 더 긴 쪽의 동전 개수. 무대의 칸 너비를 역산한다.  |
 * |               | 첫 동전이 놓이기 전에 정해져야 하는데 장면은 앞일을 셀 수 없다.       |
 * |               | 함수를 내주려면 두 계획기를 통째로 내주어야 해 알고리즘이 장식이 된다.|
 * | `fork-picked` | `{ greedyValue?: number; fewestValue?: number }`                      |
 * |               | 첫 걸음. 두 줄이 서로 다른 동전을 집어 길이 갈리는 자리.              |
 * | `round-picked`| `fork-picked` 와 같은 스키마. 둘째 걸음부터.                          |
 * |               | 이미 끝난 줄의 필드는 아예 없다 (`typeof` 로 가른다).                 |
 * | `lane-settled`| 없음. 끝난 줄은 **남은 몫이 0 인데 눈금이 없는 줄**이라 장면이 가린다.|
 * |               | 한 줄이 끝났는데 다른 줄이 아직 남았을 때만 발신한다.                 |
 * | `verdict`     | 없음. 두 개수도 그 차이도 집은 것의 길이에서 나온다.                  |
 * | `rewind`      | 없음. 자동 재생이 끝난 뒤 처음으로 돌아갈 때.                         |
 *
 * ── 진행
 * `reactive` 메커니즘이다. 마운트하면 스스로 재생을 시작해 `ctx.sleep(stepMs)`
 * 간격으로 걸음을 놓고, 다 놓은 뒤에는 `advance` 입력을 기다리며 한 걸음씩
 * 되짚는다. 끝에서 누른 첫 `advance` 는 되감고 첫 걸음까지 보인다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GreedyCanFailData = {
  type: 'greedyCanFail';
  /** 쓸 수 있는 동전 액면. 각 액면은 얼마든지 쓸 수 있다. */
  coins: number[];
  /** 두 줄이 함께 만들어야 하는 금액. */
  target: number;
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이라 선언에 둔다. */
  stepMs: number;
};

const DEFAULT_STEP_MS = 800;

/** 남은 몫에 들어가는 가장 큰 동전을 매번 집는다. 뒤는 보지 않는다. */
function planGreedy(coins: readonly number[], target: number): number[] {
  const desc = [...coins].filter((c) => c > 0).sort((a, b) => b - a);
  const picked: number[] = [];
  let left = target;
  while (left > 0) {
    const coin = desc.find((c) => c <= left);
    // 남은 몫을 채울 동전이 없으면 이 방식으로는 못 만든다.
    if (coin === undefined) return [];
    picked.push(coin);
    left -= coin;
  }
  return picked;
}

/**
 * 개수가 가장 적은 조합. 금액 1..target 을 차례로 채워 올리고 되짚는다.
 * 늘어놓을 때는 큰 것부터 — 두 줄을 나란히 읽으려면 순서 규칙이 같아야 한다.
 */
function planFewest(coins: readonly number[], target: number): number[] {
  const usable = coins.filter((c) => c > 0);
  const best = new Array<number>(target + 1).fill(Number.POSITIVE_INFINITY);
  const usedCoin = new Array<number>(target + 1).fill(0);
  best[0] = 0;
  for (let amount = 1; amount <= target; amount += 1) {
    for (const coin of usable) {
      if (coin > amount) continue;
      const candidate = best[amount - coin] + 1;
      if (candidate < best[amount]) {
        best[amount] = candidate;
        usedCoin[amount] = coin;
      }
    }
  }
  if (!Number.isFinite(best[target])) return [];
  const picked: number[] = [];
  let left = target;
  while (left > 0) {
    const coin = usedCoin[left];
    if (coin <= 0) return [];
    picked.push(coin);
    left -= coin;
  }
  return picked.sort((a, b) => b - a);
}

export const greedyCanFail = async (base: FacetContext<GreedyCanFailData>): Promise<void> => {
  // reactive 메커니즘이 주입한 확장 ctx (sleep / waitForInput) 를 쓴다.
  const ctx = base as ReactiveContext<GreedyCanFailData>;
  const coins = Array.isArray(ctx.data.coins) ? ctx.data.coins : [];
  const target = typeof ctx.data.target === 'number' ? ctx.data.target : 0;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;

  const greedy = planGreedy(coins, target);
  const fewest = planFewest(coins, target);

  // 한쪽이라도 만들 수 없는 금액이면 견줄 것이 없다. 목표만 세우고 멈춘다.
  if (greedy.length === 0 || fewest.length === 0) {
    await ctx.emit({ type: 'goal-set', payload: { capacity: 0 } });
    return;
  }

  const rounds = Math.max(greedy.length, fewest.length);

  // 걸음을 함수로 모은다. 자동 재생과 `advance` 되짚기가 같은 걸음을 밟아야
  // 두 경로가 어긋나지 않는다. 배열의 길이도 순서도 위에서 셈한 두 줄이 정한다.
  const steps: Array<() => Promise<void>> = [];

  steps.push(async () => {
    await ctx.emit({ type: 'goal-set', payload: { capacity: rounds } });
  });

  /** 이 걸음에서 `a` 가 끝나는데 `b` 는 아직 남았나. 그 어긋남이 멈출 자리다. */
  const stopsAlone = (a: readonly number[], b: readonly number[], round: number): boolean =>
    a.length - 1 === round && b.length - 1 > round;

  for (let round = 0; round < rounds; round += 1) {
    const g = greedy[round];
    const f = fewest[round];
    const picked = {
      ...(g === undefined ? {} : { greedyValue: g }),
      ...(f === undefined ? {} : { fewestValue: f }),
    };
    if (round === 0) {
      steps.push(async () => {
        await ctx.emit({ type: 'fork-picked', payload: picked });
      });
    } else {
      steps.push(async () => {
        await ctx.emit({ type: 'round-picked', payload: picked });
      });
    }

    // 한 줄이 끝났는데 다른 줄은 아직 모자란 자리. 어느 줄인지는 싣지 않는다 —
    // 남은 몫이 0 인데 아직 눈금이 없는 줄이 그것이고, 화면이 그 둘을 다 안다.
    if (stopsAlone(fewest, greedy, round) || stopsAlone(greedy, fewest, round)) {
      steps.push(async () => {
        await ctx.emit({ type: 'lane-settled' });
      });
    }
  }

  steps.push(async () => {
    await ctx.emit({ type: 'verdict' });
  });

  // 자동 재생 — 아무것도 누르지 않아도 화면은 할 말을 마친다.
  for (const step of steps) {
    if (ctx.cancelled) return;
    await step();
    if (!(await ctx.sleep(stepMs))) return;
  }

  // 곱씹는 사람의 걸음. 끝에서 누른 첫 `advance` 는 되감고 첫 걸음까지 보인다.
  let cursor = steps.length;
  for (;;) {
    const input = await ctx.waitForInput();
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;
    if (cursor >= steps.length) {
      await ctx.emit({ type: 'rewind' });
      cursor = 0;
    }
    await steps[cursor]();
    cursor += 1;
  }
};
