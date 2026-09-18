// @vitest-environment happy-dom
/**
 * 비순차 실행 — 사양 표 · IR 대조 · 회차별 계기 · 이름 정합.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  getFacetById,
  getIR,
  getProjector,
  getView,
  mountView,
} from '@ffacet/core/runtime';
import type { FacetContext, FacetRuntimeEvent, IRStmt, ProjectorViews } from '@ffacet/core/runtime';
import {
  decodeInstruction,
  outOfOrderExecutionAlgorithm,
  outOfOrderExecutionFacet,
  outOfOrderExecutionImperativeIR,
  outOfOrderExecutionProjector,
  outOfOrderExecutionStageView,
  registerOutOfOrderExecution,
  simulateOutOfOrder,
} from '../src/index.js';
import type { OutOfOrderExecutionData } from '../src/index.js';

const data = outOfOrderExecutionFacet.initialData as OutOfOrderExecutionData;

/** 사양 표 — 대조용. */
const TABLE: Record<number, { cycles: number; ipc: number; over: number; start: number[]; commit: number[] }> = {
  1: { cycles: 15, ipc: 53, over: 0, start: [1, 5, 6, 7, 8, 9, 10, 14], commit: [5, 6, 7, 8, 9, 10, 14, 15] },
  2: { cycles: 13, ipc: 62, over: 0, start: [1, 5, 6, 6, 7, 7, 8, 12], commit: [5, 6, 7, 7, 8, 8, 12, 13] },
  4: { cycles: 12, ipc: 67, over: 2, start: [1, 5, 6, 1, 5, 6, 7, 11], commit: [5, 6, 7, 7, 7, 7, 11, 12] },
  8: { cycles: 8, ipc: 100, over: 4, start: [1, 5, 6, 1, 2, 2, 3, 7], commit: [5, 6, 7, 7, 7, 7, 7, 8] },
};

function irArgs(window: number) {
  const ins = data.instructions.map((a) => decodeInstruction(a, data.latency));
  const n = ins.length;
  return {
    lat: ins.map((i) => i.latency),
    dst: ins.map((i) => i.dst),
    srcA: ins.map((i) => i.srcs[0] ?? -1),
    srcB: ins.map((i) => i.srcs[1] ?? -1),
    window,
    width: data.width,
    start: new Array<number>(n).fill(0),
    done: new Array<number>(n).fill(0),
  };
}

type Run = { window: number; metrics: Record<string, number> };

/** reactive ctx 흉내 — sleep 은 곧장 지나고, 입력이 떨어지면 취소한다. */
function drive(inputs: { type: string; payload?: unknown }[]) {
  const metrics = new Map<string, number>();
  const events: FacetRuntimeEvent[] = [];
  const runs: Run[] = [];
  /** 걸음 경계(sleep)에서 코드 패널에 남아 있는 phase — 마지막 phase 가 이긴다. */
  const boundaryPhases: string[] = [];
  let lastPhase = '';
  let cancelled = false;
  let window = 0;
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      const p = e.payload as Record<string, unknown> | undefined;
      if (e.type === 'phase') lastPhase = String(p?.phase);
      if (e.type === 'run-begin') window = p?.window as number;
      if (e.type === 'run-end') runs.push({ window, metrics: Object.fromEntries(metrics) });
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      boundaryPhases.push(lastPhase);
      return !cancelled;
    },
    async waitForInput() {
      const next = inputs.shift();
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
  return {
    run: () => outOfOrderExecutionAlgorithm(ctx as unknown as FacetContext<OutOfOrderExecutionData>),
    events,
    runs,
    boundaryPhases,
  };
}

const knob = (value: unknown) => ({ type: 'window', payload: { value, segmentIndex: 0 } });

function irPhases(stmts: IRStmt[], out: Set<string>): void {
  for (const s of stmts) {
    if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
    if (s.kind === 'if') {
      irPhases(s.then, out);
      if (s.else) irPhases(s.else, out);
    }
    if (s.kind === 'while' || s.kind === 'for-range') irPhases(s.body, out);
  }
}

describe('비순차 실행 — 셈', () => {
  it('명령어 글을 풀면 목적지가 서로 겹치지 않는다', () => {
    const ins = data.instructions.map((a) => decodeInstruction(a, data.latency));
    expect(ins.map((i) => i.dst)).toEqual([1, 3, 5, 7, 10, 12, 15, 17]);
    expect(ins.map((i) => i.latency)).toEqual([4, 1, 1, 1, 1, 1, 4, 1]);
    expect(new Set(ins.map((i) => i.dst)).size).toBe(ins.length);
  });

  it.each([1, 2, 4, 8])('창 %i — 사양 표와 같다', (w) => {
    const sim = simulateOutOfOrder(data, w);
    const row = TABLE[w]!;
    expect(sim.cycles).toBe(row.cycles);
    expect(sim.ipcPercent).toBe(row.ipc);
    expect(sim.overtakes).toBe(row.over);
    expect(sim.start).toEqual(row.start);
    expect(sim.commit).toEqual(row.commit);
  });

  it('창이 넓을수록 박자는 줄고 앞지름은 는다 (단조)', () => {
    const sims = data.windows.map((w) => simulateOutOfOrder(data, w));
    for (let i = 1; i < sims.length; i += 1) {
      expect(sims[i]!.cycles).toBeLessThan(sims[i - 1]!.cycles);
      expect(sims[i]!.overtakes).toBeGreaterThanOrEqual(sims[i - 1]!.overtakes);
    }
  });
});

describe('비순차 실행 — IR 은 화면과 같은 답을 낸다', () => {
  it.each([1, 2, 4, 8])('창 %i — 박자 · IPC · 시작 버퍼 · 앞지름', (w) => {
    const sim = simulateOutOfOrder(data, w);
    const a = irArgs(w);
    const cycles = runIR(outOfOrderExecutionImperativeIR, 'countCycles', [
      a.lat, a.dst, a.srcA, a.srcB, a.window, a.width, a.start, a.done,
    ]);
    expect(cycles).toBe(sim.cycles);
    expect(a.start).toEqual(sim.start);
    expect(a.done).toEqual(sim.done);
    expect(runIR(outOfOrderExecutionImperativeIR, 'ipcPercent', [a.lat.length, sim.cycles])).toBe(sim.ipcPercent);
    expect(runIR(outOfOrderExecutionImperativeIR, 'countOvertakes', [a.start])).toBe(sim.overtakes);
  });

  it('32비트 — 버퍼 길이 8, 사다리 끝 8, 중간값 최대 15', () => {
    expect(data.instructions.length).toBe(8);
    expect(Math.max(...data.windows)).toBe(8);
    let peak = 0;
    for (const w of data.windows) {
      const sim = simulateOutOfOrder(data, w);
      peak = Math.max(peak, sim.cycles, ...sim.done, ...sim.commit, data.instructions.length * 100 + sim.cycles);
    }
    // 가장 큰 중간값은 IPC 분자 800 + 7 — 10^4 아래.
    expect(peak).toBeLessThan(10_000);
    expect(Math.max(...data.windows.map((w) => simulateOutOfOrder(data, w).cycles))).toBe(15);
  });

  it('걸음 경계마다 남는 phase — 커밋 · 시작 · 판정 · 박자 넘김이 모두 한 번은 보인다', async () => {
    const d = drive([knob(8)]);
    await d.run();
    const seen = new Set(d.boundaryPhases);
    for (const ph of ['advance-cycle', 'commit', 'check-ready', 'issue']) expect(seen).toContain(ph);
    // 커밋이 일어나는 박자 수만큼 커밋 phase 가 걸음 경계에 선다.
    const commitCycles = [1, 8]
      .map((w) => simulateOutOfOrder(data, w).trace.filter((t) => t.commits.length > 0).length)
      .reduce((a, b) => a + b, 0);
    expect(d.boundaryPhases.filter((p) => p === 'commit').length).toBe(commitCycles);
  });

  it('phase 집합 — algorithm 과 IR 이 같다 (C3)', async () => {
    const d = drive([knob(2), knob(4), knob(8)]);
    await d.run();
    const fromAlgo = new Set(
      d.events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase: string }).phase),
    );
    const fromIR = new Set<string>();
    for (const f of outOfOrderExecutionImperativeIR.functions) irPhases(f.body, fromIR);
    expect([...fromAlgo].sort()).toEqual([...fromIR].sort());
    expect(d.events.filter((e) => e.type === 'phase').every((e) => e.silent === true)).toBe(true);
  });
});

describe('비순차 실행 — 손잡이와 계기', () => {
  it('회차마다 계기가 사양 표와 같다 (1 → 8 → 1 → 4 → 2, 쌓이지 않는다)', async () => {
    const d = drive([knob(8), { type: 'other' }, knob(3), knob('4'), knob(1), knob(4), knob(2)]);
    await d.run();
    expect(d.runs.map((r) => r.window)).toEqual([1, 8, 1, 4, 2]);
    for (const r of d.runs) {
      const row = TABLE[r.window]!;
      expect(r.metrics).toEqual({
        'cycle-count': row.cycles,
        'ipc-percent': row.ipc,
        'overtake-count': row.over,
      });
    }
  });

  it('사다리 = segments[].value, 기본 구간 = initialWindow', () => {
    const controls = (outOfOrderExecutionFacet.blocks.controls as { controls: Record<string, unknown>[] }).controls;
    const slider = controls.find((c) => c.widget === 'segmented-slider')!;
    const segs = slider.segments as { value: unknown; default?: boolean }[];
    expect(segs.map((s) => s.value)).toEqual(data.windows);
    expect(segs.find((s) => s.default)?.value).toBe(data.initialWindow);
    expect(slider.action).toBe('window');
  });

  it('선언한 계기 이름 = algorithm 이 보내는 이름', async () => {
    const d = drive([]);
    await d.run();
    const declared = (outOfOrderExecutionFacet.blocks.controls as { metrics: { name: string }[] }).metrics.map(
      (m) => m.name,
    );
    expect(Object.keys(d.runs[0]!.metrics).sort()).toEqual([...declared].sort());
  });
});

describe('비순차 실행 — 등록 · 이름', () => {
  it('등록하면 reactive 이고 이름이 서로 맞는다', () => {
    clearRegistry();
    registerOutOfOrderExecution();
    expect(getAlgorithmMechanismKind('outOfOrderExecution')).toBe('reactive');
    expect(getProjector('outOfOrderExecutionProjector')).toBe(outOfOrderExecutionProjector);
    expect(getIR('out-of-order-execution-imperative')).toBe(outOfOrderExecutionImperativeIR);
    expect(getView('out-of-order-execution-stage')).toBe(outOfOrderExecutionStageView);
    expect(getFacetById('facet:outOfOrderExecution')).toBe(outOfOrderExecutionFacet);
    expect(outOfOrderExecutionFacet.algorithm).toBe('module:outOfOrderExecution');
    expect(outOfOrderExecutionImperativeIR.algorithm).toBe('outOfOrderExecution');
    expect((outOfOrderExecutionFacet.blocks.codePanel as { ir: string }).ir).toBe(
      'ir:out-of-order-execution-imperative',
    );
    expect(data.type).toBe('out-of-order-execution');
  });
});

describe('비순차 실행 — projector · stage', () => {
  function recordingViews() {
    const calls: { name: string; args: unknown[] }[] = [];
    const stage = new Proxy(
      {},
      {
        get: (_t, name) => (...args: unknown[]) => {
          calls.push({ name: String(name), args });
        },
      },
    );
    const phases: (string | null)[] = [];
    const views = {
      stage,
      codePanel: { highlightPhase: (p: string | null) => phases.push(p), clearHighlight: () => undefined },
    } as unknown as ProjectorViews;
    return { views, calls, phases };
  }

  it('phase 를 코드 패널로 넘기고, 캡션의 이름과 수가 셈과 같다', async () => {
    const { views, calls, phases } = recordingViews();
    const proj = outOfOrderExecutionProjector(views, { getSpeed: () => 1, t: (_k, en, vars) =>
      en.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? `{${k}}`)) });
    const d = drive([knob(8)]);
    await d.run();
    const captions: string[] = [];
    for (const e of d.events) {
      await proj.onEvent(e);
      const last = calls[calls.length - 1];
      if (last?.name === 'setCaption') captions.push(String(last.args[0]));
    }
    expect(phases).toContain('check-ready');
    // 창 8 의 1 박자: I1 과 I4 가 시작하고, I4 는 I2 · I3 를 앞지른다.
    expect(captions).toContain('Cycle 1 — overtake: I4 starts while I2 · I3 still waits');
    // 창 8 의 7 박자: I3..I7 이 한꺼번에 원래 순서대로 빠져나간다 (그 박자엔 I8 이 시작해 캡션은 시작이 이긴다).
    const lastBegin = calls.map((c) => c.name).lastIndexOf('beginRun');
    expect(calls[lastBegin]!.args).toEqual([8, 2, 15]);
    const commits = calls
      .slice(lastBegin)
      .filter((c) => c.name === 'commit' && c.args[1] === 7)
      .map((c) => c.args[0]);
    expect(commits).toEqual([2, 3, 4, 5, 6]);
    expect(captions[captions.length - 1]).toBe('Finished in 8 cycles · IPC 100% · 4 overtakes');
    const finishes = calls.filter((c) => c.name === 'finish').map((c) => c.args[0]);
    expect(finishes).toEqual([15, 8]);
  });

  it('stage 는 마운트 뒤 viewBox 를 바꾸지 않고, 한 판을 그려도 던지지 않는다', async () => {
    const container = document.createElement('div');
    const inst = mountView(outOfOrderExecutionStageView, container, {
      config: {},
      initialData: data as unknown as Record<string, unknown>,
    });
    const svg = container.querySelector('svg')!;
    const viewBox = svg.getAttribute('viewBox');
    expect(viewBox?.split(/\s+/)[3]).toBe('476');
    const proj = outOfOrderExecutionProjector({ stage: inst } as ProjectorViews, undefined);
    proj.onInit?.(data);
    const d = drive([knob(4)]);
    await d.run();
    for (const e of d.events) await proj.onEvent(e);
    expect(svg.getAttribute('viewBox')).toBe(viewBox);
    expect(container.contains(svg)).toBe(true);
    expect(svg.querySelectorAll('g > rect').length).toBeGreaterThan(8);
    inst.destroy();
  });
});
