import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowSeveralViews, type HeadRow } from './algorithm.js';

/** 머리 하나가 한 걸음에 남긴 것. */
export type HeadRun = {
  head: string;
  rows: HeadRow[];
  /** 첫 머리와 짝이 갈린 줄. 첫 머리면 null. */
  split: boolean[] | null;
};

export type SeveralViewsStep =
  | { kind: 'start' }
  | { kind: 'head'; index: number }
  | { kind: 'concat' };

export type SeveralViewsScene = {
  // 바탕
  tokens: string[];
  x: number[][];
  heads: string[];
  /** 머리마다 결과의 칸 수 — 그 머리 W_V 의 열 수. */
  widths: number[];
  // 자취
  runs: HeadRun[];
  joined: { rows: number[][]; widths: number[] } | null;
  // 이번 걸음
  step: SeveralViewsStep;
};

function isNums(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === 'number');
}

function readRows(v: unknown, tokens: string[]): HeadRow[] {
  if (!Array.isArray(v) || v.length !== tokens.length) {
    throw new Error('several-views 장면: head 의 rows 가 토큰 수와 다르다');
  }
  return v.map((r: unknown, i) => {
    if (typeof r !== 'object' || r === null) throw new Error('several-views 장면: rows 의 칸이 객체가 아니다');
    const o = r as Record<string, unknown>;
    const { query, partner, weight, result } = o;
    if (query !== tokens[i]) throw new Error('several-views 장면: rows 의 묻는 토큰 차례가 다르다');
    if (typeof partner !== 'string' || !tokens.includes(partner)) {
      throw new Error('several-views 장면: 모르는 짝 토큰');
    }
    if (typeof weight !== 'number') throw new Error('several-views 장면: weight 가 수가 아니다');
    if (!isNums(result) || result.length === 0) throw new Error('several-views 장면: result 가 수 벡터가 아니다');
    return { query: query as string, partner, weight, result: [...result] };
  });
}

export const severalViewsScene: ScenePlan<SeveralViewsScene> = {
  initial(initialData: unknown): SeveralViewsScene {
    const data = narrowSeveralViews(initialData);
    return {
      tokens: [...data.tokens],
      x: data.x.map((r) => [...r]),
      heads: data.heads.map((h) => h.id),
      widths: data.heads.map((h) => (h.wv[0] as number[]).length),
      runs: [],
      joined: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: SeveralViewsScene, event: FacetRuntimeEvent): SeveralViewsScene {
    if (typeof event.payload !== 'object' || event.payload === null) {
      throw new Error(`several-views 장면: ${event.type} 의 payload 가 없다`);
    }
    const p = event.payload as Record<string, unknown>;
    if (event.type === 'head') {
      const index = scene.runs.length;
      if (p.head !== scene.heads[index]) throw new Error('several-views 장면: 머리 차례가 어긋났다');
      const rows = readRows(p.rows, scene.tokens);
      let split: boolean[] | null = null;
      if (p.split !== null) {
        if (!Array.isArray(p.split) || p.split.length !== scene.tokens.length) {
          throw new Error('several-views 장면: split 모양이 틀렸다');
        }
        split = p.split.map((b: unknown) => {
          if (typeof b !== 'boolean') throw new Error('several-views 장면: split 의 칸이 참거짓이 아니다');
          return b;
        });
      } else if (index !== 0) {
        throw new Error('several-views 장면: 첫 머리가 아닌데 split 이 없다');
      }
      return {
        ...scene,
        runs: [...scene.runs, { head: p.head, rows, split }],
        step: { kind: 'head', index },
      };
    }
    if (event.type === 'concat') {
      const { rows, widths } = p;
      if (!Array.isArray(rows) || rows.length !== scene.tokens.length) {
        throw new Error('several-views 장면: concat 의 rows 모양이 틀렸다');
      }
      const joinedRows = rows.map((r: unknown) => {
        if (!isNums(r)) throw new Error('several-views 장면: concat 의 줄이 수 벡터가 아니다');
        return [...r];
      });
      if (!isNums(widths) || widths.length !== scene.runs.length) {
        throw new Error('several-views 장면: concat 의 widths 모양이 틀렸다');
      }
      return {
        ...scene,
        joined: { rows: joinedRows, widths: [...widths] },
        step: { kind: 'concat' },
      };
    }
    throw new Error(`several-views 장면: 모르는 이벤트 ${event.type}`);
  },
};
