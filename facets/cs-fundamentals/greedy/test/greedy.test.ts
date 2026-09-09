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
  greedy,
  greedyFacet,
  greedyProjector,
  activitySelectionIR,
  registerGreedy,
  type GreedyData,
} from '../src/index.js';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

/** 사양의 회의 여덟. 이미 끝나는 시간 순이다. */
const SPEC_STARTS = [1, 3, 0, 5, 3, 5, 6, 8];
const SPEC_ENDS = [4, 5, 6, 7, 9, 9, 10, 11];

const IR_PHASES = ['compare', 'done', 'init', 'pick', 'skip', 'sort', 'visit'];

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(
  starts: number[],
  ends: number[],
): Promise<Recorded & { data: GreedyData }> {
  const data: GreedyData = { type: 'activities', starts: [...starts], ends: [...ends] };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await greedy({
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

describe('활동 선택 알고리즘', () => {
  it('사양의 대조와 같은 셋을 고른다', async () => {
    const { events, metrics } = await record(SPEC_STARTS, SPEC_ENDS);
    expect(metrics['compare-count']).toBe(8);
    expect(metrics['pick-count']).toBe(3);
    expect(metrics['skip-count']).toBe(5);

    const done = events.find((e) => e.type === 'done');
    expect(done?.payload).toEqual({ chosen: [0, 3, 7], compares: 8, picks: 3, skips: 5 });

    // [1,4] · [5,7] · [8,11] 셋이다.
    const picked = events
      .filter((e) => e.type === 'mark')
      .map((e) => e.payload as { kind: string; start: number; end: number })
      .filter((p) => p.kind === 'picked')
      .map((p) => [p.start, p.end]);
    expect(picked).toEqual([
      [1, 4],
      [5, 7],
      [8, 11],
    ]);
  });

  it('견줌 여덟이 대조표 그대로다', async () => {
    const { events } = await record(SPEC_STARTS, SPEC_ENDS);
    const compares = events
      .filter((e) => e.type === 'compare')
      .map((e) => e.payload as { start: number; lastEnd: number; accepted: boolean });
    expect(compares).toEqual([
      { index: 0, start: 1, lastEnd: -1, accepted: true },
      { index: 1, start: 3, lastEnd: 4, accepted: false },
      { index: 2, start: 0, lastEnd: 4, accepted: false },
      { index: 3, start: 5, lastEnd: 4, accepted: true },
      { index: 4, start: 3, lastEnd: 7, accepted: false },
      { index: 5, start: 5, lastEnd: 7, accepted: false },
      { index: 6, start: 6, lastEnd: 7, accepted: false },
      { index: 7, start: 8, lastEnd: 7, accepted: true },
    ]);
  });

  it('[0,6] 은 가장 일찍 시작하는데도 안 고른다', async () => {
    const { events } = await record(SPEC_STARTS, SPEC_ENDS);
    const earliest = events
      .filter((e) => e.type === 'mark')
      .map((e) => e.payload as { kind: string; start: number; end: number })
      .find((p) => p.start === 0 && p.end === 6);
    expect(earliest?.kind).toBe('skipped');
  });

  it('섞어 넣어도 끝나는 시간 순으로 줄을 세우고 같은 답을 낸다', async () => {
    const shuffledStarts = [8, 3, 1, 5, 0, 6, 5, 3];
    const shuffledEnds = [11, 9, 4, 7, 6, 10, 9, 5];
    const { data, events, metrics } = await record(shuffledStarts, shuffledEnds);
    expect(data.ends).toEqual(SPEC_ENDS);
    expect(data.starts).toEqual(SPEC_STARTS);
    expect(metrics['pick-count']).toBe(3);
    const sorted = events.find((e) => e.type === 'sort-done');
    expect((sorted?.payload as { changed: boolean }).changed).toBe(true);
  });

  it('사양의 자료는 이미 순서라 정렬이 자리를 바꾸지 않는다', async () => {
    const { events } = await record(SPEC_STARTS, SPEC_ENDS);
    const sorted = events.find((e) => e.type === 'sort-done');
    expect(sorted?.payload).toEqual({ order: [0, 1, 2, 3, 4, 5, 6, 7], changed: false });
  });

  it('빈 자료 · 회의 하나', async () => {
    const empty = await record([], []);
    expect(empty.events.map((e) => e.type)).toEqual(['done']);
    expect(empty.events[0].payload).toEqual({ chosen: [], compares: 0, picks: 0, skips: 0 });

    const one = await record([2], [5]);
    expect(one.metrics['pick-count']).toBe(1);
    expect(one.metrics['skip-count']).toBeUndefined();
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const { events } = await record(SPEC_STARTS, SPEC_ENDS);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const { events } = await record(SPEC_STARTS, SPEC_ENDS);
    const emitted = new Set(
      events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(activitySelectionIR)].sort());
    expect([...emitted].sort()).toEqual(IR_PHASES);
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
      const res = transpiler.transpile(activitySelectionIR);
      expect(res.lines.length).toBeGreaterThan(9);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual(IR_PHASES);
    },
  );

  it('고르는 두 줄은 어느 언어에서도 이름 뒤로 숨지 않는다', () => {
    const codeOf = (t: (typeof ALL)[number]) =>
      t.transpile(activitySelectionIR).lines.map((l) => l.code).join('\n');
    for (const t of ALL) {
      const code = codeOf(t);
      // 판단과 갱신이 펼쳐져 있다.
      expect(code).toContain('start[i] >= last_end');
      expect(code).toContain('last_end = end[i]');
      // 이름 붙인 호출은 정렬 하나뿐이다.
      expect(code).toContain('sort_by_end(start, end)');
      expect(code).not.toContain('can_take(');
      expect(code).not.toContain('choose(');
    }
  });
});

describe('Projector 배선', () => {
  it('phase 를 코드 패널로 넘기고 고른 회의만 회의실에 놓는다', async () => {
    const { events } = await record(SPEC_STARTS, SPEC_ENDS);
    const phaseCalls: (string | null)[] = [];
    const room: number[] = [];
    const decisions: [number, string][] = [];
    const boundaries: number[] = [];

    const stage = {
      setData() {},
      applyOrder() {},
      setCaption() {},
      setBoundary(lastEnd: number) {
        boundaries.push(lastEnd);
      },
      setVisiting() {},
      setProbe() {},
      setDecision(index: number, state: string) {
        decisions.push([index, state]);
      },
      addToRoom(index: number) {
        room.push(index);
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

    const projector = greedyProjector({ stage, codePanel });
    projector.onInit?.(greedyFacet.initialData);
    for (const e of events) await projector.onEvent(e);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null)).size).toBe(7);
    expect(room).toEqual([0, 3, 7]);
    expect(decisions.filter(([, s]) => s === 'picked')).toHaveLength(3);
    expect(decisions.filter(([, s]) => s === 'skipped')).toHaveLength(5);
    // 회의실이 차는 시각이 -1 → 4 → 7 → 11 로 옮겨 간다.
    expect(boundaries).toEqual([-1, -1, 4, 7, 11]);
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

  it('stage 가 막대를 그리고 재생 내내 캔버스 세로가 변하지 않는다', async () => {
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
    registerGreedy();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(greedyFacet, host, { autoStart: false });
    handle.setSpeed(20);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    // 회의 8 × (막대 + 겹침 띠) + 기준 칩 + 회의실 바탕.
    expect(host.querySelectorAll('svg rect').length).toBeGreaterThanOrEqual(18);

    handle.start();
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline && new Set(seenPhases).size < 7) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(box);
    expect(new Set(seenPhases).size).toBe(7);

    handle.destroy();
    host.remove();
  }, 40_000);

  it('destroy 뒤 캔버스가 남지 않는다', () => {
    registerGreedy();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(greedyFacet, host, { autoStart: false });
    expect(host.querySelector('svg g')).not.toBeNull();
    handle.destroy();
    expect(host.querySelector('svg g')).toBeNull();
    host.remove();
  });
});
