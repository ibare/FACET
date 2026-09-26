/**
 * regex-backtracking 고유의 주장 — 사양 표 대조 · IR ↔ algorithm 전 조합 · 명령 차례 섞기 · 회차별 계기.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import type { FacetContext } from '@ffacet/core/runtime';
import {
  OP_CHAR,
  OP_JMP,
  OP_SPLIT,
  compilePattern,
  encodeText,
  ladderScale,
  matchAll,
  regexBacktrackingAlgorithm,
  runBoard,
  showPattern,
  type Program,
  type RegexBacktrackingData,
} from '../src/algorithm.js';
import { regexBacktrackingFacet } from '../src/facet.js';
import { regexBacktrackingImperativeIR } from '../src/irs.js';

const data = regexBacktrackingFacet.initialData as RegexBacktrackingData;
const prog = compilePattern(data.pattern, data.alphabet);

// 사양 실측표 — a 의 수 · 끝(0 = b, 1 = a) → 판정 · tries · retries · 한 자리 최대 · dfa-steps · 판 걸음
const TABLE: [number, number, boolean, number, number, number, number, number][] = [
  [2, 0, true, 5, 2, 3, 3, 4],
  [2, 1, false, 14, 8, 7, 2, 6],
  [4, 0, true, 7, 2, 3, 5, 4],
  [4, 1, false, 43, 24, 18, 4, 8],
  [6, 0, true, 9, 2, 3, 7, 4],
  [6, 1, false, 119, 66, 47, 6, 10],
  [8, 0, true, 11, 2, 3, 9, 4],
  [8, 1, false, 318, 176, 123, 8, 12],
  [10, 0, true, 13, 2, 3, 11, 4],
  [10, 1, false, 839, 464, 322, 10, 14],
  [12, 0, true, 15, 2, 3, 13, 4],
  [12, 1, false, 2203, 1218, 843, 12, 16],
];

function irRun(p: Program, text: number[]): { r: number; counts: number[]; hits: number[] } {
  const counts = [0, 0];
  const hits = new Array<number>(text.length + 1).fill(0);
  const r = runIR(regexBacktrackingImperativeIR, 'matchAll', [p.op.slice(), p.arg1.slice(), p.arg2.slice(), text, counts, hits]);
  return { r: r as number, counts, hits };
}

/** 명령 차례를 섞는다 (0 번은 시작이라 둔다) — 뜻은 같아야 한다 */
function shuffled(p: Program, seed: number): Program {
  let s = seed;
  const rand = (): number => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
  const rest = Array.from({ length: p.op.length - 1 }, (_, i) => i + 1);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  const where = new Array<number>(p.op.length).fill(0);
  rest.forEach((old, k) => {
    where[old] = k + 1;
  });
  const op = new Array<number>(p.op.length).fill(0);
  const a1 = new Array<number>(p.op.length).fill(-1);
  const a2 = new Array<number>(p.op.length).fill(-1);
  for (let old = 0; old < p.op.length; old++) {
    const nw = where[old]!;
    const k = p.op[old]!;
    op[nw] = k;
    if (k === OP_CHAR) {
      a1[nw] = p.arg1[old]!;
      a2[nw] = where[p.arg2[old]!]!;
    } else if (k === OP_SPLIT) {
      a1[nw] = where[p.arg1[old]!]!;
      a2[nw] = where[p.arg2[old]!]!;
    } else if (k === OP_JMP) {
      a1[nw] = where[p.arg1[old]!]!;
    }
  }
  return { op, arg1: a1, arg2: a2, starPc: where[p.starPc]! };
}

describe('regex-backtracking', () => {
  it('무늬 구조를 명령 아홉으로 옮긴다 (사양 대조)', () => {
    expect(showPattern(data.pattern)).toBe('(a|aa)*b');
    expect(prog.op).toEqual([1, 1, 0, 2, 0, 0, 2, 0, 3]);
    expect(prog.arg1).toEqual([1, 2, 0, 6, 0, 0, 0, 1, -1]);
    expect(prog.arg2).toEqual([7, 4, 3, -1, 5, 6, -1, 8, -1]);
    expect(prog.starPc).toBe(0);
  });

  it('사다리가 손잡이 구간 값과 같고 기본값이 사양대로다', () => {
    const controls = (regexBacktrackingFacet.blocks.controls as { controls: { action: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const a = controls.find((c) => c.action === 'aCount')!;
    const l = controls.find((c) => c.action === 'lastChar')!;
    expect(a.segments!.map((s) => s.value)).toEqual(data.aCounts);
    expect(l.segments!.map((s) => s.value)).toEqual(data.lastLetters.map((_, i) => i));
    expect(a.segments!.find((s) => s.default)!.value).toBe(data.start.aCount);
    expect(l.segments!.find((s) => s.default)!.value).toBe(data.start.lastChar);
    expect(data.aCounts.length).toBe(6);
    expect(data.aCounts[data.aCounts.length - 1]).toBe(12);
    expect(data.lastLetters).toEqual(['b', 'a']);
  });

  it('모든 손잡이 조합이 사양 실측표와 같다', () => {
    for (const [n, last, ok, tries, retries, top, dfa, steps] of TABLE) {
      const b = runBoard(data, prog, n, last);
      expect(b.matched, `${n}/${last}`).toBe(ok);
      expect(b.tries).toBe(tries);
      expect(b.retries).toBe(retries);
      expect(Math.max(...b.hits)).toBe(top);
      expect(b.hits.reduce((x, y) => x + y, 0)).toBe(tries);
      expect(b.letters.length).toBe(dfa);
      // 판 걸음 = 시작 + 걸음 경계 + 판정
      expect(b.steps.length + 2).toBe(steps);
    }
    expect(ladderScale(data, prog)).toEqual({ capacity: 14, triesScale: 2203, hitsScale: 843 });
  });

  it('기본 판(6 · a)의 걸음 차례가 사양대로다', () => {
    const b = runBoard(data, prog, 6, 1);
    expect(b.steps.map((s) => s.kind)).toEqual(['descend', ...new Array(7).fill('exhaust')]);
    expect(b.steps.map((s) => s.sp)).toEqual([6, 6, 5, 4, 3, 2, 1, 0]);
    expect(b.steps.map((s) => s.tries)).toEqual([6, 9, 12, 18, 28, 45, 73, 119]);
    expect(b.steps.map((s) => s.retries)).toEqual([0, 2, 4, 8, 14, 24, 40, 66]);
    expect(b.steps[0]!.hits).toEqual([1, 1, 1, 1, 1, 1, 0]);
    expect(b.steps[1]!.hits).toEqual([1, 1, 1, 1, 1, 1, 3]);
    expect(b.hits).toEqual([3, 4, 7, 11, 18, 29, 47]);
    const m = runBoard(data, prog, 6, 0);
    expect(m.steps.map((s) => [s.kind, s.sp, s.tries])).toEqual([
      ['descend', 6, 6],
      ['accept', 7, 9],
    ]);
    expect(m.hits).toEqual([1, 1, 1, 1, 1, 1, 3, 0]);
    const big = runBoard(data, prog, 12, 1);
    expect(big.steps.map((s) => s.tries)).toEqual([12, 15, 18, 24, 34, 51, 79, 125, 200, 322, 520, 841, 1361, 2203]);
  });

  it('IR 의 답이 모든 조합에서 algorithm 과 같다 — 명령 차례를 서른 번 섞어도', () => {
    const progs = [prog, ...Array.from({ length: 30 }, (_, i) => shuffled(prog, 7 + i * 31))];
    for (const [n, last] of TABLE) {
      const b = runBoard(data, prog, n, last);
      const text = encodeText(b.letters, data.alphabet);
      for (const p of progs) {
        const ir = irRun(p, text);
        expect(ir.r).toBe(b.matched ? 1 : 0);
        expect(ir.counts).toEqual([b.tries, b.retries]);
        expect(ir.hits).toEqual(b.hits);
        const ts = [0, 0];
        const hs = new Array<number>(text.length + 1).fill(0);
        expect(matchAll(p.op, p.arg1, p.arg2, text, ts, hs)).toBe(ir.r);
        const sb = runBoard(data, p, n, last);
        expect(sb.steps).toEqual(b.steps);
      }
    }
  });

  it('모르는 명령 종류에 IR 은 −1 을 내고 SPLIT 이 그대로 올린다 · TS 는 던진다', () => {
    const text = [0, 0, 1];
    // MATCH(3) 자리에 모르는 종류 9 — b 까지 먹고 닿는다
    const op = prog.op.map((k) => (k === 3 ? 9 : k));
    expect(irRun({ ...prog, op }, text).r).toBe(-1);
    // 되풀이 몸의 첫 CHAR 를 모르는 종류로 — 첫 갈래에서 −1 이 나와 SPLIT 두 겹을 지나 올라온다
    const op2 = prog.op.slice();
    op2[2] = 7;
    const r2 = irRun({ ...prog, op: op2 }, text);
    expect(r2.r).toBe(-1);
    expect(r2.counts[1]).toBe(0);
    expect(() => matchAll(op, prog.arg1, prog.arg2, text, [0, 0], [0, 0, 0, 0])).toThrow();
  });

  it('회차별 계기 — A → B → A 로 돌려 회차마다 표와 같다', async () => {
    const d = JSON.parse(JSON.stringify(data)) as RegexBacktrackingData;
    d.stepMs = 0;
    d.motionMs = 0;
    const totals: Record<string, number> = {};
    const rounds: Record<string, number>[] = [];
    const inputs = [
      { type: 'lastChar', payload: { value: 0 } },
      { type: 'lastChar', payload: { value: 1 } },
      { type: 'aCount', payload: { value: 12 } },
    ];
    let cancelled = false;
    const ctx = {
      data: d,
      get cancelled() {
        return cancelled;
      },
      async emit() {},
      metric(name: string, delta: number | 'inc') {
        totals[name] = (totals[name] ?? 0) + (delta === 'inc' ? 1 : delta);
      },
      async sleep() {
        return !cancelled;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        rounds.push({ ...totals });
        const next = inputs.shift();
        if (!next) {
          cancelled = true;
          return { type: 'none' };
        }
        return next;
      },
    };
    await regexBacktrackingAlgorithm(ctx as unknown as FacetContext<RegexBacktrackingData>);
    expect(rounds).toEqual([
      { tries: 119, retries: 66, 'dfa-steps': 6 },
      { tries: 9, retries: 2, 'dfa-steps': 7 },
      { tries: 119, retries: 66, 'dfa-steps': 6 },
      { tries: 2203, retries: 1218, 'dfa-steps': 12 },
    ]);
  });
});
