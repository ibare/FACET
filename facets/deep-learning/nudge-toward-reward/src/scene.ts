/**
 * nudge-toward-reward 의 장면.
 *
 * 바탕  — 행동 식별자와 판 수 (initialData 에서 한 번)
 * 자취  — 지금의 θ · π, 지난 판들의 뽑힌 행동과 상
 * 이번 걸음 — 뽑기(주사위 · 누적 · 뽑힌 행동 · 상) 또는 밂(갱신 전 θ · π)
 *
 * 셈은 알고리즘이 한다. 걸음 0 의 π 만 알고리즘이 내놓은 `policy` 를 불러 얻는다 —
 * 두 자리에서 따로 셈하지 않게.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { policy } from './algorithm.js';

export type NudgeRound = { pick: number; reward: number };

export type NudgeStep =
  | { kind: 'draw'; round: number; u: number; cum: number[]; pick: number; reward: number }
  | { kind: 'push'; round: number; pick: number; reward: number; thetaFrom: number[]; piFrom: number[] };

export type NudgeTowardRewardScene = {
  actions: string[];
  totalRounds: number;
  theta: number[];
  pi: number[];
  rounds: NudgeRound[];
  step: NudgeStep | null;
};

function numbers(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const x of v) {
    if (typeof x !== 'number') return null;
    out.push(x);
  }
  return out;
}

export const nudgeTowardRewardScene: ScenePlan<NudgeTowardRewardScene> = {
  initial(initialData: unknown): NudgeTowardRewardScene {
    if (typeof initialData !== 'object' || initialData === null) {
      throw new Error('nudge-toward-reward: initialData 가 없다');
    }
    const d = initialData as Record<string, unknown>;
    const actions = Array.isArray(d.actions) && d.actions.every((a) => typeof a === 'string')
      ? [...(d.actions as string[])]
      : null;
    const theta = numbers(d.theta);
    const dice = numbers(d.dice);
    if (!actions || !theta || !dice || theta.length !== actions.length || actions.length === 0) {
      throw new Error('nudge-toward-reward: initialData 의 actions · theta · dice 모양이 다르다');
    }
    return {
      actions,
      totalRounds: dice.length,
      theta,
      pi: policy(theta),
      rounds: [],
      step: null,
    };
  },

  reduce(scene: NudgeTowardRewardScene, event: FacetRuntimeEvent): NudgeTowardRewardScene {
    const p = event.payload;
    if (typeof p !== 'object' || p === null) {
      throw new Error(`nudge-toward-reward: ${event.type} 의 payload 가 객체가 아니다`);
    }
    const f = p as Record<string, unknown>;
    if (event.type === 'draw') {
      const cum = numbers(f.cum);
      if (typeof f.round !== 'number' || typeof f.u !== 'number' || typeof f.pick !== 'number'
        || typeof f.reward !== 'number' || !cum) {
        throw new Error('nudge-toward-reward: draw 의 payload 모양이 다르다');
      }
      return {
        ...scene,
        rounds: [...scene.rounds, { pick: f.pick, reward: f.reward }],
        step: { kind: 'draw', round: f.round, u: f.u, cum, pick: f.pick, reward: f.reward },
      };
    }
    if (event.type === 'push') {
      const thetaFrom = numbers(f.thetaFrom);
      const piFrom = numbers(f.piFrom);
      const theta = numbers(f.theta);
      const pi = numbers(f.pi);
      if (typeof f.round !== 'number' || typeof f.pick !== 'number' || typeof f.reward !== 'number'
        || !thetaFrom || !piFrom || !theta || !pi) {
        throw new Error('nudge-toward-reward: push 의 payload 모양이 다르다');
      }
      return {
        ...scene,
        theta,
        pi,
        step: { kind: 'push', round: f.round, pick: f.pick, reward: f.reward, thetaFrom, piFrom },
      };
    }
    throw new Error(`nudge-toward-reward: 모르는 이벤트 ${event.type}`);
  },
};
