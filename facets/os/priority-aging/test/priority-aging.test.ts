// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  priorityAgingAlgorithm,
  priorityAgingFacet,
  priorityAgingImperativeIR,
  priorityAgingStageView,
  roundSummary,
  simulate,
  stepMetrics,
  toSteps,
  type PriorityAgingData,
  type PriorityAgingStage,
} from '../src/index.js';

const data = priorityAgingFacet.initialData as unknown as PriorityAgingData;
const procs = data.procs;

/** 사양의 대조표 — 간격 → report 시작 · low-wait · report 끝 · overtaken · high-wait · 걸음 · 동률 고름 */
const TABLE: Record<number, { start: number; low: number; end: number; over: number; high: number; steps: number; ties: number }> = {
  0: { start: 14, low: 14, end: 18, over: 7, high: 0, steps: 9, ties: 0 },
  6: { start: 12, low: 12, end: 16, over: 6, high: 4, steps: 9, ties: 1 },
  4: { start: 8, low: 8, end: 12, over: 4, high: 12, steps: 10, ties: 1 },
  3: { start: 6, low: 6, end: 10, over: 3, high: 16, steps: 15, ties: 1 },
  2: { start: 4, low: 4, end: 8, over: 2, high: 20, steps: 10, ties: 1 },
  1: { start: 2, low: 2, end: 6, over: 1, high: 24, steps: 18, ties: 1 },
};

describe('priority-aging — 사다리', () => {
  it('사다리가 손잡이 구간과 같다', () => {
    expect(data.intervalLadder).toEqual([0, 6, 4, 3, 2, 1]);
    const controls = (priorityAgingFacet.blocks.controls as { controls: { action: string; segments?: { value: number }[] }[] }).controls;
    const knob = controls.find((c) => c.action === 'interval');
    expect(knob?.segments?.map((s) => s.value)).toEqual(data.intervalLadder);
    expect(procs.length).toBe(8);
  });
});

describe('priority-aging — 사양 표와 대조', () => {
  for (const iv of data.intervalLadder) {
    it(`간격 ${iv}`, () => {
      const run = simulate(procs, iv);
      const s = roundSummary(procs, run);
      const row = TABLE[iv]!;
      expect(s.reportStart).toBe(row.start);
      expect(s.reportWait).toBe(row.low);
      expect(run.finish[0]).toBe(row.end);
      expect(s.overtaken).toBe(row.over);
      expect(s.highWait).toBe(row.high);
      expect(toSteps(run).length).toBe(row.steps);
      expect(run.boundaries.filter((b) => b.tie.length > 0).length).toBe(row.ties);
    });
  }

  it('간격 3 의 걸음표 — phase 와 걸음마다의 계기', () => {
    const run = simulate(procs, 3);
    const steps = toSteps(run);
    expect(steps.map((s) => s.phase)).toEqual([
      'dispatch', 'dispatch', 'age', 'dispatch', 'dispatch', 'arrive', 'age', 'dispatch',
      'age', 'dispatch', 'age', 'dispatch', 'age', 'dispatch', 'finish',
    ]);
    const m = steps.map((s) => {
      const x = stepMetrics(procs, run, s);
      return [x.lowWait, x.highWait, x.overtaken];
    });
    expect(m).toEqual([
      [2, 0, 1], [3, 0, 2], [4, 0, 2], [6, 0, 3], [6, 2, 3], [6, 4, 3], [6, 6, 3], [6, 8, 3],
      [6, 10, 3], [6, 12, 3], [6, 14, 3], [6, 15, 3], [6, 16, 3], [6, 16, 3], [6, 16, 3],
    ]);
  });

  it('기본 판(없음)의 걸음마다 계기', () => {
    const run = simulate(procs, 0);
    const m = toSteps(run).map((s) => {
      const x = stepMetrics(procs, run, s);
      return [x.lowWait, x.highWait, x.overtaken];
    });
    expect(m).toEqual([
      [2, 0, 1], [4, 0, 2], [6, 0, 3], [8, 0, 4], [10, 0, 5], [12, 0, 6], [14, 0, 7], [14, 0, 7], [14, 0, 7],
    ]);
  });
});

describe('priority-aging — IR 과 algorithm 이 같은 답을 낸다', () => {
  for (const iv of data.intervalLadder) {
    it(`간격 ${iv}`, () => {
      const n = procs.length;
      const start = new Array<number>(n).fill(-1);
      const finish = new Array<number>(n).fill(-1);
      const ans = runIR(priorityAgingImperativeIR, 'agingSchedule', [
        iv,
        procs.map((p) => p.arrive),
        procs.map((p) => p.burst),
        procs.map((p) => p.prio),
        procs.map((p) => p.burst),
        new Array<number>(n).fill(0),
        new Array<number>(n).fill(0),
        new Array<number>(n).fill(0),
        start,
        finish,
        n,
      ]);
      const run = simulate(procs, iv);
      expect(ans).toBe(roundSummary(procs, run).reportWait);
      expect(ans).toBe(TABLE[iv]!.low);
      expect(start).toEqual(run.start);
      expect(finish).toEqual(run.finish);
    });
  }
});

/** 알고리즘을 입력 차례대로 돌려 판마다 계기의 합을 모은다. */
async function drive(inputs: number[]): Promise<{ metrics: Record<string, number>[]; events: FacetRuntimeEvent[] }> {
  const totals: Record<string, number> = {};
  const rounds: Record<string, number>[] = [];
  const events: FacetRuntimeEvent[] = [];
  const queue = [...inputs];
  let cancelled = false;
  let idle!: () => void;
  const stopped = new Promise<void>((r) => (idle = r));
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals[name] = (totals[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      rounds.push({ ...totals });
      const v = queue.shift();
      if (v === undefined) {
        idle();
        return new Promise<never>(() => {});
      }
      return { type: 'interval', payload: { value: v, segmentIndex: data.intervalLadder.indexOf(v), interval: String(v) } };
    },
    pollInput() {
      return null;
    },
  };
  await Promise.race([priorityAgingAlgorithm(ctx as never), stopped]);
  cancelled = true;
  return { metrics: rounds, events };
}

describe('priority-aging — 회차별 계기', () => {
  it('없음 → 3 → 없음', async () => {
    const { metrics } = await drive([3, 0]);
    expect(metrics).toEqual([
      { 'low-wait': 14, 'high-wait': 0, overtaken: 7 },
      { 'low-wait': 6, 'high-wait': 16, overtaken: 3 },
      { 'low-wait': 14, 'high-wait': 0, overtaken: 7 },
    ]);
  });

  it('여섯 값 모두 판 끝 계기가 사양과 같다', async () => {
    const { metrics } = await drive([6, 4, 3, 2, 1]);
    const want = [0, 6, 4, 3, 2, 1].map((iv) => ({
      'low-wait': TABLE[iv]!.low,
      'high-wait': TABLE[iv]!.high,
      overtaken: TABLE[iv]!.over,
    }));
    expect(metrics).toEqual(want);
  });

  it('사다리 밖의 값은 던진다', async () => {
    await expect(drive([5])).rejects.toThrow(/사다리/);
  });
});

describe('priority-aging — stage', () => {
  it('config 만으로 마운트해도 던지지 않는다', () => {
    const host = document.createElement('div');
    const inst = mountView(priorityAgingStageView, host, { config: {} });
    inst.destroy();
  });

  it('판 끝 캡션의 수가 셈한 값과 같다', async () => {
    const { events } = await drive([]);
    const host = document.createElement('div');
    const stage = mountView(priorityAgingStageView, host, { config: {}, initialData: data, locale: 'en' }) as unknown as PriorityAgingStage;
    const { priorityAgingProjector } = await import('../src/projector.js');
    const proj = priorityAgingProjector({ stage }, { getSpeed: () => 1, t: (_k, f, v) => f.replace(/\{(\w+)\}/g, (_m, k: string) => String(v?.[k] ?? '')) });
    for (const e of events) await proj.onEvent(e);
    const text = host.textContent ?? '';
    expect(text).toContain('Report start: tick 14 · Report wait: 14 · J wait total: 0');
    stage.destroy();
  });
});
