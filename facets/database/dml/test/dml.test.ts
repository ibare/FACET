// @vitest-environment happy-dom
/**
 * dml 고유의 주장 — IR ↔ algorithm 전 차례 · 사양 실측표 · 회차별 계기 · 사다리 · 무대가 payload 와 맞는가.
 */
import { describe, expect, it } from 'vitest';
import { makeTranslator, mountView, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  dmlAlgorithm,
  dmlFacet,
  dmlImperativeIR,
  dmlProjector,
  dmlStageView,
  type DmlData,
  type DmlStatement,
} from '../src/index.js';

const base = dmlFacet.initialData as DmlData;
const clone = (): DmlData => structuredClone(base);

type Snapshot = Record<string, number>;
type Played = { events: FacetRuntimeEvent[]; rounds: Snapshot[] };

/** 가짜 reactive ctx 로 algorithm 을 돌린다. inputs 를 다 쓰면 취소한다. 판이 끝날 때마다 계기를 찍는다 */
async function play(inputs: number[], onEvent?: (e: FacetRuntimeEvent) => Promise<void>): Promise<Played> {
  const data = clone();
  const events: FacetRuntimeEvent[] = [];
  const metrics: Snapshot = {};
  const rounds: Snapshot[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (onEvent) await onEvent(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      rounds.push({ ...metrics });
      const v = queue.shift();
      if (v === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'order', payload: { value: v, order: String(v) } };
    },
    pollInput() {
      return null;
    },
  } as unknown as ReactiveContext<DmlData>;
  await dmlAlgorithm(ctx);
  return { events, rounds };
}

type StatementPayload = {
  kind: string;
  affected: number;
  rows: { slot: number; values: (number | string)[] }[];
  rowCount: number;
};

/** 판 하나의 statement payload 셋 */
function statementsOf(events: FacetRuntimeEvent[]): StatementPayload[] {
  return events.filter((e) => e.type === 'statement').map((e) => e.payload as StatementPayload);
}

function irRun(order: string): { rows: number; affected: number[]; water: number[]; alive: number[] } {
  const keys = base.statements.map((s) => s.key); // 처음 나온 차례로 0 부터
  const code = [...order].map((k) => keys.indexOf(k));
  const waterCol = base.columns.findIndex((c) => c.name === 'water');
  const water = [...base.rows.map((r) => r[waterCol] as number), 0];
  const alive = [...base.rows.map(() => 1), 0];
  const affected = [0, 0, 0];
  const ins = base.statements.find((s) => s.kind === 'INSERT') as Extract<DmlStatement, { kind: 'INSERT' }>;
  const upd = base.statements.find((s) => s.kind === 'UPDATE') as Extract<DmlStatement, { kind: 'UPDATE' }>;
  const del = base.statements.find((s) => s.kind === 'DELETE') as Extract<DmlStatement, { kind: 'DELETE' }>;
  const rows = runIR(dmlImperativeIR, 'applyInOrder', [
    code,
    water,
    alive,
    water.length,
    affected,
    ins.values[waterCol] as number,
    upd.bound,
    upd.add,
    del.bound,
  ]);
  return { rows: rows as number, affected, water, alive };
}

// 사양 실측표 (sim.py dml) — 대조용
const SPEC: Record<string, { affected: number[]; end: string }> = {
  IUD: { affected: [1, 3, 3], end: '1 fern 6 · 3 ivy 7' },
  IDU: { affected: [1, 0, 3], end: '1 fern 6 · 2 moss 8 · 3 ivy 7 · 4 palm 10 · 5 cactus 9' },
  UID: { affected: [2, 1, 2], end: '1 fern 6 · 3 ivy 7 · 5 cactus 2' },
  UDI: { affected: [2, 2, 1], end: '1 fern 6 · 3 ivy 7 · 5 cactus 2' },
  DIU: { affected: [0, 1, 3], end: '1 fern 6 · 2 moss 8 · 3 ivy 7 · 4 palm 10 · 5 cactus 9' },
  DUI: { affected: [0, 2, 1], end: '1 fern 6 · 2 moss 8 · 3 ivy 7 · 4 palm 10 · 5 cactus 2' },
};

describe('dml', () => {
  it('사다리가 손잡이 구간과 같다', () => {
    const controls = (dmlFacet.blocks.controls as { controls: { widget?: string; segments?: unknown[] }[] }).controls;
    const slider = controls.find((c) => c.widget === 'segmented-slider') as {
      segments: { value: number; label: string; default?: boolean }[];
    };
    expect(slider.segments.map((s) => s.value)).toEqual(base.orders.map((_, i) => i));
    expect(slider.segments.map((s) => s.label)).toEqual(base.orders);
    expect(slider.segments.find((s) => s.default)?.value).toBe(base.order);
    expect(base.orders).toHaveLength(6);
    expect(slider.segments[slider.segments.length - 1]?.value).toBe(5);
    expect(base.rows).toHaveLength(4);
  });

  it('모든 차례에서 algorithm 과 IR 과 사양 실측표가 같다', async () => {
    for (let v = 0; v < base.orders.length; v++) {
      const order = base.orders[v] as string;
      const { events } = await play([v]);
      // 첫 판은 기본값(0)이다 — v 판은 둘째 판
      const sts = statementsOf(events).slice(3);
      expect(sts).toHaveLength(3);
      const affected = sts.map((s) => s.affected);
      const last = sts[2] as StatementPayload;
      const end = last.rows.map((r) => r.values.join(' ')).join(' · ');

      const ir = irRun(order);
      expect(ir.water).toHaveLength(5);
      expect(affected).toEqual(ir.affected);
      expect(last.rowCount).toBe(ir.rows);
      const irEnd = base.rows
        .concat([[5, 'cactus', 0]])
        .map((r, i) => ({ r, i }))
        .filter(({ i }) => ir.alive[i] === 1)
        .map(({ r, i }) => `${r[0]} ${r[1]} ${ir.water[i]}`)
        .join(' · ');
      expect(end).toBe(irEnd);

      expect(affected).toEqual(SPEC[order]?.affected);
      expect(end).toBe(SPEC[order]?.end);
      expect(Math.max(...ir.water)).toBeLessThanOrEqual(10);
    }
  });

  it('회차마다 계기가 사양과 같다 — IUD → DIU → IUD', async () => {
    const { rounds } = await play([4, 0]);
    expect(rounds).toEqual([
      { 'end-rows': 2, 'updated-rows': 3, 'deleted-rows': 3 },
      { 'end-rows': 5, 'updated-rows': 3, 'deleted-rows': 0 },
      { 'end-rows': 2, 'updated-rows': 3, 'deleted-rows': 3 },
    ]);
  });

  it('회차마다 계기가 사양과 같다 — UDI → DUI → UDI', async () => {
    const { rounds } = await play([3, 5, 3]);
    expect(rounds.slice(1)).toEqual([
      { 'end-rows': 3, 'updated-rows': 2, 'deleted-rows': 2 },
      { 'end-rows': 5, 'updated-rows': 2, 'deleted-rows': 0 },
      { 'end-rows': 3, 'updated-rows': 2, 'deleted-rows': 2 },
    ]);
  });

  it('걸음마다 줄 수 흐름이 사양과 같다', async () => {
    const flows: Record<string, number[]> = { IUD: [4, 5, 5, 2], UDI: [4, 4, 2, 3] };
    for (const [order, flow] of Object.entries(flows)) {
      const { events } = await play([base.orders.indexOf(order)]);
      const counts = events
        .filter((e) => e.type === 'order-set' || e.type === 'statement')
        .map((e) => (e.payload as { rowCount: number }).rowCount)
        .slice(4);
      expect(counts).toEqual(flow);
    }
  });

  it('INSERT 의 줄이 스키마에 맞지 않으면 던진다', async () => {
    const data = clone();
    const ins = data.statements.find((s) => s.kind === 'INSERT') as Extract<DmlStatement, { kind: 'INSERT' }>;
    ins.values = [5, 'cactus-long', 2];
    const ctx = {
      data,
      cancelled: false,
      emit: async () => undefined,
      metric: () => undefined,
      sleep: async () => true,
      waitForInput: async () => {
        throw new Error('입력 없음');
      },
      pollInput: () => null,
    } as unknown as ReactiveContext<DmlData>;
    await expect(dmlAlgorithm(ctx)).rejects.toThrow(/글자를 넘는다/);
  });

  it('무대가 모든 차례의 payload 를 끝까지 그린다 (즉시 모드)', async () => {
    const container = document.createElement('div');
    const stage = mountView(dmlStageView, container, {
      config: { type: 'dml-stage' },
      initialData: clone(),
      locale: 'ko',
      isInstant: () => true,
    });
    const projector = dmlProjector({ stage }, { getSpeed: () => 1, t: makeTranslator() });
    await play([1, 2, 3, 4, 5], async (e) => {
      await projector.onEvent(e);
    });
    const text = container.textContent ?? '';
    expect(text).toContain('Affected rows: 1');
    expect(text).toContain('cactus');
    stage.destroy();
  });
});
