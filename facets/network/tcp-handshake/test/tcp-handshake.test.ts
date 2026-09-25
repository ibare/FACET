// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView } from '@ffacet/core/runtime';
import {
  receiveInOrder,
  simulateRound,
  tcpHandshakeFacet,
  tcpHandshakeImperativeIR,
  tcpHandshakeStageView,
  type TcpHandshakeData,
  type TcpHandshakeStage,
} from '../src/index.js';

const data = tcpHandshakeFacet.initialData as TcpHandshakeData;

type Row = { received: number; last: number; extra: number; resent: number; lastTick: number; hand: number[] };
// 사양 실측표 (sim.py) — 대조용
const TABLE: Record<string, Row> = {
  'udp-0': { received: 6, last: 8, extra: 0, resent: 0, lastTick: 8, hand: [3, 4, 5, 7, 6, 8] },
  'udp-1': { received: 5, last: 8, extra: 0, resent: 0, lastTick: 8, hand: [3, 4, -1, 7, 6, 8] },
  'udp-2': { received: 4, last: 8, extra: 0, resent: 0, lastTick: 8, hand: [3, 4, -1, 7, -1, 8] },
  'tcp-0': { received: 6, last: 12, extra: 9, resent: 0, lastTick: 14, hand: [7, 8, 9, 11, 11, 12] },
  'tcp-1': { received: 6, last: 15, extra: 10, resent: 1, lastTick: 17, hand: [7, 8, 15, 15, 15, 15] },
  'tcp-2': { received: 6, last: 18, extra: 11, resent: 2, lastTick: 20, hand: [7, 8, 15, 15, 18, 18] },
};

function controls(): Array<{ name?: string; segments?: Array<{ value: number; default?: boolean }> }> {
  const block = tcpHandshakeFacet.blocks['controls'] as { controls: unknown[] };
  return block.controls as Array<{ name?: string; segments?: Array<{ value: number; default?: boolean }> }>;
}

describe('tcp-handshake', () => {
  it('사다리가 손잡이 구간과 같고 데이터 길이가 잠겨 있다', () => {
    const method = controls().find((c) => c.name === 'method');
    const loss = controls().find((c) => c.name === 'lossCount');
    expect(method?.segments?.map((s) => s.value)).toEqual(data.methods.map((_, i) => i));
    expect(loss?.segments?.map((s) => s.value)).toEqual(data.lossLadder);
    expect(method?.segments?.find((s) => s.default)?.value).toBe(data.method);
    expect(loss?.segments?.find((s) => s.default)?.value).toBe(data.lossCount);
    expect(data.segments).toHaveLength(6);
    expect(data.delays).toHaveLength(6);
    expect(data.lossLadder[data.lossLadder.length - 1]).toBe(2);
    expect(data.lostOrder).toHaveLength(2);
  });

  it('여섯 판 모두 사양 표와 같다', () => {
    for (const [m, method] of data.methods.entries()) {
      for (const k of data.lossLadder) {
        const r = simulateRound(data, m, k);
        const want = TABLE[`${method}-${k}`]!;
        expect(r.received).toBe(want.received);
        expect(r.lastDelivery).toBe(want.last);
        expect(r.extra).toBe(want.extra);
        expect(r.resent).toBe(want.resent);
        expect(r.lastTick).toBe(want.lastTick);
        expect(r.frames).toHaveLength(want.lastTick + 1);
        expect(r.handTick).toEqual(want.hand);
      }
    }
  });

  it('IR receiveInOrder 가 모든 조합에서 화면의 넘긴 틱 · 받은 수와 같다', () => {
    for (let m = 0; m < data.methods.length; m++) {
      for (const k of data.lossLadder) {
        const r = simulateRound(data, m, k);
        const n = data.segments.length;
        const held = Array.from({ length: n }, () => 0);
        const handTick = Array.from({ length: n }, () => -1);
        const got = runIR(tcpHandshakeImperativeIR, 'receiveInOrder', [[...r.arrive], m, held, handTick]);
        expect(got).toBe(r.received);
        expect(handTick).toEqual(r.handTick);
        const heldTs = Array.from({ length: n }, () => 0);
        const handTs = Array.from({ length: n }, () => -1);
        expect(receiveInOrder([...r.arrive], m, heldTs, handTs)).toBe(r.received);
        expect(handTs).toEqual(r.handTick);
      }
    }
  });

  it('회차마다 계기의 판 끝 값이 표와 같다 (TCP 1 → UDP 1 → TCP 1)', () => {
    const tcp = data.methods.indexOf('tcp');
    const udp = data.methods.indexOf('udp');
    for (const [m, key] of [
      [tcp, 'tcp-1'],
      [udp, 'udp-1'],
      [tcp, 'tcp-1'],
    ] as const) {
      const r = simulateRound(data, m, 1);
      let received = 0;
      let last = 0;
      let extra = 0;
      for (const f of r.frames) {
        received += f.handed.length;
        if (f.handed.length > 0) last = f.tick;
        extra += f.extraSent;
      }
      expect([received, last, extra]).toEqual([TABLE[key]!.received, TABLE[key]!.last, TABLE[key]!.extra]);
    }
  });

  it('stage 가 초기 데이터 없이도 마운트되고 한 판을 그린다', () => {
    const container = document.createElement('div');
    const empty = mountView(tcpHandshakeStageView, container, { config: {} });
    empty.destroy();
    const inst = mountView(tcpHandshakeStageView, container, {
      config: {},
      initialData: data as unknown as Record<string, unknown>,
    }) as unknown as TcpHandshakeStage;
    inst.startRound(data.segments, 20, false);
    expect(container.textContent).toContain('d6');
    inst.destroy();
  });
});
