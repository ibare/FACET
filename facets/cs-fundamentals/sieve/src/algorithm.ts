/**
 * sieve — 배수를 지우면 남는 것이 소수다.
 *
 * 손잡이는 **한계 N** 하나다. 50 · 100 · 120 으로 밀면 찾아낸 소수는 15 → 25 → 30
 * 으로 배가 되는데 **지우는 일을 하는 소수는 셋 다 [2,3,5,7] 넷으로 같다.** 지우개가
 * 될 수 있는 수는 제곱이 N 을 넘지 않는 것뿐이라, 판이 커져도 그 문턱은 √N 만큼만
 * 자라기 때문이다. 움직이지 않는 수가 이 화면의 주장이고, 그래서 reactive 다 —
 * 독자가 미는 것이 곧 다음 판이다.
 *
 * ── 걸음의 단위는 **바깥 루프의 한 방문**이다
 *
 * 표시(`mark[j] = 1`)마다 한 걸음으로 두면 N=120 에서 걸음이 128 개가 되어, 가장
 * 얇은 걸음을 800ms 로 잡아도 재생이 백 초를 넘는다. 그래서 **한 지우개가 제 배수를
 * 훑는 것을 한 걸음으로 묶는다.** 묶는 것이 손해가 아니라 이득인 까닭은, 이 화면이
 * 재는 것이 표시 횟수가 아니라 **지우개의 개수**이기 때문이다 — 걸음 수가 곧
 * 지우개 수 + 걸러진 수이고, 그 수가 판을 키워도 늘지 않는 것이 눈에 보인다.
 *
 * 걸음 수: N=50 은 1 + 6 + 4 + 1 + 1 = 13, N=120 은 1 + 9 + 4 + 1 + 1 = 16 이다
 * (판 세우기 · 바깥 방문 · 지우기 · 멈춤 · 거두기). 표시 횟수(45 · 104 · 128)는
 * 메트릭으로만 센다.
 *
 * ── 1차 데이터 (facet.ts 의 initialData)
 *   limit   한계 N 의 시작값. 손잡이가 이 값을 바꾼다.
 *   stepMs  한 걸음의 길이.
 * 소수 · 지우개 · 표시 횟수는 어디에도 적지 않는다. 전부 여기서 센다.
 *
 * ── 식별자
 *   index:<n>   판의 n 번 칸 (= 수 n 그 자체)
 *
 * ── 이벤트 (표준은 `done` 뿐. 나머지는 이 facet 고유 — C2)
 *   board-ready  { limit }
 *       2 부터 limit 까지의 판이 섰다. 아직 아무것도 지우지 않았다.
 *   probe        { p, skipped, limit }                        target index:<p>
 *       바깥 루프가 p 를 들여다봤다. `skipped` 면 이미 지워진 수라 지우개가 되지 않는다.
 *   strike       { p, from, marks: number[], markTotal }       target index:<p>
 *       p 가 제 배수를 p*p 부터 지웠다. `marks` 는 이 걸음에서 표시한 칸들이다.
 *   halt         { p, limit }
 *       p*p 가 limit 을 넘어 바깥 루프가 멎었다. 지우개는 여기서 끝난다.
 *   sifted       { limit, primes: number[], erasers: number[], markTotal }
 *       남은 칸이 소수다.
 *   done         { limit, eraserCount, primeCount, markTotal }
 *       한 판이 끝나고 손잡이를 기다린다.
 *   phase        { phase }                                     silent: true
 *
 * ── phase 어휘 (irs.ts 와 집합이 완전히 일치한다 — C3)
 *   'outer' | 'mark' | 'collect' | 'finish'
 *
 * ── 메트릭 (facet.ts 의 metrics[].name 과 일치 — C5. 전부 정수다)
 *   eraser-count · prime-count · mark-count
 *
 * ── 사용자 입력 (reactive)
 *   { type: 'limit', payload: { value: 50|100|120, … } }
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 손잡이가 줄 수 있는 값. facet.ts 의 segmented-slider 와 같아야 한다. */
export const SIEVE_LIMIT_CHOICES: readonly number[] = [50, 100, 120];

export type SieveData = {
  type: string;
  /** 이번 판의 한계 N. 손잡이가 민다. */
  limit: number;
  /** 한 걸음의 길이 (ms). */
  stepMs: number;
};

/** 바깥 루프의 한 방문. 지우개가 되었으면 `marks` 가 차 있다. */
export type SieveVisit = {
  p: number;
  /** 이미 지워진 수라 지우개가 되지 않았다. */
  skipped: boolean;
  /** 이 걸음에서 `mark[j] = 1` 을 실행한 칸들. 이미 지워진 칸도 포함한다. */
  marks: number[];
};

export type SieveRun = {
  limit: number;
  visits: SieveVisit[];
  /** 바깥 루프가 멎은 자리 — 제곱이 limit 을 넘는 첫 수. */
  halt: number;
  /** 실제로 지우는 일을 한 소수들. */
  erasers: number[];
  primes: number[];
  /** 표시 횟수. **이미 표시된 칸을 다시 표시한 것도 센다** (15 는 3 과 5 가 함께 지운다). */
  markTotal: number;
};

/**
 * 체를 한 번 돌린다.
 *
 * `j` 를 `p*p` 에서 시작하는 것이 핵심이다 — 그보다 작은 배수는 더 작은 소수가
 * 이미 지웠다. 그리고 바깥 루프가 `p*p <= limit` 에서 멎는 것이 이 화면의 주장이다.
 *
 * irs.ts 의 `sieve` · `collect` 와 **같은 셈**이다. 검사가 셋을 전수 대조한다.
 */
export function runSieve(limit: number): SieveRun {
  const mark = new Array<number>(limit + 1).fill(0);
  const visits: SieveVisit[] = [];
  const erasers: number[] = [];
  let markTotal = 0;

  let i = 2;
  for (; i * i <= limit; i += 1) {
    if (mark[i] === 0) {
      const marks: number[] = [];
      for (let j = i * i; j <= limit; j += i) {
        mark[j] = 1;
        marks.push(j);
        markTotal += 1;
      }
      erasers.push(i);
      visits.push({ p: i, skipped: false, marks });
    } else {
      visits.push({ p: i, skipped: true, marks: [] });
    }
  }

  const primes: number[] = [];
  for (let n = 2; n <= limit; n += 1) if (mark[n] === 0) primes.push(n);

  return { limit, visits, halt: i, erasers, primes, markTotal };
}

function pick(value: number, choices: readonly number[], fallback: number): number {
  return choices.includes(value) ? value : fallback;
}

/** 손잡이가 보낸 값을 데이터에 반영한다. 모르는 값이면 그대로 둔다. */
function applyInput(data: SieveData, input: ReactiveInputEvent): void {
  if (input.type !== 'limit') return;
  const p = input.payload as Record<string, unknown> | undefined;
  if (typeof p !== 'object' || p === null) return;
  const raw = p.value;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value)) return;
  data.limit = pick(value, SIEVE_LIMIT_CHOICES, data.limit);
}

export const sieveAlgorithm = async (ctx: FacetContext<SieveData>): Promise<void> => {
  const rc = ctx as ReactiveContext<SieveData>;

  /**
   * 메트릭을 절대값으로 맞춘다.
   *
   * `ctx.metric` 은 누적이고 메커니즘은 되돌릴 때만 비운다. 손잡이를 밀어 판을 다시
   * 세우는 것은 되돌리기가 아니므로, 그냥 더하면 두 번째 판부터 수가 불어난다.
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

  /**
   * 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8).
   *
   * 걸음마다 같은 길이다 — 어느 걸음이 가장 얇은지 따질 것이 없게 하는 편이,
   * 비율을 흩어 두고 800ms 바닥선을 매번 다시 재는 것보다 낫다.
   */
  const beat = (): Promise<boolean> => rc.sleep(ctx.data.stepMs);

  /** 한 판. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  const runOnce = async (): Promise<boolean> => {
    const limit = pick(ctx.data.limit, SIEVE_LIMIT_CHOICES, SIEVE_LIMIT_CHOICES[0] ?? 50);
    const run = runSieve(limit);

    setMetric('eraser-count', 0);
    setMetric('prime-count', 0);
    setMetric('mark-count', 0);

    await ctx.emit({ type: 'board-ready', payload: { limit } });
    if (!(await beat())) return false;

    let erasers = 0;
    let marked = 0;
    for (const visit of run.visits) {
      // 문이 바디의 첫 줄이 아니다 — 한 방문에서 emit 이 둘 나갈 수 있으므로
      // 진입 검사를 따로 둔다 (C8 의 MUST).
      if (ctx.cancelled) return false;

      await phase('outer');
      await ctx.emit({
        type: 'probe',
        target: `index:${visit.p}`,
        payload: { p: visit.p, skipped: visit.skipped, limit },
      });
      if (!(await beat())) return false;
      if (visit.skipped) continue;

      erasers += 1;
      marked += visit.marks.length;
      setMetric('eraser-count', erasers);
      setMetric('mark-count', marked);

      await phase('mark');
      await ctx.emit({
        type: 'strike',
        target: `index:${visit.p}`,
        payload: {
          p: visit.p,
          from: visit.p * visit.p,
          marks: [...visit.marks],
          markTotal: marked,
        },
      });
      if (!(await beat())) return false;
    }

    // 바깥 루프가 멎은 자리. 이 한 걸음이 이 화면의 주장이다 — 지우개가 될 수
    // 있는 수는 제곱이 판을 넘지 않는 것뿐이다.
    if (ctx.cancelled) return false;
    await phase('outer');
    await ctx.emit({ type: 'halt', payload: { p: run.halt, limit } });
    if (!(await beat())) return false;

    setMetric('prime-count', run.primes.length);
    await phase('collect');
    await ctx.emit({
      type: 'sifted',
      payload: {
        limit,
        primes: [...run.primes],
        erasers: [...run.erasers],
        markTotal: run.markTotal,
      },
    });
    if (!(await beat())) return false;

    await phase('finish');
    await ctx.emit({
      type: 'done',
      payload: {
        limit,
        eraserCount: run.erasers.length,
        primeCount: run.primes.length,
        markTotal: run.markTotal,
      },
    });
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
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
