/**
 * pattern-matches-set 장면.
 *
 * 바탕 — 무늬 구조 (initial 이 initialData 에서 베낀다. 걸음 0 은 무늬만, 모임은 빈 채)
 * 자취 — 지금까지 모인 글줄과 그것을 떨군 길
 * 이번 걸음 — 방금 따라간 길 (`step`)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readPattern, type Choice, type PatternNode } from './algorithm';

export type Member = { text: string; choices: Choice[] };

export type PatternStep =
  | { kind: 'start' }
  | { kind: 'path'; index: number; text: string; choices: Choice[]; last: boolean };

export type PatternScene = {
  pattern: PatternNode | null;
  members: Member[];
  step: PatternStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readChoice(raw: unknown): Choice {
  if (!isRecord(raw)) throw new Error('path: 고른 것이 객체가 아니다');
  const at = raw['at'];
  if (typeof at !== 'string') throw new Error('path: 고른 자리가 없다');
  if (raw['kind'] === 'alt') {
    const pick = raw['pick'];
    if (typeof pick !== 'number') throw new Error(`path: ${at} 의 갈래 번호가 없다`);
    return { at, kind: 'alt', pick };
  }
  if (raw['kind'] === 'opt') {
    const take = raw['take'];
    if (typeof take !== 'boolean') throw new Error(`path: ${at} 의 있음/없음이 없다`);
    return { at, kind: 'opt', take };
  }
  throw new Error(`path: ${at} 의 모르는 갈림 ${String(raw['kind'])}`);
}

export const patternMatchesSetScene: ScenePlan<PatternScene> = {
  initial(initialData: unknown): PatternScene {
    // 초기 데이터 없이 마운트되는 전수 검사가 있다 — 무늬 없는 장면을 두고, 무늬가 있으면 좁혀 베낀다.
    const pattern = isRecord(initialData) && 'pattern' in initialData ? readPattern(initialData['pattern']) : null;
    return { pattern, members: [], step: { kind: 'start' } };
  },

  reduce(scene: PatternScene, event: FacetRuntimeEvent): PatternScene {
    if (event.type !== 'path') throw new Error(`pattern-matches-set: 모르는 이벤트 ${event.type}`);
    const p = event.payload;
    if (!isRecord(p)) throw new Error('path: payload 가 없다');
    const index = p['index'];
    const text = p['text'];
    const last = p['last'];
    const rawChoices = p['choices'];
    if (typeof index !== 'number' || typeof text !== 'string' || typeof last !== 'boolean' || !Array.isArray(rawChoices)) {
      throw new Error('path: payload 모양이 틀렸다');
    }
    const choices = rawChoices.map(readChoice);
    return {
      pattern: scene.pattern,
      members: [...scene.members.map((m) => ({ text: m.text, choices: m.choices.map((c) => ({ ...c })) })), { text, choices }],
      step: { kind: 'path', index, text, choices: choices.map((c) => ({ ...c })), last },
    };
  },
};
