// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  backpressureAlgorithm,
  backpressureFacet,
  backpressureImperativeIR,
  backpressureProjector,
  backpressureStageView,
  ladderPeaks,
  readBackpressureData,
  simulateBackpressure,
  type BackpressureData,
  type BackpressureStage,
} from '../src/index.js';

const data: BackpressureData = readBackpressureData(backpressureFacet.initialData);

// 사양 실측표 (20 틱) — 대조용
const TABLE: Record<number, { onTime: number[]; pct: number[]; late: number[]; rejected: number[]; dropped: number[]; peakHeld: number[]; peakQueue: number[] }> = {
  0: { onTime: [19, 38, 6, 4], pct: [95, 95, 10, 5], late: [0, 0, 18, 28], rejected: [0, 0, 0, 0], dropped: [0, 0, 0, 0], peakHeld: [1, 2, 36, 48], peakQueue: [0, 0, 0, 0] },
  1: { onTime: [19, 38, 36, 36], pct: [95, 95, 60, 45], late: [0, 0, 0, 0], rejected: [0, 0, 20, 40], dropped: [0, 0, 0, 0], peakHeld: [1, 2, 4, 4], peakQueue: [0, 0, 0, 0] },
  2: { onTime: [19, 38, 36, 36], pct: [95, 95, 60, 45], late: [0, 0, 0, 0], rejected: [0, 0, 0, 0], dropped: [0, 0, 12, 28], peakHeld: [1, 2, 4, 4], peakQueue: [0, 0, 8, 12] },
};

type Seg = { value: number; default?: boolean };
function knob(action: string): Seg[] {
  const controls = (backpressureFacet.blocks.controls as { controls: { action: string; segments?: Seg[] }[] }).controls;
  const c = controls.find((x) => x.action === action);
  if (c === undefined || c.segments === undefined) throw new Error(`손잡이 ${action} 가 없다`);
  return c.segments;
}

describe('backpressure — 사다리와 선언', () => {
  it('사다리가 segments 값과 같고 기본값도 같다', () => {
    expect(knob('overflow').map((s) => s.value)).toEqual(data.overflows);
    expect(knob('rate').map((s) => s.value)).toEqual(data.rates);
    expect(knob('overflow').find((s) => s.default)?.value).toBe(data.overflowDefault);
    expect(knob('rate').find((s) => s.default)?.value).toBe(data.rateDefault);
    expect(data.overflows.length).toBe(3);
    expect(data.rates[data.rates.length - 1]).toBe(4);
  });

  it('사다리 전체의 가장 큰 든 수 48 · 가장 긴 보내는 쪽 줄 12', () => {
    expect(ladderPeaks(data)).toEqual({ peakHeld: 48, peakQueue: 12 });
  });
});

describe('backpressure — 사양 실측표', () => {
  for (const mode of [0, 1, 2]) {
    data.rates.forEach((rate, i) => {
      it(`방식 ${mode} · 보냄 ${rate}`, () => {
        const run = simulateBackpressure(data, mode, rate);
        const row = TABLE[mode];
        if (row === undefined) throw new Error('표 줄이 없다');
        expect(run.made).toBe(rate * data.ticks);
        expect(run.onTime).toBe(row.onTime[i]);
        expect(Math.floor((run.onTime * 100 + Math.floor(run.made / 2)) / run.made)).toBe(row.pct[i]);
        expect(run.late).toBe(row.late[i]);
        expect(run.rejected).toBe(row.rejected[i]);
        expect(run.dropped).toBe(row.dropped[i]);
        expect(run.peakHeld).toBe(row.peakHeld[i]);
        expect(run.peakQueue).toBe(row.peakQueue[i]);
        expect(run.steps.length).toBe(2 * data.ticks);
      });
    });
  }

  it('기본값(다 받음 · 3) 대조점 — 몫 8 → 4 → 2 → 1 → 0, 나머지는 먼저 든 것에', () => {
    const run = simulateBackpressure(data, 0, 3);
    const work = run.steps.filter((s) => s.kind === 'work');
    const at = (tick: number) => {
      const w = work[tick];
      if (w === undefined || w.kind !== 'work') throw new Error('일 걸음이 없다');
      return w;
    };
    expect([at(1).heldBefore, at(1).share, at(1).extra]).toEqual([3, 8, 0]);
    expect([at(2).heldBefore, at(2).share, at(2).finished.length]).toEqual([6, 4, 3]);
    expect([at(4).heldBefore, at(4).share, at(4).extra]).toEqual([9, 2, 6]);
    expect([at(6).heldBefore, at(6).share]).toEqual([12, 2]);
    expect([at(7).heldBefore, at(7).share, at(7).extra, at(7).late]).toEqual([15, 1, 9, 3]);
    expect([at(15).heldBefore, at(15).share, at(15).extra]).toEqual([27, 0, 24]);
    expect([run.onTime, run.late, run.endHeld]).toEqual([6, 18, 36]);
  });

  it('배압 · 3 — 보내는 쪽 줄 2 · 2 · 4 · 4 · 6 · 6 · 8, 틱 8 에 처음 버림 2', () => {
    const run = simulateBackpressure(data, 2, 3);
    const arrive = run.steps.filter((s) => s.kind === 'arrive');
    expect(arrive.slice(1, 8).map((s) => (s.kind === 'arrive' ? s.queue.length : -1))).toEqual([2, 2, 4, 4, 6, 6, 8]);
    expect(arrive.slice(1, 8).every((s) => s.phase === 'hold-back')).toBe(true);
    const t8 = arrive[8];
    if (t8 === undefined || t8.kind !== 'arrive') throw new Error('틱 8 이 없다');
    expect([t8.phase, t8.dropped.length, t8.queue.length]).toEqual(['drop-stale', 2, 6]);
    expect([run.onTime, run.dropped]).toEqual([36, 12]);
  });

  it('모르는 방식은 던진다', () => {
    expect(() => simulateBackpressure(data, 3, 3)).toThrow();
  });
});

describe('backpressure — IR ↔ algorithm', () => {
  it('12 조합 모두 돌려준 값 · tally 넷이 같다', () => {
    for (const mode of data.overflows) {
      for (const rate of data.rates) {
        const m = rate * data.ticks + 1;
        const born = new Array<number>(m).fill(0);
        const done = new Array<number>(m).fill(0);
        const waiting = new Array<number>(m).fill(0);
        const tally = [0, 0, 0, 0];
        const got = runIR(backpressureImperativeIR, 'overload', [
          mode, rate, data.ticks, data.capacity, data.workUnits, data.deadline, data.limit, born, done, waiting, tally,
        ]);
        const run = simulateBackpressure(data, mode, rate);
        expect(got).toBe(run.onTime);
        expect(tally).toEqual([run.onTime, run.late, run.rejected, run.dropped]);
      }
    }
  });

  it('모르는 방식 — TS 는 던지고 IR 은 −1', () => {
    const got = runIR(backpressureImperativeIR, 'overload', [3, 3, data.ticks, data.capacity, data.workUnits, data.deadline, data.limit, [0], [0], [0], [0, 0, 0, 0]]);
    expect(got).toBe(-1);
    expect(() => simulateBackpressure(data, 3, 3)).toThrow();
  });
});

type Recorded = { events: FacetRuntimeEvent[]; metrics: Map<string, number>; perRun: number[][] };

async function drive(inputs: { type: string; value: number }[]): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const perRun: number[][] = [];
  let cancelled = false;
  const queue = [...inputs];
  const snapshot = () => ['on-time', 'late-done', 'rejected', 'sender-dropped'].map((k) => metrics.get(k) ?? -1);
  const ctx = {
    data: structuredClone(backpressureFacet.initialData) as unknown as BackpressureData,
    get cancelled() { return cancelled; },
    async emit(e: FacetRuntimeEvent) { events.push(e); },
    metric(name: string, delta: number | 'inc') {
      if (delta === 'inc') throw new Error('inc 를 쓰지 않는다');
      metrics.set(name, (metrics.get(name) ?? 0) + delta);
    },
    async sleep() { return !cancelled; },
    pollInput() { return null; },
    async waitForInput() {
      perRun.push(snapshot());
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: next.type, payload: { value: next.value } };
    },
  };
  await backpressureAlgorithm(ctx as never);
  return { events, metrics, perRun };
}

describe('backpressure — 알고리즘 재생', () => {
  it('회차별 계기: 다 받음 · 3 → 버림 · 3 → 다 받음 · 3', async () => {
    const r = await drive([{ type: 'overflow', value: 1 }, { type: 'overflow', value: 0 }]);
    expect(r.perRun).toEqual([[6, 18, 0, 0], [36, 0, 20, 0], [6, 18, 0, 0]]);
  });

  it('silent init 뒤 첫 걸음 전에 걸음 경계(sleep)가 있다', async () => {
    const order: string[] = [];
    let cancelled = false;
    const ctx = {
      data: structuredClone(backpressureFacet.initialData) as unknown as BackpressureData,
      get cancelled() { return cancelled; },
      async emit(e: FacetRuntimeEvent) { order.push(e.type); },
      metric() {},
      async sleep() { order.push('sleep'); return !cancelled; },
      pollInput() { return null; },
      async waitForInput() { cancelled = true; throw new Error('cancelled'); },
    };
    await backpressureAlgorithm(ctx as never);
    expect(order.slice(0, 3)).toEqual(['init', 'sleep', 'work']);
    expect(order.filter((x) => x === 'sleep').length).toBe(2 * data.ticks + 1);
  });

  it('사다리에 없는 값 · 남의 입력은 흘린다', async () => {
    const r = await drive([{ type: 'rate', value: 7 }, { type: 'other', value: 1 }, { type: 'rate', value: 4 }]);
    // 흘린 입력마다 다시 기다린다 — 그동안 계기는 그대로다
    expect(r.perRun).toEqual([[6, 18, 0, 0], [6, 18, 0, 0], [6, 18, 0, 0], [4, 28, 0, 0]]);
  });

  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase 이고, 걸음은 silent 가 아니다', async () => {
    const r = await drive([{ type: 'overflow', value: 1 }, { type: 'overflow', value: 2 }]);
    const lit = new Set<string>();
    let steps = 0;
    let emptyWork = 0;
    r.events.forEach((e, i) => {
      if (e.type !== 'work' && e.type !== 'arrive') return;
      steps += 1;
      expect(e.silent).not.toBe(true);
      const prev = r.events[i - 1];
      // 든 수 0 인 일 걸음은 IR 의 if (held > 0) 에 닿지 않는다 — phase 없이 init 바로 뒤에 온다
      if (e.type === 'work' && (e.payload as { heldBefore: number }).heldBefore === 0) {
        emptyWork += 1;
        expect(prev?.type).toBe('init');
        return;
      }
      expect(prev?.type).toBe('phase');
      const ph = (prev?.payload as { phase: string }).phase;
      lit.add(ph);
      if (e.type === 'work') expect(ph).toBe('share-work');
      else expect(['accept', 'reject', 'hold-back', 'drop-stale']).toContain(ph);
    });
    expect(steps).toBe(3 * 2 * data.ticks);
    expect(emptyWork).toBe(3);
    expect([...lit].sort()).toEqual(['accept', 'drop-stale', 'hold-back', 'reject', 'share-work']);
    const inits = r.events.filter((e) => e.type === 'init');
    expect(inits.length).toBe(3);
    expect(inits.every((e) => e.silent === true)).toBe(true);
  });
});

describe('backpressure — 무대', () => {
  const mount = () => {
    const container = document.createElement('div');
    const stage = mountView(backpressureStageView, container, { config: {} }) as BackpressureStage;
    const proj = backpressureProjector({ stage }, undefined);
    return { container, stage, proj };
  };

  it('initialData 없이 마운트해도 던지지 않는다', () => {
    expect(() => mount()).not.toThrow();
  });

  it('첫 그림을 두 번 먹여도 요소 수가 같다 · 되짚기 뒤 다시 먹여도 같다', async () => {
    const r = await drive([]);
    const { container, proj } = mount();
    const init = r.events.find((e) => e.type === 'init');
    if (init === undefined) throw new Error('init 이 없다');
    proj.onEvent(init);
    const once = container.querySelectorAll('*').length;
    proj.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    for (const e of r.events) proj.onEvent(e);
    proj.onReset?.();
    proj.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
  });

  it('한 판을 끝까지 먹이면 막대 수가 끝에 든 수와 같다 (다 받음 · 3 → 36)', async () => {
    const r = await drive([]);
    const { container, proj } = mount();
    for (const e of r.events) proj.onEvent(e);
    await new Promise((res) => setTimeout(res, 400));
    // 막대 하나 = 틀 rect + 채움 rect 를 담은 g
    const barGroups = [...container.querySelectorAll('g g')].filter((g) => g.querySelectorAll('rect').length === 2);
    expect(barGroups.length).toBe(36);
    expect(container.textContent).toContain('on time 10% of 60 made');
  });

  it('앞 판과 다른 걸음이 오면 던진다 (지어내지 않는다)', async () => {
    const r = await drive([]);
    const { proj } = mount();
    const init = r.events.find((e) => e.type === 'init');
    if (init === undefined) throw new Error('init 이 없다');
    proj.onEvent(init);
    const work = r.events.filter((e) => e.type === 'work')[3];
    if (work === undefined) throw new Error('work 가 없다');
    expect(() => proj.onEvent(work)).toThrow();
    expect(() => proj.onEvent({ type: 'mystery', payload: {} } as FacetRuntimeEvent)).toThrow();
  });
});
