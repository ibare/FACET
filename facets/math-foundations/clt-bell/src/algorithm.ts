/**
 * clt-bell — 주사위 n 개의 평균을 400 번 모으면, n 이 커질수록 평균들이 가운데로 몰린다.
 *
 * 생성기(mulberry32) 하나를 재생 처음에 한 번 만들고 끝까지 이어 쓴다. 뽑는 차례는
 * n 을 수열 차례로 → 한 n 안에서 평균 perN 개를 차례로 → 한 평균 안에서 눈 n 개를 차례로.
 * 눈 = floor(u × faces) + 1. 평균 = 눈의 합 s / n.
 * 칸은 가운데 1.0 · 1.5 · … · faces (폭 0.5). 칸 번호 j = floor((4s − 3n) / (2n)) —
 * 정수 셈으로 가장 가까운 가운데를 고른다. 평균이 두 가운데의 딱 중간이면 던진다.
 *
 * 이벤트
 * - `init`  (silent) — 바탕. 다섯 무리를 모두 뽑은 뒤 한 번.
 *     payload: { peakMax: number }  모든 걸음을 통틀어 가장 높은 칸의 개수 (무대 축척용)
 * - `crowd` — 걸음 하나 = n 하나. 평균 perN 개의 무리가 통째로 새로 나온다.
 *     payload: {
 *       n: number,          한 평균에 넣은 주사위 수
 *       counts: number[],   칸 j 마다 평균의 개수 (길이 = 칸 수, 합 = perN)
 *       mean: number,       평균들의 평균
 *       sd: number,         평균들의 표준편차 (분모 perN)
 *       peak: number        가장 높은 칸의 번호 (같으면 앞 칸)
 *     }
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 세운다 (주사위 하나의 눈 1..faces).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CltBellFacetData = {
  type: 'clt-bell';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** mulberry32 씨앗 */
  seed: number;
  /** 주사위 눈의 수 (눈은 1..faces) */
  faces: number;
  /** 한 평균에 넣는 주사위 수의 수열. 걸음을 만든다 */
  ns: number[];
  /** n 마다 모으는 평균의 수 */
  perN: number;
};

export type CrowdPayload = {
  n: number;
  counts: number[];
  mean: number;
  sd: number;
  peak: number;
};

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/** initialData 좁히개. 장면의 `initial` 도 이것을 부른다. */
export function narrowCltBellData(raw: unknown): CltBellFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('clt-bell: initialData 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'clt-bell') throw new Error(`clt-bell: initialData.type 이 'clt-bell' 이 아니다 (${String(d.type)})`);
  if (!isPositiveInt(d.stepMs)) throw new Error('clt-bell: initialData.stepMs 는 양의 정수');
  if (typeof d.seed !== 'number' || !Number.isInteger(d.seed)) throw new Error('clt-bell: initialData.seed 는 정수');
  if (!isPositiveInt(d.faces) || d.faces < 2) throw new Error('clt-bell: initialData.faces 는 2 이상의 정수');
  if (!isPositiveInt(d.perN)) throw new Error('clt-bell: initialData.perN 은 양의 정수');
  if (!Array.isArray(d.ns) || d.ns.length === 0) throw new Error('clt-bell: initialData.ns 는 비지 않은 배열');
  const ns: number[] = [];
  d.ns.forEach((n, i) => {
    if (!isPositiveInt(n)) throw new Error(`clt-bell: initialData.ns[${i}] 는 양의 정수`);
    ns.push(n);
  });
  return { type: 'clt-bell', stepMs: d.stepMs, seed: d.seed, faces: d.faces, ns, perN: d.perN };
}

/** 칸의 수 — 가운데 1.0 부터 faces 까지 0.5 간격. */
export function binCountOf(faces: number): number {
  return 2 * (faces - 1) + 1;
}

/** 칸 j 의 가운데 값. */
export function binCenter(j: number): number {
  return 1 + j / 2;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** 눈의 합 s 와 주사위 수 n 에서 칸 번호. 딱 중간이면 던진다. */
function binOf(s: number, n: number, binCount: number): number {
  const num = 4 * s - 3 * n;
  const den = 2 * n;
  if (num % den === 0) throw new Error(`clt-bell: 평균 ${s}/${n} 이 두 칸의 딱 중간이다`);
  const j = Math.floor(num / den);
  if (j < 0 || j >= binCount) throw new Error(`clt-bell: 평균 ${s}/${n} 의 칸 ${j} 가 범위 밖이다`);
  return j;
}

/** 무리 하나 — 평균 perN 개를 뽑아 칸에 센다. 생성기를 이어 쓴다. */
function drawCrowd(next: () => number, n: number, d: CltBellFacetData): CrowdPayload {
  const binCount = binCountOf(d.faces);
  const counts = new Array<number>(binCount).fill(0);
  const means: number[] = [];
  for (let k = 0; k < d.perN; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += Math.floor(next() * d.faces) + 1;
    const j = binOf(s, n, binCount);
    counts[j] = (counts[j] as number) + 1;
    means.push(s / n);
  }
  let total = 0;
  for (const m of means) total += m;
  const mean = total / d.perN;
  let sq = 0;
  for (const m of means) sq += (m - mean) * (m - mean);
  const sd = Math.sqrt(sq / d.perN);
  let peak = 0;
  counts.forEach((c, j) => {
    if (c > (counts[peak] as number)) peak = j;
  });
  return { n, counts, mean, sd, peak };
}

export async function cltBell(context: FacetContext<CltBellFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<CltBellFacetData>;
  const d = narrowCltBellData(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(d.stepMs)) && !ctx.cancelled;
  }

  // 무리 다섯을 규약의 차례대로 먼저 모두 뽑는다 — 축척(가장 높은 칸)이 바탕이기 때문.
  const next = mulberry32(d.seed);
  const crowds: CrowdPayload[] = [];
  for (const n of d.ns) {
    if (ctx.cancelled) return;
    crowds.push(drawCrowd(next, n, d));
  }
  let peakMax = 0;
  for (const c of crowds) peakMax = Math.max(peakMax, c.counts[c.peak] as number);

  await ctx.emit({ type: 'init', silent: true, payload: { peakMax } });

  // 걸음 0(주사위 하나의 눈)은 읽을 것이 있는 화면이라 첫 발신 앞에도 머문다.
  for (const c of crowds) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'crowd',
      payload: { n: c.n, counts: [...c.counts], mean: c.mean, sd: c.sd, peak: c.peak },
    });
  }
}
