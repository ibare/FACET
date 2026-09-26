// @vitest-environment happy-dom
/**
 * self-attention 고유의 주장 — IR ↔ algorithm 전 조합, 사양 표 대조, 회차별 계기, 사다리, 정수 동률.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { makeTranslator, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  computeRound,
  readSelfAttentionData,
  selfAttentionAlgorithm,
  selfAttentionFacet,
  selfAttentionImperativeIR,
  selfAttentionProjector,
  selfAttentionStageView,
  type SelfAttentionData,
} from '../src/index.js';

const data = readSelfAttentionData(selfAttentionFacet.initialData);

function flat(m: number[][]): number[] {
  return m.flat();
}

function runImperative(d: SelfAttentionData, heads: number) {
  const n = d.tokens.length;
  const dm = d.wq.length;
  const q = new Array<number>(n * dm).fill(0);
  const k = new Array<number>(n * dm).fill(0);
  const v = new Array<number>(n * dm).fill(0);
  const raw = new Array<number>(heads * n * n).fill(0);
  const weights = new Array<number>(heads * n * n).fill(0);
  const result = new Array<number>(n * dm).fill(0);
  const clear = runIR(selfAttentionImperativeIR, 'multiHeadAttention', [
    flat(d.x),
    flat(d.wq),
    flat(d.wk),
    flat(d.wv),
    n,
    dm,
    heads,
    q,
    k,
    v,
    raw,
    weights,
    result,
  ]);
  return { clear, q, k, v, raw, weights, result };
}

const fmt = (x: number) => x.toFixed(2);

describe('self-attention — IR 과 algorithm 이 같은 답을 낸다', () => {
  const orders: { name: string; order: number[] }[] = [
    { name: 'A B C D', order: [0, 1, 2, 3] },
    { name: 'C A D B', order: [2, 0, 3, 1] },
  ];
  for (const { name, order } of orders) {
    const d: SelfAttentionData = {
      ...data,
      tokens: order.map((i) => data.tokens[i]!),
      x: order.map((i) => data.x[i]!),
    };
    for (const heads of data.headsLadder) {
      it(`토큰 차례 ${name} · 머리 ${heads}`, () => {
        const r = computeRound(d, heads);
        const ir = runImperative(d, heads);
        expect(ir.clear).toBe(r.clear);
        expect(ir.q).toEqual(flat(r.q));
        expect(ir.k).toEqual(flat(r.k));
        expect(ir.v).toEqual(flat(r.v));
        expect(ir.raw).toEqual(r.raw.flat(2));
        expect(ir.weights).toEqual(r.weights.flat(2));
        expect(ir.result).toEqual(flat(r.result));
      });
    }
  }

  it('토큰 차례를 섞어도 결과와 짝이 같은 값의 자리바꿈이다', () => {
    const order = [2, 0, 3, 1];
    const d: SelfAttentionData = { ...data, tokens: order.map((i) => data.tokens[i]!), x: order.map((i) => data.x[i]!) };
    for (const heads of data.headsLadder) {
      const base = computeRound(data, heads);
      const mixed = computeRound(d, heads);
      order.forEach((src, pos) => {
        // 더하는 차례가 바뀌어 마지막 자리는 갈릴 수 있다
        mixed.result[pos]!.forEach((cell, c) => expect(cell).toBeCloseTo(base.result[src]![c]!, 12));
        for (let h = 0; h < heads; h += 1) {
          const want = base.picks[h]![src]!.keys.map((j) => data.tokens[j]).sort();
          const got = mixed.picks[h]![pos]!.keys.map((j) => d.tokens[j]).sort();
          expect(got).toEqual(want);
        }
      });
    }
  });
});

describe('self-attention — 사양 표 대조', () => {
  it('머리 1', () => {
    const r = computeRound(data, 1);
    expect(r.dk).toBe(4);
    expect(fmt(r.sqrtDk)).toBe('2.00');
    expect(r.q).toEqual([[2, 1, -2, -1], [-1, 2, 1, -2], [-2, -1, 2, 1], [1, -2, -1, 2]]);
    expect(r.k).toEqual([[1, -2, 2, 1], [2, 1, -1, 2], [-1, 2, -2, -1], [-2, -1, 1, -2]]);
    expect(r.v).toEqual([[2, 0, 2, 0], [0, 3, 0, 3], [-2, 1, -2, 1], [1, -2, 1, -2]]);
    expect(r.raw[0]).toEqual([[-5, 5, 5, -5], [-5, -5, 5, 5], [5, -5, -5, 5], [5, 5, -5, -5]]);
    expect(r.score[0]!.map((row) => row.map(fmt))).toEqual([
      ['-2.50', '2.50', '2.50', '-2.50'],
      ['-2.50', '-2.50', '2.50', '2.50'],
      ['2.50', '-2.50', '-2.50', '2.50'],
      ['2.50', '2.50', '-2.50', '-2.50'],
    ]);
    expect(r.weights[0]!.map((row) => row.map(fmt))).toEqual([
      ['0.00', '0.50', '0.50', '0.00'],
      ['0.00', '0.00', '0.50', '0.50'],
      ['0.50', '0.00', '0.00', '0.50'],
      ['0.50', '0.50', '0.00', '0.00'],
    ]);
    // 정수 동률 — 네 줄 모두 짝 둘
    expect(r.picks[0]!.map((p) => [p.tied, p.keys])).toEqual([
      [true, [1, 2]],
      [true, [2, 3]],
      [true, [0, 3]],
      [true, [0, 1]],
    ]);
    expect(r.result.map((row) => row.map(fmt))).toEqual([
      ['-0.98', '1.98', '-0.98', '1.98'],
      ['-0.49', '-0.49', '-0.49', '-0.49'],
      ['1.48', '-0.98', '1.48', '-0.98'],
      ['0.99', '1.49', '0.99', '1.49'],
    ]);
    expect([r.clear, r.tied, r.weightCount]).toEqual([0, 4, 48]);
    expect(fmt(r.topLow)).toBe('0.50');
    // 0.00 으로 보이는 무게도 0 이 아니다
    for (const row of r.weights[0]!) for (const w of row) expect(w).toBeGreaterThan(0);
  });

  it('머리 2', () => {
    const r = computeRound(data, 2);
    expect(r.dk).toBe(2);
    expect(fmt(r.sqrtDk)).toBe('1.41');
    expect(r.raw[0]).toEqual([[0, 5, 0, -5], [-5, 0, 5, 0], [0, -5, 0, 5], [5, 0, -5, 0]]);
    expect(r.raw[1]).toEqual([[-5, 0, 5, 0], [0, -5, 0, 5], [5, 0, -5, 0], [0, 5, 0, -5]]);
    expect(r.weights[0]!.map((row) => row.map(fmt))).toEqual([
      ['0.03', '0.94', '0.03', '0.00'],
      ['0.00', '0.03', '0.94', '0.03'],
      ['0.03', '0.00', '0.03', '0.94'],
      ['0.94', '0.03', '0.00', '0.03'],
    ]);
    expect(r.picks.map((hp) => hp.map((p) => (p.tied ? 'tie' : data.tokens[p.keys[0]!])))).toEqual([
      ['B', 'C', 'D', 'A'],
      ['C', 'D', 'A', 'B'],
    ]);
    expect(r.result.map((row) => row.map(fmt))).toEqual([
      ['0.00', '2.86', '-1.86', '0.97'],
      ['-1.86', '0.97', '0.94', '-1.86'],
      ['0.94', '-1.86', '1.91', '0.03'],
      ['1.91', '0.03', '0.00', '2.86'],
    ]);
    expect([r.clear, r.tied, r.weightCount]).toEqual([8, 0, 48]);
    expect(fmt(r.topLow)).toBe('0.94');
  });
});

describe('self-attention — 사다리', () => {
  it('headsLadder 와 segments[].value 가 같다', () => {
    const controls = (selfAttentionFacet.blocks.controls as { controls: unknown[] }).controls;
    const knob = controls.find(
      (c): c is { widget: string; action: string; segments: { value: number; default?: boolean }[] } =>
        typeof c === 'object' && c !== null && (c as { widget?: unknown }).widget === 'segmented-slider',
    );
    expect(knob).toBeDefined();
    expect(knob!.action).toBe('heads');
    expect(knob!.segments.map((s) => s.value)).toEqual(data.headsLadder);
    expect(knob!.segments.find((s) => s.default)!.value).toBe(data.heads);
    expect(data.headsLadder.length).toBe(2);
    expect(data.headsLadder[data.headsLadder.length - 1]).toBe(2);
    expect(data.tokens.length).toBe(4);
    expect(data.wq.length).toBe(4);
  });
});

/** 손잡이를 차례로 돌리며 판마다 계기를 모은다. */
async function playRounds(values: number[]) {
  const inputs = values.slice(1);
  const totals = new Map<string, number>();
  const snapshots: Record<string, number>[] = [];
  const events: FacetRuntimeEvent[] = [];
  let cancelled = false;
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
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
      snapshots.push(Object.fromEntries(totals));
      const next = inputs.shift();
      if (next === undefined) {
        cancelled = true;
        return { type: 'noop' };
      }
      return { type: 'heads', payload: { value: next } };
    },
  };
  await selfAttentionAlgorithm(ctx as never);
  return { snapshots, events };
}

describe('self-attention — 회차별 계기', () => {
  it('머리 1 → 2 → 1 로 돌려 판마다 사양 표와 같다', async () => {
    const { snapshots, events } = await playRounds([1, 2, 1]);
    expect(snapshots).toEqual([
      { 'clear-rows': 0, 'tied-rows': 4, 'weight-count': 48 },
      { 'clear-rows': 8, 'tied-rows': 0, 'weight-count': 48 },
      { 'clear-rows': 0, 'tied-rows': 4, 'weight-count': 48 },
    ]);
    // phase 는 그 걸음의 발신보다 앞에 온다
    const order = events.map((e) => (e.type === 'phase' ? `phase:${(e.payload as { phase: string }).phase}` : e.type));
    expect(order.slice(0, 11)).toEqual([
      'frame',
      'phase:project',
      'project',
      'phase:score',
      'score',
      'phase:softmax',
      'softmax',
      'phase:pick',
      'pick',
      'phase:mix',
      'mix',
    ]);
  });
});

describe('self-attention — 무대', () => {
  it('mountView 를 거쳐 판 둘을 그리고 새 판의 걸음 0 에서 결론을 걷는다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(selfAttentionStageView, container, {
      config: { type: 'self-attention-stage' },
      initialData: selfAttentionFacet.initialData as Record<string, unknown>,
      locale: 'ko',
      t: makeTranslator('ko', selfAttentionFacet.messages),
    });
    const projector = selfAttentionProjector({ stage }, undefined);
    const { events } = await playRounds([1, 2]);
    const texts = () => Array.from(container.querySelectorAll('text')).map((n) => n.textContent);
    let frames = 0;
    for (const e of events) {
      if (e.type === 'frame') frames += 1;
      await projector.onEvent(e);
      if (frames === 2 && e.type === 'frame') {
        // 앞 판의 무게 · 짝 · 계기 글자가 남지 않는다
        expect(texts().some((s) => s === '0.50')).toBe(false);
        expect(texts().some((s) => s !== null && s.startsWith('동률'))).toBe(false);
        expect(texts()).not.toContain('0 / 4');
      }
      if (frames === 1 && e.type === 'mix') {
        // 격자 무게 여덟 + 계기 줄 하나
        expect(texts().filter((s) => s === '0.50').length).toBe(9);
        expect(texts().filter((s) => s !== null && s.startsWith('동률')).length).toBe(4);
        expect(texts()).toContain('0 / 4');
      }
    }
    // 격자 무게 여덟 + 계기 줄 하나 + 결과 칸 둘
    expect(texts().filter((s) => s === '0.94').length).toBe(11);
    expect(texts()).toContain('8 / 8');
    expect(texts()).toContain('−1.86');
    stage.destroy();
  });
});

describe('self-attention — 되짚기 · 되돌리기', () => {
  it('첫 그림(frame)을 두 번 먹여도 무대 요소 수가 늘지 않는다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(selfAttentionStageView, container, {
      config: { type: 'self-attention-stage' },
      initialData: selfAttentionFacet.initialData as Record<string, unknown>,
      locale: 'ko',
      t: makeTranslator('ko', selfAttentionFacet.messages),
    });
    const projector = selfAttentionProjector({ stage }, undefined);
    const { events } = await playRounds([1]);
    const count = () => container.querySelectorAll('*').length;
    for (const e of events) await projector.onEvent(e);
    const once = count();
    // 되짚기처럼 자취 첫 줄부터 다시 먹인다
    for (const e of events) await projector.onEvent(e);
    expect(count()).toBe(once);
    stage.destroy();
  });
});
