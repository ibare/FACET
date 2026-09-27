/**
 * vector-normalize — 화살표 넷을 하나씩 제 길이로 나눈다.
 *
 * 이벤트
 *   init       (silent: true) — 걸음 0 의 바탕. 알고리즘이 셈한 값을 싣는다.
 *              payload: {
 *                lengths: number[]   // 벡터마다 √(x² + y²)
 *                angles: number[]    // 벡터마다 atan2(y, x) 를 도로 (−180..180)
 *                directions: { x: number; y: number }[]
 *                                    // 벡터마다 원래 줄의 방향 (길이 1). 무대가 이름 글자 · 화살 머리를 그 줄에 맞춘다
 *                bounds: { minX: number; maxX: number; minY: number; maxY: number }
 *                                    // 원래 머리 넷과 원점 · 길이 1 의 원을 모두 담는 틀
 *                maxLength: number   // 원래 길이와 1 가운데 가장 큰 것
 *              }
 *   normalize  (silent 아님) — 벡터 하나를 제 길이로 나눴다. 데이터 차례대로 한 번씩.
 *              payload: {
 *                index: number       // 나눈 벡터의 자리
 *                divisor: number     // 나눈 수 = 원래 길이
 *                x: number; y: number  // 단위 벡터 = (x ÷ 길이, y ÷ 길이)
 *                length: number      // 단위 벡터의 길이를 다시 셈한 값
 *                angleBefore: number // 나누기 앞의 각 (도)
 *                angleAfter: number  // 나눈 뒤의 각 (도)
 *                factor: number      // 곱한 수 = 1 ÷ 길이
 *              }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NormalizeVector = { name: string; x: number; y: number };

export type VectorNormalizeFacetData = {
  type: 'vector-normalize';
  vectors: NormalizeVector[];
  stepMs: number;
};

export type NormalizeBounds = { minX: number; maxX: number; minY: number; maxY: number };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** initialData 좁히개 — 알고리즘 · 장면 · 무대가 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowVectorNormalizeData(raw: unknown): VectorNormalizeFacetData {
  if (!isRecord(raw)) throw new Error('vector-normalize: initialData 가 객체가 아니다');
  if (raw['type'] !== 'vector-normalize') {
    throw new Error(`vector-normalize: initialData.type 이 'vector-normalize' 가 아니다 (${String(raw['type'])})`);
  }
  const stepMs = raw['stepMs'];
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs <= 0) {
    throw new Error('vector-normalize: initialData.stepMs 가 양수가 아니다');
  }
  const list = raw['vectors'];
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('vector-normalize: initialData.vectors 가 비었거나 배열이 아니다');
  }
  const vectors: NormalizeVector[] = list.map((item: unknown, i: number) => {
    if (!isRecord(item)) throw new Error(`vector-normalize: initialData.vectors[${i}] 가 객체가 아니다`);
    const { name, x, y } = item;
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error(`vector-normalize: initialData.vectors[${i}].name 이 비었다`);
    }
    if (typeof x !== 'number' || !Number.isFinite(x)) {
      throw new Error(`vector-normalize: initialData.vectors[${i}].x 가 수가 아니다`);
    }
    if (typeof y !== 'number' || !Number.isFinite(y)) {
      throw new Error(`vector-normalize: initialData.vectors[${i}].y 가 수가 아니다`);
    }
    if (x === 0 && y === 0) {
      throw new Error(`vector-normalize: initialData.vectors[${i}] 는 영벡터라 길이로 나눌 수 없다`);
    }
    return { name, x, y };
  });
  return { type: 'vector-normalize', vectors, stepMs };
}

export function vectorLength(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function vectorAngleDeg(x: number, y: number): number {
  return (Math.atan2(y, x) * 180) / Math.PI;
}

const MINUS = '−';

/** 셈한 값의 표시 — 0 붙이기 · 자릿수 반올림 · 빼기 기호. */
export function formatValue(v: number, digits: number): string {
  const snapped = Math.abs(v) < 1e-9 ? 0 : v;
  const s = snapped.toFixed(digits);
  // 반올림 끝에 −0.00 이 되면 0 으로
  if (Number(s) === 0) return (0).toFixed(digits);
  return s.replace('-', MINUS);
}

/** 1차 데이터 좌표의 표시 — 주어진 그대로, 빼기 기호만 바꾼다. */
export function formatRaw(v: number): string {
  return String(v).replace('-', MINUS);
}

/** 좌표쌍 글자 — 수 표기이지 문장이 아니다. */
export function formatPair(a: string, b: string): string {
  return `(${a}, ${b})`;
}

export async function vectorNormalize(ctx: FacetContext<VectorNormalizeFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<VectorNormalizeFacetData>;
  const data = narrowVectorNormalizeData(ctx.data);
  const { vectors, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const lengths = vectors.map((v) => vectorLength(v.x, v.y));
  const angles = vectors.map((v) => vectorAngleDeg(v.x, v.y));
  const directions = vectors.map((v, i) => {
    const len = lengths[i];
    if (len === undefined) throw new Error(`vector-normalize: lengths[${i}] 가 없다`);
    return { x: v.x / len, y: v.y / len };
  });
  const bounds: NormalizeBounds = {
    minX: Math.min(-1, ...vectors.map((v) => v.x)),
    maxX: Math.max(1, ...vectors.map((v) => v.x)),
    minY: Math.min(-1, ...vectors.map((v) => v.y)),
    maxY: Math.max(1, ...vectors.map((v) => v.y)),
  };
  const maxLength = Math.max(1, ...lengths);

  await rctx.emit({ type: 'init', silent: true, payload: { lengths, angles, directions, bounds, maxLength } });

  for (let index = 0; index < vectors.length; index += 1) {
    // 걸음 0 이 이미 넷을 보이므로 첫 나누기 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    const v = vectors[index];
    const divisor = lengths[index];
    if (v === undefined || divisor === undefined) {
      throw new Error(`vector-normalize: vectors[${index}] 를 찾지 못했다`);
    }
    const x = v.x / divisor;
    const y = v.y / divisor;
    await rctx.emit({
      type: 'normalize',
      payload: {
        index,
        divisor,
        x,
        y,
        length: vectorLength(x, y),
        angleBefore: vectorAngleDeg(v.x, v.y),
        angleAfter: vectorAngleDeg(x, y),
        factor: 1 / divisor,
      },
    });
  }
}
