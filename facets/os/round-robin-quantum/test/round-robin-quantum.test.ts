// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import type { FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  avg100,
  roundRobinQuantumAlgorithm,
  roundRobinQuantumFacet,
  roundRobinQuantumImperativeIR,
  simulateRoundRobin,
  toSteps,
  type RoundRobinQuantumData,
} from '../src/index.js';

const data = roundRobinQuantumFacet.initialData as unknown as RoundRobinQuantumData;
const procs = data.procs;

/** 사양 대조표 — (몫, 비용) → 바뀜 · 바꾸는 틱 · 첫 응답 합 · 끝 · 걸음 · 처음 돈 틱 − 도착 · 끝 */
const SPEC: Record<string, { sw: number; swt: number; resp: number; end: number; steps: number; first: number[]; fin: number[] }> = {
  '1,0': { sw: 11, swt: 0, resp: 4, end: 12, steps: 21, first: [0, 1, 1, 2], fin: [12, 11, 7, 5] },
  '2,0': { sw: 6, swt: 0, resp: 9, end: 12, steps: 12, first: [0, 2, 3, 4], fin: [12, 11, 6, 7] },
  '3,0': { sw: 5, swt: 0, resp: 14, end: 12, steps: 11, first: [0, 3, 5, 6], fin: [11, 12, 8, 9] },
  '4,0': { sw: 4, swt: 0, resp: 19, end: 12, steps: 9, first: [0, 4, 7, 8], fin: [12, 8, 10, 11] },
  '5,0': { sw: 3, swt: 0, resp: 22, end: 12, steps: 7, first: [0, 5, 8, 9], fin: [5, 9, 11, 12] },
  '1,1': { sw: 11, swt: 11, resp: 11, end: 23, steps: 22, first: [0, 2, 3, 6], fin: [23, 21, 13, 9] },
  '2,1': { sw: 6, swt: 6, resp: 15, end: 18, steps: 12, first: [0, 3, 5, 7], fin: [18, 16, 8, 10] },
  '3,1': { sw: 5, swt: 5, resp: 20, end: 17, steps: 11, first: [0, 4, 7, 9], fin: [15, 17, 10, 12] },
  '4,1': { sw: 4, swt: 4, resp: 25, end: 16, steps: 9, first: [0, 5, 9, 11], fin: [16, 9, 12, 14] },
  '5,1': { sw: 3, swt: 3, resp: 28, end: 15, steps: 7, first: [0, 6, 10, 12], fin: [5, 10, 13, 15] },
};
const AVG: Record<string, number> = { '1,0': 100, '2,0': 225, '3,0': 350, '4,0': 475, '5,0': 550, '1,1': 275, '2,1': 375, '3,1': 500, '4,1': 625, '5,1': 700 };

const combos: [number, number][] = [];
for (const c of data.costLadder) for (const q of data.quantumLadder) combos.push([q, c]);

describe('round-robin-quantum', () => {
  it('사다리가 손잡이 구간과 같고, 몫의 끝값이 가장 긴 일의 길이다', () => {
    const controls = (roundRobinQuantumFacet.blocks.controls as { controls: { name?: string; segments?: { value: number }[] }[] }).controls;
    const seg = (name: string) => controls.find((c) => c.name === name)?.segments?.map((s) => s.value);
    expect(seg('quantum')).toEqual(data.quantumLadder);
    expect(seg('cost')).toEqual(data.costLadder);
    expect(data.quantumLadder).toEqual([1, 2, 3, 4, 5]);
    expect(data.costLadder).toEqual([0, 1]);
    expect(procs.length).toBe(4);
    expect(Math.max(...data.quantumLadder)).toBe(Math.max(...procs.map((p) => p.burst)));
    expect(combos.length).toBe(10);
  });

  it('열 조합의 셈이 사양 대조표와 같다', () => {
    for (const [q, c] of combos) {
      const s = SPEC[`${q},${c}`];
      const run = simulateRoundRobin(procs, q, c);
      expect(run.switches, `${q},${c}`).toBe(s.sw);
      expect(run.switchTicks).toBe(s.swt);
      expect(run.endTick).toBe(s.end);
      expect(toSteps(run).length).toBe(s.steps);
      expect(run.start.map((v, i) => v - procs[i].arrive)).toEqual(s.first);
      expect(run.finish).toEqual(s.fin);
      const resp = run.start.reduce((a, v, i) => a + v - procs[i].arrive, 0);
      expect(resp).toBe(s.resp);
      expect(avg100(resp, procs.length)).toBe(AVG[`${q},${c}`]);
    }
  });

  it('IR 의 답(바뀜)과 start · finish 가 열 조합 모두에서 알고리즘과 같다', () => {
    for (const [q, c] of combos) {
      const run = simulateRoundRobin(procs, q, c);
      const n = procs.length;
      const start = new Array<number>(n).fill(0);
      const finish = new Array<number>(n).fill(0);
      const ans = runIR(roundRobinQuantumImperativeIR, 'roundRobin', [
        q,
        c,
        procs.map((p) => p.arrive),
        procs.map((p) => p.burst),
        new Array<number>(n).fill(0),
        new Array<number>(n).fill(0),
        new Array<number>(n).fill(0),
        start,
        finish,
        n,
      ]);
      expect(ans, `${q},${c}`).toBe(run.switches);
      expect(start).toEqual(run.start);
      expect(finish).toEqual(run.finish);
    }
  });

  it('회차마다 계기가 0 에서 다시 쌓인다 — (2,0) → (1,1) → (2,0)', async () => {
    const inputs = [
      { type: 'quantum', payload: { value: 1, segmentIndex: 0, quantum: '1', cost: '1' } },
      { type: 'quantum', payload: { value: 2, segmentIndex: 1, quantum: '2', cost: '0' } },
      { type: 'cost', payload: { value: 1, segmentIndex: 1, quantum: '2', cost: '1' } },
      { type: 'cost', payload: { value: 0, segmentIndex: 0 } },
    ];
    const totals = new Map<string, number>();
    const rounds: Record<string, number>[] = [];
    const phases: string[] = [];
    let cancelled = false;
    const ctx = {
      data: structuredClone(data),
      get cancelled() {
        return cancelled;
      },
      async emit(e: FacetRuntimeEvent) {
        if (e.type === 'phase') phases.push((e.payload as { phase: string }).phase);
        if (e.type === 'done') rounds.push(Object.fromEntries(totals));
      },
      metric(name: string, delta: number | 'inc') {
        totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
      },
      async sleep() {
        return !cancelled;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        const next = inputs.shift();
        if (!next) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return next;
      },
    };
    await roundRobinQuantumAlgorithm(ctx as never);
    const pick = (r: Record<string, number>) => [r['switches'], r['switch-ticks'], r['response-total']];
    // 판: (2,0) → (1,1) → (2,0) → (2,1) → (2,0) — payload 가 둘째 손잡이의 지금 값을 함께 싣는다 (마지막은 싣지 않는다)
    expect(rounds.map(pick)).toEqual([
      [6, 0, 9],
      [11, 11, 11],
      [6, 0, 9],
      [6, 6, 15],
      [6, 0, 9],
    ]);
    expect(new Set(phases)).toEqual(new Set(['arrive', 'dispatch', 'finish', 'requeue', 'switch']));
  });

  it('사다리 밖의 손잡이 값은 던진다', async () => {
    let cancelled = false;
    let sent = false;
    const ctx = {
      data: structuredClone(data),
      get cancelled() {
        return cancelled;
      },
      async emit() {},
      metric() {},
      async sleep() {
        return true;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        if (sent) {
          cancelled = true;
          throw new Error('cancelled');
        }
        sent = true;
        return { type: 'quantum', payload: { value: 7 } };
      },
    };
    await expect(roundRobinQuantumAlgorithm(ctx as never)).rejects.toThrow(/사다리 밖/);
  });
});
