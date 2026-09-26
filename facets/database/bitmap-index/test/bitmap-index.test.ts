// @vitest-environment happy-dom
/**
 * bitmap-index 고유의 주장 — IR ↔ algorithm 전 조합, 회차별 계기, 사다리, 무대의 수.
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent, type ReactiveInputEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  bitmapIndexAlgorithm,
  bitmapIndexFacet,
  bitmapIndexImperativeIR,
  bitmapIndexProjector,
  bitmapIndexStageView,
  combineRows,
  flatBits,
  querySql,
  type BitmapIndexData,
} from '../src/index.js';

const data = bitmapIndexFacet.initialData as BitmapIndexData;

/** 사양의 실측표 (sim.py bitmap-index) — 대조용 */
const SPEC: Record<string, { bits: string; bitsRead: number; rowsRead: number; picked: string }> = {
  'AND 1': { bits: '110100101000', bitsRead: 12, rowsRead: 5, picked: 'r1 r2 r4 r7 r9' },
  'AND 2': { bits: '100100100000', bitsRead: 24, rowsRead: 3, picked: 'r1 r4 r7' },
  'AND 3': { bits: '100000000000', bitsRead: 36, rowsRead: 1, picked: 'r1' },
  'OR 1': { bits: '110100101000', bitsRead: 12, rowsRead: 5, picked: 'r1 r2 r4 r7 r9' },
  'OR 2': { bits: '110110101100', bitsRead: 24, rowsRead: 7, picked: 'r1 r2 r4 r5 r7 r9 r10' },
  'OR 3': { bits: '111110111111', bitsRead: 36, rowsRead: 11, picked: 'r1 r2 r3 r4 r5 r7 r8 r9 r10 r11 r12' },
};

type Played = { events: FacetRuntimeEvent[]; metrics: Map<string, number>; rounds: RoundLog[] };
type RoundLog = { events: FacetRuntimeEvent[]; metrics: Map<string, number> };

/** 가짜 reactive 문맥 — 입력을 차례로 건네고, 다 쓰면 취소한다 */
async function play(inputs: ReactiveInputEvent[]): Promise<Played> {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const rounds: RoundLog[] = [];
  let current: RoundLog | null = null;
  const queue = [...inputs];
  let cancelled = false;
  const closeRound = () => {
    if (current) current.metrics = new Map(metrics);
  };
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'round') {
        current = { events: [], metrics: new Map() };
        rounds.push(current);
      }
      current?.events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      const d = delta === 'inc' ? 1 : delta;
      metrics.set(name, (metrics.get(name) ?? 0) + d);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      closeRound();
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        return { type: 'none' };
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await bitmapIndexAlgorithm(ctx as never);
  return { events, metrics, rounds };
}

const knob = (type: 'combine' | 'conditions', value: number): ReactiveInputEvent => ({
  type,
  payload: { value, segmentIndex: 0 },
});

function lastOf(events: FacetRuntimeEvent[], type: string): Record<string, unknown> {
  const hit = [...events].reverse().find((e) => e.type === type);
  if (!hit || typeof hit.payload !== 'object' || hit.payload === null) throw new Error(`${type} 가 없다`);
  return hit.payload as Record<string, unknown>;
}

function irRun(k: number, useOr: number): { count: number; result: number[] } {
  const bits = flatBits(data);
  const result = new Array<number>(data.rows.length).fill(0);
  const count = runIR(bitmapIndexImperativeIR, 'combineBits', [bits, data.rows.length, k, useOr, result]);
  if (typeof count !== 'number') throw new Error('IR 이 수를 내지 않았다');
  return { count, result };
}

describe('bitmap-index', () => {
  it('사다리가 손잡이 구간 값과 같고, IR 에 건네는 배열 길이가 사다리 끝값과 줄 수로 정해진다', () => {
    const controls = (bitmapIndexFacet.blocks.controls as { controls: { action: string; segments?: { value: number }[] }[] })
      .controls;
    const cond = controls.find((c) => c.action === 'conditions');
    const comb = controls.find((c) => c.action === 'combine');
    expect(cond?.segments?.map((s) => s.value)).toEqual(data.conditionsLadder);
    expect(comb?.segments?.map((s) => s.value)).toEqual(data.combineWords.map((_, i) => i));
    expect(data.conditionsLadder).toEqual([1, 2, 3]);
    expect(data.rows.length).toBe(12);
    expect(flatBits(data).length).toBe(36);
    expect(Math.max(...data.conditionsLadder)).toBe(data.conditions.length);
  });

  it('모든 손잡이 조합에서 IR 과 알고리즘과 사양 표가 같다', async () => {
    for (const [combine, word] of data.combineWords.entries()) {
      for (const k of data.conditionsLadder) {
        const spec = SPEC[`${word} ${k}`];
        if (!spec) throw new Error(`사양 표에 ${word} ${k} 가 없다`);
        const structural = combineRows(data, k, word === 'OR');
        const ir = irRun(k, combine);
        expect(ir.result.join('')).toBe(spec.bits);
        expect(structural.result.join('')).toBe(spec.bits);
        expect(ir.count).toBe(spec.rowsRead);
        expect(structural.rowsRead).toBe(spec.rowsRead);
        expect(structural.bitsRead).toBe(spec.bitsRead);
        expect(structural.picked.map((r) => `r${r + 1}`).join(' ')).toBe(spec.picked);

        // 알고리즘이 화면에 내는 값
        const { rounds } = await play([knob('combine', combine), knob('conditions', k)]);
        const last = rounds[rounds.length - 1];
        if (!last) throw new Error('판이 없다');
        const fetch = lastOf(last.events, 'fetch');
        expect(fetch.rowsRead).toBe(ir.count);
        expect(fetch.bitsRead).toBe(spec.bitsRead);
        expect((fetch.rows as number[]).map((r) => `r${r + 1}`).join(' ')).toBe(spec.picked);
        const loadOrCombine = [...last.events].reverse().find((e) => e.type === 'combine' || e.type === 'load');
        expect((loadOrCombine?.payload as { result: string }).result).toBe(ir.result.join(''));
        // 걸음 수 (걸음 0 포함) = k + 2
        expect(last.events.filter((e) => !e.silent).length).toBe(k + 2);
        const round = lastOf(last.events, 'round');
        expect(round.sql).toBe(querySql(data, k, word));
      }
    }
  });

  it('SQL 은 사양의 문장 그대로다', () => {
    expect(querySql(data, 1, 'AND')).toBe("SELECT * FROM cars WHERE color = 'red'");
    expect(querySql(data, 2, 'AND')).toBe("SELECT * FROM cars WHERE color = 'red' AND fuel = 'ev'");
    expect(querySql(data, 3, 'OR')).toBe(
      "SELECT * FROM cars WHERE color = 'red' OR fuel = 'ev' OR gear = 'auto'",
    );
  });

  it('회차마다 계기가 사양 표와 같다 — A → B → A', async () => {
    const { rounds } = await play([
      knob('conditions', 3), // AND 3
      knob('conditions', 2), // AND 2
      knob('combine', 1), // OR 2
      knob('conditions', 3), // OR 3
      knob('combine', 0), // AND 3
      knob('conditions', 1), // AND 1
    ]);
    const expected = ['AND 2', 'AND 3', 'AND 2', 'OR 2', 'OR 3', 'AND 3', 'AND 1'];
    expect(rounds.length).toBe(expected.length);
    rounds.forEach((round, i) => {
      const spec = SPEC[expected[i] ?? ''];
      if (!spec) throw new Error('사양 표에 없는 판');
      expect(round.metrics.get('bits-read')).toBe(spec.bitsRead);
      expect(round.metrics.get('rows-read')).toBe(spec.rowsRead);
    });
  });

  it('덮이는 phase — 걸음마다 그 걸음의 phase 가 마지막이다', async () => {
    const { rounds } = await play([knob('combine', 1)]);
    for (const round of rounds) {
      let lastPhase: string | null = null;
      const seen: string[] = [];
      for (const e of round.events) {
        if (e.type === 'phase') lastPhase = (e.payload as { phase: string }).phase;
        else if (e.type !== 'round') seen.push(`${e.type}:${lastPhase}`);
      }
      const word = (lastOf(round.events, 'round').combineWord as string).toLowerCase();
      expect(seen).toEqual(['load:load-first', `combine:combine-${word}`, 'fetch:fetch-rows']);
    }
  });

  it('무대가 받은 수를 그대로 보인다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(bitmapIndexStageView, container, { config: {}, locale: 'en' });
    const projector = bitmapIndexProjector({ stage });
    const { rounds } = await play([knob('combine', 1), knob('conditions', 3)]);
    const last = rounds[rounds.length - 1];
    if (!last) throw new Error('판이 없다');
    for (const e of last.events) await projector.onEvent(e);
    const text = container.textContent ?? '';
    expect(text).toContain("SELECT * FROM cars WHERE color = 'red' OR fuel = 'ev' OR gear = 'auto'");
    expect(text).toContain('Bits read: 36');
    expect(text).toContain('Rows read: 11');
    expect(text).toContain('Ones in result: 11');
    stage.destroy();
  });
});
