/**
 * slow-start 장면 — 이벤트를 잇기만 한다. 창의 셈은 알고리즘이 한다.
 *
 * - 바탕: 처음 창 · 문턱 · 가장 넓은 창(`init` 이 갈아 끼운다)
 * - 자취: 지나간 왕복들 — 머리의 창 · 뒤의 창 · 확인마다의 늘어남
 * - 이번 걸음: 처음이거나, 몇째 왕복인가
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export interface SlowStartRound {
  round: number;
  window: number;
  next: number;
  sent: number;
  /** 확인마다 1 (창 + 1) 또는 0 (창 + 1/window) */
  grows: readonly number[];
}

export type SlowStartStep = { kind: 'start' } | { kind: 'round'; round: number };

export interface SlowStartScene {
  first: number;
  ssthresh: number;
  /** 보일 왕복 수 — 줄의 수를 처음부터 정한다 */
  planned: number;
  widest: number;
  rounds: readonly SlowStartRound[];
  step: SlowStartStep;
}

function readInt(src: Record<string, unknown>, key: string): number {
  const v = src[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new Error(`slow-start 장면: initialData.${key} 는 1 이상의 정수여야 한다 — 받은 값 ${String(v)}`);
  }
  return v;
}

function readRound(p: unknown): SlowStartRound {
  if (typeof p !== 'object' || p === null) throw new Error('slow-start 장면: round payload 가 객체가 아니다');
  const o = p as Record<string, unknown>;
  const { round, window, next, sent, grows } = o;
  if (
    typeof round !== 'number' ||
    typeof window !== 'number' ||
    typeof next !== 'number' ||
    typeof sent !== 'number' ||
    !Array.isArray(grows) ||
    grows.length !== window ||
    !grows.every((g) => g === 0 || g === 1)
  ) {
    throw new Error('slow-start 장면: round payload 의 모양이 다르다');
  }
  return { round, window, next, sent, grows: grows.slice() as number[] };
}

export const slowStartScene: ScenePlan<SlowStartScene> = {
  initial(initialData: unknown): SlowStartScene {
    if (typeof initialData !== 'object' || initialData === null) {
      throw new Error('slow-start 장면: initialData 가 객체가 아니다');
    }
    const src = initialData as Record<string, unknown>;
    const first = readInt(src, 'window');
    const ssthresh = readInt(src, 'ssthresh');
    const planned = readInt(src, 'rounds');
    return {
      first,
      ssthresh,
      planned,
      widest: Math.max(first, ssthresh),
      rounds: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: SlowStartScene, event: FacetRuntimeEvent): SlowStartScene {
    if (event.type === 'init') {
      const p = event.payload;
      if (typeof p !== 'object' || p === null) throw new Error('slow-start 장면: init payload 가 객체가 아니다');
      const widest = (p as Record<string, unknown>).widest;
      if (typeof widest !== 'number' || !Number.isInteger(widest) || widest < 1) {
        throw new Error(`slow-start 장면: init payload 의 widest 가 1 이상의 정수가 아니다 — 받은 값 ${String(widest)}`);
      }
      return { ...scene, widest };
    }
    if (event.type === 'round') {
      const r = readRound(event.payload);
      return { ...scene, rounds: [...scene.rounds, r], step: { kind: 'round', round: r.round } };
    }
    return scene;
  },
};
