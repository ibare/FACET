/**
 * budget-runs-out 의 장면.
 *
 * 바탕(init 이 한 번 정한다) — 창 · 답 몫 · 지시문 · 질문 · 조각과 그 토큰 수.
 * 자취(걸음이 쌓는다) — 앉았는가 · 들어간 등수 · 밖에 남은 등수 · 셈했는가.
 * 이번 걸음 — `step`.
 *
 * 쓴 몫 · 남은 몫 · 다 담는 데 드는 몫은 자취에서 파생한다 (`budgetView`).
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { chunkBudget, countTokens } from './algorithm.js';

export type BudgetPart = { text: string; tokens: number };
export type BudgetChunkPart = { id: string; rank: number; text: string; tokens: number };

export type BudgetBase = {
  window: number;
  answer: number;
  instruction: BudgetPart;
  question: BudgetPart;
  chunks: BudgetChunkPart[];
  budget: number;
};

export type BudgetStep =
  | { kind: 'init' }
  | { kind: 'seat' }
  | { kind: 'admit'; rank: number }
  | { kind: 'reject'; rank: number }
  | { kind: 'tally' };

export type BudgetScene = {
  base: BudgetBase | null;
  seated: boolean;
  /** 들어간 등수, 들어간 순서 */
  admitted: number[];
  /** 밖에 남은 등수 — 있으면 거기서 멈췄다 */
  rejected: number | null;
  tallied: boolean;
  step: BudgetStep | null;
};

/** 자취에서 파생하는 수. 그림도 이것만 부른다. */
export function budgetView(scene: BudgetScene): {
  used: number;
  left: number;
  need: number;
  kept: number;
  total: number;
} {
  const base = scene.base;
  if (base === null) return { used: 0, left: 0, need: 0, kept: 0, total: 0 };
  let used = 0;
  for (const r of scene.admitted) used += base.chunks[r - 1]?.tokens ?? 0;
  let need = 0;
  for (const c of base.chunks) need += c.tokens;
  return { used, left: base.budget - used, need, kept: scene.admitted.length, total: base.chunks.length };
}

function empty(): BudgetScene {
  return { base: null, seated: false, admitted: [], rejected: null, tallied: false, step: null };
}

function asRank(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const r = (payload as { rank?: unknown }).rank;
  return typeof r === 'number' && Number.isInteger(r) && r >= 1 ? r : null;
}

function asBase(payload: unknown): BudgetBase | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.window !== 'number' || typeof p.answer !== 'number') return null;
  if (typeof p.instruction !== 'string' || typeof p.question !== 'string') return null;
  if (!Array.isArray(p.chunks)) return null;
  const chunks: BudgetChunkPart[] = [];
  for (const [i, raw] of p.chunks.entries()) {
    if (typeof raw !== 'object' || raw === null) return null;
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== 'string' || typeof c.text !== 'string') return null;
    chunks.push({ id: c.id, rank: i + 1, text: c.text, tokens: countTokens(c.text) });
  }
  return {
    window: p.window,
    answer: p.answer,
    instruction: { text: p.instruction, tokens: countTokens(p.instruction) },
    question: { text: p.question, tokens: countTokens(p.question) },
    chunks,
    budget: chunkBudget(p.window, p.answer, p.instruction, p.question),
  };
}

export const budgetRunsOutScene: ScenePlan<BudgetScene> = {
  initial(): BudgetScene {
    return empty();
  },
  reduce(scene: BudgetScene, event: FacetRuntimeEvent): BudgetScene {
    switch (event.type) {
      case 'init': {
        const base = asBase(event.payload);
        if (base === null) return scene;
        return { ...empty(), base, step: { kind: 'init' } };
      }
      case 'seat':
        return { ...scene, admitted: [...scene.admitted], seated: true, step: { kind: 'seat' } };
      case 'admit': {
        const rank = asRank(event.payload);
        if (rank === null) return scene;
        return { ...scene, admitted: [...scene.admitted, rank], step: { kind: 'admit', rank } };
      }
      case 'reject': {
        const rank = asRank(event.payload);
        if (rank === null) return scene;
        return { ...scene, admitted: [...scene.admitted], rejected: rank, step: { kind: 'reject', rank } };
      }
      case 'tally':
        return { ...scene, admitted: [...scene.admitted], tallied: true, step: { kind: 'tally' } };
      default:
        return scene;
    }
  },
};
