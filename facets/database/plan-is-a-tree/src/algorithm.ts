/**
 * plan-is-a-tree — 실행 계획은 어떤 차례로 줄을 만들어 내는가.
 *
 * 표 · 줄 · 계획은 예로 정한 작은 자료다. 실제 데이터베이스가 낸 EXPLAIN 이 아니다.
 *
 * 규약 (사양 그대로):
 *   - 끌어올리기(반복자) 모형 — 위가 "다음 줄" 을 청하면 아래가 한 줄을 내어 준다.
 *   - Hash Join 은 짓는 쪽(build)을 끝까지 먼저 끌어와 해시표에 담은 뒤에야
 *     찔러보는 쪽(probe)에서 첫 줄을 청한다.
 *   - 표 읽기는 id 차례(자료에 적힌 차례). 짝 찾기는 조인 조건의 두 열이 같은 값.
 *   - 걸음 = 한 줄의 여정 — 잎(Seq Scan)에서 나와 멈출 때까지
 *     (해시표에 담김 · 조건에 걸려 멈춤 · 답에 닿음). 한 걸음 안에서 여러 연산자를 지날 수 있다.
 *   - 걸음 0 은 계획과 표만 — 장면의 initial() 이 initialData 에서 세운다.
 *
 * 계획 나무를 실제로 끌어올리며 돌려 여정을 모으고, 그 차례대로 발신한다.
 * 걸음표는 손으로 적지 않는다 — 반복자가 내는 사건의 차례다.
 *
 * 이벤트 (silent 없음, 하나뿐):
 *   journey — 한 줄의 여정
 *     payload: {
 *       table: string            잎에서 읽힌 표 이름
 *       row:   number            그 표의 줄 번호 (0 부터)
 *       path:  string[]          지난 연산자 id — 잎부터 멈춘 자리까지 (멈춘 자리 포함)
 *       end:   'stored' | 'stopped' | 'answer'
 *       match: { table: string; row: number } | null   조인에서 짝지은 짓는 쪽 줄 (answer 일 때)
 *       out:   (string | number)[] | null              Project 가 내놓은 칸 (answer 일 때)
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Cell = string | number;

export type TableData = {
  cols: string[];
  rows: Cell[][];
};

export type Compare = '>' | '<' | '>=' | '<=' | '=';

export type PlanNode =
  | { op: 'Seq Scan'; table: string; alias: string }
  | { op: 'Filter'; cond: { col: string; cmp: Compare; value: number }; input: PlanNode }
  | { op: 'Hash Join'; on: { left: string; right: string }; build: PlanNode; probe: PlanNode }
  | { op: 'Project'; cols: string[]; input: PlanNode };

export type PlanIsATreeFacetData = {
  type: 'plan-is-a-tree';
  stepMs: number;
  sql: string[];
  tables: Record<string, TableData>;
  plan: PlanNode;
};

// ───────────── 자료 좁히기 (장면도 같은 것을 쓴다) ─────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readStrings(v: unknown, where: string): string[] {
  if (!Array.isArray(v) || !v.every((s) => typeof s === 'string')) {
    throw new Error(`plan-is-a-tree: ${where} 는 문자열 배열이어야 한다`);
  }
  return [...v];
}

function readCompare(v: unknown): Compare {
  if (v === '>' || v === '<' || v === '>=' || v === '<=' || v === '=') return v;
  throw new Error(`plan-is-a-tree: 모르는 비교 ${String(v)}`);
}

function readPlan(v: unknown): PlanNode {
  if (!isRecord(v)) throw new Error('plan-is-a-tree: 계획 노드가 객체가 아니다');
  const op = v['op'];
  if (op === 'Seq Scan') {
    const table = v['table'];
    const alias = v['alias'];
    if (typeof table !== 'string' || typeof alias !== 'string') {
      throw new Error('plan-is-a-tree: Seq Scan 에 table · alias 가 없다');
    }
    return { op, table, alias };
  }
  if (op === 'Filter') {
    const cond = v['cond'];
    if (!isRecord(cond) || typeof cond['col'] !== 'string' || typeof cond['value'] !== 'number') {
      throw new Error('plan-is-a-tree: Filter 조건이 col · cmp · value 모양이 아니다');
    }
    return {
      op,
      cond: { col: cond['col'], cmp: readCompare(cond['cmp']), value: cond['value'] },
      input: readPlan(v['input']),
    };
  }
  if (op === 'Hash Join') {
    const on = v['on'];
    if (!isRecord(on) || typeof on['left'] !== 'string' || typeof on['right'] !== 'string') {
      throw new Error('plan-is-a-tree: Hash Join 조건이 left · right 모양이 아니다');
    }
    return {
      op,
      on: { left: on['left'], right: on['right'] },
      build: readPlan(v['build']),
      probe: readPlan(v['probe']),
    };
  }
  if (op === 'Project') {
    return { op, cols: readStrings(v['cols'], 'Project.cols'), input: readPlan(v['input']) };
  }
  throw new Error(`plan-is-a-tree: 모르는 연산자 ${String(op)}`);
}

function readTable(v: unknown, name: string): TableData {
  if (!isRecord(v)) throw new Error(`plan-is-a-tree: 표 ${name} 가 객체가 아니다`);
  const cols = readStrings(v['cols'], `${name}.cols`);
  const rows = v['rows'];
  if (!Array.isArray(rows)) throw new Error(`plan-is-a-tree: 표 ${name} 에 rows 가 없다`);
  return {
    cols,
    rows: rows.map((r, i) => {
      if (
        !Array.isArray(r) ||
        r.length !== cols.length ||
        !r.every((c) => typeof c === 'string' || typeof c === 'number')
      ) {
        throw new Error(`plan-is-a-tree: 표 ${name} 의 줄 ${i} 가 열 수와 맞지 않는다`);
      }
      return [...(r as Cell[])];
    }),
  };
}

/** initialData 를 좁혀 베낀다. 모르는 모양은 던진다. */
export function readPlanData(v: unknown): PlanIsATreeFacetData {
  if (!isRecord(v)) throw new Error('plan-is-a-tree: initialData 가 없다');
  const stepMs = v['stepMs'];
  if (typeof stepMs !== 'number') throw new Error('plan-is-a-tree: stepMs 가 없다');
  const tablesRaw = v['tables'];
  if (!isRecord(tablesRaw)) throw new Error('plan-is-a-tree: tables 가 없다');
  const tables: Record<string, TableData> = {};
  for (const name of Object.keys(tablesRaw)) tables[name] = readTable(tablesRaw[name], name);
  return {
    type: 'plan-is-a-tree',
    stepMs,
    sql: readStrings(v['sql'], 'sql'),
    tables,
    plan: readPlan(v['plan']),
  };
}

// ───────────── 계획을 판판하게 — 노드 id 규약 ─────────────

/** 판판한 노드. id 는 뿌리 'n' 에서 자식 차례로 '.0' · '.1' 을 붙인다 (Hash Join 은 build 가 0, probe 가 1). */
export type FlatNode = {
  id: string;
  op: PlanNode['op'];
  depth: number;
  children: string[];
  node: PlanNode;
};

export function childrenOf(node: PlanNode): PlanNode[] {
  if (node.op === 'Seq Scan') return [];
  if (node.op === 'Hash Join') return [node.build, node.probe];
  return [node.input];
}

export function flattenPlan(plan: PlanNode): FlatNode[] {
  const out: FlatNode[] = [];
  const visit = (node: PlanNode, id: string, depth: number): void => {
    const kids = childrenOf(node);
    out.push({ id, op: node.op, depth, children: kids.map((_, i) => `${id}.${i}`), node });
    kids.forEach((k, i) => visit(k, `${id}.${i}`, depth + 1));
  };
  visit(plan, 'n', 0);
  return out;
}

// ───────────── 끌어올리기 ─────────────

export type JourneyEnd = 'stored' | 'stopped' | 'answer';

export type Journey = {
  table: string;
  row: number;
  path: string[];
  end: JourneyEnd;
  match: { table: string; row: number } | null;
  out: Cell[] | null;
};

/** 흐르는 줄 — 칸은 'alias.col' 로 찾는다. 여정의 출처와 지나온 자리를 함께 진다. */
type Tuple = {
  values: Map<string, Cell>;
  origin: { table: string; row: number };
  path: string[];
  match: { table: string; row: number } | null;
};

function aliasesOf(node: PlanNode): Set<string> {
  if (node.op === 'Seq Scan') return new Set([node.alias]);
  const all = new Set<string>();
  for (const k of childrenOf(node)) for (const a of aliasesOf(k)) all.add(a);
  return all;
}

function lookup(t: Tuple, ref: string, where: string): Cell {
  const v = t.values.get(ref);
  if (v === undefined) throw new Error(`plan-is-a-tree: ${where} 의 ${ref} 를 줄에서 찾을 수 없다`);
  return v;
}

function holds(v: Cell, cmp: Compare, bound: number, where: string): boolean {
  if (typeof v !== 'number') throw new Error(`plan-is-a-tree: ${where} 는 수끼리만 견준다 (${String(v)})`);
  if (cmp === '>') return v > bound;
  if (cmp === '<') return v < bound;
  if (cmp === '>=') return v >= bound;
  if (cmp === '<=') return v <= bound;
  return v === bound;
}

/**
 * 계획을 끝까지 끌어올려 여정을 사건 차례대로 모은다.
 * 멈춤(해시표에 담김 · 조건에 걸림)은 그 자리에서, 답은 뿌리가 내놓을 때 기록한다.
 */
export function runPlan(data: PlanIsATreeFacetData): Journey[] {
  const journeys: Journey[] = [];

  function* pull(node: PlanNode, id: string): Generator<Tuple> {
    if (node.op === 'Seq Scan') {
      const table = data.tables[node.table];
      if (!table) throw new Error(`plan-is-a-tree: 표 ${node.table} 가 자료에 없다`);
      for (let r = 0; r < table.rows.length; r += 1) {
        const row = table.rows[r]!;
        const values = new Map<string, Cell>();
        table.cols.forEach((c, i) => values.set(`${node.alias}.${c}`, row[i]!));
        yield { values, origin: { table: node.table, row: r }, path: [id], match: null };
      }
      return;
    }
    if (node.op === 'Filter') {
      for (const t of pull(node.input, `${id}.0`)) {
        const v = lookup(t, node.cond.col, 'Filter');
        const path = [...t.path, id];
        if (holds(v, node.cond.cmp, node.cond.value, 'Filter')) {
          yield { ...t, path };
        } else {
          journeys.push({ ...t.origin, path, end: 'stopped', match: null, out: null });
        }
      }
      return;
    }
    if (node.op === 'Hash Join') {
      const buildAliases = aliasesOf(node.build);
      const leftIsBuild = buildAliases.has(node.on.left.split('.')[0]!);
      const rightIsBuild = buildAliases.has(node.on.right.split('.')[0]!);
      if (leftIsBuild === rightIsBuild) {
        throw new Error('plan-is-a-tree: Hash Join 조건의 두 열이 양쪽에 하나씩 있지 않다');
      }
      const buildRef = leftIsBuild ? node.on.left : node.on.right;
      const probeRef = leftIsBuild ? node.on.right : node.on.left;

      // 짓기 — 짓는 쪽을 끝까지 먼저 끌어온다
      const hash = new Map<Cell, Tuple[]>();
      for (const b of pull(node.build, `${id}.0`)) {
        const key = lookup(b, buildRef, 'Hash Join');
        const bucket = hash.get(key) ?? [];
        bucket.push(b);
        hash.set(key, bucket);
        journeys.push({ ...b.origin, path: [...b.path, id], end: 'stored', match: null, out: null });
      }
      // 찔러보기 — 한 줄씩 흘려 올린다
      for (const p of pull(node.probe, `${id}.1`)) {
        const path = [...p.path, id];
        const bucket = hash.get(lookup(p, probeRef, 'Hash Join'));
        if (!bucket) {
          journeys.push({ ...p.origin, path, end: 'stopped', match: null, out: null });
          continue;
        }
        for (const b of bucket) {
          const values = new Map(p.values);
          for (const [k, v] of b.values) values.set(k, v);
          yield { values, origin: p.origin, path, match: b.origin };
        }
      }
      return;
    }
    for (const t of pull(node.input, `${id}.0`)) {
      const out = node.cols.map((c) => lookup(t, c, 'Project'));
      journeys.push({ ...t.origin, path: [...t.path, id], end: 'answer', match: t.match, out });
      yield t;
    }
  }

  // 뿌리가 "다음 줄" 을 더 내놓지 않을 때까지 청한다
  for (const _ of pull(data.plan, 'n')) void _;
  return journeys;
}

export async function planIsATree(ctx: FacetContext<PlanIsATreeFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<PlanIsATreeFacetData>;
  const data = readPlanData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 걸음 0 은 이미 계획과 표를 보인다 — 첫 발신 앞에도 읽을 틈을 둔다
  for (const j of runPlan(data)) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'journey',
      payload: { table: j.table, row: j.row, path: j.path, end: j.end, match: j.match, out: j.out },
    });
  }
}
