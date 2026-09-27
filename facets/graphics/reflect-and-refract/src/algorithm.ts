/**
 * 반사와 굴절 — 유리 면에 닿은 광선이 닿은 점에서 어느 방향으로 갈라지는가.
 *
 * 2 차원 (x, y), y 가 위. 경계는 수평선 y = boundaryY 이고 그 위가 `above` 매질, 아래가 `below` 매질이다.
 * 광선마다 차례로: 경계에 닿고 → 법선을 거울 삼아 튕기고 → 건너편으로 꺾인다 (또는 꺾이지 못한다).
 * 갈라진 광선은 더 따라가지 않는다 (한 번 닿음만). 방향만 셈하고 빛의 몫(프레넬)은 셈하지 않는다.
 *
 * 규약
 *   닿는 점 = 광선이 경계를 지나는 자리 (tHit > ε 인 것만).
 *   법선 N 은 광선이 온 쪽을 향하게 잡는다 (D·N < 0). n₁ = 온 쪽 굴절률, n₂ = 건너편.
 *   반사 R = D − 2(D·N)N.
 *   굴절: η = n₁/n₂, cos i = −D·N, k = 1 − η²(1 − cos² i). k < 0 이면 굴절 없음, 아니면 T = ηD + (η cos i − √k)N.
 *   각은 법선에서 잰 도.
 *
 * 이벤트 (차례대로)
 *   init        silent  { extent: { minX, maxX, minY, maxY } }
 *                        — 광선 원점 · 닿는 점 · 갈라진 광선 끝(닿는 점 + tHit·방향)을 모두 담는 월드 범위
 *   hit                 target `ray:<id>` · { ray: string, point: [x, y], tHit: number, dir: [x, y],
 *                          normal: [x, y], incidence: number, n1: number, n2: number }
 *                        — dir 은 정규화한 입사 방향, normal 은 온 쪽을 향한 법선
 *   reflect             target `ray:<id>` · { ray: string, dir: [x, y], angle: number }
 *   refract             target `ray:<id>` · { ray: string, dir: [x, y], angle: number, sin: number, bend: number }
 *                        — sin 은 sinθ₂ = η·sinθ₁, bend 는 입사각 − 굴절각 (법선 쪽으로 꺾인 각)
 *   no-refract          target `ray:<id>` · { ray: string, sin: number, n1: number, n2: number, incidence: number }
 *                        — sinθ₂ = n₁·sinθ₁/n₂ 가 1 을 넘어 꺾일 방향이 없다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec2 = readonly [number, number];

export type MediumData = { readonly id: string; readonly n: number };

export type RayData = { readonly id: string; readonly origin: Vec2; readonly dir: Vec2 };

export type ReflectAndRefractFacetData = {
  readonly type: 'reflect-and-refract';
  readonly stepMs: number;
  readonly boundaryY: number;
  /** 경계의 법선 — `above` 쪽을 향한다 */
  readonly normal: Vec2;
  readonly above: MediumData;
  readonly below: MediumData;
  readonly rays: readonly RayData[];
};

export type Extent = { minX: number; maxX: number; minY: number; maxY: number };

/** 교차의 t 는 이것보다 커야 한다 (제 자신 · 눈 뒤를 버린다) */
export const EPSILON = 1e-4;

// ---------- 좁히개 ----------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`reflect-and-refract: ${path} 는 유한한 수여야 한다`);
  }
  return v;
}

function vec2(v: unknown, path: string): Vec2 {
  if (!Array.isArray(v) || v.length !== 2) {
    throw new Error(`reflect-and-refract: ${path} 는 [x, y] 여야 한다`);
  }
  return [finite(v[0], `${path}[0]`), finite(v[1], `${path}[1]`)];
}

function text(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`reflect-and-refract: ${path} 는 빈 문자열이 아니어야 한다`);
  }
  return v;
}

function medium(v: unknown, path: string): MediumData {
  if (!isRecord(v)) throw new Error(`reflect-and-refract: ${path} 는 객체여야 한다`);
  const n = finite(v.n, `${path}.n`);
  if (n < 1) throw new Error(`reflect-and-refract: ${path}.n 은 1 이상이어야 한다`);
  return { id: text(v.id, `${path}.id`), n };
}

/** `ctx.data` · 장면 `initial` · stage `mount` 가 함께 쓰는 좁히개. 어긋나면 던진다. */
export function narrowReflectAndRefractData(raw: unknown): ReflectAndRefractFacetData {
  if (!isRecord(raw)) throw new Error('reflect-and-refract: 자료가 객체가 아니다');
  if (raw.type !== 'reflect-and-refract') {
    throw new Error(`reflect-and-refract: type 이 'reflect-and-refract' 가 아니다`);
  }
  const stepMs = finite(raw.stepMs, 'stepMs');
  if (stepMs <= 0) throw new Error('reflect-and-refract: stepMs 는 0 보다 커야 한다');
  const normal = vec2(raw.normal, 'normal');
  // 경계가 수평선이라 법선은 위를 향한 단위 벡터 (0, 1) 이어야 한다
  if (normal[0] !== 0 || normal[1] !== 1) {
    throw new Error('reflect-and-refract: normal 은 수평 경계의 위쪽 단위 법선 [0, 1] 이어야 한다');
  }
  if (!Array.isArray(raw.rays) || raw.rays.length === 0) {
    throw new Error('reflect-and-refract: rays 는 비지 않은 배열이어야 한다');
  }
  const seen = new Set<string>();
  const rays = raw.rays.map((r: unknown, i: number): RayData => {
    if (!isRecord(r)) throw new Error(`reflect-and-refract: rays[${i}] 는 객체여야 한다`);
    const id = text(r.id, `rays[${i}].id`);
    if (seen.has(id)) throw new Error(`reflect-and-refract: rays[${i}].id '${id}' 가 겹친다`);
    seen.add(id);
    return { id, origin: vec2(r.origin, `rays[${i}].origin`), dir: vec2(r.dir, `rays[${i}].dir`) };
  });
  return {
    type: 'reflect-and-refract',
    stepMs,
    boundaryY: finite(raw.boundaryY, 'boundaryY'),
    normal,
    above: medium(raw.above, 'above'),
    below: medium(raw.below, 'below'),
    rays,
  };
}

// ---------- 벡터 ----------

const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
const scale = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];

function normalize(a: Vec2, path: string): Vec2 {
  const len = Math.hypot(a[0], a[1]);
  if (len === 0) throw new Error(`reflect-and-refract: ${path} 는 길이 0 이라 정규화할 수 없다`);
  return [a[0] / len, a[1] / len];
}

const DEG = 180 / Math.PI;

/** v 와 법선 축(±n) 사이의 각, 도 */
function angleFromNormal(v: Vec2, n: Vec2): number {
  const c = Math.abs(dot(normalize(v, 'angle'), n));
  return Math.acos(Math.min(1, c)) * DEG;
}

// ---------- 한 광선의 셈 ----------

export type Refraction =
  | { kind: 'refract'; dir: Vec2; angle: number; sin: number; bend: number }
  | { kind: 'none'; sin: number };

export type RayTrace = {
  id: string;
  point: Vec2;
  tHit: number;
  dir: Vec2;
  normal: Vec2;
  incidence: number;
  n1: number;
  n2: number;
  reflect: { dir: Vec2; angle: number };
  refraction: Refraction;
};

/** 광선 하나가 경계에 닿아 튕기고 꺾이는 것을 셈한다. 셈할 수 없는 상태는 던진다. */
export function traceRay(data: ReflectAndRefractFacetData, ray: RayData): RayTrace {
  const dir = normalize(ray.dir, `rays '${ray.id}'.dir`);
  if (dir[1] === 0) {
    throw new Error(`reflect-and-refract: 광선 '${ray.id}' 는 경계와 나란해 닿지 않는다`);
  }
  const tHit = (data.boundaryY - ray.origin[1]) / dir[1];
  if (!(tHit > EPSILON)) {
    throw new Error(`reflect-and-refract: 광선 '${ray.id}' 의 교차 t ${tHit} 가 ε 이하다 — 경계에 닿지 않는다`);
  }
  const point = add(ray.origin, scale(dir, tHit));

  // 법선을 광선이 온 쪽으로 — D·N < 0
  const up = data.normal;
  const facing = dot(dir, up);
  let normal: Vec2;
  let n1: number;
  let n2: number;
  if (facing < 0) {
    normal = up;
    n1 = data.above.n;
    n2 = data.below.n;
  } else if (facing > 0) {
    normal = scale(up, -1);
    n1 = data.below.n;
    n2 = data.above.n;
  } else {
    throw new Error(`reflect-and-refract: 광선 '${ray.id}' 가 법선과 수직이다`);
  }

  const dn = dot(dir, normal);
  const incidence = angleFromNormal(dir, normal);

  const rDir = add(dir, scale(normal, -2 * dn));
  const reflect = { dir: rDir, angle: angleFromNormal(rDir, normal) };

  const eta = n1 / n2;
  const cosI = -dn;
  const k = 1 - eta * eta * (1 - cosI * cosI);
  const sin = eta * Math.sin(incidence / DEG);
  let refraction: Refraction;
  if (k < 0) {
    if (!(sin > 1)) throw new Error(`reflect-and-refract: 광선 '${ray.id}' — k < 0 인데 sinθ₂ ${sin} 가 1 이하다`);
    refraction = { kind: 'none', sin };
  } else {
    const tDir = add(scale(dir, eta), scale(normal, eta * cosI - Math.sqrt(k)));
    const angle = angleFromNormal(tDir, normal);
    refraction = { kind: 'refract', dir: tDir, angle, sin, bend: incidence - angle };
  }

  return { id: ray.id, point, tHit, dir, normal, incidence, n1, n2, reflect, refraction };
}

/** 원점 · 닿는 점 · 갈라진 광선의 끝(닿는 점 + tHit·방향)을 모두 담는 범위 */
function extentOf(data: ReflectAndRefractFacetData, traces: readonly RayTrace[]): Extent {
  const pts: Vec2[] = [];
  for (const ray of data.rays) pts.push(ray.origin);
  for (const trace of traces) {
    pts.push(trace.point);
    pts.push(add(trace.point, scale(trace.reflect.dir, trace.tHit)));
    if (trace.refraction.kind === 'refract') pts.push(add(trace.point, scale(trace.refraction.dir, trace.tHit)));
  }
  return {
    minX: Math.min(...pts.map((p) => p[0])),
    maxX: Math.max(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])),
    maxY: Math.max(...pts.map((p) => p[1])),
  };
}

// ---------- 알고리즘 ----------

export async function reflectAndRefract(
  context: FacetContext<ReflectAndRefractFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<ReflectAndRefractFacetData>;
  const data = narrowReflectAndRefractData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const traces = data.rays.map((ray) => traceRay(data, ray));

  await ctx.emit({ type: 'init', silent: true, payload: { extent: extentOf(data, traces) } });

  for (const trace of traces) {
    // 걸음 0 이 이미 경계 · 매질 · 출발 자리를 보이므로 첫 발신 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    await ctx.emit({
      type: 'hit',
      target: `ray:${trace.id}`,
      payload: {
        ray: trace.id,
        point: trace.point,
        tHit: trace.tHit,
        dir: trace.dir,
        normal: trace.normal,
        incidence: trace.incidence,
        n1: trace.n1,
        n2: trace.n2,
      },
    });

    if (!(await pause())) return;
    await ctx.emit({
      type: 'reflect',
      target: `ray:${trace.id}`,
      payload: { ray: trace.id, dir: trace.reflect.dir, angle: trace.reflect.angle },
    });

    if (!(await pause())) return;
    const rf = trace.refraction;
    if (rf.kind === 'refract') {
      await ctx.emit({
        type: 'refract',
        target: `ray:${trace.id}`,
        payload: { ray: trace.id, dir: rf.dir, angle: rf.angle, sin: rf.sin, bend: rf.bend },
      });
    } else {
      await ctx.emit({
        type: 'no-refract',
        target: `ray:${trace.id}`,
        payload: { ray: trace.id, sin: rf.sin, n1: trace.n1, n2: trace.n2, incidence: trace.incidence },
      });
    }
  }
}
