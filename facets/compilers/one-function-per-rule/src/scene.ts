/**
 * one-function-per-rule 의 장면 — 이벤트를 이어 "지금 살아 있는 부름들" 과 "토큰마다 먹은 함수" 를 쌓는다.
 *
 * - 바탕: 원문 · 토큰 열 · 문법 (initialData 에서 베낀다) · 문법에서 옮긴 파서 함수 코드
 * - 자취: 부름 스택(바닥이 맨 처음 불린 것, 칸마다 그 함수가 머문 줄) · 토큰마다 먹은 비단말
 * - 이번 걸음: 부름 또는 돌아옴 하나 (지나간 줄 · 먹은 토큰)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { functionCode, narrowData, type FunctionCode, type GrammarRule, type SourceToken } from './algorithm.js';

export type Activation = {
  /** 비단말 */
  fn: string;
  /** 그 함수가 지금 머문 줄 자리 (0 = 머리 줄) */
  line: number;
};

export type OneFunctionPerRuleMove =
  | {
      kind: 'call';
      from: string | null;
      to: string;
      /** 부르는 함수 안에서 지나간 줄 — 첫 칸이 출발한 줄, 끝 칸이 부르는 줄 */
      path: number[];
      eaten: number[];
    }
  | {
      kind: 'return';
      from: string;
      to: string | null;
      /** 돌아 나오는 함수 안에서 지나간 줄 */
      path: number[];
      eaten: number[];
      /** 돌아가는 쪽이 머문 줄 — 바깥이면 null */
      site: number | null;
      eof: boolean;
    };

export type OneFunctionPerRuleScene = {
  source: string;
  tokens: SourceToken[];
  rules: GrammarRule[];
  /** 문법에서 옮긴 파서 함수 — 바탕. initial 이 한 번 짓고 무대는 그리기만 한다 */
  codes: FunctionCode[];
  stack: Activation[];
  /** 토큰마다 먹은 비단말 — 아직 안 먹혔으면 null */
  owner: (string | null)[];
  step: OneFunctionPerRuleMove | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function intList(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`one-function-per-rule 장면: ${what} 이 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 0) throw new Error(`one-function-per-rule 장면: ${what} 의 칸이 자리 수가 아니다`);
    return x;
  });
}

function nameOrNull(v: unknown, what: string): string | null {
  if (v === null) return null;
  if (typeof v !== 'string' || v === '') throw new Error(`one-function-per-rule 장면: ${what} 가 이름이 아니다`);
  return v;
}

function withOwner(owner: readonly (string | null)[], eaten: readonly number[], fn: string | null): (string | null)[] {
  const next = [...owner];
  for (const i of eaten) {
    if (fn === null) throw new Error('one-function-per-rule 장면: 바깥이 토큰을 먹었다');
    if (i >= next.length) throw new Error(`one-function-per-rule 장면: 없는 토큰 자리 ${i}`);
    if (next[i] !== null) throw new Error(`one-function-per-rule 장면: 토큰 #${i} 가 두 번 먹혔다`);
    next[i] = fn;
  }
  return next;
}

export const oneFunctionPerRuleScene: ScenePlan<OneFunctionPerRuleScene> = {
  initial(initialData: unknown): OneFunctionPerRuleScene {
    const data = narrowData(initialData);
    return {
      source: data.source,
      tokens: data.tokens.map((tk) => ({ kind: tk.kind, text: tk.text })),
      rules: data.rules.map((r) => ({ id: r.id, lhs: r.lhs, rhs: [...r.rhs] })),
      codes: functionCode(data.rules),
      stack: [],
      owner: data.tokens.map(() => null),
      step: null,
    };
  },

  reduce(scene: OneFunctionPerRuleScene, event: FacetRuntimeEvent): OneFunctionPerRuleScene {
    const p: unknown = event.payload;
    if (!isRecord(p)) throw new Error(`one-function-per-rule 장면: ${event.type} 의 payload 가 없다`);
    const path = intList(p.path, 'path');
    const eaten = intList(p.eaten, 'eaten');
    const top = scene.stack[scene.stack.length - 1] ?? null;

    if (event.type === 'call') {
      const from = nameOrNull(p.from, 'from');
      const to = nameOrNull(p.to, 'to');
      if (to === null) throw new Error('one-function-per-rule 장면: call 의 to 가 없다');
      if ((top?.fn ?? null) !== from) throw new Error(`one-function-per-rule 장면: call 의 from ${String(from)} 이 스택 꼭대기와 다르다`);
      const site = path[path.length - 1];
      if (top !== null && site === undefined) throw new Error('one-function-per-rule 장면: call 의 path 가 비었다');
      const below = scene.stack.slice(0, -1);
      const stack: Activation[] =
        top === null
          ? [{ fn: to, line: 0 }]
          : [...below.map((a) => ({ ...a })), { fn: top.fn, line: site ?? 0 }, { fn: to, line: 0 }];
      return {
        ...scene,
        stack,
        owner: withOwner(scene.owner, eaten, from),
        step: { kind: 'call', from, to, path, eaten },
      };
    }

    if (event.type === 'return') {
      const from = nameOrNull(p.from, 'from');
      const to = nameOrNull(p.to, 'to');
      if (from === null) throw new Error('one-function-per-rule 장면: return 의 from 이 없다');
      if (typeof p.eof !== 'boolean') throw new Error('one-function-per-rule 장면: return 의 eof 가 참거짓이 아니다');
      if (top === null || top.fn !== from) throw new Error(`one-function-per-rule 장면: return 의 from ${from} 이 스택 꼭대기와 다르다`);
      const stack = scene.stack.slice(0, -1).map((a) => ({ ...a }));
      const caller = stack[stack.length - 1] ?? null;
      if ((caller?.fn ?? null) !== to) throw new Error(`one-function-per-rule 장면: return 의 to ${String(to)} 이 부른 쪽과 다르다`);
      return {
        ...scene,
        stack,
        owner: withOwner(scene.owner, eaten, from),
        step: { kind: 'return', from, to, path, eaten, site: caller === null ? null : caller.line, eof: p.eof },
      };
    }

    throw new Error(`one-function-per-rule 장면: 모르는 이벤트 ${event.type}`);
  },
};
