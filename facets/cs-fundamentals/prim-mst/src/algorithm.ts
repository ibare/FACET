/**
 * 프림 — 최소 신장 트리를 한 나무로 키워 얻는다.
 *
 * 나무는 출발점 하나에서 시작해 한 자리씩 자란다. 매 회 **나무 밖으로 나가는
 * 간선** 가운데 가장 가벼운 것을 골라 그 반대쪽 끝을 나무에 붙인다. 그림 전체에서
 * 가장 가벼운 간선을 고르는 것이 아니다 — 고를 수 있는 것은 그때그때 다르다.
 *
 * `key[v]` 는 "지금 나무에서 정점 v 로 건너가는 가장 가벼운 간선 하나의 무게" 다.
 * 다익스트라의 `dist[v]` 가 출발점에서의 **누적 거리**인 것과 여기서 갈린다
 * (`irs.ts` 머리말 참조). 우선순위 큐를 쓰지 않고 매 회 배열을 훑어 가장 작은
 * key 를 찾는 것도 그 대비를 코드에 남기기 위해서다.
 *
 * 자료 표현은 IR 과 같다 — 인접행렬 `w`, `w[u][v] > 0` 이 "간선이 있다".
 * 무게가 전부 양수라 0 이 빈칸 노릇을 한다. 훑기·붙이기·내밀기의 반복문 구조가
 * IR 과 줄 단위로 겹치므로 코드 패널의 하이라이트가 화면과 맞물린다.
 *
 * IR 쪽은 `key` · `parent` · `inTree` 를 인자로 받는다 (배열 만들기를 이름 붙인
 * 호출로 감싸면 여섯 언어 어디에도 없는 함수가 코드 패널에 뜨기 때문이다).
 * 여기서는 그 셋을 지역 변수로 잡는다 — 알고리즘의 호출부는 러너뿐이고, 러너가
 * 작업 배열을 마련해 줄 까닭이 없다. 값을 채우는 순서와 조건은 양쪽이 같다.
 *
 * ── 동점 규칙
 *
 * `key[v] < key[u]` 는 엄격 부등호이고 훑기는 0 부터 오른다. 그래서 **무게가
 * 같으면 번호가 작은 정점**이 먼저 붙는다. IR 도 같은 부등호를 쓴다. 사양의
 * 자료에서는 같은 무게가 한 회에서 맞붙지 않아 이 규칙이 답을 바꾸지 않지만,
 * 규칙이 코드와 화면에서 갈리면 화면이 거짓을 말하므로 양쪽을 같게 둔다.
 *
 * ── 식별자 (C1)
 *
 *   `node:<정점>`            정점 하나
 *   `edge:<작은쪽>-<큰쪽>`   간선 하나 (무방향이라 번호를 오름차순으로 적는다)
 *
 * ── 이벤트 어휘 (C2). 표준은 `done` 뿐이고 나머지는 이 facet 고유 확장이다.
 *
 *   'phase'       payload { phase: string }                       silent
 *                 코드 패널 하이라이트용 메타 이벤트.
 *
 *   'tree-init'   payload { start: number; keys: (number|null)[] }
 *                 target 없음. 첫 화면 — 출발점만 0, 나머지는 아직 닿지 않았다
 *                 (null 이 ∞ 를 뜻한다).
 *
 *   'round-begin' payload { round: number; treeSize: number }
 *                 target 없음. 한 회의 시작. 나무의 경계가 다시 그려진다.
 *
 *   'scan'        payload { vertex: number; key: number|null; inTree: boolean;
 *                           best: number|null; bestKey: number|null;
 *                           became: boolean }
 *                 target `node:<vertex>`. key 배열을 한 자리씩 훑는다.
 *                 `became` 는 이 자리가 새 최소 후보가 되었는지.
 *
 *   'choose'      payload { vertex: number; from: number|null; weight: number }
 *                 target `node:<vertex>`. 훑기가 끝나고 붙일 자리가 정해졌다.
 *                 `from` 이 null 이면 출발점 (붙이는 간선이 없다).
 *
 *   'attach'      payload { vertex: number; from: number|null; weight: number;
 *                           total: number; treeSize: number }
 *                 target `node:<vertex>` 또는 `edge:<a>-<b>`. 나무가 자랐다.
 *
 *   'offer'       payload { from: number; to: number; weight: number;
 *                           before: number|null; improved: boolean;
 *                           inside: boolean }
 *                 target `edge:<a>-<b>`. 새로 붙은 자리에서 나가는 간선 하나를
 *                 견준다. `inside` 는 반대쪽 끝이 이미 나무 안이라는 뜻 (고리).
 *
 *   'done'        payload { edgeCount: number; total: number }
 *                 target 없음. 표준 이벤트.
 *
 * 간선이 없는 (u, v) 짝에서는 `offer` 를 내지 않는다. IR 의 반복문은 n 번 돌지만
 * 화면에 아무 일도 일어나지 않는 걸음을 걸리게 할 까닭이 없다. phase 는 반복문
 * 진입에서 한 번 발신되므로 코드 패널의 짚는 줄은 그대로다.
 *
 * ── phase 어휘 (C3) — `irs.ts` 와 글자까지 같다
 *
 *   'setup' | 'scan' | 'attach' | 'offer' | 'done'
 *
 * ── 메트릭 (C5) — `facet.ts` 의 선언과 같다
 *
 *   'scan-count'     key 배열을 훑은 자리 수
 *   'improve-count'  더 가벼운 간선을 찾아 key 를 줄인 횟수
 *   'attach-count'   나무에 붙인 간선 수
 */

import type { FacetContext } from '@ffacet/core/runtime';

/** 무방향 간선 하나. `a` < `b` 로 적는 것을 권하나 알고리즘은 양쪽을 다 채운다. */
export type PrimEdge = { a: number; b: number; w: number };

export type PrimMstData = {
  type: 'weighted-graph';
  vertexCount: number;
  start: number;
  edges: PrimEdge[];
};

/** 아직 어떤 간선으로도 닿지 못한 자리. 화면에서는 ∞ 로 읽힌다. */
const INF = Number.POSITIVE_INFINITY;

/** `edge:<작은쪽>-<큰쪽>` — 무방향 간선의 식별자는 한 가지 표기만 갖는다. */
function edgeId(a: number, b: number): string {
  return a < b ? `edge:${a}-${b}` : `edge:${b}-${a}`;
}

/** 인접행렬로 옮긴다. `w[u][v] > 0` 이 "간선이 있다" — IR 과 같은 표현. */
function toMatrix(n: number, edges: PrimEdge[]): number[][] {
  const w: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const e of edges) {
    if (e.a < 0 || e.a >= n || e.b < 0 || e.b >= n) continue;
    w[e.a]![e.b] = e.w;
    w[e.b]![e.a] = e.w;
  }
  return w;
}

/** 화면으로 나가는 key 값 — ∞ 는 null 로 옮긴다 (JSON 이 무한대를 담지 못한다). */
function finite(x: number): number | null {
  return Number.isFinite(x) ? x : null;
}

export async function primMst(ctx: FacetContext<PrimMstData>): Promise<void> {
  const n = ctx.data.vertexCount;
  const start = ctx.data.start;
  const w = toMatrix(n, ctx.data.edges);

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  if (n <= 0) {
    await phase('done');
    await ctx.emit({ type: 'done', payload: { edgeCount: 0, total: 0 } });
    return;
  }

  // ── setup. key 는 전부 ∞, 출발점만 0.
  const key = new Array<number>(n).fill(INF);
  const parent = new Array<number>(n).fill(-1);
  const inTree = new Array<number>(n).fill(0);
  key[start] = 0;
  let total = 0;

  await phase('setup');
  await ctx.emit({
    type: 'tree-init',
    payload: { start, keys: key.map(finite) },
  });

  for (let round = 0; round < n; round += 1) {
    if (ctx.cancelled) return;

    // ── scan. 나무 밖에서 key 가 가장 작은 자리를 반복문으로 찾는다.
    await phase('scan');
    await ctx.emit({
      type: 'round-begin',
      payload: { round, treeSize: round },
    });

    let u = -1;
    for (let v = 0; v < n; v += 1) {
      if (ctx.cancelled) return;
      const became = inTree[v] === 0 && (u < 0 || key[v]! < key[u]!);
      if (became) u = v;
      ctx.metric('scan-count', 'inc');
      await ctx.emit({
        type: 'scan',
        target: `node:${v}`,
        payload: {
          vertex: v,
          key: finite(key[v]!),
          inTree: inTree[v] === 1,
          best: u < 0 ? null : u,
          bestKey: u < 0 ? null : finite(key[u]!),
          became,
        },
      });
    }
    if (u < 0) return;

    await ctx.emit({
      type: 'choose',
      target: `node:${u}`,
      payload: {
        vertex: u,
        from: parent[u]! < 0 ? null : parent[u]!,
        weight: Number.isFinite(key[u]!) ? key[u]! : 0,
      },
    });

    // ── attach. 고른 자리를 나무에 넣는다. 출발점은 key 가 0 이라 합이 늘지 않는다.
    await phase('attach');
    inTree[u] = 1;
    total += Number.isFinite(key[u]!) ? key[u]! : 0;
    const from = parent[u]! < 0 ? null : parent[u]!;
    if (from !== null) ctx.metric('attach-count', 'inc');
    await ctx.emit({
      type: 'attach',
      target: from === null ? `node:${u}` : edgeId(from, u),
      payload: {
        vertex: u,
        from,
        weight: Number.isFinite(key[u]!) ? key[u]! : 0,
        total,
        treeSize: round + 1,
      },
    });

    // ── offer. 새로 붙은 자리에서 나가는 간선이 key 를 줄일 수 있는지 본다.
    await phase('offer');
    for (let v = 0; v < n; v += 1) {
      if (ctx.cancelled) return;
      if (w[u]![v]! <= 0) continue;
      const before = finite(key[v]!);
      const improved = inTree[v] === 0 && w[u]![v]! < key[v]!;
      if (improved) {
        key[v] = w[u]![v]!;
        parent[v] = u;
        ctx.metric('improve-count', 'inc');
      }
      await ctx.emit({
        type: 'offer',
        target: edgeId(u, v),
        payload: {
          from: u,
          to: v,
          weight: w[u]![v]!,
          before,
          improved,
          inside: inTree[v] === 1,
        },
      });
    }
  }

  await phase('done');
  await ctx.emit({
    type: 'done',
    payload: { edgeCount: parent.filter((p) => p >= 0).length, total },
  });
}
