/**
 * gc-reachable-from-root — 표시-훑음 수거의 한 판.
 *
 * 프로그램을 멈춘 한 순간의 모습(뿌리 · 힙에 놓인 객체 · 가리킴)을 받아 두 단계를 돈다.
 *   1. 표시 — 뿌리를 적힌 차례로, 객체에서는 가리킴을 적힌 차례로 깊이 우선으로 따라가며
 *      표시 안 된 객체에 표시를 붙인다. 이미 표시된 객체를 다시 만나면 들어가지 않는다.
 *   2. 훑음 — 힙을 놓인 차례로 하나씩 본다. 가리킴은 보지 않고 표시만 본다.
 *      표시가 있으면 남기고 표시를 지우고, 없으면 그 자리에서 거둔다.
 *
 * 걸음: #0 시작(init) · 표시 하나마다 한 걸음(mark) · 훑는 객체 하나마다 한 걸음(sweep).
 * 두 단계 사이에 걸음을 따로 두지 않는다. 걸음마다 앞에 stepMs 만큼 머문다.
 *
 * 이벤트 (전부 silent 아님):
 *   init   { roots: {name, to}[], heap: string[], edges: {from, to}[] }
 *          — 바탕. 뿌리 · 놓인 차례 · 가리킴을 베껴 보낸다
 *   mark   { name: string, via: string, viaRoot: boolean, again: {from, to}[] }
 *          — name 에 표시가 붙었다. via 는 들어온 뿌리 이름 또는 객체 이름.
 *            again 은 이 표시 뒤 다음 표시 전까지 이미 표시된 객체를 다시 만난 가리킴들
 *   sweep  { name: string, kept: boolean }
 *          — 훑는 손이 name 에 닿았다. kept 는 표시가 있었는가
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GcRoot = { name: string; to: string };
export type GcEdge = { from: string; to: string };

export type GcReachableFromRootFacetData = {
  type: 'gc-reachable-from-root';
  stepMs: number;
  /** 뿌리(스택의 이름)와 그것이 가리키는 객체. 이 차례로 표시를 시작한다 */
  roots: GcRoot[];
  /** 힙에 놓인 차례 — 훑는 차례 */
  heap: string[];
  /** 가리킴. 한 객체에서 나가는 것은 이 차례로 따라간다 */
  edges: GcEdge[];
};

type MarkEntry = { name: string; via: string; viaRoot: boolean; again: GcEdge[] };

function isStr(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function readPair(v: unknown, a: 'name' | 'from', b: 'to'): { a: string; b: string } | null {
  if (typeof v !== 'object' || v === null) return null;
  const rec = v as Record<string, unknown>;
  const x = rec[a];
  const y = rec[b];
  return isStr(x) && isStr(y) ? { a: x, b: y } : null;
}

/** initialData 를 좁힌다. 모양이 어긋나면 null — 없는 객체를 가리키는 것도 어긋남이다 */
function narrow(data: unknown): GcReachableFromRootFacetData | null {
  if (typeof data !== 'object' || data === null) return null;
  const rec = data as Record<string, unknown>;
  const { roots, heap, edges, stepMs } = rec;
  if (!Array.isArray(roots) || !Array.isArray(heap) || !Array.isArray(edges)) return null;
  if (!heap.every(isStr)) return null;
  const names = new Set<string>(heap);
  if (names.size !== heap.length) return null;
  const outRoots: GcRoot[] = [];
  for (const r of roots) {
    const p = readPair(r, 'name', 'to');
    if (!p || !names.has(p.b)) return null;
    outRoots.push({ name: p.a, to: p.b });
  }
  const outEdges: GcEdge[] = [];
  for (const e of edges) {
    const p = readPair(e, 'from', 'to');
    if (!p || !names.has(p.a) || !names.has(p.b)) return null;
    outEdges.push({ from: p.a, to: p.b });
  }
  return {
    type: 'gc-reachable-from-root',
    stepMs: typeof stepMs === 'number' && stepMs >= 0 ? stepMs : 1200,
    roots: outRoots,
    heap: [...heap],
    edges: outEdges,
  };
}

/** 깊이 우선 표시 — 표시가 붙는 차례와, 그 사이 이미 표시된 것을 다시 만난 가리킴 */
function markOrder(g: GcReachableFromRootFacetData): MarkEntry[] {
  const marked = new Set<string>();
  const order: MarkEntry[] = [];
  const visit = (name: string, via: string, viaRoot: boolean): void => {
    if (marked.has(name)) {
      const last = order[order.length - 1];
      if (last) last.again.push({ from: via, to: name });
      return;
    }
    marked.add(name);
    order.push({ name, via, viaRoot, again: [] });
    for (const e of g.edges) {
      if (e.from === name) visit(e.to, name, false);
    }
  };
  for (const r of g.roots) visit(r.to, r.name, true);
  return order;
}

export async function gcReachableFromRoot(
  baseCtx: FacetContext<GcReachableFromRootFacetData>,
): Promise<void> {
  const ctx = baseCtx as ReactiveContext<GcReachableFromRootFacetData>;
  const g = narrow(ctx.data);
  if (!g) return;
  const stepMs = g.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 — 한 순간의 모습 전체. 곧바로 세우고, 다음 걸음 앞에서 읽을 틈을 준다
  await ctx.emit({
    type: 'init',
    payload: {
      roots: g.roots.map((r) => ({ ...r })),
      heap: [...g.heap],
      edges: g.edges.map((e) => ({ ...e })),
    },
  });

  const order = markOrder(g);
  const marked = new Set<string>();
  for (const m of order) {
    if (!(await pause())) return;
    marked.add(m.name);
    await ctx.emit({
      type: 'mark',
      payload: { name: m.name, via: m.via, viaRoot: m.viaRoot, again: m.again.map((e) => ({ ...e })) },
    });
  }

  for (const name of g.heap) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'sweep', payload: { name, kept: marked.has(name) } });
  }
}
