/**
 * 같은 답, 다른 길 — 같은 SQL 한 문장을 두 차례로 풀어 답의 줄을 견준다.
 *
 * 표 · 줄 · 값은 예로 정한 작은 자료다. 실제 데이터베이스가 낸 계획이나 통계가 아니다.
 *
 * 규약 (사양 그대로):
 *   - 조인은 중첩 반복. 바깥 = orders (id 차례), 안쪽 = customers (id 차례, 거른 뒤라면 거른 것만).
 *     짝 하나마다 `o.cust_id = c.id` 검사 한 번
 *   - 거르기는 줄 하나마다 `c.city = <값>` 검사 한 번
 *   - 일의 단위 = 조건 검사 한 번. 조인 검사와 거르기 검사를 같은 단위로 더한다
 *   - 결과 줄 순서 = 바깥 차례, 그 안에서 안쪽 차례
 *   - 길은 initialData.paths 에 적힌 차례대로 푼다 (join-first 먼저, filter-first 다음)
 *   - 답의 줄은 SELECT o.id, c.name 으로 추린다. 가운데 줄(이은 줄)은 거르기에 쓰는 c.city 까지 셋을 보인다
 *
 * 이벤트 (전부 silent 아님 — 걸음 하나씩):
 *   join     { path: number, level: number, checks: number, total: number | null, rows: (string | number)[][] }
 *            path = paths 안의 차례, level = 그 길의 몇 번째 연산 (0 · 1).
 *            rows = 나온 줄. 마지막 연산이면 답의 줄 [o.id, c.name], 아니면 가운데 줄 [o.id, c.name, c.city]
 *   filter   { path: number, level: number, checks: number, total: number | null,
 *            input: (string | number)[][], kept: number[], rows: (string | number)[][] }
 *            input = 검사한 줄 (첫 연산이면 고객 [c.id, c.name, c.city], 아니면 가운데 줄),
 *            kept = input 안에서 살아남은 줄의 차례,
 *            rows = 마지막 연산이면 답의 줄 [o.id, c.name] (kept 차례대로), 아니면 빈 배열
 *            total = 그 길의 마지막 연산이면 길의 검사 합, 아니면 null
 *   overlay  { same: boolean[], totals: number[] }  두 길의 답을 같은 자리끼리 견준 결과와 길마다의 검사 합.
 *            줄 수가 다르면 던진다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Customer = { id: number; name: string; city: string };
export type Order = { id: number; custId: number };
export type PlanOp = 'join' | 'filter';
export type PlanPath = { id: string; ops: PlanOp[] };

export type SameAnswerDifferentPlanFacetData = {
  type: 'same-answer-different-plan';
  stepMs: number;
  sql: string[];
  orders: { table: string; rows: Order[] };
  customers: { table: string; rows: Customer[] };
  joinOn: string;
  where: { text: string; city: string };
  paths: PlanPath[];
};

type Cell = string | number;
/** 이은 줄 — 고객 줄과 주문 줄이 붙은 것 */
type Joined = { order: Order; customer: Customer };

function joinedCells(r: Joined): Cell[] {
  return [r.order.id, r.customer.name, r.customer.city];
}

function answerCells(r: Joined): Cell[] {
  return [r.order.id, r.customer.name];
}

function customerCells(c: Customer): Cell[] {
  return [c.id, c.name, c.city];
}

export async function sameAnswerDifferentPlan(
  context: FacetContext<SameAnswerDifferentPlanFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<SameAnswerDifferentPlanFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const answers: Cell[][][] = [];
  const totals: number[] = [];

  for (let p = 0; p < data.paths.length; p += 1) {
    if (ctx.cancelled) return;
    const path = data.paths[p];
    if (path === undefined) throw new Error(`길 ${p} 가 없다`);
    if (path.ops.length !== 2) throw new Error(`길 ${path.id} 의 연산은 둘이어야 한다 (지금 ${path.ops.length})`);

    // 길 하나의 상태 — 아직 잇지 않았으면 고객 모음, 이었으면 이은 줄
    let pool: Customer[] = data.customers.rows.map((c) => ({ ...c }));
    let joined: Joined[] | null = null;
    let answer: Cell[][] | null = null;
    let sum = 0;

    for (let level = 0; level < path.ops.length; level += 1) {
      if (!(await pause())) return;
      const op = path.ops[level];
      const last = level === path.ops.length - 1;
      if (op === 'join') {
        if (joined !== null) throw new Error(`길 ${path.id}: 두 번 잇는다 (연산 ${level})`);
        let checks = 0;
        const out: Joined[] = [];
        for (const order of data.orders.rows) {
          if (ctx.cancelled) return;
          for (const customer of pool) {
            checks += 1;
            if (order.custId === customer.id) out.push({ order, customer });
          }
        }
        joined = out;
        const rows = last ? out.map(answerCells) : out.map(joinedCells);
        if (last) answer = rows;
        sum += checks;
        const total = last ? sum : null;
        await ctx.emit({ type: 'join', payload: { path: p, level, checks, total, rows } });
      } else if (op === 'filter') {
        const city = data.where.city;
        if (joined === null) {
          if (last) throw new Error(`길 ${path.id}: 잇지 않고 끝난다`);
          const input = pool.map(customerCells);
          const kept: number[] = [];
          pool.forEach((c, i) => {
            if (c.city === city) kept.push(i);
          });
          const checks = pool.length;
          pool = pool.filter((c) => c.city === city);
          sum += checks;
          await ctx.emit({ type: 'filter', payload: { path: p, level, checks, total: null, input, kept, rows: [] } });
        } else {
          const input = joined.map(joinedCells);
          const kept: number[] = [];
          joined.forEach((r, i) => {
            if (r.customer.city === city) kept.push(i);
          });
          const checks = joined.length;
          joined = joined.filter((r) => r.customer.city === city);
          const rows = last ? joined.map(answerCells) : [];
          if (last) answer = rows;
          sum += checks;
          const total = last ? sum : null;
          await ctx.emit({ type: 'filter', payload: { path: p, level, checks, total, input, kept, rows } });
        }
      } else {
        throw new Error(`길 ${path.id}: 모르는 연산 ${String(op)} (연산 ${level})`);
      }
    }
    if (answer === null) throw new Error(`길 ${path.id}: 답이 나오지 않았다`);
    answers.push(answer);
    totals.push(sum);
  }

  if (answers.length !== 2) throw new Error(`견줄 길은 둘이어야 한다 (지금 ${answers.length})`);
  const [a, b] = answers;
  if (a === undefined || b === undefined) throw new Error('견줄 답이 없다');
  if (a.length !== b.length) throw new Error(`두 답의 줄 수가 다르다 (${a.length} · ${b.length})`);
  const same = a.map((row, i) => {
    const other = b[i];
    if (other === undefined) throw new Error(`답의 줄 ${i} 가 없다`);
    return row.length === other.length && row.every((cell, j) => cell === other[j]);
  });

  if (!(await pause())) return;
  await ctx.emit({ type: 'overlay', payload: { same, totals } });
}
