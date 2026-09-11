/**
 * 화면에 뜨는 답이 사실인가 — 그 근거를 여기 둔다.
 *
 * 배치 사양이 "국어 1교시 · 수학 2교시 · 영어 3교시 · 과학 1교시 · 역사 2교시,
 * 필요한 교시 셋" 을 대조용으로 적어 두었지만 그것을 옮겨 적으면 저작자의 오타가
 * 그대로 화면이 된다. 그래서 **`facet.ts` 에서 구조(과목 다섯 · 겹침 여섯)만 읽어
 * 이 자리에서 다시 셈한다.**
 *
 * 두 가지를 다른 방법으로 확인한다.
 *   1. 겹치는 쌍이 같은 교시에 놓인 적이 없는가 — 색칠이 **옳은가**.
 *   2. 그 교시 수보다 적게 쓰는 길이 정말 없는가 — 모든 배정을 낱낱이 훑어
 *      최소를 구하고 알고리즘의 답과 견준다. 알고리즘은 이웃이 안 쓴 가장 작은
 *      번호를 주는 식이라 일반적으로 최소를 보장하지 않는다. 이 그래프에서 둘이
 *      같다는 것은 여기서 재야 알 수 있다.
 */

import { describe, expect, it } from 'vitest';
import type { FacetContext } from '@ffacet/core/runtime';
import { reduceToKnownFacet } from '../src/facet.js';
import { reduceToKnownAlgorithm, type ReduceToKnownData } from '../src/algorithm.js';

type Emitted = { type: string; payload: Record<string, unknown> };

/** 자동 재생을 끝까지 굴리고, 입력 대기에 들어서면 취소로 끊는다. */
async function play(data: ReduceToKnownData): Promise<Emitted[]> {
  const events: Emitted[] = [];
  let cancelled = false;
  const ctx = {
    data,
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(event: { type: string; payload?: unknown }): Promise<void> {
      events.push({
        type: event.type,
        payload: (event.payload ?? {}) as Record<string, unknown>,
      });
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
  await reduceToKnownAlgorithm(ctx as unknown as FacetContext<ReduceToKnownData>);
  return events;
}

const initial = reduceToKnownFacet.initialData;
const subjects = initial['subjects'] as string[];
const overlaps = initial['overlaps'] as Array<[string, string]>;
const stepMs = initial['stepMs'] as number;

const data: ReduceToKnownData = {
  type: 'reduce-to-known',
  subjects,
  overlaps,
  stepMs: 0,
};

/** k 색으로 칠할 수 있는가 — 모든 배정을 낱낱이 훑는다 (k^n, 여기서는 최대 3125). */
function colorableWith(k: number): boolean {
  const n = subjects.length;
  const total = k ** n;
  for (let code = 0; code < total; code += 1) {
    const assign = new Map<string, number>();
    let rest = code;
    for (let i = 0; i < n; i += 1) {
      assign.set(subjects[i]!, (rest % k) + 1);
      rest = Math.floor(rest / k);
    }
    if (overlaps.every(([a, b]) => assign.get(a) !== assign.get(b))) return true;
  }
  return false;
}

function fewestSlots(): number {
  for (let k = 1; k <= subjects.length; k += 1) if (colorableWith(k)) return k;
  return subjects.length;
}

describe('1차 데이터', () => {
  it('과목과 겹침만 선언되어 있고 답은 없다', () => {
    expect(subjects).toHaveLength(5);
    expect(new Set(subjects).size).toBe(5);
    expect(overlaps).toHaveLength(6);

    for (const [a, b] of overlaps) {
      expect(subjects).toContain(a);
      expect(subjects).toContain(b);
      expect(a).not.toBe(b);
    }
    // 같은 쌍이 두 번 적히면 선이 겹쳐 그려진다.
    const seen = new Set(overlaps.map(([a, b]) => [a, b].sort().join('-')));
    expect(seen.size).toBe(6);

    // 교시 배정이나 교시 수가 선언에 스며들지 않았는가.
    expect(Object.keys(initial).sort()).toEqual(['overlaps', 'stepMs', 'subjects', 'type']);
    expect(initial['type']).toBe('reduce-to-known');
  });

  it('걸음 간격이 벽시계 바닥선을 받친다', () => {
    // 가장 얇은 걸음은 카드 비행 540ms 가 붙는 `place` 다. 540 + stepMs 가
    // 800ms 를 넘어야 캡션을 읽을 틈이 생긴다 (S-piece).
    expect(typeof stepMs).toBe('number');
    expect(540 + stepMs).toBeGreaterThan(800);
  });
});

describe('옮겨 앉는다', () => {
  it('과목마다 한 번씩, 선언한 차례대로 마디 자리로 간다', async () => {
    const events = await play(data);
    expect(events[0]?.type).toBe('board');

    const placed = events.filter((e) => e.type === 'place').map((e) => e.payload['subject']);
    expect(placed).toEqual(subjects);
  });

  it('겹침 여섯이 저마다 한 번씩만 선이 된다', async () => {
    const events = await play(data);

    const drawn: string[] = [];
    for (const e of events) {
      if (e.type !== 'place') continue;
      const subject = e.payload['subject'] as string;
      for (const other of e.payload['linkedTo'] as string[]) {
        drawn.push([subject, other].sort().join('-'));
      }
    }
    expect(drawn).toHaveLength(6);
    expect(new Set(drawn).size).toBe(6);
    expect([...drawn].sort()).toEqual(
      overlaps.map(([a, b]) => [a, b].sort().join('-')).sort(),
    );
  });

  it('선은 두 끝이 다 옮겨 앉은 뒤에만 그어진다', async () => {
    const events = await play(data);
    const seated = new Set<string>();
    for (const e of events) {
      if (e.type !== 'place') continue;
      for (const other of e.payload['linkedTo'] as string[]) {
        expect(seated.has(other)).toBe(true);
      }
      seated.add(e.payload['subject'] as string);
    }
  });
});

describe('바꿔 놓으면 아는 문제다', () => {
  it('겹치는 쌍이 같은 교시에 놓인 적이 없다', async () => {
    const events = await play(data);
    const color = events.find((e) => e.type === 'color');
    expect(color).toBeDefined();

    const names = color!.payload['subjects'] as string[];
    const slots = color!.payload['periods'] as number[];
    expect(names).toEqual(subjects);
    expect(slots).toHaveLength(subjects.length);

    const slotOf = new Map(names.map((id, i) => [id, slots[i]!]));
    for (const [a, b] of overlaps) {
      expect(slotOf.get(a)).not.toBe(slotOf.get(b));
    }
    for (const slot of slots) expect(slot).toBeGreaterThanOrEqual(1);
  });

  it('필요한 교시 수가 낱낱이 훑어 구한 최소와 같다', async () => {
    const events = await play(data);
    const color = events.find((e) => e.type === 'color');
    const slots = color!.payload['periods'] as number[];
    const total = color!.payload['total'] as number;

    expect(total).toBe(new Set(slots).size);
    expect(total).toBe(Math.max(...slots));
    expect(total).toBe(fewestSlots());
    // 겹침 여섯이 삼각형을 품으므로 둘로는 안 된다 — 위 셈이 그것을 확인한다.
    expect(colorableWith(total - 1)).toBe(false);
  });

  it('시간표로 되읽는 교시 수가 색의 가짓수와 같다', async () => {
    const events = await play(data);
    const color = events.find((e) => e.type === 'color');
    const schedule = events.find((e) => e.type === 'schedule');
    expect(schedule).toBeDefined();
    expect(schedule!.payload['total']).toBe(color!.payload['total']);
    expect(events[events.length - 1]?.type).toBe('schedule');
  });
});

describe('선언한 문안', () => {
  /**
   * 고정 데이터에서 안 뜨는 갈래가 있으면 그 캡션은 코드에만 있는 죽은 문장이다
   * (배치 공통 지침). 캡션은 `linkedTo` 가 비었는지로 갈린다.
   */
  it('캡션 두 갈래가 이 데이터에서 모두 일어난다', async () => {
    const events = await play(data);
    const linked = events
      .filter((e) => e.type === 'place')
      .map((e) => (e.payload['linkedTo'] as string[]).length);

    expect(linked.filter((n) => n === 0)).toHaveLength(1);
    expect(linked.filter((n) => n > 0)).toHaveLength(4);
  });

  it('선언한 키가 그림이 부르는 것과 정확히 맞는다', () => {
    expect(Object.keys(reduceToKnownFacet.messages ?? {}).sort()).toEqual([
      'caption.board',
      'caption.color',
      'caption.schedule',
      'caption.seat',
      'caption.seatLinked',
      'label.english',
      'label.history',
      'label.language',
      'label.math',
      'label.period',
      'label.problem',
      'label.science',
      'label.target',
    ]);
    // 과목 이름은 저마다 제 문안을 갖는다 — 하나라도 빠지면 화면에 식별자가 뜬다.
    for (const id of subjects) {
      expect(reduceToKnownFacet.messages?.[`label.${id}`]).toBeDefined();
    }
  });
});
