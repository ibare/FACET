/**
 * matvec-as-combination 의 장면.
 *
 * 바탕   columns · weights (initialData) · range · start (silent init)
 * 자취   applied — 무게를 건 열 하나하나 (무게 건 모양과 합의 앞뒤)
 * 이번   step — 처음 · 열 j 에 무게 · 결과
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { columnOf, narrowMatvecData, type Vec2, type WeightEffect } from './algorithm.js';

export type AppliedColumn = {
  col: number;
  weight: number;
  effect: WeightEffect;
  scaled: Vec2;
  before: Vec2;
  after: Vec2;
};

export type MatvecStep =
  | { kind: 'start' }
  | { kind: 'weigh'; col: number }
  | { kind: 'result'; count: number };

export type MatvecScene = {
  /** 행렬의 열 (바탕) */
  columns: Vec2[];
  /** v 의 수 (바탕) */
  weights: number[];
  /** 그림의 값 범위 — init 이 채운다 */
  range: { lo: number; hi: number } | null;
  /** 합 — init 이 출발점을 채우고 걸음마다 옮겨 간다 */
  sum: Vec2 | null;
  applied: AppliedColumn[];
  done: boolean;
  step: MatvecStep;
};

function fail(msg: string): never {
  throw new Error(`matvecAsCombinationScene: ${msg}`);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type}.payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string, where: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${where}.${key} 가 수가 아니다`);
  return v;
}

function vec(p: Record<string, unknown>, key: string, where: string): Vec2 {
  const v = p[key];
  if (!Array.isArray(v) || v.length !== 2) fail(`${where}.${key} 가 수 둘이 아니다`);
  const a: unknown = v[0];
  const b: unknown = v[1];
  if (
    typeof a !== 'number' ||
    typeof b !== 'number' ||
    !Number.isFinite(a) ||
    !Number.isFinite(b)
  ) {
    fail(`${where}.${key} 가 유한한 수 둘이 아니다`);
  }
  return [a, b];
}

function sameVec(a: Vec2, b: Vec2): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export const matvecAsCombinationScene: ScenePlan<MatvecScene> = {
  initial(initialData: unknown): MatvecScene {
    const data = narrowMatvecData(initialData);
    const columns: Vec2[] = data.vector.map((_, j) => columnOf(data.matrix, j));
    return {
      columns,
      weights: [...data.vector],
      range: null,
      sum: null,
      applied: [],
      done: false,
      step: { kind: 'start' },
    };
  },

  reduce(scene: MatvecScene, event: FacetRuntimeEvent): MatvecScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const lo = num(p, 'lo', 'init');
        const hi = num(p, 'hi', 'init');
        if (!(lo <= 0 && hi >= 0 && lo < hi)) fail(`init 의 범위가 어긋났다 (${lo}, ${hi})`);
        const sum = vec(p, 'sum', 'init');
        return { ...scene, range: { lo, hi }, sum, applied: [], done: false, step: { kind: 'start' } };
      }
      case 'weigh': {
        const p = payloadOf(event);
        if (scene.sum === null || scene.range === null) fail('weigh 가 init 보다 먼저 왔다');
        const col = num(p, 'col', 'weigh');
        if (col !== scene.applied.length) {
          fail(`weigh.col ${col} 가 차례(${scene.applied.length})와 다르다`);
        }
        const column = scene.columns[col];
        if (column === undefined) fail(`weigh.col ${col} 가 행렬 밖이다`);
        const weight = num(p, 'weight', 'weigh');
        if (weight !== scene.weights[col]) fail(`weigh.weight ${weight} 가 v 의 수와 다르다`);
        if (!sameVec(vec(p, 'column', 'weigh'), column)) fail('weigh.column 이 행렬의 열과 다르다');
        const effect = p.effect;
        if (effect !== 'stretch' && effect !== 'flip' && effect !== 'shrink') {
          fail(`weigh.effect 가 어긋났다 (${String(effect)})`);
        }
        const before = vec(p, 'before', 'weigh');
        if (!sameVec(before, scene.sum)) fail('weigh.before 가 지금 합과 다르다');
        const scaled = vec(p, 'scaled', 'weigh');
        const after = vec(p, 'after', 'weigh');
        const entry: AppliedColumn = { col, weight, effect, scaled, before, after };
        return {
          ...scene,
          sum: [after[0], after[1]],
          applied: [...scene.applied, entry],
          step: { kind: 'weigh', col },
        };
      }
      case 'result': {
        const p = payloadOf(event);
        if (scene.sum === null) fail('result 가 init 보다 먼저 왔다');
        const av = vec(p, 'av', 'result');
        if (!sameVec(av, scene.sum)) fail('result.av 가 지금 합과 다르다');
        const count = num(p, 'count', 'result');
        if (count !== scene.columns.length || scene.applied.length !== count) {
          fail(`result.count ${count} 가 더한 열의 수와 다르다`);
        }
        return { ...scene, done: true, step: { kind: 'result', count } };
      }
      default:
        fail(`모르는 이벤트 ${event.type}`);
    }
  },
};
