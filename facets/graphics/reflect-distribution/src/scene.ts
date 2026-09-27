import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowReflectDistribution, type Material } from './algorithm.js';

/** 잰 방향 하나 — 걸음이 쌓는 자취. */
export type Measured = { out: number; f: number; mirror: boolean };

export type SwapPair = { a: number; b: number; forward: number; backward: number };

export type ReflectDistributionStep =
  | { kind: 'start' }
  /** from = 바로 앞에 잰 방향 (처음이면 null) — 재는 쪽이 어디서 돌아오는지 */
  | { kind: 'measure'; out: number; from: number | null }
  | { kind: 'swap' };

export type ReflectDistributionScene = {
  /** 바탕 — 자료와 init 이 한 번 정한다 */
  incoming: number;
  outgoing: number[];
  material: Material;
  /** init 이 싣는 셈값. init 전에는 null */
  floor: number | null;
  top: number | null;
  /** 자취 */
  measured: Measured[];
  swapped: SwapPair | null;
  /** 이번 걸음 */
  step: ReflectDistributionStep;
};

function field(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`reflectDistributionScene: ${type}.payload.${key} 가 유한한 수가 아니다`);
  }
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`reflectDistributionScene: ${event.type} 의 payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

export const reflectDistributionScene: ScenePlan<ReflectDistributionScene> = {
  initial(initialData: unknown): ReflectDistributionScene {
    const d = narrowReflectDistribution(initialData);
    return {
      incoming: d.incoming,
      outgoing: [...d.outgoing],
      material: { ...d.material },
      floor: null,
      top: null,
      measured: [],
      swapped: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene, event): ReflectDistributionScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const floor = field(p, 'floor', 'init');
        const top = field(p, 'top', 'init');
        if (!(top > 0) || floor > top) throw new Error('reflectDistributionScene: init 의 floor · top 이 어긋난다');
        return { ...scene, floor, top, step: { kind: 'start' } };
      }
      case 'measure': {
        const p = payloadOf(event);
        const out = field(p, 'out', 'measure');
        const f = field(p, 'f', 'measure');
        const mirror = p.mirror;
        if (typeof mirror !== 'boolean') throw new Error('reflectDistributionScene: measure.payload.mirror 가 참거짓이 아니다');
        if (scene.top === null) throw new Error('reflectDistributionScene: init 전에 measure 가 왔다');
        const expected = scene.outgoing[scene.measured.length];
        if (expected === undefined) throw new Error('reflectDistributionScene: 잴 방향이 더 없다');
        if (out !== expected) {
          throw new Error(`reflectDistributionScene: measure.payload.out = ${out}, 차례는 ${expected}`);
        }
        if (f < 0 || f > scene.top) throw new Error('reflectDistributionScene: measure.payload.f 가 축척 밖이다');
        const last = scene.measured[scene.measured.length - 1];
        return {
          ...scene,
          measured: [...scene.measured, { out, f, mirror }],
          step: { kind: 'measure', out, from: last === undefined ? null : last.out },
        };
      }
      case 'swap': {
        const p = payloadOf(event);
        const a = field(p, 'a', 'swap');
        const b = field(p, 'b', 'swap');
        const forward = field(p, 'forward', 'swap');
        const backward = field(p, 'backward', 'swap');
        if (scene.measured.length !== scene.outgoing.length) {
          throw new Error('reflectDistributionScene: 다 재기 전에 swap 이 왔다');
        }
        if (scene.swapped !== null) throw new Error('reflectDistributionScene: swap 이 두 번 왔다');
        if (scene.top === null || forward > scene.top || backward > scene.top) {
          throw new Error('reflectDistributionScene: swap 값이 축척 밖이다');
        }
        return { ...scene, swapped: { a, b, forward, backward }, step: { kind: 'swap' } };
      }
      default:
        throw new Error(`reflectDistributionScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
