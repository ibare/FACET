/**
 * cooperative-yielding — facet 고유 검수.
 *
 * 1. IR(`computeSchedule`) ↔ algorithm 이 모든 손잡이 조합(쪼갬 5 × 이어거는곳 2 = 10)에서
 *    같은 다 됨 시각 · 클릭 기다림 · 렌더 횟수를 낸다.
 * 2. 위 값들을 사양의 실측 표와 대조한다(`spec-cooperative-yielding.md`).
 * 3. 사다리(`initialData.chunkSizes`/`viaOptions`)가 손잡이 segments 의 값과 같다.
 * 4. 회차별 계기 — chunkSize 를 100 → 50 → 100 으로 돌려 첫 판과 셋째 판의 계기가 같다.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import type { FacetRuntimeEvent } from '@ffacet/core';
import { cooperativeYieldingImperativeIR } from '../src/irs.js';
import { cooperativeYieldingAlgorithm, type CooperativeYieldingData } from '../src/algorithm.js';
import { cooperativeYieldingFacet } from '../src/facet.js';

type Combo = { chunkSize: number; via: 0 | 1; doneAt: number; waits: number[]; renders: number; floorHits: number };

/**
 * `judge-sim.py event-loop` 실측 그대로(사양의 "손잡이" 표) + 이 배치에서 다시 확인한
 * idle 경계 렌더까지 포함한 값. `queueMicrotask` 는 다섯 조합 모두 값이 같다(총 ms 가
 * 쪼갬 크기와 무관하게 60 이라서).
 */
const TABLE: Combo[] = [
  { chunkSize: 500, via: 0, doneAt: 60, waits: [53, 35, 17], renders: 1, floorHits: 0 },
  { chunkSize: 500, via: 1, doneAt: 60, waits: [53, 35, 17], renders: 1, floorHits: 0 },
  { chunkSize: 250, via: 0, doneAt: 64, waits: [23, 5, 17], renders: 2, floorHits: 0 },
  { chunkSize: 250, via: 1, doneAt: 60, waits: [53, 35, 17], renders: 1, floorHits: 0 },
  { chunkSize: 100, via: 0, doneAt: 66, waits: [5, 11, 5], renders: 4, floorHits: 0 },
  { chunkSize: 100, via: 1, doneAt: 60, waits: [53, 35, 17], renders: 1, floorHits: 0 },
  { chunkSize: 50, via: 0, doneAt: 76, waits: [5, 5, 0], renders: 5, floorHits: 3 },
  { chunkSize: 50, via: 1, doneAt: 60, waits: [53, 35, 17], renders: 1, floorHits: 0 },
  { chunkSize: 25, via: 0, doneAt: 115, waits: [2, 3, 0], renders: 7, floorHits: 13 },
  { chunkSize: 25, via: 1, doneAt: 60, waits: [53, 35, 17], renders: 1, floorHits: 0 },
];

const CLICK_TIMES = [7, 27, 47];

describe('IR ↔ 사양 표', () => {
  for (const c of TABLE) {
    it(`쪼갬 ${c.chunkSize} · ${c.via === 0 ? 'setTimeout' : 'queueMicrotask'}`, () => {
      const waits = [0, 0, 0];
      const stats = [0, 0];
      const doneAt = runIR(cooperativeYieldingImperativeIR, 'computeSchedule', [c.chunkSize, c.via === 1, CLICK_TIMES, waits, stats]);
      expect(doneAt).toBe(c.doneAt);
      expect(waits).toEqual(c.waits);
      expect(stats[0]).toBe(c.renders);
      expect(stats[1]).toBe(c.floorHits);
    });
  }
});

/** algorithm 을 실제로 돌려 판마다(default → 각 손잡이 값 → default) 모은 발신에서 dom/click/renders 를 뽑는다. */
async function driveAlgorithm(inputs: { type: string; payload: Record<string, unknown> }[]) {
  const data: CooperativeYieldingData = {
    type: 'cooperativeYielding',
    stepMs: 1300,
    totalRows: 500,
    msPer100Rows: 12,
    clickIds: ['click1', 'click2', 'click3'],
    clickTimes: CLICK_TIMES,
    clickProcessMs: 2,
    nestingFloorLevel: 5,
    nestingFloorMs: 4,
    chunkSizes: [500, 250, 100, 50, 25],
    viaOptions: [0, 1],
    chunkSize: 100,
    via: 0,
    codeSetTimeout: 'x',
    codeQueueMicrotask: 'y',
  };
  type Round = { doneAt: number | null; waits: number[]; renders: number; metrics: Map<string, number> };
  const rounds: Round[] = [];
  const totals = new Map<string, number>();
  let current: Round = { doneAt: null, waits: [], renders: 0, metrics: totals };
  const queue = [...inputs];
  let cancelled = false;
  let idle!: () => void;
  const waiting = new Promise<void>((r) => (idle = r));
  const close = () => rounds.push({ ...current, metrics: new Map(totals) });
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc'): void {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit(event: FacetRuntimeEvent): Promise<void> {
      const p = event.payload as Record<string, unknown> | undefined;
      if (event.type === 'done' && typeof p?.atMs === 'number') current.doneAt = p.atMs;
      if (event.type === 'click' && typeof p?.waitMs === 'number') current.waits.push(p.waitMs);
      if (event.type === 'render') current.renders += 1;
    },
    async sleep(): Promise<boolean> {
      return !cancelled;
    },
    async waitForInput(): Promise<{ type: string; payload: Record<string, unknown> }> {
      close();
      const next = queue.shift();
      if (!next) {
        idle();
        return new Promise<never>(() => {});
      }
      current = { doneAt: null, waits: [], renders: 0, metrics: totals };
      return next;
    },
    pollInput(): null {
      return null;
    },
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('20 초 안에 입력 대기에 닿지 않았다')), 20_000);
  });
  try {
    await Promise.race([cooperativeYieldingAlgorithm(ctx as never).then(() => close()), waiting, cap]);
  } finally {
    clearTimeout(timer);
    cancelled = true;
  }
  return rounds;
}

describe('algorithm ↔ IR — 모든 손잡이 조합', () => {
  for (const c of TABLE) {
    it(`쪼갬 ${c.chunkSize} · ${c.via === 0 ? 'setTimeout' : 'queueMicrotask'}`, async () => {
      const inputs: { type: string; payload: Record<string, unknown> }[] = [];
      if (c.chunkSize !== 100) inputs.push({ type: 'chunkSize', payload: { value: c.chunkSize, segmentIndex: 0 } });
      if (c.via !== 0) inputs.push({ type: 'via', payload: { value: c.via, segmentIndex: 0 } });
      const rounds = await driveAlgorithm(inputs);
      const round = rounds[rounds.length - 1]!;
      expect(round.doneAt).toBe(c.doneAt);
      expect(round.waits).toEqual(c.waits);
      expect(round.renders).toBe(c.renders);
    });
  }
});

describe('사다리 = segments 값', () => {
  it('chunkSize 손잡이', () => {
    const controls = (cooperativeYieldingFacet.blocks.controls as { controls: { name?: string; segments?: { value: unknown }[] }[] }).controls;
    const knob = controls.find((c) => c.name === 'chunkSize');
    expect(knob).toBeDefined();
    const values = (knob!.segments ?? []).map((s) => s.value);
    expect(values).toEqual(cooperativeYieldingFacet.initialData.chunkSizes);
  });
  it('via 손잡이', () => {
    const controls = (cooperativeYieldingFacet.blocks.controls as { controls: { name?: string; segments?: { value: unknown }[] }[] }).controls;
    const knob = controls.find((c) => c.name === 'via');
    expect(knob).toBeDefined();
    const values = (knob!.segments ?? []).map((s) => s.value);
    expect(values).toEqual(cooperativeYieldingFacet.initialData.viaOptions);
  });
});

describe('계기 — 판마다 쌓이지 않는다', () => {
  it('chunkSize 를 100 → 50 → 100 으로 돌려도 첫 판과 셋째 판의 계기가 같다', async () => {
    const rounds = await driveAlgorithm([
      { type: 'chunkSize', payload: { value: 50, segmentIndex: 3, chunkSize: '50', via: '0' } },
      { type: 'chunkSize', payload: { value: 100, segmentIndex: 2, chunkSize: '100', via: '0' } },
    ]);
    expect(rounds.length).toBe(3);
    const first = rounds[0]!;
    const back = rounds[2]!;
    expect(back.metrics.get('renders')).toBe(first.metrics.get('renders'));
    expect(back.metrics.get('longest-wait')).toBe(first.metrics.get('longest-wait'));
  });
});
