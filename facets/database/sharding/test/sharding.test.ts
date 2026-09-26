// @vitest-environment happy-dom
/**
 * sharding 고유의 주장 — IR ↔ algorithm 전 조합 · 사양 표 대조 · 회차별 계기 · 사다리.
 * 공통분(손잡이가 닿는가 · 덮이는 phase · 계기 누적 · transpiler)은 whole-check 가 잰다.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent, type ReactiveInputEvent } from '@ffacet/core/runtime';
import {
  computeRound,
  shardingAlgorithm,
  shardingFacet,
  shardingImperativeIR,
  shardingStageView,
  type ShardingData,
} from '../src/index.js';

const data = shardingFacet.initialData as ShardingData;

/** 사양 실측표 (sim.py sharding). */
const TABLE: { mode: number; shards: number; load: number[]; share: number; touched: number; per: Record<number, number> }[] = [
  { mode: 0, shards: 2, load: [6, 6], share: 50, touched: 2, per: { 0: 4, 1: 4 } },
  { mode: 1, shards: 2, load: [0, 12], share: 100, touched: 1, per: { 1: 8 } },
  { mode: 0, shards: 3, load: [4, 4, 4], share: 33, touched: 3, per: { 0: 3, 1: 3, 2: 2 } },
  { mode: 1, shards: 3, load: [0, 0, 12], share: 100, touched: 1, per: { 2: 8 } },
  { mode: 0, shards: 4, load: [3, 3, 3, 3], share: 25, touched: 4, per: { 0: 2, 1: 2, 2: 2, 3: 2 } },
  { mode: 1, shards: 4, load: [0, 0, 0, 12], share: 100, touched: 1, per: { 3: 8 } },
];

function irRound(mode: number, shards: number): { load: number[]; hit: number[]; touched: number; share: number } {
  const load = new Array<number>(shards).fill(0);
  const hit = new Array<number>(shards).fill(0);
  const touched = runIR(shardingImperativeIR, 'routeAll', [mode, shards, data.oldMax, data.newCount, data.recent, load, hit]);
  const share = runIR(shardingImperativeIR, 'busiestShare', [load, data.newCount]);
  if (typeof touched !== 'number' || typeof share !== 'number') throw new Error('IR 이 수를 돌려주지 않았다');
  return { load, hit, touched, share };
}

describe('sharding — 사다리와 데이터', () => {
  it('사다리가 손잡이 segments 와 같다', () => {
    const controls = shardingFacet.blocks.controls as { controls?: { action: string; segments?: unknown }[] };
    if (!Array.isArray(controls.controls)) throw new Error('controls 블록이 없다');
    const seg = (action: string): number[] => {
      const c = (controls.controls ?? []).find((x) => x.action === action);
      if (!c || !Array.isArray(c.segments)) throw new Error(`${action} 손잡이가 없다`);
      return (c.segments as { value: number }[]).map((s) => s.value);
    };
    expect(seg('mode')).toEqual(data.modeLadder);
    expect(seg('shards')).toEqual(data.shardsLadder);
    // 데이터가 커지면 먼저 깨지게
    expect(data.shardsLadder.at(-1)).toBe(4);
    expect(data.modeLadder.at(-1)).toBe(1);
    expect(data.newCount).toBe(12);
    expect(data.recent).toBe(8);
  });
});

describe('sharding — IR ↔ algorithm ↔ 사양 표', () => {
  for (const row of TABLE) {
    it(`${row.mode === 0 ? '해시' : '구간'} · 샤드 ${row.shards}`, () => {
      const alg = computeRound(data, row.mode, row.shards);
      const ir = irRound(row.mode, row.shards);
      // IR 과 algorithm 이 같다
      expect(ir.load).toEqual(alg.load);
      expect(ir.touched).toBe(alg.touched);
      expect(ir.share).toBe(alg.share);
      expect(ir.hit.filter((h) => h === 1).length).toBe(alg.opened.length);
      // 사양 표와 같다
      expect(alg.load).toEqual(row.load);
      expect(alg.share).toBe(row.share);
      expect(alg.touched).toBe(row.touched);
      const per: Record<number, number> = {};
      alg.perShard.forEach((n, s) => {
        if (n > 0) per[s] = n;
      });
      expect(per).toEqual(row.per);
      expect([alg.lo, alg.hi]).toEqual([1005, 1012]);
      // 걸음 수 = 1 (처음) + 새 줄 + 질의 + 몫 = 15
      expect(1 + alg.keys.length + 2).toBe(15);
    });
  }

  it('동률 — 해시 셋은 모든 샤드가 가장 바쁘고, 구간 셋은 마지막 하나', () => {
    for (const row of TABLE) {
      const alg = computeRound(data, row.mode, row.shards);
      if (row.mode === 0) expect(alg.busiest.length).toBe(row.shards);
      else expect(alg.busiest).toEqual([row.shards - 1]);
    }
  });
});

describe('sharding — 회차별 계기 (기본 → 구간 → 기본)', () => {
  it('busiest-share 33 → 100 → 33 · shards-touched 3 → 1 → 3', async () => {
    const inputs: ReactiveInputEvent[] = [
      { type: 'mode', payload: { value: 1, segmentIndex: 1, mode: '1', shards: '3' } },
      { type: 'mode', payload: { value: 0, segmentIndex: 0, mode: '0', shards: '3' } },
    ];
    const metrics = new Map<string, number>();
    const rounds: Record<string, number>[] = [];
    const events: FacetRuntimeEvent[] = [];
    let cancelled = false;
    const ctx = {
      data: structuredClone(data),
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
        rounds.push(Object.fromEntries(metrics));
        const next = inputs.shift();
        if (!next) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return next;
      },
    };
    await shardingAlgorithm(ctx);
    expect(rounds).toEqual([
      { 'busiest-share': 33, 'shards-touched': 3 },
      { 'busiest-share': 100, 'shards-touched': 1 },
      { 'busiest-share': 33, 'shards-touched': 3 },
    ]);
    // 한 판의 걸음 이벤트 = 15 (layout 1 + route 12 + query 1 + share 1)
    const steps = events.filter((e) => !e.silent);
    expect(steps.length).toBe(45);
  });

  it('사다리 밖의 손잡이 값은 던진다', async () => {
    let cancelled = false;
    let asked = 0;
    const ctx = {
      data: structuredClone(data),
      get cancelled() {
        return cancelled;
      },
      async emit() {},
      metric() {},
      async sleep() {
        return true;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        asked += 1;
        if (asked > 1) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return { type: 'shards', payload: { value: 5, segmentIndex: 3 } };
      },
    };
    await expect(shardingAlgorithm(ctx)).rejects.toThrow(/사다리 밖/);
  });
});

describe('sharding — stage', () => {
  it('mountView 로 붙고 한 판을 그린다', async () => {
    const container = document.createElement('div');
    const inst = mountView(shardingStageView, container, { config: {}, initialData: data, locale: 'en' }) as unknown as {
      layout(p: unknown, ms: number): Promise<void>;
      route(p: unknown, ms: number): Promise<void>;
      destroy(): void;
    };
    const r = computeRound(data, 1, 3);
    await inst.layout(
      { mode: 1, shards: 3, table: data.table, key: data.key, width: r.width, count: data.newCount, bounds: r.bounds },
      1,
    );
    await inst.route({ index: 1, key: 1001, shard: 2, load: [0, 0, 1] }, 1);
    const txt = container.textContent ?? '';
    expect(txt).toContain('667..∞');
    expect(txt).toContain('Shard 2');
    expect(txt).toContain('New row 1001 → shard 2');
    inst.destroy();
  });
});
