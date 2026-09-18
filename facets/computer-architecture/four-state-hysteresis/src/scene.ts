/**
 * 네 칸을 오간다 — 장면.
 *
 * 바탕   outcomes · start · startGuess (init 이 한 번 정한다)
 * 자취   marks (분기마다 하나씩 쌓인다) · tally (done 이 채운다)
 * 이번 걸음  step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type Guess = 'T' | 'N';

export interface BranchMark {
  outcome: Guess;
  from: number;
  to: number;
  /** from 에서 낸 짐작. */
  guess: Guess;
  /** to 에서 낼 다음 짐작. */
  next: Guess;
  hit: boolean;
}

export type HysteresisStep =
  | { kind: 'init' }
  | { kind: 'branch'; i: number }
  | { kind: 'done' }
  | null;

export interface FourStateHysteresisScene {
  outcomes: Guess[];
  start: number;
  startGuess: Guess;
  marks: BranchMark[];
  tally: { hits: number; misses: number } | null;
  step: HysteresisStep;
}

function asGuess(v: unknown): Guess {
  return v === 'N' ? 'N' : 'T';
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export const fourStateHysteresisScene: ScenePlan<FourStateHysteresisScene> = {
  initial() {
    return { outcomes: [], start: 0, startGuess: 'N', marks: [], tally: null, step: null };
  },
  reduce(scene, event: FacetRuntimeEvent) {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    if (event.type === 'init') {
      const raw = Array.isArray(p.outcomes) ? p.outcomes : [];
      return {
        outcomes: raw.map(asGuess),
        start: num(p.start),
        startGuess: asGuess(p.guess),
        marks: [],
        tally: null,
        step: { kind: 'init' },
      };
    }
    if (event.type === 'branch') {
      const mark: BranchMark = {
        outcome: asGuess(p.outcome),
        from: num(p.from),
        to: num(p.to),
        guess: asGuess(p.guess),
        next: asGuess(p.next),
        hit: p.hit === true,
      };
      return {
        ...scene,
        marks: [...scene.marks, mark],
        step: { kind: 'branch', i: num(p.i) },
      };
    }
    if (event.type === 'done') {
      return {
        ...scene,
        marks: [...scene.marks],
        tally: { hits: num(p.hits), misses: num(p.misses) },
        step: { kind: 'done' },
      };
    }
    return scene;
  },
};
