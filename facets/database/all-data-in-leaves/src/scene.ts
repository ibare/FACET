import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 바탕 — 트리 구조 한 페이지 */
export type ScenePage = {
  id: string;
  kind: 'inner' | 'leaf';
  keys: number[];
  children: string[];
  names: string[];
};

/** 자취 — 읽은 페이지 하나 */
export type ReadMark = {
  page: string;
  depth: number;
  kind: 'inner' | 'leaf';
  slot: number;
  hit: number;
  next: string | null;
  value: string | null;
};

export type AllDataInLeavesScene = {
  // 바탕
  index: string;
  root: string;
  pages: ScenePage[];
  lookups: { key: number; sql: string }[];
  // 자취 — 찾기마다 읽은 페이지
  trails: ReadMark[][];
  // 이번 걸음
  step: null | {
    search: number;
    key: number;
    mark: ReadMark;
    /** 계기값 — 이 찾기에서 바로 앞에 읽은 페이지. 찾기의 첫 읽기면 null */
    from: { page: string; kind: 'inner' | 'leaf'; slot: number; hit: number } | null;
  };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function numbers(v: unknown, where: string): number[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number')) throw new Error(`${where}: 수 배열이 아니다`);
  return v.slice();
}

/** 없으면 빈 배열 (안쪽 페이지의 names · 잎의 children). 있는데 모양이 틀리면 던진다 */
function strings(v: unknown, where: string): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`${where}: 글자 배열이 아니다`);
  return v.slice();
}

function emptyScene(): AllDataInLeavesScene {
  return { index: '', root: '', pages: [], lookups: [], trails: [], step: null };
}

export const allDataInLeavesScene: ScenePlan<AllDataInLeavesScene> = {
  initial(initialData: unknown): AllDataInLeavesScene {
    if (!isRecord(initialData)) return emptyScene();
    const pages: ScenePage[] = [];
    if (initialData.pages !== undefined) {
      if (!Array.isArray(initialData.pages)) throw new Error('pages 가 배열이 아니다');
      initialData.pages.forEach((p, i) => {
        if (!isRecord(p) || typeof p.id !== 'string') throw new Error(`pages[${i}]: id 가 없다`);
        if (p.kind !== 'inner' && p.kind !== 'leaf') throw new Error(`페이지 ${p.id}: 종류를 모른다`);
        pages.push({
          id: p.id,
          kind: p.kind,
          keys: numbers(p.keys, `페이지 ${p.id} keys`),
          children: strings(p.children, `페이지 ${p.id} children`),
          names: strings(p.names, `페이지 ${p.id} names`),
        });
      });
    }
    const lookups: { key: number; sql: string }[] = [];
    if (initialData.lookups !== undefined) {
      if (!Array.isArray(initialData.lookups)) throw new Error('lookups 가 배열이 아니다');
      initialData.lookups.forEach((l, i) => {
        if (!isRecord(l) || typeof l.key !== 'number' || typeof l.sql !== 'string') {
          throw new Error(`lookups[${i}]: key · sql 이 없다`);
        }
        lookups.push({ key: l.key, sql: l.sql });
      });
    }
    return {
      index: typeof initialData.index === 'string' ? initialData.index : '',
      root: typeof initialData.root === 'string' ? initialData.root : '',
      pages,
      lookups,
      trails: lookups.map(() => []),
      step: null,
    };
  },

  reduce(scene: AllDataInLeavesScene, event: FacetRuntimeEvent): AllDataInLeavesScene {
    if (event.type !== 'read') return scene;
    const p = event.payload;
    if (!isRecord(p)) return scene;
    const { search, key, page, depth, kind, slot, hit, next, value } = p;
    if (
      typeof search !== 'number' ||
      typeof key !== 'number' ||
      typeof page !== 'string' ||
      typeof depth !== 'number' ||
      (kind !== 'inner' && kind !== 'leaf') ||
      typeof slot !== 'number' ||
      typeof hit !== 'number'
    ) {
      return scene;
    }
    const mark: ReadMark = {
      page,
      depth,
      kind,
      slot,
      hit,
      next: typeof next === 'string' ? next : null,
      value: typeof value === 'string' ? value : null,
    };
    const trails = scene.trails.map((trail) => trail.slice());
    while (trails.length <= search) trails.push([]);
    const before = trails[search]!;
    const last = before[before.length - 1];
    const from = last ? { page: last.page, kind: last.kind, slot: last.slot, hit: last.hit } : null;
    trails[search] = [...before, mark];
    return { ...scene, trails, step: { search, key, mark, from } };
  },
};
