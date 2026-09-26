/**
 * discount-future — 앞으로 받을 상을 하나씩 지금 자리로 당겨 할인 합을 쌓는다.
 *
 * 할인 합 G_0 = Σ_{k=0..n-1} γ^k · r_{k+1}. 첫 상의 지수는 0 이다.
 * 셈은 배정도 그대로 쌓고, 표시 자르기는 그림이 한다.
 *
 * 이벤트 (걸음 하나 = 상 하나를 당겨 온다):
 *   pull   { k: number, reward: number, weight: number, value: number,
 *            disc: number, raw: number }
 *          k       상이 몇 걸음 뒤에 있었는가 (0 부터)
 *          reward  날 상 r_{k+1}
 *          weight  γ^k
 *          value   지금 값 γ^k · r_{k+1}
 *          disc    이 상까지 쌓인 할인 합 (셈값)
 *          raw     이 상까지 쌓인 날 합
 *          silent 아님. 상이 0 이어도 걸음이다.
 *
 * 걸음 0(γ 와 상의 줄, 쌓인 값 0)은 장면의 initial() 이 initialData 에서 채운다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DiscountFutureFacetData = {
  type: 'discount-future';
  /** 할인율 γ (0 < γ ≤ 1) */
  gamma: number;
  /** 앞으로 받을 상 r_1 … r_n (차례대로) */
  rewards: number[];
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

/** 자료를 좁힌다. 모르는 모양은 던진다 (C6). */
export function readDiscountData(raw: unknown): { gamma: number; rewards: number[]; stepMs: number } {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('discount-future: initialData 가 객체가 아니다');
  }
  const rec = raw as Record<string, unknown>;
  const gamma = rec['gamma'];
  const rewards = rec['rewards'];
  const stepMs = rec['stepMs'];
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs < 0) {
    throw new Error(`discount-future: stepMs 가 0 이상의 수가 아니다 — ${String(stepMs)}`);
  }
  if (typeof gamma !== 'number' || !Number.isFinite(gamma) || gamma <= 0 || gamma > 1) {
    throw new Error(`discount-future: γ 가 (0, 1] 안의 수가 아니다 — ${String(gamma)}`);
  }
  if (!Array.isArray(rewards) || rewards.length === 0) {
    throw new Error('discount-future: 상의 줄이 비었거나 배열이 아니다');
  }
  const out: number[] = [];
  rewards.forEach((r, i) => {
    if (typeof r !== 'number' || !Number.isFinite(r) || r < 0) {
      throw new Error(`discount-future: 상 r_${i + 1} 이 0 이상의 수가 아니다 — ${String(r)}`);
    }
    out.push(r);
  });
  return { gamma, rewards: out, stepMs };
}

/** 그림의 세로 축척이 담아야 하는 가장 큰 값 — 날 합과 가장 큰 상 가운데 큰 것. */
export function scaleCeiling(rewards: readonly number[]): number {
  let sum = 0;
  let top = 0;
  for (const r of rewards) {
    sum += r;
    if (r > top) top = r;
  }
  return Math.max(sum, top);
}

export async function discountFuture(
  context: FacetContext<DiscountFutureFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<DiscountFutureFacetData>;
  const { gamma, rewards, stepMs } = readDiscountData(ctx.data);

  // 걸음 0 은 이미 읽을 것(상의 줄과 γ)이 있는 화면이라 첫 당김 앞에도 머문다.
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let weight = 1; // γ^0
  let disc = 0;
  let raw = 0;
  for (let k = 0; k < rewards.length; k += 1) {
    if (!(await pause())) return;
    const reward = rewards[k];
    if (reward === undefined) throw new Error(`discount-future: 상 r_${k + 1} 이 없다`);
    const value = weight * reward;
    disc += value;
    raw += reward;
    await ctx.emit({
      type: 'pull',
      payload: { k, reward, weight, value, disc, raw },
    });
    weight *= gamma;
  }
}
