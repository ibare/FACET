/**
 * light-bounces-many 알고리즘 — 경로 추적 한 경로 (다음 사건 추정).
 *
 * 눈에서 나간 광선 하나가 2 차원 방(x 0..width, y 0..height, y 가 위) 안에서 튄다.
 * 꼭짓점마다 빛을 직접 보고(방이 볼록이고 빛이 방 안이라 늘 보인다) 그 직접광에
 * 지나온 몫을 곱한 것을 픽셀의 합에 더한다. 튈 때마다 지나온 몫에 반사율 ρ 가 곱해진다.
 * 튐 방향은 뽑힌 값(1차 데이터)이다 — 무작위 생성기는 없다.
 *
 * 이벤트 (발신 차례대로)
 * - `init` (silent) — 걸음 0 을 갈아 끼운다
 *     payload: { dir: [number, number]; total: number; through: number }
 *     dir 은 눈에서 겨냥점으로 향하는 단위 방향, total 은 출발 합 0, through 는 첫 지나온 몫 1
 * - `vertex` — 꼭짓점 하나. 경로가 한 토막 늘고 더하는 몫이 합에 붙는다
 *     payload: {
 *       k: number;                  // 꼭짓점 번호 1..
 *       surface: string;            // 닿은 면 식별자
 *       from: [number, number];     // 이 토막의 출발점 (눈 또는 앞 꼭짓점)
 *       point: [number, number];    // 닿은 점
 *       cos: number;                // max(0, N·L̂)
 *       dist: number;               // 빛까지 거리
 *       direct: number;             // (ρ/π)·I·cos / dist²
 *       through: number;            // 지나온 몫 T_k
 *       add: number;                // T_k · direct
 *       before: number;             // 더하기 전 합
 *       total: number;              // 더한 뒤 합
 *       last: boolean;              // 여기서 멈추는가
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec2 = readonly [number, number];
export type SurfaceId = 'floor' | 'ceiling' | 'left' | 'right';

export type LightBouncesManyFacetData = {
  type: 'light-bounces-many';
  stepMs: number;
  room: { width: number; height: number };
  surfaces: { id: SurfaceId; normal: Vec2 }[];
  reflectance: number;
  light: { at: Vec2; intensity: number };
  eye: Vec2;
  aim: Vec2;
  turns: number[];
};

export const EPS = 1e-4;
const SURFACE_IDS: readonly SurfaceId[] = ['floor', 'ceiling', 'left', 'right'];

function fail(path: string, why: string): never {
  throw new Error(`light-bounces-many: ${path} — ${why}`);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

function vec(v: unknown, path: string): Vec2 {
  if (!Array.isArray(v) || v.length !== 2) fail(path, '수 둘의 배열이 아니다');
  return [num(v[0], `${path}[0]`), num(v[1], `${path}[1]`)];
}

function isSurfaceId(v: unknown): v is SurfaceId {
  return typeof v === 'string' && (SURFACE_IDS as readonly string[]).includes(v);
}

/** 자료 좁히개 — 모양을 검사하고 어긋나면 던진다. 값을 베껴 돌려준다. */
export function narrowLightBouncesMany(raw: unknown): LightBouncesManyFacetData {
  if (typeof raw !== 'object' || raw === null) fail('data', '객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'light-bounces-many') fail('data.type', 'light-bounces-many 가 아니다');
  const stepMs = num(d.stepMs, 'data.stepMs');
  const roomRaw = d.room as Record<string, unknown> | undefined;
  if (typeof roomRaw !== 'object' || roomRaw === null) fail('data.room', '객체가 아니다');
  const width = num(roomRaw.width, 'data.room.width');
  const height = num(roomRaw.height, 'data.room.height');
  if (width <= 0 || height <= 0) fail('data.room', '크기가 양수가 아니다');
  if (!Array.isArray(d.surfaces) || d.surfaces.length !== 4) fail('data.surfaces', '면 넷의 배열이 아니다');
  const surfaces = d.surfaces.map((s: unknown, i: number) => {
    if (typeof s !== 'object' || s === null) fail(`data.surfaces[${i}]`, '객체가 아니다');
    const r = s as Record<string, unknown>;
    if (!isSurfaceId(r.id)) fail(`data.surfaces[${i}].id`, '모르는 면');
    const normal = vec(r.normal, `data.surfaces[${i}].normal`);
    const want = boxNormal(r.id);
    if (Math.abs(normal[0] - want[0]) > 1e-9 || Math.abs(normal[1] - want[1]) > 1e-9) {
      fail(`data.surfaces[${i}].normal`, '방의 안쪽 법선과 다르다');
    }
    return { id: r.id, normal };
  });
  const ids = new Set(surfaces.map((s) => s.id));
  if (ids.size !== 4) fail('data.surfaces', '면 식별자가 겹친다');
  const reflectance = num(d.reflectance, 'data.reflectance');
  if (reflectance < 0 || reflectance > 1) fail('data.reflectance', '0..1 밖이다');
  const lightRaw = d.light as Record<string, unknown> | undefined;
  if (typeof lightRaw !== 'object' || lightRaw === null) fail('data.light', '객체가 아니다');
  const at = vec(lightRaw.at, 'data.light.at');
  const intensity = num(lightRaw.intensity, 'data.light.intensity');
  const eye = vec(d.eye, 'data.eye');
  const aim = vec(d.aim, 'data.aim');
  if (!Array.isArray(d.turns) || d.turns.length === 0) fail('data.turns', '빈 배열이거나 배열이 아니다');
  const turns = d.turns.map((v: unknown, i: number) => num(v, `data.turns[${i}]`));
  for (const [p, path] of [
    [at, 'data.light.at'],
    [eye, 'data.eye'],
  ] as const) {
    if (!(p[0] > 0 && p[0] < width && p[1] > 0 && p[1] < height)) fail(path, '방 안이 아니다');
  }
  return {
    type: 'light-bounces-many',
    stepMs,
    room: { width, height },
    surfaces,
    reflectance,
    light: { at, intensity },
    eye,
    aim,
    turns,
  };
}

/** 방(상자)의 면 식별자가 정하는 안쪽 법선. */
function boxNormal(id: SurfaceId): Vec2 {
  switch (id) {
    case 'floor':
      return [0, 1];
    case 'ceiling':
      return [0, -1];
    case 'left':
      return [1, 0];
    case 'right':
      return [-1, 0];
  }
}

/** 면 위의 한 점 — 상자에서 면 식별자가 정한다. */
function planePoint(id: SurfaceId, room: { width: number; height: number }): Vec2 {
  switch (id) {
    case 'floor':
    case 'left':
      return [0, 0];
    case 'ceiling':
      return [0, room.height];
    case 'right':
      return [room.width, 0];
  }
}

const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];

function normalize(a: Vec2, path: string): Vec2 {
  const n = Math.hypot(a[0], a[1]);
  if (n === 0) fail(path, '길이 0 벡터');
  return [a[0] / n, a[1] / n];
}

/** 벡터를 반시계로 deg 도 돌린다. */
function rotate(v: Vec2, deg: number): Vec2 {
  const a = (deg * Math.PI) / 180;
  return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
}

type Hit = { surface: SurfaceId; normal: Vec2; tHit: number; point: Vec2 };

/** 방 안에서 나가는 광선이 ε 보다 큰 가장 작은 t 에서 닿는 면. */
function hitRoom(data: LightBouncesManyFacetData, o: Vec2, d: Vec2, path: string): Hit {
  const cands: Hit[] = [];
  for (const s of data.surfaces) {
    const facing = dot(s.normal, d);
    if (facing >= 0) continue; // 안쪽 법선과 같은 쪽으로 가면 그 면에서 멀어진다
    const p0 = planePoint(s.id, data.room);
    const tHit = dot(s.normal, sub(p0, o)) / facing;
    if (!(tHit > EPS)) continue;
    const raw: Vec2 = [o[0] + d[0] * tHit, o[1] + d[1] * tHit];
    // 닿은 좌표 가운데 면 위의 성분은 면 값 그대로 둔다
    const point: Vec2 = s.normal[0] === 0 ? [raw[0], p0[1]] : [p0[0], raw[1]];
    cands.push({ surface: s.id, normal: s.normal, tHit, point });
  }
  if (cands.length === 0) fail(path, '교차 없음');
  cands.sort((a, b) => a.tHit - b.tHit);
  const first = cands[0] as Hit;
  const second = cands[1];
  if (second && Math.abs(second.tHit - first.tHit) < 1e-9) fail(path, '모서리에 정확히 닿음');
  return first;
}

export type Vertex = {
  k: number;
  surface: SurfaceId;
  from: Vec2;
  point: Vec2;
  cos: number;
  dist: number;
  direct: number;
  through: number;
  add: number;
  before: number;
  total: number;
  last: boolean;
};

export async function lightBouncesMany(
  ctx: FacetContext<LightBouncesManyFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<LightBouncesManyFacetData>;
  const data = narrowLightBouncesMany(rctx.data);
  const stepMs = data.stepMs;
  const rho = data.reflectance;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  let dir = normalize(sub(data.aim, data.eye), 'data.aim');
  let origin: Vec2 = data.eye;
  let through = 1;
  let total = 0;

  await rctx.emit({ type: 'init', silent: true, payload: { dir: [dir[0], dir[1]], total, through } });

  const vertexCount = data.turns.length + 1;
  for (let k = 1; k <= vertexCount; k += 1) {
    // 걸음 0(방 · 빛 · 눈 · 합 0)이 읽을 것이 있는 화면이라 첫 꼭짓점 앞에도 머문다
    if (!(await pause())) return;
    const hit = hitRoom(data, origin, dir, `꼭짓점 ${k}`);
    const toLight = sub(data.light.at, hit.point);
    const dist = Math.hypot(toLight[0], toLight[1]);
    const cos = Math.max(0, dot(hit.normal, normalize(toLight, `꼭짓점 ${k} 빛 방향`)));
    const direct = ((rho / Math.PI) * data.light.intensity * cos) / (dist * dist);
    const add = through * direct;
    const before = total;
    total += add;
    await rctx.emit({
      type: 'vertex',
      payload: {
        k,
        surface: hit.surface,
        from: [origin[0], origin[1]],
        point: [hit.point[0], hit.point[1]],
        cos,
        dist,
        direct,
        through,
        add,
        before,
        total,
        last: k === vertexCount,
      },
    });
    if (k === vertexCount) return;
    through *= rho;
    const turn = data.turns[k - 1];
    if (turn === undefined) fail(`data.turns[${k - 1}]`, '튐 방향이 없다');
    const next = normalize(rotate(hit.normal, turn), `data.turns[${k - 1}]`);
    if (!(dot(next, hit.normal) > 0)) fail(`data.turns[${k - 1}]`, '튐 방향이 면 안쪽을 향하지 않는다');
    dir = next;
    origin = hit.point;
  }
}
