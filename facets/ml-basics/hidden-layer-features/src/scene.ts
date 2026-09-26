/**
 * hidden-layer-features 장면.
 *
 * 바탕 — 입력 네 점 · 단위 둘의 무게 (initialData) · 축 범위 (silent init)
 * 자취 — 점마다 걸음이 지나온 자리 · 자리마다 지금 무엇의 값인가
 * 이번 걸음 — 바꾼 단위와 자리, 바꾸기 전 자리와 거리 (운동의 출발점)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  AXES,
  narrowHiddenLayerFeaturesData,
  type Axis,
  type HiddenInput,
  type HiddenUnit,
} from './algorithm.js';

export type HlfPoint = { x: number; y: number };
export type HlfDistances = { zero: number; one: number };

/** 자리의 출처 — 0 이면 입력 그대로, j 면 단위 j 의 값 */
export type HlfSources = { x: number; y: number };

export type HlfStep =
  | { kind: 'start' }
  | { kind: 'replace'; unit: number; axis: Axis; before: HlfPoint[]; was: HlfDistances };

export type HiddenLayerFeaturesScene = {
  inputs: HiddenInput[];
  units: HiddenUnit[];
  range: { lo: number; hi: number } | null;
  /** 걸음이 지나온 자리들 — 마지막이 지금 자리 */
  trail: HlfPoint[][];
  sources: HlfSources;
  dist: HlfDistances | null;
  step: HlfStep | null;
};

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`hiddenLayerFeaturesScene: ${path} 가 유한한 수가 아니다`);
  }
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`hiddenLayerFeaturesScene: ${event.type}.payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

function current(scene: HiddenLayerFeaturesScene): HlfPoint[] {
  const last = scene.trail[scene.trail.length - 1];
  if (!last) throw new Error('hiddenLayerFeaturesScene: 지금 자리가 없다');
  return last;
}

export const hiddenLayerFeaturesScene: ScenePlan<HiddenLayerFeaturesScene> = {
  initial(initialData: unknown): HiddenLayerFeaturesScene {
    const data = narrowHiddenLayerFeaturesData(initialData);
    return {
      inputs: data.inputs.map((p) => ({ ...p })),
      units: data.units.map((u) => ({ w: [u.w[0], u.w[1]], b: u.b })),
      range: null,
      trail: [data.inputs.map((p) => ({ x: p.x1, y: p.x2 }))],
      sources: { x: 0, y: 0 },
      dist: null,
      step: null,
    };
  },

  reduce(scene: HiddenLayerFeaturesScene, event: FacetRuntimeEvent): HiddenLayerFeaturesScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const lo = num(p.lo, 'init.payload.lo');
        const hi = num(p.hi, 'init.payload.hi');
        if (!(hi > lo)) throw new Error('hiddenLayerFeaturesScene: init.payload 의 hi 가 lo 보다 크지 않다');
        return {
          ...scene,
          range: { lo, hi },
          dist: { zero: num(p.zero, 'init.payload.zero'), one: num(p.one, 'init.payload.one') },
          step: { kind: 'start' },
        };
      }
      case 'replace': {
        const p = payloadOf(event);
        const unit = num(p.unit, 'replace.payload.unit');
        const axis = p.axis;
        if (axis !== 'x' && axis !== 'y') {
          throw new Error('hiddenLayerFeaturesScene: replace.payload.axis 가 x · y 가 아니다');
        }
        if (AXES[unit - 1] !== axis || !scene.units[unit - 1]) {
          throw new Error('hiddenLayerFeaturesScene: replace.payload.unit 과 axis 가 맞지 않는다');
        }
        if (scene.sources[axis] !== 0) {
          throw new Error(`hiddenLayerFeaturesScene: replace.payload.axis ${axis} 자리는 이미 바뀌었다`);
        }
        if (!scene.dist || !scene.range) {
          throw new Error('hiddenLayerFeaturesScene: init 앞에 replace 가 왔다');
        }
        const values = p.values;
        if (!Array.isArray(values) || values.length !== scene.inputs.length) {
          throw new Error('hiddenLayerFeaturesScene: replace.payload.values 의 길이가 점 수와 다르다');
        }
        const before = current(scene);
        const after = before.map((q, i) => {
          const h = num(values[i], `replace.payload.values[${i}]`);
          return axis === 'x' ? { x: h, y: q.y } : { x: q.x, y: h };
        });
        return {
          ...scene,
          trail: [...scene.trail.map((ps) => ps.map((q) => ({ ...q }))), after],
          sources: { ...scene.sources, [axis]: unit },
          dist: { zero: num(p.zero, 'replace.payload.zero'), one: num(p.one, 'replace.payload.one') },
          step: {
            kind: 'replace',
            unit,
            axis,
            before: before.map((q) => ({ ...q })),
            was: { ...scene.dist },
          },
        };
      }
      default:
        throw new Error(`hiddenLayerFeaturesScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
