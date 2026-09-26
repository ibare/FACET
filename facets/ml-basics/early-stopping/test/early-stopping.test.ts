// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  earlyStoppingAlgorithm,
  earlyStoppingFacet,
  earlyStoppingImperativeIR,
  earlyStoppingProjector,
  earlyStoppingStageView,
  runEarlyStop,
  valLoss,
  type EarlyStoppingData,
} from '../src/index.js';

const data = earlyStoppingFacet.initialData as unknown as EarlyStoppingData;

/** IR 인자 — 펼친 목록과 버퍼. */
function irArgs(d: EarlyStoppingData, patience: number) {
  const f = d.train[0]!.x.length;
  const w = new Array<number>(f).fill(0);
  const bestW = new Array<number>(f).fill(0);
  const marks = [0, 0];
  const args = [
    d.train.flatMap((p) => p.x),
    d.train.map((p) => p.y),
    d.val.flatMap((p) => p.x),
    d.val.map((p) => p.y),
    d.orders.flat(),
    d.orders.length,
    f,
    d.eta,
    patience,
    w,
    bestW,
    marks,
  ];
  return { args, w, marks };
}

function runIr(d: EarlyStoppingData, patience: number) {
  const { args, w, marks } = irArgs(d, patience);
  const ret = runIR(earlyStoppingImperativeIR, 'earlyStop', args);
  if (typeof ret !== 'number') throw new Error('IR 이 수를 돌려주지 않았다');
  return { ret, w, marks };
}

/** 훈련 점의 자리를 섞고 차례를 그에 맞춰 옮긴다 (sim.py 와 같은 perm). */
function shuffled(d: EarlyStoppingData): EarlyStoppingData {
  const perm = [3, 7, 0, 9, 5, 1, 8, 2, 6, 4];
  const inv = new Map(perm.map((old, now) => [old, now]));
  return {
    ...d,
    train: perm.map((old) => d.train[old]!),
    orders: d.orders.map((o) => o.map((i) => inv.get(i)!)),
  };
}

const TABLE = [
  { p: 1, stop: 6, best: 5, val: '0.626', steps: 8, w: '1.10 -1.06 0.51 0.37 0.30 0.38 0.15 -0.11' },
  { p: 2, stop: 11, best: 9, val: '0.485', steps: 13, w: '1.37 -1.13 0.71 0.24 0.12 0.40 0.10 -0.04' },
  { p: 3, stop: 17, best: 14, val: '0.440', steps: 19, w: '1.65 -1.16 0.84 0.14 0.02 0.41 0.16 0.15' },
  { p: 5, stop: 19, best: 14, val: '0.440', steps: 21, w: '1.65 -1.16 0.84 0.14 0.02 0.41 0.16 0.15' },
  { p: 8, stop: 22, best: 14, val: '0.440', steps: 24, w: '1.65 -1.16 0.84 0.14 0.02 0.41 0.16 0.15' },
];

const CURVE =
  '2.908 1.355 1.176 0.775 0.668 0.626 0.736 0.501 0.571 0.485 0.549 0.520 0.475 0.443 0.440 0.500 0.463 0.488 0.490 0.501 0.544 0.541 0.495';

describe('early-stopping — 자료와 선언', () => {
  it('사다리 = 손잡이 구간 값, 기본값 = initialData.patience', () => {
    const bar = earlyStoppingFacet.blocks.controls as { controls: { action?: string; segments?: { value: number; default?: boolean }[] }[] };
    const knob = bar.controls.find((c) => c.action === 'patience');
    expect(knob?.segments?.map((s) => s.value)).toEqual(data.patienceLadder);
    expect(knob?.segments?.find((s) => s.default === true)?.value).toBe(data.patience);
    expect(data.patienceLadder).toEqual([1, 2, 3, 5, 8]);
  });

  it('차례는 22 줄 · 줄마다 0 … 9 의 순열 · 훈련 열 · 검증 스물 · 특징 여덟', () => {
    expect(data.orders).toHaveLength(22);
    for (const o of data.orders) expect([...o].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(data.train).toHaveLength(10);
    expect(data.val).toHaveLength(20);
    for (const p of [...data.train, ...data.val]) expect(p.x).toHaveLength(8);
  });
});

describe('early-stopping — 사양 표 대조', () => {
  it('검증 곡선 에폭 0 … 22 (셋째 자리)', () => {
    const r = runEarlyStop(data, 8);
    expect(r.records.map((x) => x.val.toFixed(3)).join(' ')).toBe(CURVE);
  });

  it.each(TABLE)('참을성 $p — 멈춘 에폭 · 가장 좋던 에폭 · 되돌린 검증 · 걸음 수 · 되돌린 무게', (row) => {
    const r = runEarlyStop(data, row.p);
    expect(r.stopEpoch).toBe(row.stop);
    expect(r.bestEpoch).toBe(row.best);
    expect(r.bestVal.toFixed(3)).toBe(row.val);
    expect(r.records.length + 1).toBe(row.steps);
    expect(r.bestWeights.map((w) => w.toFixed(2)).join(' ')).toBe(row.w);
    expect(valLoss(r.bestWeights, data.val)).toBe(r.bestVal);
  });

  it('참을성 3 의 기다림 열', () => {
    expect(runEarlyStop(data, 3).records.map((r) => r.wait)).toEqual([0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 2, 0, 0, 0, 1, 2, 3]);
  });

  it('나아짐 비교의 여유 — |검증 − 가장 좋던 값| 의 최소가 1e-3 보다 크다 (동률이 걸리지 않는다)', () => {
    let min = Infinity;
    const r = runEarlyStop(data, 8);
    for (let i = 1; i < r.records.length; i += 1) {
      min = Math.min(min, Math.abs(r.records[i]!.val - r.records[i - 1]!.bestVal));
    }
    expect(min).toBeGreaterThan(1e-3);
  });

  it('차례가 다했는데 멈추지 않으면 algorithm 은 던지고 IR 은 멈춘 에폭 −1', () => {
    const short = { ...data, orders: data.orders.slice(0, 20) };
    expect(() => runEarlyStop(short, 8)).toThrow();
    expect(runIr(short, 8).marks[1]).toBe(-1);
  });
});

describe('early-stopping — IR ↔ algorithm', () => {
  for (const d of [
    { name: '적힌 차례', data },
    { name: '훈련 점을 섞은 차례', data: shuffled(data) },
  ]) {
    it.each(data.patienceLadder)(`${d.name} — 참을성 %i 에서 marks · 되돌린 검증 · 되돌린 무게가 전 정밀도로 같다`, (p) => {
      const ts = runEarlyStop(d.data, p);
      const ir = runIr(d.data, p);
      expect(ir.marks).toEqual([ts.bestEpoch, ts.stopEpoch]);
      expect(ir.ret).toBe(ts.bestVal);
      expect(ir.w).toEqual(ts.bestWeights);
      // 섞어도 적힌 차례의 답과 같다
      const base = runEarlyStop(data, p);
      expect(ts.stopEpoch).toBe(base.stopEpoch);
      expect(ts.bestEpoch).toBe(base.bestEpoch);
      expect(ts.bestVal).toBe(base.bestVal);
    });
  }
});

type Snapshot = { best: number; stop: number };

/** 가짜 reactive ctx — 입력 열을 다 쓰면 취소한다. 판이 끝나 입력을 기다릴 때마다 계기를 적는다. */
async function drive(inputs: number[]) {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const rounds: Snapshot[] = [];
  const queue = [...inputs];
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
      metrics[name] = (metrics[name] ?? 0) + delta;
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      rounds.push({ best: metrics['best-epoch']!, stop: metrics['stop-epoch']! });
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        return { type: 'noop' };
      }
      return { type: 'patience', payload: { value: next, segmentIndex: 0 } };
    },
  };
  await earlyStoppingAlgorithm(ctx as unknown as FacetContext<EarlyStoppingData>);
  return { events, rounds };
}

describe('early-stopping — 재생', () => {
  it('회차별 계기 3 → 1 → 3: best-epoch 14 · 5 · 14, stop-epoch 17 · 6 · 17', async () => {
    const { rounds } = await drive([1, 3]);
    expect(rounds).toEqual([
      { best: 14, stop: 17 },
      { best: 5, stop: 6 },
      { best: 14, stop: 17 },
    ]);
  });

  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase · 걸음 수 = 멈춘 에폭 + 2', async () => {
    const { events } = await drive([1, 2, 5, 8]);
    const steps: string[] = [];
    let runSteps = 0;
    const perRun: number[] = [];
    events.forEach((e, i) => {
      if (e.type === 'es-run') {
        if (i > 0) perRun.push(runSteps);
        runSteps = 0;
      }
      if (e.silent === true) return;
      runSteps += 1;
      const prev = events[i - 1]!;
      expect(prev.type).toBe('phase');
      const ph = (prev.payload as { phase: string }).phase;
      const p = e.payload as { verdict?: string };
      expect(ph).toBe(e.type === 'es-restore' ? 'restore' : p.verdict);
      steps.push(ph);
    });
    perRun.push(runSteps);
    expect(perRun).toEqual([19, 8, 13, 21, 24]);
    expect(new Set(steps)).toEqual(new Set(['start', 'improve', 'wait', 'stop', 'restore']));
  });

  it('무대 — 첫 그림을 두 번 먹여도 요소 수가 같고, 되감으면 비워진다', async () => {
    const { events } = await drive([]);
    const container = document.createElement('div');
    const stage = mountView(earlyStoppingStageView, container, { config: {}, initialData: data as unknown as Record<string, unknown> });
    const proj = earlyStoppingProjector({ stage });
    const init = events.find((e) => e.type === 'es-run')!;
    await proj.onEvent(init);
    const once = container.querySelectorAll('*').length;
    await proj.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    for (const e of events) if (e.type !== 'phase') await proj.onEvent(e);
    const full = container.querySelectorAll('*').length;
    expect(full).toBeGreaterThan(once);
    expect(container.textContent).toContain('0.440');
    proj.onReset?.();
    expect(container.textContent).not.toContain('0.440');
    stage.destroy();
  });
});
