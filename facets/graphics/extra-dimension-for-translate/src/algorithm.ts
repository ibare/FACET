/**
 * extra-dimension-for-translate — 칸 하나를 더해 옮김도 행렬 곱으로.
 *
 * 1차 자료는 옮김 offset = (dx, dy) 와 점 셋이다. 3×3 행렬
 * [[1, 0, dx], [0, 1, dy], [0, 0, 1]] 은 여기서 offset 으로 만든다.
 * 점마다 셋째 칸 1 을 붙이고(lift), 한 점씩 3×3 · (x, y, 1) 을 셈한다(multiply).
 * 곱의 셋째 칸이 1 이 아니면 던진다 — 여기서는 w 로 나누지 않는다.
 *
 * 이벤트 (차례대로):
 *   init      silent  { matrix: number[][] (3×3, 행의 목록),
 *                       bounds: { minX, maxX, minY, maxY } — 처음 점과 옮긴 점을 담는 정수 범위(여유 1) }
 *   lift              { points: { id: string; v: [x, y, 1] }[] }  — 자료의 점 차례 그대로
 *   multiply          { id: string; from: [x, y, w]; to: [x', y', w'];
 *                       added: [cx, cy] — 셋째 열의 위 두 칸 × from 의 w (x · y 에 더해지는 몫) }
 *
 * 걸음: 0 처음(init 이 갈아 끼운다) · 1 lift · 2..(1+점 수) multiply — 점 하나에 한 걸음.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type Matrix3 = readonly [Vec3, Vec3, Vec3];

export type TranslatePoint = { readonly id: string; readonly at: Vec2 };

export type ExtraDimensionForTranslateFacetData = {
  type: 'extra-dimension-for-translate';
  stepMs: number;
  /** 옮김 (dx, dy) — 1차 자료. 행렬은 여기서 만든다 */
  offset: Vec2;
  /** 곱하는 차례대로의 점 */
  points: readonly TranslatePoint[];
};

export type PlaneBounds = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function narrowVec2(v: unknown, path: string): Vec2 {
  if (!Array.isArray(v) || v.length !== 2) throw new Error(`${path}: 두 수의 배열이어야 한다`);
  const [a, b] = v as unknown[];
  if (!isFiniteNumber(a) || !isFiniteNumber(b)) throw new Error(`${path}: 유한한 수가 아니다`);
  return [a, b];
}

/** 자료 좁히개 — 알고리즘과 장면의 `initial` 이 함께 부른다. 어긋나면 던진다. */
export function narrowTranslateData(raw: unknown): ExtraDimensionForTranslateFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('initialData: 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'extra-dimension-for-translate') {
    throw new Error(`initialData.type: 'extra-dimension-for-translate' 가 아니다 (${String(r.type)})`);
  }
  if (!isFiniteNumber(r.stepMs) || r.stepMs < 0) throw new Error('initialData.stepMs: 0 이상의 수가 아니다');
  const offset = narrowVec2(r.offset, 'initialData.offset');
  if (!Array.isArray(r.points) || r.points.length === 0) {
    throw new Error('initialData.points: 비어 있지 않은 배열이어야 한다');
  }
  const seen = new Set<string>();
  const points = (r.points as unknown[]).map((p, i): TranslatePoint => {
    if (typeof p !== 'object' || p === null) throw new Error(`initialData.points[${i}]: 객체가 아니다`);
    const q = p as Record<string, unknown>;
    if (typeof q.id !== 'string' || q.id === '') throw new Error(`initialData.points[${i}].id: 빈 문자열이 아닌 식별자여야 한다`);
    if (seen.has(q.id)) throw new Error(`initialData.points[${i}].id: '${q.id}' 가 겹친다`);
    seen.add(q.id);
    return { id: q.id, at: narrowVec2(q.at, `initialData.points[${i}].at`) };
  });
  return { type: 'extra-dimension-for-translate', stepMs: r.stepMs, offset, points };
}

/** offset 에서 3×3 옮김 행렬을 만든다 — 셋째 열의 위 두 칸이 offset 이다. */
export function translationMatrix(offset: Vec2): Matrix3 {
  return [
    [1, 0, offset[0]],
    [0, 1, offset[1]],
    [0, 0, 1],
  ];
}

/** 3×3 · 열 벡터. 크기가 어긋나면 던진다. */
export function multiply3(m: Matrix3, v: Vec3): Vec3 {
  if (m.length !== 3 || m.some((row) => row.length !== 3)) throw new Error('multiply3: 3×3 행렬이 아니다');
  if (v.length !== 3) throw new Error('multiply3: 세 칸 벡터가 아니다');
  const row = (r: Vec3): number => r[0] * v[0] + r[1] * v[1] + r[2] * v[2];
  return [row(m[0]), row(m[1]), row(m[2])];
}

function planeBounds(points: readonly TranslatePoint[], offset: Vec2): PlaneBounds {
  const xs: number[] = [0];
  const ys: number[] = [0];
  for (const p of points) {
    xs.push(p.at[0], p.at[0] + offset[0]);
    ys.push(p.at[1], p.at[1] + offset[1]);
  }
  return {
    minX: Math.floor(Math.min(...xs)) - 1,
    maxX: Math.ceil(Math.max(...xs)) + 1,
    minY: Math.floor(Math.min(...ys)) - 1,
    maxY: Math.ceil(Math.max(...ys)) + 1,
  };
}

export async function extraDimensionForTranslate(
  base: FacetContext<ExtraDimensionForTranslateFacetData>,
): Promise<void> {
  const ctx = base as ReactiveContext<ExtraDimensionForTranslateFacetData>;
  const data = narrowTranslateData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const matrix = translationMatrix(data.offset);
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { matrix, bounds: planeBounds(data.points, data.offset) },
  });

  // 걸음 0 은 옮김과 행렬 · 점이 선 화면이다 — 읽을 틈을 준다
  if (!(await pause())) return;

  const lifted = data.points.map((p) => ({ id: p.id, v: [p.at[0], p.at[1], 1] as Vec3 }));
  await ctx.emit({ type: 'lift', payload: { points: lifted } });

  for (const { id, v } of lifted) {
    if (!(await pause())) return;
    const to = multiply3(matrix, v);
    if (to[2] !== 1) throw new Error(`multiply(${id}): 셋째 칸이 1 이 아니다 (${to[2]})`);
    const added: Vec2 = [matrix[0][2] * v[2], matrix[1][2] * v[2]];
    await ctx.emit({ type: 'multiply', payload: { id, from: v, to, added } });
  }
}
