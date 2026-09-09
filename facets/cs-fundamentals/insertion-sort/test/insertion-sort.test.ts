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
  insertionSort,
  insertionSortFacet,
  insertionSortImperativeIR,
  insertionSortProjector,
  registerInsertionSort,
  type InsertionSortData,
} from '../src/index.js';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

const SPEC_VALUES = [64, 25, 12, 22, 11, 90, 34];

const ALL_PHASES = ['compare', 'pick-key', 'place', 'settle', 'shift'];

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(values: number[]): Promise<Recorded & { data: InsertionSortData }> {
  const data: InsertionSortData = { type: 'array', values: [...values] };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await insertionSort({
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

describe('삽입 정렬 알고리즘', () => {
  it('사양의 자료를 정렬하고 대조 수치와 맞는다', async () => {
    const { data, metrics } = await record(SPEC_VALUES);
    expect(data.values).toEqual([11, 12, 22, 25, 34, 64, 90]);
    expect(metrics['compare-count']).toBe(14);
    expect(metrics['shift-count']).toBe(11);
    expect(metrics['insert-count']).toBe(6);
  });

  it('넣기 여섯 번의 비켜섬 수가 대조와 같다 — 90 은 0 이다', async () => {
    const { events } = await record(SPEC_VALUES);
    const passes = events
      .filter((e) => e.type === 'pass-end')
      .map((e) => e.payload as { key: number; shifts: number; slot: number });
    expect(passes).toEqual([
      { i: 1, slot: 0, key: 25, shifts: 1, sortedEnd: 1 },
      { i: 2, slot: 0, key: 12, shifts: 2, sortedEnd: 2 },
      { i: 3, slot: 1, key: 22, shifts: 2, sortedEnd: 3 },
      { i: 4, slot: 0, key: 11, shifts: 4, sortedEnd: 4 },
      { i: 5, slot: 5, key: 90, shifts: 0, sortedEnd: 5 },
      { i: 6, slot: 4, key: 34, shifts: 2, sortedEnd: 6 },
    ]);
  });

  it('맞바꿈이 아니라 밀기다 — shift 는 한 칸 오른쪽으로만 간다', async () => {
    const { events } = await record(SPEC_VALUES);
    const shifts = events
      .filter((e) => e.type === 'state-changed')
      .map((e) => e.payload as { kind: string; from?: number; to?: number })
      .filter((p) => p.kind === 'shift');
    expect(shifts).toHaveLength(11);
    expect(shifts.every((s) => (s.to ?? 0) - (s.from ?? 0) === 1)).toBe(true);
  });

  it('이미 줄 선 입력에서는 값마다 견줌 한 번씩만 든다', async () => {
    const asc = await record([1, 2, 3, 4, 5]);
    expect(asc.data.values).toEqual([1, 2, 3, 4, 5]);
    expect(asc.metrics['compare-count']).toBe(4);
    expect(asc.metrics['shift-count']).toBeUndefined();
  });

  it('빈 배열 · 한 칸 · 뒤집힌 배열', async () => {
    expect((await record([])).data.values).toEqual([]);
    expect((await record([42])).data.values).toEqual([42]);
    const desc = await record([5, 4, 3, 2, 1]);
    expect(desc.data.values).toEqual([1, 2, 3, 4, 5]);
    // 최악 — 매번 왼쪽 끝까지 밀어야 한다.
    expect(desc.metrics['shift-count']).toBe(10);
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
    expect([...emitted].sort()).toEqual([...irPhases(insertionSortImperativeIR)].sort());
    expect([...emitted].sort()).toEqual(ALL_PHASES);
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
      const res = transpiler.transpile(insertionSortImperativeIR);
      expect(res.lines.length).toBeGreaterThan(8);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual(ALL_PHASES);
      const all = res.lines.map((l) => l.code).join('\n');
      expect(all).toContain('insertion_sort');
      // 밀기 한 줄이 보여야 한다 — swap 으로 감싸면 이 문자열이 사라진다.
      expect(all).toContain('arr[j + 1] = arr[j]');
    },
  );
});

describe('Projector 배선', () => {
  it('phase 를 코드 패널로 넘기고 비켜섬 기록을 stage 에 쌓는다', async () => {
    const { events } = await record(SPEC_VALUES);
    const phaseCalls: (string | null)[] = [];
    const records: { pass: number; value: number; shifts: number }[] = [];
    let lifts = 0;
    let drops = 0;
    let sorted = false;
    const stage = {
      setData() {},
      setCaption() {},
      setSortedRun() {},
      liftKey() {
        lifts++;
      },
      aimKey() {},
      setCompare() {},
      shiftCell() {},
      dropKey() {
        drops++;
      },
      addShiftRecord(pass: number, value: number, shifts: number) {
        records.push({ pass, value, shifts });
      },
      markAllSorted() {
        sorted = true;
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

    const projector = insertionSortProjector({ stage, codePanel });
    projector.onInit?.({ type: 'array', values: SPEC_VALUES });
    for (const e of events) await projector.onEvent(e);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null)).size).toBe(5);
    expect(lifts).toBe(6);
    expect(drops).toBe(6);
    expect(sorted).toBe(true);
    expect(records.map((r) => r.shifts)).toEqual([1, 2, 2, 4, 0, 2]);
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
      mount(container: HTMLElement) {
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
    registerInsertionSort();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(insertionSortFacet, host, { autoStart: false });
    handle.setSpeed(20);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    // 칸 7 + 줄 선 구간 띠.
    expect(host.querySelectorAll('svg rect').length).toBeGreaterThanOrEqual(8);

    handle.start();
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline && new Set(seenPhases).size < 5) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(box);
    expect(new Set(seenPhases).size).toBe(5);

    handle.destroy();
    host.remove();
  }, 20_000);
});
