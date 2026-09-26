/**
 * keep-unmatched 장면.
 *
 * 바탕 — 두 표 · SQL 글자 · SELECT 목록 (initialData 에서 베낀다. 걸음 0 이 곧 이것이다)
 * 자취 — 결과 줄(`result`) · 짝 없는 왼쪽 줄(`unmatched`) · 어디까지 왔는가(`phase`)
 * 이번 걸음 — `step`. 결과 줄이 자리를 옮기는 걸음은 옛 자리(`was`)를 싣는다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneCell = string | number;
export type SceneTable = { name: string; columns: string[]; rows: SceneCell[][] };
export type SceneSelect = { side: 'left' | 'right'; column: string };
/** 결과 줄 하나 — 두 표의 줄 번호. `right: null` 이면 오른쪽 칸이 NULL 이다 */
export type ResultRow = { left: number; right: number | null };

export type KeepUnmatchedStep =
  | { kind: 'join' }
  | { kind: 'reveal' }
  /** was — 왼쪽 줄 번호 → 이 걸음 앞의 결과 자리 (짝 있던 줄만) */
  | { kind: 'keep'; was: [number, number][] };

export type KeepUnmatchedPhase = 'start' | 'matched' | 'unmatched' | 'kept';

export type KeepUnmatchedScene = {
  sql: string[];
  left: SceneTable;
  right: SceneTable;
  select: SceneSelect[];
  result: ResultRow[];
  unmatched: number[];
  phase: KeepUnmatchedPhase;
  step: KeepUnmatchedStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function copyTable(v: unknown, what: string): SceneTable {
  if (!isRecord(v)) throw new Error(`keep-unmatched: ${what} 표가 없다`);
  const { name, columns, rows } = v;
  if (typeof name !== 'string') throw new Error(`keep-unmatched: ${what} 표의 이름이 없다`);
  if (!Array.isArray(columns) || !columns.every((c): c is string => typeof c === 'string')) {
    throw new Error(`keep-unmatched: ${name} 의 열 목록이 글자가 아니다`);
  }
  if (!Array.isArray(rows)) throw new Error(`keep-unmatched: ${name} 에 줄 목록이 없다`);
  const copied = rows.map((row: unknown, i) => {
    if (!Array.isArray(row) || row.length !== columns.length) {
      throw new Error(`keep-unmatched: ${name} 의 줄 ${i} 칸 수가 열 수와 다르다`);
    }
    return row.map((cell: unknown) => {
      if (typeof cell !== 'string' && typeof cell !== 'number') {
        throw new Error(`keep-unmatched: ${name} 의 줄 ${i} 에 글자도 수도 아닌 칸이 있다`);
      }
      return cell;
    });
  });
  return { name, columns: [...columns], rows: copied };
}

function copySelect(v: unknown, left: SceneTable, right: SceneTable): SceneSelect[] {
  if (!Array.isArray(v)) throw new Error('keep-unmatched: select 목록이 없다');
  return v.map((s: unknown, i) => {
    if (!isRecord(s)) throw new Error(`keep-unmatched: select ${i} 이 비었다`);
    const { side, column } = s;
    if (side !== 'left' && side !== 'right') throw new Error(`keep-unmatched: select ${i} 의 표 쪽이 없다`);
    if (typeof column !== 'string') throw new Error(`keep-unmatched: select ${i} 의 열이 없다`);
    const table = side === 'left' ? left : right;
    if (!table.columns.includes(column)) {
      throw new Error(`keep-unmatched: ${table.name} 에 열 ${column} 이 없다`);
    }
    return { side, column };
  });
}

function readIndex(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`keep-unmatched: ${what} 이 줄 번호가 아니다`);
  }
  return v;
}

function readRows(v: unknown, what: string): ResultRow[] {
  if (!Array.isArray(v)) throw new Error(`keep-unmatched: ${what} 목록이 없다`);
  return v.map((r: unknown, i) => {
    if (!isRecord(r)) throw new Error(`keep-unmatched: ${what} ${i} 이 비었다`);
    const left = readIndex(r.left, `${what} ${i} 의 left`);
    const right = r.right === null ? null : readIndex(r.right, `${what} ${i} 의 right`);
    return { left, right };
  });
}

export const keepUnmatchedScene: ScenePlan<KeepUnmatchedScene> = {
  initial(initialData: unknown): KeepUnmatchedScene {
    if (!isRecord(initialData)) throw new Error('keep-unmatched: initialData 가 없다');
    const { sql } = initialData;
    if (!Array.isArray(sql) || !sql.every((l): l is string => typeof l === 'string')) {
      throw new Error('keep-unmatched: sql 줄 목록이 없다');
    }
    const left = copyTable(initialData.left, '왼쪽');
    const right = copyTable(initialData.right, '오른쪽');
    return {
      sql: [...sql],
      left,
      right,
      select: copySelect(initialData.select, left, right),
      result: [],
      unmatched: [],
      phase: 'start',
      step: null,
    };
  },

  reduce(scene: KeepUnmatchedScene, event: FacetRuntimeEvent): KeepUnmatchedScene {
    const payload = isRecord(event.payload) ? event.payload : {};
    switch (event.type) {
      case 'join-matched': {
        const pairs = readRows(payload.pairs, 'pairs');
        return { ...scene, result: pairs, phase: 'matched', step: { kind: 'join' } };
      }
      case 'find-unmatched': {
        const { left } = payload;
        if (!Array.isArray(left)) throw new Error('keep-unmatched: 짝 없는 줄 목록이 없다');
        const unmatched = left.map((v: unknown, i) => readIndex(v, `짝 없는 줄 ${i}`));
        return { ...scene, unmatched, phase: 'unmatched', step: { kind: 'reveal' } };
      }
      case 'keep-unmatched': {
        const rows = readRows(payload.rows, 'rows');
        const was: [number, number][] = scene.result.map((r, slot) => [r.left, slot]);
        return { ...scene, result: rows, phase: 'kept', step: { kind: 'keep', was } };
      }
      default:
        return { ...scene, step: null };
    }
  },
};
