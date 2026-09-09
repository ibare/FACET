// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import type { FacetRuntimeEvent, IR, IRStmt, View, ViewInstance } from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  registerBuiltinViews,
  registerView,
  runFacet,
} from '@ffacet/core/runtime';
import {
  dynamicProgramming,
  dynamicProgrammingFacet,
  dynamicProgrammingProjector,
  knapsackTableIR,
  registerDynamicProgramming,
  type DynamicProgrammingData,
} from '../src/index.js';
import { IRInterpreter, type Value } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

const SPEC_WEIGHTS = [5, 4, 6, 3];
const SPEC_VALUES = [10, 40, 30, 50];
const SPEC_CAPACITY = 10;

/** 사양의 대조표. 5 행 (0 행 포함) × 11 열. */
const SPEC_TABLE = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 10, 10, 10, 10, 10, 10],
  [0, 0, 0, 0, 40, 40, 40, 40, 40, 50, 50],
  [0, 0, 0, 0, 40, 40, 40, 40, 40, 50, 70],
  [0, 0, 0, 50, 50, 50, 50, 90, 90, 90, 90],
];

const PHASES = [
  'build-table',
  'compare',
  'fill-cell',
  'pick-cell',
  'read-answer',
  'skip-item',
  'weight-check',
];

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(
  weights: number[],
  values: number[],
  capacity: number,
): Promise<Recorded> {
  const data: DynamicProgrammingData = {
    type: 'knapsack',
    weights: [...weights],
    values: [...values],
    capacity,
  };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await dynamicProgramming({
    data,
    cancelled: false,
    async emit(event) {
      events.push(event);
    },
    metric(name, delta) {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
  });
  return { events, metrics };
}

function payloadsOf<T>(events: FacetRuntimeEvent[], type: string): T[] {
  return events.filter((e) => e.type === type).map((e) => e.payload as T);
}

/** 화면이 그리게 될 표를 이벤트만으로 다시 세운다. */
function tableFromEvents(events: FacetRuntimeEvent[]): number[][] {
  const ready = payloadsOf<{ rows: number; cols: number }>(events, 'table-ready')[0];
  const table = Array.from({ length: ready.rows }, () => new Array<number>(ready.cols).fill(0));
  for (const e of events) {
    if (e.type !== 'carry-down' && e.type !== 'cell-filled') continue;
    const p = e.payload as { row: number; col: number; value: number };
    table[p.row][p.col] = p.value;
  }
  return table;
}

function irPhases(ir: IR): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
      if (s.kind === 'if') {
        walk(s.then);
        if (s.else) walk(s.else);
      } else if (s.kind === 'for-range' || s.kind === 'while') {
        walk(s.body);
      }
    }
  };
  for (const f of ir.functions) walk(f.body);
  return out;
}

/**
 * IR 이 이름으로만 부르는 둘 — 배열 만들기와 큰 값 고르기 — 을 바깥에서 채운다.
 * 여섯 언어에서도 그 둘만 언어 내장이고 나머지는 IR 그대로다.
 */
class BuiltinInterpreter extends IRInterpreter {
  override call(name: string, args: Value[]): Value | undefined {
    if (name === 'zeros2') {
      const rows = args[0] as number;
      const cols = args[1] as number;
      return Array.from({ length: rows }, () => new Array<Value>(cols).fill(0));
    }
    if (name === 'max') return Math.max(args[0] as number, args[1] as number);
    return super.call(name, args);
  }
}

describe('0/1 배낭 표 채우기', () => {
  it('사양의 대조표와 글자 하나 다르지 않다', async () => {
    const { events } = await record(SPEC_WEIGHTS, SPEC_VALUES, SPEC_CAPACITY);
    expect(tableFromEvents(events)).toEqual(SPEC_TABLE);
  });

  it('최적은 90 이고 채운 칸은 44 개다', async () => {
    const { events, metrics } = await record(SPEC_WEIGHTS, SPEC_VALUES, SPEC_CAPACITY);
    const done = payloadsOf<{ best: number; cells: number }>(events, 'done')[0];
    expect(done.best).toBe(90);
    expect(done.cells).toBe(44);
    expect(metrics['cell-count']).toBe(44);
    // 무게 초과로 그냥 물려받은 칸 18 + 실제로 견준 칸 26 = 44.
    expect(metrics['skip-count']).toBe(18);
    expect(metrics['compare-count']).toBe(26);
    expect(metrics['skip-count'] + metrics['compare-count']).toBe(done.cells);
  });

  it('자국을 거슬러 오르면 고른 물건이 2 와 4 로 나온다', async () => {
    const { events } = await record(SPEC_WEIGHTS, SPEC_VALUES, SPEC_CAPACITY);
    const origin = new Map<string, string>();
    for (const p of payloadsOf<{ row: number; col: number; origin: string }>(
      events,
      'cell-filled',
    )) {
      origin.set(`${p.row}-${p.col}`, p.origin);
    }
    const picked: number[] = [];
    let col = SPEC_CAPACITY;
    for (let row = SPEC_WEIGHTS.length; row >= 1; row--) {
      if (origin.get(`${row}-${col}`) === 'take') {
        picked.unshift(row);
        col -= SPEC_WEIGHTS[row - 1];
      }
    }
    expect(picked).toEqual([2, 4]);
    const weight = picked.reduce((s, i) => s + SPEC_WEIGHTS[i - 1], 0);
    const value = picked.reduce((s, i) => s + SPEC_VALUES[i - 1], 0);
    expect(weight).toBe(7);
    expect(value).toBe(90);
  });

  it('무게가 한도를 넘는 칸에서는 견줌이 일어나지 않는다', async () => {
    const { events } = await record(SPEC_WEIGHTS, SPEC_VALUES, SPEC_CAPACITY);
    const carried = payloadsOf<{ row: number; col: number }>(events, 'carry-down');
    expect(carried).toHaveLength(18);
    for (const p of carried) {
      expect(SPEC_WEIGHTS[p.row - 1]).toBeGreaterThan(p.col);
    }
  });

  it('물건이 없거나 한도가 0 이어도 답이 0 으로 나온다', async () => {
    const none = await record([], [], 5);
    expect(payloadsOf<{ best: number; cells: number }>(none.events, 'done')[0]).toEqual({
      best: 0,
      cells: 0,
      row: 0,
      col: 5,
    });

    const zeroCap = await record([2], [7], 0);
    const done = payloadsOf<{ best: number; cells: number }>(zeroCap.events, 'done')[0];
    expect(done.best).toBe(0);
    expect(done.cells).toBe(1);
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const { events } = await record(SPEC_WEIGHTS, SPEC_VALUES, SPEC_CAPACITY);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

describe('IR 을 실제로 돌린다', () => {
  it('인터프리터가 사양의 답 90 을 돌려준다', () => {
    const interp = new BuiltinInterpreter(knapsackTableIR);
    const best = interp.call('knapsack', [
      [...SPEC_WEIGHTS],
      [...SPEC_VALUES],
      SPEC_CAPACITY,
    ]);
    expect(best).toBe(90);
  });

  it('한도를 하나씩 늘려 가며 셈한 값이 대조표의 마지막 줄과 같다', () => {
    const interp = new BuiltinInterpreter(knapsackTableIR);
    const row = [];
    for (let cap = 0; cap <= SPEC_CAPACITY; cap++) {
      row.push(interp.call('knapsack', [[...SPEC_WEIGHTS], [...SPEC_VALUES], cap]));
    }
    expect(row).toEqual(SPEC_TABLE[4]);
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const { events } = await record(SPEC_WEIGHTS, SPEC_VALUES, SPEC_CAPACITY);
    const emitted = new Set(
      events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(knapsackTableIR)].sort());
    expect([...emitted].sort()).toEqual(PHASES);
  });
});

describe('여섯 언어 emit (S-transpiler)', () => {
  const ALL = [
    pythonTranspiler,
    javascriptTranspiler,
    typescriptTranspiler,
    javaTranspiler,
    cppTranspiler,
    csharpTranspiler,
  ];

  it.each(ALL.map((t) => [t.id, t] as const))(
    '%s — 줄이 나오고 undefined 가 섞이지 않으며 phase 일곱이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(knapsackTableIR);
      expect(res.lines.length).toBeGreaterThan(10);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual(PHASES);

      const all = res.lines.map((l) => l.code).join('\n');
      // 2차원 첨자가 중첩으로 나온다 — 이 IR 이 처음 쓰는 것이다.
      expect(all).toContain('table[i][w]');
      expect(all).toContain('table[i - 1][w]');
      // 인덱스 안의 셈. 감싸면 이 알고리즘이 할 말을 잃는다.
      expect(all).toContain('table[i - 1][w - weight[i - 1]] + value[i - 1]');
      expect(all).toContain('table[n][capacity]');
    },
  );

  it('정적 언어 넷이 2차원 타입을 각자의 표기로 낸다', () => {
    const of = (t: (typeof ALL)[number]) =>
      t.transpile(knapsackTableIR).lines.map((l) => l.code).join('\n');
    expect(of(javaTranspiler)).toContain('int[][] table');
    expect(of(csharpTranspiler)).toContain('int[][] table');
    expect(of(cppTranspiler)).toContain('std::vector<std::vector<int>> table');
    expect(of(typescriptTranspiler)).toContain('number[]');
  });
});

describe('Projector 배선', () => {
  it('phase 를 코드 패널로 넘기고 표를 stage 에 그대로 옮긴다', async () => {
    const { events } = await record(SPEC_WEIGHTS, SPEC_VALUES, SPEC_CAPACITY);
    const phaseCalls: (string | null)[] = [];
    const painted: number[][] = [];
    let answer: [number, number, number] | null = null;

    const stage = {
      setTable(rows: number, cols: number) {
        painted.length = 0;
        for (let r = 0; r < rows; r++) painted.push(new Array<number>(cols).fill(0));
      },
      setRow() {},
      setCursor() {},
      setSources() {},
      setWinner() {},
      setCell(row: number, col: number, value: number) {
        painted[row][col] = value;
      },
      setAnswer(row: number, col: number, value: number) {
        answer = [row, col, value];
      },
      setCaption() {},
      reset() {},
    } as unknown as ViewInstance;

    const codePanel = {
      destroy() {},
      highlightPhase(p: string | null) {
        phaseCalls.push(p);
      },
      clearHighlight() {
        phaseCalls.push(null);
      },
    } as unknown as ViewInstance;

    const projector = dynamicProgrammingProjector({ stage, codePanel });
    projector.onInit?.(dynamicProgrammingFacet.initialData);
    for (const e of events) await projector.onEvent(e);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null)).size).toBe(7);
    expect(painted).toEqual(SPEC_TABLE);
    expect(answer).toEqual([4, 10, 90]);
    expect(phaseCalls[phaseCalls.length - 1]).toBeNull();
  });
});

describe('마운트와 재생', () => {
  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
  });

  it('stage 가 표를 그리고 재생 내내 캔버스 세로가 변하지 않는다', async () => {
    const seenPhases: string[] = [];
    const fakeCodeView: View = {
      mount(container) {
        const node = document.createElement('div');
        container.appendChild(node);
        return {
          destroy() {
            node.remove();
          },
          highlightPhase(phase: string | null) {
            if (phase) seenPhases.push(phase);
          },
          clearHighlight() {},
        };
      },
    };
    registerDynamicProgramming();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(dynamicProgrammingFacet, host, { autoStart: false });
    handle.setSpeed(40);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    // 5 행 × 11 열 = 55 칸 + 행 이름표 5 + 답 배지 1.
    expect(host.querySelectorAll('svg rect').length).toBe(61);

    handle.start();
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline && new Set(seenPhases).size < PHASES.length) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(box);
    expect([...new Set(seenPhases)].sort()).toEqual(PHASES);

    // 마지막 칸의 답 90 이 화면에 있다 — 화면의 수는 알고리즘이 셈한 것이다.
    const texts = [...host.querySelectorAll('svg text')].map((t) => t.textContent ?? '');
    expect(texts).toContain('90');

    handle.destroy();
    host.remove();
  }, 40_000);
});
