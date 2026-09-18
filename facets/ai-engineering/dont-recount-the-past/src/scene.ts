/**
 * 다시 세지 않기 — 장면.
 *
 * 바탕: 열 전체(`words`)와 처음 들어온 토큰 수(`promptLen`) — init 이 한 번 정한다.
 * 자취: 걸음마다 두 쪽이 셈한 자리(`recount` · `fresh`)와 지금까지 보이는 토큰 수(`shown`).
 * 이번 걸음: `step` — 막 밟은 걸음의 번호와 낸 토큰의 자리.
 *
 * 캐시가 지금 무엇을 쥐고 있는지는 `fresh` 를 이어 붙인 것이다 — 따로 두지 않는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type DontRecountThePastStep =
  | { kind: 'init' }
  | { kind: 'step'; k: number; produced: number };

export type DontRecountThePastScene = {
  /** 처음 들어온 토큰 + 이어서 낼 토큰 */
  words: string[];
  promptLen: number;
  /** 걸음 수 (= 이어서 낼 토큰 수) */
  steps: number;
  /** 화면에 나와 있는 토큰 수 */
  shown: number;
  /** 걸음마다 캐시 없는 쪽이 셈한 자리 */
  recount: number[][];
  /** 걸음마다 캐시 쪽이 셈한 자리 */
  fresh: number[][];
  step: DontRecountThePastStep | null;
};

function emptyScene(): DontRecountThePastScene {
  return { words: [], promptLen: 0, steps: 0, shown: 0, recount: [], fresh: [], step: null };
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((w): w is string => typeof w === 'string') : [];
}

function numberList(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
}

/** 캐시가 지금 쥔 자리 — 셈한 차례대로. */
export function cachedPositions(scene: DontRecountThePastScene): number[] {
  const out: number[] = [];
  for (const f of scene.fresh) out.push(...f);
  return out;
}

/** 두 쪽이 지금까지 셈한 자리 합. */
export function totals(scene: DontRecountThePastScene): { recount: number; fresh: number } {
  let recount = 0;
  let fresh = 0;
  for (const r of scene.recount) recount += r.length;
  for (const f of scene.fresh) fresh += f.length;
  return { recount, fresh };
}

export const dontRecountThePastScene: ScenePlan<DontRecountThePastScene> = {
  initial(): DontRecountThePastScene {
    return emptyScene();
  },

  reduce(scene: DontRecountThePastScene, event: FacetRuntimeEvent): DontRecountThePastScene {
    const raw = event.payload;
    const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    if (event.type === 'init') {
      const prompt = stringList(p.prompt);
      const continuation = stringList(p.continuation);
      return {
        words: [...prompt, ...continuation],
        promptLen: prompt.length,
        steps: continuation.length,
        shown: prompt.length,
        recount: [],
        fresh: [],
        step: { kind: 'init' },
      };
    }
    if (event.type === 'step') {
      const k = typeof p.k === 'number' ? p.k : scene.recount.length + 1;
      const produced = typeof p.produced === 'number' ? p.produced : scene.shown;
      return {
        ...scene,
        shown: Math.min(scene.words.length, produced + 1),
        recount: [...scene.recount, numberList(p.recount)],
        fresh: [...scene.fresh, numberList(p.fresh)],
        step: { kind: 'step', k, produced },
      };
    }
    return scene;
  },
};
