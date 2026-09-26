// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  buildRound,
  parseProgram,
  recursiveDescentAlgorithm,
  recursiveDescentFacet,
  recursiveDescentImperativeIR,
  recursiveDescentStageView,
  terminalOf,
  tokenize,
  type RecursiveDescentData,
} from '../src/index.js';

const data = recursiveDescentFacet.initialData as RecursiveDescentData;

/** 사양 실측표 — [문법, 겹, 토큰, calls, max-depth, eaten, IR 돌려줌, 판 걸음] */
const TABLE: [number, number, number, number, number, number, number, number][] = [
  [0, 0, 4, 4, 3, 4, 4, 6],
  [0, 1, 8, 7, 5, 8, 8, 9],
  [0, 2, 12, 10, 7, 12, 12, 12],
  [0, 3, 16, 13, 9, 16, 16, 15],
  [1, 0, 4, 12, 12, 1, -1, 14],
  [1, 1, 8, 12, 12, 1, -1, 14],
  [1, 2, 12, 12, 12, 1, -1, 14],
  [1, 3, 16, 12, 12, 1, -1, 14],
];

function irRun(source: string, leftRec: number, limit: number): { result: number; stats: number[] } {
  const kind = tokenize(source).map(terminalOf);
  const stats = [0, 0, 0];
  const result = runIR(recursiveDescentImperativeIR, 'parseProgram', [kind, leftRec, limit, stats]);
  if (typeof result !== 'number') throw new Error('IR 이 수를 돌려주지 않았다');
  return { result, stats };
}

describe('recursive-descent', () => {
  it('사다리가 segments 와 같고 데이터 길이가 사다리 끝값과 맞는다', () => {
    const controls = (recursiveDescentFacet.blocks.controls as { controls: unknown[] }).controls;
    const valuesOf = (action: string): number[] => {
      const c = controls.find((x) => typeof x === 'object' && x !== null && (x as { action?: unknown }).action === action);
      if (!c) throw new Error(`손잡이 ${action} 가 없다`);
      return (c as { segments: { value: number }[] }).segments.map((s) => s.value);
    };
    expect(valuesOf('nesting')).toEqual(data.nestingLadder);
    expect(valuesOf('grammar')).toEqual(data.grammarLadder);
    expect(data.nestingLadder.at(-1)).toBe(3);
    expect(data.grammarLadder.at(-1)).toBe(1);
    expect(data.sources.length).toBe(4);
    expect(data.grammars.length).toBe(2);
    expect(data.limit).toBe(12);
  });

  it('여덟 조합 — 알고리즘 · IR · 사양 표가 같다', () => {
    for (const [g, d, toks, calls, depth, eaten, ret, steps] of TABLE) {
      const r = buildRound(data, d, g);
      const last = r.steps.at(-1)!;
      expect(r.round.tokens.length - 1, `토큰 g${g} d${d}`).toBe(toks);
      expect([last.calls, last.maxDepth, last.eaten, r.result, r.steps.length], `알고리즘 g${g} d${d}`).toEqual([calls, depth, eaten, ret, steps]);
      const ir = irRun(data.sources[d]!, g, data.limit);
      expect([ir.stats[0], ir.stats[1], ir.stats[2], ir.result], `IR g${g} d${d}`).toEqual([calls, depth, eaten, ret]);
    }
  });

  it('사다리 밖의 글 넷 · 다른 한계에서도 IR 과 TS 파서가 같다', () => {
    const extra = ['show a + (b + 1)', 'show 1 + 2', 'show (a + b) + (1 + 2)', 'show ((a + b) + 1) + (c + (d + 2))'];
    for (const src of [...data.sources, ...extra]) {
      for (const leftRec of [0, 1]) {
        for (const limit of [3, 5, 12, 16]) {
          const kind = tokenize(src).map(terminalOf);
          const stats = [0, 0, 0];
          const ts = parseProgram(kind, leftRec, limit, stats);
          const ir = irRun(src, leftRec, limit);
          expect([ir.result, ...ir.stats], `${src} leftRec ${leftRec} limit ${limit}`).toEqual([ts, ...stats]);
        }
      }
    }
    // 왼쪽 재귀는 한계가 곧 깊이다 — 한계 인자를 실제로 쓴다
    expect(irRun('show a + b', 1, 16).stats).toEqual([16, 16, 1]);
  });

  it('기본 판 · 왼쪽 재귀 판의 걸음이 사양과 같다', () => {
    const base = buildRound(data, 1, 0).steps.slice(1);
    expect(base.map((s) => s.calls)).toEqual([1, 2, 3, 4, 5, 6, 7, 7]);
    expect(base.map((s) => s.maxDepth)).toEqual([1, 2, 3, 4, 5, 5, 5, 5]);
    expect(base.map((s) => s.eaten)).toEqual([0, 1, 1, 2, 2, 4, 7, 8]);
    expect(base.map((s) => s.returns)).toEqual([0, 0, 0, 0, 0, 1, 3, 3]);
    expect(base.map((s) => s.called?.depth ?? null)).toEqual([1, 2, 3, 4, 5, 5, 3, null]);
    expect(base.at(-1)!.outcome).toBe('accepted');

    const left = buildRound(data, 1, 1).steps;
    expect(left.length).toBe(14);
    const end = left.at(-1)!;
    expect([end.outcome, end.returns, end.returnedDeepest, end.pos, end.refusedDepth, end.result]).toEqual(['limit', 12, 12, 1, 13, -1]);
    expect(base.map((s) => s.returnedDeepest)).toEqual([0, 0, 0, 0, 0, 5, 5, 3]);
    for (const s of left.slice(3, 13)) {
      expect(s.called?.rule).toBe('Expr');
      expect(s.pos).toBe(1);
    }

    const d3 = buildRound(data, 3, 0).steps;
    expect(d3.length).toBe(15);
    expect(d3[9]!.maxDepth).toBe(9);
    expect(d3[10]!.called?.depth).toBe(9);
  });

  it('회차별 계기 — 손잡이를 A → B → A 로 돌려도 판마다 사양 표 그대로', async () => {
    const inputs = [
      { type: 'grammar', payload: { value: 1 } },
      { type: 'nesting', payload: { value: 3 } },
      { type: 'grammar', payload: { value: 0 } },
      { type: 'nesting', payload: { value: 1 } },
    ];
    const totals = new Map<string, number>();
    const perRound: number[][] = [];
    let cancelled = false;
    let done!: () => void;
    const idle = new Promise<void>((r) => (done = r));
    const snap = (): number[] => ['calls', 'max-depth', 'eaten'].map((m) => totals.get(m) ?? 0);
    const ctx = {
      data: structuredClone(data),
      get cancelled() {
        return cancelled;
      },
      metric(name: string, delta: number | 'inc') {
        totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
      },
      async emit(_e: FacetRuntimeEvent) {},
      async sleep() {
        return !cancelled;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        perRound.push(snap());
        const next = inputs.shift();
        if (!next) {
          done();
          return new Promise<never>(() => {});
        }
        return next;
      },
    };
    await Promise.race([recursiveDescentAlgorithm(ctx as never), idle]);
    cancelled = true;
    expect(perRound).toEqual([
      [7, 5, 8], // 겹 1 · 없음
      [12, 12, 1], // 겹 1 · 왼쪽 재귀
      [12, 12, 1], // 겹 3 · 왼쪽 재귀
      [13, 9, 16], // 겹 3 · 없음
      [7, 5, 8], // 겹 1 · 없음 — 처음과 같다
    ]);
  });

  it('무대가 판 머리와 걸음을 받아 그린다', () => {
    const container = document.createElement('div');
    const inst = mountView(recursiveDescentStageView, container, { config: {} }) as unknown as {
      setRound(r: unknown): void;
      setStep(s: unknown, speed: number): void;
      destroy(): void;
    };
    const r = buildRound(data, 1, 1);
    inst.setRound(r.round);
    for (const s of r.steps) inst.setStep(s, 1);
    const text = container.textContent ?? '';
    expect(text).toContain('show (a + 1) + b');
    expect(text).toContain('Call limit hit');
    expect(text).toContain('-1');
    inst.destroy();
  });
});
