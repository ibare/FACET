/**
 * carry-several-lines 의 장면.
 *
 * 바탕 — 프롬프트 · 빔 폭 · 만들 토큰 수 (init 이 한 번 정한다)
 * 자취 — 지금까지 펼쳐진 가지 전부와 각 가지의 순위 · 생사, 마지막의 견줌
 * 이번 걸음 — step
 *
 * 좌표 · 문안 · DOM 은 담지 않는다. 가지의 자리는 stage 가 순위와 펼친 차례에서 셈한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export interface CarrySeveralLinesNode {
  id: string;
  /** 프롬프트 줄이면 null. */
  parent: string | null;
  token: string;
  depth: number;
  logp: number;
  score: number;
  /** 그 깊이에서 펼쳐진 차례 (0 부터). */
  order: number;
  /** 솎음에서 받은 순위 (0 부터). 아직 솎이지 않았으면 null. */
  rank: number | null;
}

export interface CarrySeveralLinesVerdict {
  greedy: string[];
  greedyScore: number;
  greedyRank: number | null;
  beam: string[];
  beamScore: number;
}

export type CarrySeveralLinesStep =
  | { kind: 'none' }
  | { kind: 'init' }
  | { kind: 'expand'; depth: number }
  | { kind: 'prune'; depth: number }
  | { kind: 'compare' };

export interface CarrySeveralLinesScene {
  prompt: string[];
  width: number;
  length: number;
  nodes: CarrySeveralLinesNode[];
  verdict: CarrySeveralLinesVerdict | null;
  step: CarrySeveralLinesStep;
}

const EMPTY: CarrySeveralLinesScene = {
  prompt: [],
  width: 0,
  length: 0,
  nodes: [],
  verdict: null,
  step: { kind: 'none' },
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const strs = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? [...(v as string[])] : null;

/** expand 의 가지 하나를 좁힌다. 모양이 어긋나면 null. */
function branchOf(v: unknown, depth: number, order: number): CarrySeveralLinesNode | null {
  if (typeof v !== 'object' || v === null) return null;
  const b = v as { id?: unknown; parent?: unknown; token?: unknown; logp?: unknown; score?: unknown };
  const id = str(b.id);
  const parent = str(b.parent);
  const token = str(b.token);
  const logp = num(b.logp);
  const score = num(b.score);
  if (id === null || parent === null || token === null || logp === null || score === null) return null;
  return { id, parent, token, depth, logp, score, order, rank: null };
}

export const carrySeveralLinesScene: ScenePlan<CarrySeveralLinesScene> = {
  initial(): CarrySeveralLinesScene {
    return { ...EMPTY, prompt: [], nodes: [] };
  },

  reduce(scene, event: FacetRuntimeEvent): CarrySeveralLinesScene {
    const raw = (typeof event.payload === 'object' && event.payload !== null ? event.payload : {}) as Record<
      string,
      unknown
    >;
    switch (event.type) {
      case 'init': {
        const prompt = strs(raw.prompt);
        const width = num(raw.width);
        const length = num(raw.length);
        if (prompt === null || width === null || length === null) return scene;
        const id = prompt.join(' ');
        return {
          prompt,
          width,
          length,
          nodes: [{ id, parent: null, token: id, depth: 0, logp: 0, score: 0, order: 0, rank: 0 }],
          verdict: null,
          step: { kind: 'init' },
        };
      }
      case 'expand': {
        const depth = num(raw.depth);
        if (depth === null || !Array.isArray(raw.children)) return scene;
        const added = raw.children
          .map((c, i) => branchOf(c, depth, i))
          .filter((n): n is CarrySeveralLinesNode => n !== null);
        return { ...scene, nodes: [...scene.nodes, ...added], step: { kind: 'expand', depth } };
      }
      case 'prune': {
        const depth = num(raw.depth);
        const ranking = strs(raw.ranking);
        if (depth === null || ranking === null) return scene;
        return {
          ...scene,
          nodes: scene.nodes.map((n) => {
            if (n.depth !== depth) return n;
            const r = ranking.indexOf(n.id);
            return { ...n, rank: r < 0 ? null : r };
          }),
          step: { kind: 'prune', depth },
        };
      }
      case 'compare': {
        const greedy = strs(raw.greedy);
        const beam = strs(raw.beam);
        const greedyScore = num(raw.greedyScore);
        const beamScore = num(raw.beamScore);
        const greedyRank = num(raw.greedyRank);
        if (greedy === null || beam === null || greedyScore === null || beamScore === null) return scene;
        return {
          ...scene,
          verdict: { greedy, greedyScore, greedyRank, beam, beamScore },
          step: { kind: 'compare' },
        };
      }
      default:
        return scene;
    }
  },
};
