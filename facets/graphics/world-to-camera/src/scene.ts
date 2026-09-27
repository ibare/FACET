/**
 * worldToCamera 의 장면 — 이벤트를 잇기만 한다. 옮긴 좌표 · 돌린 좌표 · 거리 · 범위는
 * 알고리즘이 셈해 싣는다.
 *
 * 바탕: 점의 식별자와 세계 좌표 · 눈 · yaw (initialData) + 눈의 앞 · 거리 · 범위 (init)
 * 자취: 자세(world → moved → camera) 와 그 자세의 좌표 · 판정한 점들
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowWorldToCameraData,
  type Bounds,
  type Vec3,
  type WorldObjectId,
} from './algorithm.js';

export type Pose = 'world' | 'moved' | 'camera';
export type Side = 'front' | 'behind';

export type WorldToCameraStep =
  | { kind: 'start' }
  | { kind: 'translate'; offset: Vec3; eyeFrom: Vec3; from: Record<string, Vec3> }
  | { kind: 'rotate'; angle: number; forwardFrom: Vec3; from: Record<string, Vec3> }
  | { kind: 'judge'; id: WorldObjectId };

export type WorldToCameraScene = {
  ids: WorldObjectId[];
  yaw: number;
  /** init 이 채운다 */
  distances: Record<string, number> | null;
  bounds: Bounds | null;
  pose: Pose;
  /** 지금 자세의 좌표 */
  pos: Record<string, Vec3>;
  eye: Vec3;
  /** 지금 자세에서 눈의 앞 방향. init 전에는 없다 */
  forward: Vec3 | null;
  judged: { id: WorldObjectId; z: number; side: Side }[];
  step: WorldToCameraStep;
};

const KNOWN_EVENTS: readonly string[] = ['init', 'translate', 'rotate', 'judge'];

function fail(msg: string): never {
  throw new Error(`worldToCameraScene: ${msg}`);
}

function vec(raw: unknown, path: string): Vec3 {
  if (!Array.isArray(raw) || raw.length !== 3) fail(`${path} 는 수 셋이어야 한다`);
  const [x, y, z] = raw as unknown[];
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') fail(`${path} 는 수 셋이어야 한다`);
  return [x, y, z];
}

function rec(raw: unknown, path: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) fail(`${path} 가 객체가 아니다`);
  return raw as Record<string, unknown>;
}

function num(raw: unknown, path: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) fail(`${path} 는 유한한 수여야 한다`);
  return raw;
}

/** 옮겨지는 점 목록을 읽는다 — 바탕의 점 전부가 차례대로, from 이 지금 좌표와 같아야 한다. */
function readMoves(
  scene: WorldToCameraScene,
  raw: unknown,
  path: string,
): { from: Record<string, Vec3>; to: Record<string, Vec3> } {
  if (!Array.isArray(raw) || raw.length !== scene.ids.length) fail(`${path} 는 점 ${scene.ids.length} 개여야 한다`);
  const from: Record<string, Vec3> = {};
  const to: Record<string, Vec3> = {};
  raw.forEach((m: unknown, i: number) => {
    const r = rec(m, `${path}[${i}]`);
    if (r.id !== scene.ids[i]) fail(`${path}[${i}].id 가 바탕의 차례(${scene.ids[i]})와 다르다`);
    const id = scene.ids[i]!;
    const f = vec(r.from, `${path}[${i}].from`);
    const cur = scene.pos[id];
    if (!cur || cur.some((v, k) => Math.abs(v - f[k]!) > 1e-9)) fail(`${path}[${i}].from 이 지금 좌표와 다르다`);
    from[id] = f;
    to[id] = vec(r.to, `${path}[${i}].to`);
  });
  return { from, to };
}

export const worldToCameraScene: ScenePlan<WorldToCameraScene> = {
  initial(initialData: unknown): WorldToCameraScene {
    const data = narrowWorldToCameraData(initialData);
    const pos: Record<string, Vec3> = {};
    for (const p of data.points) pos[p.id] = [p.at[0], p.at[1], p.at[2]];
    return {
      ids: data.points.map((p) => p.id),
      yaw: data.yaw,
      distances: null,
      bounds: null,
      pose: 'world',
      pos,
      eye: [data.eye[0], data.eye[1], data.eye[2]],
      forward: null,
      judged: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: WorldToCameraScene, event: FacetRuntimeEvent): WorldToCameraScene {
    if (!KNOWN_EVENTS.includes(event.type)) fail(`모르는 이벤트 ${event.type}`);
    const p = rec(event.payload, `${event.type}.payload`);
    switch (event.type) {
      case 'init': {
        if (scene.forward !== null) fail('init 이 두 번 왔다');
        const forward = vec(p.forward, 'init.payload.forward');
        if (!Array.isArray(p.distances) || p.distances.length !== scene.ids.length) {
          fail(`init.payload.distances 는 점 ${scene.ids.length} 개여야 한다`);
        }
        const distances: Record<string, number> = {};
        p.distances.forEach((d: unknown, i: number) => {
          const r = rec(d, `init.payload.distances[${i}]`);
          if (r.id !== scene.ids[i]) fail(`init.payload.distances[${i}].id 가 바탕의 차례와 다르다`);
          distances[scene.ids[i]!] = num(r.d, `init.payload.distances[${i}].d`);
        });
        const b = rec(p.bounds, 'init.payload.bounds');
        const bounds: Bounds = {
          xMin: num(b.xMin, 'init.payload.bounds.xMin'),
          xMax: num(b.xMax, 'init.payload.bounds.xMax'),
          zMin: num(b.zMin, 'init.payload.bounds.zMin'),
          zMax: num(b.zMax, 'init.payload.bounds.zMax'),
        };
        if (bounds.xMax <= bounds.xMin || bounds.zMax <= bounds.zMin) fail('init.payload.bounds 의 폭이 0 이다');
        return { ...scene, forward, distances, bounds, step: { kind: 'start' } };
      }
      case 'translate': {
        if (scene.pose !== 'world' || scene.forward === null) fail('translate 는 init 뒤 세계 자세에서만 온다');
        const offset = vec(p.offset, 'translate.payload.offset');
        const eyeMove = rec(p.eye, 'translate.payload.eye');
        const eyeFrom = vec(eyeMove.from, 'translate.payload.eye.from');
        if (eyeFrom.some((v, k) => v !== scene.eye[k])) fail('translate.payload.eye.from 이 지금 눈의 자리와 다르다');
        const eye = vec(eyeMove.to, 'translate.payload.eye.to');
        const { from, to } = readMoves(scene, p.points, 'translate.payload.points');
        return {
          ...scene,
          pose: 'moved',
          pos: to,
          eye,
          step: { kind: 'translate', offset, eyeFrom, from },
        };
      }
      case 'rotate': {
        if (scene.pose !== 'moved' || scene.forward === null) fail('rotate 는 옮긴 자세에서만 온다');
        const angle = num(p.angle, 'rotate.payload.angle');
        const fw = rec(p.forward, 'rotate.payload.forward');
        const forwardFrom = vec(fw.from, 'rotate.payload.forward.from');
        const was = scene.forward;
        if (forwardFrom.some((v, k) => Math.abs(v - was[k]!) > 1e-9)) {
          fail('rotate.payload.forward.from 이 지금 눈의 앞과 다르다');
        }
        const forward = vec(fw.to, 'rotate.payload.forward.to');
        const { from, to } = readMoves(scene, p.points, 'rotate.payload.points');
        return {
          ...scene,
          pose: 'camera',
          pos: to,
          forward,
          step: { kind: 'rotate', angle, forwardFrom, from },
        };
      }
      case 'judge': {
        if (scene.pose !== 'camera') fail('judge 는 카메라 자세에서만 온다');
        const id = p.id;
        if (typeof id !== 'string') fail('judge.payload.id 가 문자열이 아니다');
        const found = scene.ids.find((x) => x === id);
        if (found === undefined) fail(`judge.payload.id ${id} 가 바탕에 없다`);
        if (scene.judged.some((j) => j.id === found)) fail(`judge.payload.id ${id} 를 이미 읽었다`);
        const z = num(p.z, 'judge.payload.z');
        const cur = scene.pos[found]!;
        if (Math.abs(cur[2] - z) > 1e-9) fail(`judge.payload.z 가 ${id} 의 카메라 z 와 다르다`);
        const side = p.side;
        if (side !== 'front' && side !== 'behind') fail('judge.payload.side 는 front 나 behind 여야 한다');
        if ((side === 'front') !== z < 0) fail('judge.payload.side 가 z 의 부호와 어긋난다');
        return {
          ...scene,
          judged: [...scene.judged, { id: found, z, side }],
          step: { kind: 'judge', id: found },
        };
      }
      default:
        fail(`모르는 이벤트 ${event.type}`);
    }
  },
};
