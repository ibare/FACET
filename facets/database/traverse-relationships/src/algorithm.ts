/**
 * traverse-relationships — 그래프 DB 가 노드가 쥔 이음을 따라 건너가는 순회.
 *
 * 규약 (사양 그대로):
 *  - 나가는 이음만 따른다. 들어오는 이음은 보지 않는다.
 *  - 한 걸음 = 노드 하나를 펼친다: 그 노드가 쥔 나가는 이음 **전부**를 들여다보고(본 이음),
 *    이번 홉의 종류에 맞는 것만 건넌다(건넌 이음). 종류가 다른 이음의 끝 노드는 닿은 노드가 아니다.
 *  - 홉 단위로 간다. 홉 k 에서는 홉 k-1 이 닿은 노드를 닿은 차례로 펼친다.
 *  - 답의 차례 = 마지막 홉에서 닿은 차례. 같은 노드에 두 번 닿으면 한 번만 센다.
 *
 * 이벤트 (전부 silent 아님 — 하나가 한 걸음):
 *  - `expand`  payload {
 *        hop: number            — 1 부터
 *        node: string           — 펼친 노드
 *        type: string           — 이번 홉에서 건너는 이음 종류
 *        seen: number[]         — 들여다본 이음 (edges 안의 번호, 노드가 쥔 차례)
 *        crossed: number[]      — 그 가운데 건넌 이음
 *        reached: string[]      — 이 걸음에 처음 닿은 노드 (닿은 차례)
 *        seenTotal: number      — 본 이음 누적
 *        crossedTotal: number   — 건넌 이음 누적
 *        reachedTotal: number   — 닿은 노드 누적 (출발 노드 포함)
 *     }
 *  - `answer`  payload {
 *        nodes: string[]        — 답 (마지막 홉이 닿은 노드, 닿은 차례)
 *        untouched: string[]    — 한 번도 닿지 않은 노드 (데이터 차례)
 *     }
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (그래프 · 출발 · 길).
 * 걸음 0 이 이미 읽을 것이 있는 화면이라 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GraphNode = { id: string; kind: string };
export type GraphEdge = { from: string; type: string; to: string };

export type TraverseRelationshipsFacetData = {
  type: 'traverse-relationships';
  stepMs: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  start: string;
  path: string[];
};

/** 데이터를 확인한다. 없는 노드를 가리키는 이음 · 빈 길 · 없는 출발점은 던진다 (C6). */
export function checkGraph(data: TraverseRelationshipsFacetData): void {
  const ids = new Set<string>();
  for (const n of data.nodes) {
    if (ids.has(n.id)) throw new Error(`traverse-relationships: 노드 ${n.id} 가 두 번 있다`);
    ids.add(n.id);
  }
  data.edges.forEach((e, i) => {
    if (!ids.has(e.from)) throw new Error(`traverse-relationships: 이음 ${i} 의 앞 노드 ${e.from} 가 없다`);
    if (!ids.has(e.to)) throw new Error(`traverse-relationships: 이음 ${i} 의 뒤 노드 ${e.to} 가 없다`);
  });
  if (!ids.has(data.start)) throw new Error(`traverse-relationships: 출발 노드 ${data.start} 가 없다`);
  if (data.path.length === 0) throw new Error('traverse-relationships: 길이 비었다');
}

export async function traverseRelationships(
  context: FacetContext<TraverseRelationshipsFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<TraverseRelationshipsFacetData>;
  const data = ctx.data;
  checkGraph(data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 노드가 제 이음을 쥔다 — 나가는 이음만, 데이터 차례로
  const held = new Map<string, number[]>();
  for (const n of data.nodes) held.set(n.id, []);
  data.edges.forEach((e, i) => {
    const list = held.get(e.from);
    if (list === undefined) throw new Error(`traverse-relationships: 이음 ${i} 의 앞 노드가 없다`);
    list.push(i);
  });

  const touched: string[] = [data.start];
  let frontier: string[] = [data.start];
  let seenTotal = 0;
  let crossedTotal = 0;

  for (let h = 0; h < data.path.length; h += 1) {
    if (ctx.cancelled) return;
    const type = data.path[h]!;
    const next: string[] = [];
    for (const node of frontier) {
      if (!(await pause())) return;
      const looked = held.get(node);
      if (looked === undefined) throw new Error(`traverse-relationships: 노드 ${node} 가 없다`);
      const took = looked.filter((i) => data.edges[i]!.type === type);
      const reached: string[] = [];
      for (const i of took) {
        const to = data.edges[i]!.to;
        if (!touched.includes(to)) {
          touched.push(to);
          reached.push(to);
        }
        if (!next.includes(to)) next.push(to);
      }
      seenTotal += looked.length;
      crossedTotal += took.length;
      await ctx.emit({
        type: 'expand',
        payload: {
          hop: h + 1,
          node,
          type,
          seen: looked,
          crossed: took,
          reached,
          seenTotal,
          crossedTotal,
          reachedTotal: touched.length,
        },
      });
    }
    frontier = next;
  }

  if (!(await pause())) return;
  const untouched = data.nodes.map((n) => n.id).filter((id) => !touched.includes(id));
  await ctx.emit({ type: 'answer', payload: { nodes: frontier, untouched } });
}
