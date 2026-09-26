// @vitest-environment happy-dom
/**
 * learned-filter 고유의 주장 — 사양 표 대조 · IR ↔ 알고리즘 전 조합 · 회차별 계기 · 사다리 · 무대 글자.
 */
import { describe, expect, it } from 'vitest';
import { makeTranslator, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  fmt2,
  learnedFilterAlgorithm,
  learnedFilterFacet,
  learnedFilterImperativeIR,
  learnedFilterInitialData,
  learnedFilterProjector,
  learnedFilterStageView,
  makePieces,
  readLearnedFilterData,
  similarityPercent,
  trainFor,
  type LearnedFilterData,
} from '../src/index.js';

const data = readLearnedFilterData(learnedFilterInitialData);
const pieces = makePieces(data);

/** 사양 실측표 · 대조 (sim.py) — 손잡이 값마다 */
const SPEC = [
  {
    id: 'vertical',
    final: '−0.56 −0.34 0.36 −0.44 −1.14 1.12 −1.79 −1.03 0.47',
    b: '−0.06',
    strongest: 'vertical',
    z: '1.89',
    responses: ['1.89', '−2.41', '−2.64', '−3.41'],
    gauges: [[5, 48, 7], [10, 63, 8], [15, 70, 9], [20, 73, 9], [25, 75, 9], [30, 76, 9], [35, 77, 9], [40, 78, 9]],
    firstNine: 15,
  },
  {
    id: 'horizontal',
    final: '−0.54 −0.36 −1.91 −0.41 −0.96 −1.07 0.49 1.07 0.56',
    b: '−0.35',
    strongest: 'horizontal',
    z: '1.77',
    responses: ['−2.76', '1.77', '−2.73', '−3.48'],
    gauges: [[5, 54, 7], [10, 68, 9], [15, 73, 9], [20, 76, 9], [25, 77, 9], [30, 78, 9], [35, 79, 9], [40, 79, 9]],
    firstNine: 10,
  },
  {
    id: 'diagonal',
    final: '−0.13 −0.52 0.59 −0.38 1.00 −1.22 0.50 −1.05 −1.87',
    b: '−0.19',
    strongest: 'diagonal',
    z: '1.90',
    responses: ['−2.68', '−2.61', '1.90', '−3.26'],
    gauges: [[5, 54, 7], [10, 66, 9], [15, 72, 9], [20, 74, 9], [25, 75, 9], [30, 76, 9], [35, 77, 9], [40, 77, 9]],
    firstNine: 10,
  },
];

describe('learned-filter — 자료와 사다리', () => {
  it('조각 열여섯 · 칸 144 · 사다리가 손잡이 구간과 같다', () => {
    expect(pieces.xs).toHaveLength(144);
    expect(pieces.kinds).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
    const controls = (learnedFilterFacet.blocks.controls as { controls: { action: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const knob = controls.find((c) => c.action === 'target');
    expect(knob?.segments?.map((s) => s.value)).toEqual(data.targetLadder.map((_, i) => i));
    expect(knob?.segments?.find((s) => s.default)?.value).toBe(data.target);
    expect(data.targetLadder).toEqual(['vertical', 'horizontal', 'diagonal']);
    expect(data.targetLadder).not.toContain('flat');
  });

  it('첫 조각이 sim 의 값과 같다 (둘째 자리)', () => {
    expect(pieces.xs.slice(0, 9).map((x) => x.toFixed(2)).join(' ')).toBe('0.00 0.00 0.73 0.03 0.00 0.71 0.24 0.00 1.00');
    expect(pieces.xs.slice(135, 144).map((x) => x.toFixed(2)).join(' ')).toBe('0.79 0.94 0.98 0.82 1.00 0.99 0.90 1.00 0.90');
  });
});

describe('learned-filter — 사양 표 대조', () => {
  SPEC.forEach((row, target) => {
    it(`${row.id} — 판 40 창 · b · 응답 · 계기 회차`, () => {
      const run = trainFor(data, pieces, target);
      expect(run.weights.map(fmt2).join(' ')).toBe(row.final);
      expect(fmt2(run.bias)).toBe(row.b);
      expect(run.responses.map(fmt2)).toEqual(row.responses);
      expect(data.patterns[run.strongest].id).toBe(row.strongest);
      expect(run.shots.map((s) => [s.epoch, similarityPercent(s.similarity), s.signMatch])).toEqual(row.gauges);
      expect(run.shots.find((s) => s.signMatch === 9)?.epoch).toBe(row.firstNine);
      // 판 40 의 양수 칸이 정확히 그 무늬의 밝은 칸
      const tmpl = data.patterns[run.pattern].cells;
      expect(run.weights.map((w) => (w > 0 ? 1 : 0))).toEqual(tmpl);
      // 닮음이 보일 판마다 오른다 · 창의 크기가 차오른다
      for (let k = 1; k < run.shots.length; k += 1) {
        expect(run.shots[k].similarity).toBeGreaterThan(run.shots[k - 1].similarity);
        const norm = (w: number[]) => Math.sqrt(w.reduce((a, v) => a + v * v, 0));
        expect(norm(run.shots[k].weights)).toBeGreaterThan(norm(run.shots[k - 1].weights));
      }
    });
  });

  it('기본값 세로의 걸음 1 창이 대조와 같다', () => {
    const run = trainFor(data, pieces, 0);
    expect(run.shots[0].weights.map(fmt2).join(' ')).toBe('−0.19 −0.13 −0.10 −0.17 −0.35 0.11 −0.53 −0.32 −0.06');
    expect(fmt2(run.shots[0].bias)).toBe('−0.24');
  });
});

describe('learned-filter — IR 과 알고리즘이 같은 답을 낸다', () => {
  data.targetLadder.forEach((id, target) => {
    it(`${id} — trainEpoch 판 40 · strongest`, () => {
      const run = trainFor(data, pieces, target);
      const xs = [...pieces.xs];
      const ys = [...run.ys];
      const w = [...data.initialWeights];
      const bias = [...data.initialBias];
      const ps = new Array<number>(ys.length).fill(0);
      expect(xs).toHaveLength(144);
      expect(ys).toHaveLength(16);
      let shot = 0;
      for (let epoch = 1; epoch <= data.epochs; epoch += 1) {
        runIR(learnedFilterImperativeIR, 'trainEpoch', [xs, ys, ys.length, w, bias, ps, data.learningRate]);
        if (epoch % data.showEvery === 0) {
          const s = run.shots[shot];
          shot += 1;
          s.weights.forEach((v, i) => expect(Math.abs(w[i] - v)).toBeLessThan(1e-12));
          expect(Math.abs(bias[0] - s.bias)).toBeLessThan(1e-12);
        }
      }
      expect(shot).toBe(8);
      const tmpls = data.patterns.flatMap((p) => p.cells);
      expect(tmpls).toHaveLength(36);
      const best = runIR(learnedFilterImperativeIR, 'strongest', [w, bias, tmpls, data.patterns.length]);
      expect(best).toBe(run.strongest);
    });
  });
});

type Recorded = { events: FacetRuntimeEvent[]; rounds: number[][][] };

/** 손잡이 입력을 차례로 먹이며 알고리즘을 돌려 회차마다 계기 값을 모은다. */
async function drive(inputs: number[]): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const rounds: number[][][] = [];
  const queue = [...inputs];
  let cancelled = false;
  const snap = () => [metrics.get('epoch') ?? NaN, metrics.get('similarity') ?? NaN, metrics.get('sign-match') ?? NaN];
  const ctx = {
    data: structuredClone(learnedFilterInitialData) as LearnedFilterData,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'round') rounds.push([]);
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      rounds[rounds.length - 1].push(snap());
      return true;
    },
    async waitForInput() {
      const v = queue.shift();
      if (v === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'target', payload: { value: v, segmentIndex: v, target: String(v) } };
    },
    pollInput() {
      return null;
    },
  };
  await learnedFilterAlgorithm(ctx as never);
  return { events, rounds };
}

describe('learned-filter — 회차별 계기 (세로 → 가로 → 세로)', () => {
  it('판 머리에서 0 · 걸음마다 표 · 걸음 9 는 걸음 8 과 같다', async () => {
    const { rounds } = await drive([1, 0]);
    expect(rounds).toHaveLength(3);
    const order = [0, 1, 0];
    rounds.forEach((r, k) => {
      expect(r).toHaveLength(10);
      expect(r[0]).toEqual([0, 0, 0]);
      expect(r.slice(1, 9)).toEqual(SPEC[order[k]].gauges);
      expect(r[9]).toEqual(r[8]);
    });
    expect(rounds.map((r) => r[9])).toEqual([[40, 78, 9], [40, 79, 9], [40, 78, 9]]);
  });

  it('phase 는 걸음 발신 앞에 온다 · 집합이 IR 과 같다', async () => {
    const { events } = await drive([]);
    const types = events.map((e) => (e.type === 'phase' ? `phase:${(e.payload as { phase: string }).phase}` : e.type));
    expect(types).toEqual([
      'setup',
      'round',
      ...Array.from({ length: 8 }, () => ['phase:update', 'window']).flat(),
      'phase:strongest',
      'responses',
    ]);
  });
});

describe('learned-filter — 무대', () => {
  it('걸음마다 창 글자 · 캡션 · 응답이 payload 와 같다', async () => {
    const { events } = await drive([2]);
    const container = document.createElement('div');
    const t = makeTranslator('ko', learnedFilterFacet.messages);
    const stage = mountView(learnedFilterStageView, container, {
      config: { type: 'learned-filter-stage' },
      initialData: learnedFilterInitialData,
      locale: 'ko',
      t,
    });
    const projector = learnedFilterProjector({ stage }, { getSpeed: () => 1000, t });
    const shots: string[] = [];
    for (const e of events) {
      await projector.onEvent(e);
      if (e.type === 'window' || e.type === 'responses' || e.type === 'round') shots.push(container.textContent ?? '');
    }
    expect(shots).toHaveLength(20);
    expect(shots[0]).toContain('과제: 세로 경계');
    expect(shots[0]).toContain('닮음: 셈하지 않음');
    expect(shots[8]).toContain('판 40 뒤 — 닮음 0.78 · 부호 맞는 칸 9 / 9');
    expect(shots[9]).toContain('가장 큰 응답 1.89 · 세로 경계');
    // 새 판의 걸음 0 은 앞 판의 응답 글자를 걷는다
    expect(shots[10]).toContain('과제: 대각선');
    expect(shots[10]).not.toContain('1.89');
    expect(shots[18]).toContain('닮음 0.77');
    expect(shots[19]).toContain('가장 큰 응답 1.90 · 대각선');
    expect(shots[0]).toContain('처음 — 창 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 · b 0.00');

    // 되돌리기 · 되짚기 — onReset 뒤 자취를 처음부터 다시 먹여도 무대는 한 벌만 선다
    const svg = container.querySelector('svg');
    const before = svg?.querySelectorAll('*').length ?? 0;
    const beforeText = container.textContent;
    expect(before).toBeGreaterThan(0);
    for (let k = 0; k < 2; k += 1) {
      projector.onReset?.();
      expect(svg?.childNodes.length).toBe(0);
      for (const e of events) await projector.onEvent(e);
      expect(svg?.querySelectorAll('*').length).toBe(before);
      expect(container.textContent).toBe(beforeText);
    }
    stage.destroy();
  });
});
