// @vitest-environment happy-dom
/**
 * gated-cells 고유 검수 — IR ↔ algorithm 아홉 조합(뒤집은 방해 목록 포함) · 사양 표 · 회차별 계기 · 사다리 · 무대 표시.
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  CELL_KINDS,
  flattenWeights,
  gatedCellsAlgorithm,
  gatedCellsFacet,
  gatedCellsImperativeIR,
  gatedCellsStageView,
  percent,
  readData,
  runCell,
  type GatedCellsData,
  type GatedCellsStage,
} from '../src/index.js';

const data = readData(gatedCellsFacet.initialData);
const flat = flattenWeights(data.weights);

/** 사양 대조 — 남은 몫 (kept-percent), 사이 × 셀 */
const SPEC_TABLE: Record<number, Record<string, number>> = {
  2: { RNN: 32, GRU: 99, LSTM: 98 },
  6: { RNN: 17, GRU: 96, LSTM: 94 },
  12: { RNN: 6, GRU: 91, LSTM: 89 },
};
const SPEC_STEPS_GAP6: Record<string, number[]> = {
  RNN: [100, 42, 32, 28, 23, 20, 17, 17],
  GRU: [100, 99, 99, 98, 97, 97, 96, 96],
  LSTM: [100, 98, 98, 98, 96, 96, 94, 94],
};

function fmt(v: number, d: number): string {
  const s = v.toFixed(d);
  return (Number(s) === 0 ? s.replace('-', '') : s).replace('-', '−');
}

function controls(): { action?: string; segments?: { value: number }[] }[] {
  const block = gatedCellsFacet.blocks.controls as { controls: { action?: string; segments?: { value: number }[] }[] };
  return block.controls;
}

describe('gated-cells — IR 과 algorithm', () => {
  it('아홉 조합에서 IR 의 남은 몫이 algorithm 과 같고 사양 표와 맞는다', () => {
    for (const gap of data.gapLadder) {
      for (let cell = 0; cell < CELL_KINDS.length; cell += 1) {
        const xs = [data.write, ...data.distract.slice(0, gap)];
        const alg = runCell(CELL_KINDS[cell], xs, flat).kept;
        const ir = runIR(gatedCellsImperativeIR, 'keptShare', [cell, xs, xs.length, flat]);
        expect(typeof ir).toBe('number');
        expect(Math.abs((ir as number) - alg)).toBeLessThan(1e-12);
        expect(percent(alg)).toBe(SPEC_TABLE[gap][CELL_KINDS[cell]]);
      }
    }
  });

  it('방해 목록을 뒤집어도 IR 과 algorithm 이 같다', () => {
    const rev = [...data.distract].reverse();
    for (const gap of data.gapLadder) {
      for (let cell = 0; cell < CELL_KINDS.length; cell += 1) {
        const xs = [data.write, ...rev.slice(0, gap)];
        const alg = runCell(CELL_KINDS[cell], xs, flat).kept;
        const ir = runIR(gatedCellsImperativeIR, 'keptShare', [cell, xs, xs.length, flat]) as number;
        expect(Math.abs(ir - alg)).toBeLessThan(1e-12);
      }
    }
  });

  it('LSTM · 사이 6 의 걸음 표가 사양과 같다', () => {
    const xs = [data.write, ...data.distract.slice(0, 6)];
    const run = runCell('LSTM', xs, flat);
    const rows = run.steps.map((s) => [
      fmt(s.x, 1),
      ...s.gates.map((g) => fmt(g.value, 2)),
      fmt(s.candidate as number, 2),
      fmt(s.c, 2),
      fmt(s.h, 2),
    ]);
    // [x, f, i, o, g, c, h]
    expect(rows[0]).toEqual(['2.0', '0.38', '0.62', '1.00', '0.76', '0.47', '0.44']);
    expect(rows[1]).toEqual(['0.5', '0.98', '0.02', '0.50', '0.24', '0.47', '0.22']);
    expect(rows[2]).toEqual(['−0.5', '1.00', '0.00', '0.02', '−0.24', '0.47', '0.01']);
    expect(rows[4]).toEqual(['0.5', '0.98', '0.02', '0.50', '0.24', '0.46', '0.22']);
    expect(run.steps.slice(1).map((s) => fmt(s.factor, 2))).toEqual(['0.98', '1.00', '1.00', '0.98', '1.00', '0.98']);
  });

  it('RNN · GRU · 사이 6 의 값이 사양과 같다', () => {
    const xs = [data.write, ...data.distract.slice(0, 6)];
    const rnn = runCell('RNN', xs, flat);
    expect(rnn.steps.map((s) => fmt(s.h, 2))).toEqual(['0.76', '0.73', '0.39', '0.10', '0.33', '0.04', '0.28']);
    expect(rnn.steps.slice(1).map((s) => fmt(s.factor, 2))).toEqual(['0.42', '0.76', '0.89', '0.80', '0.90', '0.83']);
    const gru = runCell('GRU', xs, flat);
    expect(gru.steps.map((s) => fmt(s.h, 2))).toEqual(Array(7).fill('0.47'));
    expect(gru.steps.slice(1).map((s) => fmt(s.factor, 2))).toEqual(['0.99', '1.00', '1.00', '0.99', '1.00', '0.99']);
    expect(gru.steps.slice(1).map((s) => fmt(s.kept, 2))).toEqual(['0.99', '0.99', '0.98', '0.97', '0.97', '0.96']);
  });
});

describe('gated-cells — 사다리와 데이터 모양', () => {
  it('사다리가 segments 와 같고 매개변수 길이 · 끝값이 맞다', () => {
    const [cellKnob, gapKnob] = controls().filter((c) => c.action === 'cell' || c.action === 'gap');
    expect(cellKnob.action).toBe('cell');
    expect(cellKnob.segments?.map((s) => s.value)).toEqual(data.cells.map((_, k) => k));
    expect(gapKnob.segments?.map((s) => s.value)).toEqual(data.gapLadder);
    expect(data.gapLadder[data.gapLadder.length - 1]).toBe(12);
    expect(data.distract).toHaveLength(12);
    expect(flat).toHaveLength(24);
    expect(flat).toEqual([0.5, 0.9, 0, -3, 0, 5.5, 0, 0, 0, 0.5, 0.5, 0, -3, 0, 5.5, 3, 0, -5.5, 0.5, 0, 0, 4, 0, -2]);
  });

  it('문이 h 를 보면 던진다', () => {
    const bad = structuredClone(gatedCellsFacet.initialData) as GatedCellsData;
    bad.weights.LSTM[0].w[1] = 0.1;
    expect(() => flattenWeights(readData(bad).weights)).toThrow();
  });
});

type Round = { kept: number[]; gates: number };

/** 가짜 reactive 문맥으로 알고리즘을 돌려 걸음 경계마다 계기를 모은다. */
async function runRounds(inputs: { type: string; payload: { value: number } }[]): Promise<{ rounds: Round[]; phases: string[][] }> {
  const metrics: Record<string, number> = {};
  const rounds: Round[] = [];
  const phases: string[][] = [];
  let current: Round = { kept: [], gates: 0 };
  let lit: string | null = null;
  let roundPhases: string[] = [];
  let cancelled = false;
  const queue = [...inputs];
  const boundary = (): void => {
    current.kept.push(metrics['kept-percent']);
    current.gates = metrics.gates;
    if (lit !== null) roundPhases.push(lit);
  };
  const ctx = {
    data: structuredClone(gatedCellsFacet.initialData),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      if (e.type === 'init') lit = null;
      if (e.type === 'phase') lit = (e.payload as { phase: string }).phase;
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      boundary();
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      boundary();
      rounds.push(current);
      phases.push(roundPhases);
      current = { kept: [], gates: 0 };
      roundPhases = [];
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
  };
  await gatedCellsAlgorithm(ctx as unknown as FacetContext<GatedCellsData>);
  return { rounds, phases };
}

describe('gated-cells — 회차별 계기', () => {
  it('셀 LSTM → RNN → LSTM 으로 돌려도 회차마다 사양 값이다', async () => {
    const { rounds, phases } = await runRounds([
      { type: 'cell', payload: { value: 0 } },
      { type: 'cell', payload: { value: 2 } },
    ]);
    expect(rounds).toHaveLength(3);
    expect(rounds[0]).toEqual({ kept: [0, ...SPEC_STEPS_GAP6.LSTM], gates: 3 });
    expect(rounds[1]).toEqual({ kept: [0, ...SPEC_STEPS_GAP6.RNN], gates: 0 });
    expect(rounds[2]).toEqual({ kept: [0, ...SPEC_STEPS_GAP6.LSTM], gates: 3 });
    expect(phases[1]).toEqual([...Array(7).fill('rnn-step'), 'kept-share']);
  });

  it('사이 6 → 12 → 2 → 6 과 셀 GRU 에서 끝 값과 걸음 수가 맞다', async () => {
    const { rounds } = await runRounds([
      { type: 'gap', payload: { value: 12 } },
      { type: 'gap', payload: { value: 2 } },
      { type: 'cell', payload: { value: 1 } },
      { type: 'gap', payload: { value: 6 } },
    ]);
    const ends = rounds.map((r) => [r.kept.length, r.kept[r.kept.length - 1], r.gates]);
    expect(ends).toEqual([
      [9, 94, 3],
      [15, 89, 3],
      [5, 98, 3],
      [5, 99, 2],
      [9, 96, 2],
    ]);
    expect(rounds[4].kept).toEqual([0, ...SPEC_STEPS_GAP6.GRU]);
  });
});

describe('gated-cells — 무대', () => {
  it('걸음과 끝의 글자가 payload 의 값을 띄운다', () => {
    const container = document.createElement('div');
    const inst = mountView(gatedCellsStageView, container, { config: {}, locale: 'en' });
    const stage = inst as unknown as GatedCellsStage;
    const xs = [2, 0.5, -0.5];
    stage.setup({ cell: 'LSTM', lanes: [{ id: 'c', value: 0 }, { id: 'h', value: 0 }], carried: 'c', gateIds: ['f', 'i', 'o'], candidateId: 'g', xs }, 0);
    const run = runCell('LSTM', xs, flat);
    run.steps.forEach((s, k) => {
      stage.step(
        {
          step: k + 1,
          x: s.x,
          gates: s.gates,
          candidate: s.candidate,
          lanes: [{ id: 'c', value: s.c }, { id: 'h', value: s.h }],
          factor: k === 0 ? null : s.factor,
          kept: s.kept,
        },
        0,
      );
    });
    stage.finish({ kept: run.kept, count: 2, lo: 0.98, hi: 1 }, 0);
    const text = container.textContent ?? '';
    expect(text).toContain('End · 2 multiplied shares, from 0.98 to 1.00 · kept share 0.98');
    expect(text).toContain('−0.24');
    inst.destroy();
  });

  it('첫 그림(init)을 두 번 먹여도 요소 수가 같다 — 되짚기 · 되돌리기에 무대가 늘지 않는다', () => {
    const container = document.createElement('div');
    const inst = mountView(gatedCellsStageView, container, { config: {}, locale: 'en' });
    const stage = inst as unknown as GatedCellsStage;
    const view = { cell: 'LSTM', lanes: [{ id: 'c', value: 0 }, { id: 'h', value: 0 }], carried: 'c', gateIds: ['f', 'i', 'o'], candidateId: 'g', xs: [2, 0.5, -0.5] };
    stage.setup(view, 0);
    const once = container.querySelectorAll('*').length;
    stage.setup(view, 0);
    expect(container.querySelectorAll('*').length).toBe(once);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    inst.destroy();
  });
});
