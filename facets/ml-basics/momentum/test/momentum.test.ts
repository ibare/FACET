// @vitest-environment happy-dom
/**
 * momentum 고유의 주장 — IR ↔ algorithm 전 β, 사양 실측표 · 대조 열, 회차별 계기, phase 자리, 무대 멱등.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView } from '@ffacet/core/runtime';
import {
  momentumAlgorithm,
  momentumCore,
  momentumFacet,
  momentumImperativeIR,
  momentumStageView,
  type MomentumData,
  type MomentumStageApi,
  type MomentumStart,
  type MomentumStep,
} from '../src/index.js';

const data = momentumFacet.initialData as MomentumData;
const fx = (x: number) => x.toFixed(2);

type Emitted = { type: string; payload?: unknown; silent?: boolean };

async function play(inputs: number[]) {
  const events: Emitted[] = [];
  const metrics = new Map<string, number>();
  const snaps: Record<string, number>[] = [];
  const queue = [...inputs];
  const ctx = {
    data: { ...data },
    cancelled: false,
    async emit(e: Emitted) {
      events.push(e);
      if (e.type === 'update' && (e.payload as { final: boolean }).final) {
        snaps.push(Object.fromEntries(metrics));
      }
    },
    metric(name: string, delta: number | 'inc') {
      const d = delta === 'inc' ? 1 : delta;
      metrics.set(name, (metrics.get(name) ?? 0) + d);
    },
    async sleep() {
      return !ctx.cancelled;
    },
    async waitForInput() {
      const v = queue.shift();
      if (v === undefined) {
        ctx.cancelled = true;
        return { type: 'none' };
      }
      return { type: 'beta', payload: { value: v, segmentIndex: 0 } };
    },
    pollInput() {
      return null;
    },
  };
  await momentumAlgorithm(ctx as never);
  return { events, snaps };
}

describe('momentum — IR 과 algorithm', () => {
  it('여섯 β 모두에서 runIR 의 path · vel 이 algorithm 의 w · v 와 같다', () => {
    expect(data.betaLadder).toEqual([0, 0.6, 0.7, 0.8, 0.9, 0.95]);
    for (const beta of data.betaLadder) {
      const path = new Array<number>(data.steps + 1).fill(0);
      const vel = new Array<number>(data.steps + 1).fill(0);
      path[0] = data.w0;
      vel[0] = data.v0;
      runIR(momentumImperativeIR, 'momentumRun', [path, vel, beta, data.eta, data.flatFrom, data.bowlFrom, data.bottom]);
      expect(path.length).toBe(41);
      const run = momentumCore(data, beta);
      expect(run.updates.map((u) => u.w)).toEqual(path.slice(1));
      expect(run.updates.map((u) => u.v)).toEqual(vel.slice(1));
      for (const u of run.updates) expect(u.carried + u.pushed).toBe(u.v);
    }
  });
});

describe('momentum — 사양 실측표', () => {
  const table: Record<string, [number | null, string, string | null, number | null, string, string, number, number]> = {
    '0': [null, '1.20', null, null, '1.20', '1.90', 35, 0],
    '0.6': [null, '2.00', null, null, '2.00', '1.90', 37, 0],
    '0.7': [10, '3.81', '0.31', 26, '3.50', '1.40', 6, 13],
    '0.8': [7, '4.03', '0.53', 34, '3.52', '1.40', 3, 19],
    '0.9': [7, '4.34', '0.84', null, '3.68', '1.42', 4, 18],
    '0.95': [6, '4.77', '1.27', null, '1.74', '1.90', 26, 7],
  };
  it('β 마다 건넘@ · 가장 멀리 · 넘어선 폭 · 가라앉음@ · 끝 w · 끝 L · 두 계기', () => {
    for (const beta of data.betaLadder) {
      const { updates, summary: s } = momentumCore(data, beta);
      const last = updates[updates.length - 1]!;
      const got = [
        s.crossAt,
        fx(s.farW),
        s.overshoot === null ? null : fx(s.overshoot),
        s.settleAt,
        fx(s.endW),
        fx(s.endL),
        last.plateau,
        last.pastBottom,
      ];
      expect(got).toEqual(table[String(beta)]);
    }
  });

  it('β 0.8 의 w 열과 구간 · 가장 멀리 갱신 12', () => {
    const run = momentumCore(data, 0.8);
    const want =
      '0.20 0.56 1.05 1.64 2.11 2.49 2.79 3.17 3.55 3.83 4.00 4.03 3.95 3.79 3.61 3.44 3.32 3.26 3.26 3.30 ' +
      '3.38 3.47 3.54 3.59 3.62 3.61 3.59 3.55 3.51 3.47 3.45 3.44 3.45 3.46 3.48 3.50 3.52 3.52 3.53 3.52';
    expect(run.updates.map((u) => fx(u.w)).join(' ')).toBe(want);
    const zones = run.updates.map((u) => u.zone);
    expect(zones.slice(0, 4).every((z) => z === 'slope')).toBe(true);
    expect(zones.slice(4, 7).every((z) => z === 'flat')).toBe(true);
    expect(zones.slice(7).every((z) => z === 'bowl')).toBe(true);
    expect(run.summary.farAt).toBe(12);
  });

  it('β 0.95 의 w 열', () => {
    const want =
      '0.20 0.59 1.16 1.70 2.22 2.71 3.33 3.96 4.46 4.75 4.77 4.54 4.11 3.58 3.06 2.66 2.44 2.24 2.04 1.86 ' +
      '1.68 1.51 1.35 1.20 1.06 1.12 1.18 1.24 1.30 1.35 1.40 1.44 1.49 1.53 1.57 1.61 1.65 1.68 1.71 1.74';
    expect(momentumCore(data, 0.95).updates.map((u) => fx(u.w)).join(' ')).toBe(want);
  });

  it('평지 갱신에서 v = β·v 정확히 · 넘어선 폭은 β 에 단조 · 0.7 이 0.8 보다 먼저 가라앉는다', () => {
    for (const beta of data.betaLadder) {
      let prev = data.v0;
      for (const u of momentumCore(data, beta).updates) {
        if (u.zone === 'flat') {
          expect(u.pushed).toBe(0);
          expect(u.v).toBe(beta * prev);
        }
        prev = u.v;
      }
    }
    const over = [0.7, 0.8, 0.9, 0.95].map((b) => momentumCore(data, b).summary.overshoot!);
    for (let i = 1; i < over.length; i += 1) expect(over[i]!).toBeGreaterThan(over[i - 1]!);
    expect(momentumCore(data, 0.7).summary.settleAt!).toBeLessThan(momentumCore(data, 0.8).summary.settleAt!);
  });

  it('β 0 · 0.6 은 그릇에 닿지 않고, 기본값 0.8 은 세 구간 phase 에 다 닿는다', () => {
    for (const b of [0, 0.6]) expect(momentumCore(data, b).updates.some((u) => u.zone === 'bowl')).toBe(false);
    expect(new Set(momentumCore(data, 0.8).updates.map((u) => u.zone))).toEqual(new Set(['slope', 'flat', 'bowl']));
  });
});

describe('momentum — 재생', () => {
  it('회차별 계기 0.8 → 0 → 0.8', async () => {
    const { snaps } = await play([0, 0.8]);
    expect(snaps.map((s) => s['plateau-updates'])).toEqual([3, 35, 3]);
    expect(snaps.map((s) => s['past-bottom-updates'])).toEqual([19, 0, 19]);
  });

  it('판마다 걸음 41 · 걸음 0 앞에 phase 없음 · 갱신 걸음 바로 앞은 그 구간 phase', async () => {
    const { events } = await play([0.95]);
    const steps = events.filter((e) => !e.silent);
    expect(steps.length).toBe(82);
    const phaseOf = { slope: 'mom-slope', flat: 'mom-flat', bowl: 'mom-bowl' } as const;
    events.forEach((e, i) => {
      if (e.type === 'start') expect(i === 0 || events[i - 1]!.type !== 'phase').toBe(true);
      if (e.type === 'update') {
        const before = events[i - 1]!;
        expect(before.type).toBe('phase');
        const zone = (e.payload as MomentumStep).zone;
        expect((before.payload as { phase: string }).phase).toBe(phaseOf[zone]);
      }
    });
  });

  it('사다리가 segments 와 같다', () => {
    const controls = (momentumFacet.blocks.controls as { controls: { action: string; segments?: { value: number; default?: boolean }[] }[] })
      .controls;
    const knob = controls.find((c) => c.action === 'beta')!;
    expect(knob.segments!.map((s) => s.value)).toEqual(data.betaLadder);
    expect(knob.segments!.find((s) => s.default)!.value).toBe(data.beta);
    expect(data.betaLadder[data.betaLadder.length - 1]).toBe(0.95);
  });
});

describe('momentum — 무대', () => {
  it('β 0 판의 평지 걸음(이어 받은 몫 0)은 움직인다고 말하지 않는다', async () => {
    const { events } = await play([0]);
    const second = events.slice(events.findIndex((e, i) => i > 0 && e.type === 'start'));
    const startP = second[0]!.payload as MomentumStart;
    expect(startP.beta).toBe(0);
    const container = document.createElement('div');
    const stage = mountView(momentumStageView, container, { config: {}, isInstant: () => true }) as unknown as MomentumStageApi;
    stage.start(startP);
    let still = 0;
    for (const e of second.filter((x) => x.type === 'update')) {
      const u = e.payload as MomentumStep;
      stage.update(u, 0);
      if (u.zone === 'flat' && u.carried === 0 && !u.final) {
        still += 1;
        expect(container.textContent).toContain('no new push');
        expect(container.textContent).not.toContain('only the carried part moves w');
      }
    }
    expect(still).toBe(33);
  });

  it('start 를 두 번 먹여도 요소 수가 같고, reset 이 비운다', async () => {
    const { events } = await play([]);
    const startP = events.find((e) => e.type === 'start')!.payload as MomentumStart;
    const updates = events.filter((e) => e.type === 'update').map((e) => e.payload as MomentumStep);
    const container = document.createElement('div');
    const stage = mountView(momentumStageView, container, { config: {}, isInstant: () => true }) as unknown as MomentumStageApi;
    stage.start(startP);
    for (const u of updates) stage.update(u, 0);
    const n1 = container.querySelectorAll('*').length;
    stage.start(startP);
    for (const u of updates) stage.update(u, 0);
    expect(container.querySelectorAll('*').length).toBe(n1);
    expect(container.textContent).toContain('4.03');
    stage.start(startP);
    expect(container.textContent).not.toContain('4.03');
    stage.reset();
    expect(container.querySelectorAll('svg *').length).toBe(0);
  });
});
