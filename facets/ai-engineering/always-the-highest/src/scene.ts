/**
 * 언제나 1등만 — 장면.
 *
 * 바탕은 없다 (문장은 프롬프트부터 걸음이 쌓는다).
 * 자취: `sentence` — 놓인 토큰과 그 토큰을 고른 사정(프롬프트는 null).
 * 이번 걸음: `step` — 무엇이 막 일어났는가. 좌표 · 문안 · DOM 은 담지 않는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type AlwaysTheHighestPick = {
  prev: string;
  p: number;
  second: string;
  secondP: number;
  /** 이 토큰이 문장에 처음 있던 자리. 처음 온 토큰이면 -1 */
  firstAt: number;
};

export type AlwaysTheHighestEntry = {
  token: string;
  /** 프롬프트는 null */
  pick: AlwaysTheHighestPick | null;
};

export type AlwaysTheHighestStep =
  | { kind: 'blank' }
  | { kind: 'prompt' }
  | { kind: 'pick'; at: number }
  | { kind: 'done'; made: number; loopStart: number; loopEnd: number; rounds: number };

export type AlwaysTheHighestScene = {
  sentence: AlwaysTheHighestEntry[];
  step: AlwaysTheHighestStep;
};

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export const alwaysTheHighestScene: ScenePlan<AlwaysTheHighestScene> = {
  initial(): AlwaysTheHighestScene {
    return { sentence: [], step: { kind: 'blank' } };
  },

  reduce(scene: AlwaysTheHighestScene, event: FacetRuntimeEvent): AlwaysTheHighestScene {
    const pl = (event.payload ?? {}) as Record<string, unknown>;
    switch (event.type) {
      case 'prompt':
        return {
          sentence: [{ token: str(pl.token), pick: null }],
          step: { kind: 'prompt' },
        };
      case 'pick': {
        const entry: AlwaysTheHighestEntry = {
          token: str(pl.token),
          pick: {
            prev: str(pl.prev),
            p: num(pl.p, 0),
            second: str(pl.second),
            secondP: num(pl.secondP, 0),
            firstAt: num(pl.firstAt, -1),
          },
        };
        const sentence = [...scene.sentence, entry];
        return { sentence, step: { kind: 'pick', at: sentence.length - 1 } };
      }
      case 'done':
        return {
          sentence: scene.sentence,
          step: {
            kind: 'done',
            made: num(pl.made, 0),
            loopStart: num(pl.loopStart, -1),
            loopEnd: num(pl.loopEnd, -1),
            rounds: num(pl.rounds, 0),
          },
        };
      default:
        return { ...scene };
    }
  },
};
