/**
 * 장면 — 실제 트리(무엇이 지금 살아 있는가)를 상태로 쥔다.
 *
 * `nodes` 는 이 걸음까지 살아 있는 실제 노드만 담는다(경로 → 상태). 지운 노드는
 * 그냥 빠진다 — stage 가 `prev.nodes`/`next.nodes` 차집합으로 무엇이 사라졌고
 * 무엇이 새로 생겼는지를 스스로 가른다.
 *
 * `capacity` 는 옛 트리·새 트리를 함께 걸어 두 트리가 다 같은 자리 수를 얻는
 * "자리 수"(경로 → 자식 수)다. `initial()` 이 한 번 셈해 그대로 물려 보낸다 — 걸음마다
 * 살아 있는 자식 수가 오르내려도(가지가 통째로 사라졌다 하나씩 다시 생기는 동안) 자리
 * 배치가 흔들리지 않게 하려는 것이다. 살아 있는 수로 배치를 다시 셈하면 footer 처럼
 * 상관없는 이웃 자리가 걸음마다 옆으로 밀린다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type TreeNodeData = { type: string; props: [string, string][]; children: TreeNodeData[] };

export type NodeState = { type: string; props: [string, string][]; gen: 'orig' | 'new' };

export type Counts = { compare: number; patch: number; create: number; remove: number };

export type Step =
  | { kind: 'compare'; path: string; oldType: string; newType: string; same: boolean }
  | { kind: 'removeBranch'; path: string; removedCount: number; removedTags: string[] }
  | { kind: 'create'; path: string; type: string }
  | null;

export type TypeChangeRebuildScene = {
  nodes: Record<string, NodeState>;
  capacity: Record<string, number>;
  n: Counts;
  step: Step;
};

function readTreeNode(raw: unknown): TreeNodeData {
  if (typeof raw !== 'object' || raw === null) throw new Error('type-change-rebuild: 트리 노드가 객체가 아니다');
  const type = (raw as { type?: unknown }).type;
  if (typeof type !== 'string') throw new Error('type-change-rebuild: 트리 노드에 type 이 없다');
  const propsRaw = (raw as { props?: unknown }).props;
  const props: [string, string][] = [];
  if (Array.isArray(propsRaw)) {
    for (const p of propsRaw) {
      if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'string' || typeof p[1] !== 'string') {
        throw new Error('type-change-rebuild: props 항목이 [이름, 값] 쌍이 아니다');
      }
      props.push([p[0], p[1]]);
    }
  }
  const childrenRaw = (raw as { children?: unknown }).children;
  const children: TreeNodeData[] = Array.isArray(childrenRaw) ? childrenRaw.map(readTreeNode) : [];
  return { type, props, children };
}

function flatten(v: TreeNodeData, path: string, out: Record<string, NodeState>): void {
  out[path] = { type: v.type, props: v.props, gen: 'orig' };
  for (let i = 0; i < v.children.length; i += 1) flatten(v.children[i]!, `${path}/${i}`, out);
}

function computeCapacity(a: TreeNodeData, b: TreeNodeData, path: string, out: Record<string, number>): void {
  const cap = Math.max(a.children.length, b.children.length);
  out[path] = cap;
  for (let i = 0; i < cap; i += 1) {
    const av = a.children[i];
    const bv = b.children[i];
    const childPath = `${path}/${i}`;
    if (av && bv) computeCapacity(av, bv, childPath, out);
    else if (av) computeCapacity(av, av, childPath, out);
    else if (bv) computeCapacity(bv, bv, childPath, out);
  }
}

export const typeChangeRebuildScene: ScenePlan<TypeChangeRebuildScene> = {
  initial(initialData) {
    if (typeof initialData !== 'object' || initialData === null) {
      throw new Error('type-change-rebuild: initialData 가 객체가 아니다');
    }
    const oldTree = readTreeNode((initialData as { oldTree?: unknown }).oldTree);
    const newTree = readTreeNode((initialData as { newTree?: unknown }).newTree);
    const nodes: Record<string, NodeState> = {};
    flatten(oldTree, '0', nodes);
    const capacity: Record<string, number> = {};
    computeCapacity(oldTree, newTree, '0', capacity);
    return { nodes, capacity, n: { compare: 0, patch: 0, create: 0, remove: 0 }, step: null };
  },

  reduce(scene, event: FacetRuntimeEvent) {
    const payload = event.payload;

    if (event.type === 'compare') {
      if (
        typeof payload !== 'object' ||
        payload === null ||
        typeof (payload as { path?: unknown }).path !== 'string' ||
        typeof (payload as { oldType?: unknown }).oldType !== 'string' ||
        typeof (payload as { newType?: unknown }).newType !== 'string' ||
        typeof (payload as { same?: unknown }).same !== 'boolean'
      ) {
        throw new Error('type-change-rebuild: compare payload 모양이 아니다');
      }
      const p = payload as { path: string; oldType: string; newType: string; same: boolean; n: Counts };
      return {
        nodes: scene.nodes,
        capacity: scene.capacity,
        n: p.n,
        step: { kind: 'compare' as const, path: p.path, oldType: p.oldType, newType: p.newType, same: p.same },
      };
    }

    if (event.type === 'removeBranch') {
      if (
        typeof payload !== 'object' ||
        payload === null ||
        typeof (payload as { path?: unknown }).path !== 'string' ||
        !Array.isArray((payload as { removed?: unknown }).removed)
      ) {
        throw new Error('type-change-rebuild: removeBranch payload 모양이 아니다');
      }
      const p = payload as { path: string; removed: { path: string; type: string }[]; n: Counts };
      const nodes = { ...scene.nodes };
      const removedTags: string[] = [];
      for (const r of p.removed) {
        removedTags.push(r.type);
        delete nodes[r.path];
      }
      return {
        nodes,
        capacity: scene.capacity,
        n: p.n,
        step: { kind: 'removeBranch' as const, path: p.path, removedCount: p.removed.length, removedTags },
      };
    }

    if (event.type === 'create') {
      if (
        typeof payload !== 'object' ||
        payload === null ||
        typeof (payload as { path?: unknown }).path !== 'string' ||
        typeof (payload as { type?: unknown }).type !== 'string'
      ) {
        throw new Error('type-change-rebuild: create payload 모양이 아니다');
      }
      const p = payload as { path: string; type: string; props?: [string, string][]; n: Counts };
      const nodes = { ...scene.nodes, [p.path]: { type: p.type, props: p.props ?? [], gen: 'new' as const } };
      return {
        nodes,
        capacity: scene.capacity,
        n: p.n,
        step: { kind: 'create' as const, path: p.path, type: p.type },
      };
    }

    return scene;
  },
};
