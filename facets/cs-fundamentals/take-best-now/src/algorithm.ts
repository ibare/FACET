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
 * ── 이벤트 (전부 이 facet 고유)
 *   goal-set       payload 없음
 *                  만들 금액을 세운다. 금액은 `initialData.target` 에 이미 있으므로
 *                  싣지 않는다 — 이 걸음이 말하는 것은 "이제 여기를 겨눈다" 뿐이다.
 *   reach-updated  payload 없음 · silent
 *                  남은 몫이 갱신되는 걸음. 집으면 닿는 거리가 따라 자라므로
 *                  `coin-taken` 과 한 걸음이고, 그래서 조용히 보낸다 — 걸음을 늘리면
 *                  띠에 0ms 짜리 눈금이 선다. 남은 몫도 손이 닿는 자리도 장면이
 *                  집은 것들에서 셈하므로 수를 실을 것이 없다.
 *   coin-taken     target `coin:<i>`, payload 없음
 *                  진열대 i 자리의 동전이 쟁반으로 내려온다. 액면도, 몇 번째로
 *                  내려앉는지도, 그래서 몫이 얼마가 되는지도 전부 자리 번호와
 *                  지금까지 집은 것들에서 나온다.
 *   done           payload 없음
 *                  남은 몫이 0 이거나 더 집을 것이 없다. 몇 닢이었나는 쌓인 것을
 *                  세면 나온다.
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

/**
 * 남은 몫에 들어가는 자리들.
 *
 * **내주는 까닭** — 화면도 같은 것을 알아야 한다 (손이 닿는 자리만 또렷하게
 * 남는 것이 이 조각의 그림이다). 걸음에 실어 보내면 "들어간다" 의 잣대가 장면과
 * 여기 두 군데에 적히므로, 싣는 대신 함수를 내주어 장면이 부르게 한다.
 * 내주는 것이 그리디의 기준 자체는 아니다 — 고르는 일은 `bestIndex` 가 하고
 * 그것은 내주지 않는다.
 */
export function reachableIndices(coins: readonly number[], remaining: number): number[] {
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
function bestIndex(coins: readonly number[], remaining: number): number {
  let best = -1;
  for (const i of reachableIndices(coins, remaining)) {
    if (best < 0 || coins[i] > coins[best]) best = i;
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

  await ctx.emit({ type: 'goal-set' });
  await ctx.emit({ type: 'reach-updated', silent: true });

  let remaining = target;

  for (;;) {
    const index = bestIndex(coins, remaining);
    if (index < 0) break;
    if (!(await gate())) return;

    remaining -= coins[index];

    await ctx.emit({ type: 'coin-taken', target: `coin:${index}` });
    await ctx.emit({ type: 'reach-updated', silent: true });
    if (ctx.cancelled) return;
  }

  if (!(await gate())) return;
  await ctx.emit({ type: 'done' });
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
