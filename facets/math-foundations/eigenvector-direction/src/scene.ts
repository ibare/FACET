/**
 * 장면 — 바탕(행렬 · 훑을 벡터 · 틀) · 자취(곱한 결과들) · 이번 걸음.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowEigenvectorDirectionData,
  type Bounds,
  type Mat2,
  type Probe,
  type Vec2,
} from './algorithm';

export type EigenvectorDirectionScene = {
  /** 바탕 — initialData 에서 베낀다 */
  matrix: Mat2;
  vectors: Vec2[];
  /** 바탕 — silent init 이 채운다. 그 전에는 null */
  bounds: Bounds | null;
  spinMin: number | null;
  spinMax: number | null;
  /** 자취 — 곱한 차례대로 */
  results: Probe[];
  /** 이번 걸음 */
  step: { kind: 'apply'; index: number } | null;
};

function num(o: Record<string, unknown>, key: string): number {
  const x = o[key];
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new Error(`eigenvectorDirectionScene: payload.${key} 가 수가 아니다`);
  }
  return x;
}

function vec(o: Record<string, unknown>, key: string): Vec2 {
  const x = o[key];
  if (
    !Array.isArray(x) ||
    x.length !== 2 ||
    typeof x[0] !== 'number' ||
    typeof x[1] !== 'number'
  ) {
    throw new Error(`eigenvectorDirectionScene: payload.${key} 가 수 둘의 배열이 아니다`);
  }
  return [x[0], x[1]];
}

function obj(x: unknown, path: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null) {
    throw new Error(`eigenvectorDirectionScene: ${path} 가 객체가 아니다`);
  }
  return x as Record<string, unknown>;
}

function reduceInit(scene: EigenvectorDirectionScene, event: FacetRuntimeEvent): EigenvectorDirectionScene {
  const p = obj(event.payload, 'init.payload');
  const b = obj(p.bounds, 'init.payload.bounds');
  const bounds: Bounds = {
    minX: num(b, 'minX'),
    maxX: num(b, 'maxX'),
    minY: num(b, 'minY'),
    maxY: num(b, 'maxY'),
  };
  if (!(bounds.minX < bounds.maxX && bounds.minY < bounds.maxY)) {
    throw new Error('eigenvectorDirectionScene: init.payload.bounds 의 폭이 없다');
  }
  const spinMin = num(p, 'spinMin');
  const spinMax = num(p, 'spinMax');
  if (spinMin > 0 || spinMax < 0) {
    throw new Error('eigenvectorDirectionScene: init.payload.spinMin/spinMax 가 0 을 품지 않는다');
  }
  return { ...scene, bounds, spinMin, spinMax, results: [], step: null };
}

function reduceApply(scene: EigenvectorDirectionScene, event: FacetRuntimeEvent): EigenvectorDirectionScene {
  if (scene.bounds === null) {
    throw new Error('eigenvectorDirectionScene: init 보다 apply 가 먼저 왔다');
  }
  const p = obj(event.payload, 'apply.payload');
  const index = num(p, 'index');
  if (index !== scene.results.length) {
    throw new Error(
      `eigenvectorDirectionScene: apply.payload.index ${index} — 다음 차례는 ${scene.results.length}`,
    );
  }
  const base = scene.vectors[index];
  if (base === undefined) {
    throw new Error(`eigenvectorDirectionScene: apply.payload.index ${index} 가 바탕 벡터 밖이다`);
  }
  const v = vec(p, 'v');
  if (v[0] !== base[0] || v[1] !== base[1]) {
    throw new Error(`eigenvectorDirectionScene: apply.payload.v 가 바탕의 vectors[${index}] 와 다르다`);
  }
  const onLine = p.onLine;
  if (typeof onLine !== 'boolean') {
    throw new Error('eigenvectorDirectionScene: apply.payload.onLine 이 참거짓이 아니다');
  }
  const rawLambda = p.lambda;
  let lambda: number | null;
  if (onLine) {
    lambda = num(p, 'lambda');
  } else if (rawLambda === null) {
    lambda = null;
  } else {
    throw new Error('eigenvectorDirectionScene: apply.payload.lambda 는 제 직선 위가 아니면 null 이어야 한다');
  }
  const probe: Probe = {
    index,
    v,
    av: vec(p, 'av'),
    vDeg: num(p, 'vDeg'),
    avDeg: num(p, 'avDeg'),
    spinDeg: num(p, 'spinDeg'),
    factor: num(p, 'factor'),
    cross: num(p, 'cross'),
    onLine,
    lambda,
  };
  return { ...scene, results: [...scene.results, probe], step: { kind: 'apply', index } };
}

export const eigenvectorDirectionScene: ScenePlan<EigenvectorDirectionScene> = {
  initial(initialData: unknown): EigenvectorDirectionScene {
    const data = narrowEigenvectorDirectionData(initialData);
    return {
      matrix: [
        [data.matrix[0][0], data.matrix[0][1]],
        [data.matrix[1][0], data.matrix[1][1]],
      ],
      vectors: data.vectors.map((v): Vec2 => [v[0], v[1]]),
      bounds: null,
      spinMin: null,
      spinMax: null,
      results: [],
      step: null,
    };
  },
  reduce(scene: EigenvectorDirectionScene, event: FacetRuntimeEvent): EigenvectorDirectionScene {
    switch (event.type) {
      case 'init':
        return reduceInit(scene, event);
      case 'apply':
        return reduceApply(scene, event);
      default:
        throw new Error(`eigenvectorDirectionScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
