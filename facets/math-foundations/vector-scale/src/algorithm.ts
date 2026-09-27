/**
 * vector-scale — 벡터에 수 k 를 곱하면 무엇이 바뀌고 무엇이 그대로인가.
 *
 * 한 화살표 v 에 k 의 차례를 하나씩 곱한다. 걸음 하나 = k 하나. 걸음 0 은 첫 k.
 * 머리 kv = (k·x, k·y), 길이 = √(x² + y²), 각 = atan2(y, x) 를 도로,
 * 길이 ÷ 처음 길이 = 셈한 두 길이를 나눈 값. 모두 여기서 셈한다.
 *
 * 이벤트
 *   init  (silent) — 바탕과 걸음 0 을 함께 싣는다
 *     payload: {
 *       v: [x, y]              곱하기 전 벡터
 *       len0: number           처음 길이 |v|
 *       unit: [x, y]           v 방향의 단위 벡터 (그림의 곧은 줄)
 *       maxLength: number      k 의 차례 전체에서 가장 긴 길이 (그림의 축척)
 *       bounds: { minX, maxX, minY, maxY }   원점과 모든 머리를 담는 범위
 *       k: number              첫 k
 *       head: [x, y]           첫 머리 kv
 *       length: number         그 길이
 *       angle: number          그 각 (도)
 *       ratio: number          length ÷ len0
 *     }
 *   scale — 다음 k 를 곱한다 (걸음)
 *     payload: {
 *       k, head, length, angle, ratio   위와 같은 뜻
 *       from: [x, y]           바로 앞 머리 (운동의 출발점)
 *       change: 'grow' | 'shrink'       앞 길이보다 늘었는가 줄었는가
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec2 = [number, number];

export type VectorScaleFacetData = {
  type: 'vector-scale';
  /** 벡터 기호 (번역하지 않는 자료) */
  vectorName: string;
  /** 스칼라 기호 (번역하지 않는 자료) */
  scalarName: string;
  v: Vec2;
  ks: number[];
  stepMs: number;
};

export type ScaleValues = {
  k: number;
  head: Vec2;
  length: number;
  angle: number;
  ratio: number;
};

/** |x| < 1e-9 이면 0 으로 붙인다 (−0 도 0 으로). */
export function snap(x: number): number {
  return Math.abs(x) < 1e-9 ? 0 : x;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function narrowVec2(raw: unknown, path: string): Vec2 {
  if (!Array.isArray(raw) || raw.length !== 2 || !raw.every(isFiniteNumber)) {
    throw new Error(`vector-scale: ${path} 는 유한한 수 둘이어야 한다`);
  }
  return [raw[0] as number, raw[1] as number];
}

/** initialData 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 던진다. */
export function narrowVectorScaleData(raw: unknown): VectorScaleFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('vector-scale: initialData 가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (d.type !== 'vector-scale') {
    throw new Error(`vector-scale: initialData.type 이 'vector-scale' 이 아니다 (${String(d.type)})`);
  }
  if (typeof d.vectorName !== 'string' || d.vectorName === '') {
    throw new Error('vector-scale: initialData.vectorName 이 비었다');
  }
  if (typeof d.scalarName !== 'string' || d.scalarName === '') {
    throw new Error('vector-scale: initialData.scalarName 이 비었다');
  }
  const v = narrowVec2(d.v, 'initialData.v');
  if (v[0] === 0 && v[1] === 0) {
    throw new Error('vector-scale: initialData.v 가 0 벡터다 — 방향이 없다');
  }
  if (!Array.isArray(d.ks) || d.ks.length === 0) {
    throw new Error('vector-scale: initialData.ks 가 비었다');
  }
  const ks: number[] = [];
  d.ks.forEach((k, i) => {
    if (!isFiniteNumber(k) || k <= 0) {
      throw new Error(`vector-scale: initialData.ks[${i}] 는 양수여야 한다 (${String(k)})`);
    }
    ks.push(k);
  });
  if (!isFiniteNumber(d.stepMs) || d.stepMs < 800) {
    throw new Error('vector-scale: initialData.stepMs 는 800 이상이어야 한다');
  }
  return {
    type: 'vector-scale',
    vectorName: d.vectorName,
    scalarName: d.scalarName,
    v,
    ks,
    stepMs: d.stepMs,
  };
}

/** 길이 = √(x² + y²) */
export function lengthOf(p: Vec2): number {
  return snap(Math.sqrt(p[0] * p[0] + p[1] * p[1]));
}

/** 각 = atan2(y, x) 를 도로 (−180..180) */
export function angleOf(p: Vec2): number {
  return snap((Math.atan2(p[1], p[0]) * 180) / Math.PI);
}

/** kv 와 그 길이 · 각 · 처음 길이에 대한 비 */
export function scaleBy(v: Vec2, k: number, len0: number): ScaleValues {
  const head: Vec2 = [snap(k * v[0]), snap(k * v[1])];
  const length = lengthOf(head);
  return { k, head, length, angle: angleOf(head), ratio: snap(length / len0) };
}

/** 셈한 값의 소수 자릿수 표기. 0 으로 붙이고 음수는 빼기 기호로. */
export function fixed(x: number, digits: number): string {
  const s = snap(x).toFixed(digits);
  const z = Number(s) === 0 ? (0).toFixed(digits) : s;
  return z.replace('-', '−');
}

/** 주어진 수 · 좌표를 군더더기 0 없이 (2 → "2", 0.5 → "0.5"). 소수 둘째까지. */
export function plain(x: number): string {
  const s = fixed(x, 2);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

export async function vectorScale(context: FacetContext<VectorScaleFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<VectorScaleFacetData>;
  const data = narrowVectorScaleData(ctx.data);
  const { v, ks, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const len0 = lengthOf(v);
  const unit: Vec2 = [snap(v[0] / len0), snap(v[1] / len0)];
  const all = ks.map((k) => scaleBy(v, k, len0));

  let maxLength = 0;
  const bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  for (const s of all) {
    if (ctx.cancelled) return;
    maxLength = Math.max(maxLength, s.length);
    bounds.minX = Math.min(bounds.minX, s.head[0]);
    bounds.maxX = Math.max(bounds.maxX, s.head[0]);
    bounds.minY = Math.min(bounds.minY, s.head[1]);
    bounds.maxY = Math.max(bounds.maxY, s.head[1]);
  }

  const first = all[0] as ScaleValues;
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { v: [v[0], v[1]], len0, unit, maxLength, bounds, ...first },
  });

  let prev = first;
  for (const cur of all.slice(1)) {
    if (!(await pause())) return;
    if (cur.length === prev.length) {
      throw new Error(`vector-scale: k ${cur.k} 가 앞 걸음과 같은 길이를 낸다 — 늘지도 줄지도 않는 걸음`);
    }
    await ctx.emit({
      type: 'scale',
      payload: {
        ...cur,
        from: [prev.head[0], prev.head[1]],
        change: cur.length > prev.length ? 'grow' : 'shrink',
      },
    });
    prev = cur;
  }
}
