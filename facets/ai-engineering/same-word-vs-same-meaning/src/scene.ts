/**
 * same-word-vs-same-meaning 장면.
 *
 * 바탕 — 질의 낱말 · 질의 벡터 · 문서(낱말과 겹침 · 벡터). `init` 이 한 번 정한다.
 * 자취 — 두 줄 각각의 점수와 선 순서, 그리고 마지막 판정(떠오른 것 · 가라앉은 것).
 * 이번 걸음 — `step`. 줄을 다시 설 때는 앞 순서(`from`)를 실어 그림이 어디서 출발할지 안다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { DocWord, QueryWord, Side } from './algorithm.js';

export type SceneDoc = {
  id: string;
  words: DocWord[];
  overlap: number;
  vector: number[];
};

export type SideState = {
  /** 문서 순서(식별자 순)대로의 점수. 아직 안 셌으면 null */
  scores: number[] | null;
  /** 위에서부터 선 문서 번호. 아직 안 섰으면 null — 식별자 순으로 서 있다 */
  order: number[] | null;
};

export type SceneStep =
  | { kind: 'init' }
  | { kind: 'score'; side: Side }
  | { kind: 'rank'; side: Side; from: number[] }
  | { kind: 'verdict' };

export type SameWordVsSameMeaningScene = {
  query: QueryWord[];
  queryVector: number[];
  docs: SceneDoc[];
  words: SideState;
  meaning: SideState;
  verdict: { rise: number; sink: number } | null;
  step: SceneStep | null;
};

const EMPTY_SIDE: SideState = { scores: null, order: null };

function idOrder(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function asSide(v: unknown): Side | null {
  return v === 'words' || v === 'meaning' ? v : null;
}

function numbers(v: unknown): number[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === 'number') ? [...(v as number[])] : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** 배열이면 원소마다 좁히고, 좁혀지지 않는 원소는 버린다. */
function listOf<T>(v: unknown, narrow: (x: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const x of v) {
    const y = narrow(x);
    if (y !== null) out.push(y);
  }
  return out;
}

function toQueryWord(v: unknown): QueryWord | null {
  if (!isRecord(v) || typeof v.text !== 'string' || typeof v.stop !== 'boolean') return null;
  return { text: v.text, stop: v.stop };
}

function toDocWord(v: unknown): DocWord | null {
  if (!isRecord(v) || typeof v.text !== 'string' || typeof v.hit !== 'boolean') return null;
  return { text: v.text, hit: v.hit };
}

function toDoc(v: unknown): SceneDoc | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.overlap !== 'number') return null;
  const vector = numbers(v.vector);
  if (vector === null) return null;
  return { id: v.id, words: listOf(v.words, toDocWord), overlap: v.overlap, vector };
}

export const sameWordVsSameMeaningScene: ScenePlan<SameWordVsSameMeaningScene> = {
  initial() {
    return {
      query: [],
      queryVector: [],
      docs: [],
      words: EMPTY_SIDE,
      meaning: EMPTY_SIDE,
      verdict: null,
      step: null,
    };
  },

  reduce(scene, event: FacetRuntimeEvent) {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    switch (event.type) {
      case 'init': {
        return {
          query: listOf(p.query, toQueryWord),
          queryVector: numbers(p.queryVector) ?? [],
          docs: listOf(p.docs, toDoc),
          words: EMPTY_SIDE,
          meaning: EMPTY_SIDE,
          verdict: null,
          step: { kind: 'init' },
        };
      }
      case 'score': {
        const side = asSide(p.side);
        const scores = numbers(p.scores);
        if (side === null || scores === null) return scene;
        return {
          ...scene,
          [side]: { ...scene[side], scores },
          step: { kind: 'score', side },
        };
      }
      case 'rank': {
        const side = asSide(p.side);
        const order = numbers(p.order);
        if (side === null || order === null) return scene;
        const from = scene[side].order ?? idOrder(scene.docs.length);
        return {
          ...scene,
          [side]: { ...scene[side], order },
          step: { kind: 'rank', side, from: [...from] },
        };
      }
      case 'verdict': {
        const rise = p.rise;
        const sink = p.sink;
        if (typeof rise !== 'number' || typeof sink !== 'number') return scene;
        return { ...scene, verdict: { rise, sink }, step: { kind: 'verdict' } };
      }
      default:
        return scene;
    }
  },
};
