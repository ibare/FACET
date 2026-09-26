/**
 * gradient-through-layers 장면.
 *
 * 바탕  base (입력 · 목표 · 층 무게 — initialData 에서 베낌), forward (silent init 이 채움)
 * 자취  grads[k] = ∂L/∂h_k (아직 닿지 않았으면 null), wgrads[k−1] = ∂L/∂w_k
 * 이번  step — 이번 걸음에 일어난 일
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { LAYER_COUNT, narrowGradientThroughLayersData } from './algorithm.js';

export type GradientThroughLayersBase = {
  x: number;
  y: number;
  weights: number[];
};

export type GradientThroughLayersForward = {
  h: number[];
  yHat: number;
  loss: number;
  gradMax: number;
};

export type GradientThroughLayersStep =
  | { kind: 'output'; g: number }
  | { kind: 'cross'; layer: number; factor: number; from: number; to: number; product: number };

export type GradientThroughLayersScene = {
  base: GradientThroughLayersBase;
  forward: GradientThroughLayersForward | null;
  grads: (number | null)[];
  wgrads: (number | null)[];
  step: GradientThroughLayersStep | null;
};

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`gradientThroughLayersScene: ${type}.payload.${key} 가 유한한 수가 아니다`);
  }
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`gradientThroughLayersScene: ${event.type}.payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

function same(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
}

export const gradientThroughLayersScene: ScenePlan<GradientThroughLayersScene> = {
  initial(initialData: unknown): GradientThroughLayersScene {
    const d = narrowGradientThroughLayersData(initialData);
    return {
      base: { x: d.x, y: d.y, weights: [...d.weights] },
      forward: null,
      grads: Array.from({ length: LAYER_COUNT + 1 }, () => null),
      wgrads: Array.from({ length: LAYER_COUNT }, () => null),
      step: null,
    };
  },

  reduce(scene: GradientThroughLayersScene, event: FacetRuntimeEvent): GradientThroughLayersScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const h = p.h;
        if (!Array.isArray(h) || h.length !== LAYER_COUNT + 1) {
          throw new Error(`gradientThroughLayersScene: init.payload.h 는 길이 ${LAYER_COUNT + 1} 의 배열이어야 한다`);
        }
        const hs = h.map((v, i) => {
          if (typeof v !== 'number' || !Number.isFinite(v)) {
            throw new Error(`gradientThroughLayersScene: init.payload.h[${i}] 가 유한한 수가 아니다`);
          }
          return v;
        });
        if (!same(hs[0] as number, scene.base.x)) {
          throw new Error('gradientThroughLayersScene: init.payload.h[0] 이 입력 x 와 다르다');
        }
        const gradMax = num(p, 'gradMax', 'init');
        if (gradMax <= 0) throw new Error('gradientThroughLayersScene: init.payload.gradMax 는 0 보다 커야 한다');
        return {
          ...scene,
          forward: { h: hs, yHat: num(p, 'yHat', 'init'), loss: num(p, 'loss', 'init'), gradMax },
          step: null,
        };
      }
      case 'output': {
        if (scene.forward === null) throw new Error('gradientThroughLayersScene: output 이 init 보다 먼저 왔다');
        if (scene.grads.some((g) => g !== null)) throw new Error('gradientThroughLayersScene: output 이 두 번 왔다');
        const g = num(payloadOf(event), 'g', 'output');
        const grads = [...scene.grads];
        grads[LAYER_COUNT] = g;
        return { ...scene, grads, step: { kind: 'output', g } };
      }
      case 'cross': {
        const p = payloadOf(event);
        const layer = num(p, 'layer', 'cross');
        const factor = num(p, 'factor', 'cross');
        const from = num(p, 'from', 'cross');
        const to = num(p, 'to', 'cross');
        const product = num(p, 'product', 'cross');
        const wgrad = num(p, 'wgrad', 'cross');
        if (!Number.isInteger(layer) || layer < 1 || layer > LAYER_COUNT) {
          throw new Error(`gradientThroughLayersScene: cross.payload.layer ${layer} 가 층 번호가 아니다`);
        }
        const here = scene.grads[layer];
        if (here === null || here === undefined) {
          throw new Error(`gradientThroughLayersScene: cross.payload.layer ${layer} — 기울기가 아직 그 층 위에 닿지 않았다`);
        }
        if (scene.grads[layer - 1] !== null) {
          throw new Error(`gradientThroughLayersScene: cross.payload.layer ${layer} — 이미 건넌 층이다`);
        }
        if (!same(here, from)) throw new Error('gradientThroughLayersScene: cross.payload.from 이 지금 기울기와 다르다');
        const w = scene.base.weights[layer - 1];
        if (w === undefined || !same(w, factor)) {
          throw new Error(`gradientThroughLayersScene: cross.payload.factor 가 층 ${layer} 의 무게와 다르다`);
        }
        const grads = [...scene.grads];
        grads[layer - 1] = to;
        const wgrads = [...scene.wgrads];
        wgrads[layer - 1] = wgrad;
        return { ...scene, grads, wgrads, step: { kind: 'cross', layer, factor, from, to, product } };
      }
      default:
        throw new Error(`gradientThroughLayersScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
