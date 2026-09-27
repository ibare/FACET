/**
 * vector-as-arrow 의 장면.
 *
 * 바탕: 벡터의 기호 · 숫자쌍 · 원점 · 걸음 전체가 닿는 좌표 범위 (silent init 이 한 번 정한다)
 * 자취: 가로로 걸은 다리 · 놓인 화살표들 (처음 것이 원점의 화살표, 뒤로 옮긴 것들)
 * 이번 걸음: 무엇이 방금 일어났는가
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowVectorAsArrowData, readPoint } from './algorithm.js';
import type { Arrow, Bounds, Pt } from './algorithm.js';

export type VectorAsArrowBase = {
  name: string;
  v: Pt;
  origin: Pt;
  bounds: Bounds;
};

export type VectorAsArrowLeg = { from: Pt; to: Pt; n: number };

export type VectorAsArrowStep =
  | { kind: 'walk-x' }
  | { kind: 'walk-y' }
  | { kind: 'place'; index: number };

export type VectorAsArrowScene = {
  base: VectorAsArrowBase | null;
  /** 원점에서 가로로 걸은 다리. 걸음 1 부터 있다 */
  legX: VectorAsArrowLeg | null;
  /** 놓인 화살표. [0] 이 원점의 화살표, 뒤가 옮긴 것들 */
  arrows: readonly Arrow[];
  step: VectorAsArrowStep | null;
};

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`vector-as-arrow scene: ${path} 가 객체가 아니다`);
  }
  return value as Record<string, unknown>;
}

function num(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`vector-as-arrow scene: ${path} 가 유한한 수가 아니다`);
  }
  return value;
}

function samePt(a: Pt, b: Pt): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function readArrow(value: unknown, path: string): Arrow {
  const r = record(value, path);
  return {
    tail: readPoint(r.tail, `${path}.tail`),
    corner: readPoint(r.corner, `${path}.corner`),
    head: readPoint(r.head, `${path}.head`),
    diff: readPoint(r.diff, `${path}.diff`),
  };
}

function readLeg(p: Record<string, unknown>): VectorAsArrowLeg {
  return {
    from: readPoint(p.from, 'payload.from'),
    to: readPoint(p.to, 'payload.to'),
    n: num(p.n, 'payload.n'),
  };
}

function needBase(scene: VectorAsArrowScene, type: string): VectorAsArrowBase {
  if (!scene.base) throw new Error(`vector-as-arrow scene: init 앞에 ${type} 가 왔다`);
  return scene.base;
}

export const vectorAsArrowScene: ScenePlan<VectorAsArrowScene> = {
  initial(initialData: unknown): VectorAsArrowScene {
    // 모양만 확인한다. 원점 · 좌표 범위는 알고리즘이 silent init 으로 싣는다.
    narrowVectorAsArrowData(initialData);
    return { base: null, legX: null, arrows: [], step: null };
  },

  reduce(scene: VectorAsArrowScene, event: FacetRuntimeEvent): VectorAsArrowScene {
    const p = record(event.payload, `${event.type}.payload`);
    switch (event.type) {
      case 'init': {
        if (typeof p.name !== 'string' || p.name === '') {
          throw new Error('vector-as-arrow scene: init.payload.name 이 비었다');
        }
        const b = record(p.bounds, 'init.payload.bounds');
        return {
          base: {
            name: p.name,
            v: readPoint(p.v, 'init.payload.v'),
            origin: readPoint(p.origin, 'init.payload.origin'),
            bounds: {
              xMin: num(b.xMin, 'init.payload.bounds.xMin'),
              xMax: num(b.xMax, 'init.payload.bounds.xMax'),
              yMin: num(b.yMin, 'init.payload.bounds.yMin'),
              yMax: num(b.yMax, 'init.payload.bounds.yMax'),
            },
          },
          legX: null,
          arrows: [],
          step: null,
        };
      }
      case 'walk-x': {
        const base = needBase(scene, 'walk-x');
        if (scene.legX) throw new Error('vector-as-arrow scene: walk-x 가 두 번 왔다');
        const leg = readLeg(p);
        if (!samePt(leg.from, base.origin)) {
          throw new Error('vector-as-arrow scene: walk-x.payload.from 이 원점이 아니다');
        }
        return { ...scene, legX: leg, step: { kind: 'walk-x' } };
      }
      case 'walk-y': {
        needBase(scene, 'walk-y');
        if (!scene.legX) throw new Error('vector-as-arrow scene: walk-x 앞에 walk-y 가 왔다');
        if (scene.arrows.length !== 0) throw new Error('vector-as-arrow scene: walk-y 가 두 번 왔다');
        const leg = readLeg(p);
        if (!samePt(leg.from, scene.legX.to)) {
          throw new Error('vector-as-arrow scene: walk-y.payload.from 이 가로 걸음의 끝이 아니다');
        }
        const arrow = readArrow(p.arrow, 'walk-y.payload.arrow');
        if (!samePt(arrow.head, leg.to)) {
          throw new Error('vector-as-arrow scene: walk-y.payload.arrow.head 가 걸어 간 끝이 아니다');
        }
        return { ...scene, arrows: [arrow], step: { kind: 'walk-y' } };
      }
      case 'place': {
        needBase(scene, 'place');
        const index = num(p.index, 'place.payload.index');
        if (scene.arrows.length !== index + 1) {
          throw new Error(
            `vector-as-arrow scene: place.payload.index ${index} 가 놓인 화살표 수 ${scene.arrows.length} 와 맞지 않다`,
          );
        }
        const arrow = readArrow(p.arrow, 'place.payload.arrow');
        return { ...scene, arrows: [...scene.arrows, arrow], step: { kind: 'place', index } };
      }
      default:
        throw new Error(`vector-as-arrow scene: 모르는 이벤트 ${event.type}`);
    }
  },
};
