import { describe, expect, it } from 'vitest';
import type { FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  drawEpsilons,
  narrowVaeData,
  trainVae,
  vaeAlgorithm,
  vaeFacet,
  vaeImperativeIR,
  type VaeData,
  type VaeSnapshot,
} from '../src/index.js';

const data = narrowVaeData(vaeFacet.initialData);
const LADDER = [0, 0.5, 1, 2];

/** 표시 규칙 — toFixed, 표시가 0 이 되는 음수는 부호를 뗀다 (비교는 ASCII 부호로). */
const f = (v: number, d = 2): string => {
  const s = v.toFixed(d);
  return Number(s) === 0 ? s.replace('-', '') : s;
};

/** IR 로 판 전부를 되풀이한 끝 무게. */
function trainByIR(d: VaeData, beta: number): number[] {
  const p = [...d.init];
  const g = new Array<number>(18).fill(0);
  const xs = d.inputs.flatMap((input) => input.x);
  const eps = drawEpsilons(d.seed, d.epochs, d.inputs.length);
  for (let ep = 0; ep < d.epochs; ep += 1) {
    runIR(vaeImperativeIR, 'trainEpoch', [xs, [...eps[ep]], p, g, beta, d.lr]);
  }
  return p;
}

/** 무게에서 μ (z = μ 의 자리) — 식은 μ = b_μ + Σ w_k x_k. */
function muOf(p: number[], x: number[]): number {
  let mu = p[4];
  for (let k = 0; k < 4; k += 1) mu = mu + p[k] * x[k];
  return mu;
}

type Run = { snapshots: VaeSnapshot[]; metrics: Record<string, number> };

/** reactive 짝을 흉내 내 알고리즘을 돌리고, 판(손잡이 값)마다 보인 모습과 계기를 모은다. */
async function play(d: VaeData, turns: number[]): Promise<Run[]> {
  const runs: Run[] = [];
  const metrics = new Map<string, number>();
  let snaps: VaeSnapshot[] = [];
  let cancelled = false;
  const queue = [...turns];
  const ctx = {
    data: d,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      if (e.type === 'init') snaps = [e.payload as VaeSnapshot];
      if (e.type === 'snapshot') snaps.push(e.payload as VaeSnapshot);
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      runs.push({ snapshots: snaps, metrics: Object.fromEntries(metrics) });
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'beta', payload: { value: next } };
    },
  };
  await vaeAlgorithm(ctx as never).catch((err: unknown) => {
    if (!cancelled) throw err;
  });
  return runs;
}

describe('vae — IR 과 algorithm 이 같은 길로 셈한다', () => {
  it('첫 ε 셋이 사양의 대조값과 같다', () => {
    expect(drawEpsilons(data.seed, 1, 3)[0].map((e) => f(e, 4))).toEqual(['0.7042', '0.7493', '-0.5178']);
  });

  for (const beta of LADDER) {
    it(`β ${beta}: trainEpoch 을 400 번 부른 끝 무게가 algorithm 의 끝 무게와 같다`, () => {
      const byIR = trainByIR(data, beta);
      const { weights } = trainVae(data, beta);
      expect(byIR).toHaveLength(18);
      byIR.forEach((w, j) => expect(Math.abs(w - weights[j])).toBeLessThan(1e-9));
    });

    it(`β ${beta}: 입력 차례를 뒤집어도 IR 과 algorithm 이 같다`, () => {
      const flipped: VaeData = { ...data, inputs: [...data.inputs].reverse() };
      const byIR = trainByIR(flipped, beta);
      const { weights } = trainVae(flipped, beta);
      byIR.forEach((w, j) => expect(Math.abs(w - weights[j])).toBeLessThan(1e-9));
    });
  }

  it('화면의 끝 μ 가 IR 끝 무게의 μ 와 같다 (β 넷 모두)', async () => {
    const runs = await play(data, [0, 0.5, 2]);
    expect(runs).toHaveLength(4);
    const order = [1, 0, 0.5, 2];
    runs.forEach((run, r) => {
      const p = trainByIR(data, order[r]);
      const last = run.snapshots[run.snapshots.length - 1];
      expect(last.epoch).toBe(400);
      last.bands.forEach((b, i) => expect(Math.abs(b.mu - muOf(p, data.inputs[i].x))).toBeLessThan(1e-9));
    });
  });
});

describe('vae — 사양 표와 대조', () => {
  const table: Record<string, { mu: string[]; sg: string[]; width: string; narrow: string; over: number; rec: string; kl: string }> = {
    '0': { mu: ['4.28', '0.07', '-4.17'], sg: ['0.29', '0.18', '0.25'], width: '8.45', narrow: '3.73', over: 0, rec: '0.03', kl: '6.92' },
    '0.5': { mu: ['1.65', '0.22', '-1.36'], sg: ['0.48', '0.34', '0.54'], width: '3.01', narrow: '0.60', over: 0, rec: '0.09', kl: '1.18' },
    '1': { mu: ['1.39', '0.28', '-1.06'], sg: ['0.58', '0.47', '0.66'], width: '2.45', narrow: '0.07', over: 0, rec: '0.15', kl: '0.76' },
    '2': { mu: ['1.04', '0.26', '-0.71'], sg: ['0.78', '0.72', '0.83'], width: '1.75', narrow: '-0.73', over: 2, rec: '0.31', kl: '0.33' },
  };
  for (const beta of LADDER) {
    it(`β ${beta}: 판 400 의 값`, () => {
      const last = trainVae(data, beta).snapshots[8];
      const row = table[String(beta)];
      expect(last.bands.map((b) => f(b.mu))).toEqual(row.mu);
      expect(last.bands.map((b) => f(b.sigma))).toEqual(row.sg);
      expect(f(last.muWidth)).toBe(row.width);
      expect(f(last.narrowestGap)).toBe(row.narrow);
      expect(last.overlapCount).toBe(row.over);
      expect(f(last.recon)).toBe(row.rec);
      expect(f(last.kl)).toBe(row.kl);
      expect(last.order).toEqual(['C', 'B', 'A']);
    });
  }

  it('되돌린 칸 — β 0 · β 2 의 판 400', () => {
    const cells = (beta: number) => trainVae(data, beta).snapshots[8].cells.map((c) => c.q.map((v) => f(v)).join(' '));
    expect(cells(0)).toEqual(['0.99 1.00 0.01 0.00', '0.09 0.92 0.91 0.08', '0.00 0.01 1.00 0.99']);
    expect(cells(2)).toEqual(['0.68 0.94 0.32 0.06', '0.37 0.82 0.63 0.18', '0.10 0.46 0.90 0.54']);
  });

  it('β 1 의 걸음 아홉', () => {
    const snaps = trainVae(data, 1).snapshots;
    expect(snaps.map((s) => s.epoch)).toEqual([0, 50, 100, 150, 200, 250, 300, 350, 400]);
    expect(snaps.map((s) => s.overlapCount)).toEqual([2, 2, 1, 1, 0, 2, 1, 1, 0]);
    expect(snaps.map((s) => f(s.recon))).toEqual(['0.62', '0.40', '0.28', '0.24', '0.19', '0.20', '0.18', '0.15', '0.15']);
    expect(snaps.map((s) => f(s.kl))).toEqual(['0.16', '0.48', '0.66', '0.64', '0.72', '0.63', '0.55', '0.65', '0.76']);
    expect(snaps[0].cells.map((c) => c.q.map((v) => f(v)).join(' '))).toEqual([
      '0.59 0.53 0.47 0.41',
      '0.50 0.50 0.50 0.50',
      '0.41 0.47 0.53 0.59',
    ]);
    // 판 100 의 C·B 틈은 표시 0.00 이지만 셈한 값이 양수라 겹치지 않는다
    const cb = snaps[2].gaps[0];
    expect([cb.left, cb.right, f(cb.gap), cb.overlap]).toEqual(['C', 'B', '0.00', false]);
    expect(cb.gap).toBeGreaterThan(0);
  });

  it('모든 β · 걸음 1..8 에서 늘어선 차례가 C · B · A', () => {
    for (const beta of LADDER) {
      for (const s of trainVae(data, beta).snapshots.slice(1)) expect(s.order).toEqual(['C', 'B', 'A']);
    }
  });
});

describe('vae — 회차별 계기 (A → B → A)', () => {
  it('β 1 → 2 → 1 — 판마다 판 400 · 겹친 이웃 0 · 2 · 0', async () => {
    const runs = await play(data, [2, 1]);
    expect(runs.map((r) => r.metrics)).toEqual([
      { epoch: 400, 'overlap-pairs': 0 },
      { epoch: 400, 'overlap-pairs': 2 },
      { epoch: 400, 'overlap-pairs': 0 },
    ]);
    expect(runs.map((r) => r.snapshots.length)).toEqual([9, 9, 9]);
  });
});

describe('vae — 사다리', () => {
  it('betaLadder 가 segments[].value 와 같고 끝값 · 매개변수 길이가 사양대로', () => {
    const controls = (vaeFacet.blocks.controls as { controls: unknown[] }).controls;
    const slider = controls.find(
      (c): c is { action: string; segments: { value: number }[] } =>
        typeof c === 'object' && c !== null && (c as { action?: unknown }).action === 'beta',
    );
    expect(slider?.segments.map((s) => s.value)).toEqual(data.betaLadder);
    expect(data.betaLadder[0]).toBe(0);
    expect(data.betaLadder[data.betaLadder.length - 1]).toBe(2);
    expect(data.init).toHaveLength(18);
    expect(vaeImperativeIR.functions[0].params.map((p) => p.name)).toEqual(['xs', 'eps', 'p', 'g', 'beta', 'lr']);
  });
});
