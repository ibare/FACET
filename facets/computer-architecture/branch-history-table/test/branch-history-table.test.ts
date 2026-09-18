// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  getFacetById,
  getIR,
  getProjector,
  getView,
  makeTranslator,
  mountView,
  type FacetRuntimeEvent,
  type IRStmt,
  type ReactiveInputEvent,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  branchHistoryTableAlgorithm,
  branchHistoryTableFacet,
  branchHistoryTableImperativeIR,
  branchHistoryTableProjector,
  branchHistoryTableStageView,
  registerBranchHistoryTable,
  type BranchHistoryTableData,
  type BranchHistoryTableStage,
} from '../src/index.js';

// ── 사양 표 (대조용). 셈은 알고리즘이 한다.
const SPEC: Record<string, Record<number, { size: number; misses: number; percent: number; marks: string }>> = {
  pattern: {
    0: { size: 1, misses: 6, percent: 67, marks: 'ooxooxooxooxooxoox' },
    1: { size: 2, misses: 6, percent: 67, marks: 'ooxooxooxooxooxoox' },
    2: { size: 4, misses: 1, percent: 94, marks: 'ooxooooooooooooooo' },
    3: { size: 8, misses: 1, percent: 94, marks: 'ooxooooooooooooooo' },
  },
  random: {
    0: { size: 1, misses: 9, percent: 50, marks: 'oooxoxxxooxxoooxxx' },
    1: { size: 2, misses: 9, percent: 50, marks: 'oooxoxxoxoxxxooxox' },
    2: { size: 4, misses: 9, percent: 50, marks: 'oooxoxxoooxxxxoxox' },
    3: { size: 8, misses: 9, percent: 50, marks: 'oooxoxxooooxxxxxox' },
  },
};

type Knob = { type: string; value: number };
type Round = {
  trace: string;
  bits: number;
  misses: number;
  percent: number;
  entries: number;
  marks: string;
};

function freshData(): BranchHistoryTableData {
  return JSON.parse(JSON.stringify(branchHistoryTableFacet.initialData)) as BranchHistoryTableData;
}

/**
 * 가짜 ReactiveContext 로 알고리즘을 돌린다. 한 판이 끝나 입력을 기다릴 때마다 `knobs` 에서
 * 하나씩 준다. 다 쓰면 취소한다. `midRound` 는 n 번째 pollInput 에 끼워 넣을 입력이다.
 */
async function drive(
  knobs: Array<Knob | ReactiveInputEvent>,
  midRound?: { at: number; input: ReactiveInputEvent },
): Promise<{ events: FacetRuntimeEvent[]; rounds: Round[] }> {
  const events: FacetRuntimeEvent[] = [];
  const rounds: Round[] = [];
  const metrics = new Map<string, number>();
  const queue = [...knobs];
  let cancelled = false;
  let marks = '';
  let polls = 0;
  const ctx = {
    data: freshData(),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      const p = (e.payload ?? {}) as Record<string, unknown>;
      if (e.type === 'round-start') marks = '';
      if (e.type === 'resolve') marks += p.hit === true ? 'o' : 'x';
      if (e.type === 'round-end') {
        rounds.push({
          trace: String(p.trace),
          bits: Number(p.historyBits),
          misses: metrics.get('miss-count') ?? NaN,
          percent: metrics.get('hit-percent') ?? NaN,
          entries: metrics.get('entry-count') ?? NaN,
          marks,
        });
      }
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      polls += 1;
      if (midRound && polls === midRound.at) return midRound.input;
      return null;
    },
    async waitForInput() {
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      if ('value' in next) return { type: next.type, payload: { value: next.value, segmentIndex: 0 } };
      return next;
    },
  };
  await branchHistoryTableAlgorithm(ctx as never);
  return { events, rounds };
}

function phasesOf(stmts: IRStmt[], out: Set<string>): void {
  for (const s of stmts) {
    if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
    if (s.kind === 'if') {
      phasesOf(s.then, out);
      if (s.else) phasesOf(s.else, out);
    }
    if (s.kind === 'for-range' || s.kind === 'while') phasesOf(s.body, out);
  }
}

type Slider = { widget: string; action: string; segments?: Array<{ value: unknown; default?: boolean }> };
function slider(action: string): Slider {
  const controls = (branchHistoryTableFacet.blocks.controls as { controls: Slider[] }).controls;
  const found = controls.find((c) => c.widget === 'segmented-slider' && c.action === action);
  if (!found) throw new Error(`손잡이 ${action} 없음`);
  return found;
}

describe('branch-history-table 데이터', () => {
  it('1차 데이터의 사다리가 손잡이 값과 같고, 기본값은 첫 칸이다', () => {
    const data = freshData();
    expect(slider('history').segments?.map((s) => s.value)).toEqual(data.ladder);
    expect(slider('trace').segments?.map((s) => s.value)).toEqual(data.traces.map((_, i) => i));
    expect(slider('history').segments?.findIndex((s) => s.default === true)).toBe(0);
    expect(slider('trace').segments?.findIndex((s) => s.default === true)).toBe(0);
  });

  it('두 열은 18 번씩이고 무작위 열은 T 가 정확히 9 번이다', () => {
    const data = freshData();
    expect(data.traces).toEqual(['pattern', 'random']);
    expect(data.outcomes.pattern).toEqual([1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0]);
    expect(data.outcomes.random?.length).toBe(18);
    expect(data.outcomes.random?.filter((x) => x === 1).length).toBe(9);
  });
});

describe('branch-history-table 알고리즘', () => {
  it('회차마다 계기가 사양 표와 같다 — A → B → A 로 돌려도 쌓이지 않는다', async () => {
    const { rounds } = await drive([
      { type: 'history', value: 2 },
      { type: 'history', value: 0 }, // A → B → A
      { type: 'history', value: 1 },
      { type: 'history', value: 3 },
      { type: 'trace', value: 1 },
      { type: 'history', value: 0 },
      { type: 'history', value: 2 },
      { type: 'history', value: 1 },
      { type: 'trace', value: 0 },
      { type: 'trace', value: 1 },
    ]);
    const seen = rounds.map((r) => `${r.trace}/${r.bits}`);
    expect(seen).toEqual([
      'pattern/0', 'pattern/2', 'pattern/0', 'pattern/1', 'pattern/3',
      'random/3', 'random/0', 'random/2', 'random/1', 'pattern/1', 'random/1',
    ]);
    for (const r of rounds) {
      const want = SPEC[r.trace]![r.bits]!;
      expect({ ...r }).toEqual({ trace: r.trace, bits: r.bits, misses: want.misses, percent: want.percent, entries: want.size, marks: want.marks });
    }
  });

  it('우리 것이 아닌 입력과 사다리 밖 값은 흘린다', async () => {
    const { rounds } = await drive([
      { type: 'play' },
      { type: 'history', value: 7 },
      { type: 'trace', value: 2 },
      { type: 'history', payload: { value: '2' } } as ReactiveInputEvent,
      { type: 'history', value: 2 },
    ]);
    expect(rounds.map((r) => `${r.trace}/${r.bits}`)).toEqual(['pattern/0', 'pattern/2']);
  });

  it('재생 도중 손잡이를 돌리면 그 판을 끊고 새 판을 처음부터 연다', async () => {
    const { rounds, events } = await drive([], {
      at: 10,
      input: { type: 'history', payload: { value: 2, segmentIndex: 2 } },
    });
    expect(rounds.map((r) => `${r.trace}/${r.bits}`)).toEqual(['pattern/2']);
    expect(rounds[0]).toMatchObject({ misses: 1, percent: 94, entries: 4 });
    expect(events.filter((e) => e.type === 'round-start').length).toBe(2);
  });

  it('lookup 의 색인은 직전 결과들(가장 최근이 가장 낮은 자리)이다', async () => {
    const { events } = await drive([{ type: 'history', value: 3 }, { type: 'trace', value: 1 }]);
    const data = freshData();
    let outcomes: number[] = [];
    let bits = 0;
    let checked = 0;
    for (const e of events) {
      const p = (e.payload ?? {}) as Record<string, number>;
      if (e.type === 'round-start') {
        outcomes = (e.payload as { outcomes: number[] }).outcomes;
        bits = p.historyBits!;
        continue;
      }
      if (e.type !== 'lookup') continue;
      let want = 0;
      for (let k = 1; k <= bits; k += 1) {
        const o = p.step! - k >= 0 ? outcomes[p.step! - k]! : 0;
        want += o * 2 ** (k - 1);
      }
      expect(p.index).toBe(want);
      checked += 1;
    }
    expect(checked).toBe(18 * 3);
    expect(data.ladder.at(-1)).toBe(3);
  });

  it('phase 집합이 IR 과 같다 (C3)', async () => {
    const { events } = await drive([{ type: 'history', value: 2 }]);
    const fromAlgo = new Set(
      events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    const fromIR = new Set<string>();
    for (const f of branchHistoryTableImperativeIR.functions) phasesOf(f.body, fromIR);
    expect([...fromAlgo].sort()).toEqual([...fromIR].sort());
    expect(events.filter((e) => e.type === 'phase').every((e) => e.silent === true)).toBe(true);
  });
});

describe('branch-history-table IR', () => {
  it('표 버퍼 길이 = 2^(사다리 끝) = 8, 결과 열 길이 18 — 중간값이 32 비트 안에 머무는 근거', () => {
    const data = freshData();
    const last = data.ladder.at(-1)!;
    expect(2 ** last).toBe(8);
    for (const id of data.traces) expect(data.outcomes[id]!.length).toBe(18);
  });

  it('두 열 × 네 이력 여덟 조합에서 miss-count · hit-percent 가 알고리즘과 같다', async () => {
    const data = freshData();
    const knobs: Knob[] = [
      { type: 'history', value: 1 },
      { type: 'history', value: 2 },
      { type: 'history', value: 3 },
      { type: 'trace', value: 1 },
      { type: 'history', value: 0 },
      { type: 'history', value: 1 },
      { type: 'history', value: 2 },
    ];
    const { rounds } = await drive(knobs);
    // pattern 0 1 2 3, random 3(열을 바꾼 직후) 0 1 2
    const combos = new Map<string, Round>();
    for (const r of rounds) combos.set(`${r.trace}/${r.bits}`, r);
    expect(combos.size).toBe(8);
    for (const [key, r] of combos) {
      const outcomes = data.outcomes[r.trace]!;
      const table = new Array<number>(2 ** data.ladder.at(-1)!).fill(-1);
      const misses = runIR(branchHistoryTableImperativeIR, 'countMisses', [outcomes, r.bits, table]);
      const percent = runIR(branchHistoryTableImperativeIR, 'hitPercent', [misses as number, outcomes.length]);
      expect({ key, misses, percent }).toEqual({ key, misses: r.misses, percent: r.percent });
    }
  });
});

describe('branch-history-table 등록', () => {
  it('reactive 로 등록되고 이름이 서로 맞는다', () => {
    clearRegistry();
    registerBranchHistoryTable();
    expect(getAlgorithmMechanismKind('branchHistoryTable')).toBe('reactive');
    expect(getProjector('branchHistoryTableProjector')).toBe(branchHistoryTableProjector);
    expect(getIR('branch-history-table-imperative')).toBe(branchHistoryTableImperativeIR);
    expect(getView('branch-history-table-stage')).toBe(branchHistoryTableStageView);
    expect(getFacetById('facet:branchHistoryTable')).toBe(branchHistoryTableFacet);
    expect(branchHistoryTableFacet.initialData.type).toBe('branch-history-table');
  });
});

describe('branch-history-table stage', () => {
  it('이력을 바꾸면 칸이 갈라지고, 세로는 변하지 않는다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const t = makeTranslator('en', branchHistoryTableFacet.messages);
    const stage = mountView(branchHistoryTableStageView, container, {
      config: {},
      initialData: freshData(),
      t,
    }) as unknown as BranchHistoryTableStage;
    const svg = container.querySelector('svg')!;
    const viewBox = svg.getAttribute('viewBox');
    const projector = branchHistoryTableProjector({ stage }, { getSpeed: () => 1, t });
    const { events } = await drive([{ type: 'history', value: 3 }, { type: 'history', value: 1 }]);
    const starts = events.map((e, i) => (e.type === 'round-start' ? i : -1)).filter((i) => i >= 0);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const counts: number[] = [];
    for (let r = 0; r < starts.length; r += 1) {
      const end = starts[r + 1] ?? events.length;
      for (let i = starts[r]!; i < end; i += 1) await projector.onEvent(events[i]!);
      await wait(500);
      counts.push(svg.querySelectorAll('[data-cell]').length);
    }
    expect(counts).toEqual([1, 8, 2]);
    const caption = [...svg.querySelectorAll('text')].map((x) => x.textContent ?? '');
    expect(caption.some((s) => s.startsWith('6 of 18 missed → 67% hit with 2 cells'))).toBe(true);
    expect(viewBox?.split(/\s+/)[3]).toBe(String(branchHistoryTableStageView.canvas.height));
    expect(svg.getAttribute('viewBox')).toBe(viewBox);
    stage.destroy();
    expect(svg.querySelectorAll('[data-cell]').length).toBe(0);
    container.remove();
  });
});
