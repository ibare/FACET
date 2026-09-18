// @vitest-environment happy-dom
/**
 * 정적 예측 완제품 검사.
 *
 * - IR 의 세 값(틀림 · 잃은 박자 · 맞힘 %)이 모든 규칙에서 알고리즘의 계기와 같다
 * - 회차마다 계기를 떠 사양 표와 견준다 (규칙 0 → 1 → 2 → 1 → 0)
 * - phase 집합 · mechanismKind · 사다리 · 32비트 한계를 구조로 잠근다
 * - 데이터를 바꿔 캡션의 수가 그 이름의 수인지 본다
 * - stage 에서 버린 박자가 분기의 더미로 옮겨 가는지 본다
 */

import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  mountView,
  type FacetContext,
  type FacetRuntimeEvent,
  type IR,
  type IRStmt,
  type ReactiveInputEvent,
} from '@ffacet/core/runtime';
import {
  computeStaticPrediction,
  registerStaticPrediction,
  staticPredictionAlgorithm,
  staticPredictionFacet,
  staticPredictionImperativeIR,
  staticPredictionProjector,
  staticPredictionStageView,
  type StaticPredictionData,
  type StaticPredictionStage,
} from '../src/index.js';

const DATA = staticPredictionFacet.initialData as StaticPredictionData;

/** 사양 표 — 대조용. */
const SPEC = [
  { misses: 11, hit: 45, lost: 22, forward: 2, backward: 9 },
  { misses: 9, hit: 55, lost: 18, forward: 8, backward: 1 },
  { misses: 3, hit: 85, lost: 6, forward: 2, backward: 1 },
];

type Tally = {
  metrics: Record<string, number>;
  payload: Record<string, number>;
};

/** 가짜 reactive 문맥으로 알고리즘을 돌린다. 판이 끝날 때마다 계기를 뜬다. */
async function play(data: StaticPredictionData, inputs: number[]): Promise<{ tallies: Tally[]; events: FacetRuntimeEvent[] }> {
  const metrics: Record<string, number> = {};
  const events: FacetRuntimeEvent[] = [];
  const tallies: Tally[] = [];
  const queue: ReactiveInputEvent[] = inputs.map((value, segmentIndex) => ({
    type: 'policy',
    payload: { value, segmentIndex },
  }));
  let cancelled = false;
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'tally') {
        tallies.push({ metrics: { ...metrics }, payload: { ...(e.payload as Record<string, number>) } });
      }
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await staticPredictionAlgorithm(ctx as unknown as FacetContext<StaticPredictionData>);
  return { tallies, events };
}

function irPhases(ir: IR): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]) => {
    for (const s of stmts) {
      if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
      if (s.kind === 'if') {
        walk(s.then);
        if (s.else) walk(s.else);
      }
      if (s.kind === 'for-range' || s.kind === 'while') walk(s.body);
    }
  };
  for (const f of ir.functions) walk(f.body);
  return out;
}

function irAnswer(values: number[], policy: number, penalty: number) {
  const misses = runIR(staticPredictionImperativeIR, 'countMisses', [values, policy]) as number;
  const lost = runIR(staticPredictionImperativeIR, 'lostCycles', [misses, penalty]) as number;
  const hit = runIR(staticPredictionImperativeIR, 'hitPercent', [misses, values.length * 2]) as number;
  return { misses, lost, hit };
}

const controls = (staticPredictionFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
const knob = controls.find((c) => c.widget === 'segmented-slider') as {
  action: string;
  segments: Array<{ value: unknown; default?: boolean }>;
};

describe('정적 예측 — 데이터와 구조', () => {
  it('사다리가 policies 의 순번과 같고 기본값이 initialData.policy 다', () => {
    expect(knob.action).toBe('policy');
    expect(knob.segments.map((s) => s.value)).toEqual(DATA.policies.map((_, i) => i));
    expect(knob.segments.find((s) => s.default)?.value).toBe(DATA.policy);
  });

  it('32비트 한계를 구조로 잠근다 — 값 열 10, 벌칙 2, 사다리 끝 2', () => {
    // 중간값 최대: 틀림 ≤ 분기 20, 백분율 곱 ≤ 20 × 100 + 10
    expect(DATA.values.length).toBe(10);
    expect(DATA.penalty).toBe(2);
    expect(Math.max(...knob.segments.map((s) => s.value as number))).toBe(2);
    expect(DATA.values.length * 2 * 100 + DATA.values.length).toBeLessThan(10_000);
    expect(DATA.values.length * 2 * DATA.penalty).toBeLessThan(10_000);
    expect(DATA.values.every((v) => v >= 0)).toBe(true);
  });

  it('한 판이 14 초 안에 들고 가장 얇은 걸음이 250ms 아래로 떨어지지 않는다', () => {
    SPEC.forEach((row) => {
      // 걸음: 분기마다 앞 경계 1 + 틀림마다 1 + 끝 1, 다가섬: 분기마다 1
      const steps = 20 + row.misses + 1;
      expect(steps * DATA.stepMs + 20 * DATA.approachMs).toBeLessThanOrEqual(14_000);
    });
    expect(Math.min(DATA.stepMs, DATA.approachMs)).toBeGreaterThanOrEqual(250);
  });

  it('등록하면 reactive 다', () => {
    clearRegistry();
    registerStaticPrediction();
    expect(getAlgorithmMechanismKind('staticPrediction')).toBe('reactive');
  });

  it('즉시 셈이 사양 표와 같다', () => {
    SPEC.forEach((row, policy) => {
      const r = computeStaticPrediction(DATA.values, policy, DATA.penalty);
      expect(r).toEqual({
        misses: row.misses,
        forwardMisses: row.forward,
        backwardMisses: row.backward,
        total: 20,
        lost: row.lost,
        hitPercent: row.hit,
      });
    });
  });
});

describe('정적 예측 — 알고리즘과 IR', () => {
  it('회차마다 계기가 사양 표와 같다 (0 → 1 → 2 → 1 → 0)', async () => {
    const order = [0, 1, 2, 1, 0];
    const { tallies } = await play(DATA, order.slice(1));
    expect(tallies).toHaveLength(order.length);
    tallies.forEach((t, i) => {
      const row = SPEC[order[i]!]!;
      expect(t.metrics).toEqual({ 'miss-count': row.misses, 'hit-percent': row.hit, 'lost-cycle-count': row.lost });
      expect(t.payload.forwardMisses).toBe(row.forward);
      expect(t.payload.backwardMisses).toBe(row.backward);
    });
  });

  it('IR 의 세 값이 모든 규칙에서 알고리즘의 계기와 같다', async () => {
    const order = [0, 1, 2];
    const { tallies } = await play(DATA, order.slice(1));
    order.forEach((policy, i) => {
      const ir = irAnswer(DATA.values, policy, DATA.penalty);
      const m = tallies[i]!.metrics;
      expect(ir).toEqual({ misses: m['miss-count'], lost: m['lost-cycle-count'], hit: m['hit-percent'] });
    });
  });

  it('데이터를 바꿔도 IR 과 알고리즘이 같은 답을 낸다', async () => {
    const other: StaticPredictionData = { ...DATA, values: [0, 5, 0, 0, 2], penalty: 3 };
    const order = [0, 1, 2];
    const { tallies } = await play(other, order.slice(1));
    order.forEach((policy, i) => {
      const ir = irAnswer(other.values, policy, other.penalty);
      const m = tallies[i]!.metrics;
      expect(ir).toEqual({ misses: m['miss-count'], lost: m['lost-cycle-count'], hit: m['hit-percent'] });
    });
  });

  it('방향을 가르는 phase 가 걸음 경계까지 살아남는다', async () => {
    // 걸음 경계(sleep) 직전에 마지막으로 켜진 phase 를 모은다 — 다음 phase 에 덮여 안 보이는 것이 없어야 한다
    const { events } = await play(DATA, []);
    const seen = new Set<string>();
    let last: string | null = null;
    for (const e of events) {
      if (e.type === 'phase') last = (e.payload as { phase: string }).phase;
      else if (last) seen.add(last);
    }
    expect([...seen].sort()).toEqual([...irPhases(staticPredictionImperativeIR)].sort());
  });

  it('phase 집합이 IR 과 같고 전부 silent 다', async () => {
    const { events } = await play(DATA, [1, 2]);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.every((e) => e.silent === true)).toBe(true);
    const algo = new Set(phases.map((e) => (e.payload as { phase: string }).phase));
    expect([...algo].sort()).toEqual([...irPhases(staticPredictionImperativeIR)].sort());
  });

  it('사다리 밖의 입력은 흘린다', async () => {
    const { tallies } = await play(DATA, [7, -1, 2]);
    // 7 · -1 은 버려지고 2 만 받힌다 → 판은 둘
    expect(tallies.map((t) => t.metrics['miss-count'])).toEqual([11, 3]);
  });
});

describe('정적 예측 — 캡션과 stage', () => {
  it('끝 캡션의 수가 그 이름의 수다 (데이터를 바꿔 본다)', async () => {
    const other: StaticPredictionData = { ...DATA, values: [0, 5, 0, 0, 2] };
    const { events } = await play(other, []);
    const captions: string[] = [];
    const stage = new Proxy({}, {
      get: (_t, key) => (key === 'setCaption' ? (s: string) => captions.push(s) : () => undefined),
    });
    const projector = staticPredictionProjector({ stage: stage as never }, undefined);
    for (const e of events) await projector.onEvent(e);
    // 값 열 [0,5,0,0,2] · 늘 안 탄다: 앞 3 (0 이 셋) + 뒤 4 = 7 / 10, 박자 14, 맞힘 (300+5)//10 = 30
    expect(captions.at(-1)).toBe('Missed 7 of 10: 3 forward, 4 backward. 14 cycles lost, 30% right.');
    expect(captions).toContain('Pass 1, forward branch: guessed not taken, it was taken. Miss.');
    expect(captions).toContain('Pass 5, backward branch: guessed not taken, it was not taken. Hit.');
  });

  it('버린 박자가 그 분기의 더미로 옮겨 가고, 새 판에서 앞 더미는 윤곽으로 남는다', () => {
    const container = document.createElement('div');
    const stage = mountView(staticPredictionStageView, container, {
      config: {},
      initialData: DATA as unknown as Record<string, unknown>,
      isInstant: () => true,
    }) as unknown as StaticPredictionStage;
    const svg = container.querySelector('svg')!;
    expect(svg).not.toBeNull();

    const pileBlocks = () =>
      [...svg.querySelectorAll('rect')].filter((r) => r.getAttribute('height') === '7').length;

    stage.setPolicy(0, 0, 0);
    stage.approach(0, 1);
    stage.showBranch(0, 1, 0, 1, true);
    stage.addLoss(0, 1, 2);
    stage.showBranch(1, 0, 0, 1, true);
    stage.addLoss(1, 0, 2);
    expect(pileBlocks()).toBe(4);

    // 규칙을 바꾸면 더미가 비고 윤곽이 남는다
    stage.setPolicy(2, 0, 1);
    expect(pileBlocks()).toBe(0);
    const ghosts = [...svg.querySelectorAll('rect')].filter(
      (r) => r.getAttribute('stroke-dasharray') !== null && r.getAttribute('opacity') === '1',
    );
    expect(ghosts).toHaveLength(2);
    stage.destroy();
  });
});
