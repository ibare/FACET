import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';
import {
  buildStack,
  descendFields,
  narrowData,
  receptiveFieldAlgorithm,
  topIndex,
  weightCount,
  type ReceptiveFieldData,
} from '../src/algorithm.js';
import { receptiveFieldImperativeIR } from '../src/irs.js';
import { receptiveFieldFacet } from '../src/facet.js';

const data = (): ReceptiveFieldData => narrowData(structuredClone(receptiveFieldFacet.initialData));

// 사양 실측표 (대조용) — L · 풀링 → 층 크기 · 맨 위 칸 · 입력에서 한 변 · 칸 · 무게 · 걸음
const TABLE = [
  { L: 1, P: 0, sides: [18, 16], top: 7, side: 3, cells: 9, weights: 9, steps: 2 },
  { L: 2, P: 0, sides: [18, 16, 14], top: 6, side: 5, cells: 25, weights: 18, steps: 3 },
  { L: 3, P: 0, sides: [18, 16, 14, 12], top: 5, side: 7, cells: 49, weights: 27, steps: 4 },
  { L: 1, P: 1, sides: [18, 16], top: 7, side: 3, cells: 9, weights: 9, steps: 2 },
  { L: 2, P: 1, sides: [18, 16, 8, 6], top: 2, side: 8, cells: 64, weights: 18, steps: 4 },
  { L: 3, P: 1, sides: [18, 16, 8, 6, 3, 1], top: 0, side: 18, cells: 324, weights: 27, steps: 6 },
];

// 사양 대조 — 층마다 기대는 구간 (위에서 아래 차례, 0 부터)
const RANGES: Record<string, Array<[string, number, number]>> = {
  '1-0': [['input', 7, 9]],
  '2-0': [['conv1', 6, 8], ['input', 6, 10]],
  '3-0': [['conv2', 5, 7], ['conv1', 5, 9], ['input', 5, 11]],
  '1-1': [['input', 7, 9]],
  '2-1': [['pool1', 2, 4], ['conv1', 4, 9], ['input', 4, 11]],
  '3-1': [['pool2', 0, 2], ['conv2', 0, 5], ['pool1', 0, 7], ['conv1', 0, 15], ['input', 0, 17]],
};

describe('receptive-field — 사양 표 대조', () => {
  for (const row of TABLE) {
    it(`L ${row.L} · 풀링 ${row.P}`, () => {
      const d = data();
      const stack = buildStack(d, row.L, row.P);
      expect(stack.map((l) => l.side)).toEqual(row.sides);
      expect(topIndex(stack[stack.length - 1]!.side)).toBe(row.top);
      expect(weightCount(stack)).toBe(row.weights);
      const steps = descendFields(stack);
      expect(steps.length + 1).toBe(row.steps);
      const last = steps[steps.length - 1]!;
      expect(last.side).toBe(row.side);
      expect(last.cells).toBe(row.cells);
      expect(last.last).toBe(true);
      expect(steps.map((s) => [s.layer, s.rowLo, s.rowHi])).toEqual(RANGES[`${row.L}-${row.P}`]);
      for (const s of steps) {
        expect([s.colLo, s.colHi]).toEqual([s.rowLo, s.rowHi]);
        expect(s.rowHi).toBeLessThan(stack.find((l) => l.id === s.layer)!.side);
      }
    });
  }
});

describe('receptive-field — IR ↔ algorithm 전 조합', () => {
  const d = data();
  for (const L of d.layersLadder) {
    for (const P of d.poolLadder) {
      it(`L ${L} · 풀링 ${P}`, () => {
        const stack = buildStack(d, L, P);
        const upper = stack.slice(1);
        const ks = upper.map((l) => l.k);
        const ss = upper.map((l) => l.s);
        const count = upper.length;
        const los = new Array<number>(count).fill(0);
        const his = new Array<number>(count).fill(0);
        const top = topIndex(stack[stack.length - 1]!.side);
        const side = runIR(receptiveFieldImperativeIR, 'fieldSide', [ks, ss, count, top, los, his]);
        const steps = descendFields(stack);
        expect(side).toBe(steps[steps.length - 1]!.side);
        // steps 는 위에서 아래 차례 — 걸음 j 는 층 count − j 의 창이 기대는 구간
        steps.forEach((s, j) => {
          const i = count - 1 - j;
          expect([los[i], his[i]]).toEqual([s.rowLo, s.rowHi]);
          expect([los[i], his[i]]).toEqual([s.colLo, s.colHi]);
        });
        expect(count).toBeLessThanOrEqual(5);
        expect(Math.max(...his)).toBeLessThanOrEqual(17);
      });
    }
  }
});

describe('receptive-field — 사다리', () => {
  it('사다리가 손잡이 구간과 같다', () => {
    const d = data();
    const controls = (receptiveFieldFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
    const seg = (name: string) => {
      const c = controls.find((x) => x.name === name);
      if (!c) throw new Error(name);
      return c.segments as Array<{ value: number; default?: boolean }>;
    };
    expect(seg('layers').map((s) => s.value)).toEqual(d.layersLadder);
    expect(seg('pool').map((s) => s.value)).toEqual(d.poolLadder);
    expect(seg('layers').find((s) => s.default)?.value).toBe(d.layers);
    expect(seg('pool').find((s) => s.default)?.value).toBe(d.usePool);
    expect(d.layersLadder).toEqual([1, 2, 3]);
    expect(d.poolLadder).toEqual([0, 1]);
  });
});

/** 알고리즘을 가짜 ctx 로 돌려 회차마다 계기 끝값 · phase 차례를 모은다. */
async function runRounds(inputs: ReactiveInputEvent[]) {
  const metrics = new Map<string, number>();
  const rounds: Array<{ metrics: Record<string, number>; phases: string[] }> = [];
  let phases: string[] = [];
  let cancelled = false;
  const snapshot = () => Object.fromEntries(metrics);
  const ctx = {
    data: structuredClone(receptiveFieldFacet.initialData),
    get cancelled() {
      return cancelled;
    },
    async emit(e: { type: string; payload?: unknown }) {
      if (e.type === 'phase') phases.push((e.payload as { phase: string }).phase);
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      // 사다리 밖 입력을 흘린 뒤 다시 기다리는 것은 새 판이 아니다
      if (phases.length > 0) rounds.push({ metrics: snapshot(), phases });
      phases = [];
      const next = inputs.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
  } as unknown as ReactiveContext<ReceptiveFieldData>;
  await receptiveFieldAlgorithm(ctx as FacetContext<ReceptiveFieldData>);
  return rounds;
}

describe('receptive-field — 회차별 계기', () => {
  it('L3 있음 → L3 없음 → L3 있음', async () => {
    const rounds = await runRounds([
      { type: 'pool', payload: { value: 0 } },
      { type: 'pool', payload: { value: 1 } },
    ]);
    expect(rounds.map((r) => r.metrics)).toEqual([
      { 'field-side': 18, 'field-cells': 324, weights: 27 },
      { 'field-side': 7, 'field-cells': 49, weights: 27 },
      { 'field-side': 18, 'field-cells': 324, weights: 27 },
    ]);
    expect(rounds[0]!.phases).toEqual(['top-cell', 'descend', 'descend', 'descend', 'descend', 'field-size']);
    expect(rounds[1]!.phases).toEqual(['top-cell', 'descend', 'descend', 'field-size']);
  });

  it('층 수를 돌린다 — L1 · L2 있음 · L2 없음', async () => {
    const rounds = await runRounds([
      { type: 'layers', payload: { value: 1 } },
      { type: 'layers', payload: { value: 2 } },
      { type: 'pool', payload: { value: 0 } },
      { type: 'other', payload: { value: 9 } }, // 우리 것이 아닌 입력 — 흘린다
    ]);
    expect(rounds.map((r) => r.metrics)).toEqual([
      { 'field-side': 18, 'field-cells': 324, weights: 27 },
      { 'field-side': 3, 'field-cells': 9, weights: 9 },
      { 'field-side': 8, 'field-cells': 64, weights: 18 },
      { 'field-side': 5, 'field-cells': 25, weights: 18 },
    ]);
    expect(rounds[1]!.phases).toEqual(['top-cell', 'field-size']);
  });

  it('제 손잡이의 사다리 밖 값 · 수 아닌 값은 던진다', async () => {
    await expect(runRounds([{ type: 'layers', payload: { value: 9 } }])).rejects.toThrow(/사다리/);
    await expect(runRounds([{ type: 'pool', payload: { value: '1' } }])).rejects.toThrow(/수가 아니다/);
  });
});
