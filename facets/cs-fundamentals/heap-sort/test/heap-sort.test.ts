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
  heapSort,
  heapSortFacet,
  heapSortInPlaceIR,
  heapSortProjector,
  registerHeapSort,
  type HeapSortData,
} from '../src/index.js';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

const SPEC_VALUES = [64, 25, 12, 22, 11, 90, 34];

const PHASES = [
  'build-heap',
  'compare-children',
  'move-down',
  'settle-down',
  'shrink-heap',
  'sift-root',
  'swap-top-end',
];

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(values: number[]): Promise<Recorded & { data: HeapSortData }> {
  const data: HeapSortData = { type: 'array', values: [...values] };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await heapSort({
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

describe('힙 정렬 알고리즘', () => {
  it('사양의 자료를 정렬하고 대조 수치와 맞는다', async () => {
    const { data, metrics } = await record(SPEC_VALUES);
    expect(data.values).toEqual([11, 12, 22, 25, 34, 64, 90]);
    expect(metrics['compare-count']).toBe(19);
    expect(metrics['swap-count']).toBe(13);
    expect(metrics['sorted-count']).toBe(7);
  });

  it('힙 만들기 직후와 꺼내기 여섯 번의 배열이 대조표와 같다', async () => {
    const data: HeapSortData = { type: 'array', values: [...SPEC_VALUES] };
    const snapshots: number[][] = [];
    await heapSort({
      data,
      cancelled: false,
      async emit(event) {
        const origin = (event.payload as { origin?: string } | undefined)?.origin;
        if (event.type === 'build-end' || (event.type === 'sift-end' && origin === 'extract')) {
          snapshots.push([...data.values]);
        }
      },
      metric() {},
    });
    expect(snapshots).toEqual([
      [90, 25, 64, 22, 11, 12, 34],
      [64, 25, 34, 22, 11, 12, 90],
      [34, 25, 12, 22, 11, 64, 90],
      [25, 22, 12, 11, 34, 64, 90],
      [22, 11, 12, 25, 34, 64, 90],
      [12, 11, 22, 25, 34, 64, 90],
      [11, 12, 22, 25, 34, 64, 90],
    ]);
  });

  it('모든 자리가 정확히 한 번씩 확정된다', async () => {
    const { events } = await record(SPEC_VALUES);
    const settled = events.filter((e) => e.type === 'mark').map((e) => e.target as string);
    expect([...settled].sort()).toEqual(
      ['index:0', 'index:1', 'index:2', 'index:3', 'index:4', 'index:5', 'index:6'].sort(),
    );
  });

  it('빈 배열 · 한 칸 · 이미 정렬된 배열 · 뒤집힌 배열', async () => {
    expect((await record([])).data.values).toEqual([]);
    const one = await record([42]);
    expect(one.data.values).toEqual([42]);
    expect(one.metrics['sorted-count']).toBe(1);
    expect((await record([1, 2, 3, 4, 5])).data.values).toEqual([1, 2, 3, 4, 5]);
    expect((await record([5, 4, 3, 2, 1])).data.values).toEqual([1, 2, 3, 4, 5]);
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
    expect([...emitted].sort()).toEqual([...irPhases(heapSortInPlaceIR)].sort());
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
      const res = transpiler.transpile(heapSortInPlaceIR);
      expect(res.lines.length).toBeGreaterThan(20);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual(PHASES);
      const all = res.lines.map((l) => l.code).join('\n');
      // 두 함수가 다 나온다 — entry point 와 보조 함수.
      expect(all).toContain('heap_sort');
      expect(all).toContain('sift_down');
      // 자리 번호 셈을 감싸지 않고 펼쳐 쓴다.
      expect(all).toContain('(2 * i) + 1');
      expect(all).toContain('(2 * i) + 2');
    },
  );

  it('파이썬은 자리 번호를 실수로 만들지 않는다 (// 정수 나눗셈)', () => {
    const code = pythonTranspiler
      .transpile(heapSortInPlaceIR)
      .lines.map((l) => l.code)
      .join('\n');
    expect(code).toContain('(n // 2) - 1');
  });
});

describe('Projector 배선', () => {
  it('phase 를 코드 패널로 넘기고 힙 크기와 확정 칸을 stage 로 보낸다', async () => {
    const { events } = await record(SPEC_VALUES);
    const phaseCalls: (string | null)[] = [];
    const heapSizes: number[] = [];
    let settledCount = 0;
    const stage = {
      setData() {},
      setCaption() {},
      setHeapSize(size: number) {
        heapSizes.push(size);
      },
      setFocus() {},
      setEdges() {},
      setCellState() {},
      clearCellStates() {},
      swapValues() {},
      markSettled() {
        settledCount++;
      },
      setExtractArc() {},
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

    const projector = heapSortProjector({ stage, codePanel });
    projector.onInit?.({ type: 'array', values: SPEC_VALUES });
    for (const e of events) await projector.onEvent(e);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null)).size).toBe(PHASES.length);
    expect(settledCount).toBe(7);
    // onInit 의 7 로 시작해 힙이 한 칸씩 줄어든다.
    expect(heapSizes).toEqual([7, 6, 5, 4, 3, 2, 1]);
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
    let panelIrId: string | undefined;
    const fakeCodeView: View = {
      mount(container, params) {
        panelIrId = (params.config as { _ir?: { id?: string } })._ir?.id;
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
    registerHeapSort();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(heapSortFacet, host, { autoStart: false });
    handle.setSpeed(20);

    // 러너가 `ir:heapsort-inplace` 를 레지스트리에서 찾아 코드 패널에 넣는다 (C4).
    expect(panelIrId).toBe('heapsort-inplace');

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    // 칸 7 개는 마운트 직후부터 그려져 있다.
    expect(host.querySelectorAll('svg rect').length).toBeGreaterThanOrEqual(7);
    // 부모-자식 활 여섯 (0→1,0→2,1→3,1→4,2→5,2→6).
    expect(host.querySelectorAll('svg path').length).toBe(6);

    handle.start();
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline && new Set(seenPhases).size < PHASES.length) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(box);
    expect(new Set(seenPhases).size).toBe(PHASES.length);

    handle.destroy();
    host.remove();
  }, 20_000);
});
