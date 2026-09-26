// @vitest-environment happy-dom
/**
 * roc-imbalance 고유의 주장 — IR ↔ algorithm 전 조합, 사양 표, 차례 섞기, 회차별 계기, 걸음의 phase, 무대 멱등.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import {
  rocAucPercent,
  rocConfusion,
  rocCurve,
  rocImbalanceAlgorithm,
  rocImbalanceFacet,
  rocImbalanceImperativeIR,
  rocImbalanceProjector,
  rocImbalanceStageView,
  type RocImbalanceData,
} from '../src/index.js';

const data = rocImbalanceFacet.initialData as RocImbalanceData;

// 사양 실측표 (sim.py 출력) — 배수, 문턱, TP, FN, FP, TN, TPR, FPR, 정밀도, 정확도, AUC
const TABLE: [number, number, number, number, number, number, number, number, number, number, number][] = [
  [1, 0.7, 4, 6, 2, 8, 40, 20, 67, 60, 75],
  [1, 0.5, 7, 3, 4, 6, 70, 40, 64, 65, 75],
  [1, 0.3, 9, 1, 6, 4, 90, 60, 60, 65, 75],
  [4, 0.7, 4, 6, 8, 32, 40, 20, 33, 72, 75],
  [4, 0.5, 7, 3, 16, 24, 70, 40, 30, 62, 75],
  [4, 0.3, 9, 1, 24, 16, 90, 60, 27, 50, 75],
  [10, 0.7, 4, 6, 20, 80, 40, 20, 17, 76, 75],
  [10, 0.5, 7, 3, 40, 60, 70, 40, 15, 61, 75],
  [10, 0.3, 9, 1, 60, 40, 90, 60, 13, 45, 75],
];

function irConfusion(pos: number[], neg: number[], m: number, th: number): { ret: number; cells: number[] } {
  const cells = [0, 0, 0, 0, 0, 0, 0, 0];
  const ret = runIR(rocImbalanceImperativeIR, 'confusion', [pos, neg, m, th, cells]);
  if (typeof ret !== 'number') throw new Error('IR 이 수를 돌려주지 않았다');
  return { ret, cells };
}

function flat(pos: number[], neg: number[], m: number, th: number): number[] {
  const c = rocConfusion(pos, neg, m, th);
  return [c.TP, c.FN, c.FP, c.TN, c.tprPercent, c.fprPercent, c.precisionPercent, c.accuracyPercent];
}

describe('roc-imbalance — 셈', () => {
  it('사다리 · 데이터 모양이 선언과 같다', () => {
    expect(data.positiveScores).toHaveLength(10);
    expect(data.negativeScores).toHaveLength(10);
    expect(data.negativesLadder).toEqual([1, 4, 10]);
    expect(data.thresholdLadder).toEqual([0.7, 0.5, 0.3]);
    const controls = (rocImbalanceFacet.blocks.controls as { controls: Record<string, unknown>[] }).controls;
    const knob = (action: string) => {
      const k = controls.find((c) => c.action === action);
      if (!k) throw new Error(action);
      return k.segments as { value: number; default?: boolean }[];
    };
    expect(knob('negatives').map((s) => s.value)).toEqual(data.negativesLadder);
    expect(knob('threshold').map((s) => s.value)).toEqual(data.thresholdLadder);
    expect(knob('negatives').find((s) => s.default)?.value).toBe(data.startNegatives);
    expect(knob('threshold').find((s) => s.default)?.value).toBe(data.startThreshold);
  });

  it('아홉 조합 모두 algorithm = 사양 표 = IR (out 여덟 칸 · aucPercent)', () => {
    for (const [m, th, ...rest] of TABLE) {
      const expected = rest.slice(0, 8);
      const auc = rest[8];
      const ts = flat(data.positiveScores, data.negativeScores, m, th);
      expect(ts, `×${m} ${th}`).toEqual(expected);
      const ir = irConfusion(data.positiveScores, data.negativeScores, m, th);
      expect(ir.cells, `IR ×${m} ${th}`).toEqual(ts);
      expect(ir.ret).toBe(ts[6]);
      expect(rocAucPercent(data.positiveScores, data.negativeScores, m)).toBe(auc);
      expect(runIR(rocImbalanceImperativeIR, 'aucPercent', [data.positiveScores, data.negativeScores, m])).toBe(auc);
    }
  });

  it('양성 · 음성 열의 차례를 섞어도 같다 (TS 와 IR 모두)', () => {
    const shuffle = (xs: number[], k: number) => xs.map((_, i) => xs[(i * k + 3) % xs.length]);
    const pos = shuffle(data.positiveScores, 3);
    const neg = shuffle(data.negativeScores, 7);
    expect([...pos].sort()).toEqual([...data.positiveScores].sort());
    expect([...neg].sort()).toEqual([...data.negativeScores].sort());
    for (const [m, th] of TABLE) {
      const base = flat(data.positiveScores, data.negativeScores, m, th);
      expect(flat(pos, neg, m, th)).toEqual(base);
      expect(irConfusion(pos, neg, m, th).cells).toEqual(base);
      expect(runIR(rocImbalanceImperativeIR, 'aucPercent', [pos, neg, m])).toBe(
        rocAucPercent(data.positiveScores, data.negativeScores, m),
      );
    }
  });

  it('TP + FP = 0 인 문턱이면 TS 는 던지고 IR 은 −1', () => {
    expect(() => rocConfusion(data.positiveScores, data.negativeScores, 1, 0.99)).toThrow();
    const ir = irConfusion(data.positiveScores, data.negativeScores, 1, 0.99);
    expect(ir.ret).toBe(-1);
    expect(ir.cells[6]).toBe(-1);
  });

  it('곡선은 사양의 (FP, TP) 열이고 ×m 은 FP 가 m 배일 뿐 비율로 같다', () => {
    const spec = [
      [0, 0], [0, 1], [0, 2], [1, 2], [1, 3], [1, 4], [2, 4], [2, 5], [2, 6], [3, 6], [3, 7],
      [4, 7], [4, 8], [5, 8], [5, 9], [6, 9], [7, 9], [7, 10], [8, 10], [9, 10], [10, 10],
    ];
    const one = rocCurve(data.positiveScores, data.negativeScores, 1);
    expect(one.map((q) => [q.fp, q.tp])).toEqual(spec);
    for (const m of data.negativesLadder) {
      const cm = rocCurve(data.positiveScores, data.negativeScores, m);
      expect(cm.map((q) => [q.fp, q.tp])).toEqual(spec.map(([fp, tp]) => [fp * m, tp]));
      cm.forEach((q, i) => {
        expect(q.fpr).toBeCloseTo(one[i].fpr, 12);
        expect(q.tpr).toBe(one[i].tpr);
      });
    }
  });
});

type Run = { events: FacetRuntimeEvent[]; metrics: Map<string, number>[] };

async function drive(inputs: { type: string; value: number }[]): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const rounds: Map<string, number>[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx: ReactiveContext<RocImbalanceData> = {
    data: JSON.parse(JSON.stringify(data)) as RocImbalanceData,
    get cancelled() {
      return cancelled;
    },
    async emit(e) {
      events.push(e);
    },
    metric(name, delta) {
      if (delta === 'inc') throw new Error('inc 를 쓰지 않는다');
      metrics.set(name, (metrics.get(name) ?? 0) + delta);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput<T>() {
      rounds.push(new Map(metrics));
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('끝');
      }
      return { type: next.type, payload: { value: next.value } } as unknown as T;
    },
    pollInput() {
      return null;
    },
  };
  await rocImbalanceAlgorithm(ctx);
  return { events, metrics: rounds };
}

describe('roc-imbalance — 재생', () => {
  it('회차별 계기 ×1 → ×10 → ×1 (문턱 0.7)', async () => {
    const run = await drive([
      { type: 'negatives', value: 10 },
      { type: 'negatives', value: 1 },
    ]);
    expect(run.metrics).toHaveLength(3);
    expect(run.metrics.map((m) => m.get('false-positives'))).toEqual([2, 20, 2]);
    expect(run.metrics.map((m) => m.get('precision-percent'))).toEqual([67, 17, 67]);
    expect(run.metrics.map((m) => m.get('auc-percent'))).toEqual([75, 75, 75]);
    expect(run.metrics.map((m) => m.get('accuracy-percent'))).toEqual([60, 76, 60]);
  });

  it('문턱을 돌리면 다른 손잡이(배수)는 쥔 값을 쓴다', async () => {
    const run = await drive([
      { type: 'negatives', value: 4 },
      { type: 'threshold', value: 0.3 },
      { type: 'bogus', value: 1 },
      { type: 'threshold', value: 0.5 },
    ]);
    // 우리 것이 아닌 입력은 흘린다 — 판은 넷 (대기마다 찍으므로 흘린 한 번은 같은 값이 되풀이된다)
    expect(run.events.filter((e) => e.type === 'items')).toHaveLength(4);
    expect(run.metrics.map((m) => m.get('precision-percent'))).toEqual([67, 33, 27, 27, 30]);
  });

  it('제 손잡이인데 값이 사다리 밖이거나 수가 아니면 던진다', async () => {
    await expect(drive([{ type: 'negatives', value: 7 }])).rejects.toThrow(/사다리 밖/);
    await expect(drive([{ type: 'threshold', value: Number.NaN }])).rejects.toThrow(/사다리 밖/);
  });

  it('한 판은 6 걸음이고, 걸음 1 … 5 바로 앞은 그 걸음의 phase 다', async () => {
    const run = await drive([]);
    const steps = run.events.filter((e) => !e.silent).map((e) => e.type);
    expect(steps).toEqual(['items', 'call', 'rates', 'auc', 'precision', 'accuracy']);
    const want: Record<string, string> = {
      call: 'call',
      rates: 'rates',
      auc: 'auc',
      precision: 'precision',
      accuracy: 'accuracy',
    };
    run.events.forEach((e, i) => {
      if (e.silent) return;
      const prev = run.events[i - 1];
      if (e.type === 'items') {
        expect(prev === undefined || prev.type !== 'phase').toBe(true);
        return;
      }
      expect(prev?.type).toBe('phase');
      expect((prev?.payload as { phase: string }).phase).toBe(want[e.type]);
    });
  });
});

describe('roc-imbalance — 무대', () => {
  it('첫 그림을 두 번 먹여도 요소 수가 같고, reset 은 판을 비운다', async () => {
    const run = await drive([{ type: 'negatives', value: 10 }]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(rocImbalanceStageView, container, { config: {}, isInstant: () => true });
    const proj = rocImbalanceProjector({ stage }, { getSpeed: () => 1, t: (_k, en) => en });
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('svg 없음');
    const base = svg.querySelectorAll('*').length;
    const firstRound = run.events.slice(0, run.events.findIndex((e) => e.type === 'accuracy') + 1);
    const items = firstRound[0];
    await proj.onEvent(items);
    const once = svg.querySelectorAll('*').length;
    await proj.onEvent(items);
    expect(svg.querySelectorAll('*').length).toBe(once);
    expect(once - base).toBe(20);
    for (const e of firstRound.slice(1)) await proj.onEvent(e);
    // 둘째 판 (×10) — 음성 더미가 불어난다
    const secondItems = run.events.filter((e) => e.type === 'items')[1];
    await proj.onEvent(secondItems);
    expect(svg.querySelectorAll('circle[fill]').length).toBeGreaterThanOrEqual(110);
    expect(svg.textContent).not.toContain('67 %');
    proj.onReset?.();
    expect(svg.querySelectorAll('*').length).toBe(base);
    stage.destroy();
  });
});
