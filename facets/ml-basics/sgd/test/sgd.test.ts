// @vitest-environment happy-dom
/**
 * sgd 고유 검수 — IR ↔ algorithm 전 조합 · 사양 대조표 · 저장 차례 섞음 · 회차별 계기 · 걸음 앞 phase · 첫 그림 멱등.
 */
import { describe, expect, it } from 'vitest';
import { mountView } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  checkSgdData,
  sgdAlgorithm,
  sgdFacet,
  sgdImperativeIR,
  sgdPlan,
  sgdStageView,
  type SgdData,
  type SgdStage,
} from '../src/index.js';

const data = checkSgdData(sgdFacet.initialData);

type Run = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

/** 알고리즘을 가짜 reactive ctx 로 돌린다 — 판마다 이벤트 · 계기 합을 모은다. */
async function drive(d: SgdData, inputs: number[]): Promise<Run[]> {
  const runs: Run[] = [{ events: [], metrics: {} }];
  const queue = inputs.slice();
  let cancelled = false;
  const cur = () => runs[runs.length - 1]!;
  const ctx = {
    data: d,
    get cancelled() { return cancelled; },
    async emit(e: FacetRuntimeEvent) { cur().events.push(e); },
    metric(name: string, delta: number | 'inc') {
      const m = cur().metrics;
      m[name] = (m[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() { return !cancelled; },
    pollInput() { return null; },
    async waitForInput() {
      const v = queue.shift();
      if (v === undefined) { cancelled = true; return { type: 'none' }; }
      // 계기는 누적 — 다음 판은 앞 판의 합에서 이어 센다
      runs.push({ events: [], metrics: { ...cur().metrics } });
      return { type: 'batch', payload: { value: v, segmentIndex: 0, batch: String(v) } };
    },
  };
  await sgdAlgorithm(ctx as never);
  return runs;
}

const steps = (r: Run) => r.events.filter((e) => !e.silent);
const payloadOf = (e: FacetRuntimeEvent) => e.payload as Record<string, number | boolean | number[]>;

function irRun(d: SgdData, B: number) {
  const wb = [d.w0, d.b0];
  const tally = [0, 0];
  runIR(sgdImperativeIR, 'sgdEpochs', [d.xs, d.ys, d.order, B, d.eta, wb, tally]);
  const loss = runIR(sgdImperativeIR, 'fullLoss', [d.xs, d.ys, wb]) as number;
  return { w: wb[0]!, b: wb[1]!, count: tally[0]!, backward: tally[1]!, loss };
}

const TABLE: Record<number, { count: number; back: number; mean: string; max: string; w: string; b: string; loss: string; steps: number }> = {
  1: { count: 32, back: 7, mean: '65', max: '179', w: '1.44', b: '0.40', loss: '0.290', steps: 36 },
  2: { count: 16, back: 2, mean: '39', max: '127', w: '1.30', b: '0.34', loss: '0.328', steps: 20 },
  4: { count: 8, back: 0, mean: '15', max: '35', w: '0.97', b: '0.22', loss: '0.634', steps: 12 },
  8: { count: 4, back: 0, mean: '14', max: '32', w: '0.62', b: '0.12', loss: '1.263', steps: 8 },
  16: { count: 2, back: 0, mean: '0', max: '0', w: '0.35', b: '0.06', loss: '1.970', steps: 6 },
};

describe('sgd — 데이터 · 사다리', () => {
  it('사다리 = segments · order 길이 32 · 앞뒤 열여섯이 각각 0‥15 의 섞음', () => {
    const controls = (sgdFacet.blocks.controls as { controls: { action: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const knob = controls.find((c) => c.action === 'batch');
    expect(knob?.segments?.map((s) => s.value)).toEqual(data.batchLadder);
    expect(knob?.segments?.find((s) => s.default)?.value).toBe(data.batch);
    expect(data.batchLadder).toEqual([1, 2, 4, 8, 16]);
    expect(data.xs).toHaveLength(16);
    expect(data.order).toHaveLength(32);
    const range = Array.from({ length: 16 }, (_, i) => i);
    expect(data.order.slice(0, 16).sort((a, b) => a - b)).toEqual(range);
    expect(data.order.slice(16).sort((a, b) => a - b)).toEqual(range);
  });
});

describe('sgd — 사양 대조와 IR', () => {
  for (const B of data.batchLadder) {
    it(`B ${B}: IR 과 algorithm 이 같고 사양 표와 맞는다`, async () => {
      const plan = sgdPlan(data, B);
      const ir = irRun(data, B);
      expect(ir).toEqual({ w: plan.w, b: plan.b, count: plan.count, backward: plan.backward, loss: plan.loss });
      const row = TABLE[B]!;
      expect(plan.count).toBe(row.count);
      expect(plan.backward).toBe(row.back);
      expect(plan.meanAbsAngle.toFixed(0)).toBe(row.mean);
      expect(Math.max(...plan.updates.map((u) => Math.abs(u.angle))).toFixed(0)).toBe(row.max);
      expect(plan.w.toFixed(2)).toBe(row.w);
      expect(plan.b.toFixed(2)).toBe(row.b);
      expect(plan.loss.toFixed(3)).toBe(row.loss);
      // 거꾸로 = 비낌 90° 넘음
      for (const u of plan.updates) expect(u.backward).toBe(Math.abs(u.angle) > 90);
      // 판 하나의 걸음 수와 끝 걸음 payload
      const [run] = await drive(data, []);
      const s = steps(run!);
      if (B === data.batch) {
        expect(s).toHaveLength(row.steps);
        const end = payloadOf(s[s.length - 1]!);
        expect(end.updates).toBe(ir.count);
        expect(end.backwardCount).toBe(ir.backward);
        expect(end.loss).toBe(ir.loss);
      }
    });
  }

  it('걸음 수 36 · 20 · 12 · 8 · 6 과 판 끝 계기', async () => {
    const runs = await drive(data, [1, 4, 8, 16]);
    const want = [[20, 16, 2], [36, 32, 7], [12, 8, 0], [8, 4, 0], [6, 2, 0]];
    runs.forEach((r, i) => {
      expect(steps(r)).toHaveLength(want[i]![0]!);
      expect(r.metrics.updates).toBe(want[i]![1]);
      expect(r.metrics['backward-updates']).toBe(want[i]![2]);
    });
  });

  it('B 2 걸음 차례가 사양 대조와 같다', () => {
    const plan = sgdPlan(data, 2);
    const want = [
      [[10, 5], 17, '0.08', '-0.01', '2.900'], [[0, 1], 39, '0.50', '-0.24', '1.858'],
      [[9, 4], 22, '0.55', '-0.18', '1.675'], [[6, 2], 3, '0.57', '-0.17', '1.609'],
      [[3, 15], 12, '0.71', '-0.06', '1.215'], [[11, 7], 36, '0.76', '0.04', '1.051'],
      [[12, 8], 18, '0.78', '0.05', '1.016'], [[13, 14], 13, '1.01', '0.22', '0.582'],
      [[1, 7], 47, '1.12', '0.17', '0.506'], [[14, 11], 6, '1.22', '0.26', '0.390'],
      [[12, 3], 127, '1.16', '0.28', '0.426'], [[9, 0], 41, '1.18', '0.33', '0.397'],
      [[6, 2], 78, '1.17', '0.36', '0.394'], [[5, 13], 8, '1.27', '0.37', '0.334'],
      [[8, 10], 105, '1.27', '0.36', '0.336'], [[4, 15], 53, '1.30', '0.34', '0.328'],
    ] as const;
    expect(plan.updates).toHaveLength(16);
    plan.updates.forEach((u, i) => {
      const [pts, deg, w, b, loss] = want[i]!;
      expect(u.points).toEqual(pts);
      expect(Math.abs(u.angle).toFixed(0)).toBe(String(deg));
      expect(u.w.toFixed(2)).toBe(w);
      expect(u.b.toFixed(2)).toBe(b);
      expect(u.loss.toFixed(3)).toBe(loss);
      expect(u.backward).toBe(i === 10 || i === 14);
    });
  });

  it('B 1 · 4 · 8 · 16 비낌 열이 사양 대조와 같다', () => {
    const col = (B: number) => sgdPlan(data, B).updates.map((u) => Math.abs(u.angle).toFixed(0)).join(' ');
    expect(col(1)).toBe('54 60 39 56 30 86 73 69 103 0 18 71 164 119 7 0 71 4 74 71 86 39 46 155 123 13 34 8 65 95 179 71');
    expect(col(4)).toBe('35 10 22 20 2 20 1 6');
    expect(col(8)).toBe('32 23 1 1');
    expect(col(16)).toBe('0 0');
  });

  it('처음 전체 손실 3.173 · 에폭 1 끝 전체 손실', async () => {
    const [run] = await drive(data, []);
    expect((payloadOf(steps(run!)[0]!).loss as number).toFixed(3)).toBe('3.173');
    const epoch1 = data.batchLadder.map((B) => {
      const p = sgdPlan(data, B);
      return p.updates[16 / B - 1]!.loss.toFixed(3);
    });
    expect(epoch1).toEqual(['0.309', '0.582', '1.255', '1.952', '2.489']);
  });

  it('점의 저장 차례를 섞고 order 를 따라 바꿔도 IR 과 algorithm 이 같다', () => {
    const perms = [
      [3, 14, 0, 9, 7, 12, 1, 15, 5, 10, 2, 8, 13, 4, 11, 6],
      [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
      [8, 0, 9, 1, 10, 2, 11, 3, 12, 4, 13, 5, 14, 6, 15, 7],
    ];
    for (const perm of perms) {
      const xs = new Array<number>(16);
      const ys = new Array<number>(16);
      data.xs.forEach((x, i) => { xs[perm[i]!] = x; ys[perm[i]!] = data.ys[i]!; });
      const shuffled: SgdData = { ...data, xs, ys, order: data.order.map((i) => perm[i]!) };
      for (const B of data.batchLadder) {
        const plan = sgdPlan(shuffled, B);
        const ir = irRun(shuffled, B);
        expect(ir).toEqual({ w: plan.w, b: plan.b, count: plan.count, backward: plan.backward, loss: plan.loss });
        const base = sgdPlan(data, B);
        expect(plan.count).toBe(base.count);
        expect(plan.backward).toBe(base.backward);
        expect(plan.w).toBeCloseTo(base.w, 12);
        expect(plan.b).toBeCloseTo(base.b, 12);
      }
    }
  });
});

describe('sgd — 계기 · phase', () => {
  it('회차별 계기 2 → 16 → 2', async () => {
    const runs = await drive(data, [16, 2]);
    // 계기는 누적 채널 — 판마다 지금 보이는 값 (앞 판에서 이어 센 합)
    const per = runs.map((r) => [r.metrics.updates, r.metrics['backward-updates']]);
    expect(per).toEqual([[16, 2], [2, 0], [16, 2]]);
    // 첫 판에 두 이름이 실린다
    expect(Object.keys(runs[0]!.metrics).sort()).toEqual(['backward-updates', 'updates']);
  });

  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase 다', async () => {
    const runs = await drive(data, [1, 4, 8, 16]);
    for (const r of runs) {
      const ev = r.events;
      const seen = new Set<string>();
      ev.forEach((e, i) => {
        if (e.silent) return;
        const prev = ev[i - 1];
        const prevPhase = prev && prev.type === 'phase' ? (prev.payload as { phase: string }).phase : null;
        if (e.type === 'sgd-start') { expect(prevPhase).toBeNull(); return; }
        const p = payloadOf(e);
        const want = e.type === 'sgd-epoch' ? 'sgd-epoch'
          : e.type === 'sgd-end' ? 'sgd-loss'
            : p.backward ? 'sgd-back' : 'sgd-update';
        expect(prevPhase).toBe(want);
        seen.add(want);
      });
      const B = payloadOf(r.events[0]!).batch;
      if (B === 2 || B === 1) expect([...seen].sort()).toEqual(['sgd-back', 'sgd-epoch', 'sgd-loss', 'sgd-update']);
      else expect(seen.has('sgd-back')).toBe(false);
    }
  });
});

describe('sgd — 무대', () => {
  it('첫 그림이 멱등이고 reset 이 결론을 걷는다', async () => {
    const container = document.createElement('div');
    const inst = mountView(sgdStageView, container, { config: { type: 'sgd-stage' } }) as unknown as SgdStage;
    const [run] = await drive(data, []);
    const start = payloadOf(steps(run!)[0]!);
    const view = { ...start, totalUpdates: start.totalUpdates } as never;
    inst.start(view, 0);
    const count = container.querySelectorAll('*').length;
    inst.start(view, 0);
    expect(container.querySelectorAll('*').length).toBe(count);
    const stepEv = steps(run!).find((e) => e.type === 'sgd-step')!;
    inst.epoch({ epoch: 0, order: data.order.slice(0, 16) }, 0);
    inst.step(payloadOf(stepEv) as never, 0);
    expect(container.querySelectorAll('*').length).toBeGreaterThan(count);
    inst.reset();
    inst.start(view, 0);
    expect(container.querySelectorAll('*').length).toBe(count);
    inst.destroy();
  });
});
