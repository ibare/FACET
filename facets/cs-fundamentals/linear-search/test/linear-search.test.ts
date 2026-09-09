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
  linearSearch,
  linearSearchFacet,
  linearSearchScanIR,
  linearSearchProjector,
  registerLinearSearch,
  type LinearSearchData,
} from '../src/index.js';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

const SPEC_VALUES = [42, 17, 93, 8, 55, 71, 30, 64];
const SPEC_TARGETS = [55, 50];

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(values: number[], targets: number[]): Promise<Recorded> {
  const data: LinearSearchData = { type: 'array', values: [...values], targets: [...targets] };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await linearSearch({
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

describe('선형 탐색 알고리즘', () => {
  it('사양의 대조 수치와 맞는다 — 55 는 다섯을 보고 멈추고 50 은 여덟을 다 본다', async () => {
    const { events, metrics } = await record(SPEC_VALUES, SPEC_TARGETS);
    const ends = events
      .filter((e) => e.type === 'search-end')
      .map((e) => e.payload);
    expect(ends).toEqual([
      { round: 0, target: 55, found: true, index: 4, examined: 5 },
      { round: 1, target: 50, found: false, index: -1, examined: 8 },
    ]);
    expect(metrics['search-count']).toBe(2);
    expect(metrics['compare-count']).toBe(13);
    expect(metrics['hit-count']).toBe(1);
  });

  it('찾은 자리 하나만 표시하고 done 이 셈을 마무리한다', async () => {
    const { events } = await record(SPEC_VALUES, SPEC_TARGETS);
    const marks = events.filter((e) => e.type === 'mark').map((e) => e.target);
    expect(marks).toEqual(['index:4']);
    const done = events.filter((e) => e.type === 'done');
    expect(done).toHaveLength(1);
    expect(done[0].payload).toEqual({ searches: 2, compares: 13, hits: 1 });
  });

  it('빈 줄 · 첫 칸 · 마지막 칸', async () => {
    const empty = await record([], [7]);
    expect(empty.metrics['compare-count']).toBeUndefined();
    const first = await record(SPEC_VALUES, [42]);
    expect(first.metrics['compare-count']).toBe(1);
    const last = await record(SPEC_VALUES, [64]);
    expect(last.metrics['compare-count']).toBe(8);
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const { events } = await record(SPEC_VALUES, SPEC_TARGETS);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

describe('IR 이 실제로 도는 코드다 (@ffacet/ir-interpreter)', () => {
  it('인터프리터 실행 결과가 알고리즘의 답과 같다', () => {
    expect(runIR(linearSearchScanIR, 'linear_search', [[...SPEC_VALUES], 55])).toBe(4);
    expect(runIR(linearSearchScanIR, 'linear_search', [[...SPEC_VALUES], 50])).toBe(-1);
    expect(runIR(linearSearchScanIR, 'linear_search', [[...SPEC_VALUES], 42])).toBe(0);
    expect(runIR(linearSearchScanIR, 'linear_search', [[...SPEC_VALUES], 64])).toBe(7);
    expect(runIR(linearSearchScanIR, 'linear_search', [[], 55])).toBe(-1);
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
    expect([...emitted].sort()).toEqual([...irPhases(linearSearchScanIR)].sort());
    expect([...emitted].sort()).toEqual(['advance', 'compare', 'found', 'not-found']);
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
    '%s — undefined 가 섞이지 않고 phase 넷이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(linearSearchScanIR);
      expect(res.lines.length).toBeGreaterThanOrEqual(5);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual([...irPhases(linearSearchScanIR)].sort());
      expect(res.lines.map((l) => l.code).join('\n')).toContain('linear_search');
    },
  );

  // 이 완제품이 보이려는 것 — 짧은 IR 하나에서 `len(arr)` 이 여섯 갈래로 갈린다.
  it.each([
    [pythonTranspiler, 'len(arr)'],
    [javascriptTranspiler, 'arr.length'],
    [typescriptTranspiler, 'arr.length'],
    [javaTranspiler, 'arr.length'],
    [cppTranspiler, 'arr.size()'],
    [csharpTranspiler, 'arr.Length'],
  ] as const)('$0.id — 길이 표현이 %s 로 나온다', (transpiler, expected) => {
    const loop = transpiler
      .transpile(linearSearchScanIR)
      .lines.find((l) => l.phase === 'advance');
    expect(loop?.code).toContain(expected);
  });
});

describe('Projector 배선', () => {
  it('phase 를 코드 패널로 넘기고 훑기 결과를 stage 기록에 쌓는다', async () => {
    const { events } = await record(SPEC_VALUES, SPEC_TARGETS);
    const phaseCalls: (string | null)[] = [];
    const records: unknown[] = [];
    const outcomes: (string | null)[] = [];
    const stage = {
      setData() {},
      setTarget() {},
      setOutcome(o: string | null) {
        outcomes.push(o);
      },
      setCursor() {},
      setCellState() {},
      clearCells() {},
      setCaption() {},
      addRecord(row: unknown) {
        records.push(row);
      },
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

    const projector = linearSearchProjector({ stage, codePanel });
    projector.onInit?.({ type: 'array', values: SPEC_VALUES, targets: SPEC_TARGETS });
    for (const e of events) await projector.onEvent(e);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null)).size).toBe(4);
    expect(records).toEqual([
      { target: 55, index: 4, examined: 5 },
      { target: 50, index: -1, examined: 8 },
    ]);
    expect(outcomes).toEqual([null, 'hit', null, 'miss']);
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
    registerLinearSearch();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(linearSearchFacet, host, { autoStart: false });
    handle.setSpeed(20);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    // 표찰 하나 + 칸 여덟.
    expect(host.querySelectorAll('svg rect').length).toBe(9);

    handle.start();
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && new Set(seenPhases).size < 4) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(box);
    expect(new Set(seenPhases).size).toBe(4);

    handle.destroy();
    host.remove();
  }, 30_000);
});
