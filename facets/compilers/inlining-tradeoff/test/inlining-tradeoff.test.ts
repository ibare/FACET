// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetContext } from '@ffacet/core/runtime';
import {
  costInputs,
  inliningTradeoffAlgorithm,
  inliningTradeoffFacet,
  inliningTradeoffImperativeIR,
  inliningTradeoffInitialData,
  inliningTradeoffProjector,
  inliningTradeoffStageView,
  planInlining,
  type InliningTradeoffData,
} from '../src/index.js';

const data = inliningTradeoffInitialData;

/** 사양 실측표 — 한계 → 크기 · 실행 · 붙인 자리 · main 명령 */
const TABLE: Record<number, { size: number; exec: number; pasted: number; mainLen: number }> = {
  0: { size: 26, exec: 49, pasted: 0, mainLen: 10 },
  1: { size: 26, exec: 43, pasted: 3, mainLen: 10 },
  4: { size: 35, exec: 37, pasted: 6, mainLen: 19 },
  8: { size: 49, exec: 33, pasted: 8, mainLen: 33 },
};

function irCost(bodyLen: number[], siteCallee: number[], mainLen: number, limit: number): number[] {
  const stats = [0, 0, 0];
  const ran = runIR(inliningTradeoffImperativeIR, 'programCost', [bodyLen, siteCallee, mainLen, limit, stats]);
  expect(ran).toBe(stats[1]);
  return stats;
}

describe('inlining-tradeoff — 사양 표', () => {
  it('사다리가 segments 와 같고 기본값이 default 와 같다', () => {
    const controls = (inliningTradeoffFacet.blocks.controls as { controls: { widget?: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const slider = controls.find((c) => c.widget === 'segmented-slider');
    expect(slider?.segments?.map((s) => s.value)).toEqual(data.limitLadder);
    expect(slider?.segments?.find((s) => s.default)?.value).toBe(data.limit);
    expect(data.limitLadder).toHaveLength(4);
    expect(data.limitLadder[data.limitLadder.length - 1]).toBe(8);
    expect(data.program).toHaveLength(30);
  });

  it.each(data.limitLadder)('한계 %i — algorithm 이 표와 같다', (limit) => {
    const plan = planInlining(data.program, limit);
    expect(plan.start).toMatchObject({ size: 26, exec: 49 });
    expect(plan.steps).toHaveLength(3);
    expect(plan.total).toEqual(TABLE[limit]);
  });

  it('기본값(한계 4) 걸음마다 크기 · 실행 · 붙인 자리', () => {
    const plan = planInlining(data.program, 4);
    expect(plan.steps.map((s) => [s.fn, s.pasted, s.sites, s.size, s.exec, s.pastedSites])).toEqual([
      ['inc', true, 3, 26, 43, 3],
      ['mix', true, 3, 35, 37, 6],
      ['big', false, 2, 35, 37, 6],
    ]);
    expect(plan.steps[plan.steps.length - 1]!.main.map((l) => l.text)).toEqual([
      't14 = a + 1', 't23 = t14 * t14', 't24 = t23 + t14', 't25 = t24 * 2', 't15 = t25 - 1', 't16 = call big(t15)',
      't17 = b + 1', 't26 = t17 * t17', 't27 = t26 + t17', 't28 = t27 * 2', 't18 = t28 - 1', 't19 = call big(t18)',
      't20 = t16 + t19', 't21 = t20 + 1', 't29 = t21 * t21', 't30 = t29 + t21', 't31 = t30 * 2', 't22 = t31 - 1', 'return t22',
    ]);
  });

  it('한계 8 — big 의 새 임시는 t32 … t45, main 33 줄', () => {
    const main = planInlining(data.program, 8).steps[2]!.main.map((l) => l.text);
    expect(main).toHaveLength(33);
    expect(main.slice(5, 13)).toEqual([
      't32 = t15 + 1', 't33 = t32 * 2', 't34 = t33 - t15', 't35 = t34 * 3', 't36 = t15 * 5', 't37 = t35 + t36', 't38 = t37 - 7', 't16 = t38 + t15',
    ]);
    expect(main[25]).toBe('t19 = t45 + t18');
  });

  it('부른 자리 하나의 값 — inc +0 · −2, mix +3 · −2, big +7 · −2', () => {
    const d = planInlining(data.program, 8).steps.map((s) => [s.dSize / s.sites, s.dExec / s.sites]);
    expect(d).toEqual([[0, -2], [3, -2], [7, -2]]);
  });
});

describe('inlining-tradeoff — IR ↔ algorithm', () => {
  const inputs = costInputs(data.program);

  it('입력 배열의 길이', () => {
    expect(inputs.bodyLen).toEqual([2, 5, 9]);
    expect(inputs.siteCallee).toHaveLength(10);
    expect(inputs.mainLen).toBe(10);
  });

  it.each(data.limitLadder)('한계 %i — runIR 이 화면과 같다', (limit) => {
    const [size, exec, pasted] = irCost(inputs.bodyLen, inputs.siteCallee, inputs.mainLen, limit);
    const plan = planInlining(data.program, limit);
    expect({ size, exec, pasted }).toEqual({ size: plan.total.size, exec: plan.total.exec, pasted: plan.total.pasted });
  });

  it('함수 차례 · main 명령 차례를 섞어도 같다', () => {
    const perms = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ];
    const n = inputs.siteCallee.length;
    const mainOrders = [
      [...Array(n).keys()],
      [...Array(n).keys()].reverse(),
      [...Array(n).keys()].map((i) => (i * 3) % n),
      [...Array(n).keys()].map((i) => (i * 7 + 2) % n),
    ];
    for (const limit of data.limitLadder) {
      for (const fo of perms) {
        for (const mo of mainOrders) {
          const bodyLen = fo.map((f) => inputs.bodyLen[f]!);
          const siteCallee = mo.map((j) => {
            const c = inputs.siteCallee[j]!;
            return c < 0 ? -1 : fo.indexOf(c);
          });
          const [size, exec, pasted] = irCost(bodyLen, siteCallee, inputs.mainLen, limit);
          expect({ size, exec, pasted }).toEqual({ size: TABLE[limit]!.size, exec: TABLE[limit]!.exec, pasted: TABLE[limit]!.pasted });
        }
      }
    }
  });
});

/** 판을 끝까지 돌리는 가짜 reactive 문맥 — 입력 큐가 비면 취소한다 */
function fakeRun(inputs: number[]) {
  const totals: Record<string, number> = {};
  const rounds: Record<string, number>[] = [];
  const events: { type: string; payload?: unknown }[] = [];
  const queue = [...inputs];
  const ctx = {
    data: structuredClone(data) as InliningTradeoffData,
    cancelled: false,
    async emit(e: { type: string; payload?: unknown }) {
      events.push(e);
      if (e.type === 'total') rounds.push({ ...totals });
    },
    metric(name: string, delta: number | 'inc') {
      if (delta === 'inc') throw new Error('inc 를 쓰지 않는다');
      totals[name] = (totals[name] ?? 0) + delta;
    },
    async sleep() {
      return !ctx.cancelled;
    },
    async waitForInput() {
      const v = queue.shift();
      if (v === undefined) {
        ctx.cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'limit', payload: { value: v } };
    },
    pollInput() {
      return null;
    },
  };
  return { ctx, rounds, events };
}

describe('inlining-tradeoff — 회차별 계기', () => {
  it('한계 4 → 8 → 4 → 0 → 1 — 판마다 계기가 표와 같다 (쌓이지 않는다)', async () => {
    const { ctx, rounds } = fakeRun([8, 4, 0, 1]);
    await inliningTradeoffAlgorithm(ctx as unknown as FacetContext<InliningTradeoffData>);
    expect(rounds.map((r) => [r['code-size'], r['exec-count'], r['pasted-sites']])).toEqual(
      [4, 8, 4, 0, 1].map((l) => [TABLE[l]!.size, TABLE[l]!.exec, TABLE[l]!.pasted]),
    );
  });

  it('사다리 밖 · 남의 입력은 흘린다', async () => {
    const { ctx, rounds } = fakeRun([3, 8]);
    await inliningTradeoffAlgorithm(ctx as unknown as FacetContext<InliningTradeoffData>);
    expect(rounds).toHaveLength(2);
    expect(rounds[1]!['code-size']).toBe(49);
  });
});

describe('inlining-tradeoff — 무대', () => {
  it('판마다 main 줄 수가 셈한 main 명령 수와 같고, 새 판의 걸음 0 은 원래 열 줄이다', async () => {
    const { ctx, events } = fakeRun([8, 0]);
    await inliningTradeoffAlgorithm(ctx as unknown as FacetContext<InliningTradeoffData>);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(inliningTradeoffStageView, container, { config: {}, initialData: data, locale: 'en' });
    const projector = inliningTradeoffProjector({ stage }, { getSpeed: () => 1, t: (_k, fb) => fb });
    projector.onInit?.(data);
    const mainRows = (): number => container.querySelectorAll('[data-row]:not([data-leaving])').length;
    const seen: [string, number][] = [];
    for (const e of events) {
      await projector.onEvent(e as never);
      if (e.type === 'round-start' || e.type === 'total') seen.push([e.type, mainRows()]);
    }
    expect(seen).toEqual([
      ['round-start', 10], ['total', 19],
      ['round-start', 10], ['total', 33],
      ['round-start', 10], ['total', 10],
    ]);
    stage.destroy();
  });
});
