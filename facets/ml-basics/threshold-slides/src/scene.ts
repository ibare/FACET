/**
 * threshold-slides 장면.
 *
 * 바탕  — items (점수 · 참 부류), totals (P · N. init 이 정한다)
 * 자취  — threshold (지금 문턱, null 이면 모든 점수 위) · crossed (넘은 차례) · path (ROC 점의 자취)
 * 이번 걸음 — step (이번에 넘은 것과 계기값 from*)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowThresholdSlides, type ScoredItem } from './algorithm.js';

export type RocPoint = { tp: number; fp: number; tpr: number; fpr: number; ids: string[] };

export type CrossStep = {
  kind: 'cross';
  threshold: number;
  ids: string[];
  fromThreshold: number | null;
  /** 이번 걸음 앞의 ROC 점 — 흐름의 출발값 */
  from: RocPoint;
  last: boolean;
};

export type ThresholdSlidesScene = {
  items: ScoredItem[];
  totals: { pos: number; neg: number } | null;
  threshold: number | null;
  crossed: string[];
  path: RocPoint[];
  step: CrossStep | null;
};

function field(payload: Record<string, unknown>, key: string, type: string): number {
  const v = payload[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`thresholdSlidesScene: ${type}.payload.${key} 가 수가 아니다`);
  }
  return v;
}

function asPayload(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`thresholdSlidesScene: ${event.type}.payload 가 없다`);
  return p as Record<string, unknown>;
}

export const thresholdSlidesScene: ScenePlan<ThresholdSlidesScene> = {
  initial(initialData: unknown): ThresholdSlidesScene {
    const data = narrowThresholdSlides(initialData);
    return {
      items: data.items.map((it) => ({ id: it.id, score: it.score, label: it.label })),
      totals: null,
      threshold: null,
      crossed: [],
      path: [],
      step: null,
    };
  },

  reduce(scene: ThresholdSlidesScene, event: FacetRuntimeEvent): ThresholdSlidesScene {
    switch (event.type) {
      case 'init': {
        const p = asPayload(event);
        const pos = field(p, 'pos', 'init');
        const neg = field(p, 'neg', 'init');
        const origin: RocPoint = {
          tp: field(p, 'tp', 'init'),
          fp: field(p, 'fp', 'init'),
          tpr: field(p, 'tpr', 'init'),
          fpr: field(p, 'fpr', 'init'),
          ids: [],
        };
        const truePos = scene.items.filter((it) => it.label === 1).length;
        if (pos !== truePos || neg !== scene.items.length - truePos) {
          throw new Error('thresholdSlidesScene: init.payload.pos · neg 가 바탕의 참 부류와 맞지 않는다');
        }
        return { ...scene, totals: { pos, neg }, crossed: [], path: [origin], threshold: null, step: null };
      }
      case 'cross': {
        if (scene.totals === null) throw new Error('thresholdSlidesScene: init 앞에 cross 가 왔다');
        const p = asPayload(event);
        const threshold = field(p, 'threshold', 'cross');
        const tp = field(p, 'tp', 'cross');
        const fp = field(p, 'fp', 'cross');
        const fromTp = field(p, 'fromTp', 'cross');
        const fromFp = field(p, 'fromFp', 'cross');
        const fromThreshold = p.fromThreshold;
        if (fromThreshold !== null && typeof fromThreshold !== 'number') {
          throw new Error('thresholdSlidesScene: cross.payload.fromThreshold 가 수 · null 이 아니다');
        }
        if (fromThreshold !== scene.threshold) {
          throw new Error(`thresholdSlidesScene: cross.payload.fromThreshold 가 지금 문턱과 다르다 (${String(fromThreshold)})`);
        }
        const from = scene.path[scene.path.length - 1];
        if (from === undefined) throw new Error('thresholdSlidesScene: ROC 자취가 비었다');
        if (fromTp !== from.tp || fromFp !== from.fp) {
          throw new Error('thresholdSlidesScene: cross.payload.fromTp · fromFp 가 지금 점과 다르다');
        }
        if (tp < from.tp || fp < from.fp || (tp === from.tp && fp === from.fp)) {
          throw new Error('thresholdSlidesScene: cross.payload.tp · fp 가 오르지 않았다');
        }
        if (typeof p.last !== 'boolean') throw new Error('thresholdSlidesScene: cross.payload.last 가 참거짓이 아니다');
        const rawIds = p.ids;
        if (!Array.isArray(rawIds) || rawIds.length === 0) throw new Error('thresholdSlidesScene: cross.payload.ids 가 비었다');
        const ids = rawIds.map((v: unknown, i: number) => {
          if (typeof v !== 'string') throw new Error(`thresholdSlidesScene: cross.payload.ids[${i}] 가 글자가 아니다`);
          const item = scene.items.find((it) => it.id === v);
          if (item === undefined) throw new Error(`thresholdSlidesScene: cross.payload.ids[${i}] 가 바탕에 없다 (${v})`);
          if (scene.crossed.includes(v)) throw new Error(`thresholdSlidesScene: cross.payload.ids[${i}] 는 이미 넘었다 (${v})`);
          if (item.score !== threshold) throw new Error(`thresholdSlidesScene: cross.payload.ids[${i}] 의 점수가 문턱과 다르다 (${v})`);
          return v;
        });
        const point: RocPoint = { tp, fp, tpr: field(p, 'tpr', 'cross'), fpr: field(p, 'fpr', 'cross'), ids };
        return {
          ...scene,
          threshold,
          crossed: [...scene.crossed, ...ids],
          path: [...scene.path, point],
          step: { kind: 'cross', threshold, ids, fromThreshold, from, last: p.last },
        };
      }
      default:
        throw new Error(`thresholdSlidesScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
