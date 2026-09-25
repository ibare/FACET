/**
 * shortest-path-tree — 같은 지도에서 뿌리를 옮기면 다른 나무가 선다.
 *
 * 모든 라우터가 같은 지도(라우터 · 선 · 비용)를 쥔다. 뿌리 하나를 정해 그 뿌리에서
 * 각 라우터까지 비용 합이 가장 작은 길을 모으면 나무가 된다. 뿌리를 다른 라우터로
 * 옮기면 같은 지도에서 다른 나무가 선다.
 *
 * 줄인 규약 (설명 글이 밝힌다)
 *   - 비용은 선마다 하나, 방향이 없다
 *   - 나무는 다익스트라로 셈한다. 확정 차례는 화면의 걸음이 아니다 — 한 걸음은 뿌리 하나의 나무 전체다
 *   - 같은 비용의 길이 둘이면 이름이 앞선 부모를 고른다 (이 지도에서는 일어나지 않는다)
 *
 * 이벤트 (걸음 0 의 지도는 장면의 initial() 이 initialData 에서 세운다)
 *   init    { reach: number }
 *           — 견줄 뿌리들의 나무에서 가장 먼 거리. 나무의 높이 눈금을 걸음 사이에 바꾸지 않으려고
 *             처음에 한 번 알린다. silent (걸음 0 을 갈아 끼운다)
 *   share   { count: number }
 *           — 모든 라우터가 같은 지도를 쥐었다. count = 사본 수(라우터 수). silent 아님
 *   tree    { root: string; dist: Record<string, number>; parent: Record<string, string | null> }
 *           — 뿌리 하나의 최단 경로 나무 전체. silent 아님
 *   diff    { first: string; second: string; onlyFirst: string[]; onlySecond: string[]; neither: string[] }
 *           — 두 나무의 선을 견준 결과. 선 이름은 'A-B' (이름 차례). silent 아님
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SptLink = { a: string; b: string; cost: number };

export type ShortestPathTreeFacetData = {
  type: 'shortest-path-tree';
  stepMs: number;
  routers: string[];
  links: SptLink[];
  roots: string[];
};

export type SptTree = {
  root: string;
  dist: Record<string, number>;
  parent: Record<string, string | null>;
};

/** 선 이름 — 양 끝을 이름 차례로 잇는다. 방향이 없으니 한 선은 한 이름이다. */
export function linkKey(x: string, y: string): string {
  return x < y ? `${x}-${y}` : `${y}-${x}`;
}

/** 지도가 셈할 수 있는 꼴인지 본다. 틀리면 던진다 (C6). */
export function checkMap(routers: readonly string[], links: readonly SptLink[]): void {
  const known = new Set(routers);
  if (known.size !== routers.length) throw new Error('shortest-path-tree: 라우터 이름이 겹친다');
  const seen = new Set<string>();
  for (const l of links) {
    if (!known.has(l.a) || !known.has(l.b)) {
      throw new Error(`shortest-path-tree: 없는 라우터를 잇는 선 ${l.a}-${l.b}`);
    }
    if (l.a === l.b) throw new Error(`shortest-path-tree: 제 자신을 잇는 선 ${l.a}`);
    if (!(Number.isFinite(l.cost) && l.cost > 0)) {
      throw new Error(`shortest-path-tree: 비용이 양수가 아니다 ${l.a}-${l.b}`);
    }
    const k = linkKey(l.a, l.b);
    if (seen.has(k)) throw new Error(`shortest-path-tree: 같은 선이 둘 ${k}`);
    seen.add(k);
  }
}

/**
 * 뿌리에서 다익스트라. 같은 거리면 이름이 앞선 라우터를 먼저 확정하고,
 * 같은 비용의 부모가 둘이면 이름이 앞선 부모를 고른다.
 */
export function shortestTree(
  routers: readonly string[],
  links: readonly SptLink[],
  root: string,
): SptTree {
  if (!routers.includes(root)) throw new Error(`shortest-path-tree: 없는 뿌리 ${root}`);
  const dist: Record<string, number> = {};
  const parent: Record<string, string | null> = {};
  const done = new Set<string>();
  dist[root] = 0;
  parent[root] = null;
  while (done.size < routers.length) {
    let pick: string | null = null;
    for (const r of [...routers].sort()) {
      if (done.has(r) || dist[r] === undefined) continue;
      if (pick === null || dist[r] < dist[pick]) pick = r;
    }
    if (pick === null) throw new Error(`shortest-path-tree: 뿌리 ${root} 에서 닿지 않는 라우터가 있다`);
    done.add(pick);
    const base = dist[pick];
    for (const l of links) {
      const other = l.a === pick ? l.b : l.b === pick ? l.a : null;
      if (other === null || done.has(other)) continue;
      const nd = base + l.cost;
      const cur = dist[other];
      const was = parent[other];
      if (cur === undefined || nd < cur || (nd === cur && was !== null && was !== undefined && pick < was)) {
        dist[other] = nd;
        parent[other] = pick;
      }
    }
  }
  return { root, dist, parent };
}

/** 나무의 선 이름들 — 부모와 자식을 잇는 선. */
export function treeLinks(tree: SptTree): string[] {
  const out: string[] = [];
  for (const [v, p] of Object.entries(tree.parent)) {
    if (p !== null) out.push(linkKey(v, p));
  }
  return out.sort();
}

export async function shortestPathTree(
  ctx: FacetContext<ShortestPathTreeFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<ShortestPathTreeFacetData>;
  const { routers, links, roots, stepMs } = ctx.data;
  checkMap(routers, links);
  if (roots.length !== 2) throw new Error('shortest-path-tree: 뿌리는 둘이어야 견줄 수 있다');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 나무는 여기서 모두 셈해 두고, 걸음마다 하나씩 내보낸다.
  const trees = roots.map((root) => shortestTree(routers, links, root));
  let reach = 0;
  for (const tree of trees) {
    for (const d of Object.values(tree.dist)) reach = Math.max(reach, d);
  }
  await ctx.emit({ type: 'init', payload: { reach }, silent: true });

  // 걸음 0 (지도) 은 이미 읽을 것이 있는 화면이라 첫 발신 앞에 틈을 둔다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'share', payload: { count: routers.length } });

  for (const tree of trees) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'tree',
      payload: { root: tree.root, dist: { ...tree.dist }, parent: { ...tree.parent } },
    });
  }

  if (!(await pause())) return;
  const [t1, t2] = trees;
  if (!t1 || !t2) throw new Error('shortest-path-tree: 나무 둘이 서지 않았다');
  const s1 = new Set(treeLinks(t1));
  const s2 = new Set(treeLinks(t2));
  const all = links.map((l) => linkKey(l.a, l.b)).sort();
  await ctx.emit({
    type: 'diff',
    payload: {
      first: t1.root,
      second: t2.root,
      onlyFirst: all.filter((k) => s1.has(k) && !s2.has(k)),
      onlySecond: all.filter((k) => s2.has(k) && !s1.has(k)),
      neither: all.filter((k) => !s1.has(k) && !s2.has(k)),
    },
  });
}
