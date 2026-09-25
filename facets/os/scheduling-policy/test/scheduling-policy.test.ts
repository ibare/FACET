// @vitest-environment happy-dom
/**
 * CPU 스케줄 정책 — facet 고유의 주장.
 *
 *   1. 알고리즘이 틱 모형으로 셈한 값이 사양 표와 같다 (여덟 판: 대기 합 · 최대 대기 · 바뀜 · 끝 · 걸음 · 동률 · 프로세스마다)
 *   2. IR(schedule) 의 답과 돌린 뒤 finish 배열이 여덟 조합 모두에서 알고리즘과 같다
 *   3. 걸음표 — 걸음마다 켜지는 phase 와 계기 (사양의 세 본보기)
 *   4. 회차별 계기 — FCFS → SRTF → FCFS (큰 것 먼저) 로 돌려 회차마다 사양과 견준다
 *   5. 사다리 = segments[].value
 *   6. stage 를 mountView 로 붙여 한 판을 그려도 던지지 않는다
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  policyCode,
  schedulingPolicyAlgorithm,
  schedulingPolicyFacet,
  schedulingPolicyImperativeIR,
  schedulingPolicyStageView,
  simulateSchedule,
  type SchedulingPolicyData,
  type SchedulingPolicyStage,
} from '../src/index.js';

const data = schedulingPolicyFacet.initialData as unknown as SchedulingPolicyData;

type Row = {
  total: number;
  max: number;
  switches: number;
  end: number;
  steps: number;
  ties: number;
  finish: number[];
  wait: number[];
};

/** 사양 표 — [일감][정책] */
const SPEC: Row[][] = [
  [
    { total: 39, max: 11, switches: 4, end: 15, steps: 9, ties: 0, finish: [10, 11, 12, 14, 15], wait: [0, 9, 9, 10, 11] },
    { total: 38, max: 11, switches: 4, end: 15, steps: 9, ties: 2, finish: [10, 11, 12, 15, 13], wait: [0, 9, 9, 11, 9] },
    { total: 7, max: 5, switches: 5, end: 15, steps: 8, ties: 0, finish: [15, 2, 3, 6, 4], wait: [5, 0, 0, 2, 0] },
    { total: 10, max: 5, switches: 7, end: 15, steps: 14, ties: 3, finish: [15, 2, 3, 8, 5], wait: [5, 0, 0, 4, 1] },
  ],
  [
    { total: 41, max: 7, switches: 6, end: 18, steps: 13, ties: 0, finish: [6, 8, 10, 12, 14, 16, 18], wait: [0, 6, 7, 7, 7, 7, 7] },
    { total: 17, max: 12, switches: 6, end: 18, steps: 13, ties: 0, finish: [18, 2, 4, 6, 8, 10, 12], wait: [12, 0, 1, 1, 1, 1, 1] },
    { total: 17, max: 12, switches: 6, end: 18, steps: 13, ties: 0, finish: [18, 2, 4, 6, 8, 10, 12], wait: [12, 0, 1, 1, 1, 1, 1] },
    { total: 49, max: 12, switches: 14, end: 18, steps: 25, ties: 8, finish: [18, 9, 11, 12, 13, 14, 15], wait: [12, 7, 8, 7, 6, 5, 4] },
  ],
];

const sim = (policy: number, workload: number) =>
  simulateSchedule(policyCode(data.policies[policy]), data.workloads[workload].procs, data.mlfqQuanta);

describe('scheduling-policy — 셈한 값이 사양 표와 같다', () => {
  for (let w = 0; w < 2; w += 1) {
    for (let p = 0; p < 4; p += 1) {
      it(`${data.policies[p]} · ${data.workloads[w].id}`, () => {
        const r = sim(p, w);
        const s = SPEC[w][p];
        expect(r.totalWait).toBe(s.total);
        expect(Math.max(...r.wait)).toBe(s.max);
        expect(r.switches).toBe(s.switches);
        expect(Math.max(...r.finish)).toBe(s.end);
        expect(r.steps.length).toBe(s.steps);
        expect(r.ties).toBe(s.ties);
        expect(r.finish).toEqual(s.finish);
        expect(r.wait).toEqual(s.wait);
        // 판 끝 걸음의 계기 = 판의 값
        const last = r.steps[r.steps.length - 1];
        expect(last.waits.reduce((a, b) => a + b, 0)).toBe(s.total);
        expect(last.switches).toBe(s.switches);
      });
    }
  }
});

describe('scheduling-policy — IR 과 알고리즘이 여덟 조합 모두에서 같은 답', () => {
  for (let w = 0; w < 2; w += 1) {
    for (let p = 0; p < 4; p += 1) {
      it(`${data.policies[p]} · ${data.workloads[w].id}`, () => {
        const procs = data.workloads[w].procs;
        const n = procs.length;
        const arrive = procs.map((x) => x.arrive);
        const burst = procs.map((x) => x.burst);
        const remain = burst.slice();
        const level = new Array<number>(n).fill(0);
        const queued = new Array<number>(n).fill(0);
        const seq = new Array<number>(n).fill(0);
        const finish = new Array<number>(n).fill(-1);
        const quanta = data.mlfqQuanta.slice();
        const code = policyCode(data.policies[p]);
        const answer = runIR(schedulingPolicyImperativeIR, 'schedule', [
          code,
          arrive,
          burst,
          remain,
          level,
          queued,
          seq,
          finish,
          quanta,
          n,
        ]);
        const r = sim(p, w);
        expect(answer).toBe(r.totalWait);
        expect(finish).toEqual(r.finish);
      });
    }
  }
});

type StepRow = [string, number, number, number];

const walk = (policy: number, workload: number): StepRow[] =>
  sim(policy, workload).steps.map((st) => [st.phase, st.waits.reduce((a, b) => a + b, 0), Math.max(...st.waits), st.switches]);

describe('scheduling-policy — 걸음표', () => {
  it('FCFS · 큰 것 먼저 — 아홉 걸음', () => {
    expect(walk(0, 0)).toEqual([
      ['dispatch', 0, 0, 0],
      ['arrive', 1, 1, 0],
      ['arrive', 4, 2, 0],
      ['arrive', 32, 9, 0],
      ['dispatch', 35, 9, 1],
      ['dispatch', 37, 10, 2],
      ['dispatch', 39, 11, 3],
      ['dispatch', 39, 11, 4],
      ['finish', 39, 11, 4],
    ]);
  });
  it('SRTF · 큰 것 먼저 — 여덟 걸음, 밀어냄이 제 걸음', () => {
    expect(walk(2, 0)).toEqual([
      ['dispatch', 0, 0, 0],
      ['preempt', 0, 0, 0],
      ['dispatch', 1, 1, 1],
      ['dispatch', 3, 2, 2],
      ['dispatch', 5, 3, 3],
      ['dispatch', 7, 5, 4],
      ['dispatch', 7, 5, 5],
      ['finish', 7, 5, 5],
    ]);
  });
  it('MLFQ · 큰 것 먼저 — 열네 걸음, 내려앉음이 제 걸음', () => {
    expect(walk(3, 0)).toEqual([
      ['dispatch', 0, 0, 0],
      ['demote', 0, 0, 0],
      ['dispatch', 1, 1, 1],
      ['dispatch', 3, 2, 2],
      ['dispatch', 5, 3, 3],
      ['demote', 5, 3, 3],
      ['dispatch', 7, 4, 4],
      ['dispatch', 9, 4, 5],
      ['demote', 9, 4, 5],
      ['dispatch', 10, 5, 6],
      ['dispatch', 10, 5, 7],
      ['demote', 10, 5, 7],
      ['dispatch', 10, 5, 7],
      ['finish', 10, 5, 7],
    ]);
  });
  it('여덟 판의 걸음 phase 를 모으면 IR 어휘 다섯', () => {
    const all = new Set<string>();
    for (let w = 0; w < 2; w += 1) for (let p = 0; p < 4; p += 1) for (const s of sim(p, w).steps) all.add(s.phase);
    expect([...all].sort()).toEqual(['arrive', 'demote', 'dispatch', 'finish', 'preempt']);
  });
});

describe('scheduling-policy — 회차별 계기', () => {
  it('FCFS → SRTF → FCFS (큰 것 먼저): {39,11,4} → {7,5,5} → {39,11,4}', async () => {
    const inputs = [
      { type: 'policy', payload: { value: 2, segmentIndex: 2 } },
      { type: 'policy', payload: { value: 0, segmentIndex: 0 } },
    ];
    const totals = new Map<string, number>();
    const perRound: Record<string, number>[] = [];
    let cancelled = false;
    const events: FacetRuntimeEvent[] = [];
    const ctx = {
      data: { ...data, policy: 0, workload: 0 },
      get cancelled() {
        return cancelled;
      },
      async emit(e: FacetRuntimeEvent) {
        events.push(e);
      },
      metric(name: string, delta: number | 'inc') {
        totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
      },
      async sleep() {
        return true;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        perRound.push(Object.fromEntries(totals));
        const next = inputs.shift();
        if (!next) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return next;
      },
    };
    await schedulingPolicyAlgorithm(ctx as never);
    expect(perRound).toEqual([
      { 'total-wait': 39, 'max-wait': 11, switches: 4 },
      { 'total-wait': 7, 'max-wait': 5, switches: 5 },
      { 'total-wait': 39, 'max-wait': 11, switches: 4 },
    ]);
    // 판마다 걸음 수만큼 step 이 간다 (9 + 8 + 9)
    expect(events.filter((e) => e.type === 'step').length).toBe(26);
  });
});

describe('scheduling-policy — 사다리', () => {
  it('policies · workloads 의 순번이 segments[].value 와 같다', () => {
    const controls = (schedulingPolicyFacet.blocks.controls as { controls: { action: string; segments?: { value: number }[] }[] })
      .controls;
    const values = (action: string) => controls.find((c) => c.action === action)?.segments?.map((s) => s.value);
    expect(data.policies).toEqual(['fcfs', 'sjf', 'srtf', 'mlfq']);
    expect(data.workloads.length).toBe(2);
    expect(values('policy')).toEqual(data.policies.map((_, i) => i));
    expect(values('workload')).toEqual(data.workloads.map((_, i) => i));
    expect(values('policy')?.at(-1)).toBe(3);
    expect(values('workload')?.at(-1)).toBe(1);
    expect(data.workloads.map((w) => w.procs.length)).toEqual([5, 7]);
    expect(data.mlfqQuanta).toEqual([1, 2, 4]);
  });
});

describe('scheduling-policy — stage', () => {
  it('mountView 로 붙여 두 판을 그린다', async () => {
    const container = document.createElement('div');
    const view = mountView(schedulingPolicyStageView, container, { config: {}, initialData: data as never, locale: 'ko' });
    const stage = view as unknown as SchedulingPolicyStage;
    for (const policy of [0, 2]) {
      const procs = data.workloads[0].procs;
      stage.beginRound({ policy: data.policies[policy].toUpperCase(), workload: 'big-first', procs, quanta: data.mlfqQuanta, mlfq: false }, 0);
      const r = sim(policy, 0);
      for (let i = 0; i < r.steps.length; i += 1) {
        const st = r.steps[i];
        await stage.showStep(
          {
            last: i === r.steps.length - 1,
            from: st.from,
            to: st.to,
            events: st.events,
            run: st.run,
            queue: st.snap.queue,
            levels: st.snap.levels,
            running: st.snap.running,
            done: st.snap.done,
            waits: st.waits,
            totalWait: st.waits.reduce((a, b) => a + b, 0),
          },
          0,
        );
      }
    }
    const text = container.textContent ?? '';
    expect(text).toContain('1.40');
    expect(text).toContain('7.80');
    view.destroy();
  });
});
