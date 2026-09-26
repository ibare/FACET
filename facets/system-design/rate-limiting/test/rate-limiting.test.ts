// @vitest-environment happy-dom
/**
 * 레이트 리미팅 — 사양 표 대조 · IR ↔ algorithm 전 조합 · 걸음과 phase 차례 · 회차별 계기 · 첫 그림 멱등.
 */

import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  expandArrivals,
  ladderBounds,
  limitRequests,
  rateLimitingAlgorithm,
  rateLimitingFacet,
  rateLimitingImperativeIR,
  rateLimitingStageView,
  readRateLimitingData,
  tally,
  type RateLimitingData,
  type RateLimitingStage,
} from '../src/index.js';

const data = readRateLimitingData(rateLimitingFacet.initialData);
const arriveTick = expandArrivals(data.arrivals);
const AXIS_END = 25;

type Row = [passed: number, rejected: number, peakTick: number, peakWindow: number, wait: number, last: number];
// 사양 실측표 (b = 2 · 3 · 4 · 6)
const TABLE: Record<number, Row[]> = {
  0: [
    [14, 9, 2, 4, 0, 23],
    [17, 6, 3, 6, 0, 23],
    [19, 4, 4, 8, 0, 23],
    [21, 2, 6, 12, 0, 23],
  ],
  1: [
    [12, 11, 2, 2, 0, 23],
    [14, 9, 3, 3, 0, 23],
    [15, 8, 4, 4, 0, 23],
    [16, 7, 6, 6, 0, 23],
  ],
  2: [
    [13, 10, 2, 3, 0, 23],
    [15, 8, 3, 4, 0, 23],
    [16, 7, 4, 5, 0, 23],
    [18, 5, 6, 8, 0, 23],
  ],
  3: [
    [13, 10, 1, 2, 3, 23],
    [15, 8, 1, 3, 8, 23],
    [16, 7, 1, 4, 12, 23],
    [18, 5, 1, 6, 39, 25],
  ],
};

describe('데이터와 사다리', () => {
  it('도착 23 · 사다리 끝값 · segments 와 같다', () => {
    expect(data.arrivals).toHaveLength(24);
    expect(arriveTick).toHaveLength(23);
    expect(data.methods).toEqual([0, 1, 2, 3]);
    expect(data.bursts).toEqual([2, 3, 4, 6]);
    const controls = (rateLimitingFacet.blocks.controls as { controls: unknown[] }).controls;
    const seg = (action: string): number[] => {
      const c = controls.find(
        (x): x is { action: string; segments: { value: number }[] } =>
          typeof x === 'object' && x !== null && (x as { action?: unknown }).action === action,
      );
      if (c === undefined) throw new Error(action);
      return c.segments.map((s) => s.value);
    };
    expect(seg('method')).toEqual(data.methods);
    expect(seg('burst')).toEqual(data.bursts);
  });

  it('축 끝은 사다리 전체에서 25', () => {
    expect(ladderBounds(data, arriveTick)).toEqual({ axisEnd: AXIS_END, maxStack: 6, maxBurst: 6 });
  });
});

describe('사양 실측표', () => {
  for (const m of data.methods) {
    data.bursts.forEach((b, bi) => {
      it(`방식 ${m} · b ${b}`, () => {
        const { passTick } = limitRequests(m, b, arriveTick, AXIS_END);
        const tl = tally(passTick, arriveTick, b, AXIS_END);
        const row = TABLE[m]?.[bi];
        if (row === undefined) throw new Error('표 없음');
        expect([tl.passed, tl.rejected, tl.peakTick, tl.peakWindow, tl.waitTotal, Math.max(...passTick)]).toEqual(row);
      });
    });
  }

  it('b 3 의 지나간 틱', () => {
    const x = -1;
    const tail = [16, 17, 18, 19, 20, 21, 22, 23];
    expect(limitRequests(0, 3, arriveTick, AXIS_END).passTick).toEqual([0, 0, 0, 11, 11, 11, x, x, x, 12, 12, 12, x, x, x, ...tail]);
    expect(limitRequests(1, 3, arriveTick, AXIS_END).passTick).toEqual([0, 0, 0, 11, 11, 11, x, x, x, x, x, x, x, x, x, ...tail]);
    expect(limitRequests(2, 3, arriveTick, AXIS_END).passTick).toEqual([0, 0, 0, 11, 11, 11, x, x, x, 12, x, x, x, x, x, ...tail]);
    expect(limitRequests(3, 3, arriveTick, AXIS_END).passTick).toEqual([0, 1, 2, 11, 12, 13, x, x, x, 14, x, x, x, x, x, ...tail]);
  });

  it('b 3 의 틱마다 토큰 · 통 안', () => {
    expect(limitRequests(2, 3, arriveTick, AXIS_END).ticks.map((r) => r.fill)).toEqual([
      0, 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 1, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3,
    ]);
    expect(limitRequests(3, 3, arriveTick, AXIS_END).ticks.map((r) => r.fill)).toEqual([
      2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });
});

describe('IR ↔ algorithm', () => {
  for (const m of data.methods) {
    for (const b of data.bursts) {
      it(`방식 ${m} · b ${b} — passTick 과 돌려준 수가 같다`, () => {
        const n = arriveTick.length;
        const passTick = new Array<number>(n).fill(0);
        const accepted = new Array<number>(n).fill(0);
        const bucket = new Array<number>(n).fill(0);
        const ret = runIR(rateLimitingImperativeIR, 'limitRequests', [m, b, [...arriveTick], AXIS_END, passTick, accepted, bucket]);
        const ts = limitRequests(m, b, arriveTick, AXIS_END);
        expect(passTick).toEqual(ts.passTick);
        expect(ret).toBe(ts.passTick.filter((p) => p >= 0).length);
      });
    }
  }

  it('모르는 방식 — TS 는 던지고 IR 은 −1', () => {
    const n = arriveTick.length;
    const buf = (): number[] => new Array<number>(n).fill(0);
    for (const m of [-1, 4]) {
      expect(() => limitRequests(m, 3, arriveTick, AXIS_END)).toThrow();
      expect(runIR(rateLimitingImperativeIR, 'limitRequests', [m, 3, [...arriveTick], AXIS_END, buf(), buf(), buf()])).toBe(-1);
    }
  });
});

type Input = { type: string; payload?: unknown };

async function drive(inputs: Input[]): Promise<{ events: FacetRuntimeEvent[]; runs: Record<string, number>[] }> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const runs: Record<string, number>[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data: rateLimitingFacet.initialData as RateLimitingData,
    get cancelled() {
      return cancelled;
    },
    emit: async (e: FacetRuntimeEvent): Promise<void> => {
      events.push(e);
    },
    metric: (name: string, delta: number | 'inc'): void => {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    sleep: async (): Promise<boolean> => true,
    pollInput: () => null,
    waitForInput: async (): Promise<Input> => {
      runs.push({ ...metrics });
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        return { type: 'none' };
      }
      return next;
    },
  };
  await rateLimitingAlgorithm(ctx as never);
  return { events, runs };
}

describe('한 판의 걸음', () => {
  it('걸음 26 · 걸음마다 바로 앞이 그 걸음의 phase · 기본값 phase 차례', async () => {
    const { events } = await drive([]);
    expect(events[0]?.type).toBe('init');
    expect(events[0]?.silent).toBe(true);
    const steps = events.filter((e) => !e.silent);
    expect(steps).toHaveLength(26);
    const phases: string[] = [];
    events.forEach((e, i) => {
      if (e.silent) return;
      expect(e.type).toBe('tick');
      const prev = events[i - 1];
      expect(prev?.type).toBe('phase');
      phases.push((prev?.payload as { phase: string }).phase);
    });
    const F = 'fixed-window';
    const N = 'next-tick';
    expect(phases).toEqual([F, N, N, N, N, N, N, N, N, N, N, 'reject', 'reject', N, N, N, F, F, F, F, F, F, F, F, N, N]);
  });

  it('회차별 계기 — 고정 창 b3 → 누출 b3 → 고정 창 b3', async () => {
    const { runs } = await drive([
      { type: 'method', payload: { value: 3, segmentIndex: 3 } },
      { type: 'method', payload: { value: 0, segmentIndex: 0 } },
    ]);
    const pick = (r: Record<string, number> | undefined): number[] => {
      if (r === undefined) throw new Error('회차 없음');
      return [r['passed'], r['rejected'], r['peak-tick'], r['peak-window'], r['wait-total']].map((v) => {
        if (v === undefined) throw new Error('계기 없음');
        return v;
      });
    };
    expect(pick(runs[0])).toEqual([17, 6, 3, 6, 0]);
    expect(pick(runs[1])).toEqual([15, 8, 1, 3, 8]);
    expect(pick(runs[2])).toEqual([17, 6, 3, 6, 0]);
  });

  it('사다리 밖 값은 던진다', async () => {
    await expect(drive([{ type: 'burst', payload: { value: 5 } }])).rejects.toThrow();
  });
});

describe('무대', () => {
  it('첫 그림을 두 번 먹여도 요소 수가 같고 reset 이 비운다', async () => {
    const { events } = await drive([]);
    const init = events[0]?.payload as Parameters<RateLimitingStage['init']>[0];
    const container = document.createElement('div');
    const stage = mountView(rateLimitingStageView, container, { config: {}, locale: 'ko' }) as RateLimitingStage;
    stage.init(init);
    const once = container.querySelectorAll('*').length;
    stage.init(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    stage.reset();
    expect(container.querySelectorAll('svg *').length).toBe(1);
    stage.destroy();
  });

  it('틱을 먹이면 지나간 점이 서버 축에 떨어진다 (즉시)', async () => {
    const { events } = await drive([]);
    const container = document.createElement('div');
    const stage = mountView(rateLimitingStageView, container, { config: {}, locale: 'ko' }) as RateLimitingStage;
    stage.init(events[0]?.payload as Parameters<RateLimitingStage['init']>[0]);
    const tick0 = events.find((e) => e.type === 'tick');
    stage.tick(tick0?.payload as Parameters<RateLimitingStage['tick']>[0], 0);
    expect(container.textContent).toContain('Tick 0: arrived 3 · passed 3 · rejected 0');
    stage.destroy();
  });
});
