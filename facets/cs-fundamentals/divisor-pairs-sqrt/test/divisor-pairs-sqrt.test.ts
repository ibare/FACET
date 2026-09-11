/**
 * 화면에 뜨는 수가 사실인가 — 그 근거를 여기 둔다.
 *
 * 배치 사양이 약수 아홉과 짝 다섯을 대조용으로 적어 두었지만, 그것을 코드로
 * 옮겨 적으면 호스트의 오타가 그대로 화면이 된다. 그래서 **`facet.ts` 에서 n 을
 * 읽어 이 자리에서 다시 셈한다** — 1..n 을 낱낱이 훑는 다른 방법으로 구한 약수
 * 집합과, 알고리즘이 √n 까지만 훑어 내놓은 짝을 견준다. 둘이 같다는 것이 곧 이
 * 조각의 주장이다.
 */

import { describe, expect, it } from 'vitest';
import type { FacetContext } from '@ffacet/core/runtime';
import { divisorPairsSqrtFacet } from '../src/facet.js';
import {
  divisorPairsSqrtAlgorithm,
  type DivisorPairsSqrtData,
} from '../src/algorithm.js';

type Emitted = { type: string; payload: Record<string, unknown> };

/** 자동 재생을 끝까지 굴리고, 입력 대기에 들어서면 취소로 끊는다. */
async function play(n: number): Promise<Emitted[]> {
  const events: Emitted[] = [];
  let cancelled = false;
  const ctx = {
    data: { type: 'divisor-pairs-sqrt', n, stepMs: 0 },
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(event: { type: string; payload?: unknown }): Promise<void> {
      events.push({ type: event.type, payload: (event.payload ?? {}) as Record<string, unknown> });
    },
    metric(): void {
      throw new Error('조각은 ctx.metric 을 부르지 않는다 (S-piece)');
    },
    async sleep(): Promise<boolean> {
      return true;
    },
    pollInput(): null {
      return null;
    },
    async waitForInput(): Promise<never> {
      cancelled = true;
      throw new Error('cancelled');
    },
  };
  await divisorPairsSqrtAlgorithm(ctx as unknown as FacetContext<DivisorPairsSqrtData>);
  return events;
}

/** 낱낱이 훑어 구한 약수 — 알고리즘과 다른 방법이어야 견줌에 뜻이 있다. */
function divisorsByBruteForce(n: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= n; k += 1) if (n % k === 0) out.push(k);
  return out;
}

const n = divisorPairsSqrtFacet.initialData['n'] as number;

describe('약수의 짝', () => {
  it('1차 데이터는 n 하나이고 그 수로만 셈한다', () => {
    expect(typeof n).toBe('number');
    expect(n).toBeGreaterThan(1);
  });

  it('√n 까지만 훑어도 약수를 하나도 놓치지 않는다', async () => {
    const events = await play(n);
    const pairs = events
      .filter((e) => e.type === 'pair')
      .map((e) => [e.payload['d'] as number, e.payload['q'] as number] as const);

    const found = new Set<number>();
    for (const [d, q] of pairs) {
      found.add(d);
      found.add(q);
    }
    expect([...found].sort((a, b) => a - b)).toEqual(divisorsByBruteForce(n));
  });

  it('짝의 두 쪽을 곱하면 n 이고, 작은 쪽은 언제나 √n 이하다', async () => {
    const events = await play(n);
    const pairs = events
      .filter((e) => e.type === 'pair')
      .map((e) => [e.payload['d'] as number, e.payload['q'] as number] as const);

    expect(pairs.length).toBeGreaterThan(0);
    for (const [d, q] of pairs) {
      expect(d * q).toBe(n);
      expect(d).toBeLessThanOrEqual(Math.sqrt(n));
      expect(q).toBeGreaterThanOrEqual(d);
    }
  });

  it('제곱수에서는 자기 자신과 짝을 이루는 칸이 √n 위에 하나 선다', async () => {
    const root = Math.sqrt(n);
    const events = await play(n);
    const selfPairs = events.filter((e) => e.type === 'pair' && e.payload['self'] === true);
    if (Number.isInteger(root)) {
      expect(selfPairs).toHaveLength(1);
      expect(selfPairs[0]?.payload['d']).toBe(root);
      expect(selfPairs[0]?.payload['q']).toBe(root);
    } else {
      expect(selfPairs).toHaveLength(0);
    }
  });

  it('덮는 자리는 √n 바로 다음 칸이다', async () => {
    const events = await play(n);
    const cover = events.filter((e) => e.type === 'cover');
    expect(cover).toHaveLength(1);
    expect(cover[0]?.payload['from']).toBe(Math.floor(Math.sqrt(n)) + 1);
  });

  /**
   * 선언한 문안이 고정 데이터에서 한 번은 떠야 한다. 어느 갈래가 안 일어나면
   * 그 캡션은 코드에만 있는 죽은 문장이 된다 (배치 공통 지침).
   */
  it('선언한 캡션의 다섯 갈래가 n = 36 에서 모두 일어난다', async () => {
    const events = await play(n);
    const kinds = new Set(events.map((e) => e.type));
    expect(kinds.has('probe')).toBe(true);
    expect(kinds.has('pair')).toBe(true);
    expect(kinds.has('miss')).toBe(true);
    expect(kinds.has('cover')).toBe(true);
    expect(events.some((e) => e.type === 'pair' && e.payload['self'] === true)).toBe(true);

    // 문안 다섯이 모두 선언되어 있는가 (caption.probe · pair · miss · self · stop).
    const keys = Object.keys(divisorPairsSqrtFacet.messages ?? {}).sort();
    expect(keys).toEqual([
      'caption.miss',
      'caption.pair',
      'caption.probe',
      'caption.self',
      'caption.stop',
    ]);
  });
});
