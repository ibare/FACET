import { describe, expect, it } from 'vitest';
import type { FacetContext, FacetRuntimeEvent, IRExpr, IRStmt } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  branchCoverageAlgorithm,
  branchCoverageFacet,
  branchCoverageImperativeIR,
  planRound,
  runMutant,
  runOriginal,
  type BranchCoverageData,
  type LineKind,
} from '../src/index.js';

const data = branchCoverageFacet.initialData as BranchCoverageData;

/** 사양 실측표 — 판 끝의 값 (분자, 백분율) · 살아남은 변이 · 걸음 수 */
const TABLE: Record<number, { lines: [number, number]; branches: [number, number]; pairs: [number, number]; mutants: [number, number]; survivors: string[]; steps: number }> = {
  1: { lines: [4, 100], branches: [1, 50], pairs: [0, 0], mutants: [1, 20], survivors: ['M1', 'M2', 'M4', 'M5'], steps: 6 },
  2: { lines: [4, 100], branches: [2, 100], pairs: [1, 50], mutants: [3, 60], survivors: ['M1', 'M4'], steps: 10 },
  3: { lines: [4, 100], branches: [2, 100], pairs: [2, 100], mutants: [4, 80], survivors: ['M1'], steps: 14 },
  4: { lines: [4, 100], branches: [2, 100], pairs: [2, 100], mutants: [5, 100], survivors: [], steps: 19 },
};

const PHASE_OF: Record<LineKind, string> = {
  init: 'init-fee',
  decide: 'decide',
  adjust: 'discount',
  return: 'return-fee',
};

/** IR 을 걸어 밟는 phase 차례를 모은다 — 이 IR 이 쓰는 모양(var · if · assign · return)만 안다. */
function irPhases(args: (number | boolean)[]): string[] {
  const fn = branchCoverageImperativeIR.functions[0];
  if (!fn) throw new Error('함수 없음');
  const env = new Map<string, number | boolean>();
  fn.params.forEach((p, i) => {
    const a = args[i];
    if (a === undefined) throw new Error('인자 없음');
    env.set(p.name, a);
  });
  const ev = (e: IRExpr): number | boolean => {
    switch (e.kind) {
      case 'lit':
        if (typeof e.value === 'string') throw new Error('글자 값');
        return e.value;
      case 'var': {
        const v = env.get(e.name);
        if (v === undefined) throw new Error(`변수 ${e.name}`);
        return v;
      }
      case 'binop': {
        const l = ev(e.l);
        const r = ev(e.r);
        if (e.op === '&&') return l === true && r === true;
        if (typeof l !== 'number' || typeof r !== 'number') throw new Error('수 아님');
        if (e.op === '>=') return l >= r;
        if (e.op === '-') return l - r;
        throw new Error(`연산 ${e.op}`);
      }
      default:
        throw new Error(`식 ${e.kind}`);
    }
  };
  const out: string[] = [];
  const walk = (stmts: IRStmt[]): boolean => {
    for (const s of stmts) {
      if (s.kind === 'comment') continue;
      if (s.phase) out.push(s.phase);
      if (s.kind === 'var') env.set(s.name, ev(s.init));
      else if (s.kind === 'assign') {
        if (s.target.kind !== 'var') throw new Error('대상');
        env.set(s.target.name, ev(s.expr));
      } else if (s.kind === 'if') {
        if (ev(s.cond) === true) {
          if (walk(s.then)) return true;
        } else if (s.else && walk(s.else)) return true;
      } else if (s.kind === 'return') return true;
      else throw new Error(`문 ${s.kind}`);
    }
    return false;
  };
  walk(fn.body);
  return out;
}

describe('branch-coverage — 코드 패널이 화면과 같은 답을 낸다', () => {
  it('시험 넷 모두 runIR 의 답이 알고리즘의 답 · 기대와 같다', () => {
    const answers = data.tests.map((tc) => {
      const ir = runIR(branchCoverageImperativeIR, 'fee', tc.args);
      const alg = runOriginal(data, tc.args).result;
      expect(ir).toBe(alg);
      expect(alg).toBe(tc.expect);
      return alg;
    });
    expect(answers).toEqual([5, 10, 10, 5]);
  });

  it('IR 이 밟는 phase 차례가 알고리즘이 밟은 줄 차례와 같다', () => {
    const lines = data.tests.map((tc) => runOriginal(data, tc.args).trace.map((s) => s.line));
    expect(lines).toEqual([
      [2, 3, 4, 5],
      [2, 3, 5],
      [2, 3, 5],
      [2, 3, 4, 5],
    ]);
    for (const tc of data.tests) {
      const alg = runOriginal(data, tc.args).trace.map((s) => PHASE_OF[s.kind]);
      expect(irPhases(tc.args)).toEqual(alg);
    }
  });
});

describe('branch-coverage — 변이는 실제로 돌려 판정한다', () => {
  it('잡은 시험: M1←T4 · M2←T2 · M3←T1 · M4←T3 · M5←T2', () => {
    const by = new Map<string, string>();
    for (const s of planRound(data, 4)) if (s.kind === 'verdict') for (const m of s.killed) by.set(m, s.test);
    expect(Object.fromEntries(by)).toEqual({ M1: 'T4', M2: 'T2', M3: 'T1', M4: 'T3', M5: 'T2' });
  });

  it('변이마다 시험 넷의 답 — 판정은 데이터가 아니라 돌린 결과다', () => {
    const table = data.mutants.map((m) => data.tests.map((tc) => runMutant(data, m, tc.args)));
    expect(table).toEqual([
      [5, 10, 10, 10], // M1 >
      [5, 5, 5, 5], // M2 or
      [15, 10, 10, 15], // M3 +
      [5, 10, 5, 5], // M4 A 만
      [5, 5, 10, 5], // M5 B 만
    ]);
  });

  it('짝: A = T1-T2 · B = T1-T3', () => {
    const steps = planRound(data, 4);
    const last = steps[steps.length - 1];
    if (!last || last.kind !== 'verdict') throw new Error('판정 걸음이 끝이 아니다');
    expect(last.pairs).toEqual([
      { condition: 'A', pair: ['T1', 'T2'] },
      { condition: 'B', pair: ['T1', 'T3'] },
    ]);
  });

  it('원본이 시험에 떨어지면 던진다', () => {
    const bad: BranchCoverageData = { ...data, tests: data.tests.map((tc, i) => (i === 0 ? { ...tc, expect: 6 } : tc)) };
    expect(() => planRound(bad, 1)).toThrow();
  });

  it('모르는 바뀜 · 맞지 않는 모양은 던진다', () => {
    const m = data.mutants[0];
    if (!m) throw new Error('변이 없음');
    const wrong = { ...m, change: { kind: 'compare' as const, condition: 'A', from: '>' as const, to: '>=' as const } };
    expect(() => runMutant(data, wrong, [70, true])).toThrow();
  });
});

describe('branch-coverage — 사다리와 판마다의 계기', () => {
  it('사다리가 segments 와 같고 시험 넷 · 변이 다섯이다', () => {
    const controls = (branchCoverageFacet.blocks.controls as { controls: unknown[] }).controls;
    const slider = controls.find(
      (c): c is { action: string; segments: { value: number; default?: boolean }[] } =>
        typeof c === 'object' && c !== null && (c as { action?: unknown }).action === 'test-count',
    );
    if (!slider) throw new Error('손잡이 없음');
    expect(slider.segments.map((s) => s.value)).toEqual(data.testCounts);
    expect(slider.segments.find((s) => s.default)?.value).toBe(data.testCount);
    expect(data.testCounts[data.testCounts.length - 1]).toBe(data.tests.length);
    expect(data.tests.length).toBe(4);
    expect(data.mutants.length).toBe(5);
  });

  it('시험 수마다 걸음 수 · 판 끝 분수가 사양 표와 같다', () => {
    for (const n of data.testCounts) {
      const steps = planRound(data, n);
      const row = TABLE[n];
      if (!row) throw new Error(`표에 ${n} 없음`);
      expect(steps.length).toBe(row.steps);
      const last = steps[steps.length - 1];
      if (!last) throw new Error('걸음 없음');
      expect(last.meters.lines.hit).toBe(row.lines[0]);
      expect(last.meters.branches.hit).toBe(row.branches[0]);
      expect(last.meters.pairs.hit).toBe(row.pairs[0]);
      expect(last.meters.mutants.hit).toBe(row.mutants[0]);
      const killed = new Set<string>();
      for (const s of steps) if (s.kind === 'verdict') for (const m of s.killed) killed.add(m);
      expect(data.mutants.map((m) => m.id).filter((id) => !killed.has(id))).toEqual(row.survivors);
    }
  });

  it('기본(2) 한 판의 걸음 — 사양 걸음표', () => {
    const steps = planRound(data, 2);
    const pct = (h: number, n: number) => Math.floor((h * 100 + Math.floor(n / 2)) / n);
    const rows = steps.map((s) => [
      pct(s.meters.lines.hit, 4),
      pct(s.meters.branches.hit, 2),
      pct(s.meters.pairs.hit, 2),
      pct(s.meters.mutants.hit, 5),
    ]);
    expect(rows).toEqual([
      [0, 0, 0, 0],
      [25, 0, 0, 0],
      [50, 50, 0, 0],
      [75, 50, 0, 0],
      [100, 50, 0, 0],
      [100, 50, 0, 20],
      [100, 50, 0, 20],
      [100, 100, 0, 20],
      [100, 100, 0, 20],
      [100, 100, 50, 60],
    ]);
  });

  it('손잡이 2 → 4 → 2 — 회차마다 계기가 사양 표의 값이다 (쌓이지 않는다)', async () => {
    const inputs = [4, 2];
    const metrics = new Map<string, number>();
    const phases: string[] = [];
    const roundEnds: Record<string, number>[] = [];
    let cancelled = false;
    let rounds = 0;
    const snapshot = () => roundEnds.push(Object.fromEntries(metrics));
    const ctx = {
      data,
      get cancelled() {
        return cancelled;
      },
      async emit(e: FacetRuntimeEvent) {
        if (e.type === 'phase') {
          const p = e.payload as { phase?: unknown };
          if (typeof p.phase === 'string') phases.push(p.phase);
        }
      },
      metric(name: string, delta: number | 'inc') {
        if (typeof delta !== 'number') throw new Error('inc 를 쓰지 않는다');
        metrics.set(name, (metrics.get(name) ?? 0) + delta);
      },
      async sleep() {
        return !cancelled;
      },
      async waitForInput() {
        rounds++;
        snapshot();
        const v = inputs.shift();
        if (v === undefined) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return { type: 'test-count', payload: { value: v } };
      },
      pollInput() {
        return null;
      },
    };
    await branchCoverageAlgorithm(ctx as unknown as FacetContext<BranchCoverageData>);
    expect(rounds).toBe(3);
    const expectRow = (n: number) => {
      const row = TABLE[n];
      if (!row) throw new Error('표 없음');
      return {
        'line-coverage': row.lines[1],
        'branch-coverage': row.branches[1],
        'condition-pairs': row.pairs[1],
        'mutation-score': row.mutants[1],
      };
    };
    expect(roundEnds).toEqual([expectRow(2), expectRow(4), expectRow(2)]);
    expect(new Set(phases)).toEqual(new Set(['init-fee', 'decide', 'discount', 'return-fee']));
  });
});
