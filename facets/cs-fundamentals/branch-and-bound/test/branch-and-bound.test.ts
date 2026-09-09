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
  branchAndBound,
  branchAndBoundFacet,
  branchAndBoundProjector,
  knapsackBoundIR,
  registerBranchAndBound,
  type BranchAndBoundData,
} from '../src/index.js';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

/** 사양의 자료 — 동적 계획법 완결형과 같은 물건 넷, 값/무게 순으로 정렬됨. */
const SPEC_VALUES = [50, 40, 30, 10];
const SPEC_WEIGHTS = [3, 4, 6, 5];
const SPEC_LABELS = [4, 2, 3, 1];
const SPEC_CAPACITY = 10;

const PHASES = [
  'all-used',
  'bound-fit',
  'bound-init',
  'bound-return',
  'bound-split',
  'branch-skip',
  'branch-take',
  'cut',
  'enter',
  'measure-bound',
  'new-best',
  'overflow',
  'return-best',
];

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(data?: Partial<BranchAndBoundData>): Promise<Recorded> {
  const full: BranchAndBoundData = {
    type: 'knapsack',
    values: [...SPEC_VALUES],
    weights: [...SPEC_WEIGHTS],
    capacity: SPEC_CAPACITY,
    labels: [...SPEC_LABELS],
    ...data,
  };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await branchAndBound({
    data: full,
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

type EnterPayload = {
  id: string;
  parentId: string | null;
  depth: number;
  taken: boolean | null;
  w: number;
  v: number;
};

describe('분기 한정 배낭', () => {
  it('사양의 대조와 같다 — 최적 90 · 방문 9 · 자름 2 · 무게 넘침 2', async () => {
    const { events, metrics } = await record();
    const done = payloadsOf<{ best: number; visits: number; cuts: number; overflows: number }>(
      events,
      'done',
    )[0];
    expect(done.best).toBe(90);
    expect(done.visits).toBe(9);
    expect(done.cuts).toBe(2);
    expect(done.overflows).toBe(2);
    expect(metrics['visit-count']).toBe(9);
    expect(metrics['cut-count']).toBe(2);
    expect(metrics['overflow-count']).toBe(2);
  });

  it('무게가 넘치는 갈래는 [3,4,6] 과 [3,4,5] 둘뿐이다', async () => {
    const { events } = await record();
    const enters = payloadsOf<EnterPayload>(events, 'branch-enter');
    const overflowed = payloadsOf<{ id: string; w: number }>(events, 'weight-overflow');
    expect(overflowed.map((p) => p.w)).toEqual([13, 12]);
    for (const p of overflowed) {
      const node = enters.find((e) => e.id === p.id);
      expect(node?.w).toBeGreaterThan(SPEC_CAPACITY);
    }
  });

  it('잘린 갈래 둘은 한계가 최고 90 에 못 미친다', async () => {
    const { events } = await record();
    const cuts = payloadsOf<{ bound: number; best: number }>(events, 'branch-cut');
    expect(cuts).toHaveLength(2);
    expect(cuts.map((c) => c.bound)).toEqual([82, 70]);
    for (const c of cuts) expect(c.bound).toBeLessThanOrEqual(c.best);
  });

  it('갈래 번호가 방문 순서이고 나무가 실제로 갈라진다', async () => {
    const { events } = await record();
    const enters = payloadsOf<EnterPayload>(events, 'branch-enter');
    expect(enters.map((e) => e.id)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8']);
    expect(enters.map((e) => e.depth)).toEqual([0, 1, 2, 3, 3, 4, 4, 2, 1]);
    expect(enters.map((e) => e.parentId)).toEqual([
      null,
      'n0',
      'n1',
      'n2',
      'n2',
      'n4',
      'n4',
      'n1',
      'n0',
    ]);
    // 뿌리만 taken 이 null 이고, 나머지는 담음/두름이 짝을 이룬다.
    expect(enters.map((e) => e.taken)).toEqual([
      null,
      true,
      true,
      true,
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it('한계는 쪼갠 몫을 실제로 더한다 — 정수 나눗셈이면 나올 수 없는 값이다', async () => {
    const { events } = await record();
    const fractions = payloadsOf<{ part: number; room: number; weight: number; value: number }>(
      events,
      'bound-fraction',
    );
    expect(fractions.length).toBeGreaterThan(0);
    for (const f of fractions) {
      expect(f.part).toBeCloseTo((f.value * f.room) / f.weight, 10);
    }
    // 남은 자리 3 에 무게 6 짜리를 쪼개 담으면 15 다. 정수 나눗셈이면 0 이 된다.
    expect(fractions.some((f) => f.room === 3 && f.weight === 6 && f.part === 15)).toBe(true);
  });

  it('한계는 언제나 그 갈래의 진짜 최선보다 낮지 않다', async () => {
    const { events } = await record();
    const bounds = payloadsOf<{ id: string; bound: number }>(events, 'bound-end');
    const enters = payloadsOf<EnterPayload>(events, 'branch-enter');
    for (const b of bounds) {
      const node = enters.find((e) => e.id === b.id);
      expect(node).toBeDefined();
      const truth = runIR(knapsackBoundIR, 'knapsack', [
        [...SPEC_VALUES],
        [...SPEC_WEIGHTS],
        SPEC_CAPACITY,
        node!.depth,
        node!.w,
        node!.v,
        0,
      ]) as number;
      expect(b.bound).toBeGreaterThanOrEqual(truth);
    }
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const { events } = await record();
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });

  it('물건이 없어도 답이 0 으로 나온다', async () => {
    const { events } = await record({ values: [], weights: [], labels: [] });
    const done = payloadsOf<{ best: number; visits: number }>(events, 'done')[0];
    expect(done.best).toBe(0);
    expect(done.visits).toBe(1);
  });
});

describe('IR 을 실제로 돌린다', () => {
  it('인터프리터가 사양의 답 90 을 돌려준다', () => {
    const best = runIR(knapsackBoundIR, 'knapsack', [
      [...SPEC_VALUES],
      [...SPEC_WEIGHTS],
      SPEC_CAPACITY,
      0,
      0,
      0,
      0,
    ]);
    expect(best).toBe(90);
  });

  it('한계 함수가 쪼개 담은 값을 돌려준다 (실수 나눗셈)', () => {
    const bound = (i: number, w: number, v: number): unknown =>
      runIR(knapsackBoundIR, 'bound', [
        [...SPEC_VALUES],
        [...SPEC_WEIGHTS],
        SPEC_CAPACITY,
        i,
        w,
        v,
      ]);
    // 50 + 40 + 30 * (3/6) = 105. 정수 나눗셈이면 90 이 되어 갈래를 잘못 자른다.
    expect(bound(0, 0, 0)).toBe(105);
    expect(bound(3, 7, 90)).toBe(96);
    expect(bound(2, 3, 50)).toBe(82);
    expect(bound(1, 0, 0)).toBe(70);
  });

  it('한도를 하나씩 늘려 가며 셈해도 답이 단조롭게 오른다', () => {
    const row: number[] = [];
    for (let cap = 0; cap <= SPEC_CAPACITY; cap++) {
      row.push(
        runIR(knapsackBoundIR, 'knapsack', [
          [...SPEC_VALUES],
          [...SPEC_WEIGHTS],
          cap,
          0,
          0,
          0,
          0,
        ]) as number,
      );
    }
    expect(row).toEqual([0, 0, 0, 50, 50, 50, 50, 90, 90, 90, 90]);
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const { events } = await record();
    const emitted = new Set(
      events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(knapsackBoundIR)].sort());
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
    '%s — 줄이 나오고 undefined 가 섞이지 않으며 phase 열셋이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(knapsackBoundIR);
      expect(res.lines.length).toBeGreaterThan(20);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual(PHASES);

      const all = res.lines.map((l) => l.code).join('\n');
      // 한계를 재는 루프가 펼쳐져 있다 — 감싸면 이 알고리즘의 절반이 사라진다.
      expect(all).toContain('(values[k] * room) / weights[k]');
      // 쪼개는 자리는 실수 나눗셈이다. 정수 나눗셈 표기가 새어 나오면 안 된다.
      expect(all).not.toContain('//');
      expect(all).not.toContain('Math.floor');
      // 두 갈래가 코드에 그대로 있다.
      expect(all).toContain('w + weights[i]');
      expect(all).toContain('v + values[i]');
    },
  );

  it('정적 언어 넷이 한계를 실수 타입으로 낸다', () => {
    const of = (t: (typeof ALL)[number]): string =>
      t
        .transpile(knapsackBoundIR)
        .lines.map((l) => l.code)
        .join('\n');
    expect(of(javaTranspiler)).toContain('double room');
    expect(of(javaTranspiler)).toContain('static double bound');
    expect(of(csharpTranspiler)).toContain('double room');
    expect(of(cppTranspiler)).toContain('double room');
    // 동적 언어 둘과 TS 는 수 타입이 하나뿐이라 `/` 가 이미 실수 나눗셈이다.
    expect(of(typescriptTranspiler)).toContain('function bound(');
    expect(of(typescriptTranspiler)).toContain('): number {');
    expect(of(pythonTranspiler)).toContain('room = cap - w');
  });
});

describe('Projector 배선', () => {
  it('phase 를 코드 패널로 넘기고 갈래를 stage 에 옮긴다', async () => {
    const { events } = await record();
    const phaseCalls: (string | null)[] = [];
    const added: string[] = [];
    const states: Record<string, string> = {};
    let bestSeen: number | null = null;

    const stage = {
      setItems() {},
      setCaption() {},
      setFocusItem() {},
      setBest(value: number) {
        bestSeen = value;
      },
      addNode(node: { id: string }) {
        added.push(node.id);
      },
      setNodeState(id: string, state: string) {
        states[id] = state;
      },
      beginBound() {},
      addBoundPart() {},
      endBound() {},
      setVerdict() {},
      clearBound() {},
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

    const projector = branchAndBoundProjector({ stage, codePanel });
    projector.onInit?.(branchAndBoundFacet.initialData);
    for (const e of events) await projector.onEvent(e);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null)).size).toBe(PHASES.length);
    expect(added).toHaveLength(9);
    expect(bestSeen).toBe(90);
    expect(Object.values(states).filter((s) => s === 'overflow')).toHaveLength(2);
    expect(Object.values(states).filter((s) => s === 'cut')).toHaveLength(2);
    expect(phaseCalls[phaseCalls.length - 1]).toBeNull();
  });
});

describe('마운트와 재생', () => {
  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
  });

  it('stage 가 그려지고 재생 내내 캔버스 세로가 변하지 않는다', async () => {
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
    registerBranchAndBound();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(branchAndBoundFacet, host, { autoStart: false });
    handle.setSpeed(60);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    // 물건 넷 + 한도 판 + 최고 판 + 한계 자 = 7. 갈래는 아직 하나도 없다.
    expect(host.querySelectorAll('svg rect').length).toBe(7);

    handle.start();
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline && new Set(seenPhases).size < PHASES.length) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(box);
    expect([...new Set(seenPhases)].sort()).toEqual(PHASES);

    // 화면의 수는 알고리즘이 셈한 것이다 — 최고 90 이 판에 떠 있다.
    const texts = [...host.querySelectorAll('svg text')].map((t) => t.textContent ?? '');
    expect(texts).toContain('90');

    handle.destroy();
    host.remove();
  }, 40_000);
});
