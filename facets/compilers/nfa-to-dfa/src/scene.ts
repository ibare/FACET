/**
 * nfa-to-dfa 장면.
 *
 * - 바탕: NFA 와 규칙 열 (initial 이 initialData 에서 베낀다 — 걸음 0 은 NFA 만 있는 화면)
 * - 자취: 선 DFA 자리들(덩이)과 옮김들
 * - 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowNfaToDfaData, type Nfa, type NfaRule } from './algorithm.js';

export type DState = {
  id: number;
  /** 품은 NFA 자리 (작은 수부터) */
  set: number[];
  kinds: string[];
  accept: string | null;
  /** 이 덩이를 처음 세운 덩이 — D0 은 null */
  parent: number | null;
};

export type DArc = { from: number; to: number; ch: string };

export type NfaToDfaStep =
  | { kind: 'start' }
  | { kind: 'open'; d: number; seed: number[]; added: number[]; set: number[]; edges: number[] }
  | {
      kind: 'move';
      from: number;
      /** 출발 덩이가 품은 NFA 자리 */
      source: number[];
      ch: string;
      moved: number[];
      added: number[];
      set: number[];
      /** 탄 NFA 옮김의 번호 (`nfa.edges` 의 자리) */
      edges: number[];
      to: number;
      fresh: boolean;
    };

export type NfaToDfaScene = {
  nfa: Nfa;
  rules: NfaRule[];
  dstates: DState[];
  arcs: DArc[];
  /** 이 걸음 뒤 아직 글자를 다 보지 않은 덩이 (번호 차례) — 알고리즘이 셈해 보낸다 */
  todo: number[];
  step: NfaToDfaStep;
};

function rec(x: unknown, type: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new Error(`nfa-to-dfa 장면: ${type} payload 가 객체가 아니다`);
  return x as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`nfa-to-dfa 장면: payload.${key} 가 수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`nfa-to-dfa 장면: payload.${key} 가 글자가 아니다`);
  return v;
}

function bool(p: Record<string, unknown>, key: string): boolean {
  const v = p[key];
  if (typeof v !== 'boolean') throw new Error(`nfa-to-dfa 장면: payload.${key} 가 참거짓이 아니다`);
  return v;
}

function nums(p: Record<string, unknown>, key: string): number[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`nfa-to-dfa 장면: payload.${key} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number') throw new Error(`nfa-to-dfa 장면: payload.${key} 에 수 아닌 것이 있다`);
    return x;
  });
}

function strs(p: Record<string, unknown>, key: string): string[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`nfa-to-dfa 장면: payload.${key} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`nfa-to-dfa 장면: payload.${key} 에 글자 아닌 것이 있다`);
    return x;
  });
}

function acceptField(p: Record<string, unknown>): string | null {
  const v = p.accept;
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error('nfa-to-dfa 장면: payload.accept 가 글자도 null 도 아니다');
  return v;
}

export const nfaToDfaScene: ScenePlan<NfaToDfaScene> = {
  initial(initialData: unknown): NfaToDfaScene {
    const data = narrowNfaToDfaData(initialData);
    return { nfa: data.nfa, rules: data.rules, dstates: [], arcs: [], todo: [], step: { kind: 'start' } };
  },

  reduce(scene: NfaToDfaScene, event: FacetRuntimeEvent): NfaToDfaScene {
    if (event.type === 'open') {
      const p = rec(event.payload, 'open');
      const d = num(p, 'd');
      if (d !== scene.dstates.length) throw new Error(`nfa-to-dfa 장면: open 의 번호 ${d} 가 다음 번호가 아니다`);
      const set = nums(p, 'set');
      const dstate: DState = { id: d, set, kinds: strs(p, 'kinds'), accept: acceptField(p), parent: null };
      return {
        ...scene,
        dstates: [...scene.dstates, dstate],
        todo: nums(p, 'todo'),
        step: { kind: 'open', d, seed: nums(p, 'seed'), added: nums(p, 'added'), set: [...set], edges: nums(p, 'edges') },
      };
    }
    if (event.type === 'move') {
      const p = rec(event.payload, 'move');
      const from = num(p, 'from');
      const to = num(p, 'to');
      const fresh = bool(p, 'fresh');
      const set = nums(p, 'set');
      if (!scene.dstates.some((d) => d.id === from)) throw new Error(`nfa-to-dfa 장면: 옮김의 출발 D${from} 가 아직 없다`);
      let dstates = scene.dstates;
      if (fresh) {
        if (to !== scene.dstates.length) throw new Error(`nfa-to-dfa 장면: 새 덩이 번호 ${to} 가 다음 번호가 아니다`);
        dstates = [...scene.dstates, { id: to, set, kinds: strs(p, 'kinds'), accept: acceptField(p), parent: from }];
      } else if (!scene.dstates.some((d) => d.id === to)) {
        throw new Error(`nfa-to-dfa 장면: 이미 있다는 D${to} 가 없다`);
      }
      const ch = str(p, 'ch');
      return {
        ...scene,
        dstates,
        arcs: [...scene.arcs, { from, to, ch }],
        todo: nums(p, 'todo'),
        step: {
          kind: 'move',
          from,
          source: nums(p, 'source'),
          ch,
          moved: nums(p, 'moved'),
          added: nums(p, 'added'),
          set: [...set],
          edges: nums(p, 'edges'),
          to,
          fresh,
        },
      };
    }
    throw new Error(`nfa-to-dfa 장면: 모르는 이벤트 ${event.type}`);
  },
};
