/**
 * 화면에 뜨는 수가 사실인가 — 그 근거를 여기 둔다.
 *
 * 배치 사양이 약수 아홉과 짝 다섯을 대조용으로 적어 두었지만, 그것을 코드로
 * 옮겨 적으면 호스트의 오타가 그대로 화면이 된다. 그래서 **`facet.ts` 에서 n 을
 * 읽어 이 자리에서 다시 셈한다** — 1..n 을 낱낱이 훑는 다른 방법으로 구한 약수
 * 집합과, 알고리즘이 √n 까지만 훑어 내놓은 짝을 견준다. 둘이 같다는 것이 곧 이
 * 조각의 주장이다.
 *
 * ── 장면 방식으로 옮기면서 무엇이 달라졌나
 *
 * 걸음의 payload 가 전부 비었으므로 `e.payload['d']` 를 읽던 자리가 죽었다.
 * 그 단언들이 재던 것은 payload 의 수가 아니라 **화면이 말하는 수**였으므로,
 * 발신을 `reduce` 에 먹여 장면을 쌓고 **그 장면**에서 같은 것을 잰다. 화면이
 * 읽는 것과 같은 자료를 재므로 오히려 조인다.
 *
 * 옛 단언 하나는 아무것도 재지 않고 있었다 — "덮는 자리는 √n 바로 다음 칸" 이
 * algorithm 이 `limit + 1` 로 실은 수를 테스트가 **같은 식으로 다시 셈해** 견주는
 * 동어반복이었다. 지금은 화면의 표식을 세어 "짚은 자리가 정확히 1..√n 이고 그
 * 너머는 하나도 짚지 않았다" 를 잰다.
 */

import { describe, expect, it } from 'vitest';
import type { FacetContext, FacetRuntimeEvent } from '@ffacet/core/runtime';
import { divisorPairsSqrtFacet } from '../src/facet.js';
import {
  divisorPairsSqrtAlgorithm,
  sqrtLimit,
  type DivisorPairsSqrtData,
} from '../src/algorithm.js';
import {
  axisShown,
  captionOf,
  cellsOf,
  divisorPairsSqrtScene,
  pairsOf,
  type DivisorPairsSqrtScene,
} from '../src/scene.js';

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

/** 발신을 장면으로 쌓는다. 첫 장면부터 걸음마다 하나씩, 러너와 같은 순서로. */
function scenesOf(events: Emitted[]): DivisorPairsSqrtScene[] {
  const scenes = [divisorPairsSqrtScene.initial(divisorPairsSqrtFacet.initialData)];
  for (const e of events) {
    scenes.push(
      divisorPairsSqrtScene.reduce(
        scenes[scenes.length - 1],
        e as unknown as FacetRuntimeEvent,
      ),
    );
  }
  return scenes;
}

/** 다 굴린 뒤의 화면. 조각의 주장이 여기 남아 있어야 한다. */
async function finalScene(n: number): Promise<DivisorPairsSqrtScene> {
  const scenes = scenesOf(await play(n));
  return scenes[scenes.length - 1];
}

/** 낱낱이 훑어 구한 약수 — 알고리즘과 다른 방법이어야 견줌에 뜻이 있다. */
function divisorsByBruteForce(n: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= n; k += 1) if (n % k === 0) out.push(k);
  return out;
}

const n = divisorPairsSqrtFacet.initialData['n'] as number;

describe('약수의 짝', () => {
  it('1차 데이터는 n 하나다 — 약수도 짝도 √n 도 선언에 없다', () => {
    expect(typeof n).toBe('number');
    expect(n).toBeGreaterThan(1);
    // 선언에 든 것은 종류 · 수 · 읽을 시간뿐이다. 약수 목록이나 걸음표를 손으로
    // 적어 두면 화면과 다른 출처가 하나 더 생긴다 (S-piece).
    expect(Object.keys(divisorPairsSqrtFacet.initialData).sort()).toEqual([
      'n',
      'stepMs',
      'type',
    ]);
  });

  it('걸음은 아무 수도 싣지 않는다 — payload 가 전부 비어 있다', async () => {
    const events = await play(n);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(Object.keys(e.payload)).toEqual([]);
  });

  it('√n 까지만 훑어도 약수를 하나도 놓치지 않는다', async () => {
    const scene = await finalScene(n);
    const found = new Set<number>();
    for (const { d, q } of pairsOf(scene)) {
      found.add(d);
      found.add(q);
    }
    expect([...found].sort((a, b) => a - b)).toEqual(divisorsByBruteForce(n));
  });

  it('짝의 두 쪽을 곱하면 n 이고, 작은 쪽은 언제나 √n 이하다', async () => {
    const scene = await finalScene(n);
    const pairs = pairsOf(scene);
    expect(pairs.length).toBeGreaterThan(0);
    for (const { d, q } of pairs) {
      expect(d * q).toBe(n);
      expect(d).toBeLessThanOrEqual(sqrtLimit(n));
    }
  });

  it('제곱수에서는 자기 자신과 짝을 이루는 칸이 √n 위에 하나 선다', async () => {
    const scene = await finalScene(n);
    const selfPairs = pairsOf(scene).filter((p) => p.d === p.q);
    const limit = sqrtLimit(n);
    if (limit * limit === n) {
      expect(selfPairs).toHaveLength(1);
      expect(selfPairs[0]?.d).toBe(limit);
    } else {
      expect(selfPairs).toHaveLength(0);
    }
    // 접는 자리는 어느 쪽이든 선다 — 자리를 자기 짝에서 얻지 않기 때문이다.
    expect(axisShown(scene)).toBe(true);
  });

  /**
   * 이 조각의 주장이 다 끝난 화면에 남아 있는가.
   *
   * 옮기기 전에는 `miss` 가 칠을 통째로 되돌려, 짚었는데 약수가 아니었던 칸이
   * 아예 안 본 칸과 같은 모양이었다. 그래서 "몇 자리를 보았나" 가 세어지지 않았다.
   */
  it('짚은 자리가 완주 화면에 남고, 그 수가 정확히 √n 이다', async () => {
    const scene = await finalScene(n);
    const cells = cellsOf(scene);
    const probed = cells.flatMap((cell, i) => (cell.mark === 'probed' ? [i + 1] : []));
    const limit = sqrtLimit(n);
    expect(probed).toEqual(Array.from({ length: limit }, (_, i) => i + 1));
    // 짚은 자리 가운데 약수가 아니었던 칸도 표식을 단 채 남는다.
    const probedMiss = probed.filter((v) => n % v !== 0);
    expect(probedMiss.length).toBeGreaterThan(0);
    for (const v of probedMiss) expect(cells[v - 1].fill).toBe('plain');
    // 그리고 그 칸은 아예 안 본 칸과 표식으로 갈린다.
    const untouched = cells.flatMap((cell, i) => (cell.mark === 'none' ? [i + 1] : []));
    for (const v of probedMiss) expect(untouched).not.toContain(v);
  });

  it('√n 너머는 하나도 짚지 않고, 짝으로 알게 된 자리가 덮인 표식을 단다', async () => {
    const scene = await finalScene(n);
    expect(scene.covered).toBe(true);
    const cells = cellsOf(scene);
    const limit = sqrtLimit(n);
    const covered = cells.flatMap((cell, i) => (cell.mark === 'covered' ? [i + 1] : []));
    // 덮인 자리는 전부 √n 너머이고, 전부 약수이며, 짝의 큰 쪽 그대로다.
    for (const v of covered) {
      expect(v).toBeGreaterThan(limit);
      expect(n % v).toBe(0);
      expect(cells[v - 1].fill).toBe('moved');
    }
    expect(covered).toEqual(pairsOf(scene).filter((p) => p.q !== p.d).map((p) => p.q).sort((a, b) => a - b));
    // √n 너머에는 짚은 표식이 하나도 없다 — 그것이 이 조각의 결론이다.
    for (let v = limit + 1; v <= n; v += 1) expect(cells[v - 1].mark).not.toBe('probed');
  });

  it('되감으면 바탕만 남는다', async () => {
    const events = await play(n);
    const scenes = scenesOf(events);
    const rewound = divisorPairsSqrtScene.reduce(scenes[scenes.length - 1], {
      type: 'rewind',
    } as unknown as FacetRuntimeEvent);
    expect(rewound).toEqual(scenes[0]);
  });

  /**
   * 선언한 문안이 고정 데이터에서 한 번은 떠야 한다. 어느 갈래가 안 일어나면
   * 그 캡션은 코드에만 있는 죽은 문장이 된다 (배치 공통 지침).
   */
  it('선언한 캡션의 다섯 갈래가 n = 36 에서 모두 일어난다', async () => {
    const scenes = scenesOf(await play(n));
    const kinds = new Set(scenes.map((s) => captionOf(s)?.kind).filter((k) => k !== undefined));
    expect([...kinds].sort()).toEqual(['miss', 'pair', 'probe', 'self', 'stop']);

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
