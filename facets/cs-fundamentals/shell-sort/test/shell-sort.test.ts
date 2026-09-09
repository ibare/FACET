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
  shellSort,
  shellSortFacet,
  shellSortGapIR,
  shellSortProjector,
  countNeighbourOnly,
  registerShellSort,
  type ShellSortData,
} from '../src/index.js';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

const SPEC_VALUES = [64, 25, 12, 22, 11, 90, 34];
const PHASES = ['compare', 'gap-end', 'pick-value', 'place', 'set-gap', 'shift'];

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(values: number[]): Promise<Recorded & { data: ShellSortData }> {
  const data: ShellSortData = { type: 'array', values: [...values] };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await shellSort({
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

describe('셸 정렬 알고리즘', () => {
  it('사양의 자료를 정렬하고 대조 수치와 맞는다', async () => {
    const { data, metrics } = await record(SPEC_VALUES);
    expect(data.values).toEqual([11, 12, 22, 25, 34, 64, 90]);
    expect(metrics['compare-count']).toBe(14);
    expect(metrics['shift-count']).toBe(7);
    expect(metrics['gap-count']).toBe(2);
  });

  it('간격 라운드 둘의 셈과 간격 수열이 대조와 같다', async () => {
    const { events } = await record(SPEC_VALUES);
    const rounds = events
      .filter((e) => e.type === 'round-end')
      .map((e) => e.payload as { round: number; gap: number; compares: number; shifts: number });
    expect(rounds).toEqual([
      { round: 1, gap: 3, compares: 5, shifts: 3 },
      { round: 2, gap: 1, compares: 9, shifts: 4 },
    ]);
  });

  it('간격 3 이 자리 0·3·6 / 1·4 / 2·5 세 사슬을 만든다', async () => {
    const { events } = await record(SPEC_VALUES);
    const begins = events
      .filter((e) => e.type === 'round-begin')
      .map((e) => e.payload as { gap: number; chains: number[][] });
    expect(begins[0].gap).toBe(3);
    expect(begins[0].chains).toEqual([
      [0, 3, 6],
      [1, 4],
      [2, 5],
    ]);
    expect(begins[1].gap).toBe(1);
    expect(begins[1].chains).toEqual([[0, 1, 2, 3, 4, 5, 6]]);
  });

  it('대조군 — 같은 입력을 간격 1 만으로 하면 이동이 열하나다', async () => {
    expect(countNeighbourOnly(SPEC_VALUES)).toEqual({ compares: 14, shifts: 11 });
    const { events } = await record(SPEC_VALUES);
    const baseline = events.find((e) => e.type === 'baseline')?.payload;
    expect(baseline).toEqual({ compares: 14, shifts: 11 });
    const done = events[events.length - 1];
    expect(done.type).toBe('done');
    expect(done.payload).toEqual({
      compares: 14,
      shifts: 7,
      rounds: 2,
      baselineShifts: 11,
    });
  });

  it('빈 배열 · 한 칸 · 이미 정렬된 배열', async () => {
    expect((await record([])).data.values).toEqual([]);
    expect((await record([42])).data.values).toEqual([42]);
    const asc = await record([1, 2, 3, 4]);
    expect(asc.data.values).toEqual([1, 2, 3, 4]);
    // 이미 정렬돼 있으면 비켜설 것이 없다.
    expect(asc.metrics['shift-count']).toBeUndefined();
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
    expect([...emitted].sort()).toEqual([...irPhases(shellSortGapIR)].sort());
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
    '%s — 줄이 나오고 undefined 가 섞이지 않으며 phase 여섯이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(shellSortGapIR);
      expect(res.lines.length).toBeGreaterThan(10);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual(PHASES);
      // 삽입 정렬 골격에 1 이 gap 으로 바뀐 두 자리가 코드에 그대로 있어야 한다.
      const all = res.lines.map((l) => l.code).join('\n');
      expect(all).toContain('arr[j - gap]');
      expect(all).toContain('j = j - gap');
      // 이름 붙인 호출 0건 — 보조 함수도 없다.
      expect(shellSortGapIR.functions).toHaveLength(1);
    },
  );
});

describe('Projector 배선', () => {
  it('phase 를 코드 패널로 넘기고 구멍 · 사슬 · 이동을 stage 로 옮긴다', async () => {
    const { events } = await record(SPEC_VALUES);
    const phaseCalls: (string | null)[] = [];
    const gaps: number[] = [];
    const chainSelections: (number | null)[] = [];
    let shiftCalls = 0;
    let baseline = -1;
    const stage = {
      setData() {},
      setCaption() {},
      setBaseline(shifts: number) {
        baseline = shifts;
      },
      setGap(gap: number) {
        gaps.push(gap);
      },
      setActiveChain(chain: number | null) {
        chainSelections.push(chain);
      },
      setHold() {},
      setHole() {},
      setValue() {},
      setCellState() {},
      clearCellStates() {},
      setShiftArrow() {},
      addShift() {
        shiftCalls++;
      },
      clearFocus() {},
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

    const projector = shellSortProjector({ stage, codePanel });
    projector.onInit?.({ type: 'array', values: SPEC_VALUES });
    for (const e of events) await projector.onEvent(e);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null)).size).toBe(6);
    expect(gaps).toEqual([3, 1]);
    expect(shiftCalls).toBe(7);
    expect(baseline).toBe(11);
    // 간격 3 라운드는 사슬 0·1·2 를 차례로 돌고, 간격 1 라운드는 사슬 0 뿐이다.
    expect(chainSelections.slice(0, 4)).toEqual([0, 1, 2, 0]);
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
    registerShellSort();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(shellSortFacet, host, { autoStart: false });
    handle.setSpeed(20);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    // 칸 일곱.
    expect(host.querySelectorAll('svg rect').length).toBeGreaterThanOrEqual(7);

    handle.start();
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline && new Set(seenPhases).size < 6) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(box);
    expect(new Set(seenPhases).size).toBe(6);

    handle.destroy();
    host.remove();
  }, 20_000);
});

describe('되감기', () => {
  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
  });

  it('reset 뒤 다시 재생해도 같은 결과와 같은 셈이 나온다', async () => {
    const fakeCodeView: View = {
      mount(container) {
        const node = document.createElement('div');
        container.appendChild(node);
        return {
          destroy() {
            node.remove();
          },
          highlightPhase() {},
          clearHighlight() {},
        };
      },
    };
    registerShellSort();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(shellSortFacet, host, { autoStart: false });
    handle.setSpeed(20);

    const barText = (): string[] =>
      [...host.querySelectorAll('svg text')].map((t) => t.textContent ?? '');

    const playToEnd = async (): Promise<void> => {
      handle.start();
      const deadline = Date.now() + 12_000;
      while (Date.now() < deadline && !barText().some((t) => t.includes('Sorted with'))) {
        await new Promise((r) => setTimeout(r, 50));
      }
    };

    await playToEnd();
    const first = barText();
    expect(first.some((t) => t.includes('Sorted with'))).toBe(true);

    handle.reset();
    await new Promise((r) => setTimeout(r, 200));
    // 되감으면 대조 막대도 캡션도 걷힌다.
    expect(barText().some((t) => t.includes('Sorted with'))).toBe(false);

    await playToEnd();
    expect(barText()).toEqual(first);

    handle.destroy();
    host.remove();
  }, 30_000);
});
