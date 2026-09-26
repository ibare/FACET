import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import type { FacetRuntimeEvent } from '@ffacet/core/runtime';
import { paxosAlgorithm, paxosRound, type PaxosData } from '../src/algorithm.js';
import { paxosImperativeIR } from '../src/irs.js';
import { paxosFacet } from '../src/facet.js';

const data = paxosFacet.initialData as PaxosData;
const qName = (q: number): string => data.quorums[q]!.join('·');

/** 사양의 실측표 — 대조용 (알고리즘은 이 표를 읽지 않는다) */
const SPEC: Record<string, { sent: number; end: string; value: number; at: number; rejected: number; chosen: number; inherited: number }> = {
  '0 A2·A3': { sent: 9, end: '1·(1,7) / 2·(2,9) / 2·(2,9)', value: 9, at: 8, rejected: 1, chosen: 1, inherited: 0 },
  '0 A1·A2': { sent: 9, end: '2·(2,9) / 2·(2,9) / 0·-', value: 9, at: 8, rejected: 2, chosen: 1, inherited: 0 },
  '1 A2·A3': { sent: 9, end: '1·(1,7) / 2·(2,9) / 2·(2,9)', value: 9, at: 8, rejected: 1, chosen: 1, inherited: 0 },
  '1 A1·A2': { sent: 7, end: '2·(2,7) / 2·(2,7) / 0·-', value: 7, at: 8, rejected: 1, chosen: 1, inherited: 1 },
  '2 A2·A3': { sent: 7, end: '1·(1,7) / 2·(2,7) / 2·(2,7)', value: 7, at: 4, rejected: 0, chosen: 1, inherited: 1 },
  '2 A1·A2': { sent: 7, end: '2·(2,7) / 2·(2,7) / 0·-', value: 7, at: 4, rejected: 0, chosen: 1, inherited: 1 },
};

function irAnswer(early: number, quorum: number): number {
  const [qa, qb] = data.quorums[quorum]!.map((id) => data.acceptors.indexOf(id));
  const zeros = (): number[] => data.acceptors.map(() => 0);
  const out = runIR(paxosImperativeIR, 'runPaxos', [early, qa!, qb!, zeros(), zeros(), zeros()]);
  if (typeof out !== 'number') throw new Error('runPaxos 가 수를 돌려주지 않았다');
  return out;
}

describe('paxos — 자료와 사다리', () => {
  it('사다리가 손잡이 segments 와 같고 수락자 버퍼 길이가 셋이다', () => {
    const controls = (paxosFacet.blocks.controls as { controls: { action?: string; segments?: { value: number }[] }[] }).controls;
    const seg = (action: string): number[] => {
      const c = controls.find((x) => x.action === action);
      if (!c?.segments) throw new Error(`손잡이 ${action} 가 없다`);
      return c.segments.map((s) => s.value);
    };
    expect(seg('early')).toEqual(data.earlyLadder);
    expect(seg('quorum')).toEqual(data.quorumLadder);
    expect(data.earlyLadder.at(-1)).toBe(2);
    expect(data.quorumLadder.at(-1)).toBe(1);
    expect(data.acceptors).toHaveLength(3);
    expect(data.quorums).toHaveLength(data.quorumLadder.length);
  });
});

describe('paxos — 여섯 조합', () => {
  for (const early of [0, 1, 2]) {
    for (const quorum of [0, 1]) {
      it(`${early} · ${qName(quorum)} — 사양 표 · IR 과 같다`, () => {
        const r = paxosRound(data, early, quorum);
        const spec = SPEC[`${early} ${qName(quorum)}`]!;
        const end = r.final.map((a) => `${a.promised}·${a.accepted ? `(${a.accepted[0]},${a.accepted[1]})` : '-'}`).join(' / ');
        expect(r.p2Sent).toBe(spec.sent);
        expect(end).toBe(spec.end);
        expect(r.value).toBe(spec.value);
        expect(r.chosenAt).toBe(spec.at);
        expect(r.rejected).toBe(spec.rejected);
        expect(r.chosenValues).toBe(spec.chosen);
        expect(r.inherited).toBe(spec.inherited);
        expect(r.steps).toHaveLength(8);
        expect(irAnswer(early, quorum)).toBe(r.value);
      });
    }
  }

  it('기본 판의 걸음 차례와 phase 가 sim 과 같다', () => {
    const r = paxosRound(data, 1, 1);
    expect(r.steps.map((s) => `${s.who} ${s.kind} ${s.to} ${s.phase}`)).toEqual([
      'P1 prepare A1 promise',
      'P1 prepare A2 pick',
      'P1 accept A1 accept',
      'P2 prepare A1 promise',
      'P2 prepare A2 pick',
      'P1 accept A2 reject',
      'P2 accept A1 accept',
      'P2 accept A2 accept',
    ]);
    expect(r.steps[3]!.carried).toEqual([1, 7]);
    expect(r.steps[4]!.inherited).toBe(true);
  });
});

describe('paxos — 회차별 계기', () => {
  it('1·A1A2 → 0·A1A2 → 1·A1A2 에서 판 끝 계기가 사양과 같다', async () => {
    const inputs = [
      { type: 'early', payload: { value: 0, segmentIndex: 0, early: '0', quorum: '1' } },
      { type: 'early', payload: { value: 1, segmentIndex: 1, early: '1', quorum: '1' } },
    ];
    const totals = new Map<string, number>();
    const perRound: Record<string, number>[] = [];
    const snap = (): void => {
      perRound.push(Object.fromEntries(totals));
    };
    let cancelled = false;
    const ctx = {
      data,
      get cancelled() {
        return cancelled;
      },
      async emit(_e: FacetRuntimeEvent) {
        void _e;
      },
      metric(name: string, delta: number | 'inc') {
        if (typeof delta !== 'number') throw new Error('delta 는 수');
        totals.set(name, (totals.get(name) ?? 0) + delta);
      },
      async sleep() {
        return !cancelled;
      },
      async waitForInput() {
        snap();
        const next = inputs.shift();
        if (!next) {
          cancelled = true;
          throw new Error('끝');
        }
        return next;
      },
      pollInput() {
        return null;
      },
    };
    await paxosAlgorithm(ctx as never);
    expect(perRound).toEqual([
      { 'rejected-accepts': 1, 'chosen-values': 1, 'inherited-values': 1 },
      { 'rejected-accepts': 2, 'chosen-values': 1, 'inherited-values': 0 },
      { 'rejected-accepts': 1, 'chosen-values': 1, 'inherited-values': 1 },
    ]);
  });
});
