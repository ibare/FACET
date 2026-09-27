/**
 * gradient-steepest 장면.
 *
 * 바탕  — 점 · 함숫값 · 잴 방향 목록 · 기울기 크기의 상한 (init 이 한 번 정한다)
 * 자취  — 잰 방향과 그 기울기 (measure 가 하나씩 쌓는다) · 마지막에 선 ∇f
 * 이번 걸음 — 무엇이 일어났고 재는 방향이 어느 각에서 돌아왔는가
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowGradientSteepestData } from './algorithm.js';

export type GradientSteepestBase = {
  point: [number, number];
  /** 함숫값 — silent init 전에는 null (initialData 만으로는 셈하지 않는다) */
  f: number | null;
  angles: number[];
  range: number | null;
};

export type GradientSteepestMark = { angle: number; slope: number };

export type GradientSteepestGrad = {
  gx: number;
  gy: number;
  angle: number;
  length: number;
  slope: number;
  maxAngle: number;
  maxSlope: number;
  count: number;
};

export type GradientSteepestStep =
  | { kind: 'start' }
  /** fromAngle — 재는 방향이 돌기 시작한 각. 첫 방향이면 제 각과 같다 */
  | { kind: 'measure'; index: number; fromAngle: number }
  /** fromAngle — 마지막으로 잰 방향. ∇f 쪽으로 앞으로 이어 돈다 */
  | { kind: 'gradient'; fromAngle: number };

export type GradientSteepestScene = {
  base: GradientSteepestBase;
  marks: GradientSteepestMark[];
  grad: GradientSteepestGrad | null;
  step: GradientSteepestStep;
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function num(payload: Record<string, unknown>, key: string, type: string): number {
  const v = payload[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`gradient-steepest scene: ${type}.payload.${key} 가 수가 아니다`);
  }
  return v;
}

function record(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`gradient-steepest scene: ${event.type}.payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

export const gradientSteepestScene: ScenePlan<GradientSteepestScene> = {
  initial(initialData: unknown): GradientSteepestScene {
    const data = narrowGradientSteepestData(initialData);
    return {
      base: { point: [data.point[0], data.point[1]], f: null, angles: [], range: null },
      marks: [],
      grad: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: GradientSteepestScene, event: FacetRuntimeEvent): GradientSteepestScene {
    switch (event.type) {
      case 'init': {
        if (scene.base.f !== null) {
          throw new Error('gradient-steepest scene: init 이 두 번 왔다');
        }
        const p = record(event);
        const point = p.point;
        if (!Array.isArray(point) || point.length !== 2 || !point.every(isFiniteNumber)) {
          throw new Error('gradient-steepest scene: init.payload.point 가 [x, y] 가 아니다');
        }
        const angles = p.angles;
        if (!Array.isArray(angles) || !angles.every(isFiniteNumber)) {
          throw new Error('gradient-steepest scene: init.payload.angles 가 수 배열이 아니다');
        }
        const range = num(p, 'range', 'init');
        if (range <= 0) throw new Error('gradient-steepest scene: init.payload.range 가 양수가 아니다');
        return {
          base: {
            point: [point[0] as number, point[1] as number],
            f: num(p, 'f', 'init'),
            angles: angles.map((a: number) => a),
            range,
          },
          marks: [],
          grad: null,
          step: { kind: 'start' },
        };
      }
      case 'measure': {
        const p = record(event);
        const index = num(p, 'index', 'measure');
        const angle = num(p, 'angle', 'measure');
        const slope = num(p, 'slope', 'measure');
        if (scene.base.range === null) {
          throw new Error('gradient-steepest scene: init 전에 measure 가 왔다');
        }
        if (index !== scene.marks.length) {
          throw new Error(
            `gradient-steepest scene: measure.payload.index ${index} 가 잰 수 ${scene.marks.length} 와 어긋난다`,
          );
        }
        if (scene.base.angles[index] !== angle) {
          throw new Error(
            `gradient-steepest scene: measure.payload.angle ${angle} 가 바탕의 angles[${index}] 와 어긋난다`,
          );
        }
        const last = scene.marks[scene.marks.length - 1];
        return {
          base: scene.base,
          marks: [...scene.marks, { angle, slope }],
          grad: null,
          step: { kind: 'measure', index, fromAngle: last === undefined ? angle : last.angle },
        };
      }
      case 'gradient': {
        if (scene.grad !== null) {
          throw new Error('gradient-steepest scene: gradient 가 두 번 왔다');
        }
        const p = record(event);
        const last = scene.marks[scene.marks.length - 1];
        if (last === undefined) {
          throw new Error('gradient-steepest scene: 잰 방향 없이 gradient 가 왔다');
        }
        const grad: GradientSteepestGrad = {
          gx: num(p, 'gx', 'gradient'),
          gy: num(p, 'gy', 'gradient'),
          angle: num(p, 'angle', 'gradient'),
          length: num(p, 'length', 'gradient'),
          slope: num(p, 'slope', 'gradient'),
          maxAngle: num(p, 'maxAngle', 'gradient'),
          maxSlope: num(p, 'maxSlope', 'gradient'),
          count: num(p, 'count', 'gradient'),
        };
        if (grad.count !== scene.marks.length) {
          throw new Error(
            `gradient-steepest scene: gradient.payload.count ${grad.count} 가 잰 수 ${scene.marks.length} 와 어긋난다`,
          );
        }
        return {
          base: scene.base,
          marks: scene.marks,
          grad,
          step: { kind: 'gradient', fromAngle: last.angle },
        };
      }
      default:
        throw new Error(`gradient-steepest scene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
