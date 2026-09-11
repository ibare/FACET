/**
 * euclidean — 큰 수를 나머지로 바꿔 가며 줄이면 최대공약수에 닿는다.
 *
 * 손잡이가 고르는 다섯 쌍은 **피보나치 인접쌍**이고, 그것이 곧 이 알고리즘의
 * 최악의 입력이다. 나눗셈 횟수가 6 → 8 → 10 → 12 → 14 로 정확히 둘씩 는다.
 * 최악이라는 것도 전수로 쟀다 — `test/euclidean.test.ts` 가 두 사실을 다 진다.
 *
 * ── 셈 (1차 데이터는 두 수뿐이다. 몫 · 나머지 · 최대공약수는 여기서 센다)
 *   r = a mod b 이고 다음 짝은 (b, r) 다. b 가 0 이 되면 그때의 a 가 최대공약수다.
 *   몫 q = ⌊a / b⌋ 는 "작은 것을 몇 번 덜어 냈는가" 이므로, **몫의 합**은 나눗셈
 *   없이 빼기만으로 했을 때의 걸음 수다 — 나눗셈 쪽이 나머지 0 까지 가므로 빼는
 *   쪽도 0 이 될 때까지 빼는 셈법으로 본다 (두 수가 같아지면 멈추는 셈법은 마지막
 *   한 번을 덜 뺀다). 피보나치 인접쌍에서는 q 가 마지막 한 번을
 *   빼고 전부 1 이라 둘이 하나 차이로 붙는다 — 나눗셈이 빼기보다 나을 것이 없다는
 *   뜻이고, 그것이 이 입력이 최악인 까닭이다.
 *
 * ── 식별자
 *   쓰지 않는다. 이 facet 의 그림은 칸이 아니라 직사각형 하나이고, 이벤트가 그
 *   직사각형의 다음 상태를 통째로 싣는다 (C1 의 대상이 아니다).
 *
 * ── 이벤트 (표준은 `done` 뿐. 나머지는 이 facet 고유 — C2)
 *   setup   { a, b }                         판을 세운다. 직사각형 하나를 새로 짓는다
 *   divide  { a, b, q, r, index }            한 번의 나눗셈. 정사각형 q 개를 잘라 낸다
 *   reduce  { a, b }                         잘라 내고 남은 것이 다음 짝이 된다
 *   done    { gcd, divisions, quotientSum }
 *   phase   { phase }                        silent: true
 *
 * ── phase 어휘 (irs.ts 와 집합이 완전히 일치한다 — C3)
 *   'remainder' | 'shift' | 'result'
 *
 * ── 메트릭 (facet.ts 의 metrics[].name 과 일치 — C5)
 *   division-count · quotient-sum
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type EuclideanData = {
  type: string;
  /**
   * 손잡이가 고르는 쌍. 1차 데이터다.
   *
   * `facet.ts` 의 segmented-slider 가 각 쌍의 **큰 쪽**을 값으로 삼는다. 두 곳이
   * 같아야 한다 — 여기 없는 값이 오면 손잡이가 아무 일도 하지 않는다.
   */
  pairs: number[][];
  /** 지금 다루는 두 수. 손잡이가 민다. */
  a: number;
  b: number;
  /** 한 걸음의 길이 (ms). 읽을 시간을 주는 것은 저작 결정이다 (원칙 2). */
  stepMs: number;
};

/** 한 번의 나눗셈이 남기는 것. */
export type EuclideanStep = { a: number; b: number; q: number; r: number };

/**
 * 나눗셈을 끝까지 적어 둔다. 화면도 테스트도 이 한 함수에서 값을 받는다.
 *
 * 순수 함수라 `ctx` 를 받지 않고 동기다 (C8 Exception).
 */
export function euclideanSteps(a: number, b: number): EuclideanStep[] {
  const out: EuclideanStep[] = [];
  let x = Math.max(0, Math.trunc(a));
  let y = Math.max(0, Math.trunc(b));
  while (y > 0) {
    const q = Math.floor(x / y);
    const r = x - q * y;
    out.push({ a: x, b: y, q, r });
    x = y;
    y = r;
  }
  return out;
}

/** 손잡이가 보낸 값으로 쌍을 고른다. 모르는 값이면 null. */
function findPair(pairs: number[][], value: number): [number, number] | null {
  for (const p of pairs) {
    if (p.length < 2) continue;
    const a = p[0];
    const b = p[1];
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    if (a === value) return [a, b];
  }
  return null;
}

/** 손잡이가 보낸 값을 데이터에 반영한다. 모르는 값이면 그대로 둔다. */
function applyInput(data: EuclideanData, input: ReactiveInputEvent): void {
  const p = input.payload as Record<string, unknown> | undefined;
  if (typeof p !== 'object' || p === null) return;
  const raw = p.value;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value)) return;
  if (input.type !== 'pair') return;
  const chosen = findPair(data.pairs, value);
  if (chosen === null) return;
  data.a = chosen[0];
  data.b = chosen[1];
}

export const euclideanAlgorithm = async (ctx: FacetContext<EuclideanData>): Promise<void> => {
  const rc = ctx as ReactiveContext<EuclideanData>;

  /**
   * 메트릭을 절대값으로 맞춘다.
   *
   * `ctx.metric` 은 누적이고 메커니즘은 되돌릴 때만 비운다. 손잡이를 밀어 다시
   * 재생하는 것은 되돌리기가 아니므로, 그냥 더하면 두 번째 판부터 수가 불어난다.
   * 지난번에 알린 값과의 차만 보내 화면이 늘 이번 판의 수를 보이게 한다.
   */
  const reported = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = reported.get(name) ?? 0;
    if (value === prev) return;
    ctx.metric(name, value - prev);
    reported.set(name, value);
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const beat = (ratio: number): Promise<boolean> =>
    rc.sleep(Math.max(40, ctx.data.stepMs * ratio));

  /** 한 판. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  const runOnce = async (): Promise<boolean> => {
    const data = ctx.data;
    let a = Math.max(0, Math.trunc(data.a));
    let b = Math.max(0, Math.trunc(data.b));

    let divisions = 0;
    let quotientSum = 0;
    setMetric('division-count', 0);
    setMetric('quotient-sum', 0);

    await ctx.emit({ type: 'setup', payload: { a, b } });
    // 판을 세우는 걸음은 애니메이션이 짧아 그냥 두면 걸음 벽시계가 800ms 아래로
    // 떨어진다. 읽을 것(두 수)이 있는 걸음이므로 쉬는 쪽을 늘린다.
    if (!(await beat(1.3))) return false;

    while (b > 0) {
      // 문(gate)이 바디의 끝에 있으므로 진입 검사를 여기 따로 둔다 (C8).
      if (ctx.cancelled) return false;

      const q = Math.floor(a / b);
      const r = a - q * b;
      divisions += 1;
      quotientSum += q;
      setMetric('division-count', divisions);
      setMetric('quotient-sum', quotientSum);

      // 한 걸음이 둘로 보인다 — 재서 자르고(remainder), 남은 것으로 파고든다(shift).
      // 걸음의 경계는 그 뒤의 문 하나뿐이라 "한 걸음" 단추는 나눗셈 하나를 움직인다.
      await phase('remainder');
      await ctx.emit({ type: 'divide', payload: { a, b, q, r, index: divisions } });
      await phase('shift');
      await ctx.emit({ type: 'reduce', payload: { a: b, b: r } });

      a = b;
      b = r;
      if (!(await beat(1))) return false;
    }

    await phase('result');
    await ctx.emit({ type: 'done', payload: { gcd: a, divisions, quotientSum } });
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await runOnce())) return;
      // 손잡이를 밀 때까지 기다린다. 여기서 재생·한 걸음이 꺼지고 되돌리기와
      // 위젯만 남는다 (메커니즘의 입력 대기 상태).
      const input = await rc.waitForInput();
      if (ctx.cancelled) return;
      applyInput(ctx.data, input);
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6/C8).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
