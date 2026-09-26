/**
 * all-or-nothing 장면 — 알고리즘의 이벤트를 잇기만 한다. 셈(CHECK · 되돌림 차례 ·
 * 처음 값과 같은 줄 수)은 알고리즘이 하고 payload 로 온다.
 *
 * 바탕: 표(이름 · 열 · CHECK · 줄 차례) 와 본문 SQL.
 * 자취: 줄마다 지금 값 · 본문 줄마다 상태 · 되돌림 기록 칸(되감겼는가).
 * 이번 걸음: step.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type AonTable = {
  name: string;
  keyColumn: string;
  column: string;
  checkOp: '>=';
  checkBound: number;
  keys: string[];
};

export type AonLineState = 'pending' | 'done' | 'rejected' | 'skipped';

export type AonValue = { table: string; key: string; value: number };

export type AonUndoEntry = {
  table: string;
  key: string;
  before: number;
  after: number;
  undone: boolean;
};

export type AonStep =
  | { kind: 'start' }
  | { kind: 'write'; line: number; table: string; key: string; before: number; after: number; entries: number }
  | {
      kind: 'reject';
      line: number;
      table: string;
      key: string;
      before: number;
      attempted: number;
      entries: number;
    }
  | { kind: 'commit'; line: number; entries: number }
  | {
      kind: 'undo';
      slot: number;
      table: string;
      key: string;
      from: number;
      to: number;
      left: number;
      restored: number;
      total: number;
    };

export type AllOrNothingScene = {
  tables: AonTable[];
  body: string[];
  values: AonValue[];
  lines: AonLineState[];
  /** 본문에서 지금 가리키는 줄. 되돌리는 동안은 null. */
  cursor: number | null;
  undo: AonUndoEntry[];
  /** 튕겨 난 문장이 겨눈 줄. 한 번 서면 끝까지 남는다. */
  rejected: { table: string; key: string } | null;
  step: AonStep;
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`all-or-nothing 장면: ${what} 이 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(p: Record<string, unknown>, k: string): number {
  const v = p[k];
  if (typeof v !== 'number') throw new Error(`all-or-nothing 장면: ${k} 가 수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, k: string): string {
  const v = p[k];
  if (typeof v !== 'string') throw new Error(`all-or-nothing 장면: ${k} 가 글자가 아니다`);
  return v;
}

function readTables(raw: unknown): AonTable[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('all-or-nothing 장면: 표가 없다');
  return raw.map((t, i) => {
    const tb = rec(t, `표 ${i}`);
    const check = rec(tb['check'], `표 ${i} 의 check`);
    if (check['op'] !== '>=') throw new Error(`all-or-nothing 장면: 표 ${i} 의 모르는 CHECK 연산`);
    const rows = tb['rows'];
    if (!Array.isArray(rows) || rows.length === 0) throw new Error(`all-or-nothing 장면: 표 ${i} 에 줄이 없다`);
    return {
      name: str(tb, 'name'),
      keyColumn: str(tb, 'keyColumn'),
      column: str(tb, 'column'),
      checkOp: '>=' as const,
      checkBound: num(check, 'bound'),
      keys: rows.map((r, j) => str(rec(r, `표 ${i} 줄 ${j}`), 'key')),
    };
  });
}

function readValues(raw: unknown): AonValue[] {
  if (!Array.isArray(raw)) throw new Error('all-or-nothing 장면: 표가 없다');
  const out: AonValue[] = [];
  for (const t of raw) {
    const tb = rec(t, '표');
    const rows = tb['rows'];
    if (!Array.isArray(rows)) throw new Error('all-or-nothing 장면: 줄이 없다');
    for (const r of rows) {
      const row = rec(r, '줄');
      out.push({ table: str(tb, 'name'), key: str(row, 'key'), value: num(row, 'value') });
    }
  }
  return out;
}

function setValue(values: AonValue[], table: string, key: string, value: number): AonValue[] {
  if (!values.some((v) => v.table === table && v.key === key)) {
    throw new Error(`all-or-nothing 장면: 없는 줄 ${table}.${key}`);
  }
  return values.map((v) => (v.table === table && v.key === key ? { ...v, value } : v));
}

function lineIndex(scene: AllOrNothingScene, line: number): number {
  if (!Number.isInteger(line) || line < 0 || line >= scene.lines.length) {
    throw new Error(`all-or-nothing 장면: 없는 본문 줄 ${line}`);
  }
  return line;
}

export const allOrNothingScene: ScenePlan<AllOrNothingScene> = {
  initial(initialData: unknown): AllOrNothingScene {
    const d = rec(initialData ?? {}, 'initialData');
    const bodyRaw = d['body'];
    const tablesRaw = d['tables'];
    // 자료가 없으면(검사용 빈 마운트) 빈 장면을 둔다.
    if (bodyRaw === undefined && tablesRaw === undefined) {
      return { tables: [], body: [], values: [], lines: [], cursor: null, undo: [], rejected: null, step: { kind: 'start' } };
    }
    if (!Array.isArray(bodyRaw)) throw new Error('all-or-nothing 장면: 본문이 없다');
    const body = bodyRaw.map((s, i) => {
      if (typeof s !== 'string') throw new Error(`all-or-nothing 장면: 본문 줄 ${i} 이 글자가 아니다`);
      return s;
    });
    return {
      tables: readTables(tablesRaw),
      body,
      values: readValues(tablesRaw),
      lines: body.map((): AonLineState => 'pending'),
      cursor: 0,
      undo: [],
      rejected: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: AllOrNothingScene, event: FacetRuntimeEvent): AllOrNothingScene {
    if (event.type === 'write') {
      const p = rec(event.payload, 'write payload');
      const line = lineIndex(scene, num(p, 'line'));
      const table = str(p, 'table');
      const key = str(p, 'key');
      const before = num(p, 'before');
      const after = num(p, 'after');
      return {
        ...scene,
        values: setValue(scene.values, table, key, after),
        lines: scene.lines.map((s, i) => (i === line ? 'done' : s)),
        cursor: line,
        undo: [...scene.undo, { table, key, before, after, undone: false }],
        step: { kind: 'write', line, table, key, before, after, entries: num(p, 'entries') },
      };
    }
    if (event.type === 'reject') {
      const p = rec(event.payload, 'reject payload');
      const line = lineIndex(scene, num(p, 'line'));
      const skippedRaw = p['skipped'];
      if (!Array.isArray(skippedRaw)) throw new Error('all-or-nothing 장면: skipped 가 없다');
      const skipped = skippedRaw.map((s) => {
        if (typeof s !== 'number') throw new Error('all-or-nothing 장면: skipped 줄이 수가 아니다');
        return lineIndex(scene, s);
      });
      const table = str(p, 'table');
      const key = str(p, 'key');
      if (!scene.values.some((v) => v.table === table && v.key === key)) {
        throw new Error(`all-or-nothing 장면: 없는 줄 ${table}.${key}`);
      }
      return {
        ...scene,
        lines: scene.lines.map((s, i) => (i === line ? 'rejected' : skipped.includes(i) ? 'skipped' : s)),
        cursor: line,
        rejected: { table, key },
        step: {
          kind: 'reject',
          line,
          table,
          key,
          before: num(p, 'before'),
          attempted: num(p, 'attempted'),
          entries: num(p, 'entries'),
        },
      };
    }
    if (event.type === 'commit') {
      const p = rec(event.payload, 'commit payload');
      const line = lineIndex(scene, num(p, 'line'));
      return {
        ...scene,
        lines: scene.lines.map((s, i) => (i === line ? 'done' : s)),
        cursor: line,
        step: { kind: 'commit', line, entries: num(p, 'entries') },
      };
    }
    if (event.type === 'undo') {
      const p = rec(event.payload, 'undo payload');
      const slot = num(p, 'slot');
      const index = slot - 1;
      const entry = scene.undo[index];
      if (entry === undefined) throw new Error(`all-or-nothing 장면: 없는 되돌림 칸 ${slot}`);
      const table = str(p, 'table');
      const key = str(p, 'key');
      const to = num(p, 'to');
      return {
        ...scene,
        values: setValue(scene.values, table, key, to),
        cursor: null,
        undo: scene.undo.map((u, i) => (i === index ? { ...u, undone: true } : u)),
        step: {
          kind: 'undo',
          slot,
          table,
          key,
          from: num(p, 'from'),
          to,
          left: num(p, 'left'),
          restored: num(p, 'restored'),
          total: num(p, 'total'),
        },
      };
    }
    throw new Error(`all-or-nothing 장면: 모르는 이벤트 ${event.type}`);
  },
};
