// @vitest-environment happy-dom
/**
 * sha 고유의 검수 — IR ↔ algorithm 전 조합 · 사양 표 대조 · 조각 대조값 · 걸음 앞 phase · 회차별 계기 ·
 * 사다리 · 되짚기 멱등.
 */
import { describe, expect, it } from 'vitest';
import { makeTranslator, mountView } from '@ffacet/core/runtime';
import type { FacetContext, FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  asciiBytes,
  foldStream,
  playRound,
  readShaData,
  shaAlgorithm,
  tagOf,
  type ShaData,
} from '../src/algorithm.js';
import { shaImperativeIR } from '../src/irs.js';
import { shaFacet } from '../src/facet.js';
import { shaProjector } from '../src/projector.js';
import { shaStageView } from '../src/sha-stage.js';

const data: ShaData = readShaData(shaFacet.initialData);
const hx = (v: number) => v.toString(16).padStart(4, '0');

/** 사양 실측표 — 방식 × 공격 여섯 판 */
const TABLE: Record<string, { tag: string; sent: string; claim: string; bob: string; accepted: boolean; mf: number; bf: number }> = {
  '0,0': { tag: '8ed4', sent: '50 41 59 20 39 30', claim: '3bea', bob: '3bea', accepted: true, mf: 5, bf: 5 },
  '0,1': { tag: '8ed4', sent: '50 41 59 20 31 30 80 00 00 30 4d 45', claim: 'af73', bob: 'af73', accepted: true, mf: 3, bf: 8 },
  '1,0': { tag: '6b5d', sent: '50 41 59 20 39 30', claim: '3bea', bob: '62e3', accepted: false, mf: 5, bf: 6 },
  '1,1': { tag: '6b5d', sent: '50 41 59 20 31 30 80 00 00 40 4d 45', claim: 'cf98', bob: 'cf98', accepted: true, mf: 3, bf: 9 },
  '2,0': { tag: '1b13', sent: '50 41 59 20 39 30', claim: '3bea', bob: '76b1', accepted: false, mf: 5, bf: 10 },
  '2,1': { tag: '1b13', sent: '50 41 59 20 31 30 80 00 00 40 4d 45', claim: '1936', bob: '3632', accepted: false, mf: 3, bf: 13 },
};

function irArgs(scheme: number, attack: number) {
  return [
    scheme,
    attack,
    data.key,
    asciiBytes(data.message),
    data.message.length,
    asciiBytes(data.altered),
    data.altered.length,
    asciiBytes(data.extension),
    data.extension.length,
    new Array<number>(12).fill(0),
    [0, 0],
  ];
}

describe('sha — 셈', () => {
  it('여섯 판이 사양 표와 같고, IR bobAccepts · tagOf 가 algorithm 과 같다', () => {
    for (const s of [0, 1, 2]) {
      for (const a of [0, 1]) {
        const r = playRound(data, s, a);
        const row = TABLE[`${s},${a}`]!;
        expect(hx(r.tag)).toBe(row.tag);
        expect(r.sent.map((b) => b.byte.toString(16).padStart(2, '0')).join(' ')).toBe(row.sent);
        expect(hx(r.claim)).toBe(row.claim);
        expect(hx(r.bob)).toBe(row.bob);
        expect(r.accepted).toBe(row.accepted);
        expect(r.malloryFolds).toBe(row.mf);
        expect(r.bobFolds).toBe(row.bf);

        const args = irArgs(s, a);
        expect(runIR(shaImperativeIR, 'bobAccepts', args)).toBe(r.accepted ? 1 : 0);
        // bobAccepts 가 채운 forged 버퍼 = algorithm 이 보낸 글
        const forged = args[9] as number[];
        expect(forged.slice(0, r.sent.length)).toEqual(r.sent.map((b) => b.byte));
        expect(runIR(shaImperativeIR, 'tagOf', [s, data.key, asciiBytes(data.message), data.message.length, [0, 0]])).toBe(r.tag);
        const sent = r.sent.map((b) => b.byte);
        expect(runIR(shaImperativeIR, 'tagOf', [s, data.key, sent, sent.length, [0, 0]])).toBe(r.bob);
      }
    }
  });

  it('모르는 방식 · 공격 — IR 은 −1, TS 는 던진다', () => {
    expect(runIR(shaImperativeIR, 'bobAccepts', irArgs(3, 1))).toBe(-1);
    expect(runIR(shaImperativeIR, 'bobAccepts', irArgs(1, 2))).toBe(-1);
    expect(runIR(shaImperativeIR, 'tagOf', [3, data.key, [80], 1, [0, 0]])).toBe(-1);
    expect(() => playRound(data, 3, 1)).toThrow();
    expect(() => playRound(data, 1, 2)).toThrow();
    expect(() => tagOf(3, data.key, [80])).toThrow();
  });

  it('다른 데이터로도 IR = algorithm (조각 대조값)', () => {
    const meet = asciiBytes('MEET AT 9');
    const day = asciiBytes('DAY');
    const hi = asciiBytes('HI');
    const pay = asciiBytes('PAY 10');
    expect(foldStream(0x6a09, [], meet, 9).end).toBe(0x4a00);
    expect(runIR(shaImperativeIR, 'foldStream', [27145, 0, 0, meet, 9, 9])).toBe(0x4a00);
    expect(foldStream(0xaf87, [], day, 9).end).toBe(0x4344);
    expect(runIR(shaImperativeIR, 'foldStream', [0xaf87, 0, 0, day, 3, 9])).toBe(0x4344);
    expect(tagOf(2, 0xa53f, hi).tag).toBe(0x1270);
    expect(runIR(shaImperativeIR, 'tagOf', [2, 0xa53f, hi, 2, [0, 0]])).toBe(0x1270);
    expect(tagOf(2, 0x7c1e, pay).tag).toBe(0x1b13);
    expect(runIR(shaImperativeIR, 'tagOf', [2, 0x7c1e, pay, 6, [0, 0]])).toBe(0x1b13);
    expect(tagOf(0, 0, asciiBytes('SUN')).tag).toBe(0xaf87);
  });

  it('겹침 — 이어 붙이기에서 H(m) · H(K‖m) 은 내려앉고 HMAC 은 덩어리만 같다 · 고치기는 H(m) 만 겹친다', () => {
    expect(playRound(data, 0, 1).match).toEqual(['land', 'land', 'land']);
    expect(playRound(data, 1, 1).match).toEqual(['land', 'land', 'land']);
    expect(playRound(data, 2, 1).match).toEqual(['half', 'half', 'half']);
    expect(playRound(data, 0, 0).lands).toBe(true);
    expect(playRound(data, 1, 0).lands).toBe(false);
    expect(playRound(data, 2, 0).lands).toBe(false);
    // 이어 붙이기에서 Mallory 는 Alice 줄의 끝(T)에서, 고치기에서는 줄의 처음(IV)에서 출발한다
    expect(playRound(data, 1, 1).mallory.startCol).toBe(6);
    expect(playRound(data, 0, 1).mallory.startCol).toBe(5);
    expect(playRound(data, 1, 0).mallory.startCol).toBe(0);
  });

  it('사다리가 segments 의 value 와 같다', () => {
    const controls = (shaFacet.blocks.controls as { controls: unknown[] }).controls;
    const seg = (name: string) =>
      (controls.find((c) => (c as { name?: string }).name === name) as { segments: { value: number }[] }).segments.map((s) => s.value);
    expect(seg('scheme')).toEqual(data.schemes.map((_, i) => i));
    expect(seg('attack')).toEqual(data.attacks.map((_, i) => i));
    expect(data.schemes).toHaveLength(3);
    expect(data.attacks).toHaveLength(2);
    expect(asciiBytes(data.message).length + 4 + asciiBytes(data.extension).length).toBe(12); // forged 버퍼 길이
  });
});

/** 알고리즘을 가짜 ctx 로 돌린다. inputs 를 차례로 준 뒤 취소한다. */
async function drive(inputs: { type: string; value: number }[]) {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const snapshots: Record<string, number>[] = [];
  let cancelled = false;
  let k = 0;
  const ctx = {
    data: shaFacet.initialData,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
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
      snapshots.push(Object.fromEntries(metrics));
      const next = inputs[k++];
      if (!next) {
        cancelled = true;
        return { type: 'cancel' };
      }
      return { type: next.type, payload: { value: next.value } };
    },
  };
  await shaAlgorithm(ctx as unknown as FacetContext<ShaData>);
  return { events, snapshots };
}

describe('sha — 걸음', () => {
  it('걸음 이벤트마다 바로 앞의 phase 가 사양 표와 같다 · 걸음 2 앞에는 phase 가 없다', async () => {
    const { events } = await drive([
      { type: 'scheme', value: 0 },
      { type: 'scheme', value: 2 },
      { type: 'scheme', value: 1 },
      { type: 'attack', value: 0 },
    ]);
    const expected = [
      ['alice-tag', null, 'forge-glue', 'forge-extend', 'tag-prefix', 'bob-verdict'],
      ['alice-tag', null, 'forge-glue', 'forge-extend', 'tag-plain', 'bob-verdict'],
      ['alice-tag', null, 'forge-glue', 'forge-extend', 'tag-hmac', 'bob-verdict'],
      ['alice-tag', null, 'forge-glue', 'forge-extend', 'tag-prefix', 'bob-verdict'],
      ['alice-tag', null, 'forge-rewrite', 'forge-hash', 'tag-prefix', 'bob-verdict'],
    ];
    const rounds: (string | null)[][] = [];
    let cur: (string | null)[] = [];
    events.forEach((e, i) => {
      if (e.type === 'init') {
        expect(e.silent).toBe(true);
        cur = [];
        rounds.push(cur);
        return;
      }
      if (e.type === 'phase') {
        expect(e.silent).toBe(true);
        return;
      }
      expect(e.silent).toBeFalsy();
      const prev = events[i - 1];
      cur.push(prev && prev.type === 'phase' ? (prev.payload as { phase: string }).phase : null);
    });
    expect(rounds).toEqual(expected);
  });

  it('회차별 계기 — H(K‖m)×이어 → HMAC×이어 → H(K‖m)×이어', async () => {
    const { snapshots } = await drive([
      { type: 'scheme', value: 2 },
      { type: 'scheme', value: 1 },
    ]);
    expect(snapshots).toEqual([
      { 'mallory-folds': 3, 'bob-folds': 9, accepted: 1 },
      { 'mallory-folds': 3, 'bob-folds': 13, accepted: 0 },
      { 'mallory-folds': 3, 'bob-folds': 9, accepted: 1 },
    ]);
  });

  it('사다리 밖 값 · 남의 입력은 흘린다', async () => {
    const { snapshots } = await drive([
      { type: 'scheme', value: 7 },
      { type: 'zoom', value: 1 },
      { type: 'attack', value: 0 },
    ]);
    // 흘린 입력마다 다시 기다리므로 첫 판의 값이 세 번 찍힌 뒤 고치기 판이 온다
    const first = { 'mallory-folds': 3, 'bob-folds': 9, accepted: 1 };
    expect(snapshots).toEqual([first, first, first, { 'mallory-folds': 5, 'bob-folds': 6, accepted: 0 }]);
  });
});

describe('sha — 무대', () => {
  function mount() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const t = makeTranslator('en', shaFacet.messages);
    const stage = mountView(shaStageView, container, { config: {}, initialData: shaFacet.initialData, t });
    const projector = shaProjector({ stage }, { getSpeed: () => 1, t });
    return { container, projector };
  }
  const count = (c: HTMLElement) => c.querySelectorAll('*').length;

  it('첫 그림을 두 번 먹여도 무대 요소 수가 같다 · 한 판을 돈 뒤 새 판 머리도 같다 · onReset 뒤에도', async () => {
    const { events } = await drive([]);
    const { container, projector } = mount();
    const init = events[0]!;
    expect(init.type).toBe('init');
    await projector.onEvent(init);
    const once = count(container);
    await projector.onEvent(init);
    expect(count(container)).toBe(once);
    for (const e of events.slice(1)) await projector.onEvent(e);
    await projector.onEvent(init);
    expect(count(container)).toBe(once);
    projector.onReset?.();
    await projector.onEvent(init);
    expect(count(container)).toBe(once);
  });

  it('새 판의 걸음 0 에는 앞 판의 판정 · 표 글자가 남지 않는다', async () => {
    const { events } = await drive([]);
    const { container, projector } = mount();
    for (const e of events) await projector.onEvent(e);
    expect(container.textContent).toContain('cf98 = cf98');
    await projector.onEvent(events[0]!);
    expect(container.textContent).not.toContain('cf98');
    expect(container.textContent).not.toContain('6b5d');
    expect(container.textContent).toContain('7c1e');
  });
});
