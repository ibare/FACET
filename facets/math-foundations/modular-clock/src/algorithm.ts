/**
 * modular-clock — 수에 같은 수를 거듭 더하면서 12 로 나눈 나머지(자리)와 몫(바퀴)을 본다.
 *
 * 수는 걸음마다 커지지만 자리는 0..(법 − 1) 안을 돌고, 0 을 지날 때마다 바퀴가 하나 는다.
 * 수 = 법 × 바퀴 + 자리 가 걸음마다 성립한다.
 *
 * 이벤트
 *   init  (silent: true)  걸음 0 의 바탕과 처음 수
 *     payload: { modulus: number; add: number; laps: number;
 *                n: number; q: number; r: number }
 *       laps — 마지막 수의 몫 (그림이 감을 바퀴의 끝). 알고리즘이 셈한다
 *   add   (silent 아님)   수에 add 를 한 번 더한 걸음
 *     payload: { from: number; fromR: number; n: number; q: number; r: number; crossed: boolean;
 *                passes: { n: number; q: number; r: number }[] }
 *       from · fromR — 더하기 전 수와 자리 (장면이 지금 값과 맞는지 본다)
 *       crossed      — 자리가 0 을 지났는가 (fromR + add ≥ modulus)
 *       passes       — 머리가 지나는 수 from + 1 .. n 마다 몫과 나머지 (끝이 n)
 *
 * 걸음 0 은 init 이 갈아 끼운 첫 장면이다. 걸음 k (1..times) 는 add 하나.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ModularClockFacetData = {
  type: 'modular-clock';
  modulus: number;
  start: number;
  add: number;
  times: number;
  stepMs: number;
};

/** 자료 모양을 검사하고 어긋나면 던진다. 장면의 initial 도 이것을 부른다. */
export function narrowModularClockData(raw: unknown): ModularClockFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('modular-clock: initialData 가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (d.type !== 'modular-clock') {
    throw new Error(`modular-clock: initialData.type 이 'modular-clock' 이 아니다 (${String(d.type)})`);
  }
  const whole = (key: string, min: number): number => {
    const v = d[key];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
      throw new Error(`modular-clock: initialData.${key} 는 ${min} 이상의 정수여야 한다 (${String(v)})`);
    }
    return v;
  };
  const modulus = whole('modulus', 2);
  const add = whole('add', 1);
  // 한 걸음에 0 을 두 번 지나면 '0 을 지남' 이 한 번의 참거짓으로 서지 않는다
  if (add >= modulus) {
    throw new Error(`modular-clock: initialData.add (${add}) 는 법 (${modulus}) 보다 작아야 한다`);
  }
  return {
    type: 'modular-clock',
    modulus,
    start: whole('start', 0),
    add,
    times: whole('times', 1),
    stepMs: whole('stepMs', 800),
  };
}

/** 수를 법으로 나눈 몫과 나머지. 음수가 없으니 바닥 나눗셈과 % 가 같은 답을 낸다. */
export function splitByModulus(n: number, modulus: number): { q: number; r: number } {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`modular-clock: 음이 아닌 정수만 나눈다 (${n})`);
  }
  return { q: Math.floor(n / modulus), r: n % modulus };
}

export async function modularClock(ctx: FacetContext<ModularClockFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ModularClockFacetData>;
  const data = narrowModularClockData(rctx.data);
  const { modulus, add, times, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const last = data.start + add * times;
  const first = splitByModulus(data.start, modulus);
  await rctx.emit({
    type: 'init',
    silent: true,
    payload: {
      modulus,
      add,
      laps: splitByModulus(last, modulus).q,
      n: data.start,
      q: first.q,
      r: first.r,
    },
  });

  let n = data.start;
  for (let k = 1; k <= times; k += 1) {
    // 걸음 0 이 이미 읽을 화면이라 첫 걸음 앞에도 stepMs 를 둔다
    if (!(await pause())) return;
    const fromR = splitByModulus(n, modulus).r;
    const next = n + add;
    const { q, r } = splitByModulus(next, modulus);
    const passes: Array<{ n: number; q: number; r: number }> = [];
    for (let i = n + 1; i <= next; i += 1) {
      if (rctx.cancelled) return;
      passes.push({ n: i, ...splitByModulus(i, modulus) });
    }
    await rctx.emit({
      type: 'add',
      payload: { from: n, fromR, n: next, q, r, crossed: fromR + add >= modulus, passes },
    });
    n = next;
  }
}
