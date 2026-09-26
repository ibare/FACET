/**
 * 줄은 사실이다 — 장면.
 *
 * 바탕: 표 이름 · 열 · 줄 · 물음 (initialData 에서 베낀다).
 * 자취: 틀이 섰는가 · 사실이 된 줄 번호들 · 던진 물음과 그 답.
 * 이번 걸음: `step` — 무엇이 막 일어났는가.
 *
 * 맞는 줄 셈은 알고리즘이 한다. 장면은 이벤트가 실어 온 것을 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type RowIsAFactAsked = {
  query: number;
  matches: number[];
  hits: number[][];
};

export type RowIsAFactStep =
  | { kind: 'start' }
  | { kind: 'frame' }
  | { kind: 'fact'; row: number }
  | { kind: 'ask'; query: number };

export type RowIsAFactScene = {
  table: string;
  columns: string[];
  rows: string[][];
  queries: string[][];
  framed: boolean;
  facts: number[];
  asked: RowIsAFactAsked[];
  step: RowIsAFactStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function strings(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`row-is-a-fact: ${what} 이 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'string') throw new Error(`row-is-a-fact: ${what}[${i}] 이 글자가 아니다`);
    return x;
  });
}

function table(v: unknown, what: string): string[][] {
  if (!Array.isArray(v)) throw new Error(`row-is-a-fact: ${what} 이 배열이 아니다`);
  return v.map((r, i) => strings(r, `${what}[${i}]`));
}

function indexes(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`row-is-a-fact: ${what} 이 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) {
      throw new Error(`row-is-a-fact: ${what}[${i}] 이 정수가 아니다`);
    }
    return x;
  });
}

function index(v: unknown, what: string, size: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= size) {
    throw new Error(`row-is-a-fact: ${what} 이 범위 밖이다`);
  }
  return v;
}

export const rowIsAFactScene: ScenePlan<RowIsAFactScene> = {
  initial(initialData: unknown): RowIsAFactScene {
    if (!isRecord(initialData)) throw new Error('row-is-a-fact: initialData 가 없다');
    if (typeof initialData.table !== 'string') throw new Error('row-is-a-fact: table 이 글자가 아니다');
    return {
      table: initialData.table,
      columns: strings(initialData.columns, 'columns'),
      rows: table(initialData.rows, 'rows'),
      queries: table(initialData.queries, 'queries'),
      framed: false,
      facts: [],
      asked: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: RowIsAFactScene, event: FacetRuntimeEvent): RowIsAFactScene {
    const p: unknown = event.payload;
    switch (event.type) {
      case 'frame':
        return { ...scene, framed: true, step: { kind: 'frame' } };
      case 'fact': {
        if (!isRecord(p)) throw new Error('row-is-a-fact: fact 의 payload 가 없다');
        const row = index(p.row, 'fact.row', scene.rows.length);
        return { ...scene, facts: [...scene.facts, row], step: { kind: 'fact', row } };
      }
      case 'ask': {
        if (!isRecord(p)) throw new Error('row-is-a-fact: ask 의 payload 가 없다');
        const query = index(p.query, 'ask.query', scene.queries.length);
        const matches = indexes(p.matches, 'ask.matches');
        if (!Array.isArray(p.hits)) throw new Error('row-is-a-fact: ask.hits 가 배열이 아니다');
        const hits = p.hits.map((h: unknown, c: number) => indexes(h, `ask.hits[${c}]`));
        return {
          ...scene,
          asked: [...scene.asked, { query, matches, hits }],
          step: { kind: 'ask', query },
        };
      }
      default:
        throw new Error(`row-is-a-fact: 모르는 이벤트 ${event.type}`);
    }
  },
};
