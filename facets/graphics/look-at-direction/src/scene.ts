/**
 * look-at-direction 장면 — 바탕(눈 · 바라보는 점 · 주어진 위쪽)과 자취(선 축들)와 이번 걸음.
 *
 * 셈은 알고리즘이 한다. 장면은 이벤트의 값을 옮겨 담기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowLookAtData, type Vec3 } from './algorithm.js';

export type SightAxis = { d: Vec3; length: number; f: Vec3 };
export type RightAxis = { cross: Vec3; length: number; r: Vec3 };
export type TrueUpAxis = { u: Vec3; tiltDeg: number; pitchDeg: number };

export type LookAtStep = 'start' | 'sight' | 'right' | 'trueUp' | 'readTarget';

export type LookAtDirectionScene = {
  /** 바탕 — 자료에서 한 번 정해진다 */
  base: { eye: Vec3; target: Vec3; up: Vec3 };
  /** 자취 — 걸음마다 하나씩 선다 */
  sight: SightAxis | null;
  right: RightAxis | null;
  trueUp: TrueUpAxis | null;
  camera: Vec3 | null;
  /** 이번 걸음 */
  step: LookAtStep;
};

function payloadRecord(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`look-at-direction 장면: ${event.type}.payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

function vec(p: Record<string, unknown>, key: string, type: string): Vec3 {
  const v = p[key];
  if (!Array.isArray(v) || v.length !== 3) {
    throw new Error(`look-at-direction 장면: ${type}.payload.${key} 가 수 셋이 아니다`);
  }
  const [a, b, c] = v as unknown[];
  if (typeof a !== 'number' || typeof b !== 'number' || typeof c !== 'number') {
    throw new Error(`look-at-direction 장면: ${type}.payload.${key} 에 수가 아닌 것이 있다`);
  }
  return [a, b, c];
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`look-at-direction 장면: ${type}.payload.${key} 가 수가 아니다`);
  }
  return v;
}

export const lookAtDirectionScene: ScenePlan<LookAtDirectionScene> = {
  initial(initialData: unknown): LookAtDirectionScene {
    const data = narrowLookAtData(initialData);
    return {
      base: {
        eye: [...data.eye] as Vec3,
        target: [...data.target] as Vec3,
        up: [...data.up] as Vec3,
      },
      sight: null,
      right: null,
      trueUp: null,
      camera: null,
      step: 'start',
    };
  },

  reduce(scene: LookAtDirectionScene, event: FacetRuntimeEvent): LookAtDirectionScene {
    switch (event.type) {
      case 'sight': {
        if (scene.sight !== null) throw new Error('look-at-direction 장면: sight 가 두 번 왔다');
        const p = payloadRecord(event);
        return {
          ...scene,
          sight: { d: vec(p, 'd', 'sight'), length: num(p, 'length', 'sight'), f: vec(p, 'f', 'sight') },
          step: 'sight',
        };
      }
      case 'right': {
        if (scene.sight === null) throw new Error('look-at-direction 장면: right 가 sight 보다 먼저 왔다');
        if (scene.right !== null) throw new Error('look-at-direction 장면: right 가 두 번 왔다');
        const p = payloadRecord(event);
        return {
          ...scene,
          right: {
            cross: vec(p, 'cross', 'right'),
            length: num(p, 'length', 'right'),
            r: vec(p, 'r', 'right'),
          },
          step: 'right',
        };
      }
      case 'trueUp': {
        if (scene.right === null) throw new Error('look-at-direction 장면: trueUp 이 right 보다 먼저 왔다');
        if (scene.trueUp !== null) throw new Error('look-at-direction 장면: trueUp 이 두 번 왔다');
        const p = payloadRecord(event);
        return {
          ...scene,
          trueUp: {
            u: vec(p, 'u', 'trueUp'),
            tiltDeg: num(p, 'tiltDeg', 'trueUp'),
            pitchDeg: num(p, 'pitchDeg', 'trueUp'),
          },
          step: 'trueUp',
        };
      }
      case 'readTarget': {
        if (scene.trueUp === null) throw new Error('look-at-direction 장면: readTarget 이 trueUp 보다 먼저 왔다');
        if (scene.camera !== null) throw new Error('look-at-direction 장면: readTarget 이 두 번 왔다');
        const p = payloadRecord(event);
        return { ...scene, camera: vec(p, 'camera', 'readTarget'), step: 'readTarget' };
      }
      default:
        throw new Error(`look-at-direction 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
