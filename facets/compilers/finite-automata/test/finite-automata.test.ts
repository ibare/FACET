/**
 * finite-automata 고유의 주장 — IR ↔ algorithm 전 조합 · 사양 실측표 · 번호 섞기 · 사다리 · 회차별 계기와 걸음 수.
 * 공통분(손잡이 닿음 · 덮이는 phase · 계기 누적 · transpiler)은 whole-check 가 잰다.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import type { FacetRuntimeEvent } from '@ffacet/core';
import {
  finiteAutomataAlgorithm,
  finiteAutomataFacet,
  finiteAutomataImperativeIR,
  nodeText,
  patternPieces,
  solve,
  type FiniteAutomataData,
} from '../src/index.js';

const data = finiteAutomataFacet.initialData as unknown as FiniteAutomataData;

/** 사양 실측표 (sim `finite-automata`) */
const TABLE: Record<number, { pattern: string; nfa: number; nfaEdges: number; dfa: number; dfaEdges: number; acc: number; layers: number; fresh: number[] }> = {
  1: { pattern: '(a|b)*a', nfa: 2, nfaEdges: 3, dfa: 2, dfaEdges: 4, acc: 1, layers: 3, fresh: [1, 1, 0] },
  2: { pattern: '(a|b)*a(a|b)', nfa: 3, nfaEdges: 5, dfa: 4, dfaEdges: 8, acc: 2, layers: 4, fresh: [1, 1, 2, 0] },
  3: { pattern: '(a|b)*a(a|b)(a|b)', nfa: 4, nfaEdges: 7, dfa: 8, dfaEdges: 16, acc: 4, layers: 5, fresh: [1, 1, 2, 4, 0] },
  4: { pattern: '(a|b)*a(a|b)(a|b)(a|b)', nfa: 5, nfaEdges: 9, dfa: 16, dfaEdges: 32, acc: 8, layers: 6, fresh: [1, 1, 2, 4, 8, 0] },
};

/** 판정 (멈춘 덩이) — [입력 번호][k − 1] */
const VERDICT: [boolean, number][][] = [
  [[false, 0], [true, 3], [false, 3], [false, 3]],
  [[false, 0], [true, 3], [false, 3], [true, 13]],
  [[false, 0], [true, 3], [false, 3], [false, 3]],
  [[true, 1], [false, 1], [false, 1], [true, 14]],
];

/** 걸은 길 몇 — sim 출력 그대로 */
const PATHS: Record<string, string> = {
  'abbab:2': 'D0{0} → D1{0, 1} → D3{0, 2} → D0{0} → D1{0, 1} → D3{0, 2}',
  'abbab:4': 'D0{0} → D1{0, 1} → D3{0, 2} → D7{0, 3} → D14{0, 1, 4} → D3{0, 2}',
  'aabba:4': 'D0{0} → D1{0, 1} → D2{0, 1, 2} → D5{0, 2, 3} → D11{0, 3, 4} → D14{0, 1, 4}',
  'abab:3': 'D0{0} → D1{0, 1} → D3{0, 2} → D6{0, 1, 3} → D3{0, 2}',
};

/** 판 걸음 (지음 / 입력만) — [입력 번호][k − 1] */
const ROUND_STEPS: [number, number][][] = [
  [[7, 4], [8, 4], [9, 4], [10, 4]],
  [[9, 6], [10, 6], [11, 6], [12, 6]],
  [[10, 7], [11, 7], [12, 7], [13, 7]],
  [[10, 7], [11, 7], [12, 7], [13, 7]],
];

function knob(action: string): number[] {
  const bar = finiteAutomataFacet.blocks.controls as { controls: { widget?: string; action?: string; segments?: { value: number }[] }[] };
  const c = bar.controls.find((x) => x.widget === 'segmented-slider' && x.action === action);
  if (!c?.segments) throw new Error(`손잡이 ${action} 가 없다`);
  return c.segments.map((s) => s.value);
}

function irAccepts(delta: number[], accepting: number[], word: number[]): { ok: number; path: number[] } {
  const path = new Array<number>(word.length + 1).fill(-1);
  const ok = runIR(finiteAutomataImperativeIR, 'accepts', [delta, accepting, word, path]);
  if (typeof ok !== 'number') throw new Error('IR 답이 수가 아니다');
  return { ok, path };
}

/** 식까지 적힌 난수 — 선형 합동 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('finite-automata', () => {
  it('사다리가 segments 와 같고 데이터 끝값이 사양과 같다', () => {
    expect(knob('fromEnd')).toEqual(data.fromEndLadder);
    expect(knob('word')).toEqual(data.wordLadder);
    expect(data.fromEndLadder).toEqual([1, 2, 3, 4]);
    expect(data.words).toEqual(['ab', 'abab', 'abbab', 'aabba']);
    expect(data.fromEnd).toBe(2);
    expect(data.words[data.word]).toBe('abbab');
  });

  it('k 마다 무늬 · NFA · DFA 의 수가 사양 실측표와 같다', () => {
    for (const k of data.fromEndLadder) {
      const row = TABLE[k]!;
      const s = solve(data, k, 0);
      expect(patternPieces(data.nfaRule, k).join('')).toBe(row.pattern);
      expect(s.nfa.states).toBe(row.nfa);
      expect(s.nfa.edges.length).toBe(row.nfaEdges);
      expect(s.dfa.nodes.length).toBe(row.dfa);
      expect(s.dfa.nodes.length).toBe(2 ** k);
      expect(s.dfa.delta.length).toBe(row.dfaEdges);
      expect(s.dfa.accepting.filter((x) => x === 1).length).toBe(row.acc);
      expect(s.dfa.layers.length).toBe(k + 2);
      expect(s.dfa.layers.length).toBe(row.layers);
      expect(s.dfa.layers.map((l) => l.fresh.length)).toEqual(row.fresh);
    }
  });

  it('k 를 올려도 앞 판의 덩이는 같은 번호 · 같은 모임이다', () => {
    for (const k of [1, 2, 3]) {
      const a = solve(data, k, 0).dfa.nodes;
      const b = solve(data, k + 1, 0).dfa.nodes;
      for (const n of a) {
        expect(b[n.id]!.set).toEqual(n.set);
        expect([b[n.id]!.layer, b[n.id]!.slot, b[n.id]!.slots]).toEqual([n.layer, n.slot, n.slots]);
      }
    }
    expect(solve(data, 4, 0).dfa.nodes.map((n) => nodeText(n.id, n.set)).slice(0, 8)).toEqual([
      'D0 {0}', 'D1 {0, 1}', 'D2 {0, 1, 2}', 'D3 {0, 2}', 'D4 {0, 1, 2, 3}', 'D5 {0, 2, 3}', 'D6 {0, 1, 3}', 'D7 {0, 3}',
    ]);
  });

  it('IR 의 답이 열여섯 조합 모두에서 algorithm 과 · 사양 판정표와 같다', () => {
    for (const w of data.wordLadder) {
      for (const k of data.fromEndLadder) {
        const s = solve(data, k, w);
        const ir = irAccepts(s.dfa.delta, s.dfa.accepting, s.word);
        expect(ir.ok).toBe(s.accepted);
        expect(ir.path).toEqual(s.path);
        expect(ir.path.length).toBe(s.text.length + 1);
        const [accepted, stop] = VERDICT[w]![k - 1]!;
        expect(s.accepted === 1).toBe(accepted);
        expect(s.stop).toBe(stop);
        // 교과서 판정: 끝에서 k 째 글자가 a
        expect(s.accepted === 1).toBe(s.text.length >= k && s.text[s.text.length - k] === 'a');
        const key = `${s.text}:${k}`;
        if (PATHS[key]) {
          expect(s.path.map((d) => `D${d}${nodeText(d, s.dfa.nodes[d]!.set).slice(`D${d} `.length)}`).join(' → ')).toBe(PATHS[key]);
        }
      }
    }
  });

  it('DFA 번호를 섞어도 (0 은 시작이라 둔다) IR 의 판정과 걸은 덩이가 같다', () => {
    const rnd = lcg(11);
    for (let trial = 0; trial < 30; trial += 1) {
      for (const k of data.fromEndLadder) {
        const s0 = solve(data, k, 0);
        const m = s0.dfa.nodes.length;
        const rest = Array.from({ length: m - 1 }, (_, i) => i + 1);
        for (let i = rest.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rnd() * (i + 1));
          [rest[i], rest[j]] = [rest[j]!, rest[i]!];
        }
        const perm = [0, ...rest]; // 옛 번호 → 새 번호
        const inv = new Array<number>(m);
        perm.forEach((nw, old) => (inv[nw] = old));
        const delta: number[] = [];
        for (let sNew = 0; sNew < m; sNew += 1) {
          for (let c = 0; c < 2; c += 1) delta.push(perm[s0.dfa.delta[inv[sNew]! * 2 + c]!]!);
        }
        const accepting = Array.from({ length: m }, (_, sNew) => s0.dfa.accepting[inv[sNew]!]!);
        for (const w of data.wordLadder) {
          const s = solve(data, k, w);
          const base = irAccepts(s.dfa.delta, s.dfa.accepting, s.word);
          const mixed = irAccepts(delta, accepting, s.word);
          expect(mixed.ok).toBe(base.ok);
          expect(mixed.path.map((x) => s.dfa.nodes[inv[x]!]!.set)).toEqual(base.path.map((x) => s.dfa.nodes[x]!.set));
        }
      }
    }
  });

  it('회차마다 계기와 걸음 수가 사양과 같다 — k 2 → 4 → 2 → 입력 ab → k 3', async () => {
    const inputs = [
      { type: 'fromEnd', payload: { value: 4 } },
      { type: 'fromEnd', payload: { value: 2 } },
      { type: 'word', payload: { value: 0 } },
      { type: 'fromEnd', payload: { value: 3 } },
      { type: 'word', payload: { value: 2 } },
    ];
    const totals = new Map<string, number>();
    const rounds: { metrics: Record<string, number>; steps: number; types: string[] }[] = [];
    let sleeps = 0;
    let types: string[] = [];
    let cancelled = false;
    let idle!: () => void;
    const done = new Promise<void>((r) => (idle = r));
    const ctx = {
      data: JSON.parse(JSON.stringify(finiteAutomataFacet.initialData)) as FiniteAutomataData,
      get cancelled() {
        return cancelled;
      },
      metric(name: string, delta: number | 'inc') {
        totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
      },
      async emit(e: FacetRuntimeEvent) {
        if (e.type !== 'phase') types.push(e.type);
      },
      async sleep() {
        sleeps += 1;
        return true;
      },
      async waitForInput() {
        rounds.push({ metrics: Object.fromEntries(totals), steps: sleeps + 1, types });
        sleeps = 0;
        types = [];
        const next = inputs.shift();
        if (!next) {
          idle();
          return new Promise<never>(() => {});
        }
        return next;
      },
      pollInput() {
        return null;
      },
    };
    await Promise.race([finiteAutomataAlgorithm(ctx as never), done]);
    cancelled = true;

    const expectRound = (i: number, k: number, w: number, rebuild: boolean) => {
      const r = rounds[i]!;
      expect(r.metrics).toEqual({ 'nfa-states': TABLE[k]!.nfa, 'dfa-states': TABLE[k]!.dfa, 'walk-steps': data.words[w]!.length });
      expect(r.steps).toBe(ROUND_STEPS[w]![k - 1]![rebuild ? 0 : 1]);
      expect(r.types.includes('layer')).toBe(rebuild);
    };
    expect(rounds.length).toBe(6);
    expectRound(0, 2, 2, true); // 기본 판 11 걸음
    expect(rounds[0]!.steps).toBe(11);
    expectRound(1, 4, 2, true);
    expectRound(2, 2, 2, true);
    expectRound(3, 2, 0, false); // 입력만 — 구성을 건너뛴다
    expectRound(4, 3, 0, true);
    expectRound(5, 3, 2, false);
  });
});
