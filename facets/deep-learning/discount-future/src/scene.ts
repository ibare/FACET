/**
 * discount-future 장면 — 바탕(γ · 상의 줄) · 자취(당겨 온 상들 · 쌓인 두 합) · 이번 걸음.
 *
 * 셈은 알고리즘이 한다. 장면은 pull 이벤트의 값을 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readDiscountData } from './algorithm';

export type PulledReward = {
  k: number;
  reward: number;
  weight: number;
  value: number;
};

export type DiscountStep = {
  /** 이번에 당겨 온 상의 k */
  k: number;
  /** 당기기 전의 할인 합 · 날 합 (계기값) */
  discBefore: number;
  rawBefore: number;
};

export type DiscountFutureScene = {
  gamma: number;
  rewards: number[];
  pulled: PulledReward[];
  disc: number;
  raw: number;
  step: DiscountStep | null;
};

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`discount-future: pull 의 ${key} 가 수가 아니다 — ${String(v)}`);
  }
  return v;
}

export const discountFutureScene: ScenePlan<DiscountFutureScene> = {
  initial(initialData: unknown): DiscountFutureScene {
    const { gamma, rewards } = readDiscountData(initialData);
    return { gamma, rewards: [...rewards], pulled: [], disc: 0, raw: 0, step: null };
  },

  reduce(scene: DiscountFutureScene, event: FacetRuntimeEvent): DiscountFutureScene {
    if (event.type !== 'pull') {
      throw new Error(`discount-future: 모르는 이벤트 — ${event.type}`);
    }
    const payload = event.payload;
    if (typeof payload !== 'object' || payload === null) {
      throw new Error('discount-future: pull 의 payload 가 객체가 아니다');
    }
    const p = payload as Record<string, unknown>;
    const k = num(p, 'k');
    const pulled: PulledReward = {
      k,
      reward: num(p, 'reward'),
      weight: num(p, 'weight'),
      value: num(p, 'value'),
    };
    return {
      gamma: scene.gamma,
      rewards: scene.rewards,
      pulled: [...scene.pulled, pulled],
      disc: num(p, 'disc'),
      raw: num(p, 'raw'),
      step: { k, discBefore: scene.disc, rawBefore: scene.raw },
    };
  },
};
