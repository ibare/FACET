import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import type { ReactiveContext, FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  pureFunctionAlgorithm,
  pureFunctionFacet,
  pureFunctionImperativeIR,
  type PureFunctionData,
} from '../src/index.js';

const data = pureFunctionFacet.initialData as unknown as PureFunctionData;

type Round = {
  results: number[];
  original: number[];
  metrics: Record<string, number>;
  steps: number;
  phases: string[];
};

/** 알고리즘을 입력 목록대로 돌려 판마다 화면에 내는 값과 계기(누적의 지금 값)를 모은다. */
async function play(inputs: { type: string; value: number }[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const metrics: Record<string, number> = {};
  let current: Round = { results: [], original: [], metrics: {}, steps: 0, phases: [] };
  let cancelled = false;
  const queue = [...inputs];
  let pending: string | null = null;
  const ctx: ReactiveContext<PureFunctionData> = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      if (e.type === 'phase') {
        const p = e.payload as { phase: string };
        pending = p.phase;
        return;
      }
      const p = e.payload as Record<string, unknown>;
      if (e.type === 'round') {
        current = { results: [0, 0, 0], original: [], metrics: {}, steps: 0, phases: [] };
      }
      current.steps += 1;
      current.phases.push(pending ?? '-');
      pending = null;
      if (e.type === 'sum') current.results[p.call as number] = p.sum as number;
      if (e.type === 'done') {
        current.original = p.values as number[];
        current.metrics = { ...metrics };
        rounds.push(current);
      }
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput<T>() {
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        return { type: 'none', payload: {} } as T;
      }
      return { type: next.type, payload: { value: next.value, segmentIndex: next.value } } as T;
    },
    pollInput() {
      return null;
    },
  } as ReactiveContext<PureFunctionData>;
  await pureFunctionAlgorithm(ctx);
  return rounds;
}

/** 사양 표 — 차례 value → [A, B, C 합, 끝의 원본, original-sum] */
const MODIFY: Record<number, [number[], number[], number]> = {
  0: [[16, 40, 50], [32, 16, 2], 50],
  1: [[16, 50, 26], [32, 16, 2], 50],
  2: [[25, 20, 35], [17, 16, 2], 35],
  3: [[35, 20, 30], [17, 16, 2], 35],
  4: [[26, 50, 21], [32, 16, 2], 50],
  5: [[35, 30, 21], [17, 16, 2], 35],
};

function irRun(orderValue: number, mode: number) {
  const xs = [...data.cart];
  const fresh = new Array<number>(xs.length).fill(0);
  const results = new Array<number>(data.calls.length).fill(0);
  const ret = runIR(pureFunctionImperativeIR, 'runCalls', [
    xs,
    fresh,
    [...data.orders[orderValue]!],
    data.calls.map((c) => c.slot),
    data.calls.map((c) => c.mul),
    data.calls.map((c) => c.add),
    mode === 1,
    results,
  ]);
  return { ret, xs, results };
}

describe('pure-function', () => {
  it('사다리가 손잡이 segments 와 같다', () => {
    const controls = (pureFunctionFacet.blocks.controls as { controls: Record<string, unknown>[] }).controls;
    const seg = (action: string) =>
      (controls.find((c) => c.action === action)!.segments as { value: number }[]).map((s) => s.value);
    expect(seg('order')).toEqual(data.orders.map((_, i) => i));
    expect(seg('mode')).toEqual(data.modes);
    expect(data.orders).toHaveLength(6);
    expect(data.orders[5]).toEqual([2, 1, 0]);
    expect(data.cart).toHaveLength(3);
    expect(data.calls).toHaveLength(3);
  });

  it('12 조합 모두 IR 과 알고리즘이 같은 답을 내고 사양 표와 같다', async () => {
    for (let mode = 0; mode < 2; mode += 1) {
      for (let order = 0; order < 6; order += 1) {
        const inputs = [
          { type: 'mode', value: mode },
          { type: 'order', value: order },
        ];
        const rounds = await play(inputs);
        const last = rounds[rounds.length - 1]!;
        const ir = irRun(order, mode);
        expect(ir.results).toEqual(last.results);
        expect(ir.xs).toEqual(last.original);
        expect(ir.ret).toBe(last.metrics['original-sum']);
        if (mode === 0) {
          const [res, orig, sum] = MODIFY[order]!;
          expect(last.results).toEqual(res);
          expect(last.original).toEqual(orig);
          expect(last.metrics['original-sum']).toBe(sum);
          expect(last.steps).toBe(11);
        } else {
          expect(last.results).toEqual([16, 20, 21]);
          expect(last.original).toEqual([3, 6, 2]);
          expect(last.metrics['original-sum']).toBe(11);
          expect(last.steps).toBe(14);
        }
      }
    }
  });

  it('회차별 계기 — ABC 고치기 → ABC 새로 → ABC 고치기 → CBA 고치기', async () => {
    const rounds = await play([
      { type: 'mode', value: 1 },
      { type: 'mode', value: 0 },
      { type: 'order', value: 5 },
    ]);
    const pick = (r: Round) => [r.metrics['writes-to-original'], r.metrics['copies'], r.metrics['original-sum']];
    expect(rounds.map(pick)).toEqual([
      [3, 0, 50],
      [0, 3, 11],
      [3, 0, 50],
      [3, 0, 35],
    ]);
  });

  it('걸음마다 켜지는 phase — 보기 ACB 고치기 · 새로 만들기', async () => {
    const rounds = await play([
      { type: 'order', value: 1 },
      { type: 'mode', value: 1 },
    ]);
    expect(rounds[1]!.phases).toEqual([
      '-', 'call', 'write-in-place', 'sum', 'call', 'write-in-place', 'sum', 'call', 'write-in-place', 'sum', 'result',
    ]);
    expect(rounds[2]!.phases).toEqual([
      '-', 'call', 'copy', 'write-copy', 'sum', 'call', 'copy', 'write-copy', 'sum', 'call', 'copy', 'write-copy', 'sum',
      'result',
    ]);
  });

  it('사다리 밖 손잡이 값은 던진다', async () => {
    await expect(play([{ type: 'order', value: 6 }])).rejects.toThrow();
    await expect(play([{ type: 'mode', value: 2 }])).rejects.toThrow();
  });
});
