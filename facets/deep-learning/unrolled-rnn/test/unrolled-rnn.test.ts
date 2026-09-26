// @vitest-environment happy-dom
/**
 * 펼친 RNN — facet 고유의 주장.
 *   1. IR `farShare` 가 모든 손잡이 값(과 뒤집은 입력)에서 algorithm 이 화면에 내는 값과 같다
 *   2. 회차별 계기 — w_h 0.6 → 0.3 → 0.9 → 0.6 으로 돌려 회차마다 사양 표와 견준다
 *   3. 사다리 = segments[].value · 버퍼 길이 · 사다리 끝값
 *   4. 무대가 끝 걸음의 두 수를 캡션에 띄운다 (mountView 경유)
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { makeTranslator, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  farShareOf,
  percentOf,
  unrolledBackward,
  unrolledForward,
  unrolledRnnAlgorithm,
  unrolledRnnFacet,
  unrolledRnnImperativeIR,
  unrolledRnnProjector,
  unrolledRnnStageView,
  type UnrolledRnnData,
} from '../src/index.js';

const DATA = unrolledRnnFacet.initialData as unknown as UnrolledRnnData;
const T = DATA.xs.length;

/** 표시 규칙 (stage 와 같은 규칙을 검사 쪽에서 다시 적는다 — 사양 표 대조용). */
function fx(v: number, d: number): string {
  const s = v.toFixed(d);
  return (Number(s) === 0 ? s.replace('-', '') : s).replace('-', '−');
}

type Round = { events: FacetRuntimeEvent[]; metrics: Record<string, number>; traceLeft: number[] };

/** 알고리즘을 입력 목록대로 돌려 판마다 이벤트와 계기(누적값)를 모은다. */
async function play(data: UnrolledRnnData, inputs: number[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const totals: Record<string, number> = {};
  let current: Round = { events: [], metrics: {}, traceLeft: [] };
  let cancelled = false;
  let pending = [...inputs];
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      current.events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      if (typeof delta !== 'number') throw new Error('delta 는 수여야 한다');
      totals[name] = (totals[name] ?? 0) + delta;
      if (name === 'trace-left' && current.events.some((e) => e.type === 'forward')) {
        current.traceLeft.push(totals[name]!);
      }
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      current.metrics = { ...totals };
      rounds.push(current);
      current = { events: [], metrics: {}, traceLeft: [] };
      const next = pending[0];
      pending = pending.slice(1);
      if (next === undefined) {
        cancelled = true;
        return { type: 'noop' };
      }
      return { type: 'wh', payload: { value: next, segmentIndex: 0, wh: String(next) } };
    },
  };
  await unrolledRnnAlgorithm(ctx as never);
  return rounds;
}

function irRun(xs: number[], wh: number) {
  const hs = new Array<number>(xs.length + 1).fill(0);
  hs[0] = DATA.h0;
  const trace = new Array<number>(xs.length + 1).fill(0);
  const contrib = new Array<number>(xs.length + 1).fill(0);
  const share = runIR(unrolledRnnImperativeIR, 'farShare', [xs, DATA.wx, wh, DATA.b, hs, trace, contrib]);
  return { share: share as number, hs, trace, contrib };
}

function payload(e: FacetRuntimeEvent): Record<string, number> {
  return e.payload as Record<string, number>;
}

describe('unrolled-rnn — IR ↔ algorithm', () => {
  for (const reversed of [false, true]) {
    for (const wh of DATA.whLadder) {
      it(`w_h ${wh}${reversed ? ' · 뒤집은 입력' : ''}: hs · 흔적 · 몫 · 먼 절반의 몫이 같다`, async () => {
        const xs = reversed ? [...DATA.xs].reverse() : [...DATA.xs];
        const ir = irRun(xs, wh);
        const fwd = unrolledForward(xs, DATA.wx, wh, DATA.b, DATA.h0);
        const bwd = unrolledBackward(xs, fwd.hs, wh);
        expect(ir.hs).toEqual(fwd.hs);
        expect(ir.trace).toEqual(fwd.trace);
        expect(ir.contrib).toEqual(bwd.contrib);
        expect(ir.share).toBe(farShareOf(bwd.contrib, xs.length));

        // 화면에 내는 값 (이벤트) 과도 같다
        const [round] = await play({ ...DATA, xs, wh }, []);
        const forwards = round!.events.filter((e) => e.type === 'forward').map(payload);
        const backwards = round!.events.filter((e) => e.type === 'backward').map(payload);
        const end = payload(round!.events.find((e) => e.type === 'far-share')!);
        expect(forwards.map((p) => p.h)).toEqual(ir.hs.slice(1));
        expect(forwards.map((p) => p.trace)).toEqual(ir.trace.slice(1));
        expect(backwards.map((p) => p.contrib)).toEqual(ir.contrib.slice(1).reverse());
        expect(end.share).toBe(ir.share);
        expect(end.forwardTrace).toBe(ir.trace[xs.length]);
        // 모인 합은 IR 의 몫을 같은 차례(k = T → 1)로 더한 것
        let g = 0;
        for (let k = xs.length; k >= 1; k -= 1) g = g + ir.contrib[k]!;
        expect(end.sum).toBe(g);
        // 중간값 — 포화 밖
        expect(Math.max(...ir.hs.map(Math.abs))).toBeLessThan(0.5);
      });
    }
  }
});

const TABLE: Record<string, { reach1: string; s8: string; back: string; share: string; g: string; left: number[]; far: number }> = {
  '0.3': { reach1: '0.000', s8: '0.000', back: '0.000', share: '0.01', g: '−0.149', left: [100, 29, 8, 2, 1, 0, 0, 0], far: 1 },
  '0.6': { reach1: '0.024', s8: '0.023', back: '0.023', share: '0.10', g: '−0.105', left: [100, 60, 34, 20, 11, 7, 4, 2], far: 10 },
  '0.9': { reach1: '0.422', s8: '0.406', back: '0.406', share: '0.38', g: '−0.043', left: [100, 90, 77, 69, 60, 54, 47, 42], far: 38 },
};

describe('unrolled-rnn — 사양 표와 회차별 계기', () => {
  it('w_h 0.6 → 0.3 → 0.9 → 0.6: 회차마다 사양 표와 같다', async () => {
    const order = [0.6, 0.3, 0.9, 0.6];
    const rounds = await play(DATA, order.slice(1));
    expect(rounds).toHaveLength(order.length);
    rounds.forEach((round, i) => {
      const row = TABLE[String(order[i])]!;
      const end = payload(round.events.find((e) => e.type === 'far-share')!);
      expect(fx(end.reachFirst, 3)).toBe(row.reach1);
      expect(fx(end.forwardTrace, 3)).toBe(row.s8);
      expect(fx(end.backwardTrace, 3)).toBe(row.back);
      expect(fx(end.share, 2)).toBe(row.share);
      expect(fx(end.sum, 3)).toBe(row.g);
      expect(round.traceLeft).toEqual(row.left);
      expect(round.metrics).toEqual({ 'trace-left': row.left[T - 1], 'far-share': row.far });
      expect(percentOf(end.share)).toBe(row.far);
      // 걸음 열여덟: init 뒤 sleep 17 번 + 입력 대기
      expect(round.events.filter((e) => e.type === 'forward')).toHaveLength(T);
      expect(round.events.filter((e) => e.type === 'backward')).toHaveLength(T);
    });
  });

  it('기본 w_h 0.6 의 걸음별 값이 사양과 같다', async () => {
    const [round] = await play(DATA, []);
    const f = round!.events.filter((e) => e.type === 'forward').map(payload);
    expect(f.map((p) => fx(p.h, 2))).toEqual(['0.20', '−0.08', '−0.24', '0.05', '0.23', '−0.06', '0.16', '−0.10']);
    expect(f.map((p) => fx(p.trace, 3))).toEqual(['0.961', '0.573', '0.323', '0.193', '0.110', '0.066', '0.038', '0.023']);
    expect(f.slice(1).map((p) => fx(p.mult, 2))).toEqual(['0.60', '0.56', '0.60', '0.57', '0.60', '0.58', '0.59']);
    const b = round!.events.filter((e) => e.type === 'backward').map(payload);
    expect(b.map((p) => fx(p.reach, 3))).toEqual(['1.000', '0.594', '0.347', '0.207', '0.118', '0.071', '0.040', '0.024']);
    expect(b.map((p) => fx(p.d, 3))).toEqual(['0.989', '0.578', '0.346', '0.197', '0.118', '0.066', '0.040', '0.023']);
    expect(b.map((p) => fx(p.contrib, 3))).toEqual(['−0.198', '0.116', '−0.069', '0.039', '0.024', '−0.013', '−0.008', '0.005']);
    expect(b.map((p) => fx(p.sum, 3))).toEqual(['−0.198', '−0.082', '−0.151', '−0.112', '−0.089', '−0.102', '−0.110', '−0.105']);
  });

  it('w_h 0.3 의 뒤 걸음에 표시 0.000 인 몫이 셋 있고 셈한 값은 0 이 아니다', async () => {
    const [round] = await play({ ...DATA, wh: 0.3 }, []);
    const zeros = round!.events
      .filter((e) => e.type === 'backward')
      .map(payload)
      .filter((p) => fx(p.contrib, 3) === '0.000');
    expect(zeros).toHaveLength(3);
    for (const p of zeros) expect(p.contrib).not.toBe(0);
  });
});

describe('unrolled-rnn — 사다리', () => {
  it('whLadder 가 segments[].value 와 같고 버퍼 길이가 T + 1 이다', () => {
    const controls = (unrolledRnnFacet.blocks.controls as { controls: { widget: string; segments?: { value: number }[] }[] }).controls;
    const knob = controls.find((c) => c.widget === 'segmented-slider');
    expect(knob?.segments?.map((s) => s.value)).toEqual(DATA.whLadder);
    expect(DATA.whLadder[DATA.whLadder.length - 1]).toBe(0.9);
    expect(DATA.xs).toHaveLength(8);
    expect(irRun(DATA.xs, 0.9).hs).toHaveLength(9);
  });
});

describe('unrolled-rnn — 무대', () => {
  it('첫 그림(init)을 거듭 먹여도 무대 요소 수가 늘지 않는다 — 되짚기 · 되돌리기', async () => {
    const container = document.createElement('div');
    const stage = mountView(unrolledRnnStageView, container, { config: {}, t: makeTranslator('en') });
    const projector = unrolledRnnProjector({ stage }, undefined);
    const [round] = await play(DATA, []);
    const init = round!.events.find((e) => e.type === 'init')!;
    await projector.onEvent(init);
    const once = container.querySelectorAll('*').length;
    await projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    // 한 판을 끝까지 먹인 뒤 다시 첫 그림부터 먹여도 같다
    for (const e of round!.events) await projector.onEvent(e);
    for (const e of round!.events) await projector.onEvent(e);
    await projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    stage.destroy();
  });

  it('끝 걸음의 캡션이 두 수와 먼 절반의 몫을 띄운다', async () => {
    const container = document.createElement('div');
    const t = makeTranslator('en');
    const stage = mountView(unrolledRnnStageView, container, { config: {}, t });
    const projector = unrolledRnnProjector({ stage }, undefined);
    const [round] = await play({ ...DATA, wh: 0.9 }, []);
    for (const e of round!.events) await projector.onEvent(e);
    const texts = [...container.querySelectorAll('text')].map((n) => n.textContent ?? '');
    expect(texts).toContain('Forward trace s8: 0.406 · reached back ∂h8/∂x1: 0.406 · far-half share: 0.38');
    expect(texts).toContain('−0.043');
    stage.destroy();
  });
});
