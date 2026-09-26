/**
 * partial-dependency — 열쇠 한쪽에만 매달린 열이 제 표로 떨어져 나간다.
 *
 * 함수 종속은 선언이다. 알고리즘은 선언이 줄과 어긋나지 않는지 확인하고(어긋나면 던진다),
 * 열쇠의 한쪽만으로는 값이 안 정해지는 자리를 반례 짝으로 셈한다. 반례 짝 = 왼쪽 값이
 * 같은데 오른쪽 값이 갈리는 두 줄, 데이터 차례로 처음 나오는 짝.
 *
 * 이벤트 (모두 silent 아님, 한 걸음 = emit 하나):
 *   key     { key: string[]; rows: number; distinct: number }
 *           열쇠 열들의 서로 다른 값 수(distinct)를 줄 수(rows)와 함께 싣는다.
 *   depends { column: string; lhs: string[]; partial: boolean;
 *             broken: { col: string; a: number; b: number }[];
 *             groups: number[] | null }
 *           열쇠가 아닌 열 하나가 무엇에 매달렸는가. 선언된 종속 차례대로 하나씩.
 *           broken = 열쇠의 열 하나만으로는 안 되는 자리의 반례 짝(줄 번호 a < b).
 *           groups = partial 일 때 줄마다 왼쪽 값 무리의 번호(처음 나온 차례), 아니면 null.
 *   detach  { table: string; columns: string[]; column: string; lhs: string[] }
 *           부분 종속의 오른쪽 열이 왼쪽 열을 데리고 새 표가 된다.
 *   shrink  { kept: number[]; mapTo: number[] }
 *           새 표의 같은 줄을 처음 나온 것 하나로 줄인다.
 *           kept = 남는 원래 줄 번호, mapTo[i] = 원래 줄 i 가 합쳐지는 kept 의 자리.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PartialDependencyFd = { lhs: string[]; rhs: string[] };

export type PartialDependencyFacetData = {
  type: 'partial-dependency';
  stepMs: number;
  table: string;
  columns: string[];
  key: string[];
  rows: string[][];
  fds: PartialDependencyFd[];
  splitName: string;
};

/** 열 이름 → 자리. 없으면 던진다. */
function colIndex(columns: readonly string[], name: string): number {
  const i = columns.indexOf(name);
  if (i < 0) throw new Error(`partial-dependency: 없는 열 "${name}"`);
  return i;
}

function cellsOf(row: readonly string[], idx: readonly number[]): string {
  return JSON.stringify(idx.map((i) => row[i]));
}

/** lhs → rhs 가 줄에서 깨지는 첫 반례 짝. 성립하면 null. */
function counterPair(
  columns: readonly string[],
  rows: readonly (readonly string[])[],
  lhs: readonly string[],
  rhs: readonly string[],
): { a: number; b: number } | null {
  const li = lhs.map((c) => colIndex(columns, c));
  const ri = rhs.map((c) => colIndex(columns, c));
  for (let b = 0; b < rows.length; b += 1) {
    for (let a = 0; a < b; a += 1) {
      const ra = rows[a];
      const rb = rows[b];
      if (ra === undefined || rb === undefined) throw new Error('partial-dependency: 줄 번호가 범위 밖');
      if (cellsOf(ra, li) === cellsOf(rb, li) && cellsOf(ra, ri) !== cellsOf(rb, ri)) return { a, b };
    }
  }
  return null;
}

/** 줄마다 lhs 값 무리의 번호 (처음 나온 차례). */
function groupsBy(columns: readonly string[], rows: readonly (readonly string[])[], lhs: readonly string[]): number[] {
  const li = lhs.map((c) => colIndex(columns, c));
  const seen: string[] = [];
  return rows.map((row) => {
    const k = cellsOf(row, li);
    let g = seen.indexOf(k);
    if (g < 0) {
      seen.push(k);
      g = seen.length - 1;
    }
    return g;
  });
}

function validate(d: PartialDependencyFacetData): void {
  if (d.columns.length === 0) throw new Error('partial-dependency: 열이 없다');
  if (d.key.length < 2) throw new Error('partial-dependency: 열쇠는 두 열 이상이어야 한다');
  for (const k of d.key) colIndex(d.columns, k);
  d.rows.forEach((row, r) => {
    if (row.length !== d.columns.length) throw new Error(`partial-dependency: 줄 ${r} 의 칸 수가 열 수와 다르다`);
    row.forEach((v, c) => {
      if (typeof v !== 'string' || v === '') throw new Error(`partial-dependency: 줄 ${r} 칸 ${c} 이 비었다`);
    });
  });
  const ki = d.key.map((c) => colIndex(d.columns, c));
  const keys = d.rows.map((row) => cellsOf(row, ki));
  if (new Set(keys).size !== keys.length) throw new Error('partial-dependency: 열쇠 값이 겹치는 줄이 있다');
  for (const fd of d.fds) {
    if (fd.lhs.length === 0 || fd.rhs.length === 0) throw new Error('partial-dependency: 빈 쪽이 있는 종속');
    const ce = counterPair(d.columns, d.rows, fd.lhs, fd.rhs);
    if (ce !== null) {
      throw new Error(
        `partial-dependency: 선언 ${fd.lhs.join(',')} → ${fd.rhs.join(',')} 이 줄 ${ce.a} · ${ce.b} 와 어긋난다`,
      );
    }
  }
}

export async function partialDependency(context: FacetContext<PartialDependencyFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<PartialDependencyFacetData>;
  const d = ctx.data;
  validate(d);
  const stepMs = d.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 은 이미 표가 서 있다 — 읽을 틈을 두고 첫 걸음으로 간다.
  const keyIdx = d.key.map((c) => colIndex(d.columns, c));
  const distinct = new Set(d.rows.map((row) => cellsOf(row, keyIdx))).size;
  if (!(await pause())) return;
  await ctx.emit({ type: 'key', payload: { key: [...d.key], rows: d.rows.length, distinct } });

  const partials: { column: string; lhs: string[]; groups: number[] }[] = [];
  for (const fd of d.fds) {
    if (!(await pause())) return;
    const lhsIsKey = fd.lhs.length === d.key.length && fd.lhs.every((c) => d.key.includes(c));
    const lhsInKey = fd.lhs.every((c) => d.key.includes(c));
    if (!lhsInKey) throw new Error(`partial-dependency: 왼쪽 ${fd.lhs.join(',')} 이 열쇠 밖에 있다 — 이 조각이 다루지 않는 꼴`);
    if (fd.rhs.length !== 1) throw new Error('partial-dependency: 오른쪽은 열 하나여야 한다');
    const column = fd.rhs[0];
    if (column === undefined || d.key.includes(column)) {
      throw new Error('partial-dependency: 오른쪽이 열쇠 열이다 — 이 조각이 다루지 않는 꼴');
    }
    const partial = !lhsIsKey;
    // 선언된 왼쪽에 들지 않는 열쇠의 열 하나씩 — 그것만으로는 안 됨을 반례로 보인다.
    const broken: { col: string; a: number; b: number }[] = [];
    for (const k of d.key) {
      if (partial && fd.lhs.includes(k)) continue;
      const ce = counterPair(d.columns, d.rows, [k], [column]);
      if (ce === null) throw new Error(`partial-dependency: ${k} 하나로 ${column} 이 갈리지 않는다 — 반례를 보일 수 없다`);
      broken.push({ col: k, a: ce.a, b: ce.b });
    }
    const groups = partial ? groupsBy(d.columns, d.rows, fd.lhs) : null;
    if (partial && groups !== null) partials.push({ column, lhs: [...fd.lhs], groups });
    await ctx.emit({
      type: 'depends',
      payload: { column, lhs: [...fd.lhs], partial, broken, groups },
    });
  }

  if (partials.length !== 1) throw new Error(`partial-dependency: 부분 종속이 ${partials.length} 개 — 하나여야 한다`);
  const part = partials[0];
  if (part === undefined) throw new Error('partial-dependency: 부분 종속이 없다');

  if (!(await pause())) return;
  await ctx.emit({
    type: 'detach',
    payload: { table: d.splitName, columns: [...part.lhs, part.column], column: part.column, lhs: [...part.lhs] },
  });

  // 떼어 낸 표의 같은 줄은 처음 나온 것 하나만 — lhs → column 이 성립하므로 lhs 무리가 곧 같은 줄이다.
  const kept: number[] = [];
  part.groups.forEach((g, i) => {
    if (g === kept.length) kept.push(i);
    else if (g > kept.length) throw new Error('partial-dependency: 무리 번호가 처음 나온 차례가 아니다');
  });
  if (!(await pause())) return;
  await ctx.emit({ type: 'shrink', payload: { kept, mapTo: [...part.groups] } });
}
