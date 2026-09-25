/**
 * filter-keep-some 의 장면. 이벤트를 잇기만 한다 — 셈은 알고리즘이 했다.
 *
 * 바탕: lines (init 이 정한다)
 * 자취: at · lists · filter · kept · dropped · output
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneLine = { indent: number; text: string };
export type SceneList = { name: string; items: number[] };
/** 옛 목록의 자리 index 에 있던 값 value. */
export type SceneCell = { index: number; value: number };
export type SceneFilter = { line: number; fn: string; source: string; target: string };

export type SceneStep =
  | { kind: 'start' }
  | { kind: 'assign'; name: string }
  | { kind: 'item'; index: number; value: number; keep: boolean; test: string }
  | { kind: 'show' };

export type FilterKeepSomeScene = {
  lines: SceneLine[];
  /** 지금 밟은 줄 (0 부터). 아직 없으면 null */
  at: number | null;
  lists: SceneList[];
  filter: SceneFilter | null;
  /** 조건을 통과해 새 목록에 붙은 원소 — 붙은 차례대로 */
  kept: SceneCell[];
  /** 떨어진 원소 — 떨어진 차례대로 */
  dropped: SceneCell[];
  output: number[] | null;
  step: SceneStep;
};

function empty(): FilterKeepSomeScene {
  return { lines: [], at: null, lists: [], filter: null, kept: [], dropped: [], output: null, step: { kind: 'start' } };
}

function field(p: unknown, key: string): unknown {
  return typeof p === 'object' && p !== null ? (p as Record<string, unknown>)[key] : undefined;
}

function num(p: unknown, key: string): number | null {
  const v = field(p, key);
  return typeof v === 'number' ? v : null;
}

function str(p: unknown, key: string): string | null {
  const v = field(p, key);
  return typeof v === 'string' ? v : null;
}

function nums(p: unknown, key: string): number[] | null {
  const v = field(p, key);
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const x of v) {
    if (typeof x !== 'number') return null;
    out.push(x);
  }
  return out;
}

function readLines(p: unknown): SceneLine[] {
  const v = field(p, 'lines');
  if (!Array.isArray(v)) return [];
  const out: SceneLine[] = [];
  for (const l of v) {
    const indent = num(l, 'indent');
    const text = str(l, 'text');
    if (indent !== null && text !== null) out.push({ indent, text });
  }
  return out;
}

export const filterKeepSomeScene: ScenePlan<FilterKeepSomeScene> = {
  initial(): FilterKeepSomeScene {
    return empty();
  },

  reduce(scene: FilterKeepSomeScene, event: FacetRuntimeEvent): FilterKeepSomeScene {
    const p = event.payload;
    switch (event.type) {
      case 'init':
        return { ...empty(), lines: readLines(p) };
      case 'assign': {
        const line = num(p, 'line');
        const name = str(p, 'name');
        const items = nums(p, 'items');
        if (line === null || name === null || items === null) return scene;
        return {
          ...scene,
          at: line,
          lists: [...scene.lists.filter((l) => l.name !== name), { name, items }],
          step: { kind: 'assign', name },
        };
      }
      case 'filterItem': {
        const line = num(p, 'line');
        const index = num(p, 'index');
        const value = num(p, 'value');
        const keep = field(p, 'keep');
        const test = str(p, 'test');
        const fn = str(p, 'fn');
        const source = str(p, 'source');
        const target = str(p, 'target');
        if (
          line === null || index === null || value === null || typeof keep !== 'boolean' ||
          test === null || fn === null || source === null || target === null
        ) {
          return scene;
        }
        const cell: SceneCell = { index, value };
        return {
          ...scene,
          at: line,
          filter: { line, fn, source, target },
          kept: keep ? [...scene.kept, cell] : scene.kept,
          dropped: keep ? scene.dropped : [...scene.dropped, cell],
          step: { kind: 'item', index, value, keep, test },
        };
      }
      case 'show': {
        const line = num(p, 'line');
        const items = nums(p, 'items');
        if (line === null || items === null) return scene;
        return { ...scene, at: line, output: items, step: { kind: 'show' } };
      }
      default:
        return scene;
    }
  },
};
