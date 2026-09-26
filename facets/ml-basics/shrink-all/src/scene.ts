import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowShrinkAllData, type Pair } from './algorithm.js';

/** 이번 걸음 — 처음 모습이거나 갱신 한 번. */
export type ShrinkAllStep =
  | { kind: 'start' }
  | { kind: 'update'; k: number; from: Pair; decay: Pair };

export type ShrinkAllScene = {
  // 바탕
  ids: [string, string];
  fit: Pair;
  eta: number;
  lambda: number;
  // 자취
  /** 지금 무게 */
  w: Pair;
  /** 지나온 무게 — 시작부터 지금 앞까지 */
  trail: Pair[];
  /** 처음 대비 남은 비율 — 알고리즘이 셈해 보내기 전엔 없다 */
  ratio: Pair | null;
  /** 두 무게의 비 */
  quotient: number | null;
  /** 한 갱신 수 */
  k: number;
  // 이번 걸음
  step: ShrinkAllStep;
};

function fail(path: string, why: string): never {
  throw new Error(`shrinkAllScene: ${path} — ${why}`);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

function pair(v: unknown, path: string): Pair {
  if (!Array.isArray(v) || v.length !== 2) fail(path, '수 둘의 배열이 아니다');
  return [num(v[0], `${path}[0]`), num(v[1], `${path}[1]`)];
}

function record(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) fail(path, '객체가 아니다');
  return v as Record<string, unknown>;
}

function samePair(a: Pair, b: Pair): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export const shrinkAllScene: ScenePlan<ShrinkAllScene> = {
  initial(initialData: unknown): ShrinkAllScene {
    const d = narrowShrinkAllData(initialData);
    return {
      ids: [d.ids[0], d.ids[1]],
      fit: [d.fit[0], d.fit[1]],
      eta: d.eta,
      lambda: d.lambda,
      // 시작 무게는 a 그 자체다 (사양의 구조)
      w: [d.fit[0], d.fit[1]],
      trail: [],
      ratio: null,
      quotient: null,
      k: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: ShrinkAllScene, event: FacetRuntimeEvent): ShrinkAllScene {
    switch (event.type) {
      case 'init': {
        const p = record(event.payload, 'init.payload');
        if (scene.k !== 0) fail('init', `갱신 ${scene.k} 뒤에 왔다`);
        const w = pair(p.w, 'init.payload.w');
        if (!samePair(w, scene.w)) fail('init.payload.w', '시작 무게와 다르다');
        return {
          ...scene,
          w,
          ratio: pair(p.ratio, 'init.payload.ratio'),
          quotient: num(p.quotient, 'init.payload.quotient'),
          step: { kind: 'start' },
        };
      }
      case 'update': {
        const p = record(event.payload, 'update.payload');
        const k = num(p.k, 'update.payload.k');
        if (k !== scene.k + 1) fail('update.payload.k', `${scene.k + 1} 이어야 하는데 ${k}`);
        const from = pair(p.from, 'update.payload.from');
        if (!samePair(from, scene.w)) fail('update.payload.from', '지금 무게와 다르다');
        return {
          ...scene,
          w: pair(p.w, 'update.payload.w'),
          trail: [...scene.trail, [scene.w[0], scene.w[1]]],
          ratio: pair(p.ratio, 'update.payload.ratio'),
          quotient: num(p.quotient, 'update.payload.quotient'),
          k,
          step: { kind: 'update', k, from, decay: pair(p.decay, 'update.payload.decay') },
        };
      }
      default:
        throw new Error(`shrinkAllScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
