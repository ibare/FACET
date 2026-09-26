// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  backTick,
  circuitBreakerAlgorithm,
  circuitBreakerFacet,
  circuitBreakerImperativeIR,
  circuitBreakerStageView,
  healthColumn,
  readCircuitBreakerData,
  simulateBreaker,
  type CircuitBreakerStage,
  type StageInit,
} from '../src/index.js';

const data = readCircuitBreakerData(circuitBreakerFacet.initialData);
const health = healthColumn(data);
const back = backTick(data);
const CODE = { up: 0, blip: 1, down: 2 } as const;
const codes = (h: readonly string[]): number[] =>
  h.map((x) => {
    if (x !== 'up' && x !== 'blip' && x !== 'down') throw new Error(`모르는 건강 ${x}`);
    return CODE[x];
  });
const names = ['up', 'blip', 'down'] as const;

// 사양 실측표 (measure.py) — 행 문턱 1 · 2 · 3 · 5 · 8, 열 기다림 2 · 4 · 6 · 8
const TABLE = {
  deadHits: [[5, 3, 2, 1], [6, 3, 2, 1], [6, 4, 4, 3], [7, 6, 5, 5], [9, 8, 8, 8]],
  blipTrips: [[1, 1, 1, 1], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  closeLag: [[0, 2, 3, 1], [1, 2, 4, 2], [0, 0, 4, 0], [0, 2, 0, 2], [1, 1, 3, 5]],
  reached: [[18, 12, 9, 10], [18, 12, 9, 10], [20, 18, 14, 17], [21, 18, 19, 17], [22, 21, 19, 17]],
  blocked: [[6, 12, 15, 14], [6, 12, 15, 14], [4, 6, 10, 7], [3, 6, 5, 7], [2, 3, 5, 7]],
};

function knob(action: string): number[] {
  const controls = (circuitBreakerFacet.blocks.controls as { controls: unknown[] }).controls;
  const k = controls.find((c) => (c as { action?: string }).action === action) as { segments: { value: number; default?: boolean }[] } | undefined;
  if (!k) throw new Error(`손잡이 ${action} 없음`);
  return k.segments.map((s) => s.value);
}
function knobDefault(action: string): number {
  const controls = (circuitBreakerFacet.blocks.controls as { controls: unknown[] }).controls;
  const k = controls.find((c) => (c as { action?: string }).action === action) as { segments: { value: number; default?: boolean }[] };
  const d = k.segments.find((s) => s.default === true);
  if (!d) throw new Error(`손잡이 ${action} 기본값 없음`);
  return d.value;
}

type Round = { events: FacetRuntimeEvent[]; metrics: Map<string, number> };

/** 알고리즘을 입력 차례대로 돌려 판마다 계기 합과 발신을 모은다. */
async function drive(inputs: { type: string; value: number }[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const totals = new Map<string, number>();
  let current: Round = { events: [], metrics: totals };
  const queue = [...inputs];
  let cancelled = false;
  let done!: () => void;
  const idle = new Promise<void>((r) => (done = r));
  const ctx = {
    data: structuredClone(circuitBreakerFacet.initialData),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit(e: FacetRuntimeEvent) {
      current.events.push(e);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      rounds.push({ events: current.events, metrics: new Map(totals) });
      const next = queue.shift();
      if (!next) {
        done();
        return new Promise<never>(() => {});
      }
      current = { events: [], metrics: totals };
      return { type: next.type, payload: { value: next.value, segmentIndex: 0 } };
    },
    pollInput() {
      return null;
    },
  };
  await Promise.race([circuitBreakerAlgorithm(ctx as never), idle]);
  cancelled = true;
  return rounds;
}

const quad = (r: Round): number[] => ['dead-hits', 'blocked-calls', 'blip-trips', 'close-lag'].map((m) => {
  const v = r.metrics.get(m);
  if (v === undefined) throw new Error(`계기 ${m} 가 안 왔다`);
  return v;
});

describe('circuit-breaker', () => {
  it('사다리 · 기본값이 손잡이 segments 와 같고 데이터 크기를 잠근다', () => {
    expect(knob('threshold')).toEqual(data.thresholds);
    expect(knob('wait')).toEqual(data.waits);
    expect(knobDefault('threshold')).toBe(data.defaults.threshold);
    expect(knobDefault('wait')).toBe(data.defaults.wait);
    expect(health.length).toBe(24);
    expect(back).toBe(16);
    expect(data.thresholds.at(-1)).toBe(8);
    expect(data.waits.at(-1)).toBe(8);
  });

  it('20 조합 — 셈이 사양 실측표와 같고 IR 과 같다 · 닫힘까지 ≤ 기다림 − 1', () => {
    data.thresholds.forEach((th, i) => {
      data.waits.forEach((w, j) => {
        const run = simulateBreaker(health, back, th, w);
        const got = [run.deadHits, run.blipTrips, run.closeLag, run.reached, run.blocked];
        const want = [TABLE.deadHits, TABLE.blipTrips, TABLE.closeLag, TABLE.reached, TABLE.blocked].map((t) => t[i]![j]!);
        expect(got, `문턱 ${th} · 기다림 ${w}`).toEqual(want);
        expect(run.closeLag).toBeGreaterThanOrEqual(0);
        expect(run.closeLag).toBeLessThanOrEqual(w - 1);
        expect(run.steps.length).toBe(24);
        const tally = [0, 0, 0, 0, 0];
        const ans = runIR(circuitBreakerImperativeIR, 'runBreaker', [th, w, back, codes(health), tally]);
        expect(ans).toBe(run.deadHits);
        expect(tally).toEqual(got);
      });
    });
  });

  it('다른 health 열 셋 — IR 과 algorithm 이 같고, 닫히지 않으면 TS 는 던지고 IR 은 −1', () => {
    const alts = [
      [0, 1, 0, 2, 2, 2, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0],
      [2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 1, 1, 1, 0, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ];
    let threw = 0;
    for (const alt of alts) {
      const b = alt.lastIndexOf(2) + 1;
      const h = alt.map((x) => names[x]!);
      for (const th of data.thresholds) {
        for (const w of data.waits) {
          const tally = [0, 0, 0, 0, 0];
          const ans = runIR(circuitBreakerImperativeIR, 'runBreaker', [th, w, b, alt, tally]);
          let run;
          try {
            run = simulateBreaker(h, b, th, w);
          } catch {
            threw += 1;
            expect(ans, `${alt.join('')} 문턱 ${th} 기다림 ${w}`).toBe(-1);
            continue;
          }
          expect(ans).toBe(run.deadHits);
          expect(tally).toEqual([run.deadHits, run.blipTrips, run.closeLag, run.reached, run.blocked]);
        }
      }
    }
    expect(threw).toBeGreaterThan(0);
  });

  it('모르는 건강 — TS 는 던지고 IR 은 −1', () => {
    expect(() => simulateBreaker(['up', 'sick', 'up'], 1, 3, 4)).toThrow();
    expect(runIR(circuitBreakerImperativeIR, 'runBreaker', [3, 4, back, [0, 3, 0], [0, 0, 0, 0, 0]])).toBe(-1);
  });

  it('회차별 계기 — 3·4 → 3·6 → 3·4, 그리고 8·8', async () => {
    const rounds = await drive([
      { type: 'wait', value: 6 },
      { type: 'wait', value: 4 },
      { type: 'threshold', value: 8 },
      { type: 'wait', value: 8 },
    ]);
    expect(rounds.length).toBe(5);
    expect(quad(rounds[0]!)).toEqual([4, 6, 0, 0]);
    expect(quad(rounds[1]!)).toEqual([4, 10, 0, 4]);
    expect(quad(rounds[2]!)).toEqual([4, 6, 0, 0]);
    expect(quad(rounds[4]!)).toEqual([8, 7, 0, 5]);
  });

  it('걸음 — 판마다 부름 24 (걸음 25), 부름마다 바로 앞이 그 걸음의 phase · 기본값 차례가 사양과 같다', async () => {
    const rounds = await drive([{ type: 'threshold', value: 1 }]);
    for (const r of rounds) {
      expect(r.events[0]!.type).toBe('breaker-init');
      expect(r.events[0]!.silent).toBe(true);
      const calls = r.events.map((e, i) => ({ e, i })).filter(({ e }) => e.type === 'call');
      expect(calls.length).toBe(24);
      for (const { e, i } of calls) {
        expect(e.silent).not.toBe(true);
        const prev = r.events[i - 1]!;
        expect(prev.type).toBe('phase');
        expect(prev.silent).toBe(true);
      }
    }
    const seq = rounds[0]!.events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase);
    expect(seq).toEqual([
      'reset', 'count', 'count', 'reset', 'reset', 'reset', 'count', 'count', 'trip', 'block', 'block', 'block',
      'probe-fail', 'block', 'block', 'block', 'probe-ok', 'reset', 'reset', 'reset', 'reset', 'reset', 'reset', 'reset',
    ]);
  });

  it('무대 — 첫 그림은 멱등, reset 은 자국을 비운다', () => {
    const container = document.createElement('div');
    const stage = mountView(circuitBreakerStageView, container, { config: {}, locale: 'ko', isInstant: () => true }) as CircuitBreakerStage;
    const init: StageInit = { service: data.service, ticks: 24, health, back, threshold: 3, wait: 4, maxWait: 8 };
    stage.init(init);
    const n1 = container.querySelectorAll('*').length;
    stage.init(init);
    expect(container.querySelectorAll('*').length).toBe(n1);
    const run = simulateBreaker(health, back, 3, 4);
    for (const s of run.steps) {
      stage.call({ ...s, back, recovered: s.tick >= back }, 300);
    }
    expect(container.querySelectorAll('*').length).toBeGreaterThan(n1);
    stage.reset();
    stage.init(init);
    expect(container.querySelectorAll('*').length).toBe(n1);
    expect(() => stage.call({ ...run.steps[0]!, tick: 99, back, recovered: false }, 300)).toThrow();
    stage.destroy();
  });
});
