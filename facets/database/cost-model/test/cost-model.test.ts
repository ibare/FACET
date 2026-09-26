// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { makeTranslator, mountView, type FacetContext } from '@ffacet/core/runtime';
import {
  costModelAlgorithm,
  costModelFacet,
  costModelImperativeIR,
  costModelProjector,
  costModelRound,
  costModelStageView,
  type CostModelData,
} from '../src/index.js';

const data = costModelFacet.initialData as CostModelData;

/** 사양 실측표 (python3 sim.py cost-model) — 대조용 */
const SPEC: Record<string, { est: number; idx: number; actual: number; err: number; chosen: 0 | 1; better: 0 | 1; pages: number; other: number }> = {
  '0:1': { est: 40, idx: 43, actual: 80, err: 40, chosen: 1, better: 0, pages: 83, other: 50 },
  '0:2': { est: 48, idx: 51, actual: 80, err: 32, chosen: 0, better: 0, pages: 50, other: 83 },
  '0:5': { est: 70, idx: 73, actual: 80, err: 10, chosen: 0, better: 0, pages: 50, other: 83 },
  '0:10': { est: 80, idx: 83, actual: 80, err: 0, chosen: 0, better: 0, pages: 50, other: 83 },
  '1:1': { est: 80, idx: 83, actual: 45, err: 35, chosen: 0, better: 1, pages: 50, other: 48 },
  '1:2': { est: 64, idx: 67, actual: 45, err: 19, chosen: 0, better: 1, pages: 50, other: 48 },
  '1:5': { est: 50, idx: 53, actual: 45, err: 5, chosen: 0, better: 1, pages: 50, other: 48 },
  '1:10': { est: 45, idx: 48, actual: 45, err: 0, chosen: 1, better: 1, pages: 48, other: 50 },
};

const SPEC_BINS: Record<number, number[]> = {
  1: [400],
  2: [240, 160],
  5: [40, 120, 140, 70, 30],
  10: [10, 30, 50, 70, 80, 60, 45, 25, 20, 10],
};

type Slider = { action: string; segments: { value: number; label: unknown; default?: boolean }[] };
function slider(action: string): Slider {
  const controls = (costModelFacet.blocks.controls as { controls: unknown[] }).controls;
  const found = controls.find((c) => (c as { action?: string }).action === action);
  if (!found) throw new Error(`손잡이 ${action} 가 없다`);
  return found as Slider;
}

describe('cost-model — 사다리와 자료', () => {
  it('사다리가 segments 의 값과 같다', () => {
    expect(slider('bins').segments.map((s) => s.value)).toEqual(data.binLadder);
    expect(slider('range').segments.map((s) => s.value)).toEqual(data.ranges.map((_, i) => i));
    expect(slider('range').segments.map((s) => s.label)).toEqual(data.ranges.map((r) => `[${r.lo}, ${r.hi})`));
    expect(slider('bins').segments.find((s) => s.default)?.value).toBe(data.startBins);
    expect(slider('range').segments.find((s) => s.default)?.value).toBe(data.startRange);
    expect(data.binLadder).toEqual([1, 2, 5, 10]);
    expect(data.decades).toHaveLength(10);
    expect(data.binLadder[data.binLadder.length - 1]).toBe(data.decades.length);
  });

  it('질의 SQL 의 경계가 범위 사다리와 같다', () => {
    data.ranges.forEach((r, i) => {
      expect(data.queries[i]).toBe(`SELECT * FROM people WHERE age >= ${r.lo} AND age < ${r.hi}`);
    });
  });

  it('통계가 사양의 통 표와 같다 (통 5 = estimate-from-stats)', () => {
    for (const k of data.binLadder) expect(costModelRound(data, k, 0).binRows).toEqual(SPEC_BINS[k]);
  });
});

describe('cost-model — 알고리즘 셈 ↔ 사양 표 ↔ IR', () => {
  for (let ri = 0; ri < data.ranges.length; ri++) {
    for (const k of data.binLadder) {
      it(`범위 ${ri} · 통 ${k}`, () => {
        const r = costModelRound(data, k, ri);
        const spec = SPEC[`${ri}:${k}`]!;
        expect(r.estimate).toBe(spec.est);
        expect(r.indexEstimate).toBe(spec.idx);
        expect(r.seqEstimate).toBe(50);
        expect(r.actualRows).toBe(spec.actual);
        expect(r.error).toBe(spec.err);
        expect(r.chosen).toBe(spec.chosen);
        expect(r.better).toBe(spec.better);
        expect(r.pagesRead).toBe(spec.pages);
        expect(r.chosen === 1 ? r.seqActual : r.indexActual).toBe(spec.other);
        // 동률은 이 데이터에서 걸리지 않는다
        expect(r.indexEstimate).not.toBe(r.seqEstimate);

        const buf = new Array<number>(10).fill(0);
        const pages = runIR(costModelImperativeIR, 'chosenPathPages', [
          [...data.decades],
          buf,
          k,
          data.span,
          data.ranges[ri]!.lo,
          data.ranges[ri]!.hi,
          r.tablePages,
          data.descend,
        ]);
        expect(pages).toBe(r.pagesRead);
        expect(buf.slice(0, k)).toEqual(r.binRows);
        const est = runIR(costModelImperativeIR, 'estimateRows', [buf, k, data.span, data.ranges[ri]!.lo, data.ranges[ri]!.hi]);
        expect(est).toBe(r.estimate);
        const actual = runIR(costModelImperativeIR, 'countRows', [[...data.decades], data.ranges[ri]!.lo, data.ranges[ri]!.hi]);
        expect(actual).toBe(r.actualRows);
      });
    }
  }
});

/** 가짜 reactive ctx — 입력이 떨어지면 취소한다 */
async function play(inputs: { type: string; value: number }[]) {
  const totals: Record<string, number> = {};
  const rounds: Record<string, number>[] = [];
  const types: string[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: { type: string; payload?: unknown }) {
      types.push(e.type);
      // 한 판의 끝 — 마지막 걸음의 계기가 실린 뒤
      if (e.type === 'phase' && (e.payload as { phase?: unknown }).phase === 'actual-cost') rounds.push({ ...totals });
    },
    metric(name: string, delta: number | 'inc') {
      totals[name] = (totals[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: next.type, payload: { value: next.value, segmentIndex: 0 } };
    },
  };
  await costModelAlgorithm(ctx as unknown as FacetContext<CostModelData>);
  return { rounds, types };
}

describe('cost-model — 회차별 계기', () => {
  it('손잡이를 A → B → A 로 돌려도 회차마다 사양 표와 같다', async () => {
    const { rounds, types } = await play([
      { type: 'bins', value: 1 },
      { type: 'bins', value: 5 },
      { type: 'range', value: 1 },
      { type: 'bins', value: 10 },
      { type: 'noise', value: 3 },
      { type: 'range', value: 0 },
    ]);
    const expected = ['0:5', '0:1', '0:5', '1:5', '1:10', '0:10'];
    expect(rounds).toHaveLength(expected.length);
    rounds.forEach((m, i) => {
      const spec = SPEC[expected[i]!]!;
      expect(m).toEqual({ 'estimated-rows': spec.est, 'actual-rows': spec.actual, 'pages-read': spec.pages });
    });
    // 한 판 = 걸음 다섯 (round · cut · pick · actual · cost)
    expect(types.filter((x) => x === 'round')).toHaveLength(expected.length);
    expect(types.filter((x) => x === 'phase')).toHaveLength(expected.length * 5);
  });
});

describe('cost-model — 사다리 밖 입력', () => {
  it('제 손잡이의 사다리 밖 값은 던진다', async () => {
    await expect(play([{ type: 'bins', value: 7 }])).rejects.toThrow('사다리');
    await expect(play([{ type: 'range', value: 2 }])).rejects.toThrow('사다리');
  });
});

describe('cost-model — 무대', () => {
  it('한 판을 그리면 캡션의 수가 셈한 값과 같다', async () => {
    const container = document.createElement('div');
    const t = makeTranslator('en');
    const stage = mountView(costModelStageView, container, { config: {}, initialData: data, t });
    const events: { type: string; payload?: unknown }[] = [];
    let n = 0;
    const ctx = {
      data,
      cancelled: false,
      async emit(e: { type: string; payload?: unknown }) {
        events.push(e);
      },
      metric() {},
      async sleep() {
        return true;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        n++;
        ctx.cancelled = true;
        throw new Error('cancelled');
      },
    };
    await costModelAlgorithm(ctx as unknown as FacetContext<CostModelData>);
    expect(n).toBe(1);
    const projector = costModelProjector({ stage }, { getSpeed: () => 1, t });
    const texts = (): string => Array.from(container.querySelectorAll('text')).map((x) => x.textContent).join(' | ');
    for (const e of events) {
      await projector.onEvent(e as never);
      if (e.type === 'cut') expect(texts()).toContain('Estimated rows: 70');
      if (e.type === 'actual') expect(texts()).toContain('Actual rows: 80 · Error: 10');
    }
    expect(texts()).toContain('SELECT * FROM people WHERE age >= 40 AND age < 50');
    expect(texts()).toContain('Pages read: 50');
    expect(texts()).toContain('Would read: 83');
    stage.destroy();
  });
});
