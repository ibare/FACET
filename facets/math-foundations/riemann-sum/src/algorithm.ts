/**
 * riemann-sum — 곡선 아래 넓이를 곧은 조각으로 덮고, 조각을 둘로 가르며 합을 잰다.
 *
 * 곡선 f(x) = √(4 − x²) 은 식 그대로 여기 둔다 (공통 안내문 — 이 조각만 다항식이 아니다).
 * 조각의 폭 = (to − from) / n, 높이 = 왼쪽 끝 표본 f(from + k · 폭), k = 0..n−1.
 * 합 = Σ 높이 × 폭, 넘친 몫 = 합 − π. 참 넓이 π 는 `Math.PI`.
 *
 * 이벤트:
 *   init   (silent) payload { from: number, to: number, samples: [x, y][], yMax: number,
 *                            counts: number[], truth: number, sumLo: number, sumHi: number }
 *          — 바탕. 곡선 표본점 · 조각 수 수열 · 참 넓이 · 합 축의 범위(참 넓이 ~ 가장 큰 합).
 *          걸음 0(곡선과 그 아래 넓이) 을 갈아 끼운다.
 *   cover  payload { n: number, width: number, heights: number[], sum: number, over: number }
 *          — 첫 조각 수. 조각들이 가로축에서 솟아 넓이를 덮는다.
 *   split  payload { n: number, width: number, heights: number[], was: number[], sum: number, over: number }
 *          — 조각마다 둘로 갈라진다. was[k] 는 k 번째 새 조각이 갈라져 나온 부모의 높이
 *          (왼쪽 자식은 부모와 같은 높이 · 오른쪽 자식은 부모 높이에서 제 높이로 깎인다).
 *   limit  payload { truth: number, fromSum: number }
 *          — 합이 다가가는 값 π. fromSum 은 마지막으로 잰 합.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RiemannSumFacetData = {
  type: 'riemann-sum';
  /** 구간 왼쪽 끝 */
  from: number;
  /** 구간 오른쪽 끝 */
  to: number;
  /** 조각 수 n 의 수열 — 앞의 두 배씩 */
  counts: number[];
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

/** 곡선 f(x) = √(4 − x²). 구간 밖(반지름 너머)은 셈할 수 없으니 던진다. */
export function curve(x: number): number {
  const inside = 4 - x * x;
  if (inside < -1e-12) throw new Error(`riemann-sum: f(${x}) 는 셈할 수 없다 (4 − x² < 0)`);
  return Math.sqrt(Math.max(0, inside));
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 좁히개 — 모양이 어긋나면 필드 경로를 담아 던진다. 알고리즘과 장면이 함께 쓴다. */
export function narrowRiemannSumData(raw: unknown): RiemannSumFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('riemann-sum: data 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'riemann-sum') throw new Error(`riemann-sum: data.type 이 'riemann-sum' 이 아니다 (${String(d.type)})`);
  if (!isFiniteNumber(d.from)) throw new Error('riemann-sum: data.from 이 수가 아니다');
  if (!isFiniteNumber(d.to)) throw new Error('riemann-sum: data.to 가 수가 아니다');
  if (!(d.to > d.from)) throw new Error('riemann-sum: data.to 는 data.from 보다 커야 한다');
  curve(d.from);
  curve(d.to);
  if (!isFiniteNumber(d.stepMs) || d.stepMs < 0) throw new Error('riemann-sum: data.stepMs 가 0 이상의 수가 아니다');
  if (!Array.isArray(d.counts) || d.counts.length === 0) throw new Error('riemann-sum: data.counts 가 빈 배열이다');
  const counts: number[] = [];
  d.counts.forEach((c: unknown, i: number) => {
    if (!Number.isInteger(c) || (c as number) < 1) throw new Error(`riemann-sum: data.counts[${i}] 가 1 이상의 정수가 아니다`);
    if (i > 0 && c !== counts[i - 1]! * 2) throw new Error(`riemann-sum: data.counts[${i}] 는 앞의 두 배여야 한다 (조각이 둘로 갈라진다)`);
    counts.push(c as number);
  });
  return { type: 'riemann-sum', from: d.from, to: d.to, counts, stepMs: d.stepMs };
}

/** 조각 수 n 에서의 폭 · 높이 · 합 · 넘친 몫. */
export function measure(data: RiemannSumFacetData, n: number): { width: number; heights: number[]; sum: number; over: number } {
  const width = (data.to - data.from) / n;
  const heights: number[] = [];
  let sum = 0;
  for (let k = 0; k < n; k += 1) {
    const h = curve(data.from + k * width);
    heights.push(h);
    sum += h * width;
  }
  return { width, heights, sum, over: sum - Math.PI };
}

/** 표시 도우미 — 소수 digits 자리, 음의 영을 떼고 빼기는 `−`. */
export function showNumber(v: number, digits: number): string {
  let s = v.toFixed(digits);
  if (/^-0\.?0*$/.test(s)) s = s.slice(1);
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

/** 1차 데이터의 수(폭)는 적힌 그대로 — 부동소수 끝자리만 걷는다. */
export function showRaw(v: number): string {
  const s = String(Number(v.toPrecision(12)));
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

export async function riemannSum(context: FacetContext<RiemannSumFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<RiemannSumFacetData>;
  const data = narrowRiemannSumData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 바탕 — 곡선 표본점. 모든 조각 경계가 표본 격자에 들도록 가장 잘게 쪼갠 수의 여섯 배로 나눈다.
  const intervals = data.counts[data.counts.length - 1]! * 6;
  const samples: [number, number][] = [];
  let yMax = 0;
  for (let i = 0; i <= intervals; i += 1) {
    if (ctx.cancelled) return;
    const x = data.from + ((data.to - data.from) * i) / intervals;
    const y = curve(x);
    if (y > yMax) yMax = y;
    samples.push([x, y]);
  }
  const measures = data.counts.map((n) => measure(data, n));
  const sums = measures.map((m) => m.sum);
  const truth = Math.PI;

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      from: data.from,
      to: data.to,
      samples,
      yMax,
      counts: [...data.counts],
      truth,
      sumLo: Math.min(truth, ...sums),
      sumHi: Math.max(truth, ...sums),
    },
  });

  // 걸음 0 은 곡선과 넓이가 이미 선 화면 — 읽을 틈을 둔다.
  if (!(await pause())) return;

  let prevHeights: number[] | null = null;
  let lastSum = 0;
  for (let i = 0; i < data.counts.length; i += 1) {
    if (ctx.cancelled) return;
    const n = data.counts[i]!;
    const m = measures[i]!;
    if (prevHeights === null) {
      await ctx.emit({
        type: 'cover',
        payload: { n, width: m.width, heights: m.heights, sum: m.sum, over: m.over },
      });
    } else {
      const parents: number[] = prevHeights;
      const was = m.heights.map((_, k) => parents[Math.floor(k / 2)]!);
      await ctx.emit({
        type: 'split',
        payload: { n, width: m.width, heights: m.heights, was, sum: m.sum, over: m.over },
      });
    }
    prevHeights = m.heights;
    lastSum = m.sum;
    if (!(await pause())) return;
  }

  await ctx.emit({ type: 'limit', payload: { truth, fromSum: lastSum } });
}
