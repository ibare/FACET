/**
 * rule-expands 의 장면.
 *
 * 바탕 — 문법 · 토큰 열 · 목표 단말 열 · 비단말 목록 (initial 이 한 번 정한다)
 * 자취 — 지금의 문장형 한 줄 (지난 줄은 남기지 않는다)
 * 이번 걸음 — 어느 자리의 무엇을 어느 규칙으로 펼쳤는가
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowRuleExpandsData,
  nonterminalsOf,
  startSymbolOf,
  terminalOf,
  type GrammarRule,
  type Token,
} from './algorithm.js';

export type ExpandStep = {
  k: number;
  /** 펼친 자리 — 펼치기 전 문장형에서 사라진 기호의 자리이자, 몸이 들어선 첫 자리 */
  pos: number;
  ruleId: string;
  lhs: string;
  bodyLen: number;
  selfAt: number[];
};

export type RuleExpandsScene = {
  source: string;
  tokens: Token[];
  target: string[];
  rules: GrammarRule[];
  nonterminals: string[];
  form: string[];
  ntLeft: number;
  /** 다음에 펼칠 자리 (없으면 -1) */
  nextPos: number;
  step: ExpandStep | null;
};

function numberField(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`rule-expands 장면: ${key} 가 정수가 아니다`);
  return v;
}

function stringField(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== 'string' || v === '') throw new Error(`rule-expands 장면: ${key} 가 글자가 아니다`);
  return v;
}

function stringsField(p: Record<string, unknown>, key: string): string[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`rule-expands 장면: ${key} 가 목록이 아니다`);
  return v.map((s) => {
    if (typeof s !== 'string') throw new Error(`rule-expands 장면: ${key} 에 글자 아닌 것이 있다`);
    return s;
  });
}

function numbersField(p: Record<string, unknown>, key: string): number[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`rule-expands 장면: ${key} 가 목록이 아니다`);
  return v.map((n) => {
    if (typeof n !== 'number' || !Number.isInteger(n)) throw new Error(`rule-expands 장면: ${key} 에 정수 아닌 것이 있다`);
    return n;
  });
}

export const ruleExpandsScene: ScenePlan<RuleExpandsScene> = {
  initial(initialData: unknown): RuleExpandsScene {
    const data = narrowRuleExpandsData(initialData);
    const start = startSymbolOf(data.rules);
    return {
      source: data.source,
      tokens: data.tokens.map((t) => ({ ...t })),
      target: data.tokens.map(terminalOf),
      rules: data.rules.map((r) => ({ id: r.id, lhs: r.lhs, rhs: [...r.rhs] })),
      nonterminals: nonterminalsOf(data.rules),
      form: [start],
      ntLeft: 1,
      nextPos: 0,
      step: null,
    };
  },

  reduce(scene: RuleExpandsScene, event: FacetRuntimeEvent): RuleExpandsScene {
    if (event.type !== 'expand') throw new Error(`rule-expands 장면: 모르는 이벤트 ${event.type}`);
    const p = event.payload;
    if (typeof p !== 'object' || p === null || Array.isArray(p)) throw new Error('rule-expands 장면: payload 가 없다');
    const rec = p as Record<string, unknown>;
    const pos = numberField(rec, 'pos');
    const lhs = stringField(rec, 'lhs');
    const body = stringsField(rec, 'body');
    const form = stringsField(rec, 'form');
    if (scene.form[pos] !== lhs) throw new Error(`rule-expands 장면: 자리 ${pos} 에 ${lhs} 가 없다`);
    // 이벤트가 말한 줄이 지금 줄에서 이어지는지만 본다
    const joined = [...scene.form.slice(0, pos), ...body, ...scene.form.slice(pos + 1)];
    if (joined.length !== form.length || joined.some((s, i) => s !== form[i])) {
      throw new Error('rule-expands 장면: 펼친 줄이 앞 줄에서 이어지지 않는다');
    }
    return {
      ...scene,
      form,
      ntLeft: numberField(rec, 'ntLeft'),
      nextPos: numberField(rec, 'nextPos'),
      step: {
        k: numberField(rec, 'k'),
        pos,
        ruleId: stringField(rec, 'ruleId'),
        lhs,
        bodyLen: body.length,
        selfAt: numbersField(rec, 'selfAt'),
      },
    };
  },
};
