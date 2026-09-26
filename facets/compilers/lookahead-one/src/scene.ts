import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { LookaheadRule } from './algorithm.js';

export interface SceneToken {
  kind: string;
  text: string;
  /** 원문 줄 (0 부터). EOF 는 -1 */
  line: number;
}

export interface ScenePick {
  nt: string;
  pos: number;
  term: string;
  rule: string;
}

export interface LookaheadOneScene {
  /** 바탕 — init 이 한 번 정한다 */
  rules: LookaheadRule[];
  source: string[];
  tokens: SceneToken[];
  /** 규칙 id → 받는 단말. init 전에는 null */
  accept: { rule: string; terms: string[] }[] | null;
  /** 자취 — 고르기마다 쌓인다 */
  picks: ScenePick[];
  /** 이번 걸음. from = 앞선 고르기의 들여다본 자리(처음이면 0) */
  step: (ScenePick & { from: number }) | null;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`lookahead-one 장면: ${what} 가 글자가 아니다`);
  return v;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`lookahead-one 장면: ${what} 가 수가 아니다`);
  return v;
}

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`lookahead-one 장면: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function list(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`lookahead-one 장면: ${what} 가 목록이 아니다`);
  return v;
}

function readRules(v: unknown): LookaheadRule[] {
  return list(v, 'rules').map((x, i) => {
    const r = rec(x, `rules[${i}]`);
    return {
      id: str(r['id'], `rules[${i}].id`),
      lhs: str(r['lhs'], `rules[${i}].lhs`),
      rhs: list(r['rhs'], `rules[${i}].rhs`).map((s, j) => str(s, `rules[${i}].rhs[${j}]`)),
    };
  });
}

export const lookaheadOneScene: ScenePlan<LookaheadOneScene> = {
  initial(initialData: unknown): LookaheadOneScene {
    const empty: LookaheadOneScene = { rules: [], source: [], tokens: [], accept: null, picks: [], step: null };
    if (typeof initialData !== 'object' || initialData === null) return empty;
    const d = initialData as Record<string, unknown>;
    if (!Array.isArray(d['rules']) || !Array.isArray(d['tokens']) || !Array.isArray(d['source'])) return empty;
    return {
      rules: readRules(d['rules']),
      source: list(d['source'], 'source').map((s, i) => str(s, `source[${i}]`)),
      tokens: list(d['tokens'], 'tokens').map((x, i) => {
        const t = rec(x, `tokens[${i}]`);
        return { kind: str(t['kind'], `tokens[${i}].kind`), text: str(t['text'], `tokens[${i}].text`), line: -1 };
      }),
      accept: null,
      picks: [],
      step: null,
    };
  },

  reduce(scene: LookaheadOneScene, event: FacetRuntimeEvent): LookaheadOneScene {
    const p = rec(event.payload, `${event.type}.payload`);
    if (event.type === 'init') {
      const tokens = list(p['tokens'], 'init.tokens').map((x, i) => {
        const t = rec(x, `init.tokens[${i}]`);
        return {
          kind: str(t['kind'], `init.tokens[${i}].kind`),
          text: str(t['text'], `init.tokens[${i}].text`),
          line: num(t['line'], `init.tokens[${i}].line`),
        };
      });
      const accept = list(p['accept'], 'init.accept').map((x, i) => {
        const a = rec(x, `init.accept[${i}]`);
        return {
          rule: str(a['rule'], `init.accept[${i}].rule`),
          terms: list(a['terms'], `init.accept[${i}].terms`).map((s, j) => str(s, `init.accept[${i}].terms[${j}]`)),
        };
      });
      return { ...scene, tokens, accept, picks: [], step: null };
    }
    if (event.type === 'pick') {
      const pick: ScenePick = {
        nt: str(p['nt'], 'pick.nt'),
        pos: num(p['pos'], 'pick.pos'),
        term: str(p['term'], 'pick.term'),
        rule: str(p['rule'], 'pick.rule'),
      };
      const before = scene.picks[scene.picks.length - 1];
      const from = before ? before.pos : 0;
      return { ...scene, picks: [...scene.picks, pick], step: { ...pick, from } };
    }
    throw new Error(`lookahead-one 장면: 모르는 이벤트 '${event.type}'`);
  },
};
