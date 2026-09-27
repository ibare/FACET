/**
 * histogram-shape — 같은 규칙으로 값을 하나씩 뽑아 칸에 쌓으면, 몇 개쯤부터 그 규칙의 모양이 드러나는가.
 *
 * 표본 하나 = 주사위 둘(a 먼저, b 다음)을 던져 큰 눈. 눈 = floor(u × 6) + 1, u 는 mulberry32(seed).
 * 생성기는 재생 처음에 한 번 만들고 걸음마다 다시 씨앗을 넣지 않는다.
 * 걸음 하나 = `sampleCounts` 의 다음 표본 수까지 뽑아 칸에 쌓는다.
 *
 * 이벤트 (silent 없음 — 걸음 0 의 빈 칸 여섯은 장면의 initial 이 initialData 에서 세운다):
 *
 *   pour   표본 from → to 를 뽑아 쌓았다
 *     payload: {
 *       from: number            앞 표본 수
 *       to: number              이번 표본 수
 *       before: number[]        쌓기 전 칸(눈 1..faces)의 개수
 *       after: number[]         쌓은 뒤 칸의 개수
 *       added: number[]         이번에 칸마다 더해진 개수 (after − before)
 *       drops: number[]         이번에 뽑힌 큰 눈들, 뽑힌 차례대로 (1..faces)
 *       roll: { a: number; b: number } | null   이번에 뽑은 것이 표본 하나면 그 두 눈, 아니면 null
 *       order:                  쌓은 뒤 칸 높이의 차례
 *         | { kind: 'ordered' }                                      1 < 2 < … < faces 가 엄격히 선다
 *         | { kind: 'inverted'; taller: number; shorter: number }   작은 눈 taller 의 칸이 큰 눈 shorter 의 칸보다 높다
 *         | { kind: 'level'; taller: number; shorter: number }      작은 눈 taller 의 칸과 큰 눈 shorter 의 칸이 같다
 *     }
 *
 * order 의 짝은 i < j 이면서 칸 i 가 칸 j 보다 낮지 않은 짝 가운데 차이가 가장 큰 것(같으면 앞의 것)이다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HistogramShapeFacetData = {
  type: 'histogram-shape';
  /** mulberry32 씨앗 */
  seed: number;
  /** 주사위 면의 수 = 칸의 수 */
  faces: number;
  /** 걸음을 만드는 표본 수의 수열. 첫 값은 0 */
  sampleCounts: number[];
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

export type OrderState =
  | { kind: 'ordered' }
  | { kind: 'inverted'; taller: number; shorter: number }
  | { kind: 'level'; taller: number; shorter: number };

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** 자료 좁히개 — 알고리즘 · 장면 · 무대가 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowHistogramShapeData(raw: unknown): HistogramShapeFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('histogram-shape: initialData 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'histogram-shape') throw new Error(`histogram-shape: initialData.type 이 'histogram-shape' 가 아니다 (${String(d.type)})`);
  if (!isInt(d.seed)) throw new Error('histogram-shape: initialData.seed 가 정수가 아니다');
  if (!isInt(d.faces) || d.faces < 2) throw new Error('histogram-shape: initialData.faces 가 2 이상의 정수가 아니다');
  if (!isInt(d.stepMs) || d.stepMs <= 0) throw new Error('histogram-shape: initialData.stepMs 가 양의 정수가 아니다');
  const counts = d.sampleCounts;
  if (!Array.isArray(counts) || counts.length < 2) throw new Error('histogram-shape: initialData.sampleCounts 가 둘 이상의 배열이 아니다');
  const seq: number[] = [];
  counts.forEach((c, i) => {
    if (!isInt(c)) throw new Error(`histogram-shape: initialData.sampleCounts[${i}] 가 정수가 아니다`);
    if (i === 0 && c !== 0) throw new Error('histogram-shape: initialData.sampleCounts[0] 은 0 이어야 한다');
    if (i > 0 && c <= seq[i - 1]!) throw new Error(`histogram-shape: initialData.sampleCounts[${i}] 가 앞 값보다 크지 않다`);
    seq.push(c);
  });
  return { type: 'histogram-shape', seed: d.seed, faces: d.faces, sampleCounts: seq, stepMs: d.stepMs };
}

/** 공통 안내문의 mulberry32 — [0, 1) */
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

/** 칸 높이의 차례를 가린다. 칸 번호는 눈(1 부터). */
function orderOf(bins: readonly number[]): OrderState {
  let best: { taller: number; shorter: number; gap: number } | null = null;
  for (let i = 0; i < bins.length; i += 1) {
    for (let j = i + 1; j < bins.length; j += 1) {
      const gap = bins[i]! - bins[j]!;
      if (gap < 0) continue;
      if (best === null || gap > best.gap) best = { taller: i + 1, shorter: j + 1, gap };
    }
  }
  if (best === null) return { kind: 'ordered' };
  if (best.gap === 0) return { kind: 'level', taller: best.taller, shorter: best.shorter };
  return { kind: 'inverted', taller: best.taller, shorter: best.shorter };
}

export async function histogramShape(context: FacetContext<HistogramShapeFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<HistogramShapeFacetData>;
  const data = narrowHistogramShapeData(ctx.data);
  const { faces, sampleCounts, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const draw = mulberry32(data.seed);
  const face = (): number => Math.floor(draw() * faces) + 1;
  const bins: number[] = new Array<number>(faces).fill(0);

  for (let s = 1; s < sampleCounts.length; s += 1) {
    // 걸음 0 의 빈 칸 여섯도 읽을 틈을 준다 — 첫 발신 앞에도 문을 둔다
    if (!(await pause())) return;
    const from = sampleCounts[s - 1]!;
    const to = sampleCounts[s]!;
    const before = bins.slice();
    const drops: number[] = [];
    let roll: { a: number; b: number } | null = null;
    for (let k = from; k < to; k += 1) {
      if (ctx.cancelled) return;
      const a = face();
      const b = face();
      const m = Math.max(a, b);
      bins[m - 1]! += 1;
      drops.push(m);
      if (to - from === 1) roll = { a, b };
    }
    const after = bins.slice();
    const added = after.map((c, i) => c - before[i]!);
    await ctx.emit({
      type: 'pour',
      payload: { from, to, before, after, added, drops, roll, order: orderOf(after) },
    });
  }
}
