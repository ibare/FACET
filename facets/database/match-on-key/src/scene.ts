/**
 * match-on-key 장면.
 *
 * 바탕  두 표 · SQL 줄 · 열 번호 — `initial()` 이 initialData 에서 베낀다
 * 자취  결과 줄 — `match` 가 하나씩 쌓는다 (어느 두 줄에서 왔는지와 두 칸의 값)
 * 이번 걸음  `step` — 방금 짝지은 두 줄과 셈한 수
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readMatchOnKeyData, resolveColumns } from './algorithm.js';
import type { ResolvedColumns, TableData } from './algorithm.js';

export type ResultRow = { left: number; right: number; values: [string, string] };

export type MatchStep = {
  kind: 'match';
  left: number;
  right: number;
  key: string;
  total: number;
  copies: number;
};

export type MatchOnKeyScene = {
  base: {
    sql: string[];
    left: TableData;
    right: TableData;
    cols: ResolvedColumns;
    /** 결과 표의 두 열 이름 — SELECT 가 고른 열 */
    heads: [string, string];
  };
  results: ResultRow[];
  step: MatchStep | null;
};

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`match-on-key 장면: ${what} 가 정수가 아니다`);
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`match-on-key 장면: ${what} 가 글자가 아니다`);
  return v;
}

export const matchOnKeyScene: ScenePlan<MatchOnKeyScene> = {
  initial(initialData: unknown): MatchOnKeyScene {
    // 좁히개가 새 배열로 베낀다 — 넘겨받은 자료를 참조로 쥐지 않는다.
    const data = readMatchOnKeyData(initialData);
    return {
      base: {
        sql: data.sql,
        left: data.left,
        right: data.right,
        cols: resolveColumns(data),
        heads: [data.select.left, data.select.right],
      },
      results: [],
      step: null,
    };
  },

  reduce(scene: MatchOnKeyScene, event: FacetRuntimeEvent): MatchOnKeyScene {
    if (event.type !== 'match') return scene;
    const p = event.payload;
    if (typeof p !== 'object' || p === null) throw new Error('match-on-key 장면: match 의 payload 가 없다');
    const r = p as Record<string, unknown>;
    const values = r.values;
    if (!Array.isArray(values) || values.length !== 2) {
      throw new Error('match-on-key 장면: values 는 두 칸이어야 한다');
    }
    const left = num(r.left, 'left');
    const right = num(r.right, 'right');
    const row: ResultRow = {
      left,
      right,
      values: [str(values[0], 'values[0]'), str(values[1], 'values[1]')],
    };
    return {
      base: scene.base,
      results: [...scene.results, row],
      step: {
        kind: 'match',
        left,
        right,
        key: str(r.key, 'key'),
        total: num(r.total, 'total'),
        copies: num(r.copies, 'copies'),
      },
    };
  },
};
