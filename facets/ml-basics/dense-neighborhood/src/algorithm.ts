/**
 * dense-neighborhood — 밀도 기반 군집. 불이 옮아붙듯 이웃의 이웃으로 번진다.
 *
 * 한 점의 eps 안에 이웃이 minPts 이상이면 그 점은 무리의 **속(core)** 이고,
 * 속인 점의 이웃은 같은 무리가 되며, 그 이웃이 또 속이면 거기서 다시 번진다.
 * 가운데를 정하지 않으므로 무리가 둥글 필요가 없다.
 *
 * ── 식별자
 *   점은 `points` 배열의 인덱스로만 가리킨다. target 은 쓰지 않는다 —
 *   한 걸음이 여러 점·여러 이음을 한꺼번에 옮기므로 payload 가 정규 경로다.
 *
 * ── 이벤트 (전부 facet 고유. silent 는 하나도 없다)
 *
 *   rewind   {}
 *     화면을 처음으로 되감는다. 자동 재생이 끝난 뒤 첫 `advance` 에서만 나간다.
 *
 *   ignite   { index: number; cluster: number; neighborCount: number }
 *     아직 어느 무리에도 들지 않은 점에 불씨를 놓는다. `neighborCount` 는
 *     그 점의 eps 안 이웃 수이며 **자기 자신을 셈에 넣는다**.
 *
 *   spread   { cluster: number;
 *              links: { from: number; to: number; dist: number }[];
 *              rejected: number | null;
 *              total: number }
 *     물결 한 겹. `links` 는 이번에 이어 붙은 모든 쌍이다 (한 점이 두 곳에서
 *     닿으면 이음이 둘 생기고 점은 한 번만 든다). `rejected` 는 이번 물결의
 *     앞자락에서 **가장 가까운데도 안 붙은** 점까지의 거리 — 없으면 null.
 *     `total` 은 이 걸음을 마친 뒤 무리에 든 점 수.
 *
 *   blocked  { from: number; to: number; dist: number }
 *     번짐이 멎었다. 무리 안의 점과 무리 밖의 점 중 가장 가까운 한 쌍과 그
 *     거리. 무리 밖에 남은 점이 없으면 나가지 않는다.
 *
 *   done     { sizes: number[] }
 *     무리마다의 크기. 무리 번호 순.
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DenseNeighborhoodPoint = { x: number; y: number };

export type DenseNeighborhoodData = {
  type: 'dense-neighborhood';
  /** 자료 좌표. 화면 좌표로 옮기는 것은 stage 의 몫이다 (S-piece). */
  points: DenseNeighborhoodPoint[];
  /** 이웃으로 치는 거리. */
  eps: number;
  /** 속(core)이 되는 최소 이웃 수. 자기 자신을 셈에 넣는다. */
  minPts: number;
  /** 걸음 간격 (ms). */
  stepMs: number;
};

type Link = { from: number; to: number; dist: number };

function distance(a: DenseNeighborhoodPoint, b: DenseNeighborhoodPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export const denseNeighborhoodAlgorithm = async (
  baseCtx: FacetContext<DenseNeighborhoodData>,
): Promise<void> => {
  const ctx = baseCtx as ReactiveContext<DenseNeighborhoodData>;
  const { points, eps, minPts, stepMs } = ctx.data;
  const n = points.length;

  // 거리표와 이웃표를 한 번만 셈해 둔다. 화면에 뜨는 수는 전부 여기서 나온다 —
  // 지어낸 값이 한 톨도 섞이지 않게 (S-piece).
  const dist: number[][] = points.map((p) => points.map((q) => distance(p, q)));
  const neighbors: number[][] = dist.map((row) =>
    row.map((_, j) => j).filter((j) => (row[j] ?? Infinity) <= eps),
  );
  const isCore: boolean[] = neighbors.map((ns) => ns.length >= minPts);

  const label = new Array<number>(n).fill(0);

  /** 되짚기 모드. 자동 재생이 끝난 뒤 `advance` 를 누르면 켜진다. */
  let manual = false;
  /** 되감기 직후의 첫 문. 한 번만 그냥 통과시킨다 (S-piece). */
  let freeGate = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  async function gate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (!manual) return ctx.sleep(stepMs);
    if (freeGate) {
      freeGate = false;
      return true;
    }
    for (;;) {
      if (ctx.cancelled) return false;
      const input = await ctx.waitForInput();
      if (input.type !== 'advance') continue;
      return !ctx.cancelled;
    }
  }

  /** 무리 밖에서 가장 가까운 점 하나. 밖이 비었으면 null. */
  function nearestOutside(
    inside: number[],
    outside: (i: number) => boolean,
  ): Link | null {
    let best: Link | null = null;
    for (const a of inside) {
      const row = dist[a] ?? [];
      for (let b = 0; b < n; b += 1) {
        if (!outside(b)) continue;
        const d = row[b] ?? Infinity;
        if (best === null || d < best.dist) best = { from: a, to: b, dist: d };
      }
    }
    return best;
  }

  /** 한 회차 전체. 끝까지 굴렀으면 true, 도중에 취소됐으면 false. */
  async function runScene(): Promise<boolean> {
    label.fill(0);
    let cluster = 0;

    for (let seed = 0; seed < n; seed += 1) {
      if (label[seed] !== 0 || !isCore[seed]) continue;
      cluster += 1;
      label[seed] = cluster;

      if (!(await gate())) return false;
      await ctx.emit({
        type: 'ignite',
        payload: { index: seed, cluster, neighborCount: neighbors[seed]?.length ?? 0 },
      });

      let frontier = [seed];
      for (;;) {
        // 문이 바디 첫 줄이 아니다 — 물결 한 겹을 **모아 봐야** 발신할 것이
        // 있는지 알기 때문이다. 모으는 일은 O(n²) 로 유계이고 발신 앞에 문이
        // 서므로 취소는 먹는다 (C8).
        // 한 점이 두 앞자락에서 닿으면 이음은 둘, 점은 하나.
        const links: Link[] = [];
        const joined: number[] = [];
        const joining = new Set<number>();
        for (const f of frontier) {
          if (!isCore[f]) continue;
          for (const j of neighbors[f] ?? []) {
            if (label[j] !== 0) continue;
            links.push({ from: f, to: j, dist: dist[f]?.[j] ?? 0 });
            if (!joining.has(j)) {
              joining.add(j);
              joined.push(j);
            }
          }
        }
        if (links.length === 0) break;

        // 이번 앞자락이 닿지 못한 것 중 가장 가까운 것. eps 밖이라 안 붙는다.
        const missed = nearestOutside(frontier, (b) => label[b] === 0 && !joining.has(b));

        for (const j of joined) label[j] = cluster;
        const total = label.filter((v) => v === cluster).length;

        if (!(await gate())) return false;
        await ctx.emit({
          type: 'spread',
          payload: { cluster, links, rejected: missed === null ? null : missed.dist, total },
        });
        frontier = joined;
      }

      const members: number[] = [];
      for (let i = 0; i < n; i += 1) if (label[i] === cluster) members.push(i);
      const gap = nearestOutside(members, (b) => label[b] === 0);
      if (gap !== null) {
        if (!(await gate())) return false;
        await ctx.emit({ type: 'blocked', payload: gap });
      }
    }

    const sizes: number[] = [];
    for (let c = 1; c <= cluster; c += 1) sizes.push(label.filter((v) => v === c).length);

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done', payload: { sizes } });
    return true;
  }

  try {
    for (;;) {
      if (!(await runScene())) return;
      if (ctx.cancelled) return;
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return;
      if (input.type !== 'advance') continue;
      // 자동 재생이 끝난 뒤의 첫 누름은 되감고 **첫 걸음까지** 간다 (S-piece).
      manual = true;
      freeGate = true;
      await ctx.emit({ type: 'rewind' });
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 console.error 로 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
