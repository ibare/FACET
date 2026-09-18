/**
 * 장면 — 틀린 짐작마다 버린 박자가 파이프라인별 더미에 쌓인다.
 *
 * 바탕(init 이 한 번 정한다): 결과 열 · 짐작 · 파이프라인 · 더미 눈금
 * 자취(걸음이 쌓는다): 분기마다 맞았는가 · 파이프라인별 버린 덩어리 · 누적 수
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { Outcome, Pipe, PipeId } from './algorithm.js';

export type MispredictionBase = {
  outcomes: Outcome[];
  guess: Outcome;
  pipes: Pipe[];
  room: { blocks: number; chunks: number };
};

export type MispredictionStep =
  | { kind: 'none' }
  | { kind: 'init' }
  | { kind: 'branch'; index: number; actual: Outcome; hit: boolean; penalty: number[] }
  | { kind: 'done'; misses: number };

export type MispredictionScene = {
  base: MispredictionBase | null;
  /** 가져온 분기마다 짐작이 맞았는가 */
  results: boolean[];
  /** 파이프라인별로, 틀릴 때마다 버린 박자 덩어리 */
  chunks: number[][];
  wasted: number[];
  cycles: number[];
  step: MispredictionStep;
};

function rec(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function outcome(v: unknown): Outcome {
  return v === 'N' ? 'N' : 'T';
}
function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.map((x) => (typeof x === 'number' ? x : 0)) : [];
}
function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}
function pipeId(v: unknown): PipeId {
  return v === 'deep' ? 'deep' : 'shallow';
}

function empty(): MispredictionScene {
  return { base: null, results: [], chunks: [], wasted: [], cycles: [], step: { kind: 'none' } };
}

export const mispredictionPenaltyScene: ScenePlan<MispredictionScene> = {
  initial(): MispredictionScene {
    return empty();
  },
  reduce(scene: MispredictionScene, event: FacetRuntimeEvent): MispredictionScene {
    const p = rec(event.payload);
    switch (event.type) {
      case 'init': {
        const pipes = (Array.isArray(p.pipes) ? p.pipes : []).map((x) => {
          const r = rec(x);
          return { id: pipeId(r.id), verdict: num(r.verdict) };
        });
        const room = rec(p.room);
        return {
          base: {
            outcomes: (Array.isArray(p.outcomes) ? p.outcomes : []).map(outcome),
            guess: outcome(p.guess),
            pipes,
            room: { blocks: num(room.blocks), chunks: num(room.chunks) },
          },
          results: [],
          chunks: pipes.map(() => []),
          wasted: pipes.map(() => 0),
          cycles: pipes.map(() => 0),
          step: { kind: 'init' },
        };
      }
      case 'branch': {
        const hit = p.hit === true;
        const penalty = nums(p.penalty);
        return {
          base: scene.base,
          results: [...scene.results, hit],
          chunks: scene.chunks.map((c, i) => (hit ? [...c] : [...c, penalty[i] ?? 0])),
          wasted: nums(p.wasted),
          cycles: nums(p.cycles),
          step: { kind: 'branch', index: num(p.index), actual: outcome(p.actual), hit, penalty },
        };
      }
      case 'done':
        return {
          base: scene.base,
          results: [...scene.results],
          chunks: scene.chunks.map((c) => [...c]),
          wasted: nums(p.wasted),
          cycles: nums(p.cycles),
          step: { kind: 'done', misses: num(p.misses) },
        };
      default:
        return scene;
    }
  },
};
