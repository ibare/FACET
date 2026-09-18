/**
 * 맞힐 수 없는 분기의 장면.
 *
 * 바탕 — `n` (결과 열의 길이)
 * 자취 — 지금까지 드러난 결과와 두 예측기의 짐작·맞음
 * 이번 걸음 — `step`
 *
 * 맞힌 비율은 자취에서 파생된다. 장면에 따로 담지 않는다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { Outcome } from './algorithm.js';

export type SceneGuess = { guess: Outcome; hit: boolean };

export type UnpredictableBranchStep =
  | { kind: 'idle' }
  | { kind: 'init' }
  | { kind: 'branch'; i: number };

export type UnpredictableBranchScene = {
  n: number;
  seen: Outcome[];
  counter: SceneGuess[];
  table: SceneGuess[];
  step: UnpredictableBranchStep;
};

function isOutcome(v: unknown): v is Outcome {
  return v === 'T' || v === 'N';
}

function readGuess(v: unknown): SceneGuess | null {
  if (typeof v !== 'object' || v === null) return null;
  const g = v as { guess?: unknown; hit?: unknown };
  if (!isOutcome(g.guess) || typeof g.hit !== 'boolean') return null;
  return { guess: g.guess, hit: g.hit };
}

function lengthOf(data: unknown): number {
  if (typeof data !== 'object' || data === null) return 0;
  const outcomes = (data as { outcomes?: unknown }).outcomes;
  return Array.isArray(outcomes) ? outcomes.length : 0;
}

export const unpredictableBranchScene: ScenePlan<UnpredictableBranchScene> = {
  initial(initialData: unknown): UnpredictableBranchScene {
    return { n: lengthOf(initialData), seen: [], counter: [], table: [], step: { kind: 'idle' } };
  },

  reduce(scene: UnpredictableBranchScene, event: FacetRuntimeEvent): UnpredictableBranchScene {
    if (event.type === 'init') {
      const p = event.payload as { n?: unknown } | undefined;
      const n = typeof p?.n === 'number' ? p.n : scene.n;
      return { n, seen: [], counter: [], table: [], step: { kind: 'init' } };
    }
    if (event.type === 'branch') {
      const p = event.payload as
        | { i?: unknown; outcome?: unknown; counter?: unknown; table?: unknown }
        | undefined;
      const counter = readGuess(p?.counter);
      const table = readGuess(p?.table);
      if (!p || typeof p.i !== 'number' || !isOutcome(p.outcome) || !counter || !table) {
        return scene;
      }
      return {
        n: scene.n,
        seen: [...scene.seen, p.outcome],
        counter: [...scene.counter, counter],
        table: [...scene.table, table],
        step: { kind: 'branch', i: p.i },
      };
    }
    return scene;
  },
};
