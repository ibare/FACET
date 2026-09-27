/**
 * 직교 투영은 멀어져도 그대로 — 한 상자가 눈에서 멀어져 가도 화면의 모습은 꼼짝하지 않는다.
 *
 * 모형: 오른손 좌표계, y 가 위. 카메라 공간에서 눈은 원점, −z 를 본다. 행렬은 열 벡터에 왼쪽에서 곱한다.
 * 정육면체(한 변 side)를 먼저 y 축 둘레 yaw°, 그다음 x 축 둘레 pitch° 돌린다 (R = R_x(pitch)·R_y(yaw)).
 * 그 뒤 중심을 (0, 0, −d) 에 둔다. 직교 투영: 화면 (x', y') = (x, y) — 배율 1, z 는 버린다.
 *
 * 이벤트:
 *   - `init` (silent) — 바탕. 돌린 상자와 첫 거리에 놓인 자리. 아직 비추지 않았다.
 *       payload: {
 *         local: [x, y, z][]          // 돌린 꼭짓점 여덟 (중심 원점)
 *         edges: [i, j, axis][]       // 모서리 열둘. axis 0 · 1 · 2 = 원래 x · y · z 축 방향
 *         d: number                   // 첫 중심 거리 (distances[0])
 *         camera: [x, y, z][]         // 그 거리에 놓인 꼭짓점 (카메라 공간)
 *       }
 *   - `project` — 한 걸음. 상자가 다음 거리로 옮겨 가고(첫 걸음은 제자리) 그 자리에서 비춘다.
 *       payload: {
 *         index: number               // distances 의 몇째
 *         d: number                   // 이번 중심 거리
 *         from: number | null         // 옮겨 오기 전 중심 거리 (첫 걸음은 null — 이미 그 자리)
 *         camera: [x, y, z][]         // 이번 자리의 꼭짓점
 *         screen: [x, y][]            // 화면에 비친 꼭짓점 (z 를 버린 것)
 *         zMin: number, zMax: number  // 이번 자리의 z 범위
 *         width: number, height: number   // 화면에 비친 모습의 너비 · 높이
 *         lengths: [number, number, number] // 모서리 세 묶음의 화면 길이 (묶음 안 넷이 같고 평행함을 확인한 값)
 *       }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export type Edge = [number, number, 0 | 1 | 2];

export type OrthographicKeepsSizeFacetData = {
  type: 'orthographic-keeps-size';
  stepMs: number;
  /** 정육면체 한 변 */
  side: number;
  /** y 축 둘레 (도) — 먼저 */
  yawDeg: number;
  /** x 축 둘레 (도) — 그다음 */
  pitchDeg: number;
  /** 중심 거리들 (눈 앞 −z 쪽으로) */
  distances: number[];
};

const EPS = 1e-9;

function finite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`orthographic-keeps-size: ${path} 는 유한한 수여야 한다 (${String(v)})`);
  }
  return v;
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 쓴다. */
export function narrowOrthographicData(raw: unknown): OrthographicKeepsSizeFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('orthographic-keeps-size: initialData 가 객체가 아니다');
  }
  const o = raw as Record<string, unknown>;
  if (o.type !== 'orthographic-keeps-size') {
    throw new Error(`orthographic-keeps-size: initialData.type 이 어긋났다 (${String(o.type)})`);
  }
  const stepMs = finite(o.stepMs, 'initialData.stepMs');
  const side = finite(o.side, 'initialData.side');
  if (side <= 0) throw new Error('orthographic-keeps-size: initialData.side 는 0 보다 커야 한다');
  const yawDeg = finite(o.yawDeg, 'initialData.yawDeg');
  const pitchDeg = finite(o.pitchDeg, 'initialData.pitchDeg');
  if (!Array.isArray(o.distances) || o.distances.length === 0) {
    throw new Error('orthographic-keeps-size: initialData.distances 는 비지 않은 배열이어야 한다');
  }
  const distances = o.distances.map((d, i) => finite(d, `initialData.distances[${i}]`));
  for (let i = 1; i < distances.length; i += 1) {
    if (!(distances[i]! > distances[i - 1]!)) {
      throw new Error(`orthographic-keeps-size: initialData.distances[${i}] 가 앞 거리보다 멀지 않다`);
    }
  }
  return { type: 'orthographic-keeps-size', stepMs, side, yawDeg, pitchDeg, distances };
}

function mul(m: number[][], v: Vec3): Vec3 {
  const r = (i: number): number => m[i]![0]! * v[0] + m[i]![1]! * v[1] + m[i]![2]! * v[2];
  return [r(0), r(1), r(2)];
}

function matmul(a: number[][], b: number[][]): number[][] {
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => a[i]![0]! * b[0]![j]! + a[i]![1]! * b[1]![j]! + a[i]![2]! * b[2]![j]!));
}

function rotY(deg: number): number[][] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
}

function rotX(deg: number): number[][] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
}

/** 정육면체 꼭짓점(부호 차례 x·y·z, 각 −, +)과 한 축만 다른 짝인 모서리 열둘. */
function cube(side: number): { corners: Vec3[]; edges: Edge[] } {
  const h = side / 2;
  const corners: Vec3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push([sx * h, sy * h, sz * h]);
  const edges: Edge[] = [];
  for (let i = 0; i < corners.length; i += 1) {
    for (let j = i + 1; j < corners.length; j += 1) {
      const diff = [0, 1, 2].filter((a) => corners[i]![a] !== corners[j]![a]);
      if (diff.length === 1) edges.push([i, j, diff[0] as 0 | 1 | 2]);
    }
  }
  if (edges.length !== 12) throw new Error(`orthographic-keeps-size: 모서리가 ${edges.length} 개다`);
  return { corners, edges };
}

function place(local: Vec3[], d: number): Vec3[] {
  const camera = local.map((p): Vec3 => [p[0], p[1], p[2] - d]);
  for (const [k, p] of camera.entries()) {
    if (!(p[2] < 0)) throw new Error(`orthographic-keeps-size: 거리 ${d} 에서 꼭짓점 ${k} 가 눈 앞(z < 0)에 있지 않다`);
  }
  return camera;
}

/** 직교 투영 — z 를 버린다. */
function projectOrtho(camera: Vec3[]): Vec2[] {
  return camera.map((p): Vec2 => [p[0], p[1]]);
}

/** 모서리 묶음마다 화면 길이. 묶음 안 넷이 평행하고 같은 길이인지 확인하고, 어긋나면 던진다. */
function groupLengths(screen: Vec2[], edges: Edge[]): [number, number, number] {
  const out: number[] = [];
  for (const axis of [0, 1, 2] as const) {
    const dirs = edges
      .filter((e) => e[2] === axis)
      .map((e): Vec2 => {
        const a = screen[e[0]];
        const b = screen[e[1]];
        if (!a || !b) throw new Error(`orthographic-keeps-size: 모서리 ${e[0]}-${e[1]} 의 꼭짓점이 없다`);
        return [b[0] - a[0], b[1] - a[1]];
      });
    const first = dirs[0];
    if (!first) throw new Error(`orthographic-keeps-size: 축 ${axis} 묶음이 비었다`);
    const len = Math.hypot(first[0], first[1]);
    for (const v of dirs) {
      if (Math.abs(first[0] * v[1] - first[1] * v[0]) > EPS || Math.abs(Math.hypot(v[0], v[1]) - len) > EPS) {
        throw new Error(`orthographic-keeps-size: 축 ${axis} 묶음이 화면에서 평행 · 같은 길이가 아니다`);
      }
    }
    out.push(len);
  }
  return [out[0]!, out[1]!, out[2]!];
}

export async function orthographicKeepsSize(ctx: FacetContext<OrthographicKeepsSizeFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<OrthographicKeepsSizeFacetData>;
  const data = narrowOrthographicData(rctx.data);
  const { stepMs, distances } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const R = matmul(rotX(data.pitchDeg), rotY(data.yawDeg));
  const { corners, edges } = cube(data.side);
  const local = corners.map((c) => mul(R, c));
  const d0 = distances[0]!;

  await rctx.emit({
    type: 'init',
    silent: true,
    payload: { local, edges, d: d0, camera: place(local, d0) },
  });

  let from: number | null = null;
  for (const [index, d] of distances.entries()) {
    // 걸음 0 은 이미 상자가 보이는 화면이라 첫 비춤 앞에도 읽을 틈을 둔다.
    if (!(await pause())) return;
    const camera = place(local, d);
    const screen = projectOrtho(camera);
    const xs = screen.map((p) => p[0]);
    const ys = screen.map((p) => p[1]);
    const zs = camera.map((p) => p[2]);
    await rctx.emit({
      type: 'project',
      payload: {
        index,
        d,
        from,
        camera,
        screen,
        zMin: Math.min(...zs),
        zMax: Math.max(...zs),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        lengths: groupLengths(screen, edges),
      },
    });
    from = d;
  }
}
