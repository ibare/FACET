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
  selectionSort,
  computeSelectionSortResult,
  selectionSortFacet,
  selectionSortImperativeIR,
  selectionSortProjector,
  registerSelectionSort,
  type SelectionSortData,
} from '../src/index.js';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

const SPEC_VALUES = [64, 25, 12, 22, 11, 90, 34];
const PHASES = ['compare', 'move-min', 'pick-seat', 'settle', 'swap'];

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(values: number[]): Promise<Recorded & { data: SelectionSortData }> {
  const data: SelectionSortData = { type: 'array', values: [...values] };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await selectionSort({
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

describe('선택 정렬 알고리즘', () => {
  it('사양의 자료를 정렬하고 대조 수치와 맞는다', async () => {
    const { data, metrics } = await record(SPEC_VALUES);
    expect(data.values).toEqual([11, 12, 22, 25, 34, 64, 90]);
    expect(metrics['compare-count']).toBe(21);
    expect(metrics['swap-count']).toBe(5);
    expect(metrics['pass-count']).toBe(6);
  });

  it('바퀴마다 견줌이 하나씩 줄고, i=3 은 이미 제자리라 옮기지 않는다', async () => {
    const { events } = await record(SPEC_VALUES);
    const rows = events
      .filter((e) => e.type === 'pass-end')
      .map((e) => e.payload as { pass: number; seat: number; compares: number; swapped: boolean })
      .map((p) => ({ pass: p.pass, seat: p.seat, compares: p.compares, swapped: p.swapped }));
    expect(rows).toEqual([
      { pass: 1, seat: 0, compares: 6, swapped: true },
      { pass: 2, seat: 1, compares: 5, swapped: true },
      { pass: 3, seat: 2, compares: 4, swapped: true },
      { pass: 4, seat: 3, compares: 3, swapped: false },
      { pass: 5, seat: 4, compares: 2, swapped: true },
      { pass: 6, seat: 5, compares: 1, swapped: true },
    ]);
  });

  it('견줌 수는 입력이 정하지 않는다 — 어떤 배치든 21 번이다', async () => {
    const sorted = await record([11, 12, 22, 25, 34, 64, 90]);
    const reversed = await record([90, 64, 34, 25, 22, 12, 11]);
    expect(sorted.metrics['compare-count']).toBe(21);
    expect(reversed.metrics['compare-count']).toBe(21);
    // 이미 정렬돼 있으면 표식이 자리를 떠나지 않아 이동이 아예 없다.
    expect(sorted.metrics['swap-count']).toBeUndefined();
    expect(reversed.data.values).toEqual([11, 12, 22, 25, 34, 64, 90]);
  });

  it('모든 자리가 정확히 한 번씩 확정된다 — 마지막 하나는 저절로', async () => {
    const { events } = await record(SPEC_VALUES);
    const settled = events.filter((e) => e.type === 'mark').map((e) => e.target as string);
    expect(settled).toEqual([
      'index:0',
      'index:1',
      'index:2',
      'index:3',
      'index:4',
      'index:5',
      'index:6',
    ]);
  });

  it('빈 배열 · 한 칸', async () => {
    const empty = await record([]);
    expect(empty.data.values).toEqual([]);
    expect(empty.events.filter((e) => e.type === 'pass-begin')).toHaveLength(0);
    const one = await record([42]);
    expect(one.data.values).toEqual([42]);
    expect(one.events.filter((e) => e.type === 'mark')).toHaveLength(1);
  });

  it('순수 함수와 재생 결과가 같다', async () => {
    const { data, metrics } = await record(SPEC_VALUES);
    const pure = computeSelectionSortResult(SPEC_VALUES);
    expect(pure.values).toEqual(data.values);
    expect(pure.compares).toBe(metrics['compare-count']);
    expect(pure.swaps).toBe(metrics['swap-count']);
    expect(pure.passes).toBe(metrics['pass-count']);
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
      events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(selectionSortImperativeIR)].sort());
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
    '%s — 줄이 나오고 undefined 가 섞이지 않으며 phase 다섯이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(selectionSortImperativeIR);
      expect(res.lines.length).toBeGreaterThan(8);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual(PHASES);
      // 이름 붙인 호출이 하나도 없다 — 함수는 entry point 하나뿐이다.
      expect(res.lines.map((l) => l.code).join('\n')).toContain('selection_sort');
    },
  );
});

describe('Projector 배선', () => {
  it('phase 를 코드 패널로 넘기고 바퀴마다 장부 한 줄을 닫는다', async () => {
    const { events } = await record(SPEC_VALUES);
    const phaseCalls: (string | null)[] = [];
    const closed: { pass: number; compares: number; swapped: boolean }[] = [];
    let compareTicks = 0;
    let settledCount = 0;
    let totals: [number, number] = [0, 0];
    const stage = {
      setData() {},
      setCaption() {},
      setSeat() {},
      setMinMarker() {},
      setCursor() {},
      flashSwap() {},
      clearTransient() {},
      swapValues() {},
      markSettled() {
        settledCount++;
      },
      beginPass() {},
      addCompare() {
        compareTicks++;
      },
      endPass(pass: number, compares: number, swapped: boolean) {
        closed.push({ pass, compares, swapped });
      },
      setTotals(compares: number, moves: number) {
        totals = [compares, moves];
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

    const projector = selectionSortProjector({ stage, codePanel });
    projector.onInit?.({ type: 'array', values: SPEC_VALUES });
    for (const e of events) await projector.onEvent(e);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null)).size).toBe(PHASES.length);
    expect(closed.map((r) => r.compares)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(closed.filter((r) => r.swapped)).toHaveLength(5);
    // 장부에 쌓인 칸 수는 알고리즘이 센 견줌 수와 같다.
    expect(compareTicks).toBe(21);
    expect(settledCount).toBe(7);
    expect(totals).toEqual([21, 5]);
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
    registerSelectionSort();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(selectionSortFacet, host, { autoStart: false });
    handle.setSpeed(20);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    // 칸 7 + 확정 구간 tint + 장부 칸 21 (6+5+4+3+2+1) + 줄 배경 6.
    expect(host.querySelectorAll('svg rect').length).toBeGreaterThanOrEqual(7 + 1 + 21 + 6);

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
