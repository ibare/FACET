/**
 * shadow-ray — 그림자 광선.
 *
 * 바닥의 점마다 빛을 향해 광선 하나를 보낸다. 방향은 정규화(빛 − 점), 빛까지 거리
 * d = |빛 − 점|. 막을 수 있는 것(원)을 시험 차례대로 모두 시험해 ε(1e−4) 보다 큰
 * 가장 작은 근 t 를 얻는다. t < d 인 것이 하나라도 있으면 그 점은 빛을 받지 못한다
 * (보임 0), 없으면 받는다 (보임 1). t ≥ d 인 교차는 빛 너머라 가리지 않는다.
 * 바닥 자신은 시험하지 않는다 — 바닥에서 위로 떠나는 광선과 바닥의 교차는 t = 0 뿐이다.
 * 면의 기울기(N·L)는 곱하지 않는다.
 *
 * 이벤트 (모두 silent 아님, 걸음 하나 = 점 하나):
 *   'shadow-ray'
 *     payload: {
 *       point: string                         // 바닥 점 식별자 (차례대로)
 *       dir: [number, number]                 // 빛 쪽 단위 방향
 *       dist: number                          // 빛까지 거리 d
 *       tests: { id: string; tHit: number | null }[]  // 막을 수 있는 것 전부, 시험 차례대로.
 *                                             //   tHit 는 ε 보다 큰 가장 작은 근, 빗나가면 null
 *       blockedBy: string | null              // tHit < d 인 것 가운데 가장 가까운 것, 없으면 null
 *     }
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 바탕(바닥 · 점 · 빛 · 물체)을 세운다.
 * 걸음 0 에 읽을 것이 있으므로 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec2 = readonly [number, number];

export type FloorPoint = { id: string; x: number; y: number };
export type Blocker = { id: string; cx: number; cy: number; r: number };

export type ShadowRayFacetData = {
  type: 'shadow-ray';
  stepMs: number;
  floor: { y: number; normal: Vec2 };
  light: { x: number; y: number };
  points: FloorPoint[];
  blockers: Blocker[];
};

export type RayTest = { id: string; tHit: number | null };

/** 제 자신 · 뒤를 버리는 문턱. */
export const EPS = 1e-4;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`shadow-ray: ${path} 는 유한한 수여야 한다`);
  }
  return v;
}

function ident(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`shadow-ray: ${path} 는 빈 문자열이 아닌 식별자여야 한다`);
  }
  return v;
}

/** initialData 좁히개. 모양이 어긋나면 필드 경로를 담아 던진다. 값을 베껴 돌려준다. */
export function narrowShadowRayData(raw: unknown): ShadowRayFacetData {
  if (!isRecord(raw)) throw new Error('shadow-ray: initialData 가 객체가 아니다');
  if (raw.type !== 'shadow-ray') throw new Error(`shadow-ray: initialData.type 이 'shadow-ray' 가 아니다`);
  const stepMs = finite(raw.stepMs, 'initialData.stepMs');
  if (stepMs < 800) throw new Error('shadow-ray: initialData.stepMs 는 800 이상이어야 한다');

  const floorRaw = raw.floor;
  if (!isRecord(floorRaw)) throw new Error('shadow-ray: initialData.floor 가 객체가 아니다');
  const floorY = finite(floorRaw.y, 'initialData.floor.y');
  const nRaw = floorRaw.normal;
  if (!Array.isArray(nRaw) || nRaw.length !== 2) {
    throw new Error('shadow-ray: initialData.floor.normal 은 수 둘이어야 한다');
  }
  const normal: Vec2 = [finite(nRaw[0], 'initialData.floor.normal[0]'), finite(nRaw[1], 'initialData.floor.normal[1]')];
  if (normal[0] !== 0 || normal[1] !== 1) {
    throw new Error('shadow-ray: initialData.floor.normal 은 (0, 1) 이어야 한다 — 바닥은 위를 본다');
  }

  const lightRaw = raw.light;
  if (!isRecord(lightRaw)) throw new Error('shadow-ray: initialData.light 가 객체가 아니다');
  const light = { x: finite(lightRaw.x, 'initialData.light.x'), y: finite(lightRaw.y, 'initialData.light.y') };
  if (light.y <= floorY) throw new Error('shadow-ray: initialData.light 는 바닥 위에 있어야 한다');

  if (!Array.isArray(raw.points) || raw.points.length === 0) {
    throw new Error('shadow-ray: initialData.points 는 비지 않은 배열이어야 한다');
  }
  const seen = new Set<string>();
  const points: FloorPoint[] = raw.points.map((p: unknown, i: number) => {
    const path = `initialData.points[${i}]`;
    if (!isRecord(p)) throw new Error(`shadow-ray: ${path} 가 객체가 아니다`);
    const id = ident(p.id, `${path}.id`);
    if (seen.has(id)) throw new Error(`shadow-ray: ${path}.id '${id}' 가 겹친다`);
    seen.add(id);
    const x = finite(p.x, `${path}.x`);
    const y = finite(p.y, `${path}.y`);
    if (y !== floorY) throw new Error(`shadow-ray: ${path} 가 바닥 위의 점이 아니다`);
    return { id, x, y };
  });

  if (!Array.isArray(raw.blockers) || raw.blockers.length === 0) {
    throw new Error('shadow-ray: initialData.blockers 는 비지 않은 배열이어야 한다');
  }
  const blockers: Blocker[] = raw.blockers.map((b: unknown, i: number) => {
    const path = `initialData.blockers[${i}]`;
    if (!isRecord(b)) throw new Error(`shadow-ray: ${path} 가 객체가 아니다`);
    const id = ident(b.id, `${path}.id`);
    if (seen.has(id)) throw new Error(`shadow-ray: ${path}.id '${id}' 가 겹친다`);
    seen.add(id);
    const c = b.center;
    if (!Array.isArray(c) || c.length !== 2) throw new Error(`shadow-ray: ${path}.center 는 수 둘이어야 한다`);
    const r = finite(b.r, `${path}.r`);
    if (r <= 0) throw new Error(`shadow-ray: ${path}.r 는 양수여야 한다`);
    const cx = finite(c[0], `${path}.center[0]`);
    const cy = finite(c[1], `${path}.center[1]`);
    if (cy - r <= floorY) throw new Error(`shadow-ray: ${path} 가 바닥에 닿거나 바닥 아래에 있다`);
    return { id, cx, cy, r };
  });

  return { type: 'shadow-ray', stepMs, floor: { y: floorY, normal }, light, points, blockers };
}

/**
 * 원점 (ox, oy) · 단위 방향 dir 의 광선과 원의 교차 가운데 ε 보다 큰 가장 작은 t.
 * 빗나가면 null. 원에 스치거나 거의 스치는(|판별식| < 1e−9) 광선은 경계라 던진다.
 */
export function firstHit(ox: number, oy: number, dir: Vec2, b: Blocker): number | null {
  const ocx = ox - b.cx;
  const ocy = oy - b.cy;
  const half = ocx * dir[0] + ocy * dir[1];
  const cc = ocx * ocx + ocy * ocy - b.r * b.r;
  const disc = half * half - cc;
  if (Math.abs(disc) < 1e-9) throw new Error(`shadow-ray: 광선이 ${b.id} 에 스친다 — 경계는 이 데이터에 없어야 한다`);
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const near = -half - s;
  const far = -half + s;
  if (near > EPS) return near;
  if (far > EPS) return far;
  return null;
}

export async function shadowRay(ctx: FacetContext<ShadowRayFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ShadowRayFacetData>;
  const data = narrowShadowRayData(rctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  for (const p of data.points) {
    // 걸음 0 에 이미 바탕이 서 있으니 첫 점 앞에서도 읽을 틈을 둔다
    if (!(await pause())) return;

    const lx = data.light.x - p.x;
    const ly = data.light.y - p.y;
    const dist = Math.hypot(lx, ly);
    if (dist === 0) throw new Error(`shadow-ray: 점 ${p.id} 가 빛과 같은 자리다`);
    const dir: Vec2 = [lx / dist, ly / dist];

    const tests: RayTest[] = data.blockers.map((b) => ({ id: b.id, tHit: firstHit(p.x, p.y, dir, b) }));

    let blockedBy: string | null = null;
    let blockT = Infinity;
    for (const test of tests) {
      if (rctx.cancelled) return;
      if (test.tHit === null) continue;
      if (Math.abs(test.tHit - dist) < 1e-9) {
        throw new Error(`shadow-ray: 점 ${p.id} 의 광선이 ${test.id} 에 빛까지 거리와 같은 t 로 닿는다 — 동률은 데이터에 없어야 한다`);
      }
      if (test.tHit < dist && test.tHit < blockT) {
        blockT = test.tHit;
        blockedBy = test.id;
      }
    }

    await rctx.emit({
      type: 'shadow-ray',
      payload: { point: p.id, dir: [dir[0], dir[1]], dist, tests, blockedBy },
    });
  }
}
