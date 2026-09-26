import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readGroupThenAggregateData, type OrderRow } from './algorithm.js';

/** 모인 묶음 하나 — 열쇠와 묶인 줄의 id (표의 줄 차례). */
export type GatheredGroup = { key: string; ids: number[] };

/** 접힌 결과 줄 하나. */
export type FoldedRow = { key: string; n: number; total: number; parts: number[] };

export type GroupThenAggregateStep =
  | { kind: 'start' }
  | { kind: 'gather' }
  | { kind: 'fold'; group: number };

export type GroupThenAggregateScene = {
  // 바탕 — initialData 에서 베낀다
  table: string;
  columns: string[];
  rows: OrderRow[];
  idColumn: string;
  groupBy: string;
  resultColumns: [string, string, string];
  sql: string[];
  /** 묶음 수 — 알고리즘이 init 으로 알린다. 화면의 기둥 수. 알리기 전이면 null */
  groupCount: number | null;
  // 자취
  /** 모인 뒤의 묶음 (ORDER BY 차례). 모이기 전이면 null */
  groups: GatheredGroup[] | null;
  /** 접힌 결과 줄 — 묶음 차례대로 쌓인다 */
  folded: FoldedRow[];
  // 이번 걸음
  step: GroupThenAggregateStep;
};

function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === 'number');
}

function readGroups(payload: unknown): GatheredGroup[] {
  if (typeof payload !== 'object' || payload === null) throw new Error('gather: payload 가 없다');
  const groups = (payload as { groups?: unknown }).groups;
  if (!Array.isArray(groups)) throw new Error('gather: groups 가 목록이 아니다');
  return groups.map((g: unknown) => {
    if (typeof g !== 'object' || g === null) throw new Error('gather: 묶음이 객체가 아니다');
    const key = (g as { key?: unknown }).key;
    const ids = (g as { ids?: unknown }).ids;
    if (typeof key !== 'string' || !isNumberArray(ids)) throw new Error('gather: 묶음 모양이 다르다');
    return { key, ids: [...ids] };
  });
}

function readFold(payload: unknown): { group: number } & FoldedRow {
  if (typeof payload !== 'object' || payload === null) throw new Error('fold: payload 가 없다');
  const p = payload as Record<string, unknown>;
  const { group, key, n, total, parts } = p;
  if (
    typeof group !== 'number' ||
    typeof key !== 'string' ||
    typeof n !== 'number' ||
    typeof total !== 'number' ||
    !isNumberArray(parts)
  ) {
    throw new Error('fold: payload 모양이 다르다');
  }
  return { group, key, n, total, parts: [...parts] };
}

export const groupThenAggregateScene: ScenePlan<GroupThenAggregateScene> = {
  initial(initialData: unknown): GroupThenAggregateScene {
    const d = readGroupThenAggregateData(initialData);
    return {
      table: d.table,
      columns: [...d.columns],
      rows: d.rows.map((r) => ({ ...r })),
      idColumn: d.idColumn,
      groupBy: d.groupBy,
      resultColumns: [...d.resultColumns] as [string, string, string],
      sql: [...d.sql],
      groupCount: null,
      groups: null,
      folded: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: GroupThenAggregateScene, event: FacetRuntimeEvent): GroupThenAggregateScene {
    switch (event.type) {
      case 'init': {
        const p = event.payload;
        const groupCount =
          typeof p === 'object' && p !== null ? (p as { groupCount?: unknown }).groupCount : undefined;
        if (typeof groupCount !== 'number' || !Number.isInteger(groupCount) || groupCount < 1) {
          throw new Error('init: groupCount 가 양의 정수가 아니다');
        }
        return { ...scene, groupCount, groups: null, folded: [], step: { kind: 'start' } };
      }
      case 'gather':
        return { ...scene, groups: readGroups(event.payload), folded: [], step: { kind: 'gather' } };
      case 'fold': {
        const f = readFold(event.payload);
        if (scene.groups === null) throw new Error('fold: 모이기 전에 접을 수 없다');
        if (f.group !== scene.folded.length) {
          throw new Error(`fold: 묶음 ${f.group} 차례가 아니다 (접힌 수 ${scene.folded.length})`);
        }
        const row: FoldedRow = { key: f.key, n: f.n, total: f.total, parts: f.parts };
        return { ...scene, folded: [...scene.folded, row], step: { kind: 'fold', group: f.group } };
      }
      default:
        return scene;
    }
  },
};
