/**
 * 1비트 예측기의 장면.
 *
 * - 바탕: `outcomes` (결과 열), `start` (처음 기억) — init 이 한 번 정한다
 * - 자취: `judged` (지나간 분기마다 짐작 · 결과 · 맞음), `memory` (지금 기억), `tally`
 * - 이번 걸음: `step`
 *
 * 좌표 · 문안 · DOM 은 담지 않는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { Bit } from './algorithm.js';

export type Judged = { guess: Bit; outcome: Bit; hit: boolean };

export type OneBitStep =
  | { kind: 'idle' }
  | { kind: 'init' }
  /** `was` 는 짐작한 기억(뒤집히기 전), `flipped` 는 이 걸음에서 기억이 뒤집혔는가 */
  | { kind: 'branch'; index: number; was: Bit; flipped: boolean }
  | { kind: 'done' };

export type OneBitScene = {
  outcomes: readonly Bit[];
  start: Bit;
  memory: Bit;
  judged: readonly Judged[];
  tally: { misses: number; chained: number; total: number } | null;
  step: OneBitStep;
};

function isBit(v: unknown): v is Bit {
  return v === 'T' || v === 'N';
}

function record(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

/** 이 틀림이 바로 앞 틀림에 이어진 것인가 — 앞 분기도 틀렸으면 참 */
export function isChainedMiss(judged: readonly Judged[], i: number): boolean {
  const cur = judged[i];
  const before = judged[i - 1];
  return cur !== undefined && !cur.hit && before !== undefined && !before.hit;
}

export const oneBitDoubleFaultScene: ScenePlan<OneBitScene> = {
  initial(initialData: unknown): OneBitScene {
    const d = record(initialData);
    const outcomes = Array.isArray(d.outcomes) ? d.outcomes.filter(isBit) : [];
    const start = isBit(d.initialMemory) ? d.initialMemory : 'T';
    return {
      outcomes: [...outcomes],
      start,
      memory: start,
      judged: [],
      tally: null,
      step: { kind: 'idle' },
    };
  },

  reduce(scene: OneBitScene, event: FacetRuntimeEvent): OneBitScene {
    const p = record(event.payload);
    if (event.type === 'init') {
      const outcomes = Array.isArray(p.outcomes) ? p.outcomes.filter(isBit) : [];
      const memory = isBit(p.memory) ? p.memory : scene.start;
      return {
        outcomes: [...outcomes],
        start: memory,
        memory,
        judged: [],
        tally: null,
        step: { kind: 'init' },
      };
    }
    if (event.type === 'branch') {
      if (!isBit(p.guess) || !isBit(p.outcome) || !isBit(p.memory)) return scene;
      const index = typeof p.index === 'number' ? p.index : scene.judged.length;
      const hit = p.hit === true;
      return {
        ...scene,
        memory: p.memory,
        judged: [...scene.judged, { guess: p.guess, outcome: p.outcome, hit }],
        step: { kind: 'branch', index, was: p.guess, flipped: p.guess !== p.memory },
      };
    }
    if (event.type === 'done') {
      const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
      return {
        ...scene,
        tally: { misses: num(p.misses), chained: num(p.chained), total: num(p.total) },
        step: { kind: 'done' },
      };
    }
    return scene;
  },
};
