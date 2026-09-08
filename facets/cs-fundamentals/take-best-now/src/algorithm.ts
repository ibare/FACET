/**
 * take-best-now — 그리디 선택 조각 (S-piece).
 *
 * 묻는 것 하나: 그리디는 매 순간 무엇을 보고 무엇을 하는가.
 * 답: **지금 남은 몫 하나만 보고, 거기 들어가는 가장 큰 것을 집는다.**
 * 앞뒤를 재는 걸음도, 집은 것을 도로 무르는 걸음도 이 알고리즘에는 없다 —
 * 그래서 이 파일에는 비교 이벤트도 되돌림 이벤트도 없다.
 *
 * ── 식별자 문법 (facet 고유 prefix)
 *   coin:<i>   진열대 i 번째 자리. i 는 `data.coins` 의 인덱스이며 화면 배치와 같다.
 *
 * ── 이벤트 (전부 이 facet 고유. silent 인 것은 없다 — 모두 화면이 바뀐다)
 *   goal-set       payload { target: number }
 *                  만들 금액을 세운다.
 *   reach-updated  payload { remaining: number; reachable: number[] }
 *                  남은 몫이 갱신되고, 그 몫에 들어가는 자리만 남는다.
 *                  reachable 은 coins 의 인덱스 배열.
 *   coin-taken     target `coin:<i>`
 *                  payload { index: number; value: number; before: number;
 *                            after: number; slot: number }
 *                  진열대 index 자리의 동전이 아래 slot 번째 자리로 내려온다.
 *                  slot 은 0 부터 늘기만 하며 비는 일이 없다 (무르지 않으므로).
 *   done           payload { count: number; target: number }
 *                  남은 몫이 0. count 는 집은 횟수.
 *   rewind         payload 없음
 *                  손으로 짚기 위해 처음으로 되감는다 (S-piece 의 advance 규약).
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없으므로 ctx.metric 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TakeBestNowData = {
  type: 'take-best-now';
  /** 고를 수 있는 동전 액면. 배열 순서가 곧 진열 순서이고 인덱스가 곧 자리다. */
  coins: number[];
  /** 만들어야 할 금액. */
  target: number;
  /** 걸음 간격 (S-piece — 읽을 시간을 주는 것은 저작 결정이다). */
  stepMs: number;
};

/**
 * 한 걸음을 열어 주는 문.
 *
 * 자동 재생에서는 `ctx.sleep`, 손으로 짚을 때는 `advance` 입력이 문이 된다.
 * 걸음의 내용은 같고 문만 갈리므로 시퀀스를 두 벌 적지 않는다.
 * false 를 돌려주면 취소된 것이라 그 자리에서 접는다.
 */
type Gate = () => Promise<boolean>;

/** 남은 몫에 들어가는 자리들. */
function reachableIndices(coins: number[], remaining: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < coins.length; i += 1) {
    const c = coins[i];
    if (c > 0 && c <= remaining) out.push(i);
  }
  return out;
}

/**
 * 그리디의 유일한 기준 — 남은 몫에 들어가는 것 중 가장 큰 것의 자리.
 *
 * 배열이 내림차순이라는 것을 전제하지 않는다. 인덱스가 화면 자리와 1:1 이라
 * 정렬해 버리면 자리가 어긋난다.
 */
function bestIndex(coins: number[], remaining: number): number {
  let best = -1;
  for (let i = 0; i < coins.length; i += 1) {
    const c = coins[i];
    if (c <= 0 || c > remaining) continue;
    if (best < 0 || c > coins[best]) best = i;
  }
  return best;
}

/**
 * 한 회차. 남은 몫이 0 이 되거나 들어갈 것이 없어질 때까지 집어 내린다.
 *
 * 걸음표를 손으로 적지 않는다 (C2) — 걸음의 수도 순서도 coins 와 target 이 정한다.
 */
async function runOnce(ctx: ReactiveContext<TakeBestNowData>, gate: Gate): Promise<void> {
  const { coins, target } = ctx.data;

  await ctx.emit({ type: 'goal-set', payload: { target } });
  await ctx.emit({
    type: 'reach-updated',
    payload: { remaining: target, reachable: reachableIndices(coins, target) },
  });

  let remaining = target;
  let count = 0;

  for (;;) {
    const index = bestIndex(coins, remaining);
    if (index < 0) break;
    if (!(await gate())) return;

    const value = coins[index];
    const before = remaining;
    remaining -= value;
    count += 1;

    await ctx.emit({
      type: 'coin-taken',
      target: `coin:${index}`,
      payload: { index, value, before, after: remaining, slot: count - 1 },
    });
    await ctx.emit({
      type: 'reach-updated',
      payload: { remaining, reachable: reachableIndices(coins, remaining) },
    });
    if (ctx.cancelled) return;
  }

  if (!(await gate())) return;
  await ctx.emit({ type: 'done', payload: { count, target } });
}

/**
 * 자동으로 한 회차를 보인 뒤, `advance` 로 다시 짚을 수 있게 기다린다.
 *
 * 자동 재생이 끝난 뒤 처음 누르는 advance 는 되감고 **첫 걸음까지** 보인다
 * (S-piece). 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽히므로,
 * 되감은 직후의 첫 문은 그냥 통과시킨다.
 */
export const takeBestNow = async (ctx: FacetContext<TakeBestNowData>): Promise<void> => {
  const rctx = ctx as ReactiveContext<TakeBestNowData>;
  const stepMs = ctx.data.stepMs;

  await runOnce(rctx, () => rctx.sleep(stepMs));

  for (;;) {
    const input = await rctx.waitForInput();
    if (input.type !== 'advance') continue;

    await rctx.emit({ type: 'rewind' });

    let firstGateIsFree = true;
    await runOnce(rctx, async () => {
      if (firstGateIsFree) {
        firstGateIsFree = false;
        return true;
      }
      for (;;) {
        const next = await rctx.waitForInput();
        if (rctx.cancelled) return false;
        if (next.type === 'advance') return true;
      }
    });
    if (rctx.cancelled) return;
  }
};
