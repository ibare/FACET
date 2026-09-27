/**
 * worldToCamera — 눈이 있는 자리로 세상을 옮긴다 (뷰 변환).
 *
 * 눈은 제자리에 있고 세상이 통째로 움직인다. 먼저 모든 점이 눈의 자리를 뺀 만큼
 * 한꺼번에 옮겨 가 눈이 원점에 서고, 이어 세상이 y 축 둘레로 −yaw 만큼 돌아 눈의 앞이
 * −z 에 눕는다. 그 뒤 점마다 카메라 z 의 부호로 눈의 앞(음수)인지 뒤(양수)인지 읽는다.
 *
 * 규약: 오른손 좌표계 · y 가 위 · 행렬은 열 벡터에 왼쪽에서 곱한다.
 * R_y(θ) 의 행은 (cos θ, 0, sin θ) · (0, 1, 0) · (−sin θ, 0, cos θ).
 * 눈의 앞(세계) = R_y(yaw)·(0, 0, −1). 뷰 변환 = R_y(−yaw)·T(−눈) (옮김이 먼저).
 *
 * 이벤트 (차례대로):
 *   init      silent: true
 *             payload: { forward: [x, y, z]            눈의 앞 방향(세계)
 *                        distances: { id, d }[]        눈과의 거리 (데이터 차례)
 *                        bounds: { xMin, xMax, zMin, zMax } 세 자세(세계 · 옮김 · 카메라)의 점과 눈, 원점을 모두 담는 범위 }
 *   translate payload: { offset: [x, y, z]              모든 점에 더하는 양 (= −눈)
 *                        eye: { from, to }             눈의 자리 (to 는 원점)
 *                        points: { id, from, to }[] }  데이터 차례
 *   rotate    payload: { angle: number                 y 축 둘레로 돈 각(도) = −yaw
 *                        forward: { from, to }         눈의 앞 방향 (to 는 (0, 0, −1))
 *                        points: { id, from, to }[] }  데이터 차례. to 가 카메라 좌표
 *   judge     payload: { id: string, z: number, side: 'front' | 'behind' }  점 하나, 데이터 차례
 *
 * 걸음: 0 처음(init 이 갈아 끼움) · 1 translate · 2 rotate · 3..6 judge. 끝나면 그냥 돌아온다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec3 = readonly [number, number, number];

/** 표시 이름을 messages 에 가진 식별자. 이 밖의 식별자는 받지 않는다. */
export const WORLD_OBJECT_IDS = ['tree', 'house', 'rock', 'lamp'] as const;
export type WorldObjectId = (typeof WORLD_OBJECT_IDS)[number];

export type WorldPoint = { id: WorldObjectId; at: Vec3 };

export type WorldToCameraFacetData = {
  type: 'world-to-camera';
  stepMs: number;
  /** 눈의 자리 (세계) */
  eye: Vec3;
  /** 눈의 방향 — +y 축 둘레 각(도). 0 이면 −z 를 본다 */
  yaw: number;
  points: WorldPoint[];
};

export type Bounds = { xMin: number; xMax: number; zMin: number; zMax: number };

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function narrowVec3(raw: unknown, path: string): Vec3 {
  if (!Array.isArray(raw) || raw.length !== 3 || !raw.every(isNum)) {
    throw new Error(`worldToCamera: ${path} 는 유한한 수 셋이어야 한다`);
  }
  return [raw[0], raw[1], raw[2]];
}

function isObjectId(v: unknown): v is WorldObjectId {
  return typeof v === 'string' && (WORLD_OBJECT_IDS as readonly string[]).includes(v);
}

/** ctx.data · initialData 의 좁히개. 어긋나면 필드 경로를 담아 던진다. */
export function narrowWorldToCameraData(raw: unknown): WorldToCameraFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('worldToCamera: data 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'world-to-camera') throw new Error('worldToCamera: data.type 이 world-to-camera 가 아니다');
  if (!isNum(r.stepMs) || r.stepMs <= 0) throw new Error('worldToCamera: data.stepMs 는 양수여야 한다');
  if (!isNum(r.yaw)) throw new Error('worldToCamera: data.yaw 는 유한한 수여야 한다');
  const eye = narrowVec3(r.eye, 'data.eye');
  if (!Array.isArray(r.points) || r.points.length === 0) {
    throw new Error('worldToCamera: data.points 는 비지 않은 배열이어야 한다');
  }
  const seen = new Set<string>();
  const points = r.points.map((p: unknown, i: number): WorldPoint => {
    if (typeof p !== 'object' || p === null) throw new Error(`worldToCamera: data.points[${i}] 가 객체가 아니다`);
    const q = p as Record<string, unknown>;
    if (!isObjectId(q.id)) {
      throw new Error(`worldToCamera: data.points[${i}].id 는 ${WORLD_OBJECT_IDS.join(' · ')} 중 하나여야 한다`);
    }
    if (seen.has(q.id)) throw new Error(`worldToCamera: data.points[${i}].id 가 겹친다 (${q.id})`);
    seen.add(q.id);
    return { id: q.id, at: narrowVec3(q.at, `data.points[${i}].at`) };
  });
  return { type: 'world-to-camera', stepMs: r.stepMs, eye, yaw: r.yaw, points };
}

/** v 를 +y 축 둘레로 deg 도 돌린다 — R_y(deg)·v. */
export function rotateY(v: Vec3, deg: number): Vec3 {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
}

function minus(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export async function worldToCamera(
  context: FacetContext<WorldToCameraFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<WorldToCameraFacetData>;
  const data = narrowWorldToCameraData(ctx.data);
  const { eye, yaw, points, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const forward = rotateY([0, 0, -1], yaw);
  const offset: Vec3 = [-eye[0], -eye[1], -eye[2]];
  const eyeMoved = minus(eye, eye);
  const moved = points.map((p) => ({ id: p.id, at: minus(p.at, eye) }));
  const angle = -yaw;
  const turned = moved.map((p) => ({ id: p.id, at: rotateY(p.at, angle) }));
  const forwardTurned = rotateY(forward, angle);

  // 옮기고 돌려도 눈과의 거리는 그대로여야 한다 — 어긋나면 셈이 틀린 것이다
  const distances = points.map((p, i) => {
    const d = length(minus(p.at, eye));
    const after = length(turned[i]!.at);
    if (Math.abs(d - after) > 1e-9) {
      throw new Error(`worldToCamera: ${p.id} 의 눈과의 거리가 변환 뒤 달라졌다 (${d} → ${after})`);
    }
    return { id: p.id, d };
  });

  const xs: number[] = [0, eye[0], eyeMoved[0]];
  const zs: number[] = [0, eye[2], eyeMoved[2]];
  for (const set of [points, moved, turned]) {
    for (const p of set) {
      xs.push(p.at[0]);
      zs.push(p.at[2]);
    }
  }
  const bounds = {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    zMin: Math.min(...zs),
    zMax: Math.max(...zs),
  };

  await ctx.emit({ type: 'init', silent: true, payload: { forward, distances, bounds } });
  // 걸음 0 은 이미 세상의 점 넷과 눈이 선 화면이다 — 읽을 틈을 둔다
  if (!(await pause())) return;

  await ctx.emit({
    type: 'translate',
    payload: {
      offset,
      eye: { from: eye, to: eyeMoved },
      points: points.map((p, i) => ({ id: p.id, from: p.at, to: moved[i]!.at })),
    },
  });
  if (!(await pause())) return;

  await ctx.emit({
    type: 'rotate',
    payload: {
      angle,
      forward: { from: forward, to: forwardTurned },
      points: moved.map((p, i) => ({ id: p.id, from: p.at, to: turned[i]!.at })),
    },
  });

  for (const p of turned) {
    if (!(await pause())) return;
    const z = p.at[2];
    if (z === 0) throw new Error(`worldToCamera: ${p.id} 의 카메라 z 가 0 이라 앞뒤를 가를 수 없다`);
    await ctx.emit({ type: 'judge', payload: { id: p.id, z, side: z < 0 ? 'front' : 'behind' } });
  }
}
