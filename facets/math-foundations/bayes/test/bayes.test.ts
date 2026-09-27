// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  bayesAlgorithm,
  bayesFacet,
  bayesImperativeIR,
  bayesProjector,
  bayesStageView,
  firstOverHalf,
  likelihoodRatio,
  narrowBayesData,
  ppvPermille,
  permilleText,
  type BayesData,
} from '../src/index.js';

const data = narrowBayesData(bayesFacet.initialData);

/** 사양 표 — 기저율(‰) → 병일 몫(‰) 양성 0..3 · 승산 num 양성 0..3 · 절반을 넘는 첫 양성. */
const TABLE: Record<number, { ppv: number[]; num: number[]; den: number; first: number }> = {
  1: { ppv: [1, 9, 75, 422], num: [1, 9, 81, 729], den: 999, first: -1 },
  10: { ppv: [10, 83, 450, 880], num: [10, 90, 810, 7290], den: 990, first: 3 },
  20: { ppv: [20, 155, 623, 937], num: [20, 180, 1620, 14580], den: 980, first: 2 },
  50: { ppv: [50, 321, 810, 975], num: [50, 450, 4050, 36450], den: 950, first: 2 },
  200: { ppv: [200, 692, 953, 995], num: [200, 1800, 16200, 145800], den: 800, first: 1 },
  500: { ppv: [500, 900, 988, 999], num: [500, 4500, 40500, 364500], den: 500, first: 1 },
};

type Logged = { kind: 'emit'; event: FacetRuntimeEvent } | { kind: 'sleep'; ms: number };

/** 가짜 reactive ctx — 입력을 차례로 주고 다 쓰면 취소한다. */
async function play(inputs: { type: string; value: number }[]) {
  const log: Logged[] = [];
  const metrics = new Map<string, number>();
  const rounds: Record<string, number>[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data: { ...(bayesFacet.initialData as BayesData) },
    get cancelled() {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      log.push({ kind: 'emit', event });
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep(ms: number) {
      log.push({ kind: 'sleep', ms });
      return !cancelled;
    },
    async waitForInput() {
      rounds.push(Object.fromEntries(metrics));
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: next.type, payload: { value: next.value } };
    },
    pollInput() {
      return null;
    },
  };
  await bayesAlgorithm(ctx as never);
  return { log, rounds };
}

function events(log: Logged[]): FacetRuntimeEvent[] {
  return log.flatMap((l) => (l.kind === 'emit' ? [l.event] : []));
}

describe('bayes — IR 과 알고리즘', () => {
  it('스물넷 조합 모두 ppvPermille 가 같고 사양 표와 같다', () => {
    expect(data.baseRateLadder).toHaveLength(6);
    expect(data.positivesLadder).toHaveLength(4);
    for (const p of data.baseRateLadder) {
      for (const k of data.positivesLadder) {
        const ts = ppvPermille(p, k, data.sensitivityPct, data.falsePositivePct);
        const ir = runIR(bayesImperativeIR, 'ppvPermille', [p, k, data.sensitivityPct, data.falsePositivePct]);
        expect(ir).toBe(ts);
        expect(ts).toBe(TABLE[p]?.ppv[k]);
      }
    }
  });

  it('여섯 기저율 모두 firstOverHalf 가 같고 사양 표와 같다', () => {
    const maxK = Math.max(...data.positivesLadder);
    expect(maxK).toBe(3);
    for (const p of data.baseRateLadder) {
      const ts = firstOverHalf(p, 90, 10, maxK);
      expect(runIR(bayesImperativeIR, 'firstOverHalf', [p, 90, 10, maxK])).toBe(ts);
      expect(ts).toBe(TABLE[p]?.first);
    }
  });

  it('표지 — TS 는 던지고 IR 은 −1', () => {
    expect(() => ppvPermille(10, 1, 90, 7)).toThrow();
    expect(runIR(bayesImperativeIR, 'ppvPermille', [10, 1, 90, 7])).toBe(-1);
    expect(() => ppvPermille(0, 1, 90, 10)).toThrow();
    expect(runIR(bayesImperativeIR, 'ppvPermille', [0, 1, 90, 10])).toBe(-1);
    expect(() => firstOverHalf(1000, 90, 10, 3)).toThrow();
    expect(runIR(bayesImperativeIR, 'firstOverHalf', [1000, 90, 10, 3])).toBe(-1);
    expect(() => firstOverHalf(10, 90, 7, 3)).toThrow();
    expect(runIR(bayesImperativeIR, 'firstOverHalf', [10, 90, 7, 3])).toBe(-1);
    expect(likelihoodRatio(90, 10)).toBe(9);
  });

  it('정수 중간값이 2³¹ 아래', () => {
    const p = Math.max(...data.baseRateLadder);
    const k = Math.max(...data.positivesLadder);
    const num = p * 9 ** k;
    const total = num + (1000 - p);
    expect(num * 1000 + Math.floor(total / 2)).toBe(364682500);
    expect(num * 1000 + Math.floor(total / 2)).toBeLessThan(2 ** 31);
  });
});

describe('bayes — 사다리와 선언', () => {
  it('사다리가 segments[].value 와 같다', () => {
    const controls = (bayesFacet.blocks.controls as { controls: { action?: string; segments?: { value: number; default?: boolean }[] }[] })
      .controls;
    const seg = (action: string) => controls.find((c) => c.action === action)?.segments ?? [];
    expect(seg('baseRate').map((s) => s.value)).toEqual(data.baseRateLadder);
    expect(seg('positives').map((s) => s.value)).toEqual(data.positivesLadder);
    expect(seg('baseRate').find((s) => s.default)?.value).toBe(data.baseRate);
    expect(seg('positives').find((s) => s.default)?.value).toBe(data.positives);
    expect(data.baseRateLadder.at(-1)).toBe(500);
    expect(data.positivesLadder.at(-1)).toBe(3);
  });
});

describe('bayes — 걸음 차례', () => {
  it('걸음 = 2k + 1 발신, 걸음마다 바로 앞이 그 걸음의 phase, init → sleep → 첫 phase', async () => {
    const { log } = await play([
      { type: 'positives', value: 0 },
      { type: 'positives', value: 1 },
      { type: 'positives', value: 2 },
    ]);
    const evs = events(log);
    const inits = evs.map((e, i) => (e.type === 'init' ? i : -1)).filter((i) => i >= 0);
    expect(inits).toHaveLength(4);
    const expectPhase: Record<string, string> = { multiply: 'multiply', normalize: 'normalize', cross: 'cross' };
    const steps: string[][] = [];
    for (let r = 0; r < inits.length; r += 1) {
      const start = inits[r] ?? 0;
      const end = inits[r + 1] ?? evs.length;
      const round = evs.slice(start, end);
      const nonSilent = round.filter((e) => !e.silent);
      steps.push(nonSilent.map((e) => e.type));
      round.forEach((e, i) => {
        if (e.silent) return;
        const prev = round[i - 1];
        expect(prev?.type).toBe('phase');
        expect((prev?.payload as { phase: string }).phase).toBe(expectPhase[e.type]);
      });
    }
    expect(steps.map((s) => s.length)).toEqual([7, 1, 3, 5]);
    // init 바로 뒤가 sleep(stepMs + 운동), 그 뒤가 첫 phase
    const firstInit = log.findIndex((l) => l.kind === 'emit' && l.event.type === 'init');
    const afterInit = log[firstInit + 1];
    expect(afterInit).toEqual({ kind: 'sleep', ms: 1400 + 500 });
    const afterSleep = log[firstInit + 2];
    expect(afterSleep?.kind === 'emit' && afterSleep.event.type).toBe('phase');
  });

  it('기본 판의 승산 · 병일 몫이 사양 대조와 같다', async () => {
    const { log } = await play([]);
    const evs = events(log);
    const init = evs.find((e) => e.type === 'init')?.payload as Record<string, number>;
    expect([init.sick, init.healthy, init.num, init.den, init.ppvPermille]).toEqual([10, 990, 10, 990, 10]);
    const mult = evs.filter((e) => e.type === 'multiply').map((e) => (e.payload as { num: number }).num);
    expect(mult).toEqual([90, 810, 7290]);
    const norm = evs.filter((e) => e.type === 'normalize').map((e) => e.payload as Record<string, number>);
    expect(norm.map((n) => n.ppvPermille)).toEqual([83, 450, 880]);
    expect(norm.map((n) => n.healthyPermille)).toEqual([917, 550, 120]);
    const cross = evs.find((e) => e.type === 'cross')?.payload as { trail: number[]; firstOver: number };
    expect(cross.trail).toEqual([10, 83, 450, 880]);
    expect(cross.firstOver).toBe(3);
    // 두 박자의 막대 몫 — 곱하면 둘 다 줄고 나누면 합이 1
    const m1 = evs.find((e) => e.type === 'multiply')?.payload as Record<string, number>;
    expect(m1.sickShare).toBeCloseTo(0.009, 10);
    expect(m1.healthyShare).toBeCloseTo(0.099, 10);
    for (const n of norm) expect(n.sickShare + n.healthyShare).toBeCloseTo(1, 12);
    expect(norm[2]?.sickShare).toBeCloseTo(7290 / 8280, 12);
  });

  it('회차별 계기 — 1%×3 → 1%×0 → 1%×3 → 0.1%×3', async () => {
    const { rounds } = await play([
      { type: 'positives', value: 0 },
      { type: 'positives', value: 3 },
      { type: 'baseRate', value: 1 },
    ]);
    expect(rounds).toEqual([
      { 'odds-factor': 729, 'ppv-permille': 880 },
      { 'odds-factor': 1, 'ppv-permille': 10 },
      { 'odds-factor': 729, 'ppv-permille': 880 },
      { 'odds-factor': 729, 'ppv-permille': 422 },
    ]);
  });

  it('제 손잡이의 사다리 밖 값은 던지고, 남의 입력은 흘린다', async () => {
    await expect(play([{ type: 'baseRate', value: 100 }])).rejects.toThrow();
    const { log } = await play([{ type: 'somethingElse', value: 1 }]);
    // 남의 입력은 다시 대기로 흘러 새 판이 서지 않는다
    expect(events(log).filter((e) => e.type === 'init')).toHaveLength(1);
  });
});

describe('bayes — 무대', () => {
  function mountStage() {
    const container = document.createElement('div');
    const stage = mountView(bayesStageView, container, { config: {}, locale: 'en', isInstant: () => true });
    const projector = bayesProjector({ stage }, { getSpeed: () => 1, t: (_k, fb) => fb });
    return { container, projector };
  }

  it('initialData 없이 마운트해도 던지지 않는다', () => {
    expect(() => mountStage()).not.toThrow();
  });

  it('첫 그림을 두 번 먹여도 요소 수가 같다 · onReset 이 결론을 걷는다', async () => {
    const { container, projector } = mountStage();
    const { log } = await play([]);
    const evs = events(log);
    const init = evs.find((e) => e.type === 'init');
    if (!init) throw new Error('init 없음');
    projector.onEvent(init);
    const n1 = container.querySelectorAll('*').length;
    projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(n1);
    for (const e of evs) projector.onEvent(e);
    expect(container.textContent).toContain('First positive that passes half: 3');
    expect(container.textContent).toContain('88.0%');
    projector.onReset?.();
    expect(container.textContent).not.toContain('First positive');
    for (const e of evs) projector.onEvent(e);
    expect(container.querySelectorAll('circle').length).toBe(4);
  });

  it('새 판의 걸음 0 에 앞 판의 결론을 남기지 않는다', async () => {
    const { container, projector } = mountStage();
    const { log } = await play([{ type: 'baseRate', value: 1 }]);
    const evs = events(log);
    const inits = evs.map((e, i) => (e.type === 'init' ? i : -1)).filter((i) => i >= 0);
    const second = inits[1] ?? -1;
    for (const e of evs.slice(0, second + 1)) projector.onEvent(e);
    expect(container.textContent).not.toContain('First positive');
    expect(container.textContent).not.toContain('88.0%');
    expect(container.querySelectorAll('circle').length).toBe(1);
    for (const e of evs.slice(second + 1)) projector.onEvent(e);
    expect(container.textContent).toContain('Within 3 positives it does not pass half');
    expect(container.textContent).toContain('42.2%');
  });

  it('‰ 글자는 정수에서 찍는다', () => {
    expect(permilleText(83)).toBe('8.3%');
    expect(permilleText(1)).toBe('0.1%');
    expect(permilleText(1000)).toBe('100.0%');
    expect(() => permilleText(8.3)).toThrow();
  });

  it('모르는 이벤트는 던진다', () => {
    const { projector } = mountStage();
    expect(() => projector.onEvent({ type: 'mystery' })).toThrow();
  });
});
