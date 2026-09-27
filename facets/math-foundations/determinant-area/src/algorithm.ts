/**
 * determinant-area — 행렬로 옮기면 넓이는 몇 배가 되는가, 모양과 자리가 달라도 그 배수는 같은가.
 *
 * 행렬 A = [a b ; c d] 로 도형의 꼭짓점을 옮긴다 (점 p 가 가는 자리 = A p, 열 벡터).
 * 넓이는 신발끈 공식(꼭짓점 차례대로, 반시계면 양수)으로 셈하고, 배수 = 옮긴 뒤 넓이 / 옮기기 전 넓이.
 * 마지막에 네 칸으로 ad − bc 를 셈해 도형마다 배수와 정확히(===) 같은지 판정한다.
 *
 * 이벤트:
 *   init  (silent) — 걸음 0 의 바탕. 알고리즘이 셈한 넓이 · 그림 범위를 싣는다.
 *     payload: {
 *       a: number; b: number; c: number; d: number;
 *       shapes: { id: string; pts: [number, number][]; area: number }[];
 *       bounds: { minX: number; maxX: number; minY: number; maxY: number };  // 옮기기 전 · 뒤 꼭짓점 전부를 담는 정수 범위
 *       maxArea: number;                                                    // 옮기기 전 · 뒤 넓이 가운데 가장 큰 것
 *     }
 *   move           — 도형 하나를 A 로 옮긴다 (걸음 1 · 2).
 *     payload: { id: string; to: [number, number][]; before: number; after: number; ratio: number }
 *   det            — 네 칸으로 ad − bc 를 셈한다 (걸음 3).
 *     payload: { a: number; b: number; c: number; d: number; det: number; matches: string[] }
 *       matches — 배수가 det 와 정확히 같은 도형의 id (데이터 차례)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Pt = [number, number];

export type ShapeData = { id: string; pts: Pt[] };

export type DeterminantAreaFacetData = {
  type: 'determinant-area';
  stepMs: number;
  /** 행 차례: [[a, b], [c, d]] */
  matrix: [[number, number], [number, number]];
  shapes: ShapeData[];
};

function isFiniteNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function narrowPt(x: unknown, path: string): Pt {
  if (!Array.isArray(x) || x.length !== 2) throw new Error(`${path}: 점은 [x, y] 두 칸이어야 한다`);
  const [px, py] = x as unknown[];
  if (!isFiniteNum(px) || !isFiniteNum(py)) throw new Error(`${path}: 좌표가 수가 아니다`);
  return [px, py];
}

/** ctx.data · 장면의 initial 이 함께 쓰는 좁히개. 모양이 어긋나면 던진다. */
export function narrowDeterminantAreaData(x: unknown): DeterminantAreaFacetData {
  if (typeof x !== 'object' || x === null) throw new Error('determinant-area: 자료가 객체가 아니다');
  const o = x as Record<string, unknown>;
  if (o.type !== 'determinant-area') throw new Error('determinant-area: type 이 다르다');
  if (!isFiniteNum(o.stepMs) || o.stepMs < 0) throw new Error('determinant-area: stepMs 가 수가 아니다');
  const m = o.matrix;
  if (!Array.isArray(m) || m.length !== 2) throw new Error('determinant-area: matrix 는 줄 둘이어야 한다');
  const r0 = narrowPt(m[0], 'matrix[0]');
  const r1 = narrowPt(m[1], 'matrix[1]');
  if (!Array.isArray(o.shapes) || o.shapes.length === 0) throw new Error('determinant-area: shapes 가 비었다');
  const ids = new Set<string>();
  const shapes: ShapeData[] = o.shapes.map((s: unknown, i: number) => {
    if (typeof s !== 'object' || s === null) throw new Error(`shapes[${i}]: 객체가 아니다`);
    const so = s as Record<string, unknown>;
    if (typeof so.id !== 'string' || so.id === '') throw new Error(`shapes[${i}].id 가 비었다`);
    if (ids.has(so.id)) throw new Error(`shapes[${i}].id 가 겹친다: ${so.id}`);
    ids.add(so.id);
    if (!Array.isArray(so.pts) || so.pts.length < 3) throw new Error(`shapes[${i}].pts: 꼭짓점이 셋보다 적다`);
    return { id: so.id, pts: so.pts.map((p: unknown, j: number) => narrowPt(p, `shapes[${i}].pts[${j}]`)) };
  });
  return {
    type: 'determinant-area',
    stepMs: o.stepMs,
    matrix: [
      [r0[0], r0[1]],
      [r1[0], r1[1]],
    ],
    shapes,
  };
}

/** 점 p 를 A 로 옮긴 자리 = A p. */
export function applyMatrix(a: number, b: number, c: number, d: number, p: Pt): Pt {
  return [a * p[0] + b * p[1], c * p[0] + d * p[1]];
}

/** 신발끈 공식 — 꼭짓점 차례대로, 반시계면 양수. */
export function shoelaceArea(pts: Pt[]): number {
  let twice = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    if (p === undefined || q === undefined) throw new Error(`shoelaceArea: 꼭짓점 ${i} 가 없다`);
    twice += p[0] * q[1] - q[0] * p[1];
  }
  return twice / 2;
}

/** 수 표기 — 정수는 정수로, 0.5 의 배수는 소수 한 자리, 그 밖은 소수 둘째 자리. 빼기는 U+2212. */
export function formatNum(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`formatNum: 수가 아니다 (${n})`);
  const v = Object.is(n, -0) ? 0 : n;
  const abs = Math.abs(v);
  let body: string;
  if (Number.isInteger(abs)) body = String(abs);
  else if (Number.isInteger(abs * 2)) body = abs.toFixed(1);
  else body = abs.toFixed(2);
  return v < 0 && body !== '0' ? `−${body}` : body;
}

export async function determinantArea(context: FacetContext<DeterminantAreaFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<DeterminantAreaFacetData>;
  const data = narrowDeterminantAreaData(ctx.data);
  const { stepMs } = data;
  const [[a, b], [c, d]] = data.matrix;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 모든 도형을 미리 옮겨 넓이 · 배수 · 그림 범위를 셈한다.
  const plans = data.shapes.map((s) => {
    const before = shoelaceArea(s.pts);
    if (!(before > 0)) throw new Error(`${s.id}: 꼭짓점이 반시계가 아니거나 넓이가 0 이다 (${before})`);
    const to = s.pts.map((p) => applyMatrix(a, b, c, d, p));
    const after = shoelaceArea(to);
    if (!(after > 0)) throw new Error(`${s.id}: 옮긴 뒤 넓이가 양수가 아니다 (${after}) — 이 조각은 뒤집힘 · 납작해짐을 말하지 않는다`);
    const ratio = after / before;
    if (!Number.isInteger(ratio)) throw new Error(`${s.id}: 배수가 정수로 떨어지지 않는다 (${after} / ${before})`);
    return { id: s.id, pts: s.pts, to, before, after, ratio };
  });

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let maxArea = 0;
  for (const p of plans) {
    if (ctx.cancelled) return;
    for (const q of [...p.pts, ...p.to]) {
      minX = Math.min(minX, Math.floor(q[0]));
      maxX = Math.max(maxX, Math.ceil(q[0]));
      minY = Math.min(minY, Math.floor(q[1]));
      maxY = Math.max(maxY, Math.ceil(q[1]));
    }
    maxArea = Math.max(maxArea, p.before, p.after);
  }
  // 원점이 늘 틀 안에 든다 (축을 긋는다).
  minX = Math.min(minX, 0);
  maxX = Math.max(maxX, 0);
  minY = Math.min(minY, 0);
  maxY = Math.max(maxY, 0);

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      a,
      b,
      c,
      d,
      shapes: plans.map((p) => ({ id: p.id, pts: p.pts.map((q) => [q[0], q[1]]), area: p.before })),
      bounds: { minX, maxX, minY, maxY },
      maxArea,
    },
  });

  for (const p of plans) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'move',
      payload: { id: p.id, to: p.to.map((q) => [q[0], q[1]]), before: p.before, after: p.after, ratio: p.ratio },
    });
  }

  if (!(await pause())) return;
  const det = a * d - b * c;
  const matches = plans.filter((p) => p.ratio === det).map((p) => p.id);
  await ctx.emit({ type: 'det', payload: { a, b, c, d, det, matches } });
}
