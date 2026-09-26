/**
 * optimizer — 조인 차례와 실행 계획.
 *
 * 같은 답을 내는 두 계획(고객 먼저 · 할인 먼저)을 계획 트리 그대로 돌려, 조인이 낸 줄을 센다.
 * 계획은 트리 자료다 — 이 알고리즘은 트리를 아래에서 위로 실행하는 작은 실행기다.
 *   - `Seq Scan`   표의 줄을 넣은 차례대로 낸다 (열 이름은 `<별칭>.<열>`)
 *   - `Filter`     `<열> <= k` 를 만족하는 줄만 낸다. 조인이 아니라 "만든 줄" 에 넣지 않는다
 *   - `Nested Loop` 중첩 반복 조인 — 바깥(첫 자식) 차례, 그 안에서 안쪽(둘째 자식) 차례로 결과 줄을 낸다
 *   - `Project`    열을 고른다 (줄 수는 그대로)
 * 만든 줄 = 두 `Nested Loop` 이 낸 줄의 합 (중간 + 끝). 옵티마이저는 두 계획의 만든 줄을 셈해 적은 쪽을 고른다.
 * 견줌: 정수는 크기, 문자열은 글자 그대로 같은지 (IR 은 사전순 번호로 같은 셈을 한다).
 * 동률 규칙: 두 차례의 만든 줄이 같으면 먼저 적힌 차례(`joinOrders[0]`)를 싼 차례로 둔다.
 *   이 자료에서는 걸리지 않는다 (k = 1..6 에서 5/10 · 11/12 · 16/13 · 22/15 · 27/16 · 33/18).
 *
 * 한 판 = 걸음 넷 (걸음 0 포함), 손잡이와 무관.
 *   0 처음    — SQL · 이 차례의 계획 트리 · 표 셋
 *   1 첫 조인  — 중간 결과
 *   2 둘째 조인 — 끝 줄
 *   3 견줌    — 두 차례의 만든 줄과 싼 차례 표지
 * 한 판이 끝나면 `waitForInput` 으로 손잡이를 기다리고, 받은 값으로 처음부터 다시 돈다.
 *
 * 이벤트 (silent 가 아니면 걸음 경계는 sleep · 입력 대기뿐):
 *   - `round`       { k: number, order: number, orderId: string, sql: string[], plan: PlanNode,
 *                     keptCustomerIds: number[], keptCount: number, customerCount: number }
 *                   걸음 0. `sql` · `plan` 의 `{k}` 는 이 판의 k 로 채워져 온다
 *   - `phase`       { phase: string } — silent
 *   - `first-join`  { nodeId: string, detail: string, middleOrderIds: number[], middleCount: number }
 *   - `second-join` { nodeId: string, detail: string, finalRows: { key: string, cells: string[] }[], finalCount: number, madeCount: number }
 *   - `compare`     { made: number[], orderIds: string[], cheaper: number, current: number } — joinOrders 차례
 *
 * phase 어휘 (irs.ts 와 같다):
 *   `cf-join-orders` · `cf-join-sales` (고객 먼저) · `sf-join-sales` · `sf-join-customers` (할인 먼저) · `compare-orders`
 *
 * 계기 (판마다 0 으로 되돌리고 차이만 보낸다):
 *   - `middle-rows` 첫 조인이 낸 줄 (걸음 1)
 *   - `final-rows`  둘째 조인이 낸 줄 (걸음 2)
 *   - `made-rows`   중간 + 끝 (걸음 2)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Cell = number | string;

export type TableData = {
  /** 표 이름 (자료) */
  name: string;
  /** SQL 별칭 (`c` · `o` · `s`) */
  alias: string;
  columns: string[];
  rows: Cell[][];
};

export type PlanNode = {
  /** 두 계획에 걸쳐 같은 노드를 가리키는 식별자 — 화면이 이것으로 노드를 옮긴다 */
  id: string;
  /** EXPLAIN 연산자 이름 (자료) */
  op: string;
  /** 노드 옆에 적는 SQL 식 (자료). `{k}` 는 손잡이 값 */
  detail: string;
  /** Seq Scan — 읽는 표의 열쇠 */
  table?: string;
  /** Filter — `<열> <= k` 의 열 */
  filterColumn?: string;
  /** Nested Loop — 같아야 하는 두 열 */
  on?: [string, string];
  /** Project — 고르는 열 */
  columns?: string[];
  children: PlanNode[];
};

export type OptimizerData = {
  type: 'optimizer';
  stepMs: number;
  /** SQL 문장 (자료). `{k}` 자리를 손잡이가 바꾼다 */
  sql: string[];
  tables: Record<string, TableData>;
  /** 조인 차례 식별자 — 화면에는 표시 이름만 */
  joinOrders: string[];
  /** joinOrders 차례의 계획 트리 */
  plans: PlanNode[];
  filteredLadder: number[];
  orderLadder: number[];
  filteredCustomers: number;
  joinOrder: number;
  /** 중간 줄 조각에 다는 열 */
  middleLabelColumn: string;
  /** Filter 가 거르는 표의 열쇠와 그 식별 열 */
  filteredTable: string;
  filteredIdColumn: string;
};

type Row = Record<string, Cell>;

export type JoinRun = {
  /** 아래 → 위 차례의 Nested Loop 노드 id */
  joinIds: string[];
  /** 조인마다 낸 줄 */
  joinRows: Row[][];
  /** 계획 뿌리가 낸 줄 */
  result: Row[];
  middle: number;
  final: number;
  made: number;
};

function cellOf(row: Row, column: string): Cell {
  const v = row[column];
  if (v === undefined) throw new Error(`optimizer: 줄에 열 ${column} 이 없다`);
  return v;
}

function scanTable(data: OptimizerData, key: string): Row[] {
  const table = data.tables[key];
  if (!table) throw new Error(`optimizer: 표 ${key} 가 없다`);
  return table.rows.map((cells) => {
    if (cells.length !== table.columns.length) throw new Error(`optimizer: ${key} 의 줄 모양이 열과 다르다`);
    const row: Row = {};
    table.columns.forEach((col, i) => {
      row[`${table.alias}.${col}`] = cells[i] as Cell;
    });
    return row;
  });
}

/** 계획 트리를 아래에서 위로 실행한다. 조인이 낸 줄은 `run` 에 아래 → 위 차례로 쌓인다. */
function execute(data: OptimizerData, node: PlanNode, k: number, run: { ids: string[]; rows: Row[][] }): Row[] {
  switch (node.op) {
    case 'Seq Scan': {
      if (!node.table || node.children.length !== 0) throw new Error(`optimizer: Seq Scan ${node.id} 의 모양이 틀렸다`);
      return scanTable(data, node.table);
    }
    case 'Filter': {
      const [child] = node.children;
      if (!child || node.children.length !== 1 || !node.filterColumn) throw new Error(`optimizer: Filter ${node.id} 의 모양이 틀렸다`);
      const column = node.filterColumn;
      return execute(data, child, k, run).filter((row) => {
        const v = cellOf(row, column);
        if (typeof v !== 'number') throw new Error(`optimizer: Filter 열 ${column} 이 수가 아니다`);
        return v <= k;
      });
    }
    case 'Nested Loop': {
      const [outerNode, innerNode] = node.children;
      if (!outerNode || !innerNode || node.children.length !== 2 || !node.on) throw new Error(`optimizer: Nested Loop ${node.id} 의 모양이 틀렸다`);
      const outer = execute(data, outerNode, k, run);
      const inner = execute(data, innerNode, k, run);
      const [a, b] = node.on;
      const out: Row[] = [];
      for (const o of outer) {
        for (const i of inner) {
          const merged: Row = { ...o, ...i };
          if (cellOf(merged, a) === cellOf(merged, b)) out.push(merged);
        }
      }
      run.ids.push(node.id);
      run.rows.push(out);
      return out;
    }
    case 'Project': {
      const [child] = node.children;
      if (!child || node.children.length !== 1 || !node.columns) throw new Error(`optimizer: Project ${node.id} 의 모양이 틀렸다`);
      const cols = node.columns;
      return execute(data, child, k, run).map((row) => {
        const picked: Row = {};
        for (const c of cols) picked[c] = cellOf(row, c);
        return picked;
      });
    }
    default:
      throw new Error(`optimizer: 모르는 연산자 ${node.op}`);
  }
}

/** 계획 하나를 돌려 두 조인의 줄을 센다. 조인이 둘이 아니면 던진다. */
export function runPlan(data: OptimizerData, order: number, k: number): JoinRun {
  const plan = data.plans[order];
  if (!plan) throw new Error(`optimizer: 차례 ${order} 의 계획이 없다`);
  const run = { ids: [] as string[], rows: [] as Row[][] };
  const result = execute(data, plan, k, run);
  const [first, second] = run.rows;
  if (!first || !second || run.rows.length !== 2) throw new Error('optimizer: 계획에 조인이 둘이어야 한다');
  return {
    joinIds: run.ids,
    joinRows: run.rows,
    result,
    middle: first.length,
    final: second.length,
    made: first.length + second.length,
  };
}

/** 두 차례의 만든 줄 가운데 적은 쪽. 같으면 먼저 적힌 차례. */
export function cheaperOrder(made: number[]): number {
  let best = 0;
  for (let i = 1; i < made.length; i++) {
    if ((made[i] as number) < (made[best] as number)) best = i;
  }
  return best;
}

export function fillK(text: string, k: number): string {
  return text.split('{k}').join(String(k));
}

function findNode(node: PlanNode, id: string): PlanNode | null {
  if (node.id === id) return node;
  for (const ch of node.children) {
    const hit = findNode(ch, id);
    if (hit) return hit;
  }
  return null;
}

/** 조인 노드의 조건 글자 (자료). 트리에 없으면 던진다. */
function joinDetail(plan: PlanNode, id: string): string {
  const node = findNode(plan, id);
  if (!node) throw new Error(`optimizer: 조인 ${id} 가 계획에 없다`);
  return node.detail;
}

function resolvePlan(node: PlanNode, k: number): PlanNode {
  return { ...node, detail: fillK(node.detail, k), children: node.children.map((c) => resolvePlan(c, k)) };
}

function keptCustomers(data: OptimizerData, k: number): { kept: number[]; total: number } {
  const table = data.tables[data.filteredTable];
  if (!table) throw new Error(`optimizer: 표 ${data.filteredTable} 가 없다`);
  const col = table.columns.indexOf(data.filteredIdColumn);
  if (col < 0) throw new Error(`optimizer: 열 ${data.filteredIdColumn} 이 없다`);
  const ids = table.rows.map((r) => {
    const v = r[col];
    if (typeof v !== 'number') throw new Error('optimizer: 고객 id 가 수가 아니다');
    return v;
  });
  return { kept: ids.filter((id) => id <= k), total: ids.length };
}

/** 돌린 손잡이의 값 — 수이고 사다리에 있어야 받는다. */
function readValue(raw: unknown, ladder: number[]): number | null {
  if (typeof raw !== 'number' || !ladder.includes(raw)) return null;
  return raw;
}

/** 다른 손잡이의 지금 값 — control-bar 가 문자열로 곁들여 보낸다. 없으면 null. */
function readOther(raw: unknown, ladder: number[]): number | null {
  if (typeof raw !== 'string' || raw === '') return null;
  const v = Number(raw);
  if (!ladder.includes(v)) throw new Error(`optimizer: 손잡이 값 ${raw} 이 사다리에 없다`);
  return v;
}

export async function optimizerAlgorithm(ctx: FacetContext<OptimizerData>): Promise<void> {
  const rctx = ctx as ReactiveContext<OptimizerData>;
  const data = ctx.data;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다
  const shown: Record<string, number> = { 'middle-rows': 0, 'final-rows': 0, 'made-rows': 0 };
  const showMetric = (name: string, value: number): void => {
    const prev = shown[name];
    if (prev === undefined) throw new Error(`optimizer: 선언하지 않은 계기 ${name}`);
    ctx.metric(name, value - prev);
    shown[name] = value;
  };

  let k = data.filteredCustomers;
  let order = data.joinOrder;
  if (!data.filteredLadder.includes(k)) throw new Error('optimizer: 처음 k 가 사다리에 없다');
  if (!data.orderLadder.includes(order)) throw new Error('optimizer: 처음 차례가 사다리에 없다');

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const runs = data.plans.map((_, i) => runPlan(data, i, k));
      const current = runs[order];
      const orderId = data.joinOrders[order];
      if (!current || (orderId !== 'customers-first' && orderId !== 'sales-first')) {
        throw new Error(`optimizer: 차례 ${order} 의 자료가 모자라다`);
      }
      const plan = data.plans[order] as PlanNode;
      const { kept, total } = keptCustomers(data, k);

      // 걸음 0 — 처음 모습
      showMetric('middle-rows', 0);
      showMetric('final-rows', 0);
      showMetric('made-rows', 0);
      await ctx.emit({
        type: 'round',
        payload: {
          k,
          order,
          orderId,
          sql: data.sql.map((line) => fillK(line, k)),
          plan: resolvePlan(plan, k),
          keptCustomerIds: kept,
          keptCount: kept.length,
          customerCount: total,
        },
      });
      if (!(await rctx.sleep(data.stepMs))) return;

      // 걸음 1 — 첫 조인
      if (ctx.cancelled) return;
      const middleRows = current.joinRows[0] as Row[];
      const middleIds = middleRows.map((row) => {
        const v = cellOf(row, data.middleLabelColumn);
        if (typeof v !== 'number') throw new Error('optimizer: 중간 줄 표지가 수가 아니다');
        return v;
      });
      if (orderId === 'customers-first') await phase('cf-join-orders');
      else await phase('sf-join-sales');
      await ctx.emit({
        type: 'first-join',
        payload: {
          nodeId: current.joinIds[0] as string,
          detail: joinDetail(plan, current.joinIds[0] as string),
          middleOrderIds: middleIds,
          middleCount: current.middle,
        },
      });
      showMetric('middle-rows', current.middle);
      if (!(await rctx.sleep(data.stepMs))) return;

      // 걸음 2 — 둘째 조인
      if (ctx.cancelled) return;
      const projectCols = plan.columns;
      if (!projectCols) throw new Error('optimizer: 계획 뿌리가 Project 가 아니다');
      const finalRows = current.result.map((row, i) => {
        const cells = projectCols.map((c) => String(cellOf(row, c)));
        const src = (current.joinRows[1] as Row[])[i];
        if (!src) throw new Error('optimizer: 끝 줄과 조인 줄 수가 다르다');
        return { key: String(cellOf(src, data.middleLabelColumn)), cells };
      });
      if (orderId === 'customers-first') await phase('cf-join-sales');
      else await phase('sf-join-customers');
      await ctx.emit({
        type: 'second-join',
        payload: {
          nodeId: current.joinIds[1] as string,
          detail: joinDetail(plan, current.joinIds[1] as string),
          finalRows,
          finalCount: current.final,
          madeCount: current.made,
        },
      });
      showMetric('final-rows', current.final);
      showMetric('made-rows', current.made);
      if (!(await rctx.sleep(data.stepMs))) return;

      // 걸음 3 — 견줌
      if (ctx.cancelled) return;
      const made = runs.map((r) => r.made);
      await phase('compare-orders');
      await ctx.emit({
        type: 'compare',
        payload: { made, orderIds: data.joinOrders, cheaper: cheaperOrder(made), current: order },
      });

      // 손잡이 기다리기
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) continue;
        const payload = p as Record<string, unknown>;
        if (input.type === 'filteredCustomers') {
          const v = readValue(payload.value, data.filteredLadder);
          if (v === null) continue;
          k = v;
          const other = readOther(payload.joinOrder, data.orderLadder);
          if (other !== null) order = other;
          break;
        }
        if (input.type === 'joinOrder') {
          const v = readValue(payload.value, data.orderLadder);
          if (v === null) continue;
          order = v;
          const other = readOther(payload.filteredCustomers, data.filteredLadder);
          if (other !== null) k = other;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
