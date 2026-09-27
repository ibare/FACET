/**
 * gradientStepScene — 경사 하강 한 걸음의 장면.
 *
 * 바탕: 출발점 · 학습률 (initialData) · f0 · 축 범위 (silent init)
 * 자취: ∇f · −∇f · 걸음 · 옮긴 점 · 새 f — 걸음마다 하나씩 쌓인다
 * 이번 걸음: step — 운동의 출발값(from)을 싣는다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowGradientStepData, type Bounds, type Vec } from './algorithm.js';

export type GradientStepStep =
  | { kind: 'start' }
  | { kind: 'measure' }
  | { kind: 'flip'; from: Vec }
  | { kind: 'scale'; from: Vec }
  | { kind: 'move'; from: Vec }
  | { kind: 'descend'; from: number };

export type GradientStepScene = {
  /** 바탕 */
  start: Vec;
  rate: number;
  f0: number | null;
  bounds: Bounds | null;
  /** 자취 */
  grad: { v: Vec; len: number } | null;
  neg: Vec | null;
  stepVec: { v: Vec; len: number } | null;
  point: Vec;
  moved: boolean;
  f1: { value: number; drop: number } | null;
  /** 이번 걸음 */
  step: GradientStepStep;
};

function fail(msg: string): never {
  throw new Error(`gradientStepScene: ${msg}`);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type}.payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${type}.payload.${key} 가 수가 아니다`);
  return v;
}

function vec(p: Record<string, unknown>, key: string, type: string): Vec {
  const v = p[key];
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number' || typeof v[1] !== 'number') {
    fail(`${type}.payload.${key} 가 수 두 개의 배열이 아니다`);
  }
  return [v[0], v[1]];
}

function sameVec(a: Vec, b: Vec): boolean {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

function narrowBounds(v: unknown): Bounds {
  if (typeof v !== 'object' || v === null) fail('init.payload.bounds 가 객체가 아니다');
  const b = v as Record<string, unknown>;
  const xMin = num(b, 'xMin', 'init.bounds');
  const xMax = num(b, 'xMax', 'init.bounds');
  const yMin = num(b, 'yMin', 'init.bounds');
  const yMax = num(b, 'yMax', 'init.bounds');
  if (xMax <= xMin || yMax <= yMin) fail('init.payload.bounds 의 폭이 0 이하다');
  return { xMin, xMax, yMin, yMax };
}

export const gradientStepScene: ScenePlan<GradientStepScene> = {
  initial(initialData: unknown): GradientStepScene {
    const d = narrowGradientStepData(initialData);
    return {
      start: [d.start[0], d.start[1]],
      rate: d.rate,
      f0: null,
      bounds: null,
      grad: null,
      neg: null,
      stepVec: null,
      point: [d.start[0], d.start[1]],
      moved: false,
      f1: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: GradientStepScene, event: FacetRuntimeEvent): GradientStepScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        return { ...scene, f0: num(p, 'f0', 'init'), bounds: narrowBounds(p.bounds), step: { kind: 'start' } };
      }
      case 'measure': {
        if (scene.f0 === null) fail('measure 가 init 보다 먼저 왔다');
        const p = payloadOf(event);
        return {
          ...scene,
          grad: { v: [num(p, 'gx', 'measure'), num(p, 'gy', 'measure')], len: num(p, 'len', 'measure') },
          step: { kind: 'measure' },
        };
      }
      case 'flip': {
        if (scene.grad === null) fail('flip 앞에 measure 가 없다');
        const p = payloadOf(event);
        const from = vec(p, 'from', 'flip');
        if (!sameVec(from, scene.grad.v)) fail('flip.payload.from 이 장면의 ∇f 와 다르다');
        return { ...scene, neg: [num(p, 'vx', 'flip'), num(p, 'vy', 'flip')], step: { kind: 'flip', from } };
      }
      case 'scale': {
        if (scene.neg === null) fail('scale 앞에 flip 이 없다');
        const p = payloadOf(event);
        const from = vec(p, 'from', 'scale');
        if (!sameVec(from, scene.neg)) fail('scale.payload.from 이 장면의 −∇f 와 다르다');
        const rate = num(p, 'rate', 'scale');
        if (rate !== scene.rate) fail('scale.payload.rate 가 장면의 학습률과 다르다');
        return {
          ...scene,
          stepVec: { v: [num(p, 'vx', 'scale'), num(p, 'vy', 'scale')], len: num(p, 'len', 'scale') },
          step: { kind: 'scale', from },
        };
      }
      case 'move': {
        if (scene.stepVec === null) fail('move 앞에 scale 이 없다');
        const p = payloadOf(event);
        const from = vec(p, 'from', 'move');
        if (!sameVec(from, scene.point)) fail('move.payload.from 이 장면의 점과 다르다');
        const to = vec(p, 'to', 'move');
        return { ...scene, point: to, moved: true, step: { kind: 'move', from } };
      }
      case 'descend': {
        if (!scene.moved) fail('descend 앞에 move 가 없다');
        const p = payloadOf(event);
        const from = num(p, 'from', 'descend');
        if (scene.f0 === null || Math.abs(from - scene.f0) > 1e-9) fail('descend.payload.from 이 장면의 f0 와 다르다');
        return {
          ...scene,
          f1: { value: num(p, 'to', 'descend'), drop: num(p, 'drop', 'descend') },
          step: { kind: 'descend', from },
        };
      }
      default:
        fail(`모르는 이벤트: ${event.type}`);
    }
  },
};
