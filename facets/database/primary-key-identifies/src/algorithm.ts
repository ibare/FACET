/**
 * primary-key-identifies — 표에서 줄 하나를 틀림없이 집어내려면 무엇으로 불러야 하는가.
 *
 * 걸음 0 은 `scene.initial` 이 `initialData` 에서 세운 표 전체다. 알고리즘은 먼저 기본 키 선언이
 * 줄과 어긋나지 않는지(그 열의 값이 겹치지 않는지) 확인하고, 어긋나면 던진다. 그 다음 부르기를
 * 적힌 차례대로 하나씩 한다 — 조건 = 열 값 전체가 같다(대소문자 구분, `===`).
 *
 * 이벤트
 *   call  (silent 아님) — 부르기 하나
 *     payload {
 *       column:   string            부른 열
 *       value:    string | number   부른 값
 *       kept:     number[]          조건에 맞아 남은 줄의 자리 (데이터 차례, 0 부터)
 *       distinct: number            부른 열의 서로 다른 값 수 (표 전체에서)
 *     }
 *
 * 걸음은 표 하나 + 부르기 수. 걸음 0 이 이미 읽을 것이 있는 화면이라 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Cell = string | number;

export type PrimaryKeyCall = { column: string; value: Cell };

export type PrimaryKeyIdentifiesFacetData = {
  type: 'primary-key-identifies';
  stepMs: number;
  /** 표 이름 — 번역하지 않는 자료 */
  table: string;
  columns: string[];
  /** 기본 키 선언. 열 하나 */
  primaryKey: string;
  rows: Cell[][];
  calls: PrimaryKeyCall[];
};

function isCell(v: unknown): v is Cell {
  return (typeof v === 'string' && v !== '') || (typeof v === 'number' && Number.isFinite(v));
}

/** 열 이름의 자리. 없으면 던진다. */
export function columnIndex(columns: readonly string[], column: string): number {
  const i = columns.indexOf(column);
  if (i < 0) throw new Error(`primary-key-identifies: 없는 열 "${column}"`);
  return i;
}

/** 자료 모양을 확인한다. 빈 값 · 모르는 열 · 줄 길이 어긋남은 던진다 (C6). */
export function checkData(data: PrimaryKeyIdentifiesFacetData): void {
  if (!Array.isArray(data.columns) || data.columns.length === 0) {
    throw new Error('primary-key-identifies: 열이 없다');
  }
  if (!Array.isArray(data.rows) || data.rows.length === 0) {
    throw new Error('primary-key-identifies: 줄이 없다');
  }
  data.rows.forEach((row, r) => {
    if (!Array.isArray(row) || row.length !== data.columns.length) {
      throw new Error(`primary-key-identifies: 줄 ${r} 의 칸 수가 열 수와 다르다`);
    }
    row.forEach((cell, c) => {
      if (!isCell(cell)) throw new Error(`primary-key-identifies: 줄 ${r} 열 ${c} 가 빈 값이다`);
    });
  });
  columnIndex(data.columns, data.primaryKey);
  for (const call of data.calls) {
    columnIndex(data.columns, call.column);
    if (!isCell(call.value)) throw new Error(`primary-key-identifies: 부르기 "${call.column}" 의 값이 비었다`);
  }
}

/** 기본 키 선언을 줄에서 확인한다 — 값이 겹치면 처음 겹친 짝을 담아 던진다. */
export function checkPrimaryKey(data: PrimaryKeyIdentifiesFacetData): void {
  const k = columnIndex(data.columns, data.primaryKey);
  const seen = new Map<Cell, number>();
  data.rows.forEach((row, r) => {
    const v = row[k] as Cell;
    const first = seen.get(v);
    if (first !== undefined) {
      throw new Error(
        `primary-key-identifies: 기본 키 "${data.primaryKey}" 값 ${String(v)} 이 줄 ${first} 과 줄 ${r} 에 겹친다`,
      );
    }
    seen.set(v, r);
  });
}

/** 조건에 맞는 줄의 자리 — 값 전체가 같다(`===`). 데이터 차례를 지킨다. */
export function selectEq(data: PrimaryKeyIdentifiesFacetData, call: PrimaryKeyCall): number[] {
  const c = columnIndex(data.columns, call.column);
  const kept: number[] = [];
  data.rows.forEach((row, r) => {
    if (row[c] === call.value) kept.push(r);
  });
  return kept;
}

/** 열의 서로 다른 값 수. */
export function distinctCount(data: PrimaryKeyIdentifiesFacetData, column: string): number {
  const c = columnIndex(data.columns, column);
  return new Set(data.rows.map((row) => row[c])).size;
}

export async function primaryKeyIdentifies(
  context: FacetContext<PrimaryKeyIdentifiesFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<PrimaryKeyIdentifiesFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  checkData(data);
  checkPrimaryKey(data);

  for (const call of data.calls) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'call',
      payload: {
        column: call.column,
        value: call.value,
        kept: selectEq(data, call),
        distinct: distinctCount(data, call.column),
      },
    });
  }
}
