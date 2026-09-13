/**
 * BstDegenerate 장면 설계 — 이벤트를 화면 명령이 아니라 상태로 옮긴다.
 *
 * 이 조각에서 뒤집기의 값이 특히 잘 드러난다. 본래 projector 는 **자기 안에 상태를
 * 쥐고 있었다** — 어느 논증 단계까지 왔는지 (`growingShown` · `searchingShown`) 와
 * 두 나무의 셈 (`results`). 그것들은 되짚어도 되돌아가지 않아, 되감은 화면에 지난
 * 걸음의 캡션과 결과가 남았다.
 *
 * 여기서는 그 상태가 전부 장면 안에 있다. 되짚기는 그저 옛 장면을 다시 그리는 일이라
 * 되돌릴 것이 없다.
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

export type TreeId = 'a' | 'b';
export type Side = 'left' | 'right';

/** 심어진 마디 하나. 자리는 값과 깊이가 정하므로 좌표는 담지 않는다. */
export type PlantedNode = {
  tree: TreeId;
  id: string;
  value: number;
  parentId: string | null;
  side: Side | null;
  depth: number;
};

/** 이 걸음에 짚은 마디. 반짝이고 지나간다 — 머무는 상태가 아니다. */
export type Pulse = {
  tree: TreeId;
  nodeId: string;
  /** `match` 는 찾던 것을 만난 자리라 다른 색으로 짚는다. */
  kind: 'compare' | 'search' | 'match';
};

/** 두 나무의 셈. 각각 다 찾은 뒤에 들어온다. */
export type TreeResult = { height: number; comparisons: number };

/**
 * 논증이 어디까지 왔나. 캡션이 이것으로 정해진다.
 *
 * 걸음마다 캡션을 바꾸지 않고 **단계가 바뀔 때만** 바꾼다 — 같은 말을 마디 수만큼
 * 되풀이하면 읽는 이가 글을 놓친다.
 */
export type Narrative = 'problem' | 'growing' | 'searching' | 'result';

export type BstScene = {
  nodes: PlantedNode[];
  pulse: Pulse | null;
  results: { a: TreeResult | null; b: TreeResult | null };
  concluded: boolean;
  narrative: Narrative;
  /** 찾는 값. `searching` 단계의 캡션이 쓴다. */
  searchTarget: number;
};

const EMPTY: BstScene = {
  nodes: [],
  pulse: null,
  results: { a: null, b: null },
  concluded: false,
  narrative: 'problem',
  searchTarget: 0,
};

function asTree(v: unknown): TreeId | null {
  return v === 'a' || v === 'b' ? v : null;
}
function asSide(v: unknown): Side | null {
  return v === 'left' || v === 'right' ? v : null;
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export const bstDegenerateScene: ScenePlan<BstScene> = {
  initial(): BstScene {
    return EMPTY;
  },

  reduce(scene: BstScene, event: FacetRuntimeEvent): BstScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    switch (event.type) {
      case 'tree-insert': {
        const tree = asTree(p.tree);
        if (tree === null || typeof p.id !== 'string') return scene;
        return {
          ...scene,
          pulse: null,
          nodes: [
            ...scene.nodes,
            {
              tree,
              id: p.id,
              value: num(p.value),
              parentId: typeof p.parentId === 'string' ? p.parentId : null,
              side: asSide(p.side),
              depth: num(p.depth),
            },
          ],
        };
      }

      case 'tree-compare': {
        const tree = asTree(p.tree);
        if (tree === null || typeof p.nodeId !== 'string') return scene;
        return {
          ...scene,
          narrative: 'growing',
          pulse: { tree, nodeId: p.nodeId, kind: 'compare' },
        };
      }

      case 'tree-search-compare': {
        const tree = asTree(p.tree);
        if (tree === null || typeof p.nodeId !== 'string') return scene;
        return {
          ...scene,
          narrative: 'searching',
          searchTarget: p.target !== undefined ? num(p.target) : scene.searchTarget,
          pulse: { tree, nodeId: p.nodeId, kind: p.direction === 'match' ? 'match' : 'search' },
        };
      }

      case 'tree-search-done': {
        const tree = asTree(p.tree);
        if (tree === null) return scene;
        return {
          ...scene,
          pulse: null,
          results: {
            ...scene.results,
            [tree]: { height: num(p.height), comparisons: num(p.comparisons) },
          },
        };
      }

      case 'tree-conclusion':
        return { ...scene, pulse: null, concluded: true, narrative: 'result' };

      case 'rewind':
        return EMPTY;

      default:
        // 표준 이벤트를 쓰지 않으므로 그 외 타입은 조용히 무시한다 (C2).
        return scene;
    }
  },
};
