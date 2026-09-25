// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  computePhysicalLayer,
  physicalLayerAlgorithm,
  physicalLayerFacet,
  physicalLayerImperativeIR,
  physicalLayerStageView,
  type PhysicalLayerData,
} from '../src/index.js';

const data = physicalLayerFacet.initialData as unknown as PhysicalLayerData;

/** 사양 실측표 — [선 위 바이트, 채움, [신호 칸, 뒤집힘, 가장 긴 평평] × (NRZ · NRZI · 맨체스터)] */
const TABLE: [number, number, [number, number, number][]][] = [
  [7, 0, [[56, 26, 6], [56, 23, 6], [112, 85, 1]]],
  [7, 0, [[56, 4, 42], [56, 12, 43], [112, 107, 1]]],
  [7, 0, [[56, 6, 40], [56, 52, 2], [112, 105, 1]]],
  [12, 5, [[96, 44, 6], [96, 67, 3], [192, 147, 1]]],
];
/** 가장 긴 평평이 놓인 자리 (반 칸 첫 색인, 길이) */
const FLAT_AT: [number, number][][] = [
  [[2, 12], [66, 12], [1, 2]],
  [[14, 84], [12, 86], [1, 2]],
  [[16, 80], [12, 4], [1, 2]],
  [[2, 12], [12, 6], [1, 2]],
];
const WIRE = [
  '7E 48 49 21 41 42 7E',
  '7E 00 00 00 00 00 7E',
  '7E FF FF FF FF FF 7E',
  '7E 7D 5E 7D 5E 7D 5E 7D 5E 7D 5E 7E',
];
const hex = (xs: number[]): string => xs.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

function knob(action: string) {
  const ctrls = (physicalLayerFacet.blocks.controls as { controls: { action?: string; segments?: { value: number }[] }[] }).controls;
  const k = ctrls.find((c) => c.action === action);
  if (!k?.segments) throw new Error(`손잡이 ${action} 가 없다`);
  return k.segments.map((s) => s.value);
}

describe('physical-layer', () => {
  it('사다리가 segments 와 같다', () => {
    expect(knob('scheme')).toEqual(data.schemes.map((_, i) => i));
    expect(knob('payload')).toEqual(data.payloads.map((_, i) => i));
    expect(data.schemes).toEqual(['nrz', 'nrzi', 'manchester']);
    expect(data.payloads).toHaveLength(4);
    for (const p of data.payloads) expect(p).toHaveLength(5);
  });

  it('모든 조합에서 algorithm 이 사양 표와 같다', () => {
    for (let p = 0; p < 4; p++) {
      for (let s = 0; s < 3; s++) {
        const r = computePhysicalLayer(data.payloads[p]!, s, data.flag, data.escape);
        const [w, stuffed, row] = TABLE[p]!;
        expect(r.wire.length).toBe(w);
        expect(r.stuffed).toBe(stuffed);
        expect(hex(r.wire)).toBe(WIRE[p]);
        expect([r.signalCells, r.transitions, r.flatBits]).toEqual(row[s]);
        expect([r.flatStart, r.flatHalf]).toEqual(FLAT_AT[p]![s]);
        expect(r.recovered).toEqual(data.payloads[p]);
        expect(r.reads).toHaveLength(w);
      }
    }
  });

  it('IR 의 답이 모든 조합에서 algorithm 과 같다', () => {
    for (let p = 0; p < 4; p++) {
      for (let s = 0; s < 3; s++) {
        const payload = data.payloads[p]!;
        const wire = new Array(2 * payload.length + 2).fill(0);
        // 선 위 가장 큰 길이 12 바이트 → 반 칸 192 칸
        const half = new Array(16 * wire.length).fill(0);
        const got = new Array(payload.length).fill(0);
        const report = [0, 0, 0, 0];
        const g = runIR(physicalLayerImperativeIR, 'physicalLayer', [[...payload], s, wire, half, got, report]);
        const r = computePhysicalLayer(payload, s, data.flag, data.escape);
        expect(g).toBe(5);
        expect(got).toEqual(payload);
        expect(report).toEqual([r.wire.length, r.transitions, r.flatBits, r.signalCells]);
        expect(wire.slice(0, r.wire.length)).toEqual(r.wire);
        expect(half.slice(0, r.half.length)).toEqual(r.half);
      }
    }
  });

  it('손잡이 A → B → A 에서 회차마다 계기가 표와 같다', async () => {
    const metrics: Record<string, number> = {};
    const inputs = [
      { type: 'scheme', payload: { value: 2 } },
      { type: 'payload', payload: { value: 3 } },
      { type: 'scheme', payload: { value: 0 } },
      { type: 'payload', payload: { value: 1 } },
    ];
    const rounds: Record<string, number>[] = [];
    let cancelled = false;
    const ctx = {
      data,
      get cancelled() {
        return cancelled;
      },
      async emit() {},
      metric(name: string, delta: number | 'inc') {
        metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
      },
      async sleep() {
        return !cancelled;
      },
      async waitForInput() {
        rounds.push({ ...metrics });
        const next = inputs.shift();
        if (!next) {
          cancelled = true;
          return { type: 'none' };
        }
        return next;
      },
      pollInput() {
        return null;
      },
    };
    await physicalLayerAlgorithm(ctx as never);
    const row = (w: number, cells: number, flips: number, flat: number) => ({
      'wire-bytes': w,
      'signal-cells': cells,
      transitions: flips,
      'longest-flat': flat,
      'recovered-bytes': 5,
    });
    expect(rounds).toEqual([
      row(7, 56, 4, 42), // NRZ · 00…00
      row(7, 112, 107, 1), // 맨체스터 · 00…00
      row(12, 192, 147, 1), // 맨체스터 · 7E…7E
      row(12, 96, 44, 6), // NRZ · 7E…7E
      row(7, 56, 4, 42), // NRZ · 00…00 (되돌림)
    ]);
  });

  it('사다리 밖 손잡이 값은 던진다', async () => {
    let n = 0;
    const ctx = {
      data,
      cancelled: false,
      async emit() {},
      metric() {},
      async sleep() {
        return true;
      },
      async waitForInput() {
        n += 1;
        return { type: 'scheme', payload: { value: 3 } };
      },
      pollInput() {
        return null;
      },
    };
    await expect(physicalLayerAlgorithm(ctx as never)).rejects.toThrow(/사다리 밖/);
    expect(n).toBe(1);
  });

  it('stage 는 가장 큰 판을 담고 마운트 뒤 세로를 바꾸지 않는다', async () => {
    const container = document.createElement('div');
    const inst = mountView(physicalLayerStageView, container, { config: {}, isInstant: () => true }) as unknown as {
      showFrame: (f: unknown, ms: number) => Promise<void>;
      showLine: (l: unknown, ms: number) => Promise<void>;
      showRead: (r: unknown, ms: number) => Promise<void>;
      destroy: () => void;
    };
    const svg = container.querySelector('svg');
    const before = svg?.getAttribute('viewBox');
    const r = computePhysicalLayer(data.payloads[3]!, 2, data.flag, data.escape);
    await inst.showFrame({ data: data.payloads[3], wire: r.wire, kinds: r.kinds, dataAt: r.dataAt, dataSpan: r.dataSpan }, 0);
    await inst.showLine({ half: r.half, cellsPerBit: r.cellsPerBit, flatStart: r.flatStart, flatHalf: r.flatHalf, flatBits: r.flatBits }, 0);
    for (const rd of r.reads) {
      await inst.showRead({ index: rd.index, state: rd.state, recovered: [], sent: data.payloads[3], closed: rd.branch === 'close-frame' }, 0);
    }
    expect(svg?.getAttribute('viewBox')).toBe(before);
    inst.destroy();
  });
});
