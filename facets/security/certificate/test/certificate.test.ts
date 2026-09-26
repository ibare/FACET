// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { makeTranslator, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  certificateAlgorithm,
  certificateFacet,
  certificateImperativeIR,
  certificateProjector,
  certificateStageView,
  computeRound,
  forgeSignature,
  H,
  readCertificateData,
  signedValue,
  type CertificateData,
  type CertificateStage,
} from '../src/index.js';

const data = readCertificateData(certificateFacet.initialData);

/** sim.py 표 그대로 — [signTarget, forgery, 후보 수, CA 서명 수, 위조 인증서 e, 붙은 서명, 푼 값, 서명받는 수, 멈춘 자리, 통과] */
const TABLE: [number, number, number, number, number, number, number | null, number, string, number][] = [
  [0, 0, 27, 2, 5, 741, 52, 52, 'pass', 1],
  [0, 1, 248, 1, 5, 3221, 51, 52, 'verify', 0],
  [0, 2, 0, 1, 5, 527, 32, 52, 'verify', 0],
  [0, 3, 0, 0, 5, 1203, null, 52, 'store', 0],
  [1, 0, 27, 2, 5, 521, 36, 2636, 'verify', 0],
  [1, 1, 16, 1, 25, 1109, 63, 63, 'pass', 1],
  [1, 2, 0, 1, 5, 1102, 258, 2636, 'verify', 0],
  [1, 3, 0, 0, 5, 87, null, 4047, 'store', 0],
];

const STOP_CODE = { store: 1, verify: 2, pass: 3 } as const;

type Metrics = Record<string, number>;

/** 알고리즘을 손잡이 입력 목록으로 끝까지 돌린다. 판이 끝날 때마다 계기의 지금 값을 모은다. */
async function play(inputs: { type: string; value: number }[]) {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Metrics = {};
  const rounds: Metrics[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data: structuredClone(certificateFacet.initialData) as unknown as CertificateData,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      rounds.push({ ...metrics });
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: next.type, payload: { value: next.value } };
    },
  };
  await certificateAlgorithm(ctx as never);
  return { events, rounds };
}

describe('certificate — 모형', () => {
  it('장난감 H 가 이 분야의 대조값과 같다', () => {
    expect(H('MEET AT 9')).toBe(0x4a00);
    expect(H('CN=mail.example|CN=Sample CA|2701|5')).toBe(0xd816);
    expect(H('CN=mail.example|CN=Sample CA|2419|3')).toBe(0xa2b3);
  });

  it('사다리가 segments 와 같고 후보가 124 개다', () => {
    const controls = (certificateFacet.blocks.controls as { controls: { action?: string; segments?: { value: number }[] }[] }).controls;
    const seg = (a: string) => controls.find((c) => c.action === a)?.segments?.map((s) => s.value);
    expect(seg('signTarget')).toEqual(data.signTargetLadder);
    expect(seg('forgery')).toEqual(data.forgeryLadder);
    expect(data.signTargetLadder).toEqual([0, 1]);
    expect(data.forgeryLadder).toEqual([0, 1, 2, 3]);
    const r = computeRound(data, 1, 1);
    expect(r.candidates.length).toBe(124);
    expect(r.candidates[0]).toBe(5);
    expect(r.candidates[r.candidates.length - 1]).toBe(373);
    expect([r.ca.n, r.ca.d, r.fake.n, r.fake.d, r.owner.n, r.mallory.phi]).toEqual([3763, 331, 4661, 1939, 2419, 2592]);
  });

  it.each(TABLE)('서명 대상 %i · 위조 %i 가 사양 표와 같다', (s, f, tries, caSig, eForged, sig, recovered, expected, stop, accepted) => {
    const r = computeRound(data, s, f);
    expect(r.tries).toBe(tries);
    expect(r.caSignatures).toBe(caSig);
    expect(r.forged.e).toBe(eForged);
    expect(r.forgedSignature).toBe(sig);
    expect(r.recovered).toBe(recovered);
    expect(r.expected).toBe(expected);
    expect(r.stop).toBe(stop);
    expect(r.accepted).toBe(accepted);
  });

  it('자세한 수 — 곱하기의 A · B, 짝, binds-key-to-name 대조', () => {
    const m0 = computeRound(data, 0, 0);
    expect(m0.multiply).toEqual({ aE: 83, bE: 119, aNumber: 831, bNumber: 1191, targetNumber: 52, modulus: 3763, valueProduct: 52 });
    expect(m0.signatures).toEqual([998, 3398]);
    const m1 = computeRound(data, 1, 0);
    expect(m1.signedValues).toEqual([389, 1751]);
    // 같은 절차 — 문서의 수로 셈하므로 같은 A · B, 요약의 곱은 36 ≠ 2636
    expect({ ...m1.multiply, valueProduct: 0 }).toEqual({ ...m0.multiply, valueProduct: 0 });
    expect(m1.multiply?.valueProduct).toBe(36);
    const p1 = computeRound(data, 1, 1);
    expect(p1.requests.map((c) => [c.subject, c.e, c.value])).toEqual([['CN=mallory.example', 23, 63]]);
    expect([p1.forged.subject, p1.forged.e, p1.forged.value, p1.forged.h16]).toEqual(['CN=mail.example', 25, 63, 0xce09]);
    const sw = computeRound(data, 1, 2);
    expect([sw.signedValues[0], sw.signatures[0], sw.expected]).toEqual([258, 1102, 2636]);
    const fk = computeRound(data, 1, 3);
    expect([fk.signedValues[0], fk.presented]).toEqual([4047, { n: 4661, e: 7 }]);
  });

  it('모르는 서명 대상 · 위조는 던진다', () => {
    expect(() => computeRound(data, 2, 1)).toThrow();
    expect(() => computeRound(data, 1, 4)).toThrow();
    expect(() => signedValue(2, 52, 0xd816, 3763)).toThrow();
    expect(() => signedValue(0, 3763, 0, 3763)).toThrow();
    expect(() => forgeSignature(4, [1], 3763)).toThrow();
    expect(() => forgeSignature(0, [1], 3763)).toThrow();
    expect(() => forgeSignature(1, [1, 2], 3763)).toThrow();
    const bad = { ...data, store: { ...data.store, n: 3764 } };
    expect(() => computeRound(bad, 1, 1)).toThrow();
  });
});

describe('certificate — IR 은 화면과 같은 답을 낸다', () => {
  it.each(TABLE.map((row) => [row[0], row[1]] as const))('서명 대상 %i · 위조 %i', (s, f) => {
    const r = computeRound(data, s, f);
    // 서명
    r.signedCerts.forEach((c, i) => {
      const key = r.signer === 'ca' ? r.ca : r.fake;
      expect(runIR(certificateImperativeIR, 'sign', [s, c.docNumber, c.h16, key.n, key.d])).toBe(r.signatures[i]);
    });
    // 위조
    const signerN = r.signer === 'ca' ? r.ca.n : r.fake.n;
    expect(runIR(certificateImperativeIR, 'forge', [f, r.signatures[0]!, r.forgery === 'multiply' ? r.signatures[1]! : 0, signerN])).toBe(r.forgedSignature);
    // 받는 쪽
    const got = runIR(certificateImperativeIR, 'receive', [
      s,
      r.forged.docNumber,
      r.forged.h16,
      r.forgedSignature,
      r.presented.n,
      r.presented.e,
      r.store.n,
      r.store.e,
    ]);
    expect(got).toBe(STOP_CODE[r.stop]);
  });

  it('모르는 mode · forgery 에 IR 은 −1', () => {
    expect(runIR(certificateImperativeIR, 'signedValue', [2, 52, 0xd816, 3763])).toBe(-1);
    expect(runIR(certificateImperativeIR, 'signedValue', [0, 3763, 0, 3763])).toBe(-1);
    expect(runIR(certificateImperativeIR, 'sign', [2, 52, 0xd816, 3763, 331])).toBe(-1);
    expect(runIR(certificateImperativeIR, 'forge', [4, 1109, 0, 3763])).toBe(-1);
    expect(runIR(certificateImperativeIR, 'receive', [2, 52, 0xd816, 1109, 3763, 11, 3763, 11])).toBe(-1);
  });
});

describe('certificate — 재생', () => {
  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase 다 · 준비 걸음에는 phase 가 없다', async () => {
    const { events } = await play([
      { type: 'forgery', value: 0 },
      { type: 'forgery', value: 2 },
      { type: 'forgery', value: 3 },
      { type: 'signTarget', value: 0 },
    ]);
    const want: Record<string, string | null> = { prepared: null, signed: 'sign', forged: 'forge', stored: 'store', verified: 'verify' };
    let steps = 0;
    events.forEach((e, i) => {
      if (e.silent) return;
      steps++;
      expect(e.type in want).toBe(true);
      const prev = events[i - 1]!;
      const phase = want[e.type];
      if (phase === null) expect(prev.type).toBe('init');
      else expect([prev.type, (prev.payload as { phase?: string }).phase]).toEqual(['phase', phase]);
    });
    // 여섯 걸음 판 넷(0 포함 6) · 가짜 뿌리 판 둘(5) — 걸음 0 은 silent init
    expect(steps).toBe(5 + 5 + 5 + 4 + 4);
    expect(new Set(events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase))).toEqual(
      new Set(['sign', 'forge', 'store', 'verify']),
    );
  });

  it('회차별 계기 — forgery 1 → 0 → 1 (요약)', async () => {
    const { rounds } = await play([
      { type: 'forgery', value: 0 },
      { type: 'forgery', value: 1 },
    ]);
    const pick = (m: Metrics) => [m['forger-tries'], m['ca-signatures'], m['accepted']];
    expect(rounds.map(pick)).toEqual([
      [16, 1, 1],
      [27, 2, 0],
      [16, 1, 1],
    ]);
  });

  it('회차별 계기 — signTarget 1 → 0 → 1 (겹치는 짝)', async () => {
    const { rounds } = await play([
      { type: 'signTarget', value: 0 },
      { type: 'signTarget', value: 1 },
    ]);
    const pick = (m: Metrics) => [m['forger-tries'], m['ca-signatures'], m['accepted']];
    expect(rounds.map(pick)).toEqual([
      [16, 1, 1],
      [248, 1, 0],
      [16, 1, 1],
    ]);
  });

  it('사다리 밖 값 · 남의 입력은 흘린다', async () => {
    const { rounds, events } = await play([
      { type: 'forgery', value: 9 },
      { type: 'other', value: 0 },
      { type: 'forgery', value: 2 },
    ]);
    expect(events.filter((e) => e.type === 'init').length).toBe(2);
    expect(rounds[rounds.length - 1]!['forger-tries']).toBe(0);
    expect(rounds[rounds.length - 1]!['ca-signatures']).toBe(1);
  });
});

describe('certificate — 무대', () => {
  const mount = () => {
    const container = document.createElement('div');
    const stage = mountView(certificateStageView, container, { config: {}, locale: 'en', isInstant: () => true });
    return { container, stage };
  };

  it('initialData 없이도 마운트된다', () => {
    expect(() => mount()).not.toThrow();
  });

  it('첫 그림을 두 번 먹여도, 한 판을 다 그린 뒤 먹여도 요소 수가 같다 (되짚기 멱등)', async () => {
    const { container, stage } = mount();
    const projector = certificateProjector({ stage }, { getSpeed: () => 1, t: makeTranslator('en') });
    const { events } = await play([]);
    const init = events.find((e) => e.type === 'init')!;
    const count = () => container.querySelectorAll('*').length;
    await projector.onEvent(init);
    const first = count();
    await projector.onEvent(init);
    expect(count()).toBe(first);
    for (const e of events) await projector.onEvent(e);
    expect(container.textContent).toContain('Made it through');
    await projector.onEvent(init);
    expect(count()).toBe(first);
    // 새 판의 걸음 0 에 앞 판의 결론이 남지 않는다
    expect(container.textContent).not.toContain('Made it through');
    expect(container.textContent).not.toContain('Passed');
    projector.onReset?.();
    await projector.onEvent(init);
    expect(count()).toBe(first);
  });

  it('무대는 앞 걸음 없이 불리면 던진다', () => {
    const { stage } = mount();
    const s = stage as unknown as CertificateStage;
    expect(() => s.verify({ recovered: 1, expected: 1, ok: true }, 0)).toThrow();
  });
});
