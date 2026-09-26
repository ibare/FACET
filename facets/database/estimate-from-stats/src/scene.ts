/**
 * estimate-from-stats 의 장면.
 *
 * 바탕 — SQL · 표 이름 · 전체 줄 수 · 열 이름 · 범위 · 통 (initial 이 자료에서 베낀다)
 * 자취 — 지금까지 본 통에서 잘려 나온 몫 (`cuts`) 과 마지막의 추정 (`estimate`)
 * 이번 걸음 — `step`
 *
 * 셈(겹친 구간 · 몫 · 누적 · 선택도)은 알고리즘이 한다. 장면은 이벤트의 값을 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readEstimateData, type StatBucket } from './algorithm.js';

export type EstimateCut = {
  /** 통 차례 (0 부터) */
  index: number;
  /** 통 안에서 범위와 겹친 구간. 겹침이 없으면 from === to */
  from: number;
  to: number;
  /** 잘려 나온 몫 */
  share: number;
  /** 이 몫이 들어가기 전의 누적 — 추정치 막대에서 이 몫이 놓이는 자리 */
  before: number;
  /** 이 몫이 들어간 뒤의 누적 */
  sum: number;
};

export type EstimateStep =
  | { kind: 'start' }
  | { kind: 'bucket'; index: number }
  | { kind: 'estimate' };

export type EstimateFromStatsScene = {
  sql: string;
  table: string;
  rows: number;
  column: string;
  range: { lo: number; hi: number };
  buckets: StatBucket[];
  cuts: EstimateCut[];
  estimate: { total: number; selectivity: number } | null;
  step: EstimateStep;
};

function field(payload: unknown, key: string, type: string): number {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error(`estimate-from-stats: ${type} 의 payload 가 객체가 아니다`);
  }
  const v: unknown = (payload as Record<string, unknown>)[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`estimate-from-stats: ${type} 의 ${key} 가 수가 아니다`);
  }
  return v;
}

export const estimateFromStatsScene: ScenePlan<EstimateFromStatsScene> = {
  initial(initialData: unknown): EstimateFromStatsScene {
    const data = readEstimateData(initialData);
    return {
      sql: data.sql,
      table: data.table,
      rows: data.rows,
      column: data.column,
      range: { lo: data.range.lo, hi: data.range.hi },
      buckets: data.buckets.map((b) => ({ lo: b.lo, hi: b.hi, rows: b.rows })),
      cuts: [],
      estimate: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: EstimateFromStatsScene, event: FacetRuntimeEvent): EstimateFromStatsScene {
    if (event.type === 'bucket') {
      const index = field(event.payload, 'index', 'bucket');
      const share = field(event.payload, 'share', 'bucket');
      const sum = field(event.payload, 'sum', 'bucket');
      if (scene.buckets[index] === undefined) {
        throw new Error(`estimate-from-stats: 없는 통 ${index}`);
      }
      const cut: EstimateCut = {
        index,
        from: field(event.payload, 'from', 'bucket'),
        to: field(event.payload, 'to', 'bucket'),
        share,
        before: sum - share,
        sum,
      };
      return { ...scene, cuts: [...scene.cuts, cut], step: { kind: 'bucket', index } };
    }
    if (event.type === 'estimate') {
      return {
        ...scene,
        estimate: {
          total: field(event.payload, 'total', 'estimate'),
          selectivity: field(event.payload, 'selectivity', 'estimate'),
        },
        step: { kind: 'estimate' },
      };
    }
    throw new Error(`estimate-from-stats: 모르는 이벤트 ${event.type}`);
  },
};
