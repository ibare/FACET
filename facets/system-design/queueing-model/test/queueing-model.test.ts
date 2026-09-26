// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  drawUniforms,
  ladderAxes,
  queueingModelAlgorithm,
  readQueueingModelData,
  sampleInputs,
  settleRun,
  type QueueingModelData,
} from '../src/algorithm.js';
import { queueingModelFacet } from '../src/facet.js';
import { queueingModelImperativeIR } from '../src/irs.js';
import { queueingModelProjector } from '../src/projector.js';
import { queueingModelStageView } from '../src/queueing-model-stage.js';

const data = readQueueingModelData(queueingModelFacet.initialData);
const uniforms = drawUniforms(data.requests, data.seed);
const r2 = (x: number) => x.toFixed(2);

/** 사양 실측표 — 들쭉날쭉 × ρ: [평균 기다림, 가장 긴 기다림, 기다린 요청, 가장 긴 줄, 마지막 떠남] */
const TABLE: Record<string, [string, string, number, number, string]> = {
  '0:50': ['0.00', '0.00', 0, 0, '81.00'],
  '0:70': ['0.00', '0.00', 0, 0, '58.14'],
  '0:80': ['0.00', '0.00', 0, 0, '51.00'],
  '0:90': ['0.00', '0.00', 0, 0, '45.44'],
  '1:50': ['0.01', '0.18', 2, 0, '82.36'],
  '1:70': ['0.07', '0.59', 12, 0, '59.72'],
  '1:80': ['0.18', '1.28', 18, 1, '53.24'],
  '1:90': ['0.32', '1.87', 25, 1, '48.20'],
  '2:50': ['0.75', '6.93', 19, 3, '86.52'],
  '2:70': ['1.06', '8.24', 24, 3, '65.54'],
  '2:80': ['1.24', '8.64', 25, 3, '58.98'],
  '2:90': ['1.77', '10.52', 29, 4, '55.44'],
};

type Input = { type: string; payload?: unknown };

/** 손잡이 입력을 차례로 건네는 가짜 reactive 문맥. 입력이 다 떨어지면 취소한다. */
async function play(inputs: Input[]) {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const rounds: Array<Record<string, number>> = [];
  const queue = inputs.slice();
  let seenEvents = 0;
  /** 쉼마다 그때까지 나간 발신 수 */
  const sleeps: number[] = [];
  const ctx = {
    data: queueingModelFacet.initialData as QueueingModelData,
    cancelled: false,
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      sleeps.push(events.length);
      return !ctx.cancelled;
    },
    async waitForInput() {
      // 흘린 입력 뒤의 다시 기다림은 새 판이 아니다 — 판이 끝났을 때만 적는다
      if (events.length !== seenEvents) rounds.push({ ...metrics });
      seenEvents = events.length;
      const next = queue.shift();
      if (!next) {
        ctx.cancelled = true;
        return { type: 'none' };
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await queueingModelAlgorithm(ctx as never);
  return { events, rounds, sleeps };
}

describe('queueing-model — 사다리와 데이터', () => {
  it('사다리가 손잡이 구간 값과 같다', () => {
    const controls = (queueingModelFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
    const seg = (action: string) =>
      (controls.find((c) => c.action === action)!.segments as Array<{ value: number; default?: boolean }>);
    expect(seg('variability').map((s) => s.value)).toEqual(data.variabilities);
    expect(seg('load').map((s) => s.value)).toEqual(data.loads);
    expect(seg('variability').find((s) => s.default)!.value).toBe(data.variability);
    expect(seg('load').find((s) => s.default)!.value).toBe(data.load);
    expect(data.requests).toBe(40);
    expect(data.variabilities).toEqual([0, 1, 2]);
    expect(data.loads[data.loads.length - 1]).toBe(90);
    expect(uniforms).toHaveLength(40);
  });

  it('간격이 0 인 요청이 없다 — 같은 시각 도착(동률)이 이 데이터에서 걸리지 않는다', () => {
    for (const [ug] of uniforms) expect(ug).toBeGreaterThan(0);
    for (const v of data.variabilities) {
      for (const l of data.loads) {
        const { gap } = sampleInputs(data, uniforms, v, l);
        for (const g of gap) expect(g).toBeGreaterThan(0);
      }
    }
  });
});

describe('queueing-model — 사양 실측표', () => {
  it('12 조합 모두 표와 같다 (소수 둘째 자리)', () => {
    for (const v of data.variabilities) {
      for (const l of data.loads) {
        const { gap, service } = sampleInputs(data, uniforms, v, l);
        const run = settleRun(gap, service);
        const [mean, max, waited, longest, last] = TABLE[`${v}:${l}`]!;
        expect([r2(run.meanWait), r2(run.maxWait), run.waited, run.longestLine, r2(run.depart[39]!)]).toEqual([
          mean,
          max,
          waited,
          longest,
          last,
        ]);
      }
    }
  });

  it('축 범위가 사다리 전체에서 셈해진다', () => {
    const axes = ladderAxes(data, uniforms);
    expect(r2(axes.axisEnd)).toBe('86.52');
    expect(r2(axes.waitTop)).toBe('10.52');
    expect(axes.lineTop).toBe(4);
  });

  it('기본값(지수 · 0.8) 대조점', () => {
    const { gap, service } = sampleInputs(data, uniforms, 2, 80);
    const run = settleRun(gap, service);
    expect([r2(run.arrive[0]!), r2(run.service[0]!), r2(run.wait[0]!)]).toEqual(['0.06', '1.17', '0.00']);
    expect([r2(run.arrive[2]!), r2(run.wait[2]!)]).toEqual(['3.14', '2.89']);
    expect([r2(run.arrive[39]!), r2(run.wait[39]!), run.line[39], r2(run.depart[39]!)]).toEqual([
      '48.77',
      '8.64',
      3,
      '58.98',
    ]);
  });
});

describe('queueing-model — IR 과 algorithm', () => {
  it('12 조합 모두 wait · line · 돌려준 값이 같다', () => {
    for (const v of data.variabilities) {
      for (const l of data.loads) {
        const { gap, service } = sampleInputs(data, uniforms, v, l);
        const run = settleRun(gap, service);
        const wait = new Array<number>(gap.length).fill(-1);
        const line = new Array<number>(gap.length).fill(-1);
        const back = runIR(queueingModelImperativeIR, 'settle', [gap, service, wait, line]);
        expect(back).toBe(run.waited);
        expect(wait).toEqual(run.wait);
        expect(line).toEqual(run.line);
      }
    }
  });
});

describe('queueing-model — 한 판의 걸음', () => {
  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase 다', async () => {
    const { events } = await play([]);
    const steps = events.filter((e) => !e.silent);
    expect(steps).toHaveLength(41);
    expect(events[0]!.type).toBe('init');
    expect(events[0]!.silent).toBe(true);
    const seen = new Set<string>();
    for (let i = 0; i < events.length; i += 1) {
      const e = events[i]!;
      if (e.silent) continue;
      const prev = events[i - 1]!;
      expect(prev.type).toBe('phase');
      const phase = (prev.payload as { phase: string }).phase;
      seen.add(phase);
      if (e.type === 'request') {
        const p = e.payload as { wait: number };
        expect(phase).toBe(p.wait > 0 ? 'wait-in-line' : 'serve-now');
      } else {
        expect(e.type).toBe('sum-up');
        expect(phase).toBe('sum-up');
      }
    }
    expect([...seen].sort()).toEqual(['serve-now', 'sum-up', 'wait-in-line']);
    const q1 = steps[0]!.payload as { id: string; wait: number };
    const q3 = steps[2]!.payload as { id: string; wait: number };
    expect([q1.id, r2(q1.wait), q3.id, r2(q3.wait)]).toEqual(['q1', '0.00', 'q3', '2.89']);
  });

  it('init 뒤에 걸음 경계가 있다 — 점 운동이 첫 요청 전에 끝난다', async () => {
    const { events, sleeps } = await play([{ type: 'load', payload: { value: 90 } }]);
    const inits = events.map((e, i) => (e.type === 'init' ? i : -1)).filter((i) => i >= 0);
    expect(inits).toHaveLength(2);
    for (const at of inits) {
      // init 바로 뒤(발신 at + 1 개가 나간 때)에 쉬고, 그다음 발신이 첫 요청의 phase 다
      expect(sleeps).toContain(at + 1);
      expect(events[at + 1]!.type).toBe('phase');
    }
    expect(sleeps).toHaveLength(2 * 42);
  });

  it('회차별 계기 — 지수 · 0.8 → 고름 · 0.8 → 지수 · 0.8 = 25·3 → 0·0 → 25·3', async () => {
    const { rounds } = await play([
      { type: 'variability', payload: { value: 0 } },
      { type: 'variability', payload: { value: 2 } },
    ]);
    expect(rounds.map((m) => [m.waited, m['longest-line']])).toEqual([
      [25, 3],
      [0, 0],
      [25, 3],
    ]);
  });

  it('ρ 를 돌리면 판마다 표와 같다 · 사다리 밖 값은 흘린다', async () => {
    const { rounds } = await play([
      { type: 'load', payload: { value: 90 } },
      { type: 'load', payload: { value: 55 } },
      { type: 'variability', payload: { value: 1 } },
      { type: 'load', payload: { value: 50 } },
    ]);
    expect(rounds.map((m) => [m.waited, m['longest-line']])).toEqual([
      [25, 3],
      [29, 4],
      [25, 1],
      [2, 0],
    ]);
  });

  it('모르는 데이터 모양은 던진다', () => {
    expect(() => readQueueingModelData({ ...data, loads: [50, 100] })).toThrow();
    expect(() => readQueueingModelData({ ...data, variabilities: [0, 3] })).toThrow();
  });
});

describe('queueing-model — 무대', () => {
  async function mounted() {
    const { events } = await play([{ type: 'load', payload: { value: 50 } }]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const views = { stage: mountView(queueingModelStageView, container, { config: {}, locale: 'ko' }) };
    const projector = queueingModelProjector(views, { getSpeed: () => 1, t: (_k, fb) => fb });
    projector.onInit?.(queueingModelFacet.initialData);
    const svg = container.querySelector('svg')!;
    return { events, projector, svg };
  }

  it('첫 그림이 멱등이다 — 같은 init 을 두 번 먹여도 요소 수가 같다', async () => {
    const { events, projector, svg } = await mounted();
    await projector.onEvent(events[0]!);
    const once = svg.querySelectorAll('*').length;
    await projector.onEvent(events[0]!);
    expect(svg.querySelectorAll('*').length).toBe(once);
    projector.onReset?.();
    await projector.onEvent(events[0]!);
    expect(svg.querySelectorAll('*').length).toBe(once);
  });

  it('새 판 걸음 0 에서 앞 판의 막대 · 평균 선 · 캡션을 걷는다', async () => {
    const { events, projector, svg } = await mounted();
    const initOf = events.filter((e) => e.type === 'init');
    expect(initOf).toHaveLength(2);
    const second = events.indexOf(initOf[1]!);
    await projector.onEvent(events[0]!);
    const fresh = svg.querySelectorAll('rect').length;
    for (let i = 1; i < second; i += 1) await projector.onEvent(events[i]!);
    expect(svg.querySelectorAll('rect').length).toBeGreaterThan(fresh);
    expect(svg.querySelectorAll('line[stroke-dasharray]').length).toBe(1);
    await projector.onEvent(events[second]!);
    expect(svg.querySelectorAll('rect').length).toBe(fresh);
    expect(svg.querySelectorAll('line[stroke-dasharray]').length).toBe(0);
    expect(svg.querySelectorAll('circle').length).toBe(41);
  });
});
