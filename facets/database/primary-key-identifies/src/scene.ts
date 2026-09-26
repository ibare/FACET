/**
 * primary-key-identifies 장면.
 *
 * 바탕 — 표(이름 · 열 · 기본 키 · 줄). `initial()` 이 `initialData` 에서 베껴 세운다 (걸음 0).
 * 자취 — 지금까지의 부르기 (`calls`). 부른 열 · 값 · 남은 줄의 자리 · 그 열의 서로 다른 값 수.
 * 이번 걸음 — `step`. 부르기면 앞 부르기가 남긴 줄의 자리(`from`)를 계기값으로 싣는다 —
 *   표가 다섯 줄로 돌아오는 운동이 거기서 출발한다.
 *
 * 셈(걸러 내기 · 서로 다른 값 세기)은 알고리즘이 한다. 장면은 이벤트를 이을 뿐이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type PkCell = string | number;

export type PkSceneCall = {
  column: string;
  value: PkCell;
  kept: number[];
  distinct: number;
};

export type PkStep =
  | { kind: 'table' }
  | { kind: 'call'; index: number; from: number[] | null };

export type PrimaryKeyIdentifiesScene = {
  table: string;
  columns: string[];
  primaryKey: string;
  rows: PkCell[][];
  /** 부르기가 모두 몇인가 — 자취 칸의 간격을 처음부터 정한다 */
  callTotal: number;
  calls: PkSceneCall[];
  step: PkStep;
};

function isCell(v: unknown): v is PkCell {
  return (typeof v === 'string' && v !== '') || (typeof v === 'number' && Number.isFinite(v));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function stringList(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`primary-key-identifies 장면: ${what} 이 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string' || x === '') throw new Error(`primary-key-identifies 장면: ${what} 에 빈 이름`);
    return x;
  });
}

function indexList(v: unknown, n: number): number[] {
  if (!Array.isArray(v)) throw new Error('primary-key-identifies 장면: kept 가 목록이 아니다');
  return v.map((x) => {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x >= n) {
      throw new Error(`primary-key-identifies 장면: 줄 자리 ${String(x)} 가 표 밖이다`);
    }
    return x;
  });
}

export const primaryKeyIdentifiesScene: ScenePlan<PrimaryKeyIdentifiesScene> = {
  initial(initialData: unknown): PrimaryKeyIdentifiesScene {
    if (!isRecord(initialData)) throw new Error('primary-key-identifies 장면: initialData 가 없다');
    const { table, primaryKey } = initialData;
    if (typeof table !== 'string' || table === '') throw new Error('primary-key-identifies 장면: 표 이름이 없다');
    if (typeof primaryKey !== 'string') throw new Error('primary-key-identifies 장면: 기본 키 선언이 없다');
    const columns = stringList(initialData.columns, 'columns');
    if (!columns.includes(primaryKey)) throw new Error(`primary-key-identifies 장면: 기본 키 "${primaryKey}" 가 열에 없다`);
    const rawRows = initialData.rows;
    if (!Array.isArray(rawRows)) throw new Error('primary-key-identifies 장면: rows 가 목록이 아니다');
    const rows = rawRows.map((row: unknown, r) => {
      if (!Array.isArray(row) || row.length !== columns.length) {
        throw new Error(`primary-key-identifies 장면: 줄 ${r} 의 칸 수가 열 수와 다르다`);
      }
      return row.map((cell: unknown, c) => {
        if (!isCell(cell)) throw new Error(`primary-key-identifies 장면: 줄 ${r} 열 ${c} 가 빈 값이다`);
        return cell;
      });
    });
    const rawCalls = initialData.calls;
    if (!Array.isArray(rawCalls)) throw new Error('primary-key-identifies 장면: calls 가 목록이 아니다');
    return { table, columns, primaryKey, rows, callTotal: rawCalls.length, calls: [], step: { kind: 'table' } };
  },

  reduce(scene, event: FacetRuntimeEvent): PrimaryKeyIdentifiesScene {
    if (event.type !== 'call') return scene;
    const p = event.payload;
    if (!isRecord(p)) throw new Error('primary-key-identifies 장면: call 의 payload 가 없다');
    const { column, value, distinct } = p;
    if (typeof column !== 'string' || !scene.columns.includes(column)) {
      throw new Error(`primary-key-identifies 장면: 모르는 열 ${String(column)}`);
    }
    if (!isCell(value)) throw new Error('primary-key-identifies 장면: 부른 값이 비었다');
    if (typeof distinct !== 'number' || !Number.isInteger(distinct)) {
      throw new Error('primary-key-identifies 장면: distinct 가 수가 아니다');
    }
    const kept = indexList(p.kept, scene.rows.length);
    const last = scene.calls[scene.calls.length - 1];
    return {
      ...scene,
      calls: [...scene.calls, { column, value, kept, distinct }],
      step: { kind: 'call', index: scene.calls.length, from: last ? [...last.kept] : null },
    };
  },
};
