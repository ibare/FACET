/**
 * 최근접 이웃 투표 — 가까운 다섯이 하나씩 불려 나와 표를 던진다.
 *
 * 이름표 없는 점 하나가 들어온다. 어느 부류인지는 가까운 이웃들에게 물어서
 * 정한다. 가까운 순으로 k 개만 불려 나와 자기 이름표 쪽에 표를 놓고, 나머지는
 * 아무 말도 하지 못한다 — 멀다는 이유 하나로.
 *
 * ── 이벤트 어휘 (facet 고유 확장, C2) ────────────────────────────────────
 *
 *   query-arrived       {}
 *       이름표 없는 점이 들어온다.
 *
 *   neighbors-ranked    { order: number[]; distances: number[] }
 *       거리를 재어 가까운 순으로 줄 세운다.
 *       order[i]     = i+1 번째로 가까운 점의 인덱스 (initialData.points 기준).
 *       distances[j] = j 번째 점에서 물음점까지의 거리.
 *       **이 조각에서 payload 를 싣는 유일한 발신이다.** 재고 줄 세우는 일이
 *       이 조각의 알고리즘 그 자체라, 내주면 장면이 그 셈을 대신하게 된다.
 *       잰 것과 줄 세운 것을 한 발신에 함께 실어 둘이 갈릴 자리를 없앤다.
 *
 *   voter-called        {}
 *       불려 나온 이웃 하나가 자기 이름표 쪽에 표를 놓는다.
 *       순위 · 이름표 · 표 수를 싣지 않는다 — **이 발신의 차례가 곧 순위**이고,
 *       누가 불렸는지는 order 가, 이름표는 선언이, 표 수는 쌓인 표가 말한다.
 *
 *   outsiders-silenced  {}
 *       부름을 받지 못한 이웃들. 표를 내지 못한다.
 *       누구인지 싣지 않는다 — 부른 만큼을 뺀 나머지가 그들이다.
 *
 *   done                {}
 *       표가 가장 많은 이름표가 새 점의 이름표가 된다.
 *       승자를 싣지 않는다 — 상자에 쌓인 표에서 나와야 그림과 한 출처가 된다.
 *
 *   rewind              {}
 *       처음으로 되감는다. 자동 재생이 끝난 뒤 '한 걸음' 을 처음 누를 때 나간다.
 *
 * silent 이벤트는 없다 — 모두 화면이 바뀌는 걸음이다.
 *
 * 거리 · 순위 · 표 수 · 승자는 전부 좌표와 이름표에서 셈한다. 선언에 들어 있는
 * 것은 구조(점 · 좌표 · 이름표 · k)뿐이고, 화면에 뜨는 수는 여기서 나온다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type VoteByNeighborsPoint = {
  x: number;
  y: number;
  /** 이름표 (부류). 두 종류 이상이면 그만큼 표 상자가 생긴다. */
  label: string;
};

export type VoteByNeighborsData = {
  type: string;
  /** 이름표 없는 물음점. */
  query: { x: number; y: number };
  /** 이름표가 붙어 있는 이웃들. */
  points: VoteByNeighborsPoint[];
  /** 몇 개를 부를 것인가. */
  k: number;
  /** 걸음 사이를 띄우는 시간 (읽을 시간을 주는 저작 결정, S-piece). */
  stepMs: number;
};

const DEFAULT_STEP_MS = 850;

/**
 * 실제로 부를 이웃의 수.
 *
 * 선언의 k 를 점의 수 안으로 자른다. 장면도 같은 함수를 지난다 — 두 군데서 각자
 * 자르면 표 상자의 칸 수와 실제로 불린 수가 갈린다.
 */
export function voteCallCount(k: unknown, pointCount: number): number {
  const raw = typeof k === 'number' && Number.isFinite(k) ? Math.floor(k) : 1;
  return Math.max(1, Math.min(raw, Math.max(1, pointCount)));
}

export const voteByNeighborsAlgorithm = async (
  base: FacetContext<VoteByNeighborsData>,
): Promise<void> => {
  const ctx = base as ReactiveContext<VoteByNeighborsData>;
  const data = ctx.data;
  const points = data.points;
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error('이웃 점이 비어 있다: facet:voteByNeighbors 의 initialData.points');
  }

  const query = data.query;
  const distances = points.map((p) => Math.hypot(p.x - query.x, p.y - query.y));
  // 가까운 순. 거리가 같으면 먼저 선언된 쪽을 앞에 둔다 (재생이 매번 같도록).
  const order = points
    .map((_, i) => i)
    .sort((a, b) => (distances[a] ?? 0) - (distances[b] ?? 0) || a - b);

  const called = order.slice(0, voteCallCount(data.k, points.length));

  const stepMs =
    typeof data.stepMs === 'number' && data.stepMs > 0 ? data.stepMs : DEFAULT_STEP_MS;

  /** 자동 재생 중이면 시간이, 손으로 짚는 중이면 '한 걸음' 이 문을 연다. */
  let auto = true;
  const pause = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    if (auto) return await ctx.sleep(stepMs);
    for (;;) {
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return false;
      // 위젯 입력이 붙어도 걸음으로 세지 않는다 (S-piece).
      if (input.type === 'advance') return true;
    }
  };

  /** 한 회차. 끝까지 갔으면 true, 도중에 취소되었으면 false. */
  const play = async (): Promise<boolean> => {
    await ctx.emit({ type: 'query-arrived' });
    if (!(await pause())) return false;

    await ctx.emit({ type: 'neighbors-ranked', payload: { order, distances } });
    if (!(await pause())) return false;

    // 누가 불렸는지는 `order` 가 말하므로 걸음은 몇 번째 부름인가만 옮긴다.
    for (let n = 0; n < called.length; n += 1) {
      await ctx.emit({ type: 'voter-called' });
      if (!(await pause())) return false;
    }

    await ctx.emit({ type: 'outsiders-silenced' });
    if (!(await pause())) return false;

    await ctx.emit({ type: 'done' });
    return true;
  };

  if (!(await play())) return;

  // 자동 재생이 끝났다. 여기서부터는 눌러서 짚는다 — 처음 누르는 '한 걸음' 은
  // 되감고 첫 걸음까지 간다 (S-piece).
  auto = false;
  for (;;) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'rewind' });
    if (!(await play())) return;
  }
};
