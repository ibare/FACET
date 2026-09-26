/**
 * reorder-joins 장면.
 *
 * 바탕 — SQL 줄 · 표(이름과 줄의 칸) · 차례(잇는 표 셋). initial() 이 initialData 에서 베낀다.
 * 자취 — 차례마다 중간 결과 · 끝 결과의 줄, 만든 줄 수, 답. join · compare 이벤트가 쌓는다.
 * 이번 걸음 — step.
 *
 * 셈(조인 · 만든 줄 · 답)은 알고리즘이 했다. 장면은 이벤트를 이을 뿐이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneValue = string | number;

export type SceneRow = {
  values: SceneValue[];
  /** 왼쪽 줄의 자리 — stage 1 은 첫 표의 줄, stage 2 는 중간 결과의 줄 */
  from: number;
  /** 오른쪽 표의 줄 자리 */
  with: number;
};

export type SceneTable = { name: string; rows: SceneValue[][] };

export type SceneLane = {
  id: string;
  /** 잇는 차례 — 표 이름 셋 */
  tables: [string, string, string];
  mid: SceneRow[] | null;
  end: SceneRow[] | null;
  made: number | null;
};

export type ReorderJoinsStep =
  | { kind: 'start' }
  | { kind: 'join'; lane: number; stage: 1 | 2 }
  | { kind: 'compare' };

export type ReorderJoinsScene = {
  sql: string[];
  tables: SceneTable[];
  lanes: SceneLane[];
  answer: string[] | null;
  step: ReorderJoinsStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isValue(v: unknown): v is SceneValue {
  return typeof v === 'string' || typeof v === 'number';
}

function readValues(v: unknown, where: string): SceneValue[] {
  if (!Array.isArray(v) || !v.every(isValue)) throw new Error(`reorder-joins 장면: ${where} 의 칸이 글자 · 수가 아니다`);
  return [...v];
}

function readInt(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new Error(`reorder-joins 장면: ${where} 가 0 이상의 정수가 아니다`);
  return v;
}

function readRows(v: unknown): SceneRow[] {
  if (!Array.isArray(v)) throw new Error('reorder-joins 장면: join 의 rows 가 배열이 아니다');
  return v.map((r, i) => {
    if (!isRecord(r)) throw new Error(`reorder-joins 장면: rows[${i}] 가 객체가 아니다`);
    return {
      values: readValues(r.values, `rows[${i}]`),
      from: readInt(r.from, `rows[${i}].from`),
      with: readInt(r.with, `rows[${i}].with`),
    };
  });
}

function initial(initialData: unknown): ReorderJoinsScene {
  if (!isRecord(initialData)) throw new Error('reorder-joins 장면: initialData 가 없다');
  const { sql, tables, orders } = initialData;
  if (!Array.isArray(sql) || !sql.every((l) => typeof l === 'string')) throw new Error('reorder-joins 장면: sql 이 글자 줄이 아니다');
  if (!Array.isArray(tables)) throw new Error('reorder-joins 장면: tables 가 배열이 아니다');
  if (!Array.isArray(orders)) throw new Error('reorder-joins 장면: orders 가 배열이 아니다');

  const sceneTables: SceneTable[] = tables.map((tb, i) => {
    if (!isRecord(tb) || typeof tb.name !== 'string' || !Array.isArray(tb.rows)) {
      throw new Error(`reorder-joins 장면: tables[${i}] 의 모양이 틀렸다`);
    }
    const name = tb.name;
    return { name, rows: tb.rows.map((r, j) => readValues(r, `${name}[${j}]`)) };
  });

  const lanes: SceneLane[] = orders.map((o, i) => {
    if (!isRecord(o) || typeof o.id !== 'string' || !Array.isArray(o.tables)) {
      throw new Error(`reorder-joins 장면: orders[${i}] 의 모양이 틀렸다`);
    }
    const names = o.tables;
    if (names.length !== 3 || !names.every((n): n is string => typeof n === 'string')) {
      throw new Error(`reorder-joins 장면: orders[${i}] 는 표 이름 셋이어야 한다`);
    }
    for (const n of names) {
      if (!sceneTables.some((tb) => tb.name === n)) throw new Error(`reorder-joins 장면: 표 '${n}' 가 없다`);
    }
    return { id: o.id, tables: [names[0]!, names[1]!, names[2]!], mid: null, end: null, made: null };
  });

  return { sql: [...sql], tables: sceneTables, lanes, answer: null, step: { kind: 'start' } };
}

function reduce(scene: ReorderJoinsScene, event: FacetRuntimeEvent): ReorderJoinsScene {
  const p = event.payload;
  if (event.type === 'join') {
    if (!isRecord(p)) throw new Error('reorder-joins 장면: join 의 payload 가 없다');
    const lane = readInt(p.lane, 'lane');
    const stage = p.stage;
    if (stage !== 1 && stage !== 2) throw new Error('reorder-joins 장면: stage 는 1 · 2');
    const target = scene.lanes[lane];
    if (!target) throw new Error(`reorder-joins 장면: 차례 ${lane} 이 없다`);
    const rows = readRows(p.rows);
    const lanes = scene.lanes.map((l, i) => {
      if (i !== lane) return l;
      return stage === 1 ? { ...l, mid: rows } : { ...l, end: rows };
    });
    return { ...scene, lanes, step: { kind: 'join', lane, stage } };
  }
  if (event.type === 'compare') {
    if (!isRecord(p)) throw new Error('reorder-joins 장면: compare 의 payload 가 없다');
    const made = p.made;
    const answer = p.answer;
    if (!Array.isArray(made) || made.length !== scene.lanes.length) throw new Error('reorder-joins 장면: made 가 차례 수와 다르다');
    if (!Array.isArray(answer) || !answer.every((a): a is string => typeof a === 'string')) {
      throw new Error('reorder-joins 장면: answer 가 글자 목록이 아니다');
    }
    const lanes = scene.lanes.map((l, i) => ({ ...l, made: readInt(made[i], `made[${i}]`) }));
    return { ...scene, lanes, answer: [...answer], step: { kind: 'compare' } };
  }
  throw new Error(`reorder-joins 장면: 모르는 이벤트 '${event.type}'`);
}

export const reorderJoinsScene: ScenePlan<ReorderJoinsScene> = { initial, reduce };
