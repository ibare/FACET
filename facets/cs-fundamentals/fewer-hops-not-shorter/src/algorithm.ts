/**
 * fewer-hops-not-shorter — 가중 그래프에서 "간선을 적게 거치는 길이 짧은 길은
 * 아니다" 를 한 번 보이고 멈추는 조각(piece).
 *
 * 논증 순서는 전제 → 결론이다. 먼저 두 길을 **간선 수로만** 견주어 짧은 쪽을
 * 정하고, 그 다음 간선마다 무게를 하나씩 재어 순위가 뒤집히는 것을 보인다.
 *
 * ## 데이터 (`FewerHopsNotShorterData`)
 * 구조만 선언한다 — 정점 목록 · 무방향 간선(무게) · 출발 · 도착. 길이 몇 개인지,
 * 각 길이 간선을 몇 개 밟는지, 무게 합이 얼마인지는 전부 이 파일이 구조에서 셈한다
 * (`enumerateRoutes`). 선언에 파생값을 적지 않는다.
 *
 * ## 식별자
 * - 간선 target — `edge:<from>-<to>` (선언된 방향 그대로. 무방향이므로 어느 쪽에서
 *   밟든 같은 id 다)
 * - 길 id — `r0` · `r1` … 정렬(간선 수 오름차순) 뒤 매기는 불투명 식별자. 그래프
 *   요소가 아니라 이 조각이 나란히 눕히는 차선의 번호이므로 target prefix 를
 *   쓰지 않는다.
 *
 * ## 이벤트 (전부 확장 어휘, silent 아님 — 걸음마다 화면이 바뀐다)
 *
 * | type            | target        | payload |
 * |-----------------|---------------|---------|
 * | `routes-found`  | —             | `{ source: string; target: string; routes: { id, nodes: string[], edgeIds: string[], hops: number }[]; maxHops: number; maxTotalWeight: number }` |
 * | `hops-counted`  | —             | `{ routeId: string; hops: number }` |
 * | `hops-verdict`  | —             | `{ routeId: string; hops: number; rivalId?: string; rivalHops?: number }` |
 * | `edge-weighed`  | `edge:<a>-<b>`| `{ routeId: string; weight: number; total: number }` |
 * | `weight-verdict`| —             | `{ routeId: string; total: number; rivalId?: string; rivalTotal?: number }` |
 * | `rewind`        | —             | 없음 — 처음 상태로 되감는다 |
 *
 * `maxHops` / `maxTotalWeight` 는 화면에 뜨지 않는다. 무대가 축척(픽셀/간선,
 * 픽셀/무게)을 처음에 한 번 정하고 재생 도중 바꾸지 않기 위한 값이다.
 *
 * ## 진행
 * `mechanismKind: 'reactive'`. mount 시 스스로 자동 재생하고, 끝난 뒤에는
 * `advance` 를 받아 처음부터 한 걸음씩 다시 짚는다. 자동 재생 뒤 처음 누르는
 * `advance` 는 되감고(`rewind`) 첫 걸음까지 보인다 (S-piece).
 *
 * 메트릭은 없다 — 조각은 셀 것이 없다.
 */

import type { FacetContext, FacetRuntimeEvent, ReactiveContext } from '@ffacet/core/runtime';

export type FewerHopsNotShorterData = {
  type: string;
  /** 정점 이름. 화면 라벨이 곧 이 값이다. */
  nodes: string[];
  /** 무방향 간선. `from`/`to` 는 선언 순서일 뿐 방향을 뜻하지 않는다. */
  edges: { from: string; to: string; weight: number }[];
  source: string;
  target: string;
  /** 걸음 사이의 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** 한 길이 밟는 간선 하나. `from`/`to` 는 밟은 방향이다. */
type RouteEdge = { id: string; from: string; to: string; weight: number };

type Route = {
  id: string;
  /** 출발부터 도착까지의 정점 이름 (출발 포함). */
  nodes: string[];
  edges: RouteEdge[];
  hops: number;
  total: number;
};

/** 다음 걸음으로 넘어가는 문. 자동 재생은 `ctx.sleep`, 한 걸음씩은 `waitForInput`. */
type Gate = () => Promise<boolean>;

function edgeTarget(from: string, to: string): string {
  return `edge:${from}-${to}`;
}

function pushAdjacency(map: Map<string, RouteEdge[]>, at: string, edge: RouteEdge): void {
  const list = map.get(at);
  if (list) list.push(edge);
  else map.set(at, [edge]);
}

/**
 * 출발에서 도착까지의 단순 경로를 전부 찾는다. 몇 개인지도 이 셈의 결과다.
 * 간선 수 오름차순 (같으면 무게 합 오름차순) 으로 정렬해 "적게 거치는 쪽" 이
 * 언제나 앞에 오게 한다.
 */
function enumerateRoutes(data: FewerHopsNotShorterData): Route[] {
  const adjacency = new Map<string, RouteEdge[]>();
  for (const e of data.edges) {
    const id = edgeTarget(e.from, e.to);
    pushAdjacency(adjacency, e.from, { id, from: e.from, to: e.to, weight: e.weight });
    pushAdjacency(adjacency, e.to, { id, from: e.to, to: e.from, weight: e.weight });
  }

  const found: Route[] = [];
  const trail: RouteEdge[] = [];
  const walked = new Set<string>([data.source]);

  const walk = (at: string): void => {
    if (at === data.target) {
      const edges = [...trail];
      found.push({
        id: '',
        nodes: [data.source, ...edges.map((e) => e.to)],
        edges,
        hops: edges.length,
        total: edges.reduce((sum, e) => sum + e.weight, 0),
      });
      return;
    }
    for (const next of adjacency.get(at) ?? []) {
      if (walked.has(next.to)) continue;
      walked.add(next.to);
      trail.push(next);
      walk(next.to);
      trail.pop();
      walked.delete(next.to);
    }
  };
  walk(data.source);

  found.sort((a, b) => a.hops - b.hops || a.total - b.total);
  return found.map((r, i) => ({ ...r, id: `r${i}` }));
}

/** 한 걸음 — 화면을 바꾸고, 다음 걸음까지의 문 앞에 선다. */
async function step(
  ctx: ReactiveContext<FewerHopsNotShorterData>,
  event: FacetRuntimeEvent,
  gate: Gate,
): Promise<boolean> {
  await ctx.emit(event);
  if (ctx.cancelled) return false;
  return gate();
}

/**
 * 논증 한 바퀴. 자동 재생이든 한 걸음씩이든 같은 순서를 밟으며, 다른 것은
 * 걸음 사이의 문뿐이다.
 */
async function argue(
  ctx: ReactiveContext<FewerHopsNotShorterData>,
  routes: Route[],
  gate: Gate,
): Promise<void> {
  const lead = routes[0];
  if (!lead) return;
  const rival = routes[1];

  // 전제 — 두 길을 간선 수 축척으로 눕힌다.
  const opened = await step(
    ctx,
    {
      type: 'routes-found',
      payload: {
        source: ctx.data.source,
        target: ctx.data.target,
        routes: routes.map((r) => ({
          id: r.id,
          nodes: r.nodes,
          edgeIds: r.edges.map((e) => e.id),
          hops: r.hops,
        })),
        maxHops: Math.max(...routes.map((r) => r.hops)),
        maxTotalWeight: Math.max(...routes.map((r) => r.total)),
      },
    },
    gate,
  );
  if (!opened) return;

  // 간선 수를 센다.
  for (const r of routes) {
    const ok = await step(
      ctx,
      { type: 'hops-counted', payload: { routeId: r.id, hops: r.hops } },
      gate,
    );
    if (!ok) return;
  }

  // 전제의 결론 — 적게 거치는 쪽이 짧아 보인다.
  const claimed = await step(
    ctx,
    {
      type: 'hops-verdict',
      payload: { routeId: lead.id, hops: lead.hops, rivalId: rival?.id, rivalHops: rival?.hops },
    },
    gate,
  );
  if (!claimed) return;

  // 무게를 하나씩 잰다. 짧아 보이던 쪽부터 재야 그 길이 부풀어 오르는 것이 먼저 보인다.
  for (const r of routes) {
    let total = 0;
    for (const e of r.edges) {
      total += e.weight;
      const ok = await step(
        ctx,
        { type: 'edge-weighed', target: e.id, payload: { routeId: r.id, weight: e.weight, total } },
        gate,
      );
      if (!ok) return;
    }
  }

  // 결론 — 무게로 재면 순위가 뒤집힌다. 마지막 걸음이므로 문을 두지 않는다.
  const byWeight = [...routes].sort((a, b) => a.total - b.total);
  const best = byWeight[0];
  const worse = byWeight[1];
  if (!best) return;
  await ctx.emit({
    type: 'weight-verdict',
    payload: { routeId: best.id, total: best.total, rivalId: worse?.id, rivalTotal: worse?.total },
  });
}

export const fewerHopsNotShorterAlgorithm = async (
  base: FacetContext<FewerHopsNotShorterData>,
): Promise<void> => {
  const ctx = base as ReactiveContext<FewerHopsNotShorterData>;
  const routes = enumerateRoutes(ctx.data);
  if (routes.length === 0) return;

  // 자동 재생 — 아무것도 누르지 않아도 화면은 할 말을 마친다.
  await argue(ctx, routes, () => ctx.sleep(ctx.data.stepMs));
  if (ctx.cancelled) return;

  // 자동 재생 도중 눌린 것은 흘려보낸다. 남겨 두면 끝나자마자 되감긴다.
  while (ctx.pollInput() !== null) {
    /* 버린다 */
  }

  // 곱씹으며 읽고 싶은 사람을 위해, 처음부터 한 걸음씩 다시 짚는다.
  const oneStep: Gate = async () => {
    try {
      await ctx.waitForInput();
    } catch {
      // 기다리는 중에 러너가 접었다는 뜻이다 — 대기 중인 promise 가 그때 거절된다.
      // 오류가 아니라 종료 신호라 삼키고 걸음을 멈춘다.
      return false;
    }
    return !ctx.cancelled;
  };

  for (;;) {
    try {
      await ctx.waitForInput();
    } catch {
      // 위와 같다 — 접히는 중에 깨어난 것이므로 조용히 물러난다.
      return;
    }
    if (ctx.cancelled) return;
    // 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다 — 첫 걸음까지 보인다.
    await ctx.emit({ type: 'rewind' });
    if (ctx.cancelled) return;
    await argue(ctx, routes, oneStep);
    if (ctx.cancelled) return;
  }
};
