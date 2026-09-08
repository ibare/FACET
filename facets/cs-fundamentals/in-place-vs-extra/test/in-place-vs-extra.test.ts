/**
 * 두 방식이 같은 답에 닿는지, 그리고 각자 더 쓴 칸 수가 몇인지 잰다.
 *
 * 화면에 뜨는 "추가 n칸" 은 지어낸 값이 아니라 이 셈의 결과다 (S-piece).
 */

import { describe, expect, it } from 'vitest';
import type { FacetContext, FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  computeInPlaceVsExtraResult,
  inPlaceVsExtra,
  type InPlaceVsExtraData,
} from '../src/algorithm.js';

const DATA: InPlaceVsExtraData = {
  type: 'in-place-vs-extra',
  values: [8, 3, 5, 1],
  stepMs: 0,
};

/** 자동 재생 한 바퀴만 돌리고 멈추는 최소 컨텍스트. */
async function runOnce(data: InPlaceVsExtraData): Promise<FacetRuntimeEvent[]> {
  const events: FacetRuntimeEvent[] = [];
  const ctx = {
    data: { ...data, values: [...data.values] },
    cancelled: false,
    async emit(event: FacetRuntimeEvent): Promise<void> {
      events.push(event);
    },
    metric(): void {},
    // 재생을 마친 뒤의 대기는 곧 취소로 본다 — 한 바퀴만 재고 끝낸다.
    async waitForInput(): Promise<never> {
      throw new Error('cancelled');
    },
    pollInput(): null {
      return null;
    },
    async sleep(): Promise<boolean> {
      return true;
    },
  };
  try {
    await inPlaceVsExtra(ctx as unknown as FacetContext<InPlaceVsExtraData>);
  } catch (err) {
    if ((err as Error).message !== 'cancelled') throw err;
  }
  return events;
}

type RoundPayload = {
  inPlaceAfter: number[];
  outAfter: number[];
  inPlaceExtra: number;
  extraExtra: number;
};

type DonePayload = {
  result: number[];
  inPlaceExtra: number;
  extraExtra: number;
};

describe('inPlaceVsExtra', () => {
  it('두 방식이 같은 순서에 닿는다', async () => {
    const events = await runOnce(DATA);
    const done = events.find((e) => e.type === 'done')?.payload as DonePayload;
    const rounds = events.filter((e) => e.type === 'round').map((e) => e.payload as RoundPayload);

    expect(done.result).toEqual([1, 3, 5, 8]);
    expect(rounds[rounds.length - 1].inPlaceAfter).toEqual(done.result);
    expect(rounds[rounds.length - 1].outAfter).toEqual(done.result);
    expect(computeInPlaceVsExtraResult(DATA)).toEqual([1, 3, 5, 8]);
  });

  it('제자리는 한 칸, 빌리는 쪽은 원본만큼 더 쓴다', async () => {
    const events = await runOnce(DATA);
    const done = events.find((e) => e.type === 'done')?.payload as DonePayload;
    const rounds = events.filter((e) => e.type === 'round').map((e) => e.payload as RoundPayload);

    expect(done.inPlaceExtra).toBe(1);
    expect(done.extraExtra).toBe(DATA.values.length);
    // 제자리 쪽은 라운드가 몇 번이든 하나에서 멈추고, 빌리는 쪽은 한 칸씩 는다.
    expect(rounds.map((r) => r.inPlaceExtra)).toEqual([1, 1, 1, 1]);
    expect(rounds.map((r) => r.extraExtra)).toEqual([1, 2, 3, 4]);
  });

  it('걸음은 시작 · 라운드 넷 · 마무리다', async () => {
    const events = await runOnce(DATA);
    expect(events.map((e) => e.type)).toEqual([
      'begin',
      'round',
      'round',
      'round',
      'round',
      'done',
    ]);
  });

  it('재생을 마친 뒤 처음 누르는 advance 는 되감고 첫 걸음까지 보인다', async () => {
    // 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
    const events: FacetRuntimeEvent[] = [];
    let advances = 3;
    const ctx = {
      data: { ...DATA, values: [...DATA.values] },
      cancelled: false,
      async emit(event: FacetRuntimeEvent): Promise<void> {
        events.push(event);
      },
      metric(): void {},
      async waitForInput(): Promise<{ type: string }> {
        if (advances-- <= 0) throw new Error('cancelled');
        return { type: 'advance' };
      },
      pollInput(): null {
        return null;
      },
      async sleep(): Promise<boolean> {
        return true;
      },
    };
    try {
      await inPlaceVsExtra(ctx as unknown as FacetContext<InPlaceVsExtraData>);
    } catch (err) {
      if ((err as Error).message !== 'cancelled') throw err;
    }
    expect(events.map((e) => e.type)).toEqual([
      'begin',
      'round',
      'round',
      'round',
      'round',
      'done',
      // 첫 누름 — 되감고 곧바로 첫 걸음.
      'rewind',
      'begin',
      // 그 뒤로는 한 번에 한 걸음.
      'round',
      'round',
    ]);
  });
});
