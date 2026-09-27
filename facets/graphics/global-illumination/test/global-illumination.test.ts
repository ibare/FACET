// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { getColors, makeTranslator, mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  computeGlobalIllumination,
  globalIlluminationAlgorithm,
  globalIlluminationData,
  globalIlluminationFacet,
  globalIlluminationImperativeIR,
  globalIlluminationProjector,
  globalIlluminationStageView,
  narrowGlobalIllumination,
  GLOBAL_ILLUMINATION_MOTION_MS,
  type GlobalIlluminationData,
  type GlobalIlluminationPatch,
} from '../src/index.js';

/** measure.py 대조표 — 사양의 "손잡이 값마다 화면의 수" */
const TABLE: Record<string, { k: number; floor: string; f1: string[]; bleed: string; floorRed: number; floor1: string }> = {
  '0.2': { k: 4, floor: '0.045', f1: ['0.043', '0.042', '0.041'], bleed: '0.003', floorRed: 3, floor1: '0.044' },
  '0.5': { k: 5, floor: '0.126', f1: ['0.129', '0.117', '0.106'], bleed: '0.023', floorRed: 23, floor1: '0.110' },
  '0.6': { k: 6, floor: '0.159', f1: ['0.168', '0.149', '0.130'], bleed: '0.038', floorRed: 38, floor1: '0.132' },
  '0.75': { k: 7, floor: '0.220', f1: ['0.243', '0.208', '0.168'], bleed: '0.075', floorRed: 75, floor1: '0.164' },
  '0.85': { k: 8, floor: '0.272', f1: ['0.313', '0.259', '0.197'], bleed: '0.116', floorRed: 116, floor1: '0.186' },
};

/** ρ 0.6 한 판의 걸음별 수 */
const RHO06 = [
  { added: '0.751', acc: '0.751', floor: '0.132', bleed: '0.000' },
  { added: '0.271', acc: '1.022', floor: '0.141', bleed: '0.019' },
  { added: '0.104', acc: '1.126', floor: '0.155', bleed: '0.030' },
  { added: '0.041', acc: '1.167', floor: '0.157', bleed: '0.035' },
  { added: '0.016', acc: '1.183', floor: '0.159', bleed: '0.037' },
  { added: '0.007', acc: '1.190', floor: '0.159', bleed: '0.038' },
];

function f3(x: number): string {
  const r = (Math.sign(x) * Math.round(Math.abs(x) * 1000)) / 1000;
  return (r === 0 ? 0 : r).toFixed(3);
}

const data = narrowGlobalIllumination(globalIlluminationData);

type IrBuffers = { ax: number[]; ay: number[]; bx: number[]; by: number[]; reflect: number[]; emission: number[] };

function irBuffers(d: GlobalIlluminationData, patches: GlobalIlluminationPatch[], rho: number): IrBuffers {
  const n = patches.length;
  const reflect = new Array<number>(3 * n).fill(0);
  const emission = new Array<number>(3 * n).fill(0);
  patches.forEach((p, i) => {
    for (let c = 0; c < 3; c += 1) {
      reflect[c * n + i] = rho * d.tints[p.kind][c];
      if (d.emitters.includes(p.id)) emission[c * n + i] = d.emission[c];
    }
  });
  return {
    ax: patches.map((p) => p.a[0]),
    ay: patches.map((p) => p.a[1]),
    bx: patches.map((p) => p.b[0]),
    by: patches.map((p) => p.b[1]),
    reflect,
    emission,
  };
}

function runRadiosity(d: GlobalIlluminationData, patches: GlobalIlluminationPatch[], rho: number, maxBounces: number) {
  const n = patches.length;
  const b = irBuffers(d, patches, rho);
  const prevB = new Array<number>(3 * n).fill(0);
  const nextB = new Array<number>(3 * n).fill(0);
  const factors = new Array<number>(n * n).fill(0);
  const k = runIR(globalIlluminationImperativeIR, 'radiosity', [
    b.ax, b.ay, b.bx, b.by, n, b.reflect, b.emission, factors, prevB, nextB, d.tolerance, maxBounces,
  ]);
  return { k, prevB, factors };
}

describe('global-illumination — 데이터와 사다리', () => {
  it('사다리가 segments 와 같고 기본값이 initialRho 다', () => {
    const controls = (globalIlluminationFacet.blocks.controls as { controls: unknown[] }).controls;
    const knob = controls.find(
      (c): c is { action: string; segments: { value: number; default?: boolean }[] } =>
        typeof c === 'object' && c !== null && (c as { action?: unknown }).action === 'reflectance',
    );
    expect(knob).toBeDefined();
    expect(knob?.segments.map((s) => s.value)).toEqual(data.rhos);
    expect(knob?.segments.find((s) => s.default === true)?.value).toBe(data.initialRho);
    expect(data.rhos).toHaveLength(5);
    expect(data.rhos[data.rhos.length - 1]).toBe(0.85);
    expect(data.patches).toHaveLength(16);
  });

  it('형태 계수 — 패치마다 합 1, 대칭, 같은 벽끼리 0', () => {
    const run = computeGlobalIllumination(data, 0.6);
    const F = run.formFactors;
    for (let i = 0; i < 16; i += 1) {
      expect(F[i].reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12);
      for (let j = 0; j < 16; j += 1) {
        expect(F[i][j]).toBeCloseTo(F[j][i], 12);
        if (data.patches[i].kind === data.patches[j].kind) expect(F[i][j]).toBe(0);
      }
    }
    expect(f3(F[0][12])).toBe('0.293'); // f1 → l1
  });
});

describe('global-illumination — 사양 표 대조', () => {
  it.each(Object.keys(TABLE))('ρ %s — 멈춘 튐 · 끝 바닥 평균 · f1 · R − B · 계기', (key) => {
    const rho = Number(key);
    const want = TABLE[key];
    const run = computeGlobalIllumination(data, rho);
    const last = run.steps[run.steps.length - 1];
    expect(run.converged).toBe(want.k);
    expect(run.steps).toHaveLength(want.k);
    expect(f3(last.floorMean)).toBe(want.floor);
    expect(last.probeRgb.map(f3)).toEqual(want.f1);
    expect(f3(last.bleed)).toBe(want.bleed);
    expect(run.floorRed).toBe(want.floorRed);
    expect(f3(run.steps[0].floorMean)).toBe(want.floor1);
    // 튐 1 의 바닥은 무채색, A 는 튐마다 엄격히 준다, 바닥 평균은 튐마다 오른다
    expect(run.steps[0].bleed).toBe(0);
    for (let s = 1; s < run.steps.length; s += 1) {
      expect(run.steps[s].added).toBeLessThan(run.steps[s - 1].added);
      expect(run.steps[s].floorMean).toBeGreaterThan(run.steps[s - 1].floorMean);
    }
    // 동률 · 경계 — 멈춘 튐은 경계 아래로 넉넉히, 그 앞 튐은 위로 넉넉히
    expect(last.added / (data.tolerance * last.accumulated)).toBeLessThan(0.8);
    const before = run.steps[run.steps.length - 2];
    expect(before.added / (data.tolerance * before.accumulated)).toBeGreaterThan(1.3);
  });

  it('ρ 0.6 한 판의 걸음별 수', () => {
    const run = computeGlobalIllumination(data, 0.6);
    expect(
      run.steps.map((s) => ({ added: f3(s.added), acc: f3(s.accumulated), floor: f3(s.floorMean), bleed: f3(s.bleed) })),
    ).toEqual(RHO06);
  });

  it('ρ 를 올리면 K · 끝 바닥 평균 · 끝 R − B 가 모두 엄격히 는다', () => {
    const runs = data.rhos.map((r) => computeGlobalIllumination(data, r));
    for (let i = 1; i < runs.length; i += 1) {
      const a = runs[i - 1];
      const b = runs[i];
      expect(b.converged).toBeGreaterThan(a.converged);
      expect(b.steps[b.steps.length - 1].floorMean).toBeGreaterThan(a.steps[a.steps.length - 1].floorMean);
      expect(b.steps[b.steps.length - 1].bleed).toBeGreaterThan(a.steps[a.steps.length - 1].bleed);
    }
  });

  it('사다리 밖 ρ 와 모이지 않는 판은 던진다', () => {
    expect(() => computeGlobalIllumination(data, 0.3)).toThrow(/사다리/);
    expect(() => computeGlobalIllumination({ ...data, maxBounces: 3 }, 0.6)).toThrow(/모이지 않았다/);
  });
});

describe('global-illumination — IR ↔ algorithm', () => {
  it.each(data.rhos)('ρ %s — 멈춘 튐과 끝 B 가 같다', (rho) => {
    const run = computeGlobalIllumination(data, rho);
    const { k, prevB, factors } = runRadiosity(data, data.patches, rho, data.maxBounces);
    expect(k).toBe(run.converged);
    const last = run.steps[run.steps.length - 1];
    for (let i = 0; i < 16; i += 1) {
      for (let c = 0; c < 3; c += 1) expect(Math.abs(prevB[c * 16 + i] - last.light[i][c])).toBeLessThan(1e-12);
      for (let j = 0; j < 16; j += 1) expect(Math.abs(factors[i * 16 + j] - run.formFactors[i][j])).toBeLessThan(1e-12);
    }
  });

  it.each(data.rhos)('ρ %s — 패치 차례를 거꾸로 주어도 같은 패치의 값이 같다', (rho) => {
    const run = computeGlobalIllumination(data, rho);
    const reversed = [...data.patches].reverse();
    const { k, prevB } = runRadiosity(data, reversed, rho, data.maxBounces);
    expect(k).toBe(run.converged);
    const last = run.steps[run.steps.length - 1];
    reversed.forEach((p, ri) => {
      const i = data.patches.findIndex((q) => q.id === p.id);
      for (let c = 0; c < 3; c += 1) expect(Math.abs(prevB[c * 16 + ri] - last.light[i][c])).toBeLessThan(1e-12);
    });
  });

  it('maxBounces 3 — IR 은 −1, TS 는 던진다', () => {
    expect(runRadiosity(data, data.patches, 0.6, 3).k).toBe(-1);
    expect(() => computeGlobalIllumination({ ...data, maxBounces: 3 }, 0.6)).toThrow();
  });
});

type Record_ = { kind: 'emit'; event: FacetRuntimeEvent } | { kind: 'sleep'; ms: number } | { kind: 'metric'; name: string; delta: number };

/** 가짜 reactive ctx — 입력을 차례로 주고, 다 쓰면 취소한다 */
async function drive(inputs: number[]) {
  const log: Record_[] = [];
  const queue = [...inputs];
  const state = { cancelled: false };
  const ctx = {
    data: globalIlluminationData,
    get cancelled() {
      return state.cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      log.push({ kind: 'emit', event });
    },
    metric(name: string, delta: number | 'inc') {
      if (typeof delta !== 'number') throw new Error('inc 는 쓰지 않는다');
      log.push({ kind: 'metric', name, delta });
    },
    async sleep(ms: number) {
      log.push({ kind: 'sleep', ms });
      return true;
    },
    async waitForInput() {
      const v = queue.shift();
      if (v === undefined) {
        state.cancelled = true;
        return { type: 'none' };
      }
      return { type: 'reflectance', payload: { value: v } };
    },
    pollInput() {
      return null;
    },
  };
  await globalIlluminationAlgorithm(ctx as unknown as FacetContext<GlobalIlluminationData>);
  return log;
}

function runsOf(log: Record_[]) {
  const runs: Record_[][] = [];
  for (const r of log) {
    if (r.kind === 'emit' && r.event.type === 'init') runs.push([]);
    runs[runs.length - 1].push(r);
  }
  return runs;
}

describe('global-illumination — 걸음 · phase · 계기', () => {
  it('init → sleep(stepMs + motion) → 첫 phase → 첫 걸음, 걸음마다 바로 앞이 그 걸음의 phase', async () => {
    const log = await drive([]);
    expect(log[0]).toMatchObject({ kind: 'emit', event: { type: 'init', silent: true } });
    const firstSleep = log.findIndex((r) => r.kind === 'sleep');
    const firstPhase = log.findIndex((r) => r.kind === 'emit' && r.event.type === 'phase');
    expect(log[firstSleep]).toEqual({ kind: 'sleep', ms: data.stepMs + GLOBAL_ILLUMINATION_MOTION_MS });
    expect(firstSleep).toBeLessThan(firstPhase);
    const emits = log.filter((r): r is Extract<Record_, { kind: 'emit' }> => r.kind === 'emit').map((r) => r.event);
    emits.forEach((e, i) => {
      if (e.type === 'bounce' || e.type === 'converged') {
        expect(e.silent).not.toBe(true);
        expect(emits[i - 1]).toMatchObject({ type: 'phase', payload: { phase: e.type }, silent: true });
      }
    });
    expect(emits.filter((e) => e.type === 'bounce')).toHaveLength(6);
    // 재생 길이 — init 뒤 1800 + 걸음 사이 K × 1200 = 9.0 초
    const slept = log.reduce((s, r) => s + (r.kind === 'sleep' ? r.ms : 0), 0);
    expect(slept).toBe(9000);
  });

  it('계기는 회차마다 사양 값 (A → B → A)', async () => {
    const log = await drive([0.2, 0.85, 0.2, 0.6]);
    const runs = runsOf(log);
    expect(runs).toHaveLength(5);
    const totals = new Map<string, number>();
    const seen: Record<string, number>[] = [];
    for (const run of runs) {
      for (const r of run) if (r.kind === 'metric') totals.set(r.name, (totals.get(r.name) ?? 0) + r.delta);
      seen.push({ bounces: totals.get('bounces') ?? NaN, floorRed: totals.get('floor-red') ?? NaN });
    }
    expect(seen).toEqual(['0.6', '0.2', '0.85', '0.2', '0.6'].map((k) => ({ bounces: TABLE[k].k, floorRed: TABLE[k].floorRed })));
    // 첫 판에 계기 둘이 모두 실린다 (처음 한 번은 0 이어도)
    const firstNames = runs[0].filter((r) => r.kind === 'metric').map((r) => (r.kind === 'metric' ? r.name : ''));
    expect(new Set(firstNames)).toEqual(new Set(['bounces', 'floor-red']));
  });

  it('제 type 인데 사다리 밖 값이면 던진다', async () => {
    await expect(drive([0.3])).rejects.toThrow(/사다리/);
  });
});

describe('global-illumination — 무대', () => {
  async function mounted() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(globalIlluminationStageView, container, {
      config: {},
      locale: 'ko',
      theme: 'light',
      t: makeTranslator('ko', globalIlluminationFacet.messages),
    });
    const project = globalIlluminationProjector({ stage });
    const log = await drive([0.85]);
    const events = log.filter((r): r is Extract<Record_, { kind: 'emit' }> => r.kind === 'emit').map((r) => r.event);
    return { container, project, events };
  }

  it('첫 그림(silent init)을 두 번 먹여도 요소 수가 같다', async () => {
    const { container, project, events } = await mounted();
    project.onEvent(events[0]);
    const once = container.querySelectorAll('*').length;
    project.onEvent(events[0]);
    expect(container.querySelectorAll('*').length).toBe(once);
  });

  it('새 판 걸음 0 에 앞 판의 결론(수 · 선 · 멈춤 표지)을 남기지 않고, 앞 판 막대 끝은 점선으로 남긴다', async () => {
    const { container, project, events } = await mounted();
    const secondInit = events.findIndex((e, i) => i > 0 && e.type === 'init');
    for (const e of events.slice(0, secondInit)) project.onEvent(e);
    const before = container.textContent ?? '';
    expect(before).toContain('멈춤: 튐 6');
    expect(before).toContain('0.038');
    const dashedBefore = container.querySelectorAll('[stroke-dasharray="3 2"]').length;
    project.onEvent(events[secondInit]);
    const after = container.textContent ?? '';
    expect(after).not.toContain('멈춤: 튐');
    expect(after).not.toContain('0.038');
    expect(after).not.toContain('0.159');
    expect(after).toContain('ρ 0.85');
    expect(container.querySelectorAll('[stroke-dasharray="3 2"]').length).toBeGreaterThan(dashedBefore);
    // 걸음 0 의 막대 — 빛 패치 말고는 빛이 0 이므로 길이 0 으로 줄어 간다 (운동 끝 = E 의 자리)
    const polyline = container.querySelector('polyline');
    expect(polyline?.getAttribute('points')?.split(' ')).toHaveLength(1);
  });

  it('onReset 이 무대를 비운다', async () => {
    const { container, project, events } = await mounted();
    for (const e of events.slice(0, 5)) project.onEvent(e);
    project.onReset?.();
    expect(container.textContent).toBe('');
    expect(container.querySelectorAll('polygon, polyline, rect, line, circle').length).toBe(0);
  });

  it('칠하는 색은 셈한 빛을 1 로 자른 값이고 팔레트의 글자 색이 아니다', async () => {
    const { container, project, events } = await mounted();
    for (const e of events) {
      project.onEvent(e);
      if (e.type === 'converged') break;
    }
    const fills = [...container.querySelectorAll('rect')].map((r) => r.getAttribute('fill'));
    expect(fills).toContain('rgb(255, 255, 255)'); // 빛 패치 (1.14 → 1)
    expect(fills).not.toContain(getColors('light').text);
  });
});
