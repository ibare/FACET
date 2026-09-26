import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowAttentionWeightsData } from './algorithm.js';

/** 바탕 — initialData 에서 한 번 정해진다. */
export type AttentionBase = {
  query: number[];
  items: { id: string; key: number[]; value: number[] }[];
};

/** 이번 걸음. */
export type AttentionStep =
  | { kind: 'start' }
  | { kind: 'score' }
  | { kind: 'weigh' }
  | { kind: 'share'; index: number; from: number[] };

export type AttentionShare = { share: number[]; from: number[]; to: number[] };

export type AttentionWeightsScene = {
  base: AttentionBase;
  /** 자취 — 걸음이 쌓는 것 */
  dots: number[] | null;
  scores: number[] | null;
  weights: number[] | null;
  sum: number | null;
  top: number | null;
  /** shares[j] — j 번째 값의 몫과, 그것을 더하기 앞뒤의 결과. 아직 더하지 않았으면 null */
  shares: (AttentionShare | null)[];
  /** 결과 — silent init 이 출발값을 채우기 전에는 null */
  result: number[] | null;
  step: AttentionStep;
};

function numArray(raw: unknown, where: string, len: number): number[] {
  if (!Array.isArray(raw) || raw.length !== len) {
    throw new Error(`attention-weights 장면: ${where} 는 길이 ${len} 의 수 배열이어야 한다`);
  }
  return raw.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) {
      throw new Error(`attention-weights 장면: ${where}[${i}] 가 수가 아니다`);
    }
    return x;
  });
}

function field(payload: unknown, name: string): unknown {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('attention-weights 장면: payload 가 객체가 아니다');
  }
  return (payload as Record<string, unknown>)[name];
}

function intField(payload: unknown, name: string, max: number): number {
  const v = field(payload, name);
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= max) {
    throw new Error(`attention-weights 장면: ${name} 가 0 이상 ${max} 미만의 정수가 아니다`);
  }
  return v;
}

export const attentionWeightsScene: ScenePlan<AttentionWeightsScene> = {
  initial(initialData: unknown): AttentionWeightsScene {
    const data = narrowAttentionWeightsData(initialData);
    const items = data.items.map((it) => ({ id: it.id, key: [...it.key], value: [...it.value] }));
    return {
      base: { query: [...data.query], items },
      dots: null,
      scores: null,
      weights: null,
      sum: null,
      top: null,
      shares: items.map(() => null),
      result: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: AttentionWeightsScene, event: FacetRuntimeEvent): AttentionWeightsScene {
    const n = scene.base.items.length;
    const dim = (scene.base.items[0] as { value: number[] }).value.length;
    switch (event.type) {
      case 'init': {
        const result = numArray(field(event.payload, 'result'), 'result', dim);
        return { ...scene, result };
      }
      case 'score': {
        const dots = numArray(field(event.payload, 'dots'), 'dots', n);
        const scores = numArray(field(event.payload, 'scores'), 'scores', n);
        return { ...scene, dots, scores, step: { kind: 'score' } };
      }
      case 'weigh': {
        if (scene.scores === null) {
          throw new Error('attention-weights 장면: 점수보다 무게가 먼저 왔다');
        }
        const weights = numArray(field(event.payload, 'weights'), 'weights', n);
        const sum = field(event.payload, 'sum');
        if (typeof sum !== 'number' || !Number.isFinite(sum)) {
          throw new Error('attention-weights 장면: sum 이 수가 아니다');
        }
        const top = intField(event.payload, 'top', n);
        return { ...scene, weights, sum, top, step: { kind: 'weigh' } };
      }
      case 'share': {
        const index = intField(event.payload, 'index', n);
        const share = numArray(field(event.payload, 'share'), 'share', dim);
        const from = numArray(field(event.payload, 'from'), 'from', dim);
        const result = numArray(field(event.payload, 'result'), 'result', dim);
        if (scene.weights === null || scene.result === null) {
          throw new Error('attention-weights 장면: 무게나 출발값보다 몫이 먼저 왔다');
        }
        const shares = scene.shares.map((s, j) => (j === index ? { share, from, to: result } : s));
        return { ...scene, shares, result, step: { kind: 'share', index, from } };
      }
      default:
        throw new Error(`attention-weights 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
