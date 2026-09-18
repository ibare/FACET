/**
 * draft-then-verify 장면.
 *
 * 바탕: 처음 문장과 판마다의 초안 · 큰 모형 토큰, 그리고 거기서 결정되는 판정(`judgeRound`).
 * 자취: 지금까지 붙은 문장(낱말마다 어디서 왔는지)과 셈 — 큰 모형 부름 · 초안 수 · 받은 수.
 * 이번 걸음: `step` — 그림이 무엇을 흘릴지 고르는 데 쓴다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 탐욕 판정의 결과 — 바탕에서 결정된다. */
export type Verdict = {
  /** 앞에서부터 이어서 맞은 초안 수 */
  accepted: number;
  /** 초안을 모두 받아 큰 모형의 다음 토큰(덤)이 붙는가 */
  bonus: boolean;
  /** 이 판에 문장에 붙는 토큰 — 받은 초안 + 큰 모형 토큰 하나 */
  tokens: { word: string; origin: 'draft' | 'large' }[];
};

export type SceneRound = {
  draft: string[];
  picks: string[];
  verdict: Verdict;
};

export type Origin = 'prompt' | 'draft' | 'large';

export type SentenceWord = {
  word: string;
  origin: Origin;
  /** 붙은 판 (처음 문장은 -1) */
  round: number;
};

export type DraftThenVerifyStep =
  | { kind: 'draft'; round: number }
  | { kind: 'verify'; round: number }
  | { kind: 'commit'; round: number; from: number };

export type DraftThenVerifyScene = {
  prompt: string[];
  rounds: SceneRound[];
  /** 지금 판 (아직 없으면 -1) */
  current: number;
  /** 지금 판이 어디까지 왔는가 */
  phase: 'start' | 'drafted' | 'verified' | 'committed';
  sentence: SentenceWord[];
  calls: number;
  drafted: number;
  accepted: number;
  step: DraftThenVerifyStep | null;
};

/**
 * 탐욕 판정: 앞에서부터 초안과 큰 모형의 토큰이 같으면 받고, 처음 다른 자리에서 멈춘다.
 * 붙는 것은 받은 초안과 그 자리(모두 받았으면 그다음 자리)의 큰 모형 토큰 하나.
 */
export function judgeRound(draft: readonly string[], picks: readonly string[]): Verdict {
  let accepted = 0;
  while (accepted < draft.length && accepted < picks.length && draft[accepted] === picks[accepted]) {
    accepted += 1;
  }
  const tokens: Verdict['tokens'] = draft
    .slice(0, accepted)
    .map((word) => ({ word, origin: 'draft' as const }));
  const next = picks[accepted];
  if (next !== undefined) tokens.push({ word: next, origin: 'large' });
  return { accepted, bonus: accepted === draft.length, tokens };
}

function words(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((w): w is string => typeof w === 'string') : [];
}

function readRounds(v: unknown): SceneRound[] {
  if (!Array.isArray(v)) return [];
  const out: SceneRound[] = [];
  for (const r of v) {
    if (typeof r !== 'object' || r === null) continue;
    const rec = r as Record<string, unknown>;
    const draft = words(rec.draft);
    const picks = words(rec.picks);
    out.push({ draft, picks, verdict: judgeRound(draft, picks) });
  }
  return out;
}

function roundOf(event: FacetRuntimeEvent): number {
  const p = event.payload;
  if (typeof p === 'object' && p !== null) {
    const r = (p as Record<string, unknown>).round;
    if (typeof r === 'number') return r;
  }
  return -1;
}

export const draftThenVerifyScene: ScenePlan<DraftThenVerifyScene> = {
  initial(initialData: unknown): DraftThenVerifyScene {
    const data =
      typeof initialData === 'object' && initialData !== null
        ? (initialData as Record<string, unknown>)
        : {};
    const prompt = words(data.prompt);
    return {
      prompt,
      rounds: readRounds(data.rounds),
      current: -1,
      phase: 'start',
      sentence: prompt.map((word) => ({ word, origin: 'prompt' as const, round: -1 })),
      calls: 0,
      drafted: 0,
      accepted: 0,
      step: null,
    };
  },

  reduce(scene: DraftThenVerifyScene, event: FacetRuntimeEvent): DraftThenVerifyScene {
    const round = roundOf(event);
    const base = scene.rounds[round];
    if (!base) return scene;
    switch (event.type) {
      case 'draft':
        return {
          ...scene,
          current: round,
          phase: 'drafted',
          drafted: scene.drafted + base.draft.length,
          step: { kind: 'draft', round },
        };
      case 'verify':
        return {
          ...scene,
          current: round,
          phase: 'verified',
          calls: scene.calls + 1,
          accepted: scene.accepted + base.verdict.accepted,
          step: { kind: 'verify', round },
        };
      case 'commit':
        return {
          ...scene,
          current: round,
          phase: 'committed',
          sentence: [
            ...scene.sentence,
            ...base.verdict.tokens.map((t) => ({ word: t.word, origin: t.origin, round })),
          ],
          step: { kind: 'commit', round, from: scene.sentence.length },
        };
      default:
        return scene;
    }
  },
};
