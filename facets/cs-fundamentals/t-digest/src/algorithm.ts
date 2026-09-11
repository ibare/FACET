/**
 * t-digest — 적은 자리로 분위수를 답하되 꼬리를 정확히.
 *
 * ── 식별자
 * 이 facet 은 `target` 문법을 쓰지 않는다. 화면이 가리키는 것이 배열의 한 칸이
 * 아니라 "뭉치 전체의 배치" 라서, 모든 정보를 payload 에 담아 보낸다.
 *
 * ── 이벤트 (앞 셋은 facet 고유, `done` 은 표준)
 *
 * 넷 다 `silent` 를 쓰지 않는다. 앞 셋은 시각 변화가 있어서고, `done` 은 화면을
 * 바꾸지 않지만 **한 바퀴의 끝을 긋는 걸음**이라 한 걸음씩 볼 때 건너뛰면 안
 * 되기 때문이다. (`silent` 는 step boundary 가 아닌 메타 이벤트의 것이다 — C2.)
 *
 *   'digest-built'  δ 하나로 뭉치를 다 지었다.
 *     payload { delta: number; total: number;
 *               buckets: { q0, q1, weight, mean, centerQ }[] }
 *
 *   'probe'         한 분위를 질의해 답과 참값을 견주었다.
 *     payload { key: 'tail' | 'middle'; q: number;
 *               estimate: number; truth: number; valueError: number }
 *
 *   'sweep'         δ 넷을 나란히 세워 상대 값 오차를 견주었다.
 *     payload { current: number;
 *               rows: { delta: number; tailError: number; middleError: number }[] }
 *
 *   'done'          (표준) 한 바퀴가 끝났다. payload 없음.
 *
 * ── 메트릭 (facet.ts 의 metrics[] 에 같은 이름이 선언돼 있어야 한다 — C5)
 *   'bucket-count'        지금 δ 가 만든 뭉치의 수
 *   'tail-bucket-size'    바깥쪽 끝 뭉치가 담은 점의 수
 *   'widest-bucket-size'  가장 많이 담은 뭉치의 점의 수
 *
 * ── 측도는 상대 값 오차다
 *
 * 이 facet 의 주장은 "δ 를 늘리면 꼬리가 가운데보다 빠르게 좋아진다" 이고,
 * 그것을 **상대 값 오차**(답한 값이 참값에서 몇 % 떨어졌는가) 로 잰다.
 *
 *   δ           6     12     24     48      개선
 *   q=0.99   45.8   17.2   10.0    1.8    25.8 배
 *   q=0.50    6.5    6.5    1.6    1.0     6.5 배
 *
 * 꼬리가 가운데의 네 배 빠르게 좋아진다. 자리를 꼬리에 몰아준 값이 꼬리에서
 * 돌아오는 것이 이것이다.
 *
 * 질의는 **인접 뭉치의 중심 분위 사이를 선형 보간**한다. 가장 가까운 뭉치의
 * 대표값을 그대로 답하면 오차가 단조롭지 않게 되어 주장 자체가 무너진다.
 * 그 함정의 실측은 `description.ts` 에 적어 두었다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TDigestBucket = {
  /** 뭉치가 덮는 분위 구간의 왼쪽 끝. */
  q0: number;
  /** 오른쪽 끝. */
  q1: number;
  /** 들어간 점의 수. */
  weight: number;
  /** 그 구간 값들의 산술평균 — 뭉치의 대표값. */
  mean: number;
  /** (앞까지의 누적 무게 + 자기 무게/2) / 전체. */
  centerQ: number;
};

export type TDigestData = {
  type: 't-digest';
  /** 값의 수. */
  count: number;
  /** 압축 계수 δ — 손잡이가 바꾸는 값. */
  delta: number;
  /** 손잡이가 고를 수 있는 δ 전부. 나란히 세워 견주는 데 쓴다. */
  deltas: number[];
  /** 꼬리 쪽 질의 분위. */
  tailQ: number;
  /** 가운데 질의 분위. */
  middleQ: number;
  /** 걸음 사이의 정지 시간 (ms). */
  stepMs: number;
};

/**
 * 1차 데이터 — 꼬리가 긴 분포를 오름차순으로 만든다.
 *
 *   data[i] = −ln(1 − (i + 0.5)/n) · 100
 *
 * (i + 0.5)/n 은 표본의 한가운데를 짚는 흔한 규약이다.
 */
export function tDigestValues(count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(-Math.log(1 - (i + 0.5) / count) * 100);
  }
  return out;
}

/**
 * 뭉치 경계 — 척도 함수를 1 씩 끊은 자리를 q 로 되돌린 것.
 *
 *   k(q) = (δ / 2π) · asin(2q − 1)      q 를 k 로
 *   q(k) = (sin(2πk / δ) + 1) / 2       k 를 q 로
 *
 * k 의 폭은 −δ/4 에서 δ/4 까지다. 왼쪽 끝에서 1 씩 끊으므로 경계는 δ/2 + 1 개,
 * 뭉치는 δ/2 개가 된다. 이 함수가 하는 일은 하나다 — **q 가 0 이나 1 에 가까울수록
 * 같은 한 칸이 덮는 q 폭이 좁아진다.** 가운데에서 가장 넓다.
 */
export function tDigestBoundaries(delta: number): number[] {
  const buckets = Math.round(delta / 2);
  const kMin = -delta / 4;
  const qs: number[] = [];
  for (let j = 0; j <= buckets; j += 1) {
    const k = kMin + j;
    qs.push((Math.sin((2 * Math.PI * k) / delta) + 1) / 2);
  }
  // 양 끝은 부동소수 잔차 없이 딱 0 과 1 이어야 한다.
  qs[0] = 0;
  qs[buckets] = 1;
  return qs;
}

/**
 * 값들을 경계로 나눠 뭉치를 짓는다.
 *
 * 경계는 **자리 번호로** 끊는다 — `lo = ⌊q0·n⌋`, `hi = max(lo + 1, ⌊q1·n⌋)`.
 * 대표값은 `values[lo..hi)` 의 산술평균, 무게는 그 구간의 개수다.
 *
 * `max(lo + 1, …)` 은 빈 뭉치를 만들지 않으려는 바닥이다. δ 가 커져 한 뭉치가
 * 덮는 q 폭이 자리 하나보다 좁아지면 이 바닥이 걸리고, 그때 이웃한 두 뭉치가
 * 같은 점을 나눠 갖는다 — 그래서 **무게의 합이 n 을 살짝 넘을 수 있다**
 * (δ=48, n=200 에서 201). 아는 채로 두는 성질이니 다음 사람이 버그로 읽지
 * 않도록 적어 둔다.
 */
export function tDigestBuckets(values: number[], delta: number): TDigestBucket[] {
  const n = values.length;
  const qs = tDigestBoundaries(delta);
  const out: TDigestBucket[] = [];
  let cum = 0;

  for (let j = 0; j < qs.length - 1; j += 1) {
    const lo = Math.floor(qs[j] * n);
    if (lo >= n) continue;
    const hi = Math.min(n, Math.max(lo + 1, Math.floor(qs[j + 1] * n)));
    const weight = hi - lo;
    if (weight <= 0) continue;
    let sum = 0;
    for (let i = lo; i < hi; i += 1) sum += values[i];
    out.push({
      q0: qs[j],
      q1: qs[j + 1],
      weight,
      mean: sum / weight,
      centerQ: (cum + weight / 2) / n,
    });
    cum += weight;
  }
  return out;
}

/**
 * 분위수 질의 — 인접 뭉치의 **중심 분위 사이를 선형 보간**한다.
 * 양 끝 바깥은 끝 뭉치의 대표값을 그대로 답한다.
 */
export function tDigestQuery(buckets: TDigestBucket[], q: number): number {
  if (buckets.length === 0) return 0;
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  if (q <= first.centerQ) return first.mean;
  if (q >= last.centerQ) return last.mean;
  for (let i = 0; i < buckets.length - 1; i += 1) {
    const a = buckets[i];
    const b = buckets[i + 1];
    if (q <= b.centerQ) {
      const span = b.centerQ - a.centerQ;
      if (span <= 0) return b.mean;
      return a.mean + ((q - a.centerQ) / span) * (b.mean - a.mean);
    }
  }
  return last.mean;
}

/**
 * 참값 — 정렬된 값들에서 선형 보간으로 구한 분위수.
 * `x = q·(n − 1)` 자리를 잡고 `values[⌊x⌋]` 와 `values[⌈x⌉]` 를 소수부로 섞는다.
 */
export function trueQuantile(values: number[], q: number): number {
  const n = values.length;
  const x = q * (n - 1);
  const lo = Math.max(0, Math.min(n - 1, Math.floor(x)));
  const hi = Math.max(0, Math.min(n - 1, Math.ceil(x)));
  return values[lo] + (x - lo) * (values[hi] - values[lo]);
}

/**
 * 상대 값 오차 (%) — 답한 값이 참값에서 몇 % 떨어져 있는가.
 * 이 facet 이 주장을 걸어 놓은 측도다 (파일 상단 주석).
 */
export function tDigestValueError(
  values: number[],
  buckets: TDigestBucket[],
  q: number,
): number {
  const truth = trueQuantile(values, q);
  if (truth === 0) return 0;
  return (Math.abs(tDigestQuery(buckets, q) - truth) / Math.abs(truth)) * 100;
}

function readDelta(payload: unknown, fallback: number): number {
  if (typeof payload !== 'object' || payload === null) return fallback;
  const p = payload as Record<string, unknown>;
  if (typeof p.value === 'number' && Number.isFinite(p.value)) return p.value;
  if (typeof p.delta === 'string') {
    const n = Number(p.delta);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

export async function tDigestAlgorithm(base: FacetContext<TDigestData>): Promise<void> {
  // `registerAlgorithm` 의 시그니처는 FacetContext 그대로이고, 입력 반응형 facet 의
  // algorithm 은 주입받은 ctx 를 ReactiveContext 로 단언해 쓴다 — `context.ts` 가
  // 적어 둔 규약이다. 설계상 열린 경계라 이 단언은 C9 가 허용하는 자리다.
  const ctx = base as ReactiveContext<TDigestData>;
  const data = ctx.data;
  const values = tDigestValues(data.count);

  // ctx.metric 은 **더하는** 채널이라 (mechanism 이 누적한다) 값을 그대로
  // 앉히려면 차이를 보내야 한다. 지금 화면에 떠 있는 값을 여기서 기억한다.
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = shown.get(name) ?? 0;
    if (value !== prev) ctx.metric(name, value - prev);
    shown.set(name, value);
  };

  for (;;) {
    if (ctx.cancelled) return;
    const delta = data.delta;
    const buckets = tDigestBuckets(values, delta);

    await ctx.emit({
      type: 'digest-built',
      payload: {
        delta,
        total: data.count,
        buckets: buckets.map((b) => ({ ...b })),
      },
    });

    let widest = 0;
    for (const b of buckets) widest = Math.max(widest, b.weight);
    setMetric('bucket-count', buckets.length);
    setMetric('tail-bucket-size', buckets.length > 0 ? buckets[buckets.length - 1].weight : 0);
    setMetric('widest-bucket-size', widest);

    if (!(await ctx.sleep(data.stepMs))) return;

    for (const probe of [
      { key: 'tail' as const, q: data.tailQ },
      { key: 'middle' as const, q: data.middleQ },
    ]) {
      await ctx.emit({
        type: 'probe',
        payload: {
          key: probe.key,
          q: probe.q,
          estimate: tDigestQuery(buckets, probe.q),
          truth: trueQuantile(values, probe.q),
          valueError: tDigestValueError(values, buckets, probe.q),
        },
      });
      if (!(await ctx.sleep(data.stepMs))) return;
    }

    // δ 넷을 나란히 세운다. "꼬리가 가운데보다 빠르게 준다" 는 한 δ 만 보아서는
    // 읽을 수 없고 견주어야 읽힌다.
    const rows = data.deltas.map((d) => {
      const bs = tDigestBuckets(values, d);
      return {
        delta: d,
        tailError: tDigestValueError(values, bs, data.tailQ),
        middleError: tDigestValueError(values, bs, data.middleQ),
      };
    });
    await ctx.emit({ type: 'sweep', payload: { current: delta, rows } });
    if (!(await ctx.sleep(data.stepMs))) return;

    await ctx.emit({ type: 'done' });

    // 여기서부터 입력 대기다 — 재생·한 걸음이 꺼지고 되돌리기와 손잡이만 남는다.
    try {
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return;
      if (input.type === 'delta') {
        data.delta = readDelta(input.payload, data.delta);
      }
    } catch (err) {
      // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6/C8).
      // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
      if (!ctx.cancelled) throw err;
      return;
    }
  }
}
