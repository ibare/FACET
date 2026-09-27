/**
 * 최근접 교차 — 광선 하나가 물체 다섯을 목록 차례로 시험하며 "지금까지 가장 가까운 t" 를 줄여 간다.
 *
 * 규약
 * - 광선 = O + t·D, D 는 단위 벡터. 구와의 교차는 |O + tD − C|² = r² 의 근 둘(작은 것 먼저).
 * - 쓸 근 = EPS(1e−4) 보다 큰 근 가운데 작은 것. 둘 다 EPS 이하면 버림 · 판별식 < 0 이면 빗나감.
 * - 새 근이 지금 최근접보다 **엄격히 작을 때만** 바꾼다. 같은 t 동률은 이 데이터에 없다 — 만나면 던진다.
 * - 판별식 절댓값 · 동률 차이가 GRAZE_TOL(1e−9) 아래면 경계(스침 · 동률)로 보고 던진다.
 *
 * 이벤트 (걸음 0 은 장면의 initial 이 initialData 에서 세운다 — init 이벤트는 없다)
 *
 * - `test` (걸음) — 물체 하나를 시험했다
 *   payload: {
 *     index: number,                       // 목록 차례 (0 부터)
 *     id: string,                          // 물체 식별자
 *     roots: [number, number] | null,      // 근 둘 (작은 것 먼저). 빗나가면 null
 *     used: number | null,                 // EPS 보다 큰 근 가운데 작은 것. 없으면 null
 *     verdict: 'closer' | 'farther' | 'behind' | 'miss',
 *     before: { id: string, tHit: number } | null,   // 시험 앞의 최근접
 *     best: { id: string, tHit: number } | null,     // 시험 뒤의 최근접
 *   }
 * - `pixel` (걸음) — 픽셀이 이긴 물체의 색을 받는다
 *   payload: { id: string, tHit: number }
 *
 * silent 이벤트는 없다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec3 = readonly [number, number, number];

export type SphereSpec = {
  id: string;
  center: Vec3;
  radius: number;
  /** 선형 0..1 RGB. 조명 없이 이 색 그대로가 픽셀의 색이다. */
  color: Vec3;
};

export type NearestHitFacetData = {
  type: 'nearest-hit';
  stepMs: number;
  ray: { origin: Vec3; dir: Vec3 };
  objects: SphereSpec[];
};

export type Verdict = 'closer' | 'farther' | 'behind' | 'miss';

export type Nearest = { id: string; tHit: number };

/** 제 자신 · 눈 뒤를 가르는 문턱. 이보다 큰 t 만 쓴다. */
export const EPS = 1e-4;

/** 판별식 · t 가 이만큼 붙어 있으면 경계(스침 · 동률)로 보고 던진다. */
export const GRAZE_TOL = 1e-9;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function narrowVec3(v: unknown, path: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) throw new Error(`${path}: 성분 셋인 배열이어야 한다`);
  const [a, b, c] = v as unknown[];
  if (typeof a !== 'number' || typeof b !== 'number' || typeof c !== 'number'
    || !Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
    throw new Error(`${path}: 성분이 유한한 수가 아니다`);
  }
  return [a, b, c];
}

/** initialData 좁히개 — 알고리즘과 장면이 같이 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowNearestHitData(raw: unknown): NearestHitFacetData {
  if (!isRecord(raw)) throw new Error('nearest-hit: initialData 가 객체가 아니다');
  if (raw['type'] !== 'nearest-hit') throw new Error('nearest-hit: type 이 nearest-hit 가 아니다');
  const stepMs = raw['stepMs'];
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('nearest-hit: stepMs 는 양수여야 한다');
  const ray = raw['ray'];
  if (!isRecord(ray)) throw new Error('nearest-hit: ray 가 객체가 아니다');
  const origin = narrowVec3(ray['origin'], 'ray.origin');
  const dir = narrowVec3(ray['dir'], 'ray.dir');
  if (Math.abs(Math.hypot(dir[0], dir[1], dir[2]) - 1) > 1e-9) throw new Error('ray.dir: 단위 벡터가 아니다');
  const list = raw['objects'];
  if (!Array.isArray(list) || list.length === 0) throw new Error('nearest-hit: objects 가 비었다');
  const seen = new Set<string>();
  const objects = list.map((o: unknown, i): SphereSpec => {
    const path = `objects[${i}]`;
    if (!isRecord(o)) throw new Error(`${path}: 객체가 아니다`);
    const id = o['id'];
    if (typeof id !== 'string' || id === '') throw new Error(`${path}.id: 빈 식별자`);
    if (seen.has(id)) throw new Error(`${path}.id: ${id} 가 겹친다`);
    seen.add(id);
    const radius = o['radius'];
    if (typeof radius !== 'number' || !(radius > 0)) throw new Error(`${path}.radius: 양수여야 한다`);
    const color = narrowVec3(o['color'], `${path}.color`);
    for (const c of color) if (c < 0 || c > 1) throw new Error(`${path}.color: 0..1 밖`);
    return { id, center: narrowVec3(o['center'], `${path}.center`), radius, color };
  });
  return { type: 'nearest-hit', stepMs, ray: { origin, dir }, objects };
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** 광선과 구의 교차 — 근 둘(작은 것 먼저). 판별식 < 0 이면 null. dir 은 단위 벡터. */
export function raySphere(origin: Vec3, dir: Vec3, s: SphereSpec): [number, number] | null {
  const oc: Vec3 = [origin[0] - s.center[0], origin[1] - s.center[1], origin[2] - s.center[2]];
  const b = dot(oc, dir);
  const c = dot(oc, oc) - s.radius * s.radius;
  const disc = b * b - c;
  if (Math.abs(disc) < GRAZE_TOL) {
    throw new Error(`${s.id}: 판별식 ${disc} — 광선이 구를 스친다(경계). 이 조각의 규약 밖`);
  }
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  return [-b - root, -b + root];
}

/** EPS 보다 큰 근 가운데 작은 것. 없으면 null. */
export function nearestPositive(roots: [number, number] | null): number | null {
  if (roots === null) return null;
  const pos = roots.filter((r) => r > EPS);
  return pos.length === 0 ? null : Math.min(...pos);
}

export async function nearestHit(context: FacetContext<NearestHitFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<NearestHitFacetData>;
  const data = narrowNearestHitData(ctx.data);
  const { origin, dir } = data.ray;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(data.stepMs)) && !ctx.cancelled;
  }

  let best: Nearest | null = null;
  for (let index = 0; index < data.objects.length; index += 1) {
    // 걸음 0 은 광선과 물체가 이미 서 있는 화면이라 첫 시험 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    const obj = data.objects[index];
    if (obj === undefined) throw new Error(`objects[${index}]: 없다`);
    const roots = raySphere(origin, dir, obj);
    const used = nearestPositive(roots);
    const before = best;
    let verdict: Verdict;
    if (roots === null) {
      verdict = 'miss';
    } else if (used === null) {
      verdict = 'behind';
    } else if (before !== null && Math.abs(used - before.tHit) < GRAZE_TOL) {
      throw new Error(`objects[${index}]: ${obj.id} 의 t 가 지금 최근접과 같다 — 동률은 이 조각의 규약 밖`);
    } else if (before === null || used < before.tHit) {
      verdict = 'closer';
      best = { id: obj.id, tHit: used };
    } else {
      verdict = 'farther';
    }
    await ctx.emit({
      type: 'test',
      payload: { index, id: obj.id, roots, used, verdict, before, best },
    });
  }

  if (!(await pause())) return;
  if (best === null) throw new Error('nearest-hit: 어떤 물체와도 맞지 않았다 — 픽셀이 받을 색이 없다');
  await ctx.emit({ type: 'pixel', payload: { id: best.id, tHit: best.tHit } });
}
