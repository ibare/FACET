/**
 * partial-dependency 의 장면 — 이벤트를 이어 붙이기만 한다. 셈(반례 · 무리 · 줄이기)은 알고리즘이 한다.
 *
 * 바탕: 표 이름 · 열 · 열쇠 · 줄 (initialData 에서 베낀다)
 * 자취: 열쇠를 묶었는가 · 드러난 종속 · 떨어져 나간 표 · 줄어든 줄
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type PdBroken = { col: string; a: number; b: number };
export type PdDep = { column: string; lhs: string[]; partial: boolean; groups: number[] | null };
export type PdSplit = { table: string; columns: string[]; column: string; lhs: string[] };

export type PdStep =
  | { kind: 'start' }
  | { kind: 'key'; distinct: number; rows: number }
  | { kind: 'depends'; column: string; broken: PdBroken[] }
  | { kind: 'detach' }
  | { kind: 'shrink'; before: number; after: number };

export type PartialDependencyScene = {
  table: string;
  columns: string[];
  key: string[];
  rows: string[][];
  keyShown: boolean;
  deps: PdDep[];
  split: PdSplit | null;
  kept: number[] | null;
  mapTo: number[] | null;
  step: PdStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function strings(v: unknown, what: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    throw new Error(`partialDependencyScene: ${what} 은 글자 배열이어야 한다`);
  }
  return v.map((x) => String(x));
}

function numbers(v: unknown, what: string): number[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number' && Number.isInteger(x))) {
    throw new Error(`partialDependencyScene: ${what} 은 정수 배열이어야 한다`);
  }
  return v.map((x) => Number(x));
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`partialDependencyScene: ${what} 은 글자여야 한다`);
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  if (!isRecord(event.payload)) throw new Error(`partialDependencyScene: ${event.type} 의 payload 가 없다`);
  return event.payload;
}

export const partialDependencyScene: ScenePlan<PartialDependencyScene> = {
  initial(initialData: unknown): PartialDependencyScene {
    if (!isRecord(initialData)) throw new Error('partialDependencyScene: initialData 가 없다');
    const d = initialData;
    if (!Array.isArray(d.rows)) throw new Error('partialDependencyScene: rows 는 배열이어야 한다');
    const rows = d.rows.map((r: unknown, i: number) => strings(r, `rows[${i}]`));
    return {
      table: str(d.table, 'table'),
      columns: strings(d.columns, 'columns'),
      key: strings(d.key, 'key'),
      rows,
      keyShown: false,
      deps: [],
      split: null,
      kept: null,
      mapTo: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: PartialDependencyScene, event: FacetRuntimeEvent): PartialDependencyScene {
    switch (event.type) {
      case 'key': {
        const p = payloadOf(event);
        if (typeof p.distinct !== 'number' || typeof p.rows !== 'number') {
          throw new Error('partialDependencyScene: key 의 distinct · rows 는 수여야 한다');
        }
        return { ...scene, keyShown: true, step: { kind: 'key', distinct: p.distinct, rows: p.rows } };
      }
      case 'depends': {
        const p = payloadOf(event);
        const column = str(p.column, 'column');
        const lhs = strings(p.lhs, 'lhs');
        if (typeof p.partial !== 'boolean') throw new Error('partialDependencyScene: partial 은 참/거짓이어야 한다');
        const groups = p.groups === null ? null : numbers(p.groups, 'groups');
        if (!Array.isArray(p.broken)) throw new Error('partialDependencyScene: broken 은 배열이어야 한다');
        const broken: PdBroken[] = p.broken.map((b: unknown) => {
          if (!isRecord(b) || typeof b.a !== 'number' || typeof b.b !== 'number') {
            throw new Error('partialDependencyScene: broken 의 칸 모양이 틀렸다');
          }
          return { col: str(b.col, 'broken.col'), a: b.a, b: b.b };
        });
        return {
          ...scene,
          deps: [...scene.deps, { column, lhs, partial: p.partial, groups }],
          step: { kind: 'depends', column, broken },
        };
      }
      case 'detach': {
        const p = payloadOf(event);
        return {
          ...scene,
          split: {
            table: str(p.table, 'table'),
            columns: strings(p.columns, 'columns'),
            column: str(p.column, 'column'),
            lhs: strings(p.lhs, 'lhs'),
          },
          step: { kind: 'detach' },
        };
      }
      case 'shrink': {
        const p = payloadOf(event);
        const kept = numbers(p.kept, 'kept');
        const mapTo = numbers(p.mapTo, 'mapTo');
        return { ...scene, kept, mapTo, step: { kind: 'shrink', before: mapTo.length, after: kept.length } };
      }
      default:
        throw new Error(`partialDependencyScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
