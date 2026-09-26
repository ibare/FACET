/**
 * reorder-joins — 세 표를 두 차례로 잇고 중간 결과의 줄 수를 센다.
 *
 * 표 · 줄 · 값은 예로 정한 작은 자료다. 실제 데이터베이스가 낸 계획이나 통계가 아니다.
 *
 * 규약 (사양 그대로)
 * - 조인 알고리즘은 말하지 않는다. 이음 조건이 같은 값인 짝만 결과 줄이 된다 (어느 알고리즘이든 같다).
 * - 결과 줄 순서 = 왼쪽 차례, 그 안에서 오른쪽 차례.
 * - 차례 하나 = 표 셋. 앞 둘을 먼저 잇고(중간 결과), 그 결과에 셋째를 잇는다(끝 결과).
 * - 두 표를 잇는 이음 조건은 데이터의 `conditions` 에서 **정확히 하나**를 찾는다. 없으면 곱이 되는데 이 조각은
 *   그리지 않으므로 던진다. 둘 이상이어도 던진다.
 * - 결과 줄의 칸 = 왼쪽 칸 + 오른쪽 칸. 이음 조건으로 왼쪽과 같은 값이 된 오른쪽 칸은 뺀다(같은 값이 두 번 뜨지 않게).
 * - "만든 줄" = 두 조인이 낸 줄 수의 합 (중간 + 끝). 차례는 데이터에 적힌 차례대로 (`students-first` 먼저).
 * - 답 = 끝 결과의 `select` 칸. 두 차례의 답이 (순서를 빼고) 다르면 데이터가 틀린 것이라 던진다.
 *
 * 이벤트
 * - `join`    (silent 아님) — 한 차례의 조인 하나.
 *     payload { lane: number, stage: 1 | 2, rows: { values: (string|number)[], from: number, with: number }[] }
 *     lane  = orders 의 자리. stage 1 = 앞 두 표, stage 2 = 중간 결과 ⋈ 셋째 표.
 *     from  = 왼쪽 줄의 자리 (stage 1 은 첫 표의 줄, stage 2 는 중간 결과의 줄)
 *     with  = 오른쪽 표의 줄 자리
 * - `compare` (silent 아님) — 두 차례를 견준다.
 *     payload { made: number[], answer: string[] }
 *     made   = 차례마다 만든 줄 (orders 차례), answer = 답 (글자 차례로 정렬)
 *
 * 걸음 0 은 장면의 initial() 이 SQL 과 표로 채운다. 읽을 틈을 주려고 첫 발신 앞에 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CellValue = string | number;

export type JoinTableData = {
  /** 표 이름 (`students`) */
  name: string;
  /** SQL 의 별칭 (`s`) */
  alias: string;
  /** 열 이름 (`id` · `name`) */
  columns: string[];
  /** 줄 — 칸은 columns 차례 */
  rows: CellValue[][];
};

export type JoinConditionData = {
  /** `e.student_id` 꼴 */
  left: string;
  right: string;
};

export type JoinOrderData = {
  /** 식별자 (`students-first`). 화면에 띄우지 않는다 */
  id: string;
  /** 잇는 차례 — 표 이름 셋 */
  tables: string[];
};

export type ReorderJoinsFacetData = {
  type: 'reorder-joins';
  stepMs: number;
  /** SQL 줄 (자료 · 번역하지 않는다) */
  sql: string[];
  /** 답이 되는 칸 (`s.name`) */
  select: string;
  tables: JoinTableData[];
  conditions: JoinConditionData[];
  orders: JoinOrderData[];
};

type Cell = { col: string; value: CellValue };
type JoinedRow = { cells: Cell[]; from: number; with: number };

function tableByName(data: ReorderJoinsFacetData, name: string): JoinTableData {
  const found = data.tables.find((tb) => tb.name === name);
  if (!found) throw new Error(`reorder-joins: 표 '${name}' 가 데이터에 없다`);
  return found;
}

function aliasOf(col: string): string {
  const dot = col.indexOf('.');
  if (dot <= 0) throw new Error(`reorder-joins: 열 '${col}' 에 별칭이 없다`);
  return col.slice(0, dot);
}

function recordsOf(table: JoinTableData): Cell[][] {
  return table.rows.map((row, i) => {
    if (row.length !== table.columns.length) {
      throw new Error(`reorder-joins: ${table.name} 의 ${i} 번 줄 칸 수가 열 수와 다르다`);
    }
    return row.map((value, c) => ({ col: `${table.alias}.${table.columns[c]}`, value }));
  });
}

function valueOf(cells: Cell[], col: string): CellValue {
  const found = cells.find((c) => c.col === col);
  if (!found) throw new Error(`reorder-joins: 줄에 열 '${col}' 이 없다`);
  return found.value;
}

/** 왼쪽 줄들(별칭 집합)과 오른쪽 표를 잇는 조건 하나를 찾는다 — 왼쪽 열 · 오른쪽 열로 돌려준다. */
function conditionFor(
  data: ReorderJoinsFacetData,
  leftAliases: Set<string>,
  right: JoinTableData,
): { leftCol: string; rightCol: string } {
  const hits: { leftCol: string; rightCol: string }[] = [];
  for (const cond of data.conditions) {
    const a = aliasOf(cond.left);
    const b = aliasOf(cond.right);
    if (leftAliases.has(a) && b === right.alias) hits.push({ leftCol: cond.left, rightCol: cond.right });
    else if (leftAliases.has(b) && a === right.alias) hits.push({ leftCol: cond.right, rightCol: cond.left });
  }
  if (hits.length === 0) {
    throw new Error(`reorder-joins: ${right.name} 를 이을 조건이 없다 — 곱은 그리지 않는다`);
  }
  if (hits.length > 1) throw new Error(`reorder-joins: ${right.name} 를 이을 조건이 둘 이상이다`);
  return hits[0]!;
}

function joinRows(left: Cell[][], leftAliases: Set<string>, data: ReorderJoinsFacetData, right: JoinTableData): JoinedRow[] {
  const { leftCol, rightCol } = conditionFor(data, leftAliases, right);
  const rightRecs = recordsOf(right);
  const out: JoinedRow[] = [];
  left.forEach((l, li) => {
    const lv = valueOf(l, leftCol);
    rightRecs.forEach((r, ri) => {
      if (valueOf(r, rightCol) !== lv) return;
      out.push({ cells: [...l, ...r.filter((c) => c.col !== rightCol)], from: li, with: ri });
    });
  });
  return out;
}

function toPayloadRows(rows: JoinedRow[]): { values: CellValue[]; from: number; with: number }[] {
  return rows.map((r) => ({ values: r.cells.map((c) => c.value), from: r.from, with: r.with }));
}

export async function reorderJoins(rawCtx: FacetContext<ReorderJoinsFacetData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<ReorderJoinsFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const made: number[] = [];
  const answers: string[][] = [];

  for (let lane = 0; lane < data.orders.length; lane++) {
    if (!(await pause())) return;
    const order = data.orders[lane]!;
    if (order.tables.length !== 3) throw new Error(`reorder-joins: 차례 '${order.id}' 는 표 셋이어야 한다`);
    const [firstName, secondName, thirdName] = order.tables as [string, string, string];
    const first = tableByName(data, firstName);
    const second = tableByName(data, secondName);
    const third = tableByName(data, thirdName);

    const mid = joinRows(recordsOf(first), new Set([first.alias]), data, second);
    await ctx.emit({ type: 'join', payload: { lane, stage: 1, rows: toPayloadRows(mid) } });

    if (!(await pause())) return;
    const end = joinRows(
      mid.map((r) => r.cells),
      new Set([first.alias, second.alias]),
      data,
      third,
    );
    await ctx.emit({ type: 'join', payload: { lane, stage: 2, rows: toPayloadRows(end) } });

    made.push(mid.length + end.length);
    answers.push(end.map((r) => String(valueOf(r.cells, data.select))).sort());
  }

  const answer = answers[0];
  if (!answer) throw new Error('reorder-joins: 차례가 없다');
  for (const other of answers) {
    if (other.join('\u0000') !== answer.join('\u0000')) throw new Error('reorder-joins: 두 차례의 답이 다르다');
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'compare', payload: { made, answer } });
}
