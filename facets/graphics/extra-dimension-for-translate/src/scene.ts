/**
 * extra-dimension-for-translate 의 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 한다.
 *
 * 바탕: offset · points (initialData 에서) · matrix · bounds (silent init 에서)
 * 자취: lifted (셋째 칸 1 이 붙었는가) · moved (점마다 곱의 결과, 아직이면 null)
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowTranslateData,
  type Matrix3,
  type PlaneBounds,
  type TranslatePoint,
  type Vec2,
  type Vec3,
} from './algorithm.js';

export type TranslateStep =
  | { readonly kind: 'lift' }
  | {
      readonly kind: 'multiply';
      readonly id: string;
      readonly from: Vec3;
      readonly to: Vec3;
      readonly added: Vec2;
    };

export type ExtraDimensionForTranslateScene = {
  readonly offset: Vec2;
  readonly points: readonly TranslatePoint[];
  readonly matrix: Matrix3 | null;
  readonly bounds: PlaneBounds | null;
  readonly lifted: boolean;
  /** points 와 같은 차례. 곱을 마친 점은 그 결과 (x', y', w') */
  readonly moved: readonly (Vec3 | null)[];
  readonly step: TranslateStep | null;
};

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function readVec(v: unknown, n: 2, path: string): Vec2;
function readVec(v: unknown, n: 3, path: string): Vec3;
function readVec(v: unknown, n: 2 | 3, path: string): Vec2 | Vec3 {
  if (!Array.isArray(v) || v.length !== n) throw new Error(`${path}: ${n} 칸 배열이 아니다`);
  const arr: unknown[] = v;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const x = arr[i];
    if (!isNum(x)) throw new Error(`${path}[${i}]: 수가 아니다`);
    out.push(x);
  }
  return n === 2 ? [out[0] as number, out[1] as number] : [out[0] as number, out[1] as number, out[2] as number];
}

function readPayload(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`${event.type}.payload: 객체가 아니다`);
  return p as Record<string, unknown>;
}

function sameVec(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function indexOfPoint(scene: ExtraDimensionForTranslateScene, id: unknown, path: string): number {
  if (typeof id !== 'string') throw new Error(`${path}: 문자열이 아니다`);
  const i = scene.points.findIndex((p) => p.id === id);
  if (i < 0) throw new Error(`${path}: 바탕에 없는 점 '${id}'`);
  return i;
}

export const extraDimensionForTranslateScene: ScenePlan<ExtraDimensionForTranslateScene> = {
  initial(initialData: unknown): ExtraDimensionForTranslateScene {
    const data = narrowTranslateData(initialData);
    return {
      offset: [data.offset[0], data.offset[1]],
      points: data.points.map((p) => ({ id: p.id, at: [p.at[0], p.at[1]] })),
      matrix: null,
      bounds: null,
      lifted: false,
      moved: data.points.map(() => null),
      step: null,
    };
  },

  reduce(scene, event): ExtraDimensionForTranslateScene {
    switch (event.type) {
      case 'init': {
        const p = readPayload(event);
        if (!Array.isArray(p.matrix) || p.matrix.length !== 3) throw new Error('init.payload.matrix: 세 행이 아니다');
        const rows: unknown[] = p.matrix;
        const matrix: Matrix3 = [
          readVec(rows[0], 3, 'init.payload.matrix[0]'),
          readVec(rows[1], 3, 'init.payload.matrix[1]'),
          readVec(rows[2], 3, 'init.payload.matrix[2]'),
        ];
        const b = p.bounds;
        if (typeof b !== 'object' || b === null) throw new Error('init.payload.bounds: 객체가 아니다');
        const br = b as Record<string, unknown>;
        const { minX, maxX, minY, maxY } = br;
        if (!isNum(minX) || !isNum(maxX) || !isNum(minY) || !isNum(maxY)) {
          throw new Error('init.payload.bounds: minX · maxX · minY · maxY 가 수가 아니다');
        }
        if (!(minX < maxX && minY < maxY)) throw new Error('init.payload.bounds: 범위가 비었다');
        return { ...scene, matrix, bounds: { minX, maxX, minY, maxY }, step: null };
      }
      case 'lift': {
        if (scene.lifted) throw new Error('lift: 이미 셋째 칸이 붙었다');
        const p = readPayload(event);
        if (!Array.isArray(p.points) || p.points.length !== scene.points.length) {
          throw new Error('lift.payload.points: 바탕의 점 수와 다르다');
        }
        const items: unknown[] = p.points;
        items.forEach((item, i) => {
          if (typeof item !== 'object' || item === null) throw new Error(`lift.payload.points[${i}]: 객체가 아니다`);
          const it = item as Record<string, unknown>;
          const at = indexOfPoint(scene, it.id, `lift.payload.points[${i}].id`);
          if (at !== i) throw new Error(`lift.payload.points[${i}].id: 바탕의 차례와 다르다`);
          const v = readVec(it.v, 3, `lift.payload.points[${i}].v`);
          const base = scene.points[i] as TranslatePoint;
          if (v[0] !== base.at[0] || v[1] !== base.at[1]) throw new Error(`lift.payload.points[${i}].v: 바탕 좌표와 다르다`);
          if (v[2] !== 1) throw new Error(`lift.payload.points[${i}].v[2]: 붙은 칸이 1 이 아니다`);
        });
        return { ...scene, lifted: true, step: { kind: 'lift' } };
      }
      case 'multiply': {
        if (!scene.lifted) throw new Error('multiply: 셋째 칸이 붙기 전이다');
        if (scene.matrix === null) throw new Error('multiply: 행렬이 없다 (init 전)');
        const p = readPayload(event);
        const i = indexOfPoint(scene, p.id, 'multiply.payload.id');
        if (scene.moved[i] !== null) throw new Error(`multiply.payload.id: '${String(p.id)}' 는 이미 곱했다`);
        const from = readVec(p.from, 3, 'multiply.payload.from');
        const base = scene.points[i] as TranslatePoint;
        if (!sameVec(from, [base.at[0], base.at[1], 1])) throw new Error('multiply.payload.from: 붙인 점과 다르다');
        const to = readVec(p.to, 3, 'multiply.payload.to');
        const added = readVec(p.added, 2, 'multiply.payload.added');
        const moved = scene.moved.slice();
        moved[i] = to;
        return {
          ...scene,
          moved,
          step: { kind: 'multiply', id: base.id, from, to, added },
        };
      }
      default:
        throw new Error(`extraDimensionForTranslateScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
