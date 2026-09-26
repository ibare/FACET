// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import type { IRStmt } from '@ffacet/core';
import { runIR } from '@ffacet/ir-interpreter';
import {
  narrowRetryData,
  buildBirths,
  buildDraws,
  simulateRetries,
  scanAxis,
  retryAndBackoffAlgorithm,
  type RetryAndBackoffData,
} from '../src/algorithm.js';
import { retryAndBackoffImperativeIR } from '../src/irs.js';
import { retryAndBackoffFacet, retryAndBackoffInitialData } from '../src/facet.js';
import { retryAndBackoffStageView } from '../src/retry-and-backoff-stage.js';
import { retryAndBackoffProjector } from '../src/projector.js';

const data = narrowRetryData(retryAndBackoffInitialData);

/** 사양 실측표 (씨앗 42) — [곧바로, 지수, 흩음] 마다 몰림 · 뒤 실패 · 끝 · 찾아옴 */
const TABLE: Record<number, [number, number, number, number][]> = {
  1: [[16, 18, 11, 68], [16, 14, 15, 64], [12, 7, 11, 57]],
  2: [[18, 24, 11, 90], [16, 14, 15, 66], [13, 9, 11, 66]],
  3: [[20, 32, 11, 116], [16, 12, 31, 80], [9, 6, 11, 76]],
  4: [[22, 40, 11, 144], [16, 12, 31, 84], [10, 5, 12, 84]],
  5: [[24, 50, 11, 176], [18, 14, 31, 90], [11, 9, 13, 95]],
};

/** 걸음 수 (걸음 0 포함) — [곧바로, 지수, 흩음] */
const STEPS: Record<number, [number, number, number]> = {
  1: [13, 14, 13],
  2: [13, 14, 13],
  3: [13, 15, 13],
  4: [13, 15, 14],
  5: [13, 15, 15],
};

function irTally(d: RetryAndBackoffData, policy: number, outage: number): { answer: unknown; tally: number[] } {
  const births = buildBirths(d);
  const n = births.length;
  const tally = [0, 0, 0, 0];
  const answer = runIR(retryAndBackoffImperativeIR, 'simulateRetries', [
    policy,
    d.outageFrom,
    outage,
    d.cap,
    d.kMax,
    d.tickLimit,
    d.seed,
    births,
    new Array<number>(n * d.kMax).fill(0),
    new Array<number>(n).fill(0),
    new Array<number>(n).fill(0),
    new Array<number>(n).fill(0),
    tally,
  ]);
  return { answer, tally };
}

function tsTally(d: RetryAndBackoffData, policy: number, outage: number): number[] {
  const births = buildBirths(d);
  const run = simulateRetries(d, births, buildDraws(d.seed, births.length, d.kMax), policy, outage);
  return [run.tally.peakAfter, run.tally.failsAfter, run.tally.lastServed, run.tally.attempts];
}

function collectPhases(stmts: IRStmt[], out: Set<string>): Set<string> {
  for (const s of stmts) {
    if (s.kind === 'comment') continue;
    if (s.phase !== undefined) out.add(s.phase);
    if (s.kind === 'if') {
      collectPhases(s.then, out);
      if (s.else) collectPhases(s.else, out);
    } else if (s.kind === 'for-range' || s.kind === 'while') {
      collectPhases(s.body, out);
    }
  }
  return out;
}

type Knob = { type: 'policy' | 'outage'; value: number };

/** 가짜 reactive 문맥으로 알고리즘을 돌린다 — 판마다 판 끝의 계기와 발신을 모은다. */
async function runRounds(knobs: Knob[]): Promise<{
  rounds: { metrics: Record<string, number>; events: FacetRuntimeEvent[] }[];
  sent: Record<string, number[]>;
}> {
  const queue = knobs.slice();
  const metrics: Record<string, number> = {};
  const sent: Record<string, number[]> = {};
  let events: FacetRuntimeEvent[] = [];
  const rounds: { metrics: Record<string, number>; events: FacetRuntimeEvent[] }[] = [];
  let cancelled = false;
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      if (delta === 'inc') throw new Error('inc 를 쓰지 않는다');
      metrics[name] = (metrics[name] === undefined ? 0 : metrics[name]) + delta;
      (sent[name] ??= []).push(delta);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      rounds.push({ metrics: { ...metrics }, events });
      events = [];
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        return { type: 'noop' };
      }
      return { type: next.type, payload: { value: next.value } };
    },
    pollInput() {
      return null;
    },
  };
  await retryAndBackoffAlgorithm(ctx as unknown as FacetContext<RetryAndBackoffData>);
  return { rounds, sent };
}

describe('retry-and-backoff — 사양 대조', () => {
  it('사다리가 segments 의 value 와 같고 자료 길이가 사양대로다', () => {
    const controls = retryAndBackoffFacet.blocks.controls as { controls: unknown[] };
    const sliders = controls.controls.filter(
      (c): c is { action: string; segments: { value: number }[] } =>
        typeof c === 'object' && c !== null && (c as { widget?: unknown }).widget === 'segmented-slider',
    );
    const policy = sliders.find((s) => s.action === 'policy');
    const outage = sliders.find((s) => s.action === 'outage');
    expect(policy?.segments.map((s) => s.value)).toEqual(data.policyLadder);
    expect(outage?.segments.map((s) => s.value)).toEqual(data.outageLadder);
    expect(data.policyLadder).toEqual([0, 1, 2]);
    expect(data.outageLadder[data.outageLadder.length - 1]).toBe(5);
    const births = buildBirths(data);
    expect(births.length).toBe(36);
    expect(births.slice(0, 16)).toEqual([0, 0, ...new Array<number>(14).fill(1)]);
    expect(buildDraws(data.seed, births.length, data.kMax).length).toBe(180);
  });

  it('모든 방식 × 장애에서 판 끝 값이 실측표와 같다', () => {
    for (const outage of data.outageLadder) {
      for (const policy of data.policyLadder) {
        expect(tsTally(data, policy, outage), `방식 ${policy} · 장애 ${outage}`).toEqual(TABLE[outage][policy]);
      }
    }
  });

  it('걸음 수와 축 범위가 사양대로다', () => {
    const births = buildBirths(data);
    const draws = buildDraws(data.seed, births.length, data.kMax);
    for (const outage of data.outageLadder) {
      for (const policy of data.policyLadder) {
        const run = simulateRetries(data, births, draws, policy, outage);
        expect(run.steps.length + 1, `방식 ${policy} · 장애 ${outage}`).toBe(STEPS[outage][policy]);
      }
    }
    expect(scanAxis(data, births, draws)).toEqual({ lastTick: 31, maxStack: 24 });
    const now3 = simulateRetries(data, births, draws, 0, 3);
    expect(now3.steps.map((s) => s.arrivals)).toEqual([2, 14, 16, 18, 20, 16, 12, 8, 4, 2, 2, 2]);
    const jit3 = simulateRetries(data, births, draws, 2, 3);
    expect(jit3.steps.map((s) => s.arrivals)).toEqual([2, 14, 7, 13, 9, 6, 9, 5, 4, 3, 2, 2]);
    const exp3 = simulateRetries(data, births, draws, 1, 3);
    expect(exp3.steps.map((s) => s.tick)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 31]);
  });
});

describe('retry-and-backoff — IR 과 algorithm', () => {
  it('모든 조합에서 simulateRetries 의 tally 가 판 끝 계기와 같다', () => {
    for (const outage of data.outageLadder) {
      for (const policy of data.policyLadder) {
        const ts = tsTally(data, policy, outage);
        const ir = irTally(data, policy, outage);
        expect(ir.tally, `방식 ${policy} · 장애 ${outage}`).toEqual(ts);
        expect(ir.answer).toBe(ts[0]);
      }
    }
  });

  it('씨앗을 바꿔도(7 · 99) 같다', () => {
    for (const seed of [7, 99]) {
      const d = { ...data, seed };
      for (const outage of d.outageLadder) {
        for (const policy of d.policyLadder) {
          expect(irTally(d, policy, outage).tally, `씨앗 ${seed} · 방식 ${policy} · 장애 ${outage}`).toEqual(
            tsTally(d, policy, outage),
          );
        }
      }
    }
  });

  it('births 를 흔든 데이터(무리를 틱 2 로)에서도 같다', () => {
    const d = { ...data, burstTick: 2 };
    expect(buildBirths(d).slice(0, 6)).toEqual([0, 0, 1, 1, 2, 2]);
    for (const outage of d.outageLadder) {
      for (const policy of d.policyLadder) {
        expect(irTally(d, policy, outage).tally).toEqual(tsTally(d, policy, outage));
      }
    }
  });

  it('모르는 방식 — TS 는 던지고 IR 은 −1', () => {
    expect(() => tsTally(data, 3, 3)).toThrow(/모르는 방식/);
    expect(irTally(data, 3, 3).answer).toBe(-1);
  });

  it('IR 의 phase 집합이 algorithm 이 보내는 집합과 같다', () => {
    const ir = collectPhases(retryAndBackoffImperativeIR.functions[0].body, new Set());
    expect([...ir].sort()).toEqual(['retry-exp', 'retry-jitter', 'retry-now', 'serve']);
  });
});

describe('retry-and-backoff — 알고리즘의 걸음과 계기', () => {
  it('곧바로·3 → 흩음·3 → 곧바로·3 회차마다 계기가 표와 같다', async () => {
    const { rounds, sent } = await runRounds([
      { type: 'policy', value: 2 },
      { type: 'policy', value: 0 },
    ]);
    expect(rounds.length).toBe(3);
    const vals = rounds.map((r) => [r.metrics['peak-after'], r.metrics['fails-after'], r.metrics['last-served'], r.metrics.attempts]);
    expect(vals).toEqual([
      [20, 32, 11, 116],
      [9, 6, 11, 76],
      [20, 32, 11, 116],
    ]);
    // 처음 한 번은 차이 0 도 보낸다
    for (const name of ['peak-after', 'fails-after', 'last-served', 'attempts']) expect(sent[name][0]).toBe(0);
  });

  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase 이고, 걸음 이벤트는 silent 가 아니다', async () => {
    const { rounds } = await runRounds([
      { type: 'policy', value: 1 },
      { type: 'policy', value: 2 },
      { type: 'outage', value: 5 },
    ]);
    const seen = new Set<string>();
    rounds.forEach((r, ri) => {
      expect(r.events[0].type).toBe('init');
      expect(r.events[0].silent).toBe(true);
      const policy = [0, 1, 2, 2][ri];
      r.events.forEach((e, i) => {
        if (e.type !== 'tick') return;
        expect(e.silent).not.toBe(true);
        const prev = r.events[i - 1];
        expect(prev.type).toBe('phase');
        const phase = (prev.payload as { phase: string }).phase;
        seen.add(phase);
        const failed = (e.payload as { failed: number }).failed;
        const branch = ['retry-now', 'retry-exp', 'retry-jitter'][policy];
        expect(phase).toBe(failed > 0 ? branch : 'serve');
      });
    });
    expect([...seen].sort()).toEqual(['retry-exp', 'retry-jitter', 'retry-now', 'serve']);
  });
});

describe('retry-and-backoff — 무대', () => {
  const mountStage = () => {
    const container = document.createElement('div');
    const stage = mountView(retryAndBackoffStageView, container, {
      config: {},
      initialData: retryAndBackoffInitialData,
      isInstant: () => true,
    });
    const views = { stage, codePanel: { highlightPhase: () => {}, clearHighlight: () => {} } } as unknown as Parameters<
      typeof retryAndBackoffProjector
    >[0];
    const projector = retryAndBackoffProjector(views, { getSpeed: () => 1, t: (_k, fb) => fb });
    return { container, projector };
  };

  it('config 만 주고 마운트해도 던지지 않는다', () => {
    const container = document.createElement('div');
    expect(() => mountView(retryAndBackoffStageView, container, { config: {} })).not.toThrow();
  });

  it('첫 그림을 두 번 먹여도 요소 수가 같고, 판을 끝까지 먹이면 기둥 자국이 찾아옴과 같다', async () => {
    const { rounds } = await runRounds([{ type: 'policy', value: 2 }]);
    const { container, projector } = mountStage();
    const count = () => container.querySelectorAll('*').length;
    const [first, second] = rounds;
    await projector.onEvent(first.events[0]);
    const once = count();
    await projector.onEvent(first.events[0]);
    expect(count()).toBe(once);

    for (const e of first.events.slice(1)) await projector.onEvent(e);
    const traces = [...container.querySelectorAll('[data-trace]')];
    const perTick = new Map<number, number>();
    for (const tr of traces) {
      const tick = Number(tr.getAttribute('data-tick'));
      perTick.set(tick, (perTick.get(tick) ?? 0) + 1);
    }
    expect(perTick.get(4)).toBe(20);
    expect(traces.length).toBe(116);
    // 판 끝 — 모두 받혀 남은 점이 없다
    expect(container.querySelectorAll('[data-id]').length).toBe(0);

    // 새 판의 걸음 0 — 앞 판의 자국 · 점을 남기지 않는다
    await projector.onEvent(second.events[0]);
    expect(container.querySelectorAll('[data-trace]').length).toBe(0);
    for (const e of second.events.slice(1)) await projector.onEvent(e);
    expect(container.querySelectorAll('[data-trace]').length).toBe(76);

    // 되감기 — onReset 이 무대를 비운다
    projector.onReset?.();
    expect(container.querySelectorAll('[data-trace]').length).toBe(0);
    expect(container.querySelectorAll('[data-role="outage"]').length).toBe(0);
  });

  it('없는 손님이 다시 오면 던진다', async () => {
    const { rounds } = await runRounds([]);
    const { projector } = mountStage();
    await projector.onEvent(rounds[0].events[0]);
    const later = rounds[0].events.find(
      (e) => e.type === 'tick' && (e.payload as { tick: number }).tick === 2,
    );
    if (later === undefined) throw new Error('틱 2 가 없다');
    expect(() => projector.onEvent(later)).toThrow(/무대에 없다|다시 온 손님/);
  });
});
