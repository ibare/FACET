/**
 * side-by-side-trees 의 장면.
 *
 * 바탕(base) — oldTree · newTree · totalPairs. init 이 한 번 정하고 다시 바뀌지 않는다.
 * 자취(trace) — realTree(누적 반영) · compared · patched. 걸음이 쌓는다.
 * 이번 걸음(step) — current. 이번 견줌 한 쌍(자리 · 종류 · 고침 목록), 없으면 null.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { SideBySideTreesFacetData, TreeNode } from './algorithm.js';

export type PropChange = { prop: string; from: string; to: string };

export type CompareMark = {
  path: string;
  nodeType: string;
  changes: PropChange[];
};

export type SideBySideTreesScene = {
  oldTree: TreeNode;
  newTree: TreeNode;
  totalPairs: number;
  realTree: TreeNode;
  compared: number;
  patched: number;
  current: CompareMark | null;
};

function cloneTree(node: TreeNode): TreeNode {
  return {
    type: node.type,
    props: node.props.map(([k, v]) => [k, v] as [string, string]),
    children: node.children.map(cloneTree),
  };
}

function countNodes(node: TreeNode): number {
  return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0);
}

/** path("0/0/1") 를 자식 색인 열(첫 자리 다음부터)로 판다. */
function pathIndices(path: string): number[] {
  const parts = path.split('/');
  return parts.slice(1).map((s) => {
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0) throw new Error(`side-by-side-trees: 자리 '${path}' 를 읽을 수 없다`);
    return n;
  });
}

function applyChangesAt(node: TreeNode, indices: number[], changes: PropChange[]): TreeNode {
  if (indices.length === 0) {
    if (changes.length === 0) return node;
    const byName = new Map(changes.map((c) => [c.prop, c.to]));
    return {
      type: node.type,
      props: node.props.map(([k, v]) => [k, byName.has(k) ? byName.get(k)! : v] as [string, string]),
      children: node.children,
    };
  }
  const [head, ...rest] = indices;
  if (head === undefined || head >= node.children.length) {
    throw new Error(`side-by-side-trees: 자리를 실제 트리에서 찾을 수 없다`);
  }
  return {
    type: node.type,
    props: node.props,
    children: node.children.map((c, i) => (i === head ? applyChangesAt(c, rest, changes) : c)),
  };
}

function isPropChange(v: unknown): v is PropChange {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.prop === 'string' && typeof r.from === 'string' && typeof r.to === 'string';
}

function readComparePayload(payload: unknown): CompareMark {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error("side-by-side-trees: 'compare' payload 가 객체가 아니다");
  }
  const r = payload as Record<string, unknown>;
  if (typeof r.path !== 'string' || typeof r.nodeType !== 'string' || !Array.isArray(r.changes)) {
    throw new Error("side-by-side-trees: 'compare' payload 모양을 모른다");
  }
  const changes = r.changes;
  if (!changes.every(isPropChange)) {
    throw new Error("side-by-side-trees: 'compare' payload 의 changes 모양을 모른다");
  }
  return { path: r.path, nodeType: r.nodeType, changes };
}

export const sideBySideTreesScene: ScenePlan<SideBySideTreesScene> = {
  initial(initialData: unknown): SideBySideTreesScene {
    const data = initialData as SideBySideTreesFacetData;
    const oldTree = cloneTree(data.oldTree);
    const newTree = cloneTree(data.newTree);
    return {
      oldTree,
      newTree,
      totalPairs: countNodes(oldTree),
      realTree: cloneTree(data.oldTree),
      compared: 0,
      patched: 0,
      current: null,
    };
  },

  reduce(scene: SideBySideTreesScene, event: FacetRuntimeEvent): SideBySideTreesScene {
    if (event.type !== 'compare') return scene;
    const mark = readComparePayload(event.payload);
    const indices = pathIndices(mark.path);
    const realTree = applyChangesAt(scene.realTree, indices, mark.changes);
    return {
      ...scene,
      realTree,
      compared: scene.compared + 1,
      patched: scene.patched + mark.changes.length,
      current: mark,
    };
  },
};
