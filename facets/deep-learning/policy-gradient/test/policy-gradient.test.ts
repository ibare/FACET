// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { makeTranslator, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  bestActionOf,
  countLeads,
  leaderOf,
  narrowPolicyGradientData,
  policyGradientAlgorithm,
  policyGradientFacet,
  policyGradientImperativeIR,
  policyGradientProjector,
  policyGradientStageView,
  runAgent,
  type PolicyGradientData,
} from '../src/index.js';

const data = narrowPolicyGradientData(policyGradientFacet.initialData);
const COMBOS: Array<[number, number]> = [
  [0, 0],
  [0, 3],
  [1, 0],
  [1, 3],
];
const key = (b: number, s: number): string => `${b === 0 ? 'none' : 'mean'}:${s}`;

/** 표시 — 둘째 자리 (−0.00 은 0.00). */
const fx = (v: number): string => {
  const s = v.toFixed(2);
  return Number(s) === 0 ? '0.00' : s;
};

function endPis(d: PolicyGradientData, b: number, s: number): number[][] {
  return d.seeds.map((seed) => {
    const run = runAgent(d, b, s, seed);
    return run.episodes[run.episodes.length - 1].piAfter;
  });
}

describe('policy-gradient — 사양 표 대조', () => {
  const table: Record<string, { pis: string[]; meanA2: string; other: number; best: number }> = {
    'none:0': { pis: ['0.01/0.98/0.01', '0.01/0.98/0.01', '0.01/0.98/0.01', '0.02/0.97/0.01', '0.02/0.97/0.01'], meanA2: '0.97', other: 0, best: 5 },
    'none:3': { pis: ['0.01/0.98/0.01', '0.02/0.96/0.01', '0.01/0.99/0.01', '0.01/0.98/0.01', '0.97/0.01/0.01'], meanA2: '0.79', other: 1, best: 4 },
    'mean:0': { pis: ['0.02/0.98/0.00', '0.01/0.99/0.01', '0.05/0.95/0.01', '0.03/0.94/0.02', '0.02/0.96/0.02'], meanA2: '0.96', other: 0, best: 5 },
    'mean:3': { pis: ['0.02/0.98/0.00', '0.00/0.99/0.00', '0.02/0.98/0.00', '0.02/0.96/0.02', '0.01/0.96/0.03'], meanA2: '0.97', other: 0, best: 5 },
  };

  for (const [b, s] of COMBOS) {
    it(`판 30 뒤 π · 앞선 수 (${key(b, s)})`, () => {
      const pis = endPis(data, b, s);
      const want = table[key(b, s)];
      expect(pis.map((p) => p.map(fx).join('/'))).toEqual(want.pis);
      expect(fx(pis.reduce((acc, p) => acc + p[1], 0) / pis.length)).toBe(want.meanA2);
      const leads = countLeads(pis.map(leaderOf), bestActionOf(data.rewards));
      expect(leads).toEqual({ bestLeads: want.best, otherLeads: want.other });
    });
  }

  it('기본(없음 · 0) 의 판 차례', () => {
    const runs = data.seeds.map((seed) => runAgent(data, 0, 0, seed));
    const row = (ep: number): string =>
      runs.map((r) => `${data.actions[r.episodes[ep - 1].action]}:${fx(r.episodes[ep - 1].piAfter[1])}`).join(' ');
    const leadsAt = (ep: number): number => countLeads(runs.map((r) => leaderOf(r.episodes[ep - 1].piAfter)), 1).bestLeads;
    expect(row(1)).toBe('a2:0.55 a3:0.36 a2:0.55 a3:0.36 a3:0.36');
    expect(row(2)).toBe('a2:0.69 a1:0.36 a3:0.61 a1:0.36 a1:0.36');
    expect(row(3)).toBe('a2:0.77 a2:0.58 a2:0.73 a3:0.39 a1:0.36');
    expect(row(5)).toBe('a3:0.87 a2:0.78 a2:0.84 a3:0.42 a2:0.58');
    expect(row(10)).toBe('a2:0.93 a2:0.91 a2:0.93 a1:0.75 a2:0.86');
    expect(row(30)).toBe('a2:0.98 a2:0.98 a2:0.98 a2:0.97 a2:0.97');
    expect([1, 2, 3, 5, 10, 30].map(leadsAt)).toEqual([2, 2, 3, 4, 5, 5]);
  });

  it('행위자 1 의 첫 판들 — 기준값이 G 를 어떻게 바꾸나', () => {
    const none = runAgent(data, 0, 3, data.seeds[0]).episodes;
    expect(none.slice(0, 4).map((e) => [e.action, e.gain, fx(e.baseline), fx(e.piAfter[1])])).toEqual([
      [1, 6, '0.00', '0.75'],
      [1, 6, '0.00', '0.86'],
      [1, 6, '0.00', '0.90'],
      [1, 6, '0.00', '0.92'],
    ]);
    const mean = runAgent(data, 1, 3, data.seeds[0]).episodes;
    expect(mean.slice(0, 3).map((e) => [e.action, e.gain, fx(e.baseline), fx(e.piAfter[1])])).toEqual([
      [1, 6, '0.00', '0.75'],
      [1, 6, '6.00', '0.75'],
      [1, 6, '6.00', '0.75'],
    ]);
    expect([mean[3].action, mean[3].gain, fx(mean[3].baseline), fx(mean[3].piBefore[2]), fx(mean[3].piAfter[2])]).toEqual([2, 2, '6.00', '0.12', '0.02']);
  });

  it('없음 · +3 은 모든 판에서 뽑힌 행동이 오르고, 평균 · +3 은 내린 판이 12', () => {
    let fell = 0;
    for (const seed of data.seeds) {
      for (const e of runAgent(data, 0, 3, seed).episodes) expect(e.piAfter[e.action]).toBeGreaterThan(e.piBefore[e.action]);
      for (const e of runAgent(data, 1, 3, seed).episodes) if (e.piAfter[e.action] < e.piBefore[e.action]) fell++;
    }
    expect(fell).toBe(12);
  });

  it('걸음 0 의 π 셋은 동률이라 앞선 행동이 없다', () => {
    const run = runAgent(data, 0, 0, data.seeds[0]);
    expect(leaderOf(run.start)).toBe(-1);
  });
});

describe('policy-gradient — IR ↔ algorithm', () => {
  const agree = (d: PolicyGradientData): void => {
    for (const [b, s] of COMBOS) {
      for (const seed of d.seeds) {
        const run = runAgent(d, b, s, seed);
        const theta = d.thetaStart.slice();
        const pi = d.thetaStart.map(() => 0);
        let sumG = 0;
        for (const e of run.episodes) {
          runIR(policyGradientImperativeIR, 'softmax', [theta, pi]);
          expect(pi).toEqual(e.piBefore);
          const a = runIR(policyGradientImperativeIR, 'sampleAction', [pi, e.u]);
          expect(a).toBe(e.action);
          const gain = d.rewards[e.action] + s;
          expect(gain).toBe(e.gain);
          const base = runIR(policyGradientImperativeIR, 'baselineValue', [sumG, e.episode - 1, b]);
          expect(base).toBe(e.baseline);
          runIR(policyGradientImperativeIR, 'reinforce', [theta, pi, e.action, gain, e.baseline, d.alpha]);
          expect(theta).toEqual(e.thetaAfter);
          sumG = sumG + gain;
          const after = d.thetaStart.map(() => 0);
          runIR(policyGradientImperativeIR, 'softmax', [theta, after]);
          expect(after).toEqual(e.piAfter);
        }
      }
    }
  };

  it('네 조합 · 다섯 · 모든 판에서 같다', () => {
    expect(data.seeds).toHaveLength(5);
    expect(data.episodes).toBe(30);
    agree(data);
  });

  it('가장 좋은 행동을 a3 으로 바꾼 데이터에서도 같다', () => {
    const swapped: PolicyGradientData = { ...data, rewards: [0, -1, 3] };
    expect(bestActionOf(swapped.rewards)).toBe(2);
    agree(swapped);
  });
});

describe('policy-gradient — 손잡이 사다리', () => {
  type Seg = { value: number; default?: boolean };
  const controls = (policyGradientFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
  const segs = (action: string): Seg[] => {
    const c = controls.find((x) => x.action === action);
    if (!c) throw new Error(action);
    return c.segments as Seg[];
  };

  it('segments[].value 가 사다리와 같고 기본이 처음 값이다', () => {
    expect(segs('baseline').map((x) => x.value)).toEqual(data.baselineLadder);
    expect(segs('shift').map((x) => x.value)).toEqual(data.shiftLadder);
    expect(data.baselineLadder).toEqual([0, 1]);
    expect(data.shiftLadder).toEqual([0, 3]);
    expect(segs('baseline').find((x) => x.default)?.value).toBe(data.baselineStart);
    expect(segs('shift').find((x) => x.default)?.value).toBe(data.shiftStart);
  });
});

// ── 알고리즘을 손잡이 입력과 함께 돌린다 ─────────────────────────────────────

type Played = { events: FacetRuntimeEvent[]; metricsAtRunEnd: Array<Record<string, number>> };

async function play(inputs: Array<{ type: string; value: number }>): Promise<Played> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const metricsAtRunEnd: Array<Record<string, number>> = [];
  const queue = inputs.slice();
  let cancelled = false;
  const ctx = {
    data: data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      metricsAtRunEnd.push({ ...metrics });
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        return { type: 'none' };
      }
      return { type: next.type, payload: { value: next.value } };
    },
    pollInput() {
      return null;
    },
  };
  await policyGradientAlgorithm(ctx as never);
  return { events, metricsAtRunEnd };
}

describe('policy-gradient — 회차별 계기', () => {
  it('없음·0 → 없음·+3 → 없음·0 → 평균·0 → 평균·+3 — 판마다 지금 값', async () => {
    const r = await play([
      { type: 'shift', value: 3 },
      { type: 'shift', value: 0 },
      { type: 'baseline', value: 1 },
      { type: 'shift', value: 3 },
    ]);
    const m = (e: number, b: number, o: number) => ({ episode: e, 'best-leads': b, 'other-leads': o });
    expect(r.metricsAtRunEnd).toEqual([m(30, 5, 0), m(30, 4, 1), m(30, 5, 0), m(30, 5, 0), m(30, 5, 0)]);
  });

  it('판 하나의 걸음 — 걸음 0 · 판 30 · 끝, 걸음마다 마지막 phase', async () => {
    const r = await play([]);
    const steps = r.events.filter((e) => e.type !== 'phase').map((e) => e.type);
    expect(steps).toEqual(['pg-start', ...new Array(30).fill('pg-episode'), 'pg-final']);
    const phases = r.events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase);
    expect(phases).toEqual(['policy', ...new Array(30).fill('update'), 'policy']);
    // 자취는 silent 아닌 발신에서 걸음을 끊는다 — phase 가 그 걸음 이벤트 바로 앞에 와야 같은 걸음에 묶인다
    r.events.forEach((e, i) => {
      if (e.type !== 'phase') expect(r.events[i - 1]?.type).toBe('phase');
    });
    expect(r.events[r.events.length - 1].type).toBe('pg-final');
  });
});

describe('policy-gradient — 무대', () => {
  it('캡션의 수가 payload 의 수다 (없음 · +3 의 끝)', async () => {
    const r = await play([{ type: 'shift', value: 3 }]);
    const container = document.createElement('div');
    const t = makeTranslator('en');
    const stage = mountView(policyGradientStageView, container, { config: {}, locale: 'en', t });
    const code: string[] = [];
    const projector = policyGradientProjector(
      { stage, codePanel: { destroy() {}, highlightPhase: (p: string | null) => code.push(String(p)) } },
      { getSpeed: () => 1, t },
    );
    for (const e of r.events) await projector.onEvent(e);
    const text = container.textContent ?? '';
    expect(text).toContain('After episode 30 · a2 leads 4/5 · another action leads 1/5');
    expect(text).toContain('a1 leads');
    expect(code[code.length - 1]).toBe('policy');
    stage.destroy();
  });

  it('initialData 없이 마운트해도 던지지 않는다', () => {
    const container = document.createElement('div');
    const stage = mountView(policyGradientStageView, container, { config: {} });
    stage.destroy();
  });
});
