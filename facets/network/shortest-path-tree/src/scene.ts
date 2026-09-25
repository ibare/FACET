/**
 * shortest-path-tree 장면 — 이벤트를 상태로 잇는다.
 *
 * 바탕: 지도(라우터 · 선 · 비용). initial() 이 initialData 에서 베낀다.
 * 자취: 사본을 나눠 쥐었는가 · 선 나무들 · 두 나무를 견준 결과.
 * 이번 걸음: step.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { SptLink, SptTree } from './algorithm.js';

export type SptDiff = {
  first: string;
  second: string;
  onlyFirst: string[];
  onlySecond: string[];
  neither: string[];
};

export type SptStep =
  | { kind: 'map' }
  | { kind: 'share'; count: number }
  /** from — 앞 나무의 뿌리. 새 나무는 그 나무의 모양에서 출발해 다시 선다 */
  | { kind: 'tree'; root: string; from: string | null }
  | { kind: 'diff' };

export type ShortestPathTreeScene = {
  routers: string[];
  links: SptLink[];
  /** 나무의 높이 눈금 — 견줄 나무들에서 가장 먼 거리. init 이 정한다 (바탕) */
  reach: number;
  shared: number;
  trees: SptTree[];
  diff: SptDiff | null;
  step: SptStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) throw new Error('shortest-path-tree scene: 글자 목록이 아니다');
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error('shortest-path-tree scene: 글자가 아닌 항목');
    return x;
  });
}

function readLinks(v: unknown): SptLink[] {
  if (!Array.isArray(v)) return [];
  return v.map((l) => {
    if (!isRecord(l) || typeof l.a !== 'string' || typeof l.b !== 'string' || typeof l.cost !== 'number') {
      throw new Error('shortest-path-tree scene: 선의 꼴이 틀렸다');
    }
    return { a: l.a, b: l.b, cost: l.cost };
  });
}

function readTree(p: Record<string, unknown>): SptTree {
  const { root, dist, parent } = p;
  if (typeof root !== 'string' || !isRecord(dist) || !isRecord(parent)) {
    throw new Error('shortest-path-tree scene: tree 이벤트의 꼴이 틀렸다');
  }
  const d: Record<string, number> = {};
  for (const [k, v] of Object.entries(dist)) {
    if (typeof v !== 'number') throw new Error(`shortest-path-tree scene: ${k} 의 거리가 수가 아니다`);
    d[k] = v;
  }
  const par: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(parent)) {
    if (v !== null && typeof v !== 'string') throw new Error(`shortest-path-tree scene: ${k} 의 부모가 틀렸다`);
    par[k] = v;
  }
  return { root, dist: d, parent: par };
}

export const shortestPathTreeScene: ScenePlan<ShortestPathTreeScene> = {
  initial(initialData: unknown): ShortestPathTreeScene {
    const d = isRecord(initialData) ? initialData : {};
    const routers = Array.isArray(d.routers) ? strList(d.routers) : [];
    return {
      routers,
      links: readLinks(d.links),
      reach: 0,
      shared: 0,
      trees: [],
      diff: null,
      step: { kind: 'map' },
    };
  },

  reduce(scene, event: FacetRuntimeEvent): ShortestPathTreeScene {
    const p = isRecord(event.payload) ? event.payload : {};
    switch (event.type) {
      case 'init': {
        if (typeof p.reach !== 'number') throw new Error('shortest-path-tree scene: init 에 reach 가 없다');
        return { ...scene, reach: p.reach };
      }
      case 'share': {
        if (typeof p.count !== 'number') throw new Error('shortest-path-tree scene: share 에 count 가 없다');
        return { ...scene, shared: p.count, step: { kind: 'share', count: p.count } };
      }
      case 'tree': {
        const tree = readTree(p);
        const last = scene.trees[scene.trees.length - 1];
        return {
          ...scene,
          trees: [...scene.trees, tree],
          step: { kind: 'tree', root: tree.root, from: last ? last.root : null },
        };
      }
      case 'diff': {
        const { first, second } = p;
        if (typeof first !== 'string' || typeof second !== 'string') {
          throw new Error('shortest-path-tree scene: diff 에 뿌리가 없다');
        }
        return {
          ...scene,
          diff: {
            first,
            second,
            onlyFirst: strList(p.onlyFirst),
            onlySecond: strList(p.onlySecond),
            neither: strList(p.neither),
          },
          step: { kind: 'diff' },
        };
      }
      default:
        return scene;
    }
  },
};
