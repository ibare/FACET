/**
 * 저랭크 근사의 장면.
 *
 * 바탕 — 원래 표(initialData), 겹 · σ · 칠하는 잣대(silent init)
 * 자취 — 지금 표 A_k · 버린 겹 · 오차 · 같은 칸 · 달라진 칸
 * 이번 걸음 — 처음이거나, 한 겹을 버렸거나. 버린 걸음은 버리기 전 표와 달라진 칸을 계기값으로 싣는다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { asFlags, asMatrix, narrowLowRankApproxData } from './algorithm.js';

export type LowRankBase = {
  layers: number[][][];
  sigmas: number[];
  scale: number;
};

export type LowRankStep =
  | { kind: 'start' }
  | { kind: 'drop'; index: number; sigma: number; from: number[][]; fromChanged: boolean[][] };

export type LowRankScene = {
  original: number[][];
  /** silent init 전에는 없다 */
  base: LowRankBase | null;
  table: number[][];
  /** 버린 겹의 자리, 버린 차례대로 */
  dropped: number[];
  errorPct: number | null;
  same: number | null;
  changed: boolean[][] | null;
  step: LowRankStep;
};

function field(payload: unknown, key: string, type: string): unknown {
  if (typeof payload !== 'object' || payload === null) throw new Error(`${type}.payload: 객체가 아니다`);
  return (payload as Record<string, unknown>)[key];
}

function num(payload: unknown, key: string, type: string): number {
  const v = field(payload, key, type);
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${type}.payload.${key}: 유한한 수가 아니다`);
  return v;
}

function sameShape(a: unknown[][], b: number[][], path: string): void {
  if (a.length !== b.length) throw new Error(`${path}: 행 수가 원래 표와 다르다`);
  a.forEach((row, r) => {
    if (row.length !== (b[r] as number[]).length) throw new Error(`${path}[${r}]: 열 수가 원래 표와 다르다`);
  });
}

export const lowRankApproxScene: ScenePlan<LowRankScene> = {
  initial(initialData: unknown): LowRankScene {
    const data = narrowLowRankApproxData(initialData);
    const original = data.table.map((row) => [...row]);
    return {
      original,
      base: null,
      table: original.map((row) => [...row]),
      dropped: [],
      errorPct: null,
      same: null,
      changed: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: LowRankScene, event: FacetRuntimeEvent): LowRankScene {
    const p = event.payload;
    switch (event.type) {
      case 'init': {
        const rawLayers = field(p, 'layers', 'init');
        if (!Array.isArray(rawLayers) || rawLayers.length === 0) throw new Error('init.payload.layers: 비지 않은 배열이어야 한다');
        const layers = rawLayers.map((m: unknown, i) => {
          const layer = asMatrix(m, `init.payload.layers[${i}]`);
          sameShape(layer, scene.original, `init.payload.layers[${i}]`);
          return layer;
        });
        const rawSigmas = field(p, 'sigmas', 'init');
        if (!Array.isArray(rawSigmas) || rawSigmas.length !== layers.length) {
          throw new Error('init.payload.sigmas: 겹 수만큼의 배열이어야 한다');
        }
        const sigmas = rawSigmas.map((s: unknown, i) => {
          if (typeof s !== 'number' || !(s > 0)) throw new Error(`init.payload.sigmas[${i}]: 양수가 아니다`);
          return s;
        });
        const scale = num(p, 'scale', 'init');
        if (!(scale > 0)) throw new Error('init.payload.scale: 양수가 아니다');
        const table = asMatrix(field(p, 'table', 'init'), 'init.payload.table');
        sameShape(table, scene.original, 'init.payload.table');
        const changed = asFlags(field(p, 'changed', 'init'), 'init.payload.changed');
        sameShape(changed, scene.original, 'init.payload.changed');
        return {
          original: scene.original,
          base: { layers, sigmas, scale },
          table,
          dropped: [],
          errorPct: num(p, 'errorPct', 'init'),
          same: num(p, 'same', 'init'),
          changed,
          step: { kind: 'start' },
        };
      }
      case 'drop': {
        const base = scene.base;
        const changedBefore = scene.changed;
        if (base === null || changedBefore === null) throw new Error('drop: init 앞에 왔다');
        const index = num(p, 'index', 'drop');
        const kept = num(p, 'kept', 'drop');
        const left = base.sigmas.length - scene.dropped.length;
        if (index !== left - 1) throw new Error(`drop.payload.index: 남은 겹 가운데 가장 작은 것(${left - 1})이 아니다 (${index})`);
        if (kept !== left - 1) throw new Error(`drop.payload.kept: 남은 겹 수가 ${left - 1} 이 아니다 (${kept})`);
        if (kept < 1) throw new Error('drop: 마지막 겹을 버리려 한다');
        const sigma = num(p, 'sigma', 'drop');
        if (sigma !== base.sigmas[index]) throw new Error(`drop.payload.sigma: 겹 ${index} 의 σ 와 다르다`);
        const table = asMatrix(field(p, 'table', 'drop'), 'drop.payload.table');
        sameShape(table, scene.original, 'drop.payload.table');
        const changed = asFlags(field(p, 'changed', 'drop'), 'drop.payload.changed');
        sameShape(changed, scene.original, 'drop.payload.changed');
        return {
          original: scene.original,
          base,
          table,
          dropped: [...scene.dropped, index],
          errorPct: num(p, 'errorPct', 'drop'),
          same: num(p, 'same', 'drop'),
          changed,
          step: { kind: 'drop', index, sigma, from: scene.table, fromChanged: changedBefore },
        };
      }
      default:
        throw new Error(`low-rank-approx: 모르는 이벤트 '${event.type}'`);
    }
  },
};
