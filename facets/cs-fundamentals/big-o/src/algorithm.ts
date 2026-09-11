/**
 * bigO — 항 넷이 자리를 바꾸고, 남는 말은 `O(n³)` 하나다.
 *
 * 손잡이는 하나이고 그것이 곧 주장이다 — 사다리를 어디까지 밟는가. 최고차항이
 * 합에서 차지하는 몫이 0.1% → 7.1% → 28.6% → 61.5% → 87.1% → 94.3% 로 단조로
 * 는다. **1차 데이터는 계수 넷과 n 사다리뿐**이고 항의 값 · 합 · 자리 · 몫은
 * 전부 여기서 셈한다. 선언에 옮겨 적으면 저작자의 오타가 그대로 화면에 뜬다.
 *
 * ── 셈 (계수는 최고차부터다)
 *   항 i 의 값은 `c[i] · n^(deg−i)` 이고 합은 그 넷을 더한 것이다.
 *   **자리(place)** 는 값이 큰 순의 0-based 공동 순위다 — 자기보다 큰 항의 수.
 *   동률이면 같은 자리를 나눠 가진다. 이 데이터에서 동률이 셋 있고 (n=5 · 10 ·
 *   20) 그것이 자리가 뒤집히는 길목이다.
 *
 *   `outranked` 는 최고차항보다 **작아진** 항의 수다 (0..3). 코드 패널의
 *   `outranked` 가 세는 것과 같은 수이며 컨트롤바에 그대로 뜬다.
 *
 * ── 식별자
 *   쓰지 않는다. 그림이 칸이 아니라 자리를 옮겨 다니는 토큰 넷이고, 이벤트가
 *   그 넷의 다음 상태를 통째로 싣는다 (C1 의 대상이 아니다).
 *
 * ── 이벤트 (표준 어휘가 없다. 넷 다 이 facet 고유 — C2)
 *   setup  { n, rungs }
 *          판을 세운다. 자리 넷과 사다리 눈금이 펴진다. rungs 는 밟을 단의 수.
 *   rung   { n, index, terms, sum, places, topPlace, outranked, tied, strictLead }
 *          사다리 한 단. 토큰 넷이 제 자리로 옮겨 간다.
 *   settle { n, terms, sum, places, strictLead }
 *          나머지를 지우고 최고차항만 남긴다. 표기가 굳는 자리다.
 *   phase  { phase }                        silent: true
 *
 *   payload 에 문안은 싣지 않는다 — 무엇이라 말할지는 표현 계층의 일이다 (C10).
 *
 * ── phase 어휘 (irs.ts 와 집합이 완전히 일치한다 — C3)
 *   'evaluate' | 'compare' | 'result'
 *
 * ── 메트릭 (facet.ts 의 metrics[].name 과 일치 — C5. 둘 다 정수다)
 *   rung-count · outranked-count
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type BigOData = {
  type: string;
  /**
   * 다항식의 계수. **최고차부터** 적는다. 1차 데이터다.
   *
   * 길이가 곧 차수 + 1 이라 `n³ + 5n² + 100n + 1000` 은 `[1, 5, 100, 1000]` 이다.
   */
  coefficients: number[];
  /**
   * 입력 크기 사다리. 오름차순이며 손잡이의 눈금이 곧 이 값들이다.
   *
   * `facet.ts` 의 segmented-slider 가 이 값을 그대로 segments 로 든다. 두 곳이
   * 갈리면 손잡이가 아무 일도 하지 않는다 — `test/big-o.test.ts` 가 묶는다.
   */
  ladder: number[];
  /** 손잡이가 고른 값. 사다리를 여기까지 밟는다. */
  n: number;
  /** 한 걸음의 정지 시간 (ms). 읽을 틈을 주는 것은 저작 결정이다 (원칙 2). */
  stepMs: number;
};

/** 사다리 한 단에서 셈해 낸 것. 화면에 뜨는 수는 전부 여기서 나온다. */
export type BigORung = {
  n: number;
  /** 각 항의 값. 계수와 같은 순서 (최고차부터). */
  terms: number[];
  sum: number;
  /** 각 항의 자리. 0 이 1 위이고 동률이면 같은 값이다. */
  places: number[];
  /** 최고차항의 자리. */
  topPlace: number;
  /** 최고차항보다 작아진 항의 수 (0..3). */
  outranked: number;
  /** 1 위 자리를 나눠 가진 항의 수. 1 이면 단독이다. */
  tied: number;
  /** 최고차항이 홀로 앞서는가. */
  strictLead: boolean;
};

/**
 * 한 단을 셈한다.
 *
 * 순수 함수라 `ctx` 를 받지 않고 동기다 (C8 Exception). 테스트가 같은 것을 그
 * 자리에서 다시 셈해 대조한다 — 근거의 정본은 스크래치가 아니라 커밋된 검사다.
 */
export function bigORung(coefficients: number[], n: number): BigORung {
  const deg = coefficients.length - 1;
  const terms: number[] = [];
  for (let i = 0; i < coefficients.length; i += 1) {
    let v = coefficients[i] ?? 0;
    for (let k = 0; k < deg - i; k += 1) v *= n;
    terms.push(v);
  }

  let sum = 0;
  for (const t of terms) sum += t;

  // 자리는 "나보다 큰 항이 몇인가" 다. 동률이 같은 자리를 갖는 셈법이고, 그래서
  // 자리 넷이 늘 0..3 을 채우지는 않는다 — 셋이 1 위면 남은 하나가 4 위다.
  const places = terms.map((t) => terms.filter((o) => o > t).length);

  const top = terms[0] ?? 0;
  let outranked = 0;
  for (let i = 1; i < terms.length; i += 1) {
    if ((terms[i] ?? 0) < top) outranked += 1;
  }

  const topPlace = places[0] ?? 0;
  const tied = places.filter((p) => p === 0).length;

  return {
    n,
    terms,
    sum,
    places,
    topPlace,
    outranked,
    tied,
    strictLead: topPlace === 0 && outranked === terms.length - 1,
  };
}

/** 손잡이가 고른 값이 사다리의 몇 번째 단인가. 모르는 값이면 0 (첫 단). */
export function rungIndex(ladder: number[], n: number): number {
  const at = ladder.indexOf(n);
  return at >= 0 ? at : 0;
}

/** 손잡이가 보낸 값을 데이터에 반영한다. 모르는 값이면 그대로 둔다. */
function applyInput(data: BigOData, input: ReactiveInputEvent): void {
  if (input.type !== 'size') return;
  const p = input.payload as Record<string, unknown> | undefined;
  if (typeof p !== 'object' || p === null) return;
  const raw = p.value;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value)) return;
  if (!data.ladder.includes(value)) return;
  data.n = value;
}

export const bigOAlgorithm = async (ctx: FacetContext<BigOData>): Promise<void> => {
  const rc = ctx as ReactiveContext<BigOData>;

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
    const ladder = Array.isArray(data.ladder) ? data.ladder : [];
    const coefficients = Array.isArray(data.coefficients) ? data.coefficients : [];
    if (ladder.length === 0 || coefficients.length === 0) return false;

    const stop = rungIndex(ladder, data.n);
    setMetric('rung-count', 0);
    setMetric('outranked-count', 0);

    await ctx.emit({ type: 'setup', payload: { n: ladder[stop] ?? 0, rungs: stop + 1 } });
    // 판을 세우는 걸음은 애니메이션이 짧다. 읽을 것(어디까지 가는가)이 있는
    // 걸음이므로 쉬는 쪽을 늘려 걸음 벽시계를 바닥선 위에 둔다.
    if (!(await beat(1.2))) return false;

    let last: BigORung | null = null;
    for (let i = 0; i <= stop; i += 1) {
      // 문(gate)이 바디의 끝에 있으므로 진입 검사를 여기 따로 둔다 (C8).
      if (ctx.cancelled) return false;

      const r = bigORung(coefficients, ladder[i] ?? 0);
      last = r;

      // 한 걸음이 둘로 보인다 — 값을 셈하고(evaluate) 자리를 가린다(compare).
      // 걸음의 경계는 그 뒤의 문 하나뿐이라 "한 걸음" 단추는 사다리 한 단을 움직인다.
      await phase('evaluate');
      await ctx.emit({
        type: 'rung',
        payload: {
          n: r.n,
          index: i,
          terms: r.terms,
          sum: r.sum,
          places: r.places,
          topPlace: r.topPlace,
          outranked: r.outranked,
          tied: r.tied,
          strictLead: r.strictLead,
        },
      });
      await phase('compare');

      setMetric('rung-count', i + 1);
      setMetric('outranked-count', r.outranked);
      if (!(await beat(1))) return false;
    }

    if (last === null) return false;
    await phase('result');
    await ctx.emit({
      type: 'settle',
      payload: {
        n: last.n,
        terms: last.terms,
        sum: last.sum,
        places: last.places,
        strictLead: last.strictLead,
      },
    });
    if (!(await beat(1))) return false;
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
