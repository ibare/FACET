/**
 * erase-the-impossible 의 장면.
 *
 * 바탕 — 문법 · 앞 토큰 · 어휘 · 결정마다 셈한 확률(알고리즘과 같은 `decisionOf`).
 * 자취 — 지금 결정의 번호와 그 결정이 어디까지 갔는지, 지금까지 고른 토큰.
 * 이번 걸음 — `step` (흘릴 운동을 고르는 데만 쓴다).
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { decisionOf, INT_SLOT, type Decision, type EraseTheImpossibleFacetData } from './algorithm.js';

export type Phase = 'offer' | 'erased' | 'picked';

/** 문법 자리 하나 — 글자 그대로의 토큰(`text`)이거나 수 토큰 하나(`int`). */
export type GrammarCell = { int: boolean; text: string };

export type EraseBase = {
  grammar: GrammarCell[];
  prefix: string[];
  vocab: string[];
  decisions: Decision[];
};

export type EraseStep =
  | { kind: 'offer'; d: number }
  | { kind: 'erase'; d: number }
  | { kind: 'pick'; d: number; index: number };

export type EraseScene = {
  base: EraseBase | null;
  /** 지금 보이는 결정. 아직 없으면 -1. */
  d: number;
  phase: Phase | null;
  /** 결정마다 고른 어휘 번호. */
  picks: number[];
  step: EraseStep | null;
};

function isStrings(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function narrow(raw: unknown): EraseTheImpossibleFacetData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isStrings(r.grammar) || !isStrings(r.prefix) || !isStrings(r.vocab)) return null;
  if (!Array.isArray(r.logits)) return null;
  const vocabLen = r.vocab.length;
  const logits: number[][] = [];
  for (const row of r.logits) {
    if (!Array.isArray(row) || row.length !== vocabLen) return null;
    if (!row.every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
    logits.push([...(row as number[])]);
  }
  return {
    type: 'erase-the-impossible',
    grammar: [...r.grammar],
    prefix: [...r.prefix],
    vocab: [...r.vocab],
    logits,
    stepMs: typeof r.stepMs === 'number' ? r.stepMs : 0,
  };
}

function baseOf(raw: unknown): EraseBase | null {
  const data = narrow(raw);
  if (!data) return null;
  return {
    grammar: data.grammar.map((g) => (g === INT_SLOT ? { int: true, text: '' } : { int: false, text: g })),
    prefix: data.prefix,
    vocab: data.vocab,
    decisions: data.logits.map((_, d) => decisionOf(data, d)),
  };
}

function numberField(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

export const eraseTheImpossibleScene: ScenePlan<EraseScene> = {
  initial(initialData: unknown): EraseScene {
    return { base: baseOf(initialData), d: -1, phase: null, picks: [], step: null };
  },

  reduce(scene: EraseScene, event: FacetRuntimeEvent): EraseScene {
    if (!scene.base) return scene;
    const d = numberField(event.payload, 'd');
    if (d === null || d < 0 || d >= scene.base.decisions.length) return scene;
    switch (event.type) {
      case 'offer':
        return { ...scene, d, phase: 'offer', picks: scene.picks.slice(0, d), step: { kind: 'offer', d } };
      case 'erase':
        return { ...scene, d, phase: 'erased', picks: scene.picks.slice(0, d), step: { kind: 'erase', d } };
      case 'pick': {
        const index = numberField(event.payload, 'index');
        if (index === null || index < 0 || index >= scene.base.vocab.length) return scene;
        const picks = scene.picks.slice(0, d);
        picks[d] = index;
        return { ...scene, d, phase: 'picked', picks, step: { kind: 'pick', d, index } };
      }
      default:
        return scene;
    }
  },
};
