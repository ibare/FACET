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
  quickSort,
  quickSortFacet,
  quickSortLomutoIR,
  quickSortProjector,
  registerQuickSort,
  type QuickSortData,
} from '../src/index.js';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

const SPEC_VALUES = [7, 2, 9, 4, 1, 8, 3];

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(values: number[]): Promise<Recorded & { data: QuickSortData }> {
  const data: QuickSortData = { type: 'array', values: [...values] };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await quickSort({
    data,
    cancelled: false,
    async emit(event) {
      events.push(event);
    },
    metric(name, delta) {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
  });
  return { data, events, metrics };
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

describe('퀵 정렬 알고리즘', () => {
  it('사양의 자료를 정렬하고 대조 수치와 맞는다', async () => {
    const { data, metrics } = await record(SPEC_VALUES);
    expect(data.values).toEqual([1, 2, 3, 4, 7, 8, 9]);
    expect(metrics['compare-count']).toBe(13);
    expect(metrics['swap-count']).toBe(4);
    expect(metrics['partition-count']).toBe(5);
  });

  it('가르기 다섯 번의 구간 · 기준 · 자리가 대조와 같다', async () => {
    const { events } = await record(SPEC_VALUES);
    const ends = events
      .filter((e) => e.type === 'partition-end')
      .map((e) => e.payload as { lo: number; hi: number; pivotIndex: number; pivotValue: number });
    expect(ends).toEqual([
      { lo: 0, hi: 6, pivotIndex: 2, pivotValue: 3 },
      { lo: 0, hi: 1, pivotIndex: 0, pivotValue: 1 },
      { lo: 3, hi: 6, pivotIndex: 6, pivotValue: 9 },
      { lo: 3, hi: 5, pivotIndex: 5, pivotValue: 8 },
      { lo: 3, hi: 4, pivotIndex: 4, pivotValue: 7 },
    ]);
  });

  it('모든 자리가 정확히 한 번씩 확정된다', async () => {
    const { events } = await record(SPEC_VALUES);
    const settled = events
      .filter((e) => e.type === 'mark')
      .map((e) => e.target as string);
    expect([...settled].sort()).toEqual(
      ['index:0', 'index:1', 'index:2', 'index:3', 'index:4', 'index:5', 'index:6'].sort(),
    );
  });

  it('빈 배열 · 한 칸 · 이미 정렬된 배열', async () => {
    expect((await record([])).data.values).toEqual([]);
    expect((await record([42])).data.values).toEqual([42]);
    const asc = await record([1, 2, 3, 4]);
    expect(asc.data.values).toEqual([1, 2, 3, 4]);
    // 맨 뒤를 기준 삼으면 오름차순이 최악이다 — 구간이 한 칸씩만 줄어든다.
    expect(asc.metrics['partition-count']).toBe(3);
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const { events } = await record(SPEC_VALUES);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const { events } = await record(SPEC_VALUES);
    const emitted = new Set(
      events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(quickSortLomutoIR)].sort());
    expect([...emitted].sort()).toEqual([
      'compare',
      'partition-call',
      'pick-pivot',
      'place-pivot',
      'range-check',
      'recurse-left',
      'recurse-right',
      'send-left',
    ]);
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
    '%s — 줄이 나오고 undefined 가 섞이지 않으며 phase 여덟이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(quickSortLomutoIR);
      expect(res.lines.length).toBeGreaterThan(10);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual([...irPhases(quickSortLomutoIR)].sort());
      // 두 함수가 다 나온다 — 재귀 entry point 와 자리 번호를 돌려주는 보조 함수.
      const all = res.lines.map((l) => l.code).join('\n');
      expect(all).toContain('quick_sort');
      expect(all).toContain('partition');
    },
  );
});

describe('Projector 배선', () => {
  it('phase 를 코드 패널로 넘기고 가르기를 stage 기록에 쌓는다', async () => {
    const { events } = await record(SPEC_VALUES);
    const phaseCalls: (string | null)[] = [];
    const partitions: unknown[] = [];
    let settledCount = 0;
    const stage = {
      setData() {},
      setCaption() {},
      setRange() {},
      setPivot() {},
      setCursor() {},
      setBoundary() {},
      setScanned() {},
      setCellState() {},
      clearCellStates() {},
      swapValues() {},
      markSettled() {
        settledCount++;
      },
      addPartition(row: unknown) {
        partitions.push(row);
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

    const projector = quickSortProjector({ stage, codePanel });
    projector.onInit?.({ type: 'array', values: SPEC_VALUES });
    for (const e of events) await projector.onEvent(e);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null)).size).toBe(8);
    expect(partitions).toHaveLength(5);
    expect(settledCount).toBe(7);
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
    registerQuickSort();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(quickSortFacet, host, { autoStart: false });
    handle.setSpeed(20);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    // 칸 7 + 자리 번호 7 + 기록 줄은 아직 없다.
    expect(host.querySelectorAll('svg rect').length).toBeGreaterThanOrEqual(7);

    handle.start();
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline && new Set(seenPhases).size < 8) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(box);
    expect(new Set(seenPhases).size).toBe(8);

    handle.destroy();
    host.remove();
  }, 20_000);
});
