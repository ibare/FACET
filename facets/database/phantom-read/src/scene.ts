/**
 * phantom-read 장면 — 알고리즘의 이벤트를 잇기만 한다. 셈(결과 · 잠금 · 끼어든 줄)은
 * 알고리즘이 payload 로 보낸다.
 *
 * 바탕   table 의 처음 줄 · 문장 차례 · 트랜잭션 목록 · 자리 수 (initial 이 initialData 에서 베낀다)
 * 자취   table (넣은 줄 · 커밋 여부) · locks · results
 * 이번   step · stmt
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type PhantomRow = { id: number; amount: number; pendingBy: string | null };
export type PhantomLock = { id: number; txn: string; mode: 'S' | 'X' };
export type PhantomResult = {
  txn: string;
  ordinal: number;
  rows: [number, number][];
  kept: number[];
  added: number[];
};

export type PhantomStep =
  | { kind: 'start' }
  | { kind: 'query'; result: number; locked: number[] }
  | { kind: 'insert'; id: number; matches: boolean }
  | { kind: 'commit'; released: number[] };

export type PhantomReadScene = {
  /** 바탕 */
  tableName: string;
  columns: [string, string];
  isolation: string;
  schedule: { txn: string; sql: string }[];
  txns: string[];
  /** 표 줄 자리 수 — 처음 줄 + INSERT 문장 수. 세로가 걸음마다 바뀌지 않게 */
  slots: number;
  /** 결과 칸 수 — SELECT 문장 수 */
  queries: number;
  /** 자취 */
  table: PhantomRow[];
  locks: PhantomLock[];
  results: PhantomResult[];
  /** 이번 걸음 */
  stmt: number;
  step: PhantomStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function numArray(v: unknown, what: string): number[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number')) {
    throw new Error(`phantom-read 장면: ${what} 는 수 배열이어야 한다`);
  }
  return [...(v as number[])];
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number') throw new Error(`phantom-read 장면: ${what} 는 수여야 한다`);
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`phantom-read 장면: ${what} 는 글자여야 한다`);
  return v;
}

function pairs(v: unknown, what: string): [number, number][] {
  if (!Array.isArray(v)) throw new Error(`phantom-read 장면: ${what} 는 배열이어야 한다`);
  return v.map((r) => {
    if (!Array.isArray(r) || r.length !== 2 || typeof r[0] !== 'number' || typeof r[1] !== 'number') {
      throw new Error(`phantom-read 장면: ${what} 의 줄은 [수, 수] 여야 한다`);
    }
    return [r[0], r[1]];
  });
}

function empty(): PhantomReadScene {
  return {
    tableName: '',
    columns: ['', ''],
    isolation: '',
    schedule: [],
    txns: [],
    slots: 0,
    queries: 0,
    table: [],
    locks: [],
    results: [],
    stmt: -1,
    step: { kind: 'start' },
  };
}

export const phantomReadScene: ScenePlan<PhantomReadScene> = {
  initial(initialData: unknown): PhantomReadScene {
    if (!isRecord(initialData) || !Array.isArray(initialData.rows) || !Array.isArray(initialData.schedule)) {
      return empty();
    }
    const cols = initialData.columns;
    if (!Array.isArray(cols) || cols.length !== 2) return empty();
    const schedule = initialData.schedule.map((s, i) => {
      if (!isRecord(s)) throw new Error(`phantom-read 장면: 문장 ${i + 1} 의 모양이 틀렸다`);
      return { txn: str(s.txn, 'txn'), sql: str(s.sql, 'sql') };
    });
    const rows = pairs(initialData.rows, 'rows');
    const txns = schedule.map((s) => s.txn).filter((t, i, all) => all.indexOf(t) === i);
    return {
      tableName: str(initialData.table, 'table'),
      columns: [str(cols[0], 'columns'), str(cols[1], 'columns')],
      isolation: str(initialData.isolation, 'isolation'),
      schedule,
      txns,
      slots: rows.length + schedule.filter((s) => s.sql.startsWith('INSERT ')).length,
      queries: schedule.filter((s) => s.sql.startsWith('SELECT ')).length,
      table: rows.map(([id, amount]) => ({ id, amount, pendingBy: null })),
      locks: [],
      results: [],
      stmt: -1,
      step: { kind: 'start' },
    };
  },

  reduce(scene: PhantomReadScene, event: FacetRuntimeEvent): PhantomReadScene {
    const p = event.payload;
    if (!isRecord(p)) return scene;
    if (event.type === 'query') {
      const txn = str(p.txn, 'txn');
      const rows = pairs(p.rows, 'rows');
      const locked = numArray(p.locked, 'locked');
      const result: PhantomResult = {
        txn,
        ordinal: num(p.ordinal, 'ordinal'),
        rows,
        kept: numArray(p.kept, 'kept'),
        added: numArray(p.added, 'added'),
      };
      return {
        ...scene,
        locks: [...scene.locks, ...locked.map((id) => ({ id, txn, mode: 'S' as const }))],
        results: [...scene.results, result],
        stmt: num(p.stmt, 'stmt'),
        step: { kind: 'query', result: scene.results.length, locked },
      };
    }
    if (event.type === 'insert') {
      const txn = str(p.txn, 'txn');
      const id = num(p.id, 'id');
      if (typeof p.matches !== 'boolean') throw new Error('phantom-read 장면: matches 는 참거짓이어야 한다');
      return {
        ...scene,
        table: [...scene.table, { id, amount: num(p.amount, 'amount'), pendingBy: txn }],
        locks: [...scene.locks, { id, txn, mode: 'X' }],
        stmt: num(p.stmt, 'stmt'),
        step: { kind: 'insert', id, matches: p.matches },
      };
    }
    if (event.type === 'commit') {
      const txn = str(p.txn, 'txn');
      const released = numArray(p.released, 'released');
      return {
        ...scene,
        table: scene.table.map((r) => (r.pendingBy === txn ? { ...r, pendingBy: null } : r)),
        locks: scene.locks.filter((l) => !(l.txn === txn && l.mode === 'X' && released.includes(l.id))),
        stmt: num(p.stmt, 'stmt'),
        step: { kind: 'commit', released },
      };
    }
    return scene;
  },
};
