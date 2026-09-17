/**
 * 화면에 뜨는 수가 참값과 같은지 잰다.
 *
 * 근거의 정본은 스크래치가 아니라 이 파일이다 — 밑과 지수를 `facet.ts` 에서
 * 읽어 그 자리에서 다시 셈하므로, 선언이 바뀌면 여기가 같이 움직인다 (S-piece).
 *
 * ── 장면 이행으로 재는 자리가 옮겨졌다
 *
 * 옛 검사는 발신의 payload 를 들여다봤다. 그 수들이 이제 payload 에 없다 — 화면이
 * 쓰는 수는 전부 **장면이 자취에서 센다** (`scene.ts`). 그래서 여기서도 실제
 * 발신을 `reduce` 에 먹여 장면을 쌓은 뒤 그 장면이 내는 수를 참값과 견준다.
 * 재는 대상이 "알고리즘이 스스로 적어 보낸 수" 에서 "화면이 세는 수" 로 바뀌었고,
 * 그것이 이 조각에서 재야 할 것이다.
 *
 * 옛 검사에는 아무것도 재지 못하는 단언이 둘 있었다. `folds.map(f => f.row)` 가
 * `[1,2,3]` 인지 보는 것은 `row` 가 정의상 접은 횟수라 늘 참이었고,
 * `done.squarings === folds.length` 도 그 변수가 fold 마다 하나씩 오르던 값이라
 * 같은 셈을 두 번 적은 것이었다. 지금은 **줄의 수**(장면)와 **fold 발신 수**(알고리즘)
 * 라는 서로 다른 구조를 견주므로 실제로 갈릴 수 있는 단언이 된다.
 *
 * 잠그는 것 다섯.
 *   1. 답이 3¹³ 과 같은가 (1594323).
 *   2. 곱셈이 여섯 번인가 — 제곱 셋 + 답곱 셋. 하나씩 곱으면 열둘.
 *   3. 지수의 이진수 1101 과 답에 곱한 제곱이 대응하는가.
 *   4. 되감기가 바탕만 남기는가 — 되감은 장면이 첫 장면과 같은가.
 *   5. 재생을 마친 뒤 처음 누르는 advance 가 되감고 첫 걸음까지 가는가.
 */

import { describe, expect, it } from 'vitest';
import type { FacetContext, FacetRuntimeEvent } from '@ffacet/core/runtime';
import { squareAndHalve, type SquareAndHalveData } from '../src/algorithm.js';
import { squareAndHalveFacet } from '../src/facet.js';
import {
  bitsOf,
  enteringCountOf,
  multipliesOf,
  naiveOf,
  productOf,
  slotCountOf,
  squareAndHalveScene,
  squaringsOf,
  takenOf,
  totalOf,
  unitsAt,
  type SquareAndHalveScene,
} from '../src/scene.js';

/** 선언에서 읽는다. 수를 이 파일에 옮겨 적으면 대조가 아니라 복사가 된다. */
const declared = squareAndHalveFacet.initialData as unknown as SquareAndHalveData;
const BASE = declared.base;
const EXPONENT = declared.exponent;
const DATA: SquareAndHalveData = { ...declared, stepMs: 0 };

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

/** 실제 발신을 장면으로 쌓는다. 화면이 보는 것과 같은 자료가 된다. */
function sceneOf(events: FacetRuntimeEvent[]): SquareAndHalveScene {
  return events.reduce(
    (scene, event) => squareAndHalveScene.reduce(scene, event),
    squareAndHalveScene.initial(declared),
  );
}

function countOf(events: FacetRuntimeEvent[], type: string): number {
  return events.filter((e) => e.type === type).length;
}

describe('squareAndHalve', () => {
  it('선언이 밑과 지수만 준다 — 파생값은 어디에도 적혀 있지 않다', () => {
    expect(Object.keys(declared).sort()).toEqual(['base', 'exponent', 'stepMs', 'type']);
    expect(BASE).toBeGreaterThan(0);
    expect(EXPONENT).toBeGreaterThan(0);
  });

  it('걸음이 실어 오는 것은 제곱값 하나뿐이다', async () => {
    const events = await runOnce();
    for (const event of events) {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      // fold 만 value 를 싣고 나머지는 빈 손이다. 화면에 뜨는 수가 발신과 자취라는
      // 두 출처를 갖지 않게 하는 것이 이 조각의 이행에서 한 일이다.
      expect(Object.keys(payload)).toEqual(event.type === 'fold' ? ['value'] : []);
    }
  });

  it('답이 참값과 같다', async () => {
    const scene = sceneOf(await runOnce());

    // 참값은 여기서 따로 셈한다 — 화면이 낸 답을 그대로 받아 적지 않는다.
    let truth = 1;
    for (let i = 0; i < EXPONENT; i += 1) truth *= BASE;
    expect(productOf(scene)).toBe(truth);
    // 사양의 대조값. 3¹³ = 1594323.
    expect(truth).toBe(1594323);
  });

  it('곱셈은 제곱 셋 + 답곱 셋이고, 하나씩 곱으면 열두 번이다', async () => {
    const events = await runOnce();
    const scene = sceneOf(events);

    // 장면은 **줄의 수**로 제곱을 세고 **앉은 칩의 수**로 답곱을 센다. 발신 수와
    // 견주는 것은 서로 다른 두 구조를 견주는 것이다.
    expect(squaringsOf(scene)).toBe(countOf(events, 'fold'));
    expect(multipliesOf(scene)).toBe(countOf(events, 'take'));
    expect(squaringsOf(scene)).toBe(3);
    expect(multipliesOf(scene)).toBe(3);
    expect(totalOf(scene)).toBe(6);
    expect(naiveOf(scene)).toBe(EXPONENT - 1);
    expect(naiveOf(scene)).toBe(12);
  });

  it('지수의 이진수와 답에 곱한 제곱이 대응한다', async () => {
    const scene = sceneOf(await runOnce());
    const taken = takenOf(scene);

    // 큰 자리부터 적은 이진 표기. 13 → 1101.
    expect(bitsOf(scene).join('')).toBe(EXPONENT.toString(2));
    expect(bitsOf(scene).join('')).toBe('1101');
    // 자리표의 자리 수만큼 판정이 다 갈렸다 — 빈 자리 없이 1101 네 자리다.
    expect(scene.places.length).toBe(slotCountOf(scene));

    // 1 이 선 자리의 자릿값이 곧 보낸 칸의 폭이고, 그 폭을 다 더하면 지수다.
    const places = taken.map((t) => t.place);
    expect(places).toEqual([1, 4, 8]);
    expect(places.reduce((a, b) => a + b, 0)).toBe(EXPONENT);

    // 0 이 선 자리는 아무것도 보내지 않은 자리다.
    const skipped = scene.places
      .map((place, row) => (place === 'skip' ? unitsAt(row) : null))
      .filter((place): place is number => place !== null);
    expect(skipped).toEqual([2]);

    // 보낸 칸의 값은 그 자릿값만큼의 거듭제곱이다 — 3¹ · 3⁴ · 3⁸.
    for (const one of taken) {
      let power = 1;
      for (let i = 0; i < one.place; i += 1) power *= BASE;
      expect(one.factor).toBe(power);
    }
    expect(taken.map((t) => t.factor)).toEqual([3, 81, 6561]);

    // 그 셋을 곱한 것이 답이다.
    expect(taken.reduce((a, t) => a * t.factor, 1)).toBe(productOf(scene));
  });

  it('접을 때마다 칸 수는 반이 되고 칸 값은 제곱이 된다', async () => {
    const scene = sceneOf(await runOnce());

    // 줄이 처음 섰을 때의 칸 수. 답으로 보낸 칸이 빠지기 전의 수다.
    expect(scene.rows.map((_, r) => enteringCountOf(scene, r))).toEqual([13, 6, 3, 1]);
    expect(scene.rows.map((row) => row.value)).toEqual([3, 9, 81, 6561]);
    // 줄의 칸 하나가 덮는 지수 폭은 줄마다 두 배가 된다.
    expect(scene.rows.map((_, r) => unitsAt(r))).toEqual([1, 2, 4, 8]);
    // 그리고 그 폭에 선 칸 수를 곱하면 그 줄에 남은 지수다 — 13 · 12 · 12 · 8.
    expect(scene.rows.map((row, r) => row.count * unitsAt(r))).toEqual([12, 12, 8, 0]);
  });

  it('되감기는 바탕만 남긴다', async () => {
    const scene = sceneOf(await runOnce());
    const rewound = squareAndHalveScene.reduce(scene, {
      type: 'rewind',
      payload: {},
    } as FacetRuntimeEvent);

    // 걸어온 자취가 하나도 남지 않고 첫 장면과 글자까지 같아야 한다. 남으면 되감은
    // 화면이 이미 접힌 줄을 단 채로 서고 그 위에 algorithm 이 처음부터 다시 밟는다.
    expect(rewound).toEqual(squareAndHalveScene.initial(declared));
    expect(rewound.rows).toEqual([]);
    expect(rewound.places).toEqual([]);
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
