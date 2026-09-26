// @vitest-environment happy-dom
/**
 * optimizer 고유 검수 — IR ↔ 알고리즘 전 조합, 회차별 계기(사양 표), 사다리, 무대 마운트.
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetContext } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  cheaperOrder,
  optimizerAlgorithm,
  optimizerFacet,
  optimizerImperativeIR,
  optimizerProjector,
  optimizerStageView,
  runPlan,
  type OptimizerData,
} from '../src/index.js';

const data = optimizerFacet.initialData as unknown as OptimizerData;

/** 사양 실측표 (python3 sim.py optimizer) — k: [고객먼저 중간, 고객먼저 만든 줄, 할인먼저 중간, 할인먼저 만든 줄, 끝 줄, 싼 차례] */
const SPEC: Record<number, [number, number, number, number, number, number]> = {
  1: [4, 5, 9, 10, 1, 0],
  2: [8, 11, 9, 12, 3, 0],
  3: [12, 16, 9, 13, 4, 1],
  4: [16, 22, 9, 15, 6, 1],
  5: [20, 27, 9, 16, 7, 1],
  6: [24, 33, 9, 18, 9, 1],
};

function column(key: string, col: string): (string | number)[] {
  const tb = data.tables[key];
  if (!tb) throw new Error(`표 ${key} 없음`);
  const i = tb.columns.indexOf(col);
  if (i < 0) throw new Error(`열 ${col} 없음`);
  return tb.rows.map((r) => r[i] as string | number);
}

/** 품목 → 사전순 번호 (바이트 사전순). */
const items = [...new Set([...column('orders', 'item'), ...column('sale_items', 'item')].map(String))].sort();
const code = (s: string): number => {
  const i = items.indexOf(s);
  if (i < 0) throw new Error(`품목 ${s} 없음`);
  return i;
};

function irArgs(k: number): unknown[] {
  const orderCust = column('orders', 'cust_id') as number[];
  return [
    column('customers', 'id'),
    orderCust,
    column('orders', 'item').map((s) => code(String(s))),
    column('sale_items', 'item').map((s) => code(String(s))),
    k,
    new Array(orderCust.length).fill(0),
  ];
}

const irInt = (fn: string, k: number): number => {
  const v = runIR(optimizerImperativeIR, fn, irArgs(k) as never);
  if (typeof v !== 'number') throw new Error(`${fn} 답이 수가 아니다`);
  return v;
};

describe('optimizer — 자료와 사다리', () => {
  it('사다리가 손잡이 구간 값과 같고, 자료 크기를 잠근다', () => {
    const controls = (optimizerFacet.blocks.controls as { controls: { action: string; segments?: { value: number }[] }[] }).controls;
    const seg = (a: string) => controls.find((c) => c.action === a)?.segments?.map((s) => s.value);
    expect(seg('filteredCustomers')).toEqual(data.filteredLadder);
    expect(seg('joinOrder')).toEqual(data.orderLadder);
    expect(data.filteredLadder.at(-1)).toBe(6);
    expect(data.orderLadder).toEqual([0, 1]);
    expect(data.joinOrders).toEqual(['customers-first', 'sales-first']);
    expect(column('orders', 'id')).toHaveLength(24);
    expect((irArgs(1)[5] as number[]).length).toBe(24);
  });

  it('품목 번호는 사양의 번호와 같고, 문자열 같음과 번호 같음이 모든 쌍에서 맞다', () => {
    expect(items).toEqual(['bag', 'cup', 'ink', 'mug', 'pad', 'pen']);
    for (const a of items) for (const b of items) expect(a === b).toBe(code(a) === code(b));
  });
});

describe('optimizer — 구조 셈 · IR · 사양 표', () => {
  for (const k of data.filteredLadder) {
    it(`k = ${k}`, () => {
      const cf = runPlan(data, 0, k);
      const sf = runPlan(data, 1, k);
      const [cfMid, cfMade, sfMid, sfMade, fin, cheaper] = SPEC[k] as number[];
      expect([cf.middle, cf.made, sf.middle, sf.made, cf.final, sf.final]).toEqual([cfMid, cfMade, sfMid, sfMade, fin, fin]);
      expect(cheaperOrder([cf.made, sf.made])).toBe(cheaper);
      // 두 차례의 끝 줄은 같은 줄을 같은 차례로 낸다
      expect(sf.result).toEqual(cf.result);
      // IR 이 화면과 같은 답을 낸다
      expect(irInt('customersFirstRows', k)).toBe(cf.made);
      expect(irInt('salesFirstRows', k)).toBe(sf.made);
      expect(irInt('cheaperMadeRows', k)).toBe(Math.min(cf.made, sf.made));
      // 동률이 걸리지 않는다
      expect(cf.made).not.toBe(sf.made);
    });
  }

  it('k = 3 의 중간 줄과 끝 줄이 사양과 같다', () => {
    const ids = (rows: Record<string, unknown>[]) => rows.map((r) => r['o.id']);
    expect(ids(runPlan(data, 0, 3).joinRows[0] as Record<string, unknown>[])).toEqual([101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112]);
    expect(ids(runPlan(data, 1, 3).joinRows[0] as Record<string, unknown>[])).toEqual([102, 105, 107, 111, 113, 115, 119, 121, 123]);
    expect(runPlan(data, 0, 3).result.map((r) => `(${String(r['c.name'])}, ${String(r['o.item'])})`)).toEqual([
      '(Ari, ink)',
      '(Bo, mug)',
      '(Bo, ink)',
      '(Cyd, mug)',
    ]);
  });
});

type Emitted = { type: string; payload?: unknown; silent?: boolean };

/** 알고리즘을 입력 목록대로 돌려, 판마다 계기 값과 이벤트를 모은다. */
async function drive(inputs: { type: string; payload: Record<string, unknown> }[]) {
  const metrics = new Map<string, number>();
  const events: Emitted[] = [];
  const rounds: Record<string, number>[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const snap = () => Object.fromEntries(metrics);
  const ctx = {
    data,
    async emit(e: Emitted) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    get cancelled() {
      return cancelled;
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      rounds.push(snap());
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
  };
  await optimizerAlgorithm(ctx as unknown as FacetContext<OptimizerData>);
  return { rounds, events };
}

describe('optimizer — 회차별 계기 (A → B → A)', () => {
  it('k 2 → 3 → 2, 차례 바꿔 할인 먼저 → 고객 먼저', async () => {
    const { rounds, events } = await drive([
      { type: 'filteredCustomers', payload: { value: 3, segmentIndex: 2, filteredCustomers: '3', joinOrder: '0' } },
      { type: 'filteredCustomers', payload: { value: 2, segmentIndex: 1, filteredCustomers: '2', joinOrder: '0' } },
      { type: 'joinOrder', payload: { value: 1, segmentIndex: 1, filteredCustomers: '2', joinOrder: '1' } },
      { type: 'filteredCustomers', payload: { value: 5, segmentIndex: 4, filteredCustomers: '5', joinOrder: '1' } },
      { type: 'joinOrder', payload: { value: 0, segmentIndex: 0, filteredCustomers: '5', joinOrder: '0' } },
    ]);
    const want = (k: number, order: number) => {
      const s = SPEC[k] as number[];
      const mid = order === 0 ? s[0] : s[2];
      const made = order === 0 ? s[1] : s[3];
      return { 'middle-rows': mid, 'final-rows': s[4], 'made-rows': made };
    };
    expect(rounds).toEqual([want(2, 0), want(3, 0), want(2, 0), want(2, 1), want(5, 1), want(5, 0)]);
    // 한 판 = 걸음 넷: silent 가 아닌 이벤트가 판마다 넷
    const loud = events.filter((e) => !e.silent).map((e) => e.type);
    expect(loud.slice(0, 4)).toEqual(['round', 'first-join', 'second-join', 'compare']);
    expect(loud).toHaveLength(4 * 6);
    // 견줌의 싼 차례
    const cmp = events.filter((e) => e.type === 'compare').map((e) => (e.payload as { cheaper: number }).cheaper);
    expect(cmp).toEqual([0, 1, 0, 0, 1, 1]);
    // phase 는 돌린 차례의 것만
    const phases = events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase);
    expect(phases.slice(0, 3)).toEqual(['cf-join-orders', 'cf-join-sales', 'compare-orders']);
    expect(phases.slice(9, 12)).toEqual(['sf-join-sales', 'sf-join-customers', 'compare-orders']);
  });

  it('사다리 밖 값 · 남의 입력은 흘린다', async () => {
    const { rounds } = await drive([
      { type: 'filteredCustomers', payload: { value: 9, segmentIndex: 0 } },
      { type: 'somethingElse', payload: { value: 1 } },
      { type: 'filteredCustomers', payload: { value: 6, segmentIndex: 5 } },
    ]);
    // 흘린 입력마다 다시 기다리므로 같은 판의 값이 거듭 찍힌다 — 판은 둘뿐이다
    expect(rounds.map((r) => r['made-rows'])).toEqual([11, 11, 11, 33]);
  });
});

describe('optimizer — 무대', () => {
  it('mountView 로 띄워 한 판을 그리고 차례를 바꾼다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(optimizerStageView, container, {
      config: { type: 'optimizer-stage' },
      initialData: optimizerFacet.initialData as Record<string, unknown>,
      locale: 'en',
    });
    const proj = optimizerProjector({ stage }, { getSpeed: () => 1, t: (_k, f) => f });
    const { events } = await drive([
      { type: 'joinOrder', payload: { value: 1, segmentIndex: 1, filteredCustomers: '3', joinOrder: '1' } },
    ]);
    for (const e of events) await proj.onEvent(e as never);
    const txt = container.textContent ?? '';
    expect(txt).toContain('WHERE c.id <= 3');
    expect(txt).toContain('(Cyd, mug)');
    expect(txt).toContain('Rows made');
    stage.destroy();
  });
});
