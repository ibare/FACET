/**
 * nonlinear-bends 장면 — 바탕(축과 입력 선) · 자취(쌓인 층의 단위 선 · 접은 한 층) · 이번 걸음.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowNonlinearBendsData, type Line } from './algorithm.js';

export type NonlinearBendsBase = {
  xLo: number;
  xHi: number;
  vLo: number;
  vHi: number;
  input: Line;
  layerCount: number;
  maxUnits: number;
};

export type NonlinearBendsStep =
  | { kind: 'input' }
  | { kind: 'layer'; index: number }
  | { kind: 'fold' };

export type NonlinearBendsScene = {
  /** init 이 오기 전에는 없다 */
  base: NonlinearBendsBase | null;
  /** 쌓인 층마다 단위 선 — layers[k − 1] 이 층 k */
  layers: Line[][];
  /** 접은 한 층 — fold 뒤에만 */
  folded: Line | null;
  step: NonlinearBendsStep | null;
};

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`nonlinear-bends 장면: ${path} 가 수가 아니다`);
  return v;
}

function field(obj: unknown, key: string, path: string): unknown {
  if (typeof obj !== 'object' || obj === null) throw new Error(`nonlinear-bends 장면: ${path} 가 객체가 아니다`);
  return (obj as Record<string, unknown>)[key];
}

function line(v: unknown, path: string): Line {
  return { a: num(field(v, 'a', path), `${path}.a`), b: num(field(v, 'b', path), `${path}.b`) };
}

export const nonlinearBendsScene: ScenePlan<NonlinearBendsScene> = {
  initial(initialData: unknown): NonlinearBendsScene {
    // 모양만 확인한다 — 축 범위는 알고리즘의 셈이라 silent init 이 채운다
    narrowNonlinearBendsData(initialData);
    return { base: null, layers: [], folded: null, step: null };
  },

  reduce(scene: NonlinearBendsScene, event: FacetRuntimeEvent): NonlinearBendsScene {
    const p = event.payload;
    switch (event.type) {
      case 'init': {
        const layerCount = num(field(p, 'layerCount', 'init.payload'), 'init.payload.layerCount');
        if (!Number.isInteger(layerCount) || layerCount < 1) throw new Error('nonlinear-bends 장면: init.payload.layerCount 가 1 이상의 정수가 아니다');
        const base: NonlinearBendsBase = {
          xLo: num(field(p, 'xLo', 'init.payload'), 'init.payload.xLo'),
          xHi: num(field(p, 'xHi', 'init.payload'), 'init.payload.xHi'),
          vLo: num(field(p, 'vLo', 'init.payload'), 'init.payload.vLo'),
          vHi: num(field(p, 'vHi', 'init.payload'), 'init.payload.vHi'),
          input: line(field(p, 'input', 'init.payload'), 'init.payload.input'),
          layerCount,
          maxUnits: num(field(p, 'maxUnits', 'init.payload'), 'init.payload.maxUnits'),
        };
        if (!(base.xLo < base.xHi) || !(base.vLo < base.vHi)) throw new Error('nonlinear-bends 장면: init 의 범위가 비었다');
        return { base, layers: [], folded: null, step: { kind: 'input' } };
      }
      case 'layer': {
        if (scene.base === null) throw new Error('nonlinear-bends 장면: init 앞에 layer 가 왔다');
        if (scene.folded !== null) throw new Error('nonlinear-bends 장면: fold 뒤에 layer 가 왔다');
        const index = num(field(p, 'index', 'layer.payload'), 'layer.payload.index');
        if (index !== scene.layers.length + 1 || index > scene.base.layerCount) {
          throw new Error(`nonlinear-bends 장면: layer.payload.index ${index} 가 다음 층 번호(${scene.layers.length + 1})와 다르다`);
        }
        const rawUnits = field(p, 'units', 'layer.payload');
        if (!Array.isArray(rawUnits) || rawUnits.length === 0) throw new Error('nonlinear-bends 장면: layer.payload.units 가 비었다');
        const units = rawUnits.map((u: unknown, i: number) => line(u, `layer.payload.units[${i}]`));
        return {
          base: scene.base,
          layers: [...scene.layers.map((l) => l.map((u) => ({ ...u }))), units],
          folded: null,
          step: { kind: 'layer', index },
        };
      }
      case 'fold': {
        if (scene.base === null) throw new Error('nonlinear-bends 장면: init 앞에 fold 가 왔다');
        if (scene.layers.length !== scene.base.layerCount) {
          throw new Error(`nonlinear-bends 장면: 층 ${scene.layers.length} 개만 쌓였는데 fold 가 왔다`);
        }
        const top = scene.layers[scene.layers.length - 1];
        if (top === undefined || top.length !== 1) throw new Error('nonlinear-bends 장면: 마지막 층의 단위가 하나가 아니다');
        return {
          base: scene.base,
          layers: scene.layers.map((l) => l.map((u) => ({ ...u }))),
          folded: line(p, 'fold.payload'),
          step: { kind: 'fold' },
        };
      }
      default:
        throw new Error(`nonlinear-bends 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
