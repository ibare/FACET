// @vitest-environment happy-dom
/**
 * TLS 핸드셰이크 — facet 고유의 주장.
 *   1. IR ↔ algorithm: 네 조합 모두에서 돌려준 값(열림/끊김) · K 넷이 같다
 *   2. 사양 실측표와 셈한 값 (K · 계기 · 한 판 걸음 수 · 서명 · 요약 · 사슬)
 *   3. 회차별 계기 — (끼어들기 · 안 함) → (끼어들기 · 함) → (끼어들기 · 안 함)
 *   4. 사다리 = segments[].value
 *   5. stage 는 mountView 로만 마운트한다
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetContext, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import {
  computeHandshake,
  tbsSum,
  tlsHandshakeAlgorithm,
  tlsHandshakeFacet,
  tlsHandshakeImperativeIR,
  tlsHandshakeStageView,
  walkChain,
  type TlsHandshakeData,
} from '../src/index.js';

const data = tlsHandshakeFacet.initialData as TlsHandshakeData;
const fresh = (): TlsHandshakeData => JSON.parse(JSON.stringify(data)) as TlsHandshakeData;

// 사양 실측표 (sim.py tls-handshake) — [middle, verify] → client K · server K · 가운데 K 둘 · open · keys-known · 걸음 (0 포함)
const TABLE: Record<string, { keys: number[]; open: number; known: number; steps: number }> = {
  '0,0': { keys: [2, 2, -1, -1], open: 1, known: 0, steps: 6 },
  '0,1': { keys: [2, 2, -1, -1], open: 1, known: 0, steps: 8 },
  '1,0': { keys: [9, 10, 9, 10], open: 1, known: 2, steps: 9 },
  '1,1': { keys: [-1, -1, -1, -1], open: 0, known: 0, steps: 8 },
};

function irRun(middle: number, verify: number): { ret: number; keys: number[] } {
  const chain = walkChain(data);
  const leaf = data.certificates.find((c) => c.id === data.bundle[0]);
  if (!leaf) throw new Error('잎이 없다');
  const keys = [-1, -1, -1, -1];
  const ret = runIR(tlsHandshakeImperativeIR, 'handshake', [
    data.p,
    data.g,
    data.secrets.client,
    data.secrets.server,
    data.secrets.middle,
    middle,
    verify,
    leaf.n,
    leaf.e,
    data.serverSignExponent,
    chain.map((l) => l.sig),
    chain.map((l) => l.tbsSum),
    chain.map((l) => l.issuerN),
    chain.map((l) => l.issuerE),
    keys,
  ]);
  if (typeof ret !== 'number') throw new Error('IR 이 수를 돌려주지 않았다');
  return { ret, keys };
}

/** 알고리즘을 가짜 ctx 로 돌린다 — sleep 은 바로 풀리고, 입력은 차례로 준다 */
async function drive(inputs: { type: string; value: number }[]) {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const rounds: { metrics: Record<string, number>; steps: number; phases: string[] }[] = [];
  let steps = 0;
  let phases: string[] = [];
  let cancelled = false;
  const queue = [...inputs];
  const close = (): void => {
    rounds.push({ metrics: Object.fromEntries(metrics), steps, phases });
    steps = 0;
    phases = [];
  };
  const ctx = {
    data: fresh(),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'phase') {
        const p = e.payload as { phase?: unknown };
        if (typeof p.phase === 'string') phases.push(p.phase);
      } else steps += 1;
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      close();
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: next.type, payload: { value: next.value } };
    },
  } as unknown as ReactiveContext<TlsHandshakeData>;
  await tlsHandshakeAlgorithm(ctx as FacetContext<TlsHandshakeData>);
  return { events, rounds };
}

describe('tls-handshake', () => {
  it('IR 과 algorithm 이 네 조합 모두에서 같은 답을 낸다 · 사양 실측표와 같다', () => {
    for (const middle of data.middleLadder) {
      for (const verify of data.verifyLadder) {
        const r = computeHandshake(data, middle, verify);
        const ir = irRun(middle, verify);
        const row = TABLE[`${middle},${verify}`];
        expect(ir.ret, `${middle},${verify} 열림`).toBe(r.open);
        expect(ir.keys, `${middle},${verify} K`).toEqual(r.keys);
        expect(r.keys).toEqual(row.keys);
        expect(r.open).toBe(row.open);
        expect(r.phases.length + 1, `${middle},${verify} 걸음`).toBe(row.steps);
      }
    }
  });

  it('파생값이 사양의 대조값과 같다', () => {
    const listen = computeHandshake(data, 0, 1);
    const cut = computeHandshake(data, 1, 1);
    expect([listen.clientShare, listen.serverShare]).toEqual([8, 19]);
    expect(cut.middleShare).toBe(11);
    expect([listen.digest, listen.signature]).toEqual([203, 443]);
    expect([cut.digest, cut.signature]).toEqual([272, 2016]);
    expect([listen.signDecoded, listen.signExpected, listen.signOk]).toEqual([203, 203, true]);
    expect([cut.signDecoded, cut.signExpected, cut.signOk]).toEqual([272, 195, false]);
    // 사슬 — 끼어들기 · 함에서도 맞다 (가운데가 서버의 인증서를 그대로 넘긴다)
    expect(cut.chain.map((l) => [l.tbsSum, l.decoded, l.holds, l.fromStore])).toEqual([
      [3934, 1161, true, false],
      [4081, 848, true, true],
    ]);
    const [leaf, inter] = data.certificates;
    expect([tbsSum(leaf), tbsSum(inter)]).toEqual([3934, 4081]);
    // 중간값 — powMod 의 r × (x mod n) 는 n² 보다 작다. 가장 큰 n 3233 → 10,452,289 < 2^31
    const maxN = Math.max(...data.certificates.map((c) => c.n), data.p);
    expect(maxN * maxN).toBeLessThan(2 ** 31);
  });

  it('phase 차례가 사양의 걸음 차례와 같다', () => {
    expect(computeHandshake(data, 1, 0).phases).toEqual([
      'client-share', 'middle-to-server', 'server-share', 'server-sign', 'middle-to-client', 'client-key', 'server-key', 'middle-keys',
    ]);
    expect(computeHandshake(data, 1, 1).phases).toEqual([
      'client-share', 'middle-to-server', 'server-share', 'server-sign', 'middle-to-client', 'chain-check', 'handshake-abort',
    ]);
    expect(computeHandshake(data, 0, 1).phases).toEqual([
      'client-share', 'server-share', 'server-sign', 'chain-check', 'sign-ok', 'client-key', 'server-key',
    ]);
  });

  it('회차별 계기 — 끼어들기 · 안 함 → 함 → 안 함', async () => {
    const { rounds } = await drive([
      { type: 'verify', value: 0 },
      { type: 'verify', value: 1 },
      { type: 'verify', value: 0 },
    ]);
    rounds.shift(); // 첫 판 (끼어들기 · 함)
    expect(rounds.map((r) => r.metrics)).toEqual([
      { 'open-connections': 1, 'keys-known-to-middle': 2 },
      { 'open-connections': 0, 'keys-known-to-middle': 0 },
      { 'open-connections': 1, 'keys-known-to-middle': 2 },
    ]);
    expect(rounds.map((r) => r.steps)).toEqual([9, 8, 9]);
  });

  it('네 판의 걸음 수 · 계기가 실측표와 같다', async () => {
    const { rounds } = await drive([
      { type: 'verify', value: 0 },
      { type: 'middle', value: 0 },
      { type: 'verify', value: 1 },
    ]);
    const keys = ['1,1', '1,0', '0,0', '0,1'];
    rounds.forEach((r, i) => {
      const row = TABLE[keys[i]];
      expect(r.steps, keys[i]).toBe(row.steps);
      expect(r.metrics, keys[i]).toEqual({ 'open-connections': row.open, 'keys-known-to-middle': row.known });
    });
    // 네 판을 합치면 phase 열하나가 모두 켜진다
    expect(new Set(rounds.flatMap((r) => r.phases)).size).toBe(11);
  });

  it('사다리가 segments[].value 와 같다', () => {
    const controls = (tlsHandshakeFacet.blocks.controls as { controls: { widget?: string; action?: string; segments?: { value: number }[] }[] }).controls;
    const seg = (action: string) => controls.find((c) => c.widget === 'segmented-slider' && c.action === action)?.segments?.map((s) => s.value);
    expect(seg('middle')).toEqual(data.middleLadder);
    expect(seg('verify')).toEqual(data.verifyLadder);
    expect(data.middleLadder).toEqual([0, 1]);
    expect(data.verifyLadder).toEqual([0, 1]);
    expect(data.middle).toBe(1);
    expect(data.verify).toBe(1);
    expect(data.bundle.length).toBe(2);
    expect(walkChain(data).length).toBe(2);
  });

  it('사다리 밖 값은 던진다', () => {
    expect(() => computeHandshake(data, 2, 0)).toThrow();
  });

  it('stage 가 mountView 로 마운트되고 걸음 0 에 세 자리를 그린다', () => {
    const host = document.createElement('div');
    const view = mountView(tlsHandshakeStageView, host, { config: {} });
    expect(host.querySelector('svg')).not.toBeNull();
    expect(host.textContent).toContain('Client');
    expect(host.textContent).toContain('Server');
    view.destroy();
  });
});
