/**
 * 같은 답, 다른 길 — 장면.
 *
 * 바탕: SQL 줄 · 표 이름 · 조건식 · 길마다 연산 차례 (initialData 에서 베낀다)
 * 자취: 길마다 가운데 줄 · 답의 줄 · 연산마다 검사 수, 그리고 포갠 결과
 * 이번 걸음: 어느 길의 어느 연산인가, 또는 포개기
 *
 * 셈(잇기 · 거르기 · 견주기)은 알고리즘이 한다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type Cell = string | number;
export type Op = 'join' | 'filter';

/** 가운데 줄 — 첫 연산이 내놓은 줄. 거르기에서 떨어졌으면 dropped */
export type MiddleRow = { cells: Cell[]; dropped: boolean };
/** 답의 줄 — from 은 가운데 줄에서 내려왔으면 그 차례, 연산 상자에서 나왔으면 null */
export type AnswerRow = { cells: Cell[]; from: number | null };

export type LaneScene = {
  id: string;
  ops: Op[];
  /** 연산마다 검사 수. 아직 돌지 않았으면 null */
  checks: (number | null)[];
  /** 길의 검사 합 — 알고리즘이 센 값. 길이 끝나기 전이면 null */
  total: number | null;
  middle: MiddleRow[];
  answer: AnswerRow[];
};

export type SameAnswerDifferentPlanScene = {
  sql: string[];
  ordersTable: string;
  customersTable: string;
  joinOn: string;
  where: string;
  lanes: LaneScene[];
  /** 두 답을 같은 자리끼리 견준 결과. 포개기 전이면 null */
  same: boolean[] | null;
  step:
    | { kind: 'start' }
    | { kind: 'op'; lane: number; level: number; op: Op }
    | { kind: 'overlay' };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function need<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`장면: ${what} 가 없다`);
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`장면: ${what} 는 글자여야 한다`);
  return v;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`장면: ${what} 는 수여야 한다`);
  return v;
}

function cellsOf(v: unknown, what: string): Cell[] {
  if (!Array.isArray(v)) throw new Error(`장면: ${what} 는 칸 배열이어야 한다`);
  return v.map((c, i) => {
    if (typeof c === 'string' || typeof c === 'number') return c;
    throw new Error(`장면: ${what}[${i}] 는 글자나 수여야 한다`);
  });
}

function rowsOf(v: unknown, what: string): Cell[][] {
  if (!Array.isArray(v)) throw new Error(`장면: ${what} 는 줄 배열이어야 한다`);
  return v.map((r, i) => cellsOf(r, `${what}[${i}]`));
}

function numsOf(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`장면: ${what} 는 수 배열이어야 한다`);
  return v.map((n, i) => num(n, `${what}[${i}]`));
}

function opOf(v: unknown, what: string): Op {
  if (v === 'join' || v === 'filter') return v;
  throw new Error(`장면: ${what} 는 모르는 연산이다: ${String(v)}`);
}

function withLane(scene: SameAnswerDifferentPlanScene, index: number, lane: LaneScene): LaneScene[] {
  return scene.lanes.map((l, i) => (i === index ? lane : l));
}

export const sameAnswerDifferentPlanScene: ScenePlan<SameAnswerDifferentPlanScene> = {
  initial(initialData: unknown): SameAnswerDifferentPlanScene {
    if (!isRecord(initialData)) throw new Error('장면: initialData 가 객체가 아니다');
    const sql = initialData['sql'];
    if (!Array.isArray(sql)) throw new Error('장면: sql 은 줄 배열이어야 한다');
    const orders = initialData['orders'];
    const customers = initialData['customers'];
    const where = initialData['where'];
    const paths = initialData['paths'];
    if (!isRecord(orders) || !isRecord(customers) || !isRecord(where)) throw new Error('장면: 표 · 조건이 없다');
    if (!Array.isArray(paths)) throw new Error('장면: paths 가 배열이 아니다');
    return {
      sql: sql.map((l, i) => str(l, `sql[${i}]`)),
      ordersTable: str(orders['table'], 'orders.table'),
      customersTable: str(customers['table'], 'customers.table'),
      joinOn: str(initialData['joinOn'], 'joinOn'),
      where: str(where['text'], 'where.text'),
      lanes: paths.map((p, i) => {
        if (!isRecord(p)) throw new Error(`장면: paths[${i}] 가 객체가 아니다`);
        const ops = p['ops'];
        if (!Array.isArray(ops)) throw new Error(`장면: paths[${i}].ops 가 배열이 아니다`);
        return {
          id: str(p['id'], `paths[${i}].id`),
          ops: ops.map((o, j) => opOf(o, `paths[${i}].ops[${j}]`)),
          checks: ops.map(() => null),
          total: null,
          middle: [],
          answer: [],
        };
      }),
      same: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: SameAnswerDifferentPlanScene, event: FacetRuntimeEvent): SameAnswerDifferentPlanScene {
    if (event.type === 'join' || event.type === 'filter') {
      const p = event.payload;
      if (!isRecord(p)) throw new Error(`장면: ${event.type} 의 payload 가 없다`);
      const laneIx = num(p['path'], 'path');
      const level = num(p['level'], 'level');
      const checks = num(p['checks'], 'checks');
      const rawTotal = p['total'];
      const total = rawTotal === null ? null : num(rawTotal, 'total');
      const lane = need(scene.lanes[laneIx], `길 ${laneIx}`);
      const op = need(lane.ops[level], `길 ${laneIx} 의 연산 ${level}`);
      if (op !== event.type) throw new Error(`장면: 길 ${laneIx} 의 연산 ${level} 는 ${op} 인데 ${event.type} 가 왔다`);
      const last = level === lane.ops.length - 1;
      const rows = rowsOf(p['rows'], 'rows');
      const nextChecks = lane.checks.map((c, i) => (i === level ? checks : c));
      let middle = lane.middle;
      let answer = lane.answer;
      if (event.type === 'join') {
        if (last) answer = rows.map((cells) => ({ cells, from: null }));
        else middle = rows.map((cells) => ({ cells, dropped: false }));
      } else {
        const input = rowsOf(p['input'], 'input');
        const kept = new Set(numsOf(p['kept'], 'kept'));
        middle = input.map((cells, i) => ({ cells, dropped: !kept.has(i) }));
        if (last) {
          const keptOrder = [...kept];
          if (keptOrder.length !== rows.length) throw new Error('장면: 살아남은 줄과 답의 줄 수가 다르다');
          answer = rows.map((cells, i) => ({ cells, from: need(keptOrder[i], `kept[${i}]`) }));
        }
      }
      return {
        ...scene,
        lanes: withLane(scene, laneIx, { ...lane, checks: nextChecks, total: total ?? lane.total, middle, answer }),
        step: { kind: 'op', lane: laneIx, level, op },
      };
    }
    if (event.type === 'overlay') {
      const p = event.payload;
      if (!isRecord(p)) throw new Error('장면: overlay 의 payload 가 없다');
      const same = p['same'];
      if (!Array.isArray(same)) throw new Error('장면: same 이 배열이 아니다');
      const totals = numsOf(p['totals'], 'totals');
      if (totals.length !== scene.lanes.length) throw new Error('장면: totals 의 수가 길의 수와 다르다');
      return {
        ...scene,
        lanes: scene.lanes.map((l, i) => ({ ...l, total: need(totals[i], `totals[${i}]`) })),
        same: same.map((s, i) => {
          if (typeof s !== 'boolean') throw new Error(`장면: same[${i}] 가 참거짓이 아니다`);
          return s;
        }),
        step: { kind: 'overlay' },
      };
    }
    return scene;
  },
};
