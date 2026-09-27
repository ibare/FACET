/**
 * shootRayPerPixel — 픽셀마다 광선을 쏜다.
 *
 * 격자의 칸 (열 i, 줄 j) 하나마다 광선이 하나 나간다. 광선은 눈에서 출발해 그 칸의
 * 한가운데를 지나 장면으로 가고, 구에 맞았으면 구의 색이, 아무것도 맞지 않았으면 바탕
 * 색이 그 칸의 색이 된다. 줄 0(맨 위)부터 줄 하나씩, 줄 안은 왼쪽에서 오른쪽.
 *
 * 좌표계: 오른손, y 가 위, 눈은 −z 를 본다. 칸 중심은 +0.5 자리.
 * 교차 t 는 ε(1e−4) 보다 큰 가장 작은 근만 쓴다.
 *
 * 이벤트 (걸음 0 은 장면의 initial() 이 자료에서 세운다 — 빈 격자 · 눈 · 공):
 *
 * - `row` (silent 아님) — 줄 하나의 광선 전부가 나가고 돌아왔다.
 *   payload: {
 *     row: number,                       // 줄 번호 (0 이 맨 위)
 *     cells: Array<{
 *       col: number,                     // 열 번호 (0 이 맨 왼쪽)
 *       dir: [number, number, number],   // 단위 광선 방향 = 정규화(칸 중심 − 눈)
 *       hitId: string | null,            // 맞은 물체 식별자. 없으면 null (바탕)
 *       tHit: number | null,             // 맞은 자리의 t. 없으면 null
 *     }>,
 *   }
 *
 * ctx.metric 은 부르지 않는다. 자동 재생을 마치면 그냥 돌아온다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec3 = readonly [number, number, number];

export type ShootRayPerPixelFacetData = {
  type: 'shoot-ray-per-pixel';
  stepMs: number;
  /** 격자 열 수 · 줄 수 */
  cols: number;
  rows: number;
  /** 눈의 자리 */
  eye: Vec3;
  /** 화면 판 — z 한 평면, x 는 ±halfWidth, y 는 ±halfHeight */
  plane: { z: number; halfWidth: number; halfHeight: number };
  /** 장면의 물체 하나 */
  sphere: { id: string; center: Vec3; radius: number; color: Vec3 };
  /** 아무것도 맞지 않은 칸의 색 */
  background: Vec3;
};

export type RayCell = {
  col: number;
  dir: Vec3;
  hitId: string | null;
  tHit: number | null;
};

export const EPS = 1e-4;

function fail(path: string, why: string): never {
  throw new Error(`shootRayPerPixel: ${path} — ${why}`);
}

function finite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

function vec3(v: unknown, path: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) fail(path, '수 셋이 아니다');
  return [finite(v[0], `${path}[0]`), finite(v[1], `${path}[1]`), finite(v[2], `${path}[2]`)];
}

function color(v: unknown, path: string): Vec3 {
  const c = vec3(v, path);
  for (const x of c) if (x < 0 || x > 1) fail(path, '색 성분이 0..1 밖이다');
  return c;
}

function record(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, '객체가 아니다');
  return v as Record<string, unknown>;
}

function count(v: unknown, path: string): number {
  const n = finite(v, path);
  if (!Number.isInteger(n) || n <= 0) fail(path, '양의 정수가 아니다');
  return n;
}

/** 자료의 모양을 보고 어긋나면 던진다. 알고리즘과 장면이 같이 쓴다. */
export function narrowShootRayData(raw: unknown): ShootRayPerPixelFacetData {
  const d = record(raw, 'data');
  if (d.type !== 'shoot-ray-per-pixel') fail('data.type', `모르는 종류 ${String(d.type)}`);
  const stepMs = finite(d.stepMs, 'data.stepMs');
  const cols = count(d.cols, 'data.cols');
  const rows = count(d.rows, 'data.rows');
  const eye = vec3(d.eye, 'data.eye');
  const p = record(d.plane, 'data.plane');
  const plane = {
    z: finite(p.z, 'data.plane.z'),
    halfWidth: finite(p.halfWidth, 'data.plane.halfWidth'),
    halfHeight: finite(p.halfHeight, 'data.plane.halfHeight'),
  };
  if (plane.halfWidth <= 0 || plane.halfHeight <= 0) fail('data.plane', '판의 반폭 · 반높이가 양수가 아니다');
  if (plane.z === eye[2]) fail('data.plane.z', '판이 눈과 같은 깊이다');
  const s = record(d.sphere, 'data.sphere');
  if (typeof s.id !== 'string' || s.id === '') fail('data.sphere.id', '식별자가 없다');
  const sphere = {
    id: s.id,
    center: vec3(s.center, 'data.sphere.center'),
    radius: finite(s.radius, 'data.sphere.radius'),
    color: color(s.color, 'data.sphere.color'),
  };
  if (sphere.radius <= 0) fail('data.sphere.radius', '반지름이 양수가 아니다');
  const background = color(d.background, 'data.background');
  const data: ShootRayPerPixelFacetData = {
    type: 'shoot-ray-per-pixel', stepMs, cols, rows, eye, plane, sphere, background,
  };
  // 칸이 정사각이어야 한 변 하나로 칸 중심이 정해진다
  const pw = (2 * plane.halfWidth) / cols;
  const ph = (2 * plane.halfHeight) / rows;
  if (Math.abs(pw - ph) > 1e-12) fail('data.plane', `칸이 정사각이 아니다 (${pw} × ${ph})`);
  return data;
}

/** 칸 한 변의 길이 (화면 판 단위) */
export function pixelSize(g: Pick<ShootRayPerPixelFacetData, 'cols' | 'plane'>): number {
  return (2 * g.plane.halfWidth) / g.cols;
}

/** 칸 (열 i, 줄 j) 의 한가운데 — 줄 0 이 맨 위, 열 0 이 맨 왼쪽 */
export function cellCenter(
  g: Pick<ShootRayPerPixelFacetData, 'cols' | 'rows' | 'plane'>,
  i: number,
  j: number,
): Vec3 {
  if (!Number.isInteger(i) || i < 0 || i >= g.cols) fail('cellCenter.i', `열 ${i} 이 격자 밖이다`);
  if (!Number.isInteger(j) || j < 0 || j >= g.rows) fail('cellCenter.j', `줄 ${j} 이 격자 밖이다`);
  const px = pixelSize(g);
  return [
    -g.plane.halfWidth + (i + 0.5) * px,
    g.plane.halfHeight - (j + 0.5) * px,
    g.plane.z,
  ];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(a: Vec3, path: string): Vec3 {
  const n = Math.sqrt(dot(a, a));
  if (n === 0) fail(path, '길이 0 벡터는 방향이 없다');
  return [a[0] / n, a[1] / n, a[2] / n];
}

/** 광선 o + s·d 와 구의 교차 — ε 보다 큰 가장 작은 근. 빗나가면 null. 스치면 던진다. */
function hitSphere(o: Vec3, d: Vec3, c: Vec3, r: number, path: string): number | null {
  const oc = sub(o, c);
  const b = dot(oc, d);
  const disc = b * b - (dot(oc, oc) - r * r);
  // 판별식이 0 에 붙은 광선은 맞음과 빗나감이 끝자리로 갈린다 — 이 조각의 자료에는 없다
  if (Math.abs(disc) < 1e-9) fail(path, '광선이 구를 스친다 (판별식이 0 에 붙었다)');
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const near = -b - root;
  const far = -b + root;
  if (near > EPS) return near;
  if (far > EPS) return far;
  return null;
}

/** 칸 하나에서 나가는 광선 하나 — 방향과 돌아온 답 */
export function shootCell(data: ShootRayPerPixelFacetData, i: number, j: number): RayCell {
  const center = cellCenter(data, i, j);
  const dir = normalize(sub(center, data.eye), `cell(${i}, ${j}).dir`);
  const tHit = hitSphere(data.eye, dir, data.sphere.center, data.sphere.radius, `cell(${i}, ${j})`);
  return { col: i, dir, hitId: tHit === null ? null : data.sphere.id, tHit };
}

export async function shootRayPerPixel(ctx: FacetContext<ShootRayPerPixelFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ShootRayPerPixelFacetData>;
  const data = narrowShootRayData(rctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 걸음 0 은 이미 읽을 것이 있는 화면(빈 격자 · 눈 · 공)이라 첫 줄 앞에도 틈을 둔다
  for (let j = 0; j < data.rows; j += 1) {
    if (!(await pause())) return;
    const cells: RayCell[] = [];
    for (let i = 0; i < data.cols; i += 1) {
      if (rctx.cancelled) return;
      cells.push(shootCell(data, i, j));
    }
    await rctx.emit({ type: 'row', payload: { row: j, cells } });
  }
}
