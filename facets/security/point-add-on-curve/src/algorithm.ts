/**
 * point-add-on-curve — 타원 곡선 위의 두 점 P · Q 를 더한다.
 *
 * 곡선 y² = x³ + a·x + b (실수 위) 위의 두 점을 곧은 선으로 잇고, 그 선이 곡선을
 * 셋째로 만나는 점을 x 축에 대해 뒤집은 것이 P + Q 다. 기울기 · 셋째 점 · P + Q ·
 * 곡선 위 확인은 전부 여기서 셈한다. 셈이 어긋나면 던진다.
 *
 * 이벤트 (발신 순서대로):
 *   init    silent  { a: number, b: number,
 *                     p: { name: string, x: number, y: number },
 *                     q: { name: string, x: number, y: number },
 *                     roots: number[],                       // x³ + ax + b = 0 의 실근 (오름차순, 곡선을 그릴 자리)
 *                     frame: { xMin: number, xMax: number, yAbs: number } }  // 이 덧셈에 드는 점 · 곡선 끝을 모두 담는 범위
 *   connect         { lambda: number, intercept: number }   // P 와 Q 를 잇는 선 y = λx + c
 *   meet            { x: number, y: number }                // 선이 곡선을 셋째로 만나는 점
 *   flip            { from: { x: number, y: number },       // 뒤집기 전 (셋째 점)
 *                     to: { x: number, y: number },         // P + Q
 *                     lhs: number, rhs: number }            // 곡선 위 확인: y² 과 x³ + ax + b
 *
 * 걸음: init 뒤 stepMs 를 두어 처음 화면(곡선 · P · Q)을 읽게 하고, connect · meet · flip
 * 사이마다 stepMs 를 둔다. flip 뒤에는 그냥 돌아온다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CurvePoint = { name: string; x: number; y: number };

export type PointAddOnCurveFacetData = {
  type: 'point-add-on-curve';
  a: number;
  b: number;
  p: CurvePoint;
  q: CurvePoint;
  stepMs: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function narrowInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`point-add-on-curve: ${path} 는 정수여야 한다 (받은 것: ${String(v)})`);
  }
  return v;
}

function narrowPoint(v: unknown, path: string): CurvePoint {
  if (!isRecord(v)) throw new Error(`point-add-on-curve: ${path} 는 점 객체여야 한다`);
  const name = v['name'];
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`point-add-on-curve: ${path}.name 이 비었다`);
  }
  return { name, x: narrowInt(v['x'], `${path}.x`), y: narrowInt(v['y'], `${path}.y`) };
}

/** initialData 좁히개 — 알고리즘과 장면이 함께 부른다. */
export function narrowPointAddData(raw: unknown): PointAddOnCurveFacetData {
  if (!isRecord(raw)) throw new Error('point-add-on-curve: initialData 가 객체가 아니다');
  if (raw['type'] !== 'point-add-on-curve') {
    throw new Error(`point-add-on-curve: initialData.type 이 어긋났다 (${String(raw['type'])})`);
  }
  const stepMs = raw['stepMs'];
  if (typeof stepMs !== 'number' || !(stepMs >= 800)) {
    throw new Error(`point-add-on-curve: initialData.stepMs 는 800 이상이어야 한다 (${String(stepMs)})`);
  }
  return {
    type: 'point-add-on-curve',
    a: narrowInt(raw['a'], 'initialData.a'),
    b: narrowInt(raw['b'], 'initialData.b'),
    p: narrowPoint(raw['p'], 'initialData.p'),
    q: narrowPoint(raw['q'], 'initialData.q'),
    stepMs,
  };
}

/** 곡선의 오른쪽 x³ + a·x + b. 곡선을 그리는 그림도 이 함수를 부른다. */
export function curveRhs(a: number, b: number, x: number): number {
  return x * x * x + a * x + b;
}

function assertOnCurve(a: number, b: number, x: number, y: number, what: string): void {
  const lhs = y * y;
  const rhs = curveRhs(a, b, x);
  if (lhs !== rhs) {
    throw new Error(`point-add-on-curve: ${what} (${x}, ${y}) 가 곡선 위에 없다 — y² ${lhs} ≠ ${rhs}`);
  }
}

/** f(lo) 와 f(hi) 의 부호가 다를 때 이분법으로 근을 좁힌다. */
function bisect(f: (x: number) => number, lo: number, hi: number): number {
  let l = lo;
  let h = hi;
  let fl = f(l);
  for (let i = 0; i < 200; i += 1) {
    const m = (l + h) / 2;
    const fm = f(m);
    if (fm === 0) return m;
    if (fl < 0 === fm < 0) {
      l = m;
      fl = fm;
    } else {
      h = m;
    }
  }
  return (l + h) / 2;
}

/** x³ + a·x + b = 0 의 실근 (오름차순). 극값 사이 구간마다 부호가 바뀌는 곳을 좁힌다. */
function realRoots(a: number, b: number): number[] {
  const f = (x: number): number => curveRhs(a, b, x);
  const bound = 1 + Math.max(Math.abs(a), Math.abs(b));
  const cuts: number[] = [-bound];
  if (a < 0) {
    const c = Math.sqrt(-a / 3);
    cuts.push(-c, c);
  }
  cuts.push(bound);
  const roots: number[] = [];
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const lo = cuts[i];
    const hi = cuts[i + 1];
    if (lo === undefined || hi === undefined) throw new Error('point-add-on-curve: 근 구간이 비었다');
    const flo = f(lo);
    const fhi = f(hi);
    if (flo === 0) roots.push(lo);
    else if (flo < 0 !== fhi < 0 && fhi !== 0) roots.push(bisect(f, lo, hi));
  }
  if (roots.length === 0) throw new Error('point-add-on-curve: 곡선의 실근을 찾지 못했다');
  return roots;
}

export async function pointAddOnCurve(context: FacetContext<unknown>): Promise<void> {
  const ctx = context as ReactiveContext<unknown>;
  const data = narrowPointAddData(ctx.data);
  const { a, b, p, q, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 특이 곡선(뾰족점 · 교차점)이면 덧셈이 서지 않는다.
  if (4 * a * a * a + 27 * b * b === 0) {
    throw new Error('point-add-on-curve: 4a³ + 27b² = 0 — 특이 곡선이다');
  }
  assertOnCurve(a, b, p.x, p.y, p.name);
  assertOnCurve(a, b, q.x, q.y, q.name);

  // 기울기 λ = (y2 − y1) / (x2 − x1)
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  if (dx === 0) {
    throw new Error('point-add-on-curve: x1 = x2 — 접선 · 무한원점 경우는 이 조각이 다루지 않는다');
  }
  if (dy % dx !== 0) {
    throw new Error(`point-add-on-curve: 기울기 ${dy}/${dx} 가 정수로 떨어지지 않는다`);
  }
  const lambda = dy / dx;
  const intercept = p.y - lambda * p.x;

  // 셋째 점: x3 = λ² − x1 − x2, 선 위의 y = λ(x3 − x1) + y1
  const x3 = lambda * lambda - p.x - q.x;
  const yLine = lambda * (x3 - p.x) + p.y;
  assertOnCurve(a, b, x3, yLine, '셋째 점');

  // P + Q = (x3, y3) · y3 = λ(x1 − x3) − y1
  const y3 = lambda * (p.x - x3) - p.y;
  if (y3 !== -yLine) {
    throw new Error(`point-add-on-curve: y3 ${y3} 가 셋째 점의 y ${yLine} 를 뒤집은 값이 아니다`);
  }
  const lhs = y3 * y3;
  const rhs = curveRhs(a, b, x3);
  if (lhs !== rhs) {
    throw new Error(`point-add-on-curve: P + Q (${x3}, ${y3}) 가 곡선 위에 없다 — ${lhs} ≠ ${rhs}`);
  }

  const roots = realRoots(a, b);
  const xs = [p.x, q.x, x3, ...roots];
  const frame = {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yAbs: Math.max(Math.abs(p.y), Math.abs(q.y), Math.abs(y3)),
  };

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      a,
      b,
      p: { name: p.name, x: p.x, y: p.y },
      q: { name: q.name, x: q.x, y: q.y },
      roots,
      frame,
    },
  });

  // 처음 화면(곡선 · 두 점)을 읽을 틈
  if (!(await pause())) return;
  await ctx.emit({ type: 'connect', payload: { lambda, intercept } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'meet', payload: { x: x3, y: yLine } });

  if (!(await pause())) return;
  await ctx.emit({
    type: 'flip',
    payload: { from: { x: x3, y: yLine }, to: { x: x3, y: y3 }, lhs, rhs },
  });
}
