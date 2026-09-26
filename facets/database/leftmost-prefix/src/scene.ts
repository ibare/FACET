import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 지금 보이는 질의. 자리는 정렬된 인덱스 안의 1 부터 번호. */
export type LeftmostPrefixCurrent = {
  q: number;
  lead: number;
  mode: 'shown' | 'narrowed' | 'scanned';
  examined: number[];
  hits: number[];
  outer: [number, number] | null;
};

export type LeftmostPrefixStep =
  | { kind: 'none' }
  /** 질의를 보인다 — 앞 질의가 띄워 둔 항목(`wasHits`)이 내려앉고 괄호가 `wasRange` 에서 넓어진다 */
  | { kind: 'show'; q: number; wasHits: number[]; wasRange: [number, number] | null }
  | { kind: 'narrow'; q: number }
  | { kind: 'scan'; q: number };

export type LeftmostPrefixScene = {
  // 바탕 — init 이 한 번 정한다
  table: string;
  indexName: string;
  columns: string[];
  entries: { row: string; values: string[] }[];
  queries: { id: string; sql: string }[];
  // 이번 질의
  current: LeftmostPrefixCurrent | null;
  // 자취 — 마친 질의마다 한 줄
  ledger: { q: number; examined: number[]; hits: number[] }[];
  step: LeftmostPrefixStep;
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`leftmost-prefix: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`leftmost-prefix: ${what} 가 글자가 아니다`);
  return v;
}

function int(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`leftmost-prefix: ${what} 가 정수가 아니다`);
  return v;
}

function list(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`leftmost-prefix: ${what} 가 목록이 아니다`);
  return v;
}

function ints(v: unknown, what: string): number[] {
  return list(v, what).map((x) => int(x, what));
}

/** 이어진 자리 목록의 양 끝 */
export function rangeOf(positions: number[]): [number, number] | null {
  if (positions.length === 0) return null;
  return [Math.min(...positions), Math.max(...positions)];
}

/** 괄호가 덮는 자리 — 보이기와 훑기는 인덱스 전체, 좁힘은 훑은 항목 */
export function bracketOf(scene: LeftmostPrefixScene): [number, number] | null {
  const cur = scene.current;
  const n = scene.entries.length;
  if (!cur || n === 0) return null;
  if (cur.mode === 'narrowed') return rangeOf(cur.examined);
  return [1, n];
}

function queryIndex(scene: LeftmostPrefixScene, v: unknown): number {
  const q = int(v, 'q');
  if (q < 0 || q >= scene.queries.length) throw new Error(`leftmost-prefix: 없는 질의 ${q}`);
  return q;
}

export const leftmostPrefixScene: ScenePlan<LeftmostPrefixScene> = {
  initial(): LeftmostPrefixScene {
    // 인덱스 항목의 차례는 알고리즘이 정렬해 얻는다 — silent init 이 걸음 0 을 채운다.
    return {
      table: '',
      indexName: '',
      columns: [],
      entries: [],
      queries: [],
      current: null,
      ledger: [],
      step: { kind: 'none' },
    };
  },

  reduce(scene: LeftmostPrefixScene, event: FacetRuntimeEvent): LeftmostPrefixScene {
    const p = event.payload;
    switch (event.type) {
      case 'init': {
        const o = rec(p, 'init');
        return {
          table: str(o.table, 'table'),
          indexName: str(o.indexName, 'indexName'),
          columns: list(o.columns, 'columns').map((c) => str(c, 'column')),
          entries: list(o.entries, 'entries').map((e) => {
            const r = rec(e, 'entry');
            return { row: str(r.row, 'row'), values: list(r.values, 'values').map((v) => str(v, 'value')) };
          }),
          queries: list(o.queries, 'queries').map((x) => {
            const r = rec(x, 'query');
            return { id: str(r.id, 'id'), sql: str(r.sql, 'sql') };
          }),
          current: null,
          ledger: [],
          step: { kind: 'none' },
        };
      }
      case 'query': {
        const o = rec(p, 'query');
        const q = queryIndex(scene, o.q);
        const was = scene.current;
        return {
          ...scene,
          current: { q, lead: int(o.lead, 'lead'), mode: 'shown', examined: [], hits: [], outer: null },
          step: {
            kind: 'show',
            q,
            wasHits: was ? [...was.hits] : [],
            wasRange: bracketOf(scene),
          },
        };
      }
      case 'narrow':
      case 'scan': {
        const o = rec(p, event.type);
        const q = queryIndex(scene, o.q);
        const cur = scene.current;
        if (!cur || cur.q !== q) throw new Error(`leftmost-prefix: 보이지 않은 질의 ${q} 를 좁힌다`);
        const examined = ints(o.examined, 'examined');
        const hits = ints(o.hits, 'hits');
        let outer: [number, number] | null = null;
        if (event.type === 'narrow' && o.outer !== null && o.outer !== undefined) {
          const pair = ints(o.outer, 'outer');
          if (pair.length !== 2) throw new Error('leftmost-prefix: outer 는 두 수다');
          outer = [pair[0]!, pair[1]!];
        }
        return {
          ...scene,
          current: {
            ...cur,
            mode: event.type === 'narrow' ? 'narrowed' : 'scanned',
            examined,
            hits,
            outer,
          },
          ledger: [...scene.ledger, { q, examined: [...examined], hits: [...hits] }],
          step: event.type === 'narrow' ? { kind: 'narrow', q } : { kind: 'scan', q },
        };
      }
      default:
        return scene;
    }
  },
};
