/**
 * 화면에 뜨는 수가 참값과 같은지 잰다.
 *
 * 근거의 정본은 스크래치가 아니라 이 파일이다 — 밑과 지수를 `facet.ts` 에서
 * 읽어 그 자리에서 다시 셈하므로, 선언이 바뀌면 여기가 같이 움직인다 (S-piece).
 *
 * 잠그는 것 넷.
 *   1. 답이 3¹³ 과 같은가 (1594323).
 *   2. 곱셈이 여섯 번인가 — 제곱 셋 + 답곱 셋. 하나씩 곱으면 열둘.
 *   3. 지수의 이진수 1101 과 답에 곱한 제곱이 대응하는가.
 *   4. 재생을 마친 뒤 처음 누르는 advance 가 되감고 첫 걸음까지 가는가.
 */

import { describe, expect, it } from 'vitest';
import type { FacetContext, FacetRuntimeEvent } from '@ffacet/core/runtime';
import { squareAndHalve, type SquareAndHalveData } from '../src/algorithm.js';
import { squareAndHalveFacet } from '../src/facet.js';

/** 선언에서 읽는다. 수를 이 파일에 옮겨 적으면 대조가 아니라 복사가 된다. */
const declared = squareAndHalveFacet.initialData as unknown as SquareAndHalveData;
const BASE = declared.base;
const EXPONENT = declared.exponent;
const DATA: SquareAndHalveData = { ...declared, stepMs: 0 };

type TakePayload = { place: number; count: number; factor: number; product: number };
type SkipPayload = { place: number; count: number };
type FoldPayload = { row: number; count: number; value: number };
type DonePayload = {
  product: number;
  squarings: number;
  multiplies: number;
  total: number;
  naive: number;
  bits: number[];
};

/** 자동 재생 한 바퀴만 돌리고 멈추는 최소 컨텍스트. */
async function runOnce(advances = 0): Promise<FacetRuntimeEvent[]> {
  const events: FacetRuntimeEvent[] = [];
  let left = advances;
  const ctx = {
    data: { ...DATA },
    cancelled: false,
    async emit(event: FacetRuntimeEvent): Promise<void> {
      events.push(event);
    },
    metric(): void {},
    // 재생을 마친 뒤의 대기는 곧 취소로 본다 — 정해진 만큼만 더 짚고 끝낸다.
    async waitForInput(): Promise<{ type: string }> {
      if (left <= 0) throw new Error('cancelled');
      left -= 1;
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
    await squareAndHalve(ctx as unknown as FacetContext<SquareAndHalveData>);
  } catch (err) {
    if ((err as Error).message !== 'cancelled') throw err;
  }
  return events;
}

function payloads<T>(events: FacetRuntimeEvent[], type: string): T[] {
  return events.filter((e) => e.type === type).map((e) => e.payload as T);
}

describe('squareAndHalve', () => {
  it('선언이 밑과 지수만 준다 — 파생값은 어디에도 적혀 있지 않다', () => {
    expect(Object.keys(declared).sort()).toEqual(['base', 'exponent', 'stepMs', 'type']);
    expect(BASE).toBeGreaterThan(0);
    expect(EXPONENT).toBeGreaterThan(0);
  });

  it('답이 참값과 같다', async () => {
    const events = await runOnce();
    const done = payloads<DonePayload>(events, 'done')[0];
    expect(done).toBeDefined();

    // 참값은 여기서 따로 셈한다 — 알고리즘의 답을 그대로 받아 적지 않는다.
    let truth = 1;
    for (let i = 0; i < EXPONENT; i += 1) truth *= BASE;
    expect(done!.product).toBe(truth);
    // 사양의 대조값. 3¹³ = 1594323.
    expect(truth).toBe(1594323);
  });

  it('곱셈은 제곱 셋 + 답곱 셋이고, 하나씩 곱으면 열두 번이다', async () => {
    const events = await runOnce();
    const done = payloads<DonePayload>(events, 'done')[0]!;
    const folds = payloads<FoldPayload>(events, 'fold');
    const takes = payloads<TakePayload>(events, 'take');

    // 제곱은 접은 횟수이고 답곱은 보낸 칸의 수다. 셈이 아니라 걸음을 센 것이다.
    expect(done.squarings).toBe(folds.length);
    expect(done.multiplies).toBe(takes.length);
    expect(done.total).toBe(folds.length + takes.length);
    expect(done.total).toBe(6);
    expect(done.naive).toBe(EXPONENT - 1);
    expect(done.naive).toBe(12);
  });

  it('지수의 이진수와 답에 곱한 제곱이 대응한다', async () => {
    const events = await runOnce();
    const done = payloads<DonePayload>(events, 'done')[0]!;
    const takes = payloads<TakePayload>(events, 'take');
    const skips = payloads<SkipPayload>(events, 'skip');

    // 큰 자리부터 적은 이진 표기. 13 → 1101.
    expect(done.bits.join('')).toBe(EXPONENT.toString(2));
    expect(done.bits.join('')).toBe('1101');

    // 1 이 선 자리의 자릿값이 곧 보낸 칸의 폭이고, 그 폭을 다 더하면 지수다.
    const places = takes.map((t) => t.place);
    expect(places).toEqual([1, 4, 8]);
    expect(places.reduce((a, b) => a + b, 0)).toBe(EXPONENT);

    // 0 이 선 자리는 아무것도 보내지 않은 자리다.
    expect(skips.map((s) => s.place)).toEqual([2]);

    // 보낸 칸의 값은 그 자릿값만큼의 거듭제곱이다 — 3¹ · 3⁴ · 3⁸.
    for (const take of takes) {
      let power = 1;
      for (let i = 0; i < take.place; i += 1) power *= BASE;
      expect(take.factor).toBe(power);
    }
    expect(takes.map((t) => t.factor)).toEqual([3, 81, 6561]);

    // 그 셋을 곱한 것이 답이다.
    const product = takes.reduce((a, t) => a * t.factor, 1);
    expect(product).toBe(done.product);
  });

  it('접을 때마다 칸 수는 반이 되고 칸 값은 제곱이 된다', async () => {
    const events = await runOnce();
    const folds = payloads<FoldPayload>(events, 'fold');
    expect(folds.map((f) => f.count)).toEqual([6, 3, 1]);
    expect(folds.map((f) => f.value)).toEqual([9, 81, 6561]);
    expect(folds.map((f) => f.row)).toEqual([1, 2, 3]);
  });

  it('걸음은 시작 · 홀짝 넷 · 접기 셋 · 마무리다', async () => {
    const events = await runOnce();
    expect(events.map((e) => e.type)).toEqual([
      'begin',
      'take', // 13 은 홀수
      'fold',
      'skip', // 6 은 짝수
      'fold',
      'take', // 3 은 홀수
      'fold',
      'take', // 1 은 홀수
      'done',
    ]);
  });

  it('재생을 마친 뒤 처음 누르는 advance 는 되감고 첫 걸음까지 보인다', async () => {
    // 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
    const events = await runOnce(3);
    const tail = events.slice(events.indexOf(events.find((e) => e.type === 'done')!));
    expect(tail.map((e) => e.type)).toEqual([
      'done',
      // 첫 누름 — 되감고 곧바로 첫 걸음.
      'rewind',
      'begin',
      // 그 뒤로는 한 번에 한 걸음.
      'take',
      'fold',
    ]);
  });
});
