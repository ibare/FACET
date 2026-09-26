// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView } from '@ffacet/core/runtime';
import {
  denoiseStep,
  diffusionAlgorithm,
  diffusionFacet,
  diffusionImperativeIR,
  diffusionStageView,
  formatNumber,
  nearest,
  readDiffusionData,
  runDiffusionRound,
  type DiffusionStage,
} from '../src/index.js';

const data = readDiffusionData(diffusionFacet.initialData);
const fmtPt = (p: number[]): string => `[${formatNumber(p[0]!, 2)}, ${formatNumber(p[1]!, 2)}]`;

/** sim.py diffusion 의 대조값 (사양 표). */
const SPEC: Record<number, { beta: string; reached: number; ends: string[]; near: string[] }> = {
  1: {
    beta: '0.950',
    reached: 0,
    ends: ['[0.94, −0.23]', '[−1.12, 0.28]', '[0.42, −0.10]', '[0.00, 0.00]', '[−0.80, 0.20]'],
    near: ['Q 0.68', 'P 0.49', 'Q 1.22', 'P 1.65', 'P 0.82'],
  },
  2: {
    beta: '0.776',
    reached: 0,
    ends: ['[0.79, −0.20]', '[−1.08, 0.27]', '[−0.20, 0.05]', '[1.49, −0.37]', '[−0.11, 0.03]'],
    near: ['Q 0.84', 'P 0.53', 'P 1.44', 'Q 0.11', 'P 1.54'],
  },
  5: {
    beta: '0.451',
    reached: 3,
    ends: ['[−1.21, 0.30]', '[−1.60, 0.40]', '[−0.27, 0.07]', '[1.60, −0.40]', '[1.60, −0.40]'],
    near: ['P 0.40', 'P 0.00', 'P 1.37', 'Q 0.00', 'Q 0.00'],
  },
  10: {
    beta: '0.259',
    reached: 4,
    ends: ['[−1.60, 0.40]', '[−1.44, 0.36]', '[−1.60, 0.40]', '[1.60, −0.40]', '[−1.60, 0.40]'],
    near: ['P 0.00', 'P 0.17', 'P 0.00', 'Q 0.00', 'P 0.00'],
  },
  20: {
    beta: '0.139',
    reached: 5,
    ends: ['[−1.60, 0.40]', '[−1.60, 0.40]', '[−1.60, 0.40]', '[1.60, −0.40]', '[1.60, −0.40]'],
    near: ['P 0.00', 'P 0.00', 'P 0.00', 'Q 0.00', 'Q 0.00'],
  },
};
const X_T = ['[1.60, −0.74]', '[−2.33, −0.11]', '[0.91, 0.81]', '[0.16, 0.64]', '[−1.44, 0.07]'];

describe('diffusion — 사다리 · 데이터', () => {
  it('사다리가 segments 와 같고 tStepMs 가 짝이 맞다', () => {
    const controls = (diffusionFacet.blocks.controls as { controls: unknown[] }).controls;
    const knob = controls.find(
      (c): c is { action: string; segments: { value: number; default?: boolean }[] } =>
        typeof c === 'object' && c !== null && (c as { action?: unknown }).action === 'steps',
    );
    expect(knob).toBeDefined();
    expect(knob!.segments.map((s) => s.value)).toEqual(data.stepsLadder);
    expect(knob!.segments.find((s) => s.default)?.value).toBe(data.defaultSteps);
    expect(data.stepsLadder).toEqual([1, 2, 5, 10, 20]);
    expect(data.stepsLadder[data.stepsLadder.length - 1]).toBe(20);
    expect(data.tStepMs).toHaveLength(data.stepsLadder.length);
    expect(data.seeds).toHaveLength(5);
  });
});

describe('diffusion — 사양 표 대조', () => {
  for (const T of [1, 2, 5, 10, 20]) {
    it(`T ${T}: β · 끝 x₀ · 가까운 자료 · 닿음`, () => {
      const round = runDiffusionRound(data, T);
      const spec = SPEC[T]!;
      expect(formatNumber(round.beta, 3)).toBe(spec.beta);
      expect(round.samples.map((s) => fmtPt(s.xT))).toEqual(X_T);
      expect(round.samples.map((s) => fmtPt(s.end))).toEqual(spec.ends);
      expect(round.samples.map((s) => `${s.nearestSide} ${formatNumber(s.distance, 2)}`)).toEqual(spec.near);
      expect(round.samples.filter((s) => s.reached).length).toBe(spec.reached);
      for (const s of round.samples) expect(s.trail).toHaveLength(T);
    });
  }

  it('T 5 의 w_P 차례가 사양과 같다', () => {
    const round = runDiffusionRound(data, 5);
    const byT = [0, 1, 2, 3, 4].map((k) => round.samples.map((s) => s.trail[k]!.wP.toFixed(2)).join(' '));
    expect(byT).toEqual([
      '0.21 0.85 0.37 0.50 0.75',
      '0.25 0.82 0.47 0.20 0.64',
      '0.10 0.76 0.36 0.12 0.30',
      '0.10 0.87 0.43 0.01 0.01',
      '0.88 1.00 0.59 0.00 0.00',
    ]);
  });
});

describe('diffusion — IR 과 알고리즘이 같은 답', () => {
  const runStep = (
    xt: number[],
    p: number[],
    q: number[],
    ab: number,
    beta: number,
    z: number[],
    tIndex: number,
  ): { wP: number; x0Hat: number[]; xPrev: number[] } => {
    const x0Hat = [0, 0];
    const xPrev = [0, 0];
    const wP = runIR(diffusionImperativeIR, 'denoiseStep', [xt, p, q, ab, beta, z, tIndex, x0Hat, xPrev]) as number;
    return { wP, x0Hat, xPrev };
  };

  for (const T of [1, 2, 5, 10, 20]) {
    it(`T ${T}: 모든 표본 · 모든 t 에서 denoiseStep · nearest 가 같다 (P · Q 맞바꿔도)`, () => {
      const round = runDiffusionRound(data, T);
      for (const s of round.samples) {
        for (const r of s.trail) {
          const ir = runStep([...r.x], data.dataP, data.dataQ, r.alphaBar, round.beta, [...r.noise], r.tIndex);
          expect(Math.abs(ir.wP - r.wP)).toBeLessThan(1e-12);
          for (let i = 0; i < 2; i += 1) {
            expect(Math.abs(ir.x0Hat[i]! - r.x0Hat[i]!)).toBeLessThan(1e-12);
            expect(Math.abs(ir.xPrev[i]! - r.xPrev[i]!)).toBeLessThan(1e-12);
          }
          // P · Q 를 맞바꿔도 알고리즘과 IR 이 같다
          const algoX0 = [0, 0];
          const algoPrev = [0, 0];
          const algoW = denoiseStep([...r.x], data.dataQ, data.dataP, r.alphaBar, round.beta, [...r.noise], r.tIndex, algoX0, algoPrev);
          const sw = runStep([...r.x], data.dataQ, data.dataP, r.alphaBar, round.beta, [...r.noise], r.tIndex);
          expect(Math.abs(sw.wP - algoW)).toBeLessThan(1e-12);
          for (let i = 0; i < 2; i += 1) {
            expect(Math.abs(sw.x0Hat[i]! - algoX0[i]!)).toBeLessThan(1e-12);
            expect(Math.abs(sw.xPrev[i]! - algoPrev[i]!)).toBeLessThan(1e-12);
          }
        }
        const d = runIR(diffusionImperativeIR, 'nearest', [[...s.end], data.dataP, data.dataQ]) as number;
        expect(Math.abs(d - s.distance)).toBeLessThan(1e-12);
        expect(Math.abs(nearest(s.end, data.dataP, data.dataQ) - s.distance)).toBeLessThan(1e-12);
      }
    });
  }
});

describe('diffusion — 회차별 계기 (A → B → A)', () => {
  it('판 끝 값이 사양 표와 같다', () => {
    const table: Record<number, [number, number]> = { 1: [1, 0], 2: [2, 0], 5: [5, 3], 10: [10, 4], 20: [20, 5] };
    for (const T of [5, 20, 5, 1, 10, 2]) {
      const round = runDiffusionRound(data, T);
      const denoise = round.samples[0]!.trail.length;
      const settled = round.samples.filter((s) => s.reached).length;
      expect([denoise, settled]).toEqual(table[T]);
    }
  });
});

describe('diffusion — 무대', () => {
  it('initialData 없이 마운트되어도 던지지 않고, 판을 그린다', () => {
    const container = document.createElement('div');
    const inst = mountView(diffusionStageView, container, { config: {} }) as unknown as DiffusionStage;
    inst.init({
      plane: { ...data.plane },
      dataP: [-1.6, 0.4],
      dataQ: [1.6, -0.4],
      sampleCount: 5,
    });
    const round = runDiffusionRound(data, 2);
    inst.startRound({ steps: 2, beta: round.beta, xT: round.samples.map((s) => s.xT), motionMs: 0 });
    inst.reverseStep({
      tIndex: 2,
      tNext: 1,
      x0Hat: round.samples.map((s) => s.trail[0]!.x0Hat),
      xPrev: round.samples.map((s) => s.trail[0]!.xPrev),
      motionMs: 0,
    });
    inst.settle({
      distance: round.samples.map((s) => s.distance),
      nearest: round.samples.map((s) => s.nearestSide),
      reached: round.samples.map((s) => s.reached),
      reachedCount: 0,
      motionMs: 0,
    });
    expect(container.textContent).toContain('0/5');
    inst.destroy();
  });
});

describe('diffusion — 되짚기 기준으로 걸음마다 켜지는 phase', () => {
  /** 자취처럼 silent 아닌 발신에서 걸음을 끊고, 걸음마다 마지막 phase 를 읽는다. */
  async function phasesPerStep(steps: number): Promise<(string | null)[]> {
    const events: { type: string; payload?: unknown; silent?: boolean }[] = [];
    let cancelled = false;
    let inputs = 0;
    const ctx = {
      data: { ...(diffusionFacet.initialData as object), defaultSteps: steps },
      get cancelled() {
        return cancelled;
      },
      emit: async (e: { type: string; payload?: unknown; silent?: boolean }) => {
        events.push(e);
      },
      metric: () => {},
      sleep: async () => true,
      pollInput: () => null,
      waitForInput: async () => {
        inputs += 1;
        cancelled = true;
        return { type: 'none' };
      },
    };
    await diffusionAlgorithm(ctx as never);
    expect(inputs).toBe(1);
    const out: (string | null)[] = [];
    let last: string | null = null;
    for (const e of events) {
      if (e.type === 'phase') last = (e.payload as { phase: string }).phase;
      if (e.silent !== true) {
        out.push(last);
        last = null;
      }
    }
    return out;
  }

  for (const T of [1, 2, 5, 10, 20]) {
    it(`T ${T}: 걸음 0 없음 · t 걸음 reverse · 끝 걸음 settle`, async () => {
      const got = await phasesPerStep(T);
      expect(got).toEqual([null, ...Array.from({ length: T }, () => 'reverse'), 'settle']);
    });
  }
});
