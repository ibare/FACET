/**
 * 장면 — 이벤트를 잇기만 한다. 셈(회전 · 옮김 · 투영 · 길이)은 알고리즘이 payload 에 싣는다.
 *
 * 바탕: 자료(변 · 각 · 거리들) + init 이 한 번 정하는 모서리.
 * 자취: 지금 상자가 놓인 자리(placed)와 마지막으로 비춘 모습(shot).
 * 이번 걸음: step.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowOrthographicData, type Edge, type Vec2, type Vec3 } from './algorithm.js';

export type OrthoPlaced = { index: number; d: number; camera: Vec3[] };

export type OrthoShot = {
  screen: Vec2[];
  zMin: number;
  zMax: number;
  width: number;
  height: number;
  lengths: [number, number, number];
};

export type OrthoStep = { kind: 'start' } | { kind: 'project'; index: number; from: number | null };

export type OrthographicKeepsSizeScene = {
  side: number;
  yawDeg: number;
  pitchDeg: number;
  distances: number[];
  /** init 전에는 null — 돌린 꼭짓점과 모서리는 알고리즘이 셈한다 */
  local: Vec3[] | null;
  edges: Edge[] | null;
  placed: OrthoPlaced | null;
  shot: OrthoShot | null;
  step: OrthoStep;
};

function fail(msg: string): never {
  throw new Error(`orthographicKeepsSizeScene: ${msg}`);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${path} 가 유한한 수가 아니다`);
  return v;
}

function field(o: unknown, key: string, path: string): unknown {
  if (typeof o !== 'object' || o === null) fail(`${path} 가 객체가 아니다`);
  if (!(key in o)) fail(`${path}.${key} 가 없다`);
  return (o as Record<string, unknown>)[key];
}

function vecs(v: unknown, n: 2 | 3, count: number, path: string): number[][] {
  if (!Array.isArray(v) || v.length !== count) fail(`${path} 는 길이 ${count} 인 배열이어야 한다`);
  return v.map((p: unknown, i) => {
    if (!Array.isArray(p) || p.length !== n) fail(`${path}[${i}] 는 길이 ${n} 인 배열이어야 한다`);
    return p.map((x: unknown, k) => num(x, `${path}[${i}][${k}]`));
  });
}

function vec3s(v: unknown, path: string): Vec3[] {
  return vecs(v, 3, 8, path).map((p): Vec3 => [p[0]!, p[1]!, p[2]!]);
}

function vec2s(v: unknown, path: string): Vec2[] {
  return vecs(v, 2, 8, path).map((p): Vec2 => [p[0]!, p[1]!]);
}

function edgesOf(v: unknown, path: string): Edge[] {
  if (!Array.isArray(v) || v.length !== 12) fail(`${path} 는 모서리 열둘이어야 한다`);
  return v.map((e: unknown, i): Edge => {
    if (!Array.isArray(e) || e.length !== 3) fail(`${path}[${i}] 는 [i, j, axis] 여야 한다`);
    const a = num(e[0], `${path}[${i}][0]`);
    const b = num(e[1], `${path}[${i}][1]`);
    const axis = num(e[2], `${path}[${i}][2]`);
    if (!Number.isInteger(a) || a < 0 || a > 7) fail(`${path}[${i}][0] 가 꼭짓점 번호가 아니다`);
    if (!Number.isInteger(b) || b < 0 || b > 7) fail(`${path}[${i}][1] 가 꼭짓점 번호가 아니다`);
    if (axis !== 0 && axis !== 1 && axis !== 2) fail(`${path}[${i}][2] 가 축 번호가 아니다`);
    return [a, b, axis];
  });
}

function sameNum(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-12;
}

export const orthographicKeepsSizeScene: ScenePlan<OrthographicKeepsSizeScene> = {
  initial(initialData: unknown): OrthographicKeepsSizeScene {
    const data = narrowOrthographicData(initialData);
    return {
      side: data.side,
      yawDeg: data.yawDeg,
      pitchDeg: data.pitchDeg,
      distances: [...data.distances],
      local: null,
      edges: null,
      placed: null,
      shot: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: OrthographicKeepsSizeScene, event: FacetRuntimeEvent): OrthographicKeepsSizeScene {
    const p = event.payload;
    switch (event.type) {
      case 'init': {
        if (scene.edges !== null) fail('init 이 두 번 왔다');
        const d = num(field(p, 'd', 'init.payload'), 'init.payload.d');
        const first = scene.distances[0];
        if (first === undefined || !sameNum(d, first)) fail(`init.payload.d ${d} 가 첫 거리가 아니다`);
        return {
          ...scene,
          distances: [...scene.distances],
          local: vec3s(field(p, 'local', 'init.payload'), 'init.payload.local'),
          edges: edgesOf(field(p, 'edges', 'init.payload'), 'init.payload.edges'),
          placed: { index: 0, d, camera: vec3s(field(p, 'camera', 'init.payload'), 'init.payload.camera') },
          shot: null,
          step: { kind: 'start' },
        };
      }
      case 'project': {
        if (scene.edges === null || scene.placed === null) fail('init 앞에 project 가 왔다');
        const index = num(field(p, 'index', 'project.payload'), 'project.payload.index');
        const d = num(field(p, 'd', 'project.payload'), 'project.payload.d');
        const rawFrom = field(p, 'from', 'project.payload');
        const from = rawFrom === null ? null : num(rawFrom, 'project.payload.from');
        const expected = scene.distances[index];
        if (expected === undefined || !sameNum(expected, d)) fail(`project.payload.index ${index} · d ${d} 가 거리 목록과 맞지 않다`);
        if (scene.shot === null) {
          // 첫 비춤 — 상자는 이미 그 자리에 있다
          if (index !== scene.placed.index || from !== null) fail('첫 project 는 놓인 자리에서 from 없이 와야 한다');
        } else {
          if (index !== scene.placed.index + 1) fail(`project.payload.index ${index} 가 다음 거리가 아니다`);
          if (from === null || !sameNum(from, scene.placed.d)) fail(`project.payload.from ${String(from)} 가 지금 거리 ${scene.placed.d} 가 아니다`);
        }
        const rawLengths = field(p, 'lengths', 'project.payload');
        if (!Array.isArray(rawLengths) || rawLengths.length !== 3) fail('project.payload.lengths 는 셋이어야 한다');
        const lengths: [number, number, number] = [
          num(rawLengths[0], 'project.payload.lengths[0]'),
          num(rawLengths[1], 'project.payload.lengths[1]'),
          num(rawLengths[2], 'project.payload.lengths[2]'),
        ];
        return {
          ...scene,
          distances: [...scene.distances],
          placed: { index, d, camera: vec3s(field(p, 'camera', 'project.payload'), 'project.payload.camera') },
          shot: {
            screen: vec2s(field(p, 'screen', 'project.payload'), 'project.payload.screen'),
            zMin: num(field(p, 'zMin', 'project.payload'), 'project.payload.zMin'),
            zMax: num(field(p, 'zMax', 'project.payload'), 'project.payload.zMax'),
            width: num(field(p, 'width', 'project.payload'), 'project.payload.width'),
            height: num(field(p, 'height', 'project.payload'), 'project.payload.height'),
            lengths,
          },
          step: { kind: 'project', index, from },
        };
      }
      default:
        fail(`모르는 이벤트 ${event.type}`);
    }
  },
};
