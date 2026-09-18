/**
 * 1비트 예측기의 두 번 실수 — 지난번 결과 하나만 기억하는 예측기를 반복문 결과 열에 돌린다.
 *
 * 규약: 짐작 = 기억한 값. 결과를 본 뒤 기억을 결과로 바꾼다. 틀렸을 때만 기억이
 * 실제로 뒤집힌다.
 *
 * 이벤트 (전부 silent 아님 — 하나하나가 걸음이다):
 *
 * - `init`   payload `{ outcomes: Bit[]; memory: Bit }`
 *            결과 열과 처음 기억. 마운트 직후 문 밖에서 곧바로 보낸다
 * - `branch` payload `{ index: number; guess: Bit; outcome: Bit; hit: boolean; memory: Bit }`
 *            분기 하나. `guess` 는 보기 전의 기억, `memory` 는 본 뒤의 기억
 * - `done`   payload `{ misses: number; chained: number; total: number }`
 *            틀린 수 · 바로 앞 분기도 틀렸던 틀림의 수(앞 틀림이 뒤집어 놓은 기억 탓) · 분기 수
 *
 * `Bit` 은 `'T'`(탄다) 또는 `'N'`(안 탄다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Bit = 'T' | 'N';

export type OneBitDoubleFaultFacetData = {
  type: 'one-bit-double-fault';
  /** 분기 결과 열 — 반복문을 여러 번 연 결과를 이어 적은 것 */
  outcomes: Bit[];
  /** 예측기의 처음 기억 */
  initialMemory: Bit;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

export async function oneBitDoubleFault(
  context: FacetContext<OneBitDoubleFaultFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<OneBitDoubleFaultFacetData>;
  const { outcomes, initialMemory, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    payload: { outcomes: [...outcomes], memory: initialMemory },
  });

  let memory: Bit = initialMemory;
  let misses = 0;
  let chained = 0;
  let lastMissed = false;

  for (const [index, outcome] of outcomes.entries()) {
    if (!(await pause())) return;
    const guess = memory;
    const hit = guess === outcome;
    if (!hit) {
      misses += 1;
      if (lastMissed) chained += 1;
    }
    lastMissed = !hit;
    memory = outcome;
    await ctx.emit({
      type: 'branch',
      payload: { index, guess, outcome, hit, memory },
    });
  }

  if (!(await pause())) return;
  await ctx.emit({
    type: 'done',
    payload: { misses, chained, total: outcomes.length },
  });
}
