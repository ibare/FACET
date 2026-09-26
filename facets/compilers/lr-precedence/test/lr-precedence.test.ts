// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView, type FacetContext } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  computeRound,
  lrPrecedenceAlgorithm,
  lrPrecedenceFacet,
  lrPrecedenceImperativeIR,
  lrPrecedenceStageView,
  runLr,
  type LrPrecedenceData,
  type LrPrecedenceStage,
} from '../src/index.js';

const data = lrPrecedenceFacet.initialData as LrPrecedenceData;

// 사양 실측표 (sim lr-precedence)
const TABLE = [
  { name: '* first', shiftCells: 1, cells: ['reduce', 'shift', 'reduce', 'reduce'], maxStack: 5, tree: '((1 + (2 * 3)) + 4)', value: 11 },
  { name: '+ first', shiftCells: 1, cells: ['reduce', 'reduce', 'shift', 'reduce'], maxStack: 5, tree: '((1 + 2) * (3 + 4))', value: 21 },
  { name: 'Equal, left', shiftCells: 0, cells: ['reduce', 'reduce', 'reduce', 'reduce'], maxStack: 3, tree: '(((1 + 2) * 3) + 4)', value: 13 },
  { name: 'Equal, right', shiftCells: 4, cells: ['shift', 'shift', 'shift', 'shift'], maxStack: 7, tree: '(1 + (2 * (3 + 4)))', value: 15 },
];

type IrOut = { value: number; counts: number[] };

function runIrWith(a: ReturnType<typeof computeRound>['irArgs']): IrOut {
  const stack = Array.from({ length: a.bufLen }, () => 0);
  const vals = Array.from({ length: a.bufLen }, () => 0);
  const counts = [0, 0, 0];
  const value = runIR(lrPrecedenceImperativeIR, 'runLr', [
    [...a.actKind], [...a.actArg], [...a.gotoTab], [...a.ruleLen], [...a.ruleOp], a.nTerm, [...a.toks], [...a.inVal], stack, vals, counts,
  ]);
  if (typeof value !== 'number') throw new Error('IR 이 수를 돌려주지 않았다');
  return { value, counts };
}

/** 상태 번호를 섞는다 — 시작 상태 0 은 IR 이 스스로 놓으므로 그대로 둔다. */
function permuteStates(a: ReturnType<typeof computeRound>['irArgs'], perm: number[]): ReturnType<typeof computeRound>['irArgs'] {
  const nStates = a.gotoTab.length;
  const actKind = Array.from({ length: a.actKind.length }, () => 0);
  const actArg = Array.from({ length: a.actArg.length }, () => 0);
  const gotoTab = Array.from({ length: nStates }, () => -1);
  for (let s = 0; s < nStates; s += 1) {
    const ns = perm[s] as number;
    const g = a.gotoTab[s] as number;
    gotoTab[ns] = g < 0 ? -1 : (perm[g] as number);
    for (let t = 0; t < a.nTerm; t += 1) {
      const k = a.actKind[s * a.nTerm + t] as number;
      const arg = a.actArg[s * a.nTerm + t] as number;
      actKind[ns * a.nTerm + t] = k;
      actArg[ns * a.nTerm + t] = k === 1 ? (perm[arg] as number) : arg;
    }
  }
  return { ...a, actKind, actArg, gotoTab };
}

describe('lr-precedence — 사양 표와 대조', () => {
  it('사다리가 손잡이 구간 값과 같다', () => {
    const controls = (lrPrecedenceFacet.blocks['controls'] as { controls: unknown[] }).controls;
    const knob = controls.find((c) => (c as { action?: string }).action === 'precedence') as { segments: { value: number; default?: boolean }[] };
    expect(knob.segments.map((s) => s.value)).toEqual(data.precedenceLadder);
    expect(data.precedenceLadder).toEqual([0, 1, 2, 3]);
    expect(data.precedenceRules).toHaveLength(4);
    expect(knob.segments.find((s) => s.default === true)?.value).toBe(data.precedence);
  });

  TABLE.forEach((row, p) => {
    it(`${row.name}: 충돌 칸 · 계기 · 나무 · 값 · 걸음`, () => {
      const r = computeRound(data, p);
      expect(r.conflicts.map((c) => `${c.item}/${c.look}`)).toEqual([
        'E → E + E ·/+',
        'E → E + E ·/*',
        'E → E * E ·/+',
        'E → E * E ·/*',
      ]);
      expect(r.resolved.map((c) => c.action)).toEqual(row.cells);
      expect(r.shiftCells).toBe(row.shiftCells);
      expect(r.shifts).toBe(7);
      expect(r.reduces).toBe(7);
      expect(r.maxStack).toBe(row.maxStack);
      expect(r.tree).toBe(row.tree);
      expect(r.value).toBe(row.value);
      // 걸음 = #0 · #1 · 동작 15
      expect(r.steps.length + 2).toBe(17);
      expect(r.irArgs.gotoTab).toHaveLength(7);
      expect(r.irArgs.nTerm).toBe(4);
      expect(r.irArgs.toks).toEqual([0, 1, 0, 2, 0, 1, 0, 3]);
      expect(r.irArgs.bufLen).toBe(9);
    });
  });

  it('* 먼저 걸음 차례가 sim 과 같다', () => {
    const r = computeRound(data, 0);
    const got = r.steps.map((s) =>
      s.kind === 'shift' ? `${s.look} shift [${s.stack.join(' ')}]` : s.kind === 'reduce' ? `${s.look} ${s.rule} [${s.stack.join(' ')}] ${s.value}` : `accept ${s.value}`,
    );
    expect(got).toEqual([
      '1 shift [NUM]',
      '+ R3 [E] 1',
      '+ shift [E +]',
      '2 shift [E + NUM]',
      '* R3 [E + E] 2',
      '* shift [E + E *]',
      '3 shift [E + E * NUM]',
      '+ R3 [E + E * E] 3',
      '+ R2 [E + E] 6',
      '+ R1 [E] 7',
      '+ shift [E +]',
      '4 shift [E + NUM]',
      'EOF R3 [E + E] 4',
      'EOF R1 [E] 11',
      'accept 11',
    ]);
    // [E + E ·] 다음 * 칸(자리 1)을 읽은 밀기
    const s7 = r.steps[5];
    expect(s7?.kind === 'shift' ? s7.cell : -2).toBe(1);
  });

  it('같게 · 오른쪽은 끝까지 밀어 7 칸, EOF 에서 값 4 · 7 · 14 · 15', () => {
    const r = computeRound(data, 3);
    const reduces = r.steps.flatMap((s) => (s.kind === 'reduce' && s.look === 'EOF' ? [s.value] : []));
    expect(reduces).toEqual([4, 7, 14, 15]);
  });
});

describe('lr-precedence — IR 과 algorithm', () => {
  it('모든 손잡이 값에서 IR 의 답 · counts 가 화면의 값과 같다', () => {
    for (const p of data.precedenceLadder) {
      const r = computeRound(data, p);
      const out = runIrWith(r.irArgs);
      expect(out.value).toBe(r.value);
      expect(out.counts).toEqual([r.shifts, r.reduces, r.maxStack]);
      // TS 운전기도 같은 배열로 같은 답
      const stack = Array.from({ length: r.irArgs.bufLen }, () => 0);
      const vals = Array.from({ length: r.irArgs.bufLen }, () => 0);
      const counts = [0, 0, 0];
      const a = r.irArgs;
      expect(runLr(a.actKind, a.actArg, a.gotoTab, a.ruleLen, a.ruleOp, a.nTerm, a.toks, a.inVal, stack, vals, counts)).toBe(r.value);
      expect(counts).toEqual(out.counts);
    }
  });

  it('상태 번호를 서른 번 섞어도 IR 의 답이 같다', () => {
    let seed = 12345;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (const p of data.precedenceLadder) {
      const r = computeRound(data, p);
      const n = r.irArgs.gotoTab.length;
      for (let trial = 0; trial < 30; trial += 1) {
        const rest = Array.from({ length: n - 1 }, (_, i) => i + 1);
        for (let i = rest.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rand() * (i + 1));
          [rest[i], rest[j]] = [rest[j] as number, rest[i] as number];
        }
        const perm = [0, ...rest];
        const out = runIrWith(permuteStates(r.irArgs, perm));
        expect(out.value).toBe(r.value);
        expect(out.counts).toEqual([r.shifts, r.reduces, r.maxStack]);
      }
    }
  });
});

describe('lr-precedence — 회차별 계기 (A → B → A)', () => {
  it('판마다 사양 표의 값으로 되돌아온다', async () => {
    const inputs = [3, 0];
    const totals = new Map<string, number>();
    const perRound: Record<string, number>[] = [];
    let cancelled = false;
    let accepts = 0;
    const ctx = {
      data: structuredClone(data),
      get cancelled() {
        return cancelled;
      },
      async emit(e: { type: string }) {
        if (e.type === 'accept') {
          accepts += 1;
        }
      },
      metric(name: string, delta: number | 'inc') {
        totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
      },
      async sleep() {
        return !cancelled;
      },
      async waitForInput() {
        perRound.push(Object.fromEntries(totals));
        const v = inputs.shift();
        if (v === undefined) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return { type: 'precedence', payload: { value: v } };
      },
      pollInput() {
        return null;
      },
    };
    await lrPrecedenceAlgorithm(ctx as unknown as FacetContext<LrPrecedenceData>);
    expect(accepts).toBe(3);
    const want = (p: number): Record<string, number> => ({
      'shift-cells': TABLE[p]?.shiftCells as number,
      shifts: 7,
      reduces: 7,
      'max-stack': TABLE[p]?.maxStack as number,
    });
    expect(perRound).toEqual([want(0), want(3), want(0)]);
  });
});

describe('lr-precedence — 무대', () => {
  it('mountView 로 올려 한 판을 그리고, 새 판의 걸음 0 에서 앞 판의 나무 · 값을 걷는다', async () => {
    const container = document.createElement('div');
    const inst = mountView(lrPrecedenceStageView, container, { config: {}, initialData: data, locale: 'ko' }) as unknown as LrPrecedenceStage;
    const r = computeRound(data, 0);
    const startPayload = {
      tokens: r.tokens,
      remaining: r.tokens.length,
      conflicts: r.conflicts,
      ops: (data.precedenceRules[0]?.ops ?? []).map((o) => ({ ...o })),
    };
    await inst.start(startPayload, 0);
    await inst.resolve({ cells: r.resolved, shiftCells: r.shiftCells, reduceCells: r.reduceCells }, 0);
    for (const s of r.steps) {
      if (s.kind === 'shift') await inst.shift(s, 0);
      else if (s.kind === 'reduce') await inst.reduce(s, 0);
      else await inst.accept(s, 0);
    }
    expect(container.textContent).toContain('((1 + (2 * 3)) + 4) = 11');
    expect(container.querySelectorAll('circle').length).toBe(7);
    await inst.start(startPayload, 0);
    expect(container.querySelectorAll('circle').length).toBe(0);
    expect(container.textContent).not.toContain('= 11');
    // 되감기 — clear 가 칸 · 스택 · 나무 · 캡션을 걷고 문법만 남긴다
    inst.clear();
    expect(container.querySelectorAll('circle').length).toBe(0);
    expect(container.textContent).not.toContain('NUM 1');
    expect(container.textContent).toContain('E → E + E');
    inst.destroy();
  });

  it('grammar 가 배열이 아니면 던진다', () => {
    const container = document.createElement('div');
    expect(() => mountView(lrPrecedenceStageView, container, { config: {}, initialData: { grammar: 'E' } })).toThrow();
  });

  it('initialData 없이도 마운트에서 던지지 않는다', () => {
    const container = document.createElement('div');
    const inst = mountView(lrPrecedenceStageView, container, { config: {} });
    inst.destroy();
  });
});
