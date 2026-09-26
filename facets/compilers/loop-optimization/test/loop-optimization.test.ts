// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView } from '@ffacet/core/runtime';
import {
  finalCost,
  irArgsOf,
  loopOptimizationAlgorithm,
  loopOptimizationFacet,
  loopOptimizationImperativeIR,
  loopOptimizationStageView,
  planRound,
  withBodyOrder,
  type LoopOptimizationData,
  type LoopStage,
} from '../src/index.js';

const data = loopOptimizationFacet.initialData as unknown as LoopOptimizationData;

/** 사양 실측표 — [N, F, 꺼내기] → [실행 연산, 반복 관리, 코드 줄, 걸음(0 포함)] */
const TABLE: [number, number, number, number, number, number, number][] = [
  [0, 1, 0, 1, 1, 8, 2], [0, 1, 1, 2, 1, 8, 4],
  [0, 2, 0, 1, 1, 10, 4], [0, 2, 1, 2, 1, 9, 6],
  [0, 4, 0, 1, 1, 14, 6], [0, 4, 1, 2, 1, 11, 8],
  [1, 1, 0, 6, 3, 8, 2], [1, 1, 1, 6, 3, 8, 4],
  [1, 2, 0, 4, 1, 12, 5], [1, 2, 1, 4, 1, 10, 7],
  [1, 4, 0, 4, 1, 16, 7], [1, 4, 1, 4, 1, 12, 9],
  [4, 1, 0, 21, 9, 8, 2], [4, 1, 1, 18, 9, 8, 4],
  [4, 2, 0, 19, 5, 10, 4], [4, 2, 1, 16, 5, 9, 6],
  [4, 4, 0, 18, 3, 14, 6], [4, 4, 1, 15, 3, 11, 8],
  [10, 1, 0, 51, 21, 8, 2], [10, 1, 1, 42, 21, 8, 4],
  [10, 2, 0, 46, 11, 10, 4], [10, 2, 1, 37, 11, 9, 6],
  [10, 4, 0, 42, 5, 18, 8], [10, 4, 1, 33, 5, 13, 10],
];

const NAMES = ['w', 'total', 'i', 'rate'];

function irCost(d: LoopOptimizationData, n: number, f: number, h: number, names: string[]) {
  const a = irArgsOf(d, n, names);
  const inv = Array.from({ length: a.nBody }, () => 0);
  const stats = [0, 0, 0];
  const ops = runIR(loopOptimizationImperativeIR, 'loopCost', [
    a.bodyOps, a.bodyIdx, a.bodyWrite, a.bodyReads, a.nBody, a.width, a.lo, a.hi, a.step, f, h, inv, stats,
  ]);
  return { ops, overhead: stats[0], codeLines: stats[1], hoisted: stats[2] };
}

describe('loop-optimization', () => {
  it('사다리가 segments 와 같고 기본값이 default 와 같다', () => {
    const controls = (loopOptimizationFacet.blocks.controls as { controls: { name?: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const seg = (name: string) => {
      const c = controls.find((x) => x.name === name);
      if (c?.segments === undefined) throw new Error(name);
      return c.segments;
    };
    expect(seg('trips').map((s) => s.value)).toEqual(data.tripsLadder);
    expect(seg('factor').map((s) => s.value)).toEqual(data.factorLadder);
    expect(seg('hoist').map((s) => s.value)).toEqual(data.hoistLadder);
    expect(seg('trips').find((s) => s.default)?.value).toBe(data.trips);
    expect(seg('factor').find((s) => s.default)?.value).toBe(data.factor);
    expect(seg('hoist').find((s) => s.default)?.value).toBe(data.hoist);
    expect(data.tripsLadder.at(-1)).toBe(10);
    expect(data.factorLadder.at(-1)).toBe(4);
    expect(TABLE).toHaveLength(data.tripsLadder.length * data.factorLadder.length * data.hoistLadder.length);
  });

  it('스물넷 칸 — algorithm 이 사양 표와 같고 IR 이 algorithm 과 같다', () => {
    for (const [n, f, h, ops, overhead, lines, steps] of TABLE) {
      const c = finalCost(data, n, f, h);
      expect([n, f, h, c.ops, c.overhead, c.codeLines]).toEqual([n, f, h, ops, overhead, lines]);
      expect([n, f, h, planRound(data, n, f, h).length]).toEqual([n, f, h, steps]);
      const r = irCost(data, n, f, h, NAMES);
      expect([n, f, h, r.ops, r.overhead, r.codeLines]).toEqual([n, f, h, ops, overhead, lines]);
      expect(irArgsOf(data, n, NAMES).bodyReads).toHaveLength(3 * 3);
    }
  });

  it('몸 줄 차례와 이름 번호를 섞어도 IR 과 algorithm 이 같다', () => {
    const perms = [
      ['w', 'total', 'i', 'rate'],
      ['rate', 'i', 'total', 'w'],
      ['i', 'w', 'rate', 'total'],
      ['total', 'rate', 'w', 'i'],
    ];
    for (const order of [[0, 1], [1, 0]]) {
      const d = withBodyOrder(data, order);
      for (const names of perms) {
        for (const [n, f, h] of TABLE) {
          const a = finalCost(d, n, f, h);
          const r = irCost(d, n, f, h, names);
          expect([n, f, h, r.ops, r.overhead, r.codeLines]).toEqual([n, f, h, a.ops, a.overhead, a.codeLines]);
        }
      }
    }
  });

  it('기본값 판의 걸음과 끝 프로그램이 사양과 같다', () => {
    const steps = planRound(data, 10, 4, 1);
    expect(steps.map((s) => s.kind)).toEqual([
      'round', 'judge', 'hoist', 'copy', 'copy', 'copy', 'bound', 'tail', 'tail', 'count',
    ]);
    const last = steps.at(-1);
    if (last === undefined) throw new Error('no step');
    expect(last.lines.map((l) => '    '.repeat(l.indent) + l.text)).toEqual([
      'function weigh(list, rate)',
      '    let total = 0',
      '    let i = 0',
      '    let w = rate * 2',
      '    while i < 8',
      '        total = total + list[i] * w',
      '        total = total + list[i + 1] * w',
      '        total = total + list[i + 2] * w',
      '        total = total + list[i + 3] * w',
      '        i = i + 4',
      '    total = total + list[i] * w',
      '    total = total + list[i + 1] * w',
      '    return total',
    ]);
    const first = steps[0];
    if (first === undefined) throw new Error('no step');
    expect(first.lines.map((l) => l.text)).toEqual([
      'function weigh(list, rate)',
      'let total = 0',
      'let i = 0',
      'while i < 10',
      'let w = rate * 2',
      'total = total + list[i] * w',
      'i = i + 1',
      'return total',
    ]);
    // N 1 · F 2 · 끔 — 벌 k ≥ 1 의 let 은 넣기로, 나머지 첫 벌은 let
    const small = planRound(data, 1, 2, 0).at(-1);
    if (small === undefined) throw new Error('no step');
    expect(small.lines.map((l) => l.text)).toEqual([
      'function weigh(list, rate)',
      'let total = 0',
      'let i = 0',
      'while i < 0',
      'let w = rate * 2',
      'total = total + list[i] * w',
      'w = rate * 2',
      'total = total + list[i + 1] * w',
      'i = i + 2',
      'let w = rate * 2',
      'total = total + list[i] * w',
      'return total',
    ]);
    // 가장 긴 프로그램 18 줄
    const longest = Math.max(
      ...TABLE.map(([n, f, h]) => Math.max(...planRound(data, n, f, h).map((s) => s.lines.length))),
    );
    expect(longest).toBe(18);
  });

  it('회차별 계기 — 손잡이 A → B → A 에서 판마다 걸음 0 과 셈 걸음이 사양 값이다', async () => {
    const metrics = new Map<string, number>();
    const log: { kind: string; ops: number; overhead: number; lines: number }[] = [];
    const inputs = [
      { type: 'trips', payload: { value: 0 } },
      { type: 'trips', payload: { value: 10 } },
    ];
    let cancelled = false;
    const ctx = {
      data,
      get cancelled() {
        return cancelled;
      },
      async emit(e: { type: string; payload?: unknown }) {
        if (e.type === 'round' || e.type === 'count') {
          log.push({
            kind: e.type,
            ops: metrics.get('exec-ops') ?? NaN,
            overhead: metrics.get('loop-overhead') ?? NaN,
            lines: metrics.get('code-lines') ?? NaN,
          });
        }
      },
      metric(name: string, delta: number | 'inc') {
        if (delta === 'inc') throw new Error('inc 를 쓰지 않는다');
        metrics.set(name, (metrics.get(name) ?? 0) + delta);
      },
      async sleep() {
        return !cancelled;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        const next = inputs.shift();
        if (next === undefined) {
          cancelled = true;
          return { type: 'none' };
        }
        return next;
      },
    };
    await loopOptimizationAlgorithm(ctx as never);
    expect(log).toEqual([
      { kind: 'round', ops: 51, overhead: 21, lines: 8 },
      { kind: 'count', ops: 33, overhead: 5, lines: 13 },
      { kind: 'round', ops: 1, overhead: 1, lines: 8 },
      { kind: 'count', ops: 2, overhead: 1, lines: 11 },
      { kind: 'round', ops: 51, overhead: 21, lines: 8 },
      { kind: 'count', ops: 33, overhead: 5, lines: 13 },
    ]);
  });

  it('무대 — 새 판의 걸음 0 에 앞 판의 벌 · 표지가 남지 않는다', () => {
    const container = document.createElement('div');
    const stage = mountView(loopOptimizationStageView, container, {
      config: {},
      isInstant: () => true,
    }) as unknown as LoopStage;
    stage.setScale(51, 18);
    const full = planRound(data, 10, 4, 1);
    for (const s of full) stage.showProgram(s.lines, [], 0);
    expect(container.textContent).toContain('list[i + 3]');
    const again = planRound(data, 4, 1, 0)[0];
    if (again === undefined) throw new Error('no step');
    stage.showProgram(again.lines, [], 0);
    stage.clearMarks();
    expect(container.textContent).not.toContain('list[i + 3]');
    expect(container.textContent).toContain('while i < 4');
    stage.destroy();
  });
});
