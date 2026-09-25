// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  congestionControlAlgorithm,
  congestionControlFacet,
  congestionControlImperativeIR,
  congestionControlStageView,
  runRounds,
  type CongestionControlData,
  type RoundKind,
} from '../src/index.js';

const data = congestionControlFacet.initialData as CongestionControlData;

/** 사양 실측표 (sim.py) — 대조용 */
const TABLE: Record<string, { total: number; loss: number; limited: number; sent: number[] }> = {
  '8/2': { total: 53, loss: 0, limited: 14, sent: [1, 2, 4, 5, 6, 7, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2] },
  '8/4': { total: 87, loss: 0, limited: 13, sent: [1, 2, 4, 5, 6, 7, 8, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] },
  '8/6': { total: 117, loss: 3, limited: 0, sent: [1, 2, 4, 5, 6, 7, 8, 9, 4, 5, 6, 7, 8, 9, 4, 5, 6, 7, 8, 9] },
  '8/8': { total: 117, loss: 3, limited: 0, sent: [1, 2, 4, 5, 6, 7, 8, 9, 4, 5, 6, 7, 8, 9, 4, 5, 6, 7, 8, 9] },
  '8/12': { total: 117, loss: 3, limited: 0, sent: [1, 2, 4, 5, 6, 7, 8, 9, 4, 5, 6, 7, 8, 9, 4, 5, 6, 7, 8, 9] },
  '12/2': { total: 53, loss: 0, limited: 14, sent: [1, 2, 4, 5, 6, 7, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2] },
  '12/4': { total: 87, loss: 0, limited: 13, sent: [1, 2, 4, 5, 6, 7, 8, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] },
  '12/6': { total: 118, loss: 0, limited: 11, sent: [1, 2, 4, 5, 6, 7, 8, 9, 10, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6] },
  '12/8': { total: 145, loss: 0, limited: 10, sent: [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 10, 8, 8, 8, 8, 8, 8, 8, 8, 8] },
  '12/12': { total: 162, loss: 2, limited: 0, sent: [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 6, 7, 8, 9, 10, 11, 12, 13] },
};

const KIND_CODE: Record<RoundKind, number> = { 'slow-start': 0, avoid: 1, receiver: 2, loss: 3 };

function segmentsOf(action: string): number[] {
  const controls = (congestionControlFacet.blocks.controls as { controls: unknown[] }).controls;
  for (const c of controls) {
    const w = c as { action?: string; segments?: { value: number }[] };
    if (w.action === action && w.segments) return w.segments.map((s) => s.value);
  }
  throw new Error(`손잡이 ${action} 없음`);
}

describe('congestion-control', () => {
  it('사다리가 손잡이 구간과 같다', () => {
    expect(data.readLadder).toEqual(segmentsOf('readRate'));
    expect(data.capacityLadder).toEqual(segmentsOf('capacity'));
    expect(data.readLadder).toHaveLength(5);
    expect(data.readLadder[data.readLadder.length - 1]).toBe(12);
    expect(data.capacityLadder).toEqual([8, 12]);
    expect(data.rounds).toBe(20);
    expect(data.buffer).toBe(16);
  });

  for (const cap of data.capacityLadder) {
    for (const read of data.readLadder) {
      it(`C ${cap} · r ${read}: 알고리즘 = 사양 표 = IR`, () => {
        const rows = runRounds(data.rounds, read, cap, data.buffer, data.cwnd0, data.ssthresh0);
        const want = TABLE[`${cap}/${read}`]!;
        const total = rows.reduce((s, r) => s + r.delivered, 0);
        expect(rows.map((r) => r.send)).toEqual(want.sent);
        expect(total).toBe(want.total);
        expect(rows.filter((r) => r.kind === 'loss')).toHaveLength(want.loss);
        expect(rows.filter((r) => r.kind === 'receiver')).toHaveLength(want.limited);

        const sent = new Array<number>(data.rounds).fill(0);
        const kind = new Array<number>(data.rounds).fill(0);
        const irTotal = runIR(congestionControlImperativeIR, 'runRounds', [
          data.rounds,
          read,
          cap,
          data.buffer,
          data.cwnd0,
          data.ssthresh0,
          sent,
          kind,
        ]);
        expect(irTotal).toBe(total);
        expect(sent).toEqual(rows.map((r) => r.send));
        expect(kind).toEqual(rows.map((r) => KIND_CODE[r.kind]));
        expect(kind.filter((k) => k === 3)).toHaveLength(want.loss);
        expect(kind.filter((k) => k === 2)).toHaveLength(want.limited);
      });
    }
  }

  it('잃는 왕복의 자리', () => {
    const at = (cap: number, read: number) =>
      runRounds(data.rounds, read, cap, data.buffer, data.cwnd0, data.ssthresh0)
        .filter((r) => r.kind === 'loss')
        .map((r) => r.round);
    expect(at(8, 6)).toEqual([8, 14, 20]);
    expect(at(12, 12)).toEqual([12, 20]);
  });

  it('회차별 계기 — (r 8 · C 12) → (r 12 · C 12) → (r 8 · C 12)', async () => {
    const metrics = new Map<string, number>();
    const perRun: Array<Record<string, number>> = [];
    const inputs = [
      { type: 'readRate', payload: { value: 12, segmentIndex: 4, readRate: '12', capacity: '12' } },
      { type: 'readRate', payload: { value: 8, segmentIndex: 3, readRate: '8', capacity: '12' } },
    ];
    let cancelled = false;
    let rounds = 0;
    const ctx = {
      data: structuredClone(data),
      get cancelled() {
        return cancelled;
      },
      async emit(e: FacetRuntimeEvent) {
        if (e.type === 'round') {
          rounds += 1;
          if (rounds % data.rounds === 0) perRun.push(Object.fromEntries(metrics));
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
        if (!next) {
          cancelled = true;
          return { type: 'none' };
        }
        return next;
      },
    };
    await congestionControlAlgorithm(ctx as never);
    expect(perRun).toEqual([
      { 'delivered-total': 145, 'loss-rounds': 0, 'receiver-limited-rounds': 10 },
      { 'delivered-total': 162, 'loss-rounds': 2, 'receiver-limited-rounds': 0 },
      { 'delivered-total': 145, 'loss-rounds': 0, 'receiver-limited-rounds': 10 },
    ]);
  });

  it('사다리 밖 손잡이 값은 던진다', async () => {
    const ctx = {
      data: structuredClone(data),
      cancelled: false,
      async emit() {},
      metric() {},
      async sleep() {
        return true;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        return { type: 'readRate', payload: { value: 5 } };
      },
    };
    await expect(congestionControlAlgorithm(ctx as never)).rejects.toThrow(/사다리 밖/);
  });

  it('stage 는 initialData 없이도 마운트된다', () => {
    const host = document.createElement('div');
    const inst = mountView(congestionControlStageView, host, { config: {} });
    expect(inst).toBeTruthy();
    inst.destroy();
  });
});
