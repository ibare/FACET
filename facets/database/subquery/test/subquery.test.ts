// @vitest-environment happy-dom
/**
 * subquery 고유의 주장 — IR ↔ algorithm 전 조합, 사양 실측표 대조, 회차별 계기, 사다리.
 * (손잡이가 닿는가 · 덮이는 phase · transpiler 옮김 같은 공통분은 whole-check 가 잰다)
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  groupIndex,
  subqueryAlgorithm,
  subqueryFacet,
  subqueryImperativeIR,
  subqueryStageView,
  type SubqueryData,
  type SubqueryStage,
} from '../src/index.js';

const data = subqueryFacet.initialData as SubqueryData;

type Input = { type: string; payload: Record<string, unknown> };
type Round = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
  steps: number;
};

/** 알고리즘을 가짜 ctx 로 돌려 판마다 끊어 모은다. 입력이 다 떨어지면 취소한다. */
async function play(inputs: Input[]): Promise<Round[]> {
  const rounds: Round[] = [];
  let events: FacetRuntimeEvent[] = [];
  let steps = 0;
  const metrics: Record<string, number> = {};
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      steps += 1;
      return true;
    },
    async waitForInput() {
      rounds.push({ events, metrics: { ...metrics }, steps });
      events = [];
      steps = 0;
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
    pollInput() {
      return null;
    },
  } as unknown as ReactiveContext<SubqueryData>;
  await subqueryAlgorithm(ctx);
  return rounds;
}

function knob(type: 'form' | 'rows', value: number, form: number, rows: number): Input {
  return { type, payload: { value, segmentIndex: 0, form: String(form), rows: String(rows) } };
}

/** 한 조합의 판 — 시작 판(0, 4)에서 손잡이 둘을 돌려 닿는다 */
async function roundOf(form: number, n: number): Promise<Round> {
  const rounds = await play([knob('form', form, form, 4), knob('rows', n, form, n)]);
  const last = rounds[rounds.length - 1];
  if (last === undefined) throw new Error('판이 없다');
  return last;
}

function payloadsOf(round: Round, type: string): Record<string, unknown>[] {
  return round.events.filter((e) => e.type === type).map((e) => e.payload as Record<string, unknown>);
}

// 사양 실측표 (sim.py subquery) — 대조용
const SPEC: Array<{ form: number; n: number; runs: number; reads: number; names: string[]; values: number[] }> = [
  { form: 0, n: 2, runs: 1, reads: 4, names: ['Rae'], values: [83] },
  { form: 0, n: 4, runs: 1, reads: 8, names: ['Una'], values: [86] },
  { form: 0, n: 6, runs: 1, reads: 12, names: ['Una', 'Wim'], values: [87] },
  { form: 0, n: 8, runs: 1, reads: 16, names: ['Rae', 'Sol', 'Una', 'Wim'], values: [81] },
  { form: 1, n: 2, runs: 2, reads: 6, names: [], values: [84, 82] },
  { form: 1, n: 4, runs: 4, reads: 20, names: ['Rae', 'Una'], values: [82, 90, 82, 90] },
  { form: 1, n: 6, runs: 6, reads: 42, names: ['Rae', 'Una', 'Wim'], values: [81, 93, 81, 93, 81, 93] },
  { form: 1, n: 8, runs: 8, reads: 72, names: ['Rae', 'Tom', 'Una', 'Val', 'Wim'], values: [74, 88, 74, 88, 74, 88, 74, 88] },
];

function irArgs(form: number, n: number): { args: unknown[]; stats: number[] } {
  const groups = groupIndex(data, 'dept');
  const dept = data.rows.map((r) => {
    const g = groups.get(String(r.dept));
    if (g === undefined) throw new Error('부서 번호가 없다');
    return g;
  });
  const pay = data.rows.map((r) => Number(r.pay));
  const stats = [0, 0];
  return { args: [form, dept, pay, n, stats], stats };
}

describe('subquery', () => {
  it('사다리가 손잡이 구간과 같고, 표가 사다리 끝값을 담는다', () => {
    const controls = (subqueryFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
    const rows = controls.find((c) => c.name === 'rows');
    const form = controls.find((c) => c.name === 'form');
    const values = (k: Record<string, unknown> | undefined) =>
      (k?.segments as Array<{ value: number }>).map((s) => s.value);
    expect(values(rows)).toEqual(data.rowLadder);
    expect(values(form)).toEqual(data.forms.map((_, i) => i));
    expect(data.rowLadder[data.rowLadder.length - 1]).toBe(8);
    expect(data.rows).toHaveLength(8);
    const defaults = (k: Record<string, unknown> | undefined) =>
      (k?.segments as Array<{ value: number; default?: boolean }>).find((s) => s.default)?.value;
    expect(defaults(form)).toBe(data.start.form);
    expect(defaults(rows)).toBe(data.start.rows);
    const { args } = irArgs(0, 8);
    expect((args[1] as number[]).length).toBe(8);
    expect(groupIndex(data, 'dept')).toEqual(new Map([['lab', 0], ['desk', 1]]));
  });

  for (const spec of SPEC) {
    it(`꼴 ${spec.form} · 줄 ${spec.n} — algorithm = IR = 사양 표`, async () => {
      const round = await roundOf(spec.form, spec.n);
      const { args, stats } = irArgs(spec.form, spec.n);
      const kept = runIR(subqueryImperativeIR, 'subqueryCount', args as never);

      // IR ↔ algorithm
      expect(round.metrics['result-rows']).toBe(kept);
      expect(round.metrics['inner-runs']).toBe(stats[0]);
      expect(round.metrics['rows-read']).toBe(stats[1]);

      // 사양 표
      expect(round.metrics['inner-runs']).toBe(spec.runs);
      expect(round.metrics['rows-read']).toBe(spec.reads);
      expect(round.metrics['result-rows']).toBe(spec.names.length);
      const passed = payloadsOf(round, 'compare').filter((p) => p.passed === true).map((p) => p.name);
      expect(passed).toEqual(spec.names);
      expect(payloadsOf(round, 'inner').map((p) => p.value)).toEqual(spec.values);
      // 견준 값 — 비상관은 한 값이 줄마다 머물고, 상관은 줄마다 제 부서 값
      const compared = payloadsOf(round, 'compare').map((p) => p.value);
      expect(compared).toEqual(spec.form === 0 ? new Array(spec.n).fill(spec.values[0]) : spec.values);

      // 걸음 — 비상관 2 + n · 상관 1 + 2n (걸음 0 포함)
      expect(round.steps).toBe(spec.form === 0 ? 2 + spec.n : 1 + 2 * spec.n);
    });
  }

  it('같음은 상관 줄 2 에서만 걸린다 (pay = 평균)', async () => {
    let ties = 0;
    for (const spec of SPEC) {
      const round = await roundOf(spec.form, spec.n);
      for (const p of payloadsOf(round, 'compare')) if (p.pay === p.value) ties += 1;
      if (spec.form === 1 && spec.n === 2) {
        expect(payloadsOf(round, 'compare').map((p) => p.pay === p.value)).toEqual([true, true]);
      }
    }
    expect(ties).toBe(2);
  });

  it('회차별 계기 — 비상관 4 → 상관 4 → 비상관 4', async () => {
    const rounds = await play([knob('form', 1, 1, 4), knob('form', 0, 0, 4)]);
    const pick = (r: Round) => [r.metrics['inner-runs'], r.metrics['rows-read'], r.metrics['result-rows']];
    expect(rounds.map(pick)).toEqual([
      [1, 8, 1],
      [4, 20, 2],
      [1, 8, 1],
    ]);
  });

  it('사다리 밖의 손잡이 값은 던진다', async () => {
    await expect(play([knob('rows', 5, 0, 5)])).rejects.toThrow();
  });

  it('무대가 mountView 로 붙고 한 판을 그린다', async () => {
    const container = document.createElement('div');
    const round = await roundOf(1, 4);
    const inst = mountView(subqueryStageView, container, { config: {}, initialData: data }) as unknown as SubqueryStage & {
      destroy(): void;
    };
    const r = payloadsOf(round, 'round')[0];
    inst.setRound({
      correlated: true,
      n: 4,
      table: String(r.table),
      columns: r.columns as string[],
      sql: r.sql as string[],
      rows: r.rows as Array<{ cells: string[]; group: number }>,
      caption: 'start',
      dur: 0,
    });
    const inner = payloadsOf(round, 'inner')[0];
    inst.innerRun({
      run: 1,
      outer: 0,
      group: Number(inner.group),
      picked: inner.picked as number[],
      value: Number(inner.value),
      caption: 'inner',
      dur: 0,
    });
    inst.compare({ index: 0, name: 'Rae', value: 82, passed: true, kept: 1, caption: 'cmp', dur: 0 });
    const text = container.textContent ?? '';
    expect(text).toContain('staff');
    expect(text).toContain('WHERE t.dept = s.dept);');
    expect(text).toContain('> 82');
    inst.destroy();
  });
});
