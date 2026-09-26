/**
 * vanishing-over-time 장면.
 *
 * 바탕 — 알고리즘이 셈한 h 차례와 출발 기울기 (silent `init` 이 걸음 0 을 채운다).
 * 자취 — 거슬러 닿은 은닉 상태마다 곱한 몫과 기울기.
 * 이번 걸음 — 출발(start) 이거나 한 걸음 거슬러 감(back, 거스르기 전 기울기 from 을 싣는다).
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type VanishingReach = {
  /** 닿은 은닉 상태 번호 (h_k) */
  k: number;
  slope: number;
  factor: number;
  grad: number;
  distance: number;
};

export type VanishingStep =
  | { kind: 'start' }
  | { kind: 'back'; k: number; from: number };

/** 번역하지 않는 수식 기호 — init 이 바탕에 싣는다. */
export type VanishingSceneSymbols = { hidden: string; partial: string; wh: string; slope: string };

export type VanishingOverTimeScene = {
  base: { hs: number[]; start: number; wh: number; symbols: VanishingSceneSymbols } | null;
  reached: VanishingReach[];
  step: VanishingStep | null;
};

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`vanishing-over-time 장면: ${type} 의 ${key} 가 수가 아니다`);
  }
  return v;
}

function symbolsOf(p: Record<string, unknown>): VanishingSceneSymbols {
  const raw = p.symbols;
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('vanishing-over-time 장면: init 에 symbols 가 없다');
  }
  const s = raw as Record<string, unknown>;
  const pick = (key: string): string => {
    const v = s[key];
    if (typeof v !== 'string' || v === '') {
      throw new Error(`vanishing-over-time 장면: init 의 symbols.${key} 가 문자열이 아니다`);
    }
    return v;
  };
  return { hidden: pick('hidden'), partial: pick('partial'), wh: pick('wh'), slope: pick('slope') };
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`vanishing-over-time 장면: ${event.type} 에 payload 가 없다`);
  }
  return p as Record<string, unknown>;
}

export const vanishingOverTimeScene: ScenePlan<VanishingOverTimeScene> = {
  // 바탕은 알고리즘이 셈한다 — silent init 이 걸음 0 을 갈아 끼운다
  initial() {
    return { base: null, reached: [], step: null };
  },
  reduce(scene, event) {
    if (event.type === 'init') {
      const p = payloadOf(event);
      const hs = p.hs;
      if (!Array.isArray(hs) || !hs.every((v) => typeof v === 'number' && Number.isFinite(v))) {
        throw new Error('vanishing-over-time 장면: init 의 hs 가 수 배열이 아니다');
      }
      return {
        base: {
          hs: [...(hs as number[])],
          start: num(p, 'start', 'init'),
          wh: num(p, 'wh', 'init'),
          symbols: symbolsOf(p),
        },
        reached: [],
        step: { kind: 'start' },
      };
    }
    if (event.type === 'back') {
      if (scene.base === null) throw new Error('vanishing-over-time 장면: init 앞에 back 이 왔다');
      const p = payloadOf(event);
      const reach: VanishingReach = {
        k: num(p, 'k', 'back'),
        slope: num(p, 'slope', 'back'),
        factor: num(p, 'factor', 'back'),
        grad: num(p, 'grad', 'back'),
        distance: num(p, 'distance', 'back'),
      };
      return {
        base: scene.base,
        reached: [...scene.reached, reach],
        step: { kind: 'back', k: reach.k, from: num(p, 'from', 'back') },
      };
    }
    throw new Error(`vanishing-over-time 장면: 모르는 이벤트 ${event.type}`);
  },
};
