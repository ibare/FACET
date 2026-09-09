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
  binarySearch,
  binarySearchFacet,
  binarySearchIterativeIR,
  binarySearchProjector,
  registerBinarySearch,
  type BinarySearchData,
} from '../src/index.js';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

const SPEC_VALUES = [3, 9, 14, 21, 28, 35, 42, 50, 63, 71, 88, 95];
const SPEC_TARGETS = [71, 40];

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(values: number[], targets: number[]): Promise<Recorded> {
  const data: BinarySearchData = { type: 'array', values: [...values], targets: [...targets] };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await binarySearch({
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

describe('이진 탐색 알고리즘', () => {
  it('사양의 대조 수치와 맞는다 — 견줌 7 · 찾기 2 · 찾음 1', async () => {
    const { metrics } = await record(SPEC_VALUES, SPEC_TARGETS);
    expect(metrics['compare-count']).toBe(7);
    expect(metrics['search-count']).toBe(2);
    expect(metrics['hit-count']).toBe(1);
  });

  it('71 찾기 — 후보가 12 → 6 → 3 → 1 로 줄고 네 번째에 만난다', async () => {
    const { events } = await record(SPEC_VALUES, [71]);
    const rows = events
      .filter((e) => e.type === 'compare-result')
      .map((e) => e.payload as { lo: number; hi: number; index: number; value: number; cmp: string });
    expect(rows.map((r) => r.hi - r.lo + 1)).toEqual([12, 6, 3, 1]);
    expect(rows.map((r) => [r.index, r.value, r.cmp])).toEqual([
      [5, 35, 'lt'],
      [8, 63, 'lt'],
      [10, 88, 'gt'],
      [9, 71, 'eq'],
    ]);
    const end = events.find((e) => e.type === 'search-end')?.payload as {
      found: boolean;
      index: number;
      compares: number;
    };
    expect(end).toEqual({ run: 1, target: 71, found: true, index: 9, compares: 4 });
  });

  it('40 찾기 — 세 번 견주고 구간이 비어야 없다고 답한다', async () => {
    const { events } = await record(SPEC_VALUES, [40]);
    const rows = events
      .filter((e) => e.type === 'compare-result')
      .map((e) => e.payload as { lo: number; hi: number; index: number; value: number; cmp: string });
    expect(rows.map((r) => r.hi - r.lo + 1)).toEqual([12, 6, 2]);
    expect(rows.map((r) => [r.index, r.value, r.cmp])).toEqual([
      [5, 35, 'lt'],
      [8, 63, 'gt'],
      [6, 42, 'gt'],
    ]);
    const empty = events.find((e) => e.type === 'range-empty')?.payload as {
      lo: number;
      hi: number;
    };
    // lo 가 hi 를 지나쳐야 없다고 말할 수 있다.
    expect(empty.lo).toBeGreaterThan(empty.hi);
    const end = events.find((e) => e.type === 'search-end')?.payload;
    expect(end).toEqual({ run: 1, target: 40, found: false, index: -1, compares: 3 });
    expect(events.filter((e) => e.type === 'mark')).toEqual([]);
  });

  it('빈 배열 · 한 칸 · 양 끝 값', async () => {
    const none = await record([], [5]);
    expect(none.metrics['compare-count']).toBeUndefined();
    expect(none.events.some((e) => e.type === 'range-empty')).toBe(true);

    const one = await record([42], [42]);
    expect(one.metrics['hit-count']).toBe(1);

    const ends = await record(SPEC_VALUES, [3, 95]);
    const found = ends.events
      .filter((e) => e.type === 'search-end')
      .map((e) => (e.payload as { index: number }).index);
    expect(found).toEqual([0, 11]);
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const { events } = await record(SPEC_VALUES, SPEC_TARGETS);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const { events } = await record(SPEC_VALUES, SPEC_TARGETS);
    const emitted = new Set(
      events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(binarySearchIterativeIR)].sort());
    expect([...emitted].sort()).toEqual([
      'compare',
      'drop-left',
      'drop-right',
      'found',
      'not-found',
      'pick-mid',
      'range-check',
    ]);
  });
});

describe('IR 을 실제로 돌려 본다 (ir-interpreter)', () => {
  // 코드 패널이 보여 주는 것이 진짜로 도는 코드인지 재는 유일한 방법이다.
  // 문법만 성하고 셈이 틀린 경우를 이것이 잡는다.
  it.each([71, 40, 3, 95, 1, 100, 28, 63])('binary_search(arr, %i) 가 배열의 자리와 같다', (t) => {
    const got = runIR(binarySearchIterativeIR, 'binary_search', [[...SPEC_VALUES], t]);
    expect(got).toBe(SPEC_VALUES.indexOf(t));
  });

  it('알고리즘이 낸 답과 IR 이 낸 답이 같다', async () => {
    const { events } = await record(SPEC_VALUES, SPEC_TARGETS);
    const fromAlgorithm = events
      .filter((e) => e.type === 'search-end')
      .map((e) => (e.payload as { index: number }).index);
    const fromIR = SPEC_TARGETS.map((t) => runIR(binarySearchIterativeIR, 'binary_search', [[...SPEC_VALUES], t]));
    expect(fromAlgorithm).toEqual(fromIR);
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
      const res = transpiler.transpile(binarySearchIterativeIR);
      expect(res.lines.length).toBeGreaterThan(10);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual([...irPhases(binarySearchIterativeIR)].sort());
      const all = res.lines.map((l) => l.code).join('\n');
      expect(all).toContain('binary_search');
      // 못 찾은 답은 반복문이 끝난 뒤에만 나온다.
      expect(all).toContain('-1');
    },
  );
});

describe('Projector 배선', () => {
  it('phase 를 코드 패널로 넘기고 견줌마다 계단 한 줄을 쌓는다', async () => {
    const { events } = await record(SPEC_VALUES, SPEC_TARGETS);
    const phaseCalls: (string | null)[] = [];
    const steps: unknown[] = [];
    let emptySteps = 0;
    let foundMarks = 0;
    const stage = {
      setData() {},
      setTargets() {},
      setCaption() {},
      beginRun() {},
      setWindow() {},
      setProbe() {},
      addStep(row: unknown) {
        steps.push(row);
      },
      addEmptyStep() {
        emptySteps++;
      },
      markFound() {
        foundMarks++;
      },
      endRun() {},
      finish() {},
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

    const projector = binarySearchProjector({ stage, codePanel });
    projector.onInit?.({ type: 'array', values: SPEC_VALUES, targets: SPEC_TARGETS });
    for (const e of events) await projector.onEvent(e);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null)).size).toBe(7);
    expect(steps).toHaveLength(7);
    expect(emptySteps).toBe(1);
    expect(foundMarks).toBe(1);
    // done 이 하이라이트를 거둔다.
    expect(phaseCalls[phaseCalls.length - 1]).toBeNull();
  });
});

describe('마운트와 재생', () => {
  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
  });

  it('stage 가 칸을 그리고 재생 내내 캔버스 세로가 변하지 않는다', async () => {
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
    registerBinarySearch();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(binarySearchFacet, host, { autoStart: false });
    handle.setSpeed(20);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    // 칸 열둘 + 알약 둘.
    expect(host.querySelectorAll('svg rect').length).toBeGreaterThanOrEqual(14);

    handle.start();
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline && new Set(seenPhases).size < 7) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(box);
    expect(new Set(seenPhases).size).toBe(7);

    handle.destroy();
    host.remove();
  }, 20_000);
});
