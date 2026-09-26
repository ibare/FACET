/**
 * nudge-toward-reward — 받은 상의 부호대로 뽑힌 행동의 확률이 밀린다 (REINFORCE, 기준값 없음).
 *
 * 행위자는 행동마다 선호 θ 만 가지고, 정책은 θ 의 softmax 다. 판마다 주사위 u 로 확률을
 * 누적해 행동 하나를 뽑고, 환경의 상 표에서 상 r 을 받는다 (한 걸음짜리 판이라 G = r).
 * 그 뒤 모든 행동 b 에 대해 θ_b ← θ_b + α · G · (1[b = 뽑힌 행동] − π_b) 로 밀고
 * π 를 다시 셈한다. π_b 는 갱신 전의 확률이다.
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 채운다 (θ 모두 처음 값 · π 는 그 softmax).
 * 그 화면을 읽을 틈으로 첫 발신 앞에 stepMs 를 둔다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 걸음 하나):
 *   draw  { round: number, u: number, cum: number[], pick: number, reward: number }
 *         round 는 1 부터. cum 은 행동 차례대로 누적한 확률 (마지막은 1).
 *         pick 은 u < cum[i] 가 처음 서는 i. reward 는 환경이 준 상.
 *   push  { round: number, pick: number, reward: number, step: number,
 *           thetaFrom: number[], piFrom: number[], theta: number[], pi: number[] }
 *         step = α · G. thetaFrom · piFrom 은 갱신 전, theta · pi 는 갱신 뒤 (셈값 그대로).
 *
 * 셈은 배정도 실수로 끝까지 하고, 자르는 것은 그림의 몫이다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NudgeTowardRewardFacetData = {
  type: 'nudge-toward-reward';
  /** 행동 식별자 — 이 차례로 누적한다 */
  actions: string[];
  /** 선호 θ 의 처음 값 (행동 차례) */
  theta: number[];
  /** 환경이 가진 상 표 — 행동 식별자 → 상. 행위자는 이것을 읽어 고르지 않는다 */
  rewards: Record<string, number>;
  /** 학습률 α */
  alpha: number;
  /** 판마다 하나씩 쓰는 뽑기 주사위 — 판 수는 이 길이다 */
  dice: number[];
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

/** θ 의 softmax — 최댓값을 빼고 셈한다. 장면의 걸음 0 도 이 함수로 얻는다. */
export function policy(theta: readonly number[]): number[] {
  if (theta.length === 0) throw new Error('nudge-toward-reward: 선호가 비었다');
  let top = -Infinity;
  for (const v of theta) {
    if (!Number.isFinite(v)) throw new Error(`nudge-toward-reward: 셈할 수 없는 선호 ${v}`);
    if (v > top) top = v;
  }
  const ex = theta.map((v) => Math.exp(v - top));
  const sum = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / sum);
}

/** 확률을 차례대로 누적한다. 마지막 칸은 셈값 그대로 둔다 (1 과의 차이는 부동소수 끝자리). */
function cumulate(pi: readonly number[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const p of pi) {
    acc += p;
    out.push(acc);
  }
  return out;
}

/** u < 누적 이 처음 서는 행동. 경계에 딱 걸리거나 어디에도 서지 않으면 던진다. */
function sample(u: number, cum: readonly number[]): number {
  if (!(u >= 0 && u < 1)) throw new Error(`nudge-toward-reward: 주사위 ${u} 가 [0, 1) 밖이다`);
  for (let i = 0; i < cum.length; i += 1) {
    const c = cum[i];
    if (c === undefined) throw new Error(`nudge-toward-reward: 누적 ${i} 가 없다`);
    if (u === c) throw new Error(`nudge-toward-reward: 주사위 ${u} 가 누적 경계에 걸렸다`);
    if (u < c) return i;
  }
  throw new Error(`nudge-toward-reward: 주사위 ${u} 가 어느 행동에도 서지 않는다`);
}

function narrow(data: unknown): NudgeTowardRewardFacetData {
  if (typeof data !== 'object' || data === null) throw new Error('nudge-toward-reward: 자료가 없다');
  const d = data as Record<string, unknown>;
  const { actions, theta, rewards, alpha, dice, stepMs } = d;
  if (!Array.isArray(actions) || actions.length === 0 || !actions.every((a) => typeof a === 'string')) {
    throw new Error('nudge-toward-reward: actions 는 식별자 배열이어야 한다');
  }
  if (!Array.isArray(theta) || theta.length !== actions.length || !theta.every((v) => typeof v === 'number')) {
    throw new Error('nudge-toward-reward: theta 는 행동 수만큼의 수여야 한다');
  }
  if (typeof rewards !== 'object' || rewards === null) throw new Error('nudge-toward-reward: rewards 가 없다');
  const table = rewards as Record<string, unknown>;
  for (const a of actions as string[]) {
    if (typeof table[a] !== 'number') throw new Error(`nudge-toward-reward: 상 표에 행동 ${a} 가 없다`);
  }
  if (typeof alpha !== 'number' || !Number.isFinite(alpha)) throw new Error('nudge-toward-reward: alpha 가 수가 아니다');
  if (!Array.isArray(dice) || !dice.every((u) => typeof u === 'number')) {
    throw new Error('nudge-toward-reward: dice 는 수 배열이어야 한다');
  }
  if (typeof stepMs !== 'number' || stepMs < 0) throw new Error('nudge-toward-reward: stepMs 가 없다');
  return {
    type: 'nudge-toward-reward',
    actions: [...(actions as string[])],
    theta: [...(theta as number[])],
    rewards: table as Record<string, number>,
    alpha,
    dice: [...(dice as number[])],
    stepMs,
  };
}

export async function nudgeTowardReward(
  ctx: FacetContext<NudgeTowardRewardFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<NudgeTowardRewardFacetData>;
  const data = narrow(ctx.data);
  const { actions, rewards, alpha, dice, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let theta = [...data.theta];
  let pi = policy(theta);

  for (let k = 0; k < dice.length; k += 1) {
    // 걸음 0 (그리고 앞 판의 밂) 을 읽을 틈이 이 문이다.
    if (!(await pause())) return;
    const u = dice[k];
    if (u === undefined) throw new Error(`nudge-toward-reward: 판 ${k + 1} 의 주사위가 없다`);
    const cum = cumulate(pi);
    const pick = sample(u, cum);
    const id = actions[pick];
    if (id === undefined) throw new Error(`nudge-toward-reward: 행동 ${pick} 이 없다`);
    const reward = rewards[id];
    if (reward === undefined) throw new Error(`nudge-toward-reward: 상 표에 ${id} 가 없다`);
    await ctx.emit({ type: 'draw', payload: { round: k + 1, u, cum, pick, reward } });

    if (!(await pause())) return;
    // 한 걸음짜리 판이라 G = r. 기준값은 두지 않는다.
    const g = reward;
    const step = alpha * g;
    const thetaFrom = theta;
    const piFrom = pi;
    theta = theta.map((v, b) => {
      const p = piFrom[b];
      if (p === undefined) throw new Error(`nudge-toward-reward: 행동 ${b} 의 확률이 없다`);
      return v + step * ((b === pick ? 1 : 0) - p);
    });
    pi = policy(theta);
    await ctx.emit({
      type: 'push',
      payload: { round: k + 1, pick, reward, step, thetaFrom, piFrom, theta, pi },
    });
  }
}
