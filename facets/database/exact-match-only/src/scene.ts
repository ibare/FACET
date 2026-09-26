/**
 * exact-match-only 의 장면.
 *
 * 바탕 — 표 · 열 · 항목 · 질의 글자(initialData 에서 베낀다) 와 버킷 · 질의 모양(silent `init` 이 채운다).
 * 자취 — 지금 질의가 연 버킷 · 견준 열쇠 · 맞은 항목, 질의마다의 누적 셈.
 * 이번 걸음 — `step`.
 *
 * 해시 · 견줌은 알고리즘이 한다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type ExactMatchSceneEntry = { key: number; row: string };
export type ExactMatchSceneBucket = { bucket: number; entries: ExactMatchSceneEntry[] };
export type ExactMatchScenePredicate =
  | { kind: 'eq'; key: number }
  | { kind: 'range'; lo: number; hi: number };
export type ExactMatchTally = { pages: number; compared: number; matched: number };

export type ExactMatchStep =
  | { kind: 'hash'; key: number; modulus: number; bucket: number }
  | { kind: 'read'; bucket: number; compared: number[]; matched: number[] }
  | { kind: 'show'; query: number }
  | { kind: 'done' };

export type ExactMatchScene = {
  base: {
    table: string;
    column: string;
    entries: ExactMatchSceneEntry[];
    sql: string[];
    modulus: number | null;
    buckets: ExactMatchSceneBucket[] | null;
    predicates: ExactMatchScenePredicate[] | null;
  };
  /** 화면에 오른 질의 수. */
  shown: number;
  /** 지금 질의의 번호 (0 부터). */
  current: number;
  /** 질의마다의 누적. 아직 읽은 페이지가 없으면 null. */
  tallies: (ExactMatchTally | null)[];
  /** `=` 질의가 해시로 고른 버킷. */
  hashed: { key: number; bucket: number } | null;
  /** 지금 질의가 연 버킷, 연 차례. */
  opened: number[];
  /** 지금 질의가 견준 열쇠. */
  compared: number[];
  /** 지금 질의에서 맞은 항목. */
  matched: ExactMatchSceneEntry[];
  /** 지금 질의에서 맞은 것이 나온 버킷. */
  matchedBuckets: number[];
  done: boolean;
  step: ExactMatchStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function readEntry(v: unknown): ExactMatchSceneEntry | null {
  if (!isRecord(v)) return null;
  const { key, row } = v;
  if (!isInt(key) || typeof row !== 'string') return null;
  return { key, row };
}

function readEntries(v: unknown): ExactMatchSceneEntry[] | null {
  if (!Array.isArray(v)) return null;
  const out: ExactMatchSceneEntry[] = [];
  for (const item of v) {
    const e = readEntry(item);
    if (e === null) return null;
    out.push(e);
  }
  return out;
}

function readKeys(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const item of v) {
    if (!isInt(item)) return null;
    out.push(item);
  }
  return out;
}

function readPredicate(v: unknown): ExactMatchScenePredicate | null {
  if (!isRecord(v)) return null;
  if (v.kind === 'eq' && isInt(v.key)) return { kind: 'eq', key: v.key };
  if (v.kind === 'range' && isInt(v.lo) && isInt(v.hi)) return { kind: 'range', lo: v.lo, hi: v.hi };
  return null;
}

function emptyScene(): ExactMatchScene {
  return {
    base: {
      table: '',
      column: '',
      entries: [],
      sql: [],
      modulus: null,
      buckets: null,
      predicates: null,
    },
    shown: 0,
    current: 0,
    tallies: [],
    hashed: null,
    opened: [],
    compared: [],
    matched: [],
    matchedBuckets: [],
    done: false,
    step: null,
  };
}

function initial(initialData: unknown): ExactMatchScene {
  const scene = emptyScene();
  if (!isRecord(initialData)) return scene;
  const entries = readEntries(initialData.entries) ?? [];
  const sql = Array.isArray(initialData.queries)
    ? initialData.queries.filter((q): q is string => typeof q === 'string')
    : [];
  return {
    ...scene,
    base: {
      ...scene.base,
      table: typeof initialData.table === 'string' ? initialData.table : '',
      column: typeof initialData.column === 'string' ? initialData.column : '',
      entries,
      sql,
    },
    shown: sql.length > 0 ? 1 : 0,
    tallies: sql.map(() => null),
  };
}

function reduce(scene: ExactMatchScene, event: FacetRuntimeEvent): ExactMatchScene {
  const p = isRecord(event.payload) ? event.payload : {};
  switch (event.type) {
    case 'init': {
      if (!isInt(p.modulus) || !Array.isArray(p.buckets) || !Array.isArray(p.queries)) return scene;
      const buckets: ExactMatchSceneBucket[] = [];
      for (const b of p.buckets) {
        if (!isRecord(b) || !isInt(b.bucket)) return scene;
        const entries = readEntries(b.entries);
        if (entries === null) return scene;
        buckets.push({ bucket: b.bucket, entries });
      }
      const predicates: ExactMatchScenePredicate[] = [];
      for (const q of p.queries) {
        const pred = readPredicate(q);
        if (pred === null) return scene;
        predicates.push(pred);
      }
      return {
        ...scene,
        base: { ...scene.base, modulus: p.modulus, buckets, predicates },
        step: null,
      };
    }
    case 'show-query': {
      if (!isInt(p.query)) return scene;
      return {
        ...scene,
        shown: Math.max(scene.shown, p.query + 1),
        current: p.query,
        hashed: null,
        opened: [],
        compared: [],
        matched: [],
        matchedBuckets: [],
        step: { kind: 'show', query: p.query },
      };
    }
    case 'hash': {
      if (!isInt(p.query) || !isInt(p.key) || !isInt(p.modulus) || !isInt(p.bucket)) return scene;
      return {
        ...scene,
        current: p.query,
        hashed: { key: p.key, bucket: p.bucket },
        step: { kind: 'hash', key: p.key, modulus: p.modulus, bucket: p.bucket },
      };
    }
    case 'read-bucket': {
      const compared = readKeys(p.compared);
      const matched = readEntries(p.matched);
      if (
        !isInt(p.query) || !isInt(p.bucket) || compared === null || matched === null ||
        !isInt(p.pages) || !isInt(p.comparedTotal) || !isInt(p.matchedTotal)
      ) {
        return scene;
      }
      const tallies = scene.tallies.slice();
      tallies[p.query] = { pages: p.pages, compared: p.comparedTotal, matched: p.matchedTotal };
      return {
        ...scene,
        current: p.query,
        tallies,
        opened: [...scene.opened, p.bucket],
        compared: [...scene.compared, ...compared],
        matched: [...scene.matched, ...matched],
        matchedBuckets: matched.length > 0 ? [...scene.matchedBuckets, p.bucket] : scene.matchedBuckets,
        step: { kind: 'read', bucket: p.bucket, compared, matched: matched.map((e) => e.key) },
      };
    }
    case 'done':
      return { ...scene, done: true, step: { kind: 'done' } };
    default:
      return scene;
  }
}

export const exactMatchOnlyScene: ScenePlan<ExactMatchScene> = { initial, reduce };
