/**
 * scale-stretches — 축마다 다른 배율로 늘이고 줄이면 도형의 각이 벌어진다.
 *
 * 처음 도형(꼭짓점 목록)에 배율 차례 (sx, sy) 를 하나씩 곱한다. 곱은 늘 **처음 도형**에 한다
 * (앞 걸음의 결과에 거듭 곱하지 않는다). 행렬 S = [[sx, 0], [0, sy]], p' = S · p.
 * 좌표계는 x 오른쪽 · y 위.
 *
 * 이벤트
 *   init   (silent) — 걸음 0 의 바탕. 알고리즘이 셈한 값을 싣는다.
 *     payload: {
 *       sx: number, sy: number,          // 처음 배율 (항등 — 1, 1)
 *       angle: number,                   // angleAt 꼭짓점의 각 (도, 0..180)
 *       edge: number,                    // 변의 길이 (네 변이 같다)
 *       onAxis: string[],                // y 축 위(x = 0)에 놓인 꼭짓점 식별자
 *       frame: { xMax: number, yMin: number, yMax: number }  // 모든 걸음을 담는 좌표 범위
 *     }
 *   scale  — 배율 하나. 네 꼭짓점이 함께 새 자리로 간다.
 *     payload: {
 *       index: number,                   // 배율 차례의 몇 번째 (0 부터)
 *       sx: number, sy: number,
 *       axis: 'x' | 'y' | 'both',        // 앞 배율과 견주어 바뀐 축
 *       grow: boolean,                   // 바뀐 축의 배율이 커졌는가
 *       points: { id: string, x: number, y: number }[],  // 처음 도형에 S 를 곱한 자리
 *       angle: number, edge: number,
 *       fromAngle: number,               // 앞 걸음의 각 (장면이 지금 값과 맞는지 본다)
 *       moved: { id: string, dist: number }[]  // 앞 걸음 자리에서 이번 자리까지 간 거리
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface StretchVertex {
  id: string;
  x: number;
  y: number;
}

export interface StretchFactor {
  sx: number;
  sy: number;
}

export interface ScaleStretchesFacetData {
  type: 'scale-stretches';
  /** 도는 차례대로의 꼭짓점. 처음 좌표 */
  vertices: StretchVertex[];
  /** 각을 잴 꼭짓점의 식별자 */
  angleAt: string;
  /** 배율 차례. 늘 처음 도형에 곱한다 */
  factors: StretchFactor[];
  stepMs: number;
}

const EPS = 1e-9;

function fail(path: string, why: string): never {
  throw new Error(`scale-stretches: ${path} — ${why}`);
}

function finite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 부른다. 값을 베껴 돌려준다. */
export function readScaleStretchesData(raw: unknown): ScaleStretchesFacetData {
  if (typeof raw !== 'object' || raw === null) fail('data', '객체가 아니다');
  const rec = raw as Record<string, unknown>;
  if (rec.type !== 'scale-stretches') fail('data.type', `'scale-stretches' 가 아니다`);
  const vs = rec.vertices;
  if (!Array.isArray(vs) || vs.length < 3) fail('data.vertices', '꼭짓점 셋 이상의 배열이 아니다');
  const seen = new Set<string>();
  const vertices = vs.map((v: unknown, i): StretchVertex => {
    if (typeof v !== 'object' || v === null) fail(`data.vertices[${i}]`, '객체가 아니다');
    const r = v as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id === '') fail(`data.vertices[${i}].id`, '빈 식별자');
    if (seen.has(r.id)) fail(`data.vertices[${i}].id`, `겹친 식별자 ${r.id}`);
    seen.add(r.id);
    return { id: r.id, x: finite(r.x, `data.vertices[${i}].x`), y: finite(r.y, `data.vertices[${i}].y`) };
  });
  if (typeof rec.angleAt !== 'string' || !seen.has(rec.angleAt)) {
    fail('data.angleAt', '꼭짓점 식별자가 아니다');
  }
  const fs = rec.factors;
  if (!Array.isArray(fs) || fs.length === 0) fail('data.factors', '빈 배율 차례');
  const factors = fs.map((f: unknown, i): StretchFactor => {
    if (typeof f !== 'object' || f === null) fail(`data.factors[${i}]`, '객체가 아니다');
    const r = f as Record<string, unknown>;
    const sx = finite(r.sx, `data.factors[${i}].sx`);
    const sy = finite(r.sy, `data.factors[${i}].sy`);
    if (sx <= 0 || sy <= 0) fail(`data.factors[${i}]`, '배율은 0 보다 커야 한다');
    return { sx, sy };
  });
  const stepMs = finite(rec.stepMs, 'data.stepMs');
  if (stepMs < 0) fail('data.stepMs', '음수');
  return { type: 'scale-stretches', vertices, angleAt: rec.angleAt, factors, stepMs };
}

/** p' = S · p, S = [[sx, 0], [0, sy]] */
export function stretchPoint(p: StretchVertex, f: StretchFactor): StretchVertex {
  const m = [
    [f.sx, 0],
    [0, f.sy],
  ] as const;
  return { id: p.id, x: m[0][0] * p.x + m[0][1] * p.y, y: m[1][0] * p.x + m[1][1] * p.y };
}

/** 꼭짓점 at 에서 이웃한 두 꼭짓점으로 가는 두 벡터 사이의 각 (도, 0..180). */
export function cornerAngle(points: StretchVertex[], at: string): number {
  const k = points.findIndex((p) => p.id === at);
  if (k < 0) fail('angleAt', `꼭짓점 ${at} 이 도형에 없다`);
  const n = points.length;
  const here = points[k]!;
  const back = points[(k - 1 + n) % n]!;
  const next = points[(k + 1) % n]!;
  const ux = back.x - here.x;
  const uy = back.y - here.y;
  const wx = next.x - here.x;
  const wy = next.y - here.y;
  const lu = Math.hypot(ux, uy);
  const lw = Math.hypot(wx, wy);
  if (lu < EPS || lw < EPS) fail(`angle at ${at}`, '길이 0 인 변');
  const c = Math.min(1, Math.max(-1, (ux * wx + uy * wy) / (lu * lw)));
  return (Math.acos(c) * 180) / Math.PI;
}

/** 변 길이 하나 — 네 변이 같지 않으면 이 조각이 말할 수 있는 도형이 아니라 던진다. */
export function sideLength(points: StretchVertex[]): number {
  const lens = points.map((p, i) => {
    const q = points[(i + 1) % points.length]!;
    return Math.hypot(q.x - p.x, q.y - p.y);
  });
  const first = lens[0]!;
  if (first < EPS) fail('edges', '길이 0 인 변');
  for (let i = 1; i < lens.length; i += 1) {
    if (Math.abs(lens[i]! - first) > EPS * Math.max(1, first)) {
      fail(`edges[${i}]`, '변의 길이가 서로 다르다 — 마름모가 아니다');
    }
  }
  return first;
}

export async function scaleStretches(
  context: FacetContext<ScaleStretchesFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<ScaleStretchesFacetData>;
  const data = readScaleStretchesData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const identity: StretchFactor = { sx: 1, sy: 1 };
  const shapes = data.factors.map((f) => data.vertices.map((v) => stretchPoint(v, f)));

  // 좌표 범위 — 처음 도형과 모든 걸음의 자리를 담는다. 원점도 늘 안에 든다.
  let xMax = 0;
  let yMin = 0;
  let yMax = 0;
  for (const shape of [data.vertices, ...shapes]) {
    if (ctx.cancelled) return;
    for (const p of shape) {
      xMax = Math.max(xMax, Math.abs(p.x));
      yMin = Math.min(yMin, p.y);
      yMax = Math.max(yMax, p.y);
    }
  }

  const startAngle = cornerAngle(data.vertices, data.angleAt);
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      sx: identity.sx,
      sy: identity.sy,
      angle: startAngle,
      edge: sideLength(data.vertices),
      onAxis: data.vertices.filter((v) => v.x === 0).map((v) => v.id),
      frame: { xMax, yMin, yMax },
    },
  });

  let before: StretchVertex[] = data.vertices;
  let beforeFactor = identity;
  let beforeAngle = startAngle;
  for (let i = 0; i < data.factors.length; i += 1) {
    if (!(await pause())) return;
    const f = data.factors[i]!;
    const points = shapes[i]!;
    const angle = cornerAngle(points, data.angleAt);
    const xChanged = f.sx !== beforeFactor.sx;
    const yChanged = f.sy !== beforeFactor.sy;
    if (!xChanged && !yChanged) fail(`data.factors[${i}]`, '앞 배율과 같다 — 움직임이 없는 걸음');
    const axis = xChanged && yChanged ? 'both' : xChanged ? 'x' : 'y';
    const grow = axis === 'y' ? f.sy > beforeFactor.sy : f.sx > beforeFactor.sx;
    const moved = points.map((p, j) => {
      const q = before[j]!;
      return { id: p.id, dist: Math.hypot(p.x - q.x, p.y - q.y) };
    });
    await ctx.emit({
      type: 'scale',
      payload: {
        index: i,
        sx: f.sx,
        sy: f.sy,
        axis,
        grow,
        points: points.map((p) => ({ id: p.id, x: p.x, y: p.y })),
        angle,
        edge: sideLength(points),
        fromAngle: beforeAngle,
        moved,
      },
    });
    before = points;
    beforeFactor = f;
    beforeAngle = angle;
  }
}
