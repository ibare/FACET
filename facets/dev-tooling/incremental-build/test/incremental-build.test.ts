// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { makeTranslator, mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  incrementalBuildAlgorithm,
  incrementalBuildFacet,
  incrementalBuildImperativeIR,
  incrementalBuildPlan,
  incrementalBuildProjector,
  incrementalBuildStageView,
  toMinutes,
  type IncrementalBuildData,
  type IncrementalBuildRule,
} from '../src/index.js';

const data = incrementalBuildFacet.initialData as IncrementalBuildData;

/** measure.py 의 순열 넷 (첫 것은 그대로) */
const ORDERS = [
  ['lex.o', 'parse.o', 'emit.o', 'front.a', 'tool'],
  ['tool', 'front.a', 'emit.o', 'parse.o', 'lex.o'],
  ['parse.o', 'front.a', 'lex.o', 'emit.o', 'tool'],
  ['emit.o', 'front.a', 'tool', 'lex.o', 'parse.o'],
];
const VISITS = [
  ['lex.o', 'parse.o', 'emit.o', 'front.a', 'tool'],
  ['emit.o', 'parse.o', 'lex.o', 'front.a', 'tool'],
  ['parse.o', 'lex.o', 'front.a', 'emit.o', 'tool'],
  ['emit.o', 'lex.o', 'parse.o', 'front.a', 'tool'],
];
const withOrder = (names: string[]): IncrementalBuildData => ({
  ...data,
  rules: names.map((n) => {
    const r = data.rules.find((x) => x.target === n);
    if (!r) throw new Error(n);
    return r;
  }),
});

function irCall(d: IncrementalBuildData, policy: number, change: number) {
  const plan = incrementalBuildPlan(d, policy, change);
  const S = d.sources.length;
  const T = d.rules.length;
  const m = S + T;
  const index = new Map<string, number>();
  d.sources.forEach((s, i) => index.set(s.name, i));
  d.rules.forEach((r, i) => index.set(r.target, S + i));
  const needs = new Array<number>(T * m).fill(0);
  d.rules.forEach((r: IncrementalBuildRule, ti) => {
    for (const i of r.inputs) needs[ti * m + (index.get(i) as number)] = 1;
  });
  const stamp = [
    ...d.sources.map((s) => (s.name === d.edited ? toMinutes(d.saveAt) : toMinutes(s.savedAt))),
    ...d.rules.map((r) => toMinutes(r.builtAt)),
  ];
  const marked = [...d.sources.map((s) => (plan.srcFpOld[s.name] !== plan.srcFpNew[s.name] ? 1 : 0)), ...d.rules.map(() => 0)];
  const outSame = d.rules.map((r) => (plan.outFresh[r.target] === plan.outOld[r.target] ? 1 : 0));
  const visited = d.rules.map(() => 0);
  const verdict = d.rules.map(() => 0);
  const ret = runIR(incrementalBuildImperativeIR, 'countRebuilt', [
    policy, S, T, needs, stamp, marked, outSame, visited, verdict, toMinutes(d.saveAt),
  ]);
  return { plan, ret, verdict, stamp, S, needs };
}

const CODE: Record<string, number> = { keep: 0, rebuild: 1, hold: 2 };

describe('incremental-build — 사양 대조', () => {
  it('지문 대조표', () => {
    const p1 = incrementalBuildPlan(data, 1, 1);
    expect(p1.srcFpOld).toEqual({ 'lex.c': '26b3939c', 'parse.c': 'de0c9e9a', 'emit.c': 'c4c89815', 'util.h': 'a0dd15bb' });
    expect(incrementalBuildPlan(data, 1, 0).srcFpNew['lex.c']).toBe('26b3939c');
    expect(p1.srcFpNew['lex.c']).toBe('ef96b1b4');
    expect(incrementalBuildPlan(data, 1, 2).srcFpNew['lex.c']).toBe('1936cf81');
    const last = { 'lex.o': 'df4a6058', 'parse.o': '9230b34a', 'emit.o': '13e89ed7', 'front.a': '7a50091d', tool: '9be7e08e' };
    expect(p1.outOld).toEqual(last);
    expect(incrementalBuildPlan(data, 1, 0).outFresh).toEqual(last);
    expect(p1.outFresh).toEqual(last);
    expect(incrementalBuildPlan(data, 1, 2).outFresh).toEqual({
      ...last, 'lex.o': 'c6de17a3', 'front.a': '0bbfc2ed', tool: '2e831105',
    });
  });

  it('실측표 — 다시 세운 수 (그대로) [다시 세운 대상]', () => {
    const want = [
      [[3, 'lex.o front.a tool'], [3, 'lex.o front.a tool'], [3, 'lex.o front.a tool']],
      [[0, ''], [3, 'lex.o front.a tool'], [3, 'lex.o front.a tool']],
      [[0, ''], [1, 'lex.o'], [3, 'lex.o front.a tool']],
    ] as const;
    for (let p = 0; p < 3; p++) {
      for (let c = 0; c < 3; c++) {
        const plan = incrementalBuildPlan(data, p, c);
        const cell = want[p]?.[c];
        expect(plan.rebuilt).toBe(cell?.[0]);
        expect(plan.kept).toBe(5 - (cell?.[0] ?? -1));
        expect(plan.steps.filter((s) => s.verdict !== 'keep').map((s) => s.name).join(' ')).toBe(cell?.[1]);
        expect(plan.order).toEqual(VISITS[0]);
      }
    }
    const held = incrementalBuildPlan(data, 2, 1).steps.find((s) => s.name === 'lex.o');
    expect(held?.verdict).toBe('hold');
    const timeRun = incrementalBuildPlan(data, 0, 1);
    expect(timeRun.steps.map((s) => s.timeAfter)).toEqual(['10:06', '09:11', '09:12', '10:07', '10:08']);
    expect(timeRun.steps[0]?.cause).toEqual({ kind: 'time', input: 'lex.c', inputTime: '10:05', targetTime: '09:10' });
    expect(timeRun.steps[3]?.cause).toEqual({ kind: 'time', input: 'lex.o', inputTime: '10:06', targetTime: '09:13' });
    // 시각 × 그대로 저장 · 주석만: 다시 세운 셋 모두 결과가 지난번과 같다 (헛일)
    for (const c of [0, 1]) {
      expect(incrementalBuildPlan(data, 0, c).steps.filter((s) => s.verdict === 'rebuild').every((s) => s.outSame)).toBe(true);
    }
  });

  it('모르는 입력 이름과 고리는 던진다', () => {
    expect(() => incrementalBuildPlan({ ...data, rules: [...data.rules, { target: 'x', inputs: ['nope'], builtAt: '09:00' }] }, 1, 1)).toThrow(/모르는 입력/);
    expect(() => incrementalBuildPlan({
      ...data,
      rules: [...data.rules, { target: 'a', inputs: ['b'], builtAt: '09:00' }, { target: 'b', inputs: ['a'], builtAt: '09:00' }],
    }, 1, 1)).toThrow(/고리/);
  });
});

describe('incremental-build — IR ↔ algorithm', () => {
  it('아홉 칸 × 규칙 차례 넷 — 돌려준 값 · 판정 · 새 시각', () => {
    expect(data.buildMinutes).toBe(1); // IR 의 시계는 1 분씩 간다
    let runs = 0;
    ORDERS.forEach((names, k) => {
      const d = withOrder(names);
      for (let p = 0; p < 3; p++) {
        for (let c = 0; c < 3; c++) {
          const { plan, ret, verdict, stamp, S } = irCall(d, p, c);
          expect(plan.order).toEqual(VISITS[k]);
          expect(ret).toBe(plan.rebuilt);
          d.rules.forEach((r, ti) => {
            const step = plan.steps.find((s) => s.name === r.target);
            expect(verdict[ti]).toBe(CODE[step?.verdict ?? '']);
            expect(stamp[S + ti]).toBe(plan.timeNew[r.target]);
          });
          runs += 1;
        }
      }
    });
    expect(runs).toBe(36);
  });

  it('매개변수 길이 · 중간값', () => {
    const { needs, stamp } = irCall(data, 0, 2);
    expect(needs.length).toBe(5 * 9);
    expect(Math.max(...stamp)).toBe(608);
  });
});

type Ev = FacetRuntimeEvent;

/** 가짜 reactive ctx — 입력 차례를 받아 판마다 계기 · 이벤트를 모은다 */
async function play(inputs: { type: string; value: number }[]) {
  const events: Ev[][] = [[]];
  const metrics: Record<string, number>[] = [{}];
  const totals: Record<string, number> = {};
  let cancelled = false;
  let queue = [...inputs];
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: Ev) {
      (events[events.length - 1] as Ev[]).push(e);
    },
    metric(name: string, delta: number | 'inc') {
      totals[name] = (totals[name] ?? 0) + (delta === 'inc' ? 1 : delta);
      (metrics[metrics.length - 1] as Record<string, number>)[name] = totals[name] as number;
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      const next = queue[0];
      queue = queue.slice(1);
      if (!next) {
        cancelled = true;
        return { type: 'none' };
      }
      events.push([]);
      metrics.push({});
      return { type: next.type, payload: { value: next.value } };
    },
  };
  await incrementalBuildAlgorithm(ctx as unknown as FacetContext<IncrementalBuildData>);
  return { events, metrics };
}

describe('incremental-build — 회차별 계기', () => {
  it('판정 1 → 2 → 1 (주석만)', async () => {
    const { metrics, events } = await play([{ type: 'policy', value: 2 }, { type: 'policy', value: 1 }]);
    expect(metrics.map((m) => [m.rebuilt, m.kept])).toEqual([[3, 2], [1, 4], [3, 2]]);
    expect(events.every((run) => run.filter((e) => e.type === 'phase').length === 5 + (run.some((e) => e.type === 'verdict' && (e.payload as { verdict: string }).verdict === 'hold') ? 1 : 0))).toBe(true);
  });
  it('고친 모양 1 → 0 (입력 지문)', async () => {
    const { metrics } = await play([{ type: 'change', value: 0 }]);
    expect(metrics.map((m) => [m.rebuilt, m.kept])).toEqual([[3, 2], [0, 5]]);
  });
  it('사다리에 없는 값은 흘린다', async () => {
    const { metrics } = await play([{ type: 'policy', value: 7 }, { type: 'change', value: 2 }]);
    const runs = metrics.filter((m) => Object.keys(m).length > 0);
    expect(runs.map((m) => [m.rebuilt, m.kept])).toEqual([[3, 2], [3, 2]]);
  });
});

describe('incremental-build — 선언', () => {
  it('사다리가 segments 와 같다', () => {
    const controls = (incrementalBuildFacet.blocks.controls as { controls: { action?: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const seg = (a: string) => controls.find((c) => c.action === a)?.segments ?? [];
    expect(seg('policy').map((s) => s.value)).toEqual(data.policyLadder);
    expect(seg('change').map((s) => s.value)).toEqual(data.changeLadder);
    expect(seg('policy').find((s) => s.default)?.value).toBe(data.policy);
    expect(seg('change').find((s) => s.default)?.value).toBe(data.change);
    expect(data.policyLadder[data.policyLadder.length - 1]).toBe(2);
    expect(data.changeLadder[data.changeLadder.length - 1]).toBe(2);
  });
});

describe('incremental-build — 화면', () => {
  it('막힘 표지가 출력 지문 × 주석만 에서 lex.o 위, 입력 지문 × 그대로 저장 에서 lex.c 위에 선다', async () => {
    const container = document.createElement('div');
    const t = makeTranslator('ko', incrementalBuildFacet.messages);
    const stage = mountView(incrementalBuildStageView, container, { config: {}, locale: 'ko', t });
    const projector = incrementalBuildProjector({ stage }, { getSpeed: () => 1, t });
    const { events } = await play([{ type: 'policy', value: 2 }, { type: 'policy', value: 1 }, { type: 'change', value: 0 }]);
    const reachOf = (run: Ev[]) => run.filter((e) => e.type === 'reach').map((e) => e.payload as { at: string; state: string }).pop();
    expect(reachOf(events[0] as Ev[])).toEqual({ at: 'tool', state: 'top' });
    expect(reachOf(events[1] as Ev[])).toEqual({ at: 'lex.o', state: 'blocked' });
    expect(reachOf(events[3] as Ev[])).toEqual({ at: 'lex.c', state: 'blocked' });
    for (const e of events[1] as Ev[]) await projector.onEvent(e);
    const text = container.textContent ?? '';
    expect(text).toContain('여기서 막힘');
    expect(text).toContain('결과 같음');
    const run1 = events[1] as Ev[];
    const holdAt = run1.findIndex((e) => e.type === 'verdict' && (e.payload as { verdict: string }).verdict === 'hold');
    const again = document.createElement('div');
    const stage2 = mountView(incrementalBuildStageView, again, { config: {}, locale: 'ko', t });
    const projector2 = incrementalBuildProjector({ stage: stage2 }, { getSpeed: () => 1, t });
    for (const e of run1.slice(0, holdAt + 1)) await projector2.onEvent(e);
    expect(again.textContent ?? '').toContain('결과 같음: lex.o — lex.c 지문 26b393 → ef96b1');
  });
});
