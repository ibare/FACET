import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowNormalDecidesBrightnessData, type Vec3 } from './algorithm.js';

/** 바탕 — initialData 에서 한 번 정해진다 */
export type NdbBase = {
  lightDirection: Vec3;
  beamWidth: number;
  faces: { id: string; tilt: number }[];
};

/** 자취 — 빛을 받은 면 하나의 결과 (알고리즘이 셈한 값) */
export type NdbResult = {
  face: string;
  tilt: number;
  cos: number;
  brightness: number;
  cover: number | null;
};

/** 이번 걸음 — 어느 면이, 어느 기울기에서 돌아와 빛을 받았나 */
export type NdbStep = { face: string; from: number | null };

export type NormalDecidesBrightnessScene = {
  base: NdbBase;
  results: NdbResult[];
  step: NdbStep | null;
};

function field(payload: Record<string, unknown>, key: string): unknown {
  if (!(key in payload)) throw new Error(`normalDecidesBrightnessScene: lit.payload.${key} 가 없다`);
  return payload[key];
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`normalDecidesBrightnessScene: ${path} 는 유한한 수여야 한다`);
  }
  return v;
}

function reduceLit(scene: NormalDecidesBrightnessScene, payload: unknown): NormalDecidesBrightnessScene {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('normalDecidesBrightnessScene: lit.payload 가 객체가 아니다');
  }
  const p = payload as Record<string, unknown>;
  const face = field(p, 'face');
  if (typeof face !== 'string') throw new Error('normalDecidesBrightnessScene: lit.payload.face 는 문자열이어야 한다');
  const idx = scene.results.length;
  const expected = scene.base.faces[idx];
  if (!expected) {
    throw new Error(`normalDecidesBrightnessScene: lit.payload.face '${face}' — 면 ${scene.base.faces.length} 개가 이미 모두 빛을 받았다`);
  }
  if (expected.id !== face) {
    throw new Error(`normalDecidesBrightnessScene: lit.payload.face '${face}' 가 차례의 면 '${expected.id}' 와 다르다`);
  }
  const cos = num(field(p, 'cos'), 'lit.payload.cos');
  const brightness = num(field(p, 'brightness'), 'lit.payload.brightness');
  const rawCover = field(p, 'cover');
  const cover = rawCover === null ? null : num(rawCover, 'lit.payload.cover');
  if ((cos > 0) !== (cover !== null)) {
    throw new Error(`normalDecidesBrightnessScene: lit.payload.cover 가 N·L = ${cos} 과 맞지 않는다`);
  }
  const last = scene.results[idx - 1];
  return {
    base: scene.base,
    results: [...scene.results, { face, tilt: expected.tilt, cos, brightness, cover }],
    step: { face, from: last ? last.tilt : null },
  };
}

export const normalDecidesBrightnessScene: ScenePlan<NormalDecidesBrightnessScene> = {
  initial(initialData: unknown): NormalDecidesBrightnessScene {
    const data = narrowNormalDecidesBrightnessData(initialData);
    const d = data.light.direction;
    return {
      base: {
        lightDirection: [d[0], d[1], d[2]],
        beamWidth: data.light.beamWidth,
        faces: data.faces.map((f) => ({ id: f.id, tilt: f.tilt })),
      },
      results: [],
      step: null,
    };
  },
  reduce(scene: NormalDecidesBrightnessScene, event: FacetRuntimeEvent): NormalDecidesBrightnessScene {
    switch (event.type) {
      case 'lit':
        return reduceLit(scene, event.payload);
      default:
        throw new Error(`normalDecidesBrightnessScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
