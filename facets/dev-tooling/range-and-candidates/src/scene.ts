/**
 * range-and-candidates 의 장면.
 *
 * 바탕 — 범위 문자열과 공개된 버전들 (initialData 에서 베낀다).
 * 자취 — 풀린 두 끝, 지금까지의 판정들, 뽑힌 버전.
 * 이번 걸음 — `step`.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { Verdict } from './algorithm.js';

export type RangeAndCandidatesStep =
  | { kind: 'start' }
  | { kind: 'bounds' }
  | { kind: 'judge'; index: number }
  | { kind: 'pick'; inside: number };

export type RangeAndCandidatesScene = {
  range: string;
  published: string[];
  ends: { lo: string; hi: string } | null;
  /** published 와 같은 차례. 앞에서부터 판정된 것만 있다 */
  verdicts: Verdict[];
  pick: string | null;
  step: RangeAndCandidatesStep;
};

function isVerdict(v: unknown): v is Verdict {
  return v === 'below' || v === 'in' || v === 'above';
}

function field(payload: unknown, name: string): unknown {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error(`range-and-candidates 장면: payload 가 객체가 아니다 (${name})`);
  }
  return (payload as Record<string, unknown>)[name];
}

export const rangeAndCandidatesScene: ScenePlan<RangeAndCandidatesScene> = {
  initial(initialData: unknown): RangeAndCandidatesScene {
    const range = field(initialData, 'range');
    const published = field(initialData, 'published');
    if (typeof range !== 'string') throw new Error('range-and-candidates 장면: range 가 문자열이 아니다');
    if (!Array.isArray(published) || !published.every((v) => typeof v === 'string')) {
      throw new Error('range-and-candidates 장면: published 가 문자열 배열이 아니다');
    }
    return {
      range,
      published: published.slice() as string[],
      ends: null,
      verdicts: [],
      pick: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene, event: FacetRuntimeEvent): RangeAndCandidatesScene {
    const p = event.payload;
    if (event.type === 'bounds') {
      const lo = field(p, 'lo');
      const hi = field(p, 'hi');
      if (typeof lo !== 'string' || typeof hi !== 'string') {
        throw new Error('range-and-candidates 장면: bounds 의 두 끝이 문자열이 아니다');
      }
      return { ...scene, ends: { lo, hi }, step: { kind: 'bounds' } };
    }
    if (event.type === 'judge') {
      const index = field(p, 'index');
      const verdict = field(p, 'verdict');
      if (typeof index !== 'number' || index !== scene.verdicts.length || index >= scene.published.length) {
        throw new Error(`range-and-candidates 장면: judge 차례가 어긋났다 (${String(index)})`);
      }
      if (!isVerdict(verdict)) throw new Error(`range-and-candidates 장면: 모르는 판정 ${String(verdict)}`);
      return { ...scene, verdicts: [...scene.verdicts, verdict], step: { kind: 'judge', index } };
    }
    if (event.type === 'pick') {
      const version = field(p, 'version');
      const inside = field(p, 'inside');
      if (typeof version !== 'string' || !scene.published.includes(version)) {
        throw new Error(`range-and-candidates 장면: 뽑힌 버전이 공개 목록에 없다 (${String(version)})`);
      }
      if (typeof inside !== 'number') throw new Error('range-and-candidates 장면: inside 가 수가 아니다');
      return { ...scene, pick: version, step: { kind: 'pick', inside } };
    }
    return scene;
  },
};
