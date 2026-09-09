// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { FacetRuntimeEvent, IR, IRStmt } from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  makeTranslator,
  mountView,
  registerBuiltinViews,
  runFacet,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import {
  computeTopologicalSortResult,
  registerTopologicalSort,
  topologicalKahnIR,
  topologicalSort,
  topologicalSortFacet,
  topologicalSortProjector,
  topologicalSortStageView,
  type TopologicalSortData,
} from '../src/index.js';

/** 사양이 정한 자료. 대조: 처음 자유로운 것은 0 과 1, 차례는 0 · 1 · 2 · 3 · 4 · 5. */
const SPEC: TopologicalSortData = {
  type: 'digraph',
  vertexCount: 6,
  edges: [
    { from: 0, to: 2 },
    { from: 0, to: 3 },
    { from: 1, to: 3 },
    { from: 1, to: 4 },
    { from: 2, to: 5 },
    { from: 3, to: 5 },
    { from: 4, to: 5 },
  ],
};
const SPEC_ORDER = [0, 1, 2, 3, 4, 5];

/** 고리가 있는 그래프 — 아무도 0 이 되지 않는다. */
const CYCLE: TopologicalSortData = {
  type: 'digraph',
  vertexCount: 3,
  edges: [
    { from: 0, to: 1 },
    { from: 1, to: 2 },
    { from: 2, to: 0 },
  ],
};

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(data: TopologicalSortData): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await topologicalSort({
    data: { ...data, edges: data.edges.map((e) => ({ ...e })) },
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

function emittedPhases(events: FacetRuntimeEvent[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (e.type !== 'phase') continue;
    const p = e.payload as { phase?: unknown };
    if (typeof p?.phase === 'string') out.add(p.phase);
  }
  return out;
}

function irPhases(ir: IR): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
      if (s.kind === 'if') {
        walk(s.then);
        if (s.else) walk(s.else);
      }
      if (s.kind === 'for-range' || s.kind === 'while') walk(s.body);
    }
  };
  for (const f of ir.functions) walk(f.body);
  return out;
}

/** IR 의 매개변수 규약 — 세 벌의 작업 배열은 길이 n 의 0 배열로 들어온다. */
function runKahn(data: TopologicalSortData): { taken: unknown; order: number[] } {
  const adj: number[][] = Array.from({ length: data.vertexCount }, () => []);
  for (const e of data.edges) adj[e.from].push(e.to);
  for (const row of adj) row.sort((a, b) => a - b);
  const indeg = new Array<number>(data.vertexCount).fill(0);
  const queue = new Array<number>(data.vertexCount).fill(0);
  const order = new Array<number>(data.vertexCount).fill(-1);
  const taken = runIR(topologicalKahnIR, 'kahn', [adj, indeg, queue, order]);
  return { taken, order };
}

const TRANSPILERS = [
  pythonTranspiler,
  javascriptTranspiler,
  typescriptTranspiler,
  javaTranspiler,
  cppTranspiler,
  csharpTranspiler,
];

describe('위상 정렬 — 순수 셈', () => {
  it('사양의 그래프에서 차례는 0 · 1 · 2 · 3 · 4 · 5', () => {
    const r = computeTopologicalSortResult(SPEC);
    expect(r.order).toEqual(SPEC_ORDER);
    expect(r.cyclic).toBe(false);
  });

  it('고리가 있으면 아무것도 못 꺼낸다', () => {
    const r = computeTopologicalSortResult(CYCLE);
    expect(r.order).toEqual([]);
    expect(r.cyclic).toBe(true);
  });
});

describe('위상 정렬 — 재생', () => {
  it('차례로 붙는 것이 셈한 결과와 같다', async () => {
    const { events } = await record(SPEC);
    const appended = payloadsOf<{ vertex: number; slot: number }>(events, 'append');
    expect(appended.map((p) => p.vertex)).toEqual(SPEC_ORDER);
    // 자리 번호는 0 부터 하나씩 — head 가 곧 자리다.
    expect(appended.map((p) => p.slot)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('처음 줄에 떨어지는 것은 0 과 1 뿐이다', async () => {
    const { events } = await record(SPEC);
    const seedPhaseEnd = events.findIndex(
      (e) => e.type === 'dequeue',
    );
    const seeded = payloadsOf<{ vertex: number }>(events.slice(0, seedPhaseEnd), 'enqueue');
    expect(seeded.map((p) => p.vertex)).toEqual([0, 1]);
  });

  it('메트릭은 화면에 뜨는 수 그대로다', async () => {
    const { metrics } = await record(SPEC);
    // 정점 여섯을 모두 꺼냈고, 여섯이 모두 줄을 거쳤고, 화살 일곱을 한 번씩 지웠다.
    expect(metrics['pop-count']).toBe(6);
    expect(metrics['enqueue-count']).toBe(6);
    expect(metrics['decrement-count']).toBe(SPEC.edges.length);
  });

  it('done 이 꺼낸 수와 정점 수를 함께 보고한다', async () => {
    const { events } = await record(SPEC);
    const done = payloadsOf<{ taken: number; total: number; cyclic: boolean; order: number[] }>(
      events,
      'done',
    );
    expect(done).toHaveLength(1);
    expect(done[0]).toEqual({ taken: 6, total: 6, cyclic: false, order: SPEC_ORDER });
  });

  it('고리가 있으면 done 이 그것을 말한다', async () => {
    const { events, metrics } = await record(CYCLE);
    const done = payloadsOf<{ taken: number; total: number; cyclic: boolean }>(events, 'done');
    expect(done[0].taken).toBe(0);
    expect(done[0].total).toBe(3);
    expect(done[0].cyclic).toBe(true);
    expect(metrics['pop-count']).toBeUndefined();
  });
});

describe('위상 정렬 — IR', () => {
  it('인터프리터가 돌린 답이 사양의 대조와 같다', () => {
    const { taken, order } = runKahn(SPEC);
    expect(taken).toBe(6);
    expect(order).toEqual(SPEC_ORDER);
  });

  it('고리가 있으면 -1 을 돌려준다', () => {
    const { taken } = runKahn(CYCLE);
    expect(taken).toBe(-1);
  });

  it('phase 집합이 algorithm 과 글자까지 같다 (C3)', async () => {
    const { events } = await record(SPEC);
    const fromAlgorithm = emittedPhases(events);
    const fromIR = irPhases(topologicalKahnIR);
    expect([...fromIR].sort()).toEqual([...fromAlgorithm].sort());
    // 개수만 세면 한쪽에서 이름이 바뀌고 다른 쪽에서도 같이 바뀔 때 통과한다.
    // 어휘를 그대로 적어 두어야 그 짝 변경이 걸린다 (C3).
    expect([...fromIR].sort()).toEqual([
      'count-indegree',
      'cycle-check',
      'done',
      'emit-order',
      'enqueue',
      'pop',
      'relax',
      'seed-queue',
      'zero-reached',
    ]);
  });

  it('여섯 언어가 모두 성한 코드를 낸다', () => {
    for (const t of TRANSPILERS) {
      const lines = t.transpile(topologicalKahnIR).lines;
      const src = lines.map((l) => l.code).join('\n');
      expect(src, t.id).not.toContain('undefined');
      expect(lines.length, t.id).toBeGreaterThan(20);
      // 큐를 이름 붙인 호출로 감추지 않았다 — 배열과 색인 둘이 그대로 보인다.
      expect(src, t.id).not.toMatch(/queue_(push|pop)|zeros\(/);
      expect(src, t.id).toContain('queue[tail]');
      expect(src, t.id).toContain('queue[head]');
      // 고리 판정이 코드에 있다.
      expect(src, t.id).toContain('-1');
    }
  });

  it('언어별 코드 줄에 붙는 phase 가 IR 의 phase 를 다 덮는다', () => {
    const want = irPhases(topologicalKahnIR);
    for (const t of TRANSPILERS) {
      const got = new Set<string>();
      for (const l of t.transpile(topologicalKahnIR).lines) {
        if (l.phase) got.add(l.phase);
      }
      expect([...got].sort(), t.id).toEqual([...want].sort());
    }
  });

  it('전사는 IR 을 건드리지 않는다 (S-transpiler)', () => {
    const before = JSON.stringify(topologicalKahnIR);
    for (const t of TRANSPILERS) t.transpile(topologicalKahnIR);
    expect(JSON.stringify(topologicalKahnIR)).toBe(before);
  });
});

describe('위상 정렬 — 화면', () => {
  let host: HTMLElement;

  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
    registerTopologicalSort();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('마운트하면 캔버스가 붙고 세로가 바뀌지 않는다', () => {
    const handle = runFacet(topologicalSortFacet, host, { locale: 'ko' });
    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    expect(box).toBe('0 0 700 490');
    handle.destroy();
    expect(host.querySelector('svg')).toBeNull();
  });

  it('끝까지 재생하면 화면의 수가 알고리즘이 셈한 값과 같다', async () => {
    const tr = makeTranslator('en', topologicalSortFacet.messages);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(topologicalSortStageView, container, {
      config: { type: 'topological-sort-stage' },
      initialData: SPEC as unknown as Record<string, unknown>,
      locale: 'en',
      t: tr,
    });
    const projector = topologicalSortProjector(
      { stage },
      { getSpeed: () => 1, t: tr },
    );
    projector.onInit?.(SPEC);

    const svg = container.querySelector('svg');
    const boxBefore = svg?.getAttribute('viewBox');

    const { events } = await record(SPEC);
    for (const e of events) projector.onEvent(e);

    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent ?? '');
    // 꺼낸 것과 정점 수의 대조 — 고리 판정이 화면에 남는 자리.
    expect(texts).toContain('out 6 / 6');
    expect(texts).toContain('All 6 came out. The order is 0 · 1 · 2 · 3 · 4 · 5.');
    // 줄의 머리와 꼬리는 여섯을 다 지나 끝에 서 있다.
    expect(texts).toContain('head 6');
    expect(texts).toContain('tail 6');
    // 정점마다 남은 화살은 0.
    expect(texts.filter((t) => t === '0').length).toBeGreaterThanOrEqual(6);
    // 마운트 뒤 세로는 그대로다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(boxBefore);

    stage.destroy();
    expect(container.querySelector('g')).toBeNull();
    container.remove();
  });
});
