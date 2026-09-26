/**
 * weight-sharing 장면.
 *
 * 바탕  — 입력 · 무게 한 벌 · 출력 길이 · 둔 무게 수 (initial + silent init)
 * 자취  — 출력 칸의 값 · 같은 입력 짝 · 쓰인 자리 · 곱 · 따로면 필요한 무게 수
 * 이번 걸음 — 무게가 어디서 어디로 옮겨 갔는가
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readWeightSharingData } from './algorithm.js';

export type WeightSharingStep = {
  kind: 'place';
  pos: number;
  /** 무게 한 벌이 이 걸음 앞에 앉아 있던 자리. 처음 앉는 걸음이면 null. */
  from: number | null;
  value: number;
  twin: number | null;
};

export type WeightSharingTwin = { a: number; b: number };

export type WeightSharingScene = {
  input: number[];
  weights: number[];
  outLen: number;
  weightCount: number;
  /** 출력 칸. 아직 셈하지 않은 칸은 null. */
  outputs: (number | null)[];
  /** 무게 한 벌이 앉은 자리. 아직 앉지 않았으면 null. */
  at: number | null;
  used: number;
  products: number;
  separate: number;
  twins: WeightSharingTwin[];
  step: WeightSharingStep | null;
};

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`weight-sharing 장면: ${key} 가 수가 아니다`);
  return v;
}

function record(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`weight-sharing 장면: ${event.type} 의 payload 가 없다`);
  return p as Record<string, unknown>;
}

export const weightSharingScene: ScenePlan<WeightSharingScene> = {
  initial(initialData: unknown): WeightSharingScene {
    const d = readWeightSharingData(initialData);
    return {
      input: [...d.input],
      weights: [...d.weights],
      outLen: 0,
      weightCount: 0,
      outputs: [],
      at: null,
      used: 0,
      products: 0,
      separate: 0,
      twins: [],
      step: null,
    };
  },

  reduce(scene: WeightSharingScene, event: FacetRuntimeEvent): WeightSharingScene {
    if (event.type === 'init') {
      const p = record(event);
      const outLen = num(p, 'outLen');
      return {
        ...scene,
        outLen,
        weightCount: num(p, 'weightCount'),
        outputs: Array.from({ length: outLen }, () => null),
        step: null,
      };
    }
    if (event.type === 'place') {
      const p = record(event);
      const pos = num(p, 'pos');
      const value = num(p, 'value');
      if (pos < 0 || pos >= scene.outputs.length) throw new Error(`weight-sharing 장면: 자리 ${pos} 가 출력 밖이다`);
      const rawTwin = p.twin;
      let twin: number | null;
      if (rawTwin === null) twin = null;
      else if (typeof rawTwin === 'number') twin = rawTwin;
      else throw new Error('weight-sharing 장면: twin 이 수도 null 도 아니다');
      const outputs = scene.outputs.slice();
      outputs[pos] = value;
      return {
        ...scene,
        outputs,
        at: pos,
        used: num(p, 'used'),
        products: num(p, 'products'),
        weightCount: num(p, 'weightCount'),
        separate: num(p, 'separate'),
        twins: twin === null ? scene.twins : [...scene.twins, { a: twin, b: pos }],
        step: { kind: 'place', pos, from: scene.at, value, twin },
      };
    }
    throw new Error(`weight-sharing 장면: 모르는 이벤트 ${event.type}`);
  },
};
