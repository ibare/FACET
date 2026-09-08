/**
 * union-by-rank 조각 — "골라 붙인다" 를 화면에서 실제로 고르는 알고리즘.
 *
 * 합칠 두 뿌리의 랭크를 견주어 어느 쪽을 아래로 넣을지 그때그때 판정한다.
 * 낮은 뿌리를 높은 뿌리 밑에 넣으면 키가 그대로고, 랭크가 같아 뒤집어 넣을
 * 수밖에 없을 때만 키가 하나 는다 — 그 판정 결과(표)를 미리 적어 두지 않고
 * `find` + 랭크 비교로 매 걸음 실제로 계산한다.
 *
 * 이벤트 어휘 (C2 확장 문서):
 *   'rank-compare' { rootA: number; rootB: number; rankA: number; rankB: number }
 *     target: ['node:<rootA>', 'node:<rootB>']  silent: false
 *     합칠 두 뿌리와 각각의 랭크를 나란히 보인다 — 어느 쪽이 낮은지 견주는 순간.
 *   'attach' { loser: number; winner: number; loserRank: number; winnerRank: number; tie: boolean }
 *     target: ['node:<loser>', 'node:<winner>']  silent: false
 *     진 쪽 뿌리(와 그 서브트리 전체)가 이긴 쪽 뿌리 밑으로 실제로 옮겨 붙는다.
 *   'rank-grow' { root: number; rank: number }
 *     target: 'node:<root>'  silent: false
 *     랭크가 같아 어쩔 수 없이 키가 하나 늘 때만 발신한다. 새 랭크 값을 싣는다.
 *   'rewind' (payload 없음)  silent: false
 *     자동 재생을 마친 뒤 첫 advance 입력에서 처음 상태로 되돌아간다는 신호.
 *     화면을 통째로 되돌리는, 눈에 보이는 변화라 silent 로 두지 않는다.
 *   'done' (표준 어휘, payload 없음)
 *     이번 한 바퀴(자동 또는 수동)의 마지막 union 까지 마쳤음을 알린다.
 *
 * `ctx.data.unions` 의 두 값은 언제나 그 시점의 뿌리를 가리키도록 주어지지만,
 * 알고리즘은 이를 가정하지 않고 매번 `find` 로 실제 뿌리를 구한다. `find` 의
 * 가리킴 루프는 `n` 을 넘지 않게 막아, 데이터에 고리가 있어도 멈춘다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type UnionByRankData = {
  type: 'unionByRank';
  /** 자리 수. */
  n: number;
  /** 순서대로 실행할 합치기. 각 쌍은 그 시점에 뿌리로 이어지는 자리를 가리킨다. */
  unions: [number, number][];
  /** 걸음 사이 자동 재생 간격(ms). */
  stepMs: number;
};

type PlayMode = 'auto' | 'manual';

async function pause(ctx: ReactiveContext, ms: number): Promise<boolean> {
  if (ctx.cancelled) return false;
  return ctx.sleep(ms);
}

export async function unionByRankAlgorithm(ctx: FacetContext<UnionByRankData>): Promise<void> {
  const rctx = ctx as ReactiveContext<UnionByRankData>;
  const { n, unions, stepMs } = ctx.data;

  let parent: number[] = [];
  let rank: number[] = [];

  const resetState = (): void => {
    parent = Array.from({ length: n }, (_, i) => i);
    rank = new Array(n).fill(0);
  };

  // 가리킴을 따라 뿌리를 찾는다. n 단계를 넘도록 뿌리에 못 닿으면 고리로 보고 멈춘다.
  const find = (x: number): number => {
    let cur = x;
    for (let i = 0; i <= n; i++) {
      if (parent[cur] === cur) return cur;
      cur = parent[cur]!;
    }
    return cur;
  };

  const gate = async (mode: PlayMode): Promise<boolean> => {
    if (ctx.cancelled) return false;
    if (mode === 'auto') return pause(rctx, stepMs);
    try {
      await rctx.waitForInput();
      return !ctx.cancelled;
    } catch {
      return false;
    }
  };

  const playOnce = async (mode: PlayMode): Promise<boolean> => {
    for (const [a, b] of unions) {
      if (ctx.cancelled) return false;
      const rootA = find(a);
      const rootB = find(b);
      if (rootA === rootB) continue;
      const rankA = rank[rootA]!;
      const rankB = rank[rootB]!;

      await ctx.emit({
        type: 'rank-compare',
        target: [`node:${rootA}`, `node:${rootB}`],
        payload: { rootA, rootB, rankA, rankB },
      });
      if (!(await gate(mode))) return false;

      // 랭크가 같으면 첫 인자(rootA)를 뿌리로 남긴다 — 그 외에는 낮은 쪽이 진다.
      const tie = rankA === rankB;
      const winner = rankB > rankA ? rootB : rootA;
      const loser = winner === rootA ? rootB : rootA;
      const loserRank = rank[loser]!;
      const winnerRank = rank[winner]!;
      parent[loser] = winner;

      await ctx.emit({
        type: 'attach',
        target: [`node:${loser}`, `node:${winner}`],
        payload: { loser, winner, loserRank, winnerRank, tie },
      });
      if (!(await gate(mode))) return false;

      if (tie) {
        rank[winner] = winnerRank + 1;
        await ctx.emit({
          type: 'rank-grow',
          target: `node:${winner}`,
          payload: { root: winner, rank: rank[winner] },
        });
        if (!(await gate(mode))) return false;
      }
    }
    if (ctx.cancelled) return false;
    await ctx.emit({ type: 'done' });
    return true;
  };

  resetState();
  const finishedAuto = await playOnce('auto');
  if (!finishedAuto) return;

  // 자동 재생을 마쳤다 — 이제부터는 advance 를 누를 때마다 한 걸음씩 짚어 본다.
  // 처음 누르는 advance 는 되감고, 그 자리에서 곧바로 첫 걸음까지 보인다.
  while (true) {
    if (ctx.cancelled) return;
    let input: ReactiveInputEvent;
    try {
      input = await rctx.waitForInput();
    } catch {
      return;
    }
    if (input.type !== 'advance') continue;

    resetState();
    await ctx.emit({ type: 'rewind' });
    if (ctx.cancelled) return;
    const finishedManual = await playOnce('manual');
    if (!finishedManual) return;
  }
}
