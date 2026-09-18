/**
 * 건너뛰는 간격의 장면.
 *
 * 바탕   base    — 원소 수 · 줄 크기 · 원소 바이트 · 보폭들 · 보폭마다 읽는 수
 * 자취   current — 지금 보폭의 캐시(올라온 줄 · 쓴 칸). 보폭이 끝나면 비워진다
 *        ledger  — 끝난 보폭마다 쓴 칸과 버린 칸
 * 이번 걸음 step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type StrideBase = {
  count: number;
  lineElems: number;
  elemBytes: number;
  strides: number[];
  reads: number;
};

export type StrideCache = {
  strideIndex: number;
  /** 올라온 줄 번호, 올라온 순서대로 (= 캐시 칸 자리) */
  lines: number[];
  /** 읽은 원소, 읽은 순서대로 */
  used: number[];
};

export type LedgerRow = {
  strideIndex: number;
  used: number[];
  dropped: number[];
};

export type StrideStep =
  | { kind: 'read'; index: number; line: number; miss: boolean; from: number | null }
  | { kind: 'settle'; strideIndex: number; lines: number[] };

export type StrideAndMissScene = {
  base: StrideBase;
  current: StrideCache | null;
  ledger: LedgerRow[];
  step: StrideStep | null;
};

/** 한 줄에 드는 원소 번호들. 배열 끝에서 자른다. */
export function lineCells(base: StrideBase, line: number): number[] {
  const out: number[] = [];
  const start = line * base.lineElems;
  for (let i = start; i < start + base.lineElems && i < base.count; i += 1) out.push(i);
  return out;
}

/** 끝난 보폭 한 줄의 바이트 셈 — 장면이 가진 칸에서 센다. */
export function rowBytes(base: StrideBase, row: LedgerRow): { used: number; loaded: number; dropped: number } {
  const used = row.used.length * base.elemBytes;
  const dropped = row.dropped.length * base.elemBytes;
  return { used, dropped, loaded: used + dropped };
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function baseOf(data: unknown): StrideBase {
  const d = (data ?? {}) as Record<string, unknown>;
  const strides = Array.isArray(d.strides) ? d.strides.filter((s): s is number => typeof s === 'number') : [];
  return {
    count: num(d.count, 0),
    lineElems: Math.max(1, num(d.lineElems, 1)),
    elemBytes: num(d.elemBytes, 1),
    strides: [...strides],
    reads: num(d.reads, 0),
  };
}

export const strideAndMissScene: ScenePlan<StrideAndMissScene> = {
  initial(initialData: unknown): StrideAndMissScene {
    return { base: baseOf(initialData), current: null, ledger: [], step: null };
  },
  reduce(scene: StrideAndMissScene, event: FacetRuntimeEvent): StrideAndMissScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    if (event.type === 'read') {
      const strideIndex = num(p.strideIndex, 0);
      const index = num(p.index, 0);
      const line = num(p.line, 0);
      const miss = p.miss === true;
      const fresh =
        num(p.readIndex, 0) === 0 || scene.current === null || scene.current.strideIndex !== strideIndex;
      const prevCache: StrideCache = fresh
        ? { strideIndex, lines: [], used: [] }
        : scene.current!;
      const from = fresh ? null : (prevCache.used[prevCache.used.length - 1] ?? null);
      const current: StrideCache = {
        strideIndex,
        lines: miss && !prevCache.lines.includes(line) ? [...prevCache.lines, line] : [...prevCache.lines],
        used: [...prevCache.used, index],
      };
      return { ...scene, current, step: { kind: 'read', index, line, miss, from } };
    }
    if (event.type === 'settle') {
      const strideIndex = num(p.strideIndex, 0);
      const cache = scene.current;
      const lines = cache ? [...cache.lines] : [];
      const usedSet = new Set(cache ? cache.used : []);
      const used = cache ? [...cache.used].sort((a, b) => a - b) : [];
      const dropped: number[] = [];
      for (const line of lines) {
        for (const i of lineCells(scene.base, line)) if (!usedSet.has(i)) dropped.push(i);
      }
      dropped.sort((a, b) => a - b);
      return {
        ...scene,
        current: null,
        ledger: [...scene.ledger, { strideIndex, used, dropped }],
        step: { kind: 'settle', strideIndex, lines },
      };
    }
    return scene;
  },
};
