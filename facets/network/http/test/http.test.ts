// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetContext, type ReactiveContext } from '@ffacet/core/runtime';
import {
  httpAlgorithm,
  httpFacet,
  httpImperativeIR,
  httpStageView,
  simulateHttp,
  type HttpData,
} from '../src/index.js';

const data = httpFacet.initialData as HttpData;

/** 사양 실측표 — 대조용 */
const TABLE: Record<number, { requests: number; empty: number; delay: number; overhead: number; wire: number }> = {
  0: { requests: 30, empty: 23, delay: 0, overhead: 3202, wire: 3384 },
  1: { requests: 15, empty: 9, delay: 5, overhead: 1717, wire: 1899 },
  2: { requests: 6, empty: 2, delay: 15, overhead: 763, wire: 945 },
  3: { requests: 3, empty: 0, delay: 25, overhead: 430, wire: 612 },
  4: { requests: 1, empty: 0, delay: 0, overhead: 300, wire: 482 },
};

/** 사양의 걸음마다 켜지는 phase (없으면 null) */
const PHASES: Record<number, (string | null)[]> = {
  0: ['poll-empty', 'poll-empty', 'poll-empty', 'poll-empty', 'poll-empty', 'poll-empty'],
  1: ['poll-deliver', 'poll-deliver', 'poll-empty', 'poll-deliver', 'poll-empty', 'poll-empty'],
  2: ['poll-deliver', 'poll-deliver', 'poll-empty', 'poll-deliver', 'poll-empty', 'poll-deliver'],
  3: ['msg-queue', 'poll-deliver', null, 'poll-deliver', null, 'poll-deliver'],
  4: ['ws-push', 'ws-push', null, 'ws-push', null, 'ws-push'],
};

function slider() {
  const controls = (httpFacet.blocks['controls'] as { controls: { action: string; segments?: { value: number }[] }[] }).controls;
  const knob = controls.find((c) => c.action === 'receive');
  if (knob?.segments === undefined) throw new Error('손잡이가 없다');
  return knob.segments.map((s) => s.value);
}

describe('http — 사다리와 데이터', () => {
  it('사다리가 segments 와 같고 끝값은 웹소켓이다', () => {
    expect(slider()).toEqual(data.receiveModes.map((_, i) => i));
    expect(data.receiveModes).toHaveLength(5);
    expect(data.receiveModes[4]).toEqual({ mode: 'websocket' });
    expect(data.births).toHaveLength(7);
  });

  it('글자에서 센 바이트가 조각 · 사양의 값과 같다', () => {
    const run = simulateHttp(data, 4);
    expect(run.upgrade).toEqual({ requestBytes: 157, responseBytes: 129 });
    expect(run.sizes).toMatchObject({ request: 69, empty: 27, headBase: 69, payload: 26, frameHead: 2 });
  });
});

describe('http — 실측표와 IR', () => {
  for (const receive of [0, 1, 2, 3, 4]) {
    it(`값 ${receive}: 알고리즘 = 실측표 = IR`, () => {
      const run = simulateHttp(data, receive);
      const want = TABLE[receive];
      expect(run.totals).toEqual({
        requests: want?.requests,
        emptyResponses: want?.empty,
        delaySeconds: want?.delay,
        overheadBytes: want?.overhead,
        wireBytes: want?.wire,
      });
      expect(run.windows.map((w) => w.lastPhase)).toEqual(PHASES[receive]);

      const tally = [0, 0, 0];
      const mode = data.receiveModes[receive];
      let overhead: unknown;
      if (mode?.mode === 'poll') {
        overhead = runIR(httpImperativeIR, 'pollExchange', [
          [...data.births], mode.periodSec, data.horizonSec,
          run.sizes.request, run.sizes.empty, run.sizes.headBase, run.sizes.payload, tally,
        ]);
      } else {
        overhead = runIR(httpImperativeIR, 'socketExchange', [
          [...data.births], data.horizonSec, run.sizes.handshake, run.sizes.frameHead, tally,
        ]);
      }
      expect(overhead).toBe(run.totals.overheadBytes);
      expect(tally).toEqual([run.totals.requests, run.totals.emptyResponses, run.totals.delaySeconds]);
    });
  }

  it('사다리 밖 값은 던진다', () => {
    expect(() => simulateHttp(data, 5)).toThrow();
    expect(() => simulateHttp(data, -1)).toThrow();
  });

  it('30 초 끝에 넘기지 못한 메시지가 있으면 던진다', () => {
    expect(() => simulateHttp({ ...data, births: [29], receiveModes: [{ mode: 'poll', periodSec: 7 }] }, 0)).toThrow();
  });
});

describe('http — 회차별 계기 (2 → 4 → 2)', () => {
  it('판마다 실측표 값으로 끝난다', async () => {
    const totals: Record<string, number> = {};
    const snapshots: Record<string, number>[] = [];
    const inputs = [4, 2];
    let waits = 0;
    const state = { cancelled: false };
    const ctx = {
      data,
      get cancelled() {
        return state.cancelled;
      },
      async emit() {},
      metric(name: string, delta: number | 'inc') {
        totals[name] = (totals[name] ?? 0) + (delta === 'inc' ? 1 : delta);
      },
      async sleep() {
        return !state.cancelled;
      },
      async waitForInput() {
        snapshots.push({ ...totals });
        const next = inputs[waits];
        waits += 1;
        if (next === undefined) {
          state.cancelled = true;
          return { type: 'none' };
        }
        return { type: 'receive', payload: { value: next, segmentIndex: next, receive: String(next) } };
      },
      pollInput() {
        return null;
      },
    } as unknown as ReactiveContext<HttpData>;
    await httpAlgorithm(ctx as unknown as FacetContext<HttpData>);
    snapshots.push({ ...totals });
    const pick = (s: Record<string, number> | undefined) => [s?.['http-requests'], s?.['empty-responses'], s?.['delay-seconds'], s?.['overhead-bytes']];
    expect(pick(snapshots[0])).toEqual([6, 2, 15, 763]);
    expect(pick(snapshots[1])).toEqual([1, 0, 0, 300]);
    expect(pick(snapshots[2])).toEqual([6, 2, 15, 763]);
  });
});

describe('http — stage', () => {
  it('initialData 없이도 마운트된다', () => {
    const container = document.createElement('div');
    const inst = mountView(httpStageView, container, { config: {} });
    expect(container.querySelector('svg')).not.toBeNull();
    inst.destroy();
  });
});
