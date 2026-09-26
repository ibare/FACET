/**
 * determinant-must-be-key — 결정자 하나를 씨앗으로 두고, 선언된 함수 종속을 따라 정해지는 열이
 * 번져 나가다 멈춘다. 폐포가 표의 모든 열을 덮으면 그 결정자는 열쇠(슈퍼키)이고, 덮지 못하면
 * 열쇠가 아닌 결정자가 정하는 짝이 여러 줄에 되풀이된 채 남는다.
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 세운다 (표 · 선언된 종속 · 결정자 칸).
 * 걸음 0 에 읽을 것이 있으므로 첫 발신 앞에도 stepMs 를 둔다.
 *
 * 번지기 규약 (폐포): 출발 열 모음에서 선언된 종속을 적힌 차례대로 훑어, 왼쪽 열이 모두
 * 모음에 있으면 오른쪽 열을 더한다. 한 바퀴를 돌아 더해진 것이 없으면 멈춘다. 더할 것이
 * 없는 적용은 걸음으로 세지 않는다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 걸음 하나):
 *   seed    payload { determinant: number }
 *             determinant = initialData.determinants 의 번호. 씨앗을 둔다
 *   spread  payload { determinant: number; fd: number; added: string[] }
 *             fd = initialData.dependencies 의 번호, added = 이 적용으로 새로 더해진 열
 *   halt    payload { determinant: number; missing: string[] }
 *             폐포가 모든 열을 덮지 못하고 멈췄다. missing = 닿지 못한 열 (표의 열 차례)
 *             폐포가 모든 열을 덮으면 보내지 않는다 — 마지막 spread 가 곧 다 닿은 걸음이다
 *   repeat  payload { determinant: number; columns: string[]; groups: { values: string[]; rows: number[] }[] }
 *             열쇠가 아닌 결정자에만. columns = 결정자 열 + 그것이 정한 열(폐포에서 결정자를 뺀 것,
 *             더해진 차례). groups = 그 열들의 값이 같은 줄 무리 가운데 둘 이상인 것, 처음 나온 차례.
 *             rows 는 데이터의 줄 번호(0 부터). 되풀이가 없으면 보내지 않는다
 *
 * 줄이 선언된 종속과 어긋나면(왼쪽 값이 같은데 오른쪽이 갈리는 짝) 던진다 — 줄은 종속을
 * 증명하지 못하지만 반례는 보인다 (C6).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Dependency = { lhs: string[]; rhs: string[] };

export type DeterminantMustBeKeyFacetData = {
  type: 'determinant-must-be-key';
  stepMs: number;
  table: string;
  columns: string[];
  rows: string[][];
  dependencies: Dependency[];
  determinants: string[][];
};

function fail(msg: string): never {
  throw new Error(`determinant-must-be-key: ${msg}`);
}

function checkColumns(columns: string[], names: string[], where: string): void {
  if (names.length === 0) fail(`${where} 의 열 모음이 비었다`);
  for (const c of names) {
    if (!columns.includes(c)) fail(`${where} 에 없는 열 '${c}'`);
  }
}

function cellsOf(columns: string[], row: string[], names: string[]): string[] {
  return names.map((c) => {
    const v = row[columns.indexOf(c)];
    if (v === undefined) fail(`줄에 열 '${c}' 의 칸이 없다`);
    return v;
  });
}

/** 데이터와 선언이 셈할 수 있는 꼴인지 보고, 선언된 종속이 줄과 어긋나지 않는지 본다. */
function validate(d: DeterminantMustBeKeyFacetData): void {
  if (d.columns.length === 0) fail('열이 없다');
  if (new Set(d.columns).size !== d.columns.length) fail('열 이름이 겹친다');
  d.rows.forEach((row, i) => {
    if (row.length !== d.columns.length) fail(`줄 ${i} 의 칸 수가 열 수와 다르다`);
    row.forEach((v, j) => {
      if (typeof v !== 'string' || v === '') fail(`줄 ${i} 의 칸 ${j} 가 비었다`);
    });
  });
  d.dependencies.forEach((fd, n) => {
    checkColumns(d.columns, fd.lhs, `종속 ${n} 의 왼쪽`);
    checkColumns(d.columns, fd.rhs, `종속 ${n} 의 오른쪽`);
    const seen = new Map<string, { row: number; right: string }>();
    d.rows.forEach((row, i) => {
      const left = JSON.stringify(cellsOf(d.columns, row, fd.lhs));
      const right = JSON.stringify(cellsOf(d.columns, row, fd.rhs));
      const first = seen.get(left);
      if (first === undefined) seen.set(left, { row: i, right });
      else if (first.right !== right) fail(`종속 ${n} 이 줄 ${first.row} · 줄 ${i} 와 어긋난다`);
    });
  });
  d.determinants.forEach((det, n) => checkColumns(d.columns, det, `결정자 ${n}`));
  if (!Number.isFinite(d.stepMs) || d.stepMs <= 0) fail('stepMs 가 양수가 아니다');
}

export async function determinantMustBeKey(
  context: FacetContext<DeterminantMustBeKeyFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<DeterminantMustBeKeyFacetData>;
  const data = ctx.data;
  validate(data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (let di = 0; di < data.determinants.length; di += 1) {
    if (!(await pause())) return;
    const seed = data.determinants[di]!;
    await ctx.emit({ type: 'seed', payload: { determinant: di } });

    const reached = [...seed];
    let changed = true;
    while (changed) {
      if (ctx.cancelled) return;
      changed = false;
      for (let n = 0; n < data.dependencies.length; n += 1) {
        if (ctx.cancelled) return;
        const fd = data.dependencies[n]!;
        if (!fd.lhs.every((c) => reached.includes(c))) continue;
        const added = fd.rhs.filter((c) => !reached.includes(c));
        if (added.length === 0) continue;
        reached.push(...added);
        changed = true;
        if (!(await pause())) return;
        await ctx.emit({ type: 'spread', payload: { determinant: di, fd: n, added } });
      }
    }

    const missing = data.columns.filter((c) => !reached.includes(c));
    if (missing.length === 0) continue;

    if (!(await pause())) return;
    await ctx.emit({ type: 'halt', payload: { determinant: di, missing } });

    // 결정자와 그것이 정한 열의 값이 같은 줄끼리 모은다 — 처음 나온 차례
    const columns = [...seed, ...reached.filter((c) => !seed.includes(c))];
    const groups: { values: string[]; rows: number[] }[] = [];
    const byKey = new Map<string, { values: string[]; rows: number[] }>();
    data.rows.forEach((row, i) => {
      const values = cellsOf(data.columns, row, columns);
      const key = JSON.stringify(values);
      const group = byKey.get(key);
      if (group === undefined) {
        const fresh = { values, rows: [i] };
        byKey.set(key, fresh);
        groups.push(fresh);
      } else {
        group.rows.push(i);
      }
    });
    const repeated = groups.filter((g) => g.rows.length > 1);
    if (repeated.length === 0) continue;

    if (!(await pause())) return;
    await ctx.emit({
      type: 'repeat',
      payload: { determinant: di, columns, groups: repeated },
    });
  }
}
