/**
 * 빈자리 채우기 — 연속 묶음(continuous batching) 의 한 대목.
 *
 * 자리 `slots` 개와 대기열의 요청들이 있다. 걸음마다
 *   1. 처음에 빈 자리를 **자리 번호가 작은 것부터** 대기열 맨 앞 요청으로 채운다
 *   2. 자리에 앉은 요청은 토큰 하나를 낸다. 빈 자리는 그 걸음을 쉰다 (빈 칸-걸음)
 *   3. 낼 수를 다 채운 요청은 그 걸음 **끝에** 자리를 비운다 — 채우는 것은 다음 걸음 처음
 * 대기열이 비고 자리가 다 비면 끝난다. 프롬프트 읽기는 셈하지 않는다.
 *
 * 이벤트 (모두 silent 아님 — 하나하나가 걸음이다):
 *
 * - `init`
 *     payload `{ slots: number; requests: { id: string; tokens: number }[]; steps: number }`
 *     `steps` 는 끝날 때까지의 걸음 수 — 알고리즘이 먼저 끝까지 셈해 둔 것. 그림이 가로를 나눈다.
 *
 * - `step`
 *     payload `{
 *       t: number;                                        // 걸음 번호 (1 부터)
 *       fills: { slot: number; req: string }[];           // 이 걸음 처음에 채운 자리 (자리 번호 1 부터)
 *       emits: { slot: number; req: string; left: number }[]; // 토큰을 낸 자리와 그 뒤 남은 수
 *       idle: number[];                                   // 이 걸음을 쉰 자리
 *       finished: { slot: number; req: string }[];        // 이 걸음 끝에 비운 자리
 *     }`
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RefillRequest = { id: string; tokens: number };

export type RefillTheEmptySlotFacetData = {
  type: 'refill-the-empty-slot';
  slots: number;
  requests: RefillRequest[];
  stepMs: number;
};

export type RefillStep = {
  t: number;
  fills: { slot: number; req: string }[];
  emits: { slot: number; req: string; left: number }[];
  idle: number[];
  finished: { slot: number; req: string }[];
};

/** 규약대로 끝까지 돌린 걸음표. 자료를 순회한 결과다. */
function simulate(slots: number, requests: readonly RefillRequest[]): RefillStep[] {
  const queue = requests.map((r) => ({ id: r.id, tokens: r.tokens }));
  const seats: ({ id: string; left: number } | null)[] = Array.from({ length: slots }, () => null);
  const out: RefillStep[] = [];
  // 모든 요청이 한 토큰씩은 내므로 걸음 수는 토큰 합을 넘지 않는다 — 루프의 상한.
  const limit = requests.reduce((s, r) => s + Math.max(1, r.tokens), 0) + 1;
  for (let t = 1; t <= limit; t += 1) {
    if (queue.length === 0 && seats.every((s) => s === null)) break;
    const fills: RefillStep['fills'] = [];
    for (let i = 0; i < slots; i += 1) {
      if (seats[i] !== null) continue;
      const head = queue.shift();
      if (head === undefined) break;
      seats[i] = { id: head.id, left: Math.max(1, head.tokens) };
      fills.push({ slot: i + 1, req: head.id });
    }
    const emits: RefillStep['emits'] = [];
    const idle: number[] = [];
    const finished: RefillStep['finished'] = [];
    for (let i = 0; i < slots; i += 1) {
      const seat = seats[i];
      if (seat === null || seat === undefined) {
        idle.push(i + 1);
        continue;
      }
      seat.left -= 1;
      emits.push({ slot: i + 1, req: seat.id, left: seat.left });
      if (seat.left === 0) {
        finished.push({ slot: i + 1, req: seat.id });
        seats[i] = null;
      }
    }
    out.push({ t, fills, emits, idle, finished });
  }
  return out;
}

export async function refillTheEmptySlot(
  context: FacetContext<RefillTheEmptySlotFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<RefillTheEmptySlotFacetData>;
  const { slots, requests, stepMs } = ctx.data;
  const plan = simulate(slots, requests);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    payload: {
      slots,
      requests: requests.map((r) => ({ id: r.id, tokens: r.tokens })),
      steps: plan.length,
    },
  });

  for (const step of plan) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'step', payload: step });
  }
}
