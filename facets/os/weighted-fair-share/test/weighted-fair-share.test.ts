import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import type { FacetRuntimeEvent, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';
import {
  simulateBoard,
  sharePct,
  weightedFairShareAlgorithm,
  weightedFairShareFacet,
  weightedFairShareImperativeIR,
  type WeightedFairShareData,
} from '../src/index.js';

const data = weightedFairShareFacet.initialData as WeightedFairShareData;

/** 사양 표 — (B 무게, C 출발) 마다 합 · 앞 12 틱 B · 뒤 12 틱 C · 판 끝 가상 시간 · 동률 · 차례. */
const TABLE: {
  w: number;
  s: number;
  ran: number[];
  firstB: number;
  pct: number;
  lateRun: number;
  vrs: number[];
  ties: number;
  order: string;
}[] = [
  { w: 1, s: 0, ran: [8, 8, 8], firstB: 6, pct: 50, lateRun: 8, vrs: [48, 48, 48], ties: 10, order: 'ababababababccccccabcabc' },
  { w: 2, s: 0, ran: [6, 12, 6], firstB: 8, pct: 67, lateRun: 6, vrs: [36, 36, 36], ties: 8, order: 'abbabbabbabbccccabcbacbb' },
  { w: 3, s: 0, ran: [5, 14, 5], firstB: 9, pct: 75, lateRun: 5, vrs: [30, 28, 30], ties: 7, order: 'abbbabbbabbbcccabcbbacbb' },
  { w: 1, s: 1, ran: [10, 10, 4], firstB: 6, pct: 50, lateRun: 4, vrs: [60, 60, 60], ties: 14, order: 'abababababab' + 'cabcabcabcab' },
  { w: 2, s: 1, ran: [7, 14, 3], firstB: 8, pct: 67, lateRun: 3, vrs: [42, 42, 42], ties: 10, order: 'abbabbabbabbcabbcabbcabb' },
  { w: 3, s: 1, ran: [6, 15, 3], firstB: 9, pct: 75, lateRun: 3, vrs: [36, 30, 36], ties: 9, order: 'abbbabbbabbbcabbbcabbbca' },
];

describe('weighted-fair-share — 사양 표와 대조', () => {
  it('사다리가 손잡이 segments 와 같고 데이터 모양이 사양과 같다', () => {
    const controls = (weightedFairShareFacet.blocks.controls as { controls: { action: string; segments?: { value: number }[] }[] }).controls;
    const seg = (action: string) => controls.find((c) => c.action === action)?.segments?.map((s) => s.value);
    expect(seg('weight')).toEqual(data.weightLadder);
    expect(seg('cStart')).toEqual(data.startLadder);
    expect(data.weightLadder).toEqual([1, 2, 3]);
    expect(data.startLadder).toEqual([0, 1]);
    expect(data.procs).toHaveLength(3);
    expect(data.ticks).toBe(24);
    expect(data.arriveAt).toBe(12);
  });

  for (const row of TABLE) {
    it(`B 무게 ${row.w} · C 출발 ${row.s}`, () => {
      const b = simulateBoard(data, row.w, row.s);
      expect(b.ran).toEqual(row.ran);
      expect(b.firstB).toBe(row.firstB);
      expect(sharePct(b.firstB, data.arriveAt)).toBe(row.pct);
      expect(b.lateRun).toBe(row.lateRun);
      expect(b.vrs).toEqual(row.vrs);
      expect(b.tieCount).toBe(row.ties);
      const order = b.steps.flatMap((s) => (s.kind === 'tick' ? [data.procs[s.proc]] : [])).join('');
      expect(order).toBe(row.order);
      expect(b.steps).toHaveLength(data.ticks + 1);
      const arrive = b.steps.find((s) => s.kind === 'arrive');
      expect(arrive?.kind === 'arrive' ? arrive.start : null).toBe(row.s === 0 ? 0 : { 1: 36, 2: 24, 3: 18 }[row.w]);
    });
  }
});

describe('weighted-fair-share — IR ↔ algorithm 전 조합', () => {
  for (const w of data.weightLadder) {
    for (const s of data.startLadder) {
      it(`B 무게 ${w} · C 출발 ${s}`, () => {
        const b = simulateBoard(data, w, s);
        const weight = [1, w, 1];
        const vr = [0, 0, 0];
        const lastRan = [-1, -1, -1];
        const present = [1, 1, 0];
        const ran = [0, 0, 0];
        const answer = runIR(weightedFairShareImperativeIR, 'fairShare', [s, weight, vr, lastRan, present, ran, data.ticks, data.arriveAt, data.unit]);
        expect(answer).toBe(b.ran[1]);
        expect(ran).toEqual(b.ran);
        expect(vr).toEqual(b.vrs);
        expect(present).toEqual([1, 1, 1]);
        expect(Math.max(...vr)).toBeLessThanOrEqual(66);
      });
    }
  }
});

describe('weighted-fair-share — 회차별 계기 (A → B → A)', () => {
  it('(2, 가장 작은 값) → (2, 0) → (2, 가장 작은 값)', async () => {
    const inputs: ReactiveInputEvent[] = [
      { type: 'noise', payload: { value: 9 } },
      { type: 'cStart', payload: { value: 0, segmentIndex: 0 } },
      { type: 'cStart', payload: { value: 1, segmentIndex: 1 } },
    ];
    const metrics = new Map<string, number>();
    const perRound: Record<string, number>[] = [];
    const stepsPerRound: number[] = [];
    let steps = 0;
    let cancelled = false;
    const ctx = {
      data: structuredClone(data),
      get cancelled() {
        return cancelled;
      },
      async emit(e: FacetRuntimeEvent) {
        if (e.type === 'round') steps = 0;
        if (e.type === 'share') {
          perRound.push(Object.fromEntries(metrics));
          stepsPerRound.push(steps + 1);
        }
      },
      metric(name: string, delta: number | 'inc') {
        metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
      },
      async sleep() {
        steps += 1;
        return true;
      },
      async waitForInput() {
        const next = inputs.shift();
        if (next === undefined) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return next;
      },
      pollInput() {
        return null;
      },
    } as unknown as ReactiveContext<WeightedFairShareData>;
    await weightedFairShareAlgorithm(ctx);
    expect(perRound).toEqual([
      { 'a-ticks': 7, 'b-ticks': 14, 'c-ticks': 3 },
      { 'a-ticks': 6, 'b-ticks': 12, 'c-ticks': 6 },
      { 'a-ticks': 7, 'b-ticks': 14, 'c-ticks': 3 },
    ]);
    expect(stepsPerRound).toEqual([26, 26, 26]);
  });

  it('사다리 밖의 손잡이 값은 던진다', async () => {
    let cancelled = false;
    const inputs: ReactiveInputEvent[] = [{ type: 'weight', payload: { value: 4 } }];
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
      async waitForInput() {
        const next = inputs.shift();
        if (next === undefined) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return next;
      },
      pollInput() {
        return null;
      },
    } as unknown as ReactiveContext<WeightedFairShareData>;
    await expect(weightedFairShareAlgorithm(ctx)).rejects.toThrow(/사다리 밖/);
  });
});
