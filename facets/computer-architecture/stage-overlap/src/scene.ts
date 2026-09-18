/**
 * 단계 겹치기의 장면.
 *
 * 바탕   instructions · stages — init 이 한 번 정한다
 * 자취   cycle · occupancy · fetched · finished — 박자가 쌓는다
 * 이번   step — 이번 박자에 무엇이 들어오고 무엇이 빠져나갔는가
 *
 * 줄에서 기다리는 명령어는 따로 담지 않는다 — `fetched` 번 이후 전부다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import type { StageKey } from './algorithm.js';

export type Finished = { readonly k: number; readonly at: number };

export type StageOverlapStep =
  | { readonly kind: 'init' }
  | { readonly kind: 'cycle'; readonly entered: number | null; readonly left: number | null }
  | { readonly kind: 'drain'; readonly left: number; readonly serial: number };

export type StageOverlapScene = {
  readonly instructions: readonly string[];
  readonly stages: readonly StageKey[];
  /** 지금 사이클. 아직 한 박자도 안 쳤으면 0. */
  readonly cycle: number;
  /** occupancy[s] = 단계 s 에 있는 명령어 번호, 비었으면 null. */
  readonly occupancy: readonly (number | null)[];
  /** 지금까지 IF 로 들어간 명령어 수. */
  readonly fetched: number;
  /** 빠져나간 명령어와 그것이 WB 를 마친 사이클. 먼저 끝난 것이 앞. */
  readonly finished: readonly Finished[];
  readonly step: StageOverlapStep | null;
};

function isStageKey(v: unknown): v is StageKey {
  return v === 'if' || v === 'id' || v === 'ex' || v === 'mem' || v === 'wb';
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

const EMPTY: StageOverlapScene = {
  instructions: [],
  stages: [],
  cycle: 0,
  occupancy: [],
  fetched: 0,
  finished: [],
  step: null,
};

export const stageOverlapScene: ScenePlan<StageOverlapScene> = {
  initial() {
    // 자료를 쥐지 않는다 — init 이 채운다.
    return EMPTY;
  },

  reduce(scene, event: FacetRuntimeEvent) {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    if (event.type === 'init') {
      const instructions = Array.isArray(p.instructions)
        ? p.instructions.filter((s): s is string => typeof s === 'string')
        : [];
      const stages = Array.isArray(p.stages) ? p.stages.filter(isStageKey) : [];
      return {
        instructions,
        stages,
        cycle: 0,
        occupancy: stages.map(() => null),
        fetched: 0,
        finished: [],
        step: { kind: 'init' },
      };
    }

    if (event.type === 'cycle') {
      const cycle = typeof p.cycle === 'number' ? p.cycle : scene.cycle;
      const occupancy = Array.isArray(p.occupancy) ? p.occupancy.map(numOrNull) : scene.occupancy;
      const entered = numOrNull(p.entered);
      const left = numOrNull(p.left);
      return {
        ...scene,
        cycle,
        occupancy,
        fetched: entered === null ? scene.fetched : scene.fetched + 1,
        // 빠져나간 것은 바로 앞 사이클에 WB 에 있었다.
        finished: left === null ? scene.finished : [...scene.finished, { k: left, at: cycle - 1 }],
        step: { kind: 'cycle', entered, left },
      };
    }

    if (event.type === 'drain') {
      const left = numOrNull(p.left);
      const at = typeof p.cycle === 'number' ? p.cycle : scene.cycle;
      if (left === null) return scene;
      return {
        ...scene,
        cycle: at,
        occupancy: scene.occupancy.map(() => null),
        finished: [...scene.finished, { k: left, at }],
        step: { kind: 'drain', left, serial: typeof p.serial === 'number' ? p.serial : 0 },
      };
    }

    return scene;
  },
};
