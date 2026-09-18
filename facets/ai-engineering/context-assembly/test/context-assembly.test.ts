// @vitest-environment happy-dom
/**
 * 맥락 조립 — 사양 표 · IR 대조 · phase · 회차별 계기 · 사다리 · 화면 문안.
 */
import { describe, expect, it } from 'vitest';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  mountView,
  makeTranslator,
  type FacetRuntimeEvent,
  type IRStmt,
  type ReactiveInputEvent,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  contextAssemblyAlgorithm,
  contextAssemblyFacet,
  contextAssemblyImperativeIR,
  contextAssemblyProjector,
  contextAssemblyStageView,
  registerContextAssembly,
  wordCount,
  type ContextAssemblyData,
} from '../src/index.js';

const DATA = contextAssemblyFacet.initialData as unknown as ContextAssemblyData;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 사양 표 — 예산 → [담은 조각, 밖에 남은, 쓴 낱말, 등수대로 (자리 · 거리), 끝부터 번갈아 (자리 · 거리)]. 자리는 1 부터. */
const TABLE: Record<number, [number, number, number, [number, number], [number, number]]> = {
  45: [4, 4, 42, [4, 0], [3, 1]],
  55: [5, 3, 51, [4, 1], [4, 1]],
  65: [6, 2, 62, [4, 2], [5, 1]],
  85: [8, 0, 83, [4, 3], [7, 1]],
};

type Round = {
  metrics: Record<string, number>;
  slots: number[];
  slot: number;
  depth: number;
  leftOut: number;
};

/** 알고리즘을 가짜 reactive 문맥으로 돌린다. 판이 끝날 때마다(입력 기다림) 계기와 자리를 떠 둔다. */
async function drive(
  inputs: ReactiveInputEvent[],
  data: ContextAssemblyData = clone(DATA),
  onEvent?: (e: FacetRuntimeEvent) => void | Promise<void>,
) {
  const metrics = new Map<string, number>();
  const events: FacetRuntimeEvent[] = [];
  const rounds: Round[] = [];
  const litAtBoundary = new Set<string>();
  const emitted = new Set<string>();
  let lastPhase: string | null = null;
  let lastDepth: FacetRuntimeEvent | null = null;
  let cancelled = false;
  /** 판이 끝나고 아직 떠 두지 않았는가 — 흘린 입력 뒤의 기다림은 판이 아니다. */
  let fresh = false;
  const queue = [...inputs];

  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'phase') {
        lastPhase = (e.payload as { phase: string }).phase;
        emitted.add(lastPhase);
      }
      if (e.type === 'depth') {
        lastDepth = e;
        fresh = true;
      }
      await onEvent?.(e);
    },
    metric(name: string, d: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (d === 'inc' ? 1 : d));
    },
    async sleep() {
      if (lastPhase) litAtBoundary.add(lastPhase);
      return !cancelled;
    },
    async waitForInput() {
      if (lastPhase) litAtBoundary.add(lastPhase);
      const pl = (lastDepth?.payload ?? {}) as { slots: number[]; slot: number; depth: number; leftOut: number };
      if (fresh) rounds.push({
        metrics: Object.fromEntries(metrics),
        slots: pl.slots,
        slot: pl.slot,
        depth: pl.depth,
        leftOut: pl.leftOut,
      });
      fresh = false;
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
  };
  await contextAssemblyAlgorithm(ctx as never);
  return { rounds, events, litAtBoundary, emitted, metrics };
}

const knob = (type: 'budget' | 'order', value: number): ReactiveInputEvent => ({
  type,
  payload: { value, segmentIndex: 0 },
});

/** 한 조합으로 가는 입력 — 기본(45 · 0)에서 출발. */
function inputsFor(budget: number, order: number): ReactiveInputEvent[] {
  const out: ReactiveInputEvent[] = [];
  if (order !== 0) out.push(knob('order', order));
  if (budget !== 45) out.push(knob('budget', budget));
  return out;
}

async function lastRound(budget: number, order: number): Promise<Round> {
  const { rounds } = await drive(inputsFor(budget, order));
  return rounds[rounds.length - 1]!;
}

function irPhases(stmts: IRStmt[], out = new Set<string>()): Set<string> {
  for (const s of stmts) {
    if (s.kind === 'comment') continue;
    if (s.phase) out.add(s.phase);
    if (s.kind === 'if') {
      irPhases(s.then, out);
      if (s.else) irPhases(s.else, out);
    }
    if (s.kind === 'for-range' || s.kind === 'while') irPhases(s.body, out);
  }
  return out;
}
const IR_PHASES = (() => {
  const set = new Set<string>();
  for (const f of contextAssemblyImperativeIR.functions) irPhases(f.body, set);
  return set;
})();

const COMBOS: Array<[number, number]> = DATA.budgets.flatMap((b) => DATA.orders.map((o): [number, number] => [b, o]));

describe('맥락 조립 — 자료', () => {
  it('조각 낱말 수와 누적이 사양과 같다', () => {
    const lengths = DATA.chunks.map(wordCount);
    expect(lengths).toEqual([12, 10, 10, 10, 9, 11, 7, 14]);
    const cum: number[] = [];
    lengths.reduce((a, b) => (cum.push(a + b), a + b), 0);
    expect(cum).toEqual([12, 22, 32, 42, 51, 62, 69, 83]);
  });

  it('사다리가 손잡이 segments 와 같고, 첫 값이 default 다', () => {
    const controls = (contextAssemblyFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
    const seg = (action: string) => controls.find((c) => c.action === action)!.segments as Array<{ value: number; default?: boolean }>;
    expect(seg('budget').map((s) => s.value)).toEqual(DATA.budgets);
    expect(seg('order').map((s) => s.value)).toEqual(DATA.orders);
    expect(seg('budget').find((s) => s.default)!.value).toBe(DATA.budget);
    expect(seg('order').find((s) => s.default)!.value).toBe(DATA.order);
  });

  it('32 비트 — IR 버퍼는 조각 수(8) 이하, 정수 중간값은 사다리 끝값 85 이하', () => {
    expect(DATA.chunks.length).toBe(8);
    expect(Math.max(...DATA.budgets)).toBeLessThanOrEqual(85);
    expect(DATA.chunks.map(wordCount).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(85);
  });
});

describe('맥락 조립 — 사양 표', () => {
  it.each(COMBOS)('예산 %i · 놓는 법 %i', async (budget, order) => {
    const r = await lastRound(budget, order);
    const [n, out, used, byRank, ends] = TABLE[budget]!;
    const [pos, dist] = order === 0 ? byRank : ends;
    expect(r.metrics['chunk-count']).toBe(n);
    expect(r.metrics['used-word-count']).toBe(used);
    expect(r.metrics['answer-depth']).toBe(dist);
    expect(r.leftOut).toBe(out);
    expect(r.slot + 1).toBe(pos);
  });

  it('끝부터 번갈아, 여덟일 때 등수 1..8 → 자리 1 · 8 · 2 · 7 · 3 · 6 · 4 · 5', async () => {
    const r = await lastRound(85, 1);
    expect(r.slots.map((s) => s + 1)).toEqual([1, 8, 2, 7, 3, 6, 4, 5]);
  });
});

describe('맥락 조립 — IR 은 화면과 같은 답을 낸다', () => {
  it.each(COMBOS)('예산 %i · 놓는 법 %i — answer-depth 와 자리 배열', async (budget, order) => {
    const r = await lastRound(budget, order);
    const lengths = DATA.chunks.map(wordCount);
    const slot = new Array<number>(8).fill(0);
    const got = runIR(contextAssemblyImperativeIR, 'answerDepth', [lengths, budget, order, DATA.answerRank - 1, slot]);
    expect(got).toBe(r.metrics['answer-depth']);
    const n = r.metrics['chunk-count']!;
    expect(slot.slice(0, n)).toEqual(r.slots);
  });

  it('답이 안 담기면 −1 (코드 길)', () => {
    const lengths = DATA.chunks.map(wordCount);
    const slot = new Array<number>(8).fill(0);
    expect(runIR(contextAssemblyImperativeIR, 'answerDepth', [lengths, 41, 0, 3, slot])).toBe(-1);
  });
});

describe('맥락 조립 — phase', () => {
  it('algorithm 의 phase 집합 = IR 의 phase 집합, 걸음 경계마다 켜진 phase 도 같다', async () => {
    const emitted = new Set<string>();
    const lit = new Set<string>();
    for (const [b, o] of COMBOS) {
      const r = await drive(inputsFor(b, o));
      r.emitted.forEach((p) => emitted.add(p));
      r.litAtBoundary.forEach((p) => lit.add(p));
    }
    expect([...emitted].sort()).toEqual([...IR_PHASES].sort());
    expect([...lit].sort()).toEqual([...IR_PHASES].sort());
  });

  it('phase 는 silent 로 나간다', async () => {
    const { events } = await drive([]);
    for (const e of events) if (e.type === 'phase') expect(e.silent).toBe(true);
  });
});

describe('맥락 조립 — 회차별 계기 (A → B → A)', () => {
  it('예산 45 → 85 → 45, 놓는 법 0 → 1 → 0 — 판마다 사양 표와 같다', async () => {
    const { rounds } = await drive([
      knob('budget', 85),
      knob('budget', 45),
      knob('order', 1),
      knob('order', 0),
      knob('budget', 65),
      knob('order', 1),
      knob('budget', 55),
    ]);
    const plan: Array<[number, number]> = [
      [45, 0],
      [85, 0],
      [45, 0],
      [45, 1],
      [45, 0],
      [65, 0],
      [65, 1],
      [55, 1],
    ];
    expect(rounds).toHaveLength(plan.length);
    plan.forEach(([b, o], i) => {
      const [n, , used, byRank, ends] = TABLE[b]!;
      const dist = (o === 0 ? byRank : ends)[1];
      expect(rounds[i]!.metrics).toEqual({ 'chunk-count': n, 'used-word-count': used, 'answer-depth': dist });
    });
  });

  it('사다리 밖의 값 · 문자열 값 · 남의 입력은 흘린다', async () => {
    const { rounds } = await drive([
      knob('budget', 50),
      { type: 'budget', payload: { value: '85' } },
      { type: 'play' },
      knob('budget', 85),
    ]);
    expect(rounds).toHaveLength(2);
    expect(rounds[1]!.metrics['chunk-count']).toBe(8);
  });
});

describe('맥락 조립 — 등록', () => {
  it('reactive 로 등록된다', () => {
    clearRegistry();
    registerContextAssembly();
    expect(getAlgorithmMechanismKind('contextAssembly')).toBe('reactive');
  });
});

describe('맥락 조립 — 화면', () => {
  function mount(data: ContextAssemblyData) {
    const container = document.createElement('div');
    const t = makeTranslator('en', contextAssemblyFacet.messages);
    const stage = mountView(contextAssemblyStageView, container, {
      config: { type: 'context-assembly-stage' },
      initialData: data as unknown as Record<string, unknown>,
      locale: 'en',
      t,
    });
    const projector = contextAssemblyProjector({ stage }, { getSpeed: () => 1e6, t });
    projector.onInit?.(data);
    return { container, stage, projector };
  }
  const texts = (root: Element) => [...root.querySelectorAll('text')].map((n) => n.textContent ?? '');

  it('initialData 없이 마운트해도 던지지 않고 캔버스를 떼지 않는다', () => {
    const container = document.createElement('div');
    const inst = mountView(contextAssemblyStageView, container, { config: {} });
    expect(container.querySelector('svg')).not.toBeNull();
    inst.destroy();
  });

  it('캡션의 수는 그 이름의 수다 — 답 자리 · 판 크기 · 거리 · 밖에 남은 수', async () => {
    const data = clone(DATA);
    const { container, projector } = mount(data);
    await drive([knob('order', 1), knob('budget', 85)], data, (e) => projector.onEvent(e));
    const all = texts(container).join('\n');
    expect(all).toContain('The answer chunk is in slot 7 of 8. Distance to the nearest end: 1.');
    expect(all).toContain('Left out: 0');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('자료를 바꾸면 캡션의 수가 따라온다 (답을 2 위로)', async () => {
    const data = { ...clone(DATA), answerRank: 2 };
    const { container, projector } = mount(data);
    // 예산 55 · 끝부터 번갈아 → 등수 2 는 자리 5 (다섯 중 끝)
    await drive([knob('order', 1), knob('budget', 55)], data, (e) => projector.onEvent(e));
    const all = texts(container).join('\n');
    expect(all).toContain('The answer chunk is in slot 5 of 5. Distance to the nearest end: 0.');
    expect(all).toContain('Left out: 3');
  });

  it('넘는 조각의 캡션 — 필요한 낱말과 남은 자리', async () => {
    const data = clone(DATA);
    const { container, projector } = mount(data);
    let caption = '';
    await drive([], data, async (e) => {
      await projector.onEvent(e);
      if (e.type === 'overflow') caption = texts(container).join('\n');
    });
    // 예산 45, 넷을 담아 42 — 5 위는 낱말 9 가 필요하고 남은 자리는 3
    expect(caption).toContain('Rank 5 needs 9 words but only 3 are left.');
    expect(caption).toContain('Left out: 4');
  });
});
