// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import {
  adamAlgorithm,
  adamFacet,
  adamImperativeIR,
  adamProjector,
  adamStageView,
  runPath,
  shareGone,
  sharePercent,
  type AdamData,
  type AdamRuleId,
} from '../src/index.js';

const data = adamFacet.initialData as unknown as AdamData;

type Input = { type: string; payload: { value: number } };

/** reactive 문맥을 흉내 낸다 — 입력이 바닥나면 취소로 끝낸다 */
async function drive(inputs: Input[]) {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const metricAtRoundEnd: Record<string, number>[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      metricAtRoundEnd.push(Object.fromEntries(metrics));
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
    pollInput() {
      return null;
    },
  } as unknown as ReactiveContext<AdamData>;
  await adamAlgorithm(ctx);
  return { events, metricAtRoundEnd };
}

const pct = (xs: number[], x0: number) => xs.map((x) => sharePercent(shareGone(x, x0)));

describe('adam — 사다리 · 데이터', () => {
  it('두 사다리가 segments 와 같다', () => {
    const controls = (adamFacet.blocks.controls as { controls: unknown[] }).controls as {
      action?: string;
      segments?: { value: number }[];
    }[];
    const seg = (a: string) => controls.find((c) => c.action === a)?.segments?.map((s) => s.value);
    expect(seg('rule')).toEqual(data.ruleIds.map((_, i) => i));
    expect(seg('ratio')).toEqual(data.ratioLadder);
    expect(data.ratioLadder).toEqual([1, 10, 100, 1000]);
    expect(data.ruleIds).toEqual(['gd', 'adam']);
    expect(runPath(data, 'adam', 100)).toHaveLength(42);
  });
});

describe('adam — IR 과 algorithm 이 같은 길', () => {
  const rules: AdamRuleId[] = ['gd', 'adam'];
  for (const rule of rules) {
    for (const r of data.ratioLadder) {
      it(`${rule} × r ${r}: path 가 걸음마다 같다`, async () => {
        const path = new Array<number>(2 * (data.steps + 1)).fill(0);
        path[0] = data.a0;
        path[1] = data.b0;
        if (rule === 'adam') {
          runIR(adamImperativeIR, 'adamRun', [path, r, data.etaAdam, data.beta1, data.beta2, data.eps]);
        } else {
          runIR(adamImperativeIR, 'gdRun', [path, r, data.etaGd]);
        }
        const ruleIndex = data.ruleIds.indexOf(rule);
        const inputs: Input[] = [];
        if (ruleIndex !== data.rule) inputs.push({ type: 'rule', payload: { value: ruleIndex } });
        if (r !== data.ratio) inputs.push({ type: 'ratio', payload: { value: r } });
        const { events } = await drive(inputs);
        // 마지막 판의 (a, b)
        const lastRound = events.map((e) => e.type).lastIndexOf('round');
        const shown: number[] = [];
        for (const e of events.slice(lastRound)) {
          if (e.type === 'round' || e.type === 'update') {
            const p = e.payload as { a: number; b: number };
            shown.push(p.a, p.b);
          }
        }
        expect(shown).toEqual(path);
      });
    }
  }
});

describe('adam — 사양 대조', () => {
  it('끝 자리와 간 몫이 실측표와 같다', () => {
    const table: Record<number, { gd: [string, string, number, number]; adam: [string, string, number, number] }> = {
      1: { gd: ['0.00', '0.00', 100, 100], adam: ['0.11', '0.11', 89, 89] },
      10: { gd: ['0.00', '0.12', 100, 88], adam: ['0.11', '0.11', 89, 89] },
      100: { gd: ['0.00', '0.82', 100, 18], adam: ['0.11', '0.11', 89, 89] },
      1000: { gd: ['0.00', '0.98', 100, 2], adam: ['0.11', '0.11', 89, 89] },
    };
    for (const r of data.ratioLadder) {
      for (const rule of ['gd', 'adam'] as const) {
        const path = runPath(data, rule, r);
        const a = path[40] as number;
        const b = path[41] as number;
        const row = table[r]?.[rule];
        expect(row).toBeDefined();
        expect([a.toFixed(2), b.toFixed(2), sharePercent(shareGone(a, 1)), sharePercent(shareGone(b, 1))]).toEqual(row);
      }
    }
  });

  it('b 간 몫 열이 사양과 같다', () => {
    const bs = (rule: AdamRuleId, r: number) => pct(runPath(data, rule, r).filter((_, i) => i % 2 === 1).slice(1), 1);
    const adamSeq = [5, 10, 15, 20, 25, 30, 35, 39, 44, 49, 53, 58, 62, 66, 71, 75, 78, 82, 86, 89];
    for (const r of data.ratioLadder) expect(bs('adam', r)).toEqual(adamSeq);
    expect(bs('gd', 1)).toEqual(new Array(20).fill(100));
    expect(bs('gd', 10)).toEqual([10, 19, 27, 34, 41, 47, 52, 57, 61, 65, 69, 72, 75, 77, 79, 81, 83, 85, 86, 88]);
    expect(bs('gd', 100)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 12, 13, 14, 15, 16, 17, 17, 18]);
    expect(bs('gd', 1000)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
    // 경사 하강의 a 는 첫 갱신에 정확히 0
    expect(runPath(data, 'gd', 100)[2]).toBe(0);
  });

  it('Adam × r 100 대조 걸음', () => {
    const p = runPath(data, 'adam', 100);
    const at = (t: number) => [(p[2 * t] as number).toFixed(3), (p[2 * t + 1] as number).toFixed(3)];
    expect(at(1)).toEqual(['0.950', '0.950']);
    expect(at(2)).toEqual(['0.900', '0.900']);
    expect(at(5)).toEqual(['0.751', '0.751']);
    expect(at(10)).toEqual(['0.512', '0.512']);
    expect(at(15)).toEqual(['0.294', '0.294']);
    expect(at(20)).toEqual(['0.111', '0.111']);
  });
});

describe('adam — 걸음 · phase · 계기', () => {
  it('판 하나는 걸음 21, 갱신 걸음마다 바로 앞이 그 규칙의 phase', async () => {
    const { events } = await drive([{ type: 'rule', payload: { value: 0 } }]);
    const loud = events.filter((e) => !e.silent);
    expect(loud).toHaveLength(42);
    events.forEach((e, i) => {
      if (e.type === 'update') {
        const prev = events[i - 1];
        const rounds = events.slice(0, i).filter((x) => x.type === 'round').length;
        expect(prev?.type).toBe('phase');
        expect((prev?.payload as { phase: string }).phase).toBe(rounds === 1 ? 'adam-step' : 'gd-step');
      }
      if (e.type === 'round') expect(events[i - 1]?.type).not.toBe('phase');
    });
  });

  it('회차별 계기 — Adam × 100 → 경사 하강 × 100 → Adam × 100', async () => {
    const { metricAtRoundEnd } = await drive([
      { type: 'rule', payload: { value: 0 } },
      { type: 'rule', payload: { value: 1 } },
    ]);
    expect(metricAtRoundEnd.map((m) => m['gentle-share'])).toEqual([89, 18, 89]);
    expect(metricAtRoundEnd.map((m) => m['steep-share'])).toEqual([89, 100, 89]);
  });

  it('사다리 밖 입력은 던진다', async () => {
    await expect(drive([{ type: 'ratio', payload: { value: 50 } }])).rejects.toThrow();
  });
});

describe('adam — 무대', () => {
  it('첫 그림을 두 번 먹여도 요소 수가 같고, reset 이 결론을 걷는다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(adamStageView, container, { config: {}, locale: 'ko' });
    const projector = adamProjector({ stage }, { getSpeed: () => 1, t: (_k, en) => en });
    const { events } = await drive([]);
    projector.onInit?.(data);
    for (const e of events) void projector.onEvent(e);
    const count = container.querySelectorAll('*').length;
    projector.onReset?.();
    projector.onInit?.(data);
    for (const e of events) void projector.onEvent(e);
    expect(container.querySelectorAll('*').length).toBe(count);
    projector.onReset?.();
    const texts = [...container.querySelectorAll('text')].map((x) => x.textContent).join('|');
    expect(texts).not.toContain('%');
    stage.destroy();
  });
});
