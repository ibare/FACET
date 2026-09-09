// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { FacetRuntimeEvent, IR, IRStmt } from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  mountView,
  registerBuiltinViews,
  registerView,
  runFacet,
} from '@ffacet/core/runtime';
import { runIR, type Value } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import {
  primGrowIR,
  primMst,
  primMstDescription,
  primMstFacet,
  primMstProjector,
  primMstStageView,
  registerPrimMst,
  type PrimMstData,
} from '../src/index.js';

/** 사양의 자료. facet.ts 의 initialData 와 같은 것을 여기서 따로 적는다. */
const SPEC: PrimMstData = {
  type: 'weighted-graph',
  vertexCount: 7,
  start: 0,
  edges: [
    { a: 0, b: 1, w: 7 },
    { a: 0, b: 3, w: 5 },
    { a: 1, b: 2, w: 8 },
    { a: 1, b: 3, w: 9 },
    { a: 1, b: 4, w: 7 },
    { a: 2, b: 4, w: 5 },
    { a: 3, b: 4, w: 15 },
    { a: 3, b: 5, w: 6 },
    { a: 4, b: 5, w: 8 },
    { a: 4, b: 6, w: 9 },
    { a: 5, b: 6, w: 11 },
  ],
};

/** 사양의 대조. 붙는 차례와 그때의 무게. 출발점은 간선이 없으므로 빠진다. */
const SPEC_ORDER = [
  { from: 0, to: 3, weight: 5 },
  { from: 3, to: 5, weight: 6 },
  { from: 0, to: 1, weight: 7 },
  { from: 1, to: 4, weight: 7 },
  { from: 4, to: 2, weight: 5 },
  { from: 4, to: 6, weight: 9 },
];
const SPEC_TOTAL = 39;

const PHASES = ['attach', 'done', 'offer', 'scan', 'setup'];

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(data: PrimMstData): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await primMst({
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

/**
 * IR 을 표준 `runIR` 로 돌린다. 인터프리터를 손보지 않는다 — IR 에 이름 붙인
 * 호출이 하나도 없으므로 보태 줄 것이 없고, 그것이 여섯 언어에서 정의 없는
 * 이름이 나오지 않는다는 뜻이기도 하다.
 */
function runPrim(data: PrimMstData, start: number): { total: unknown; parent: number[]; key: number[] } {
  const n = data.vertexCount;
  const key = new Array<number>(n).fill(0);
  const parent = new Array<number>(n).fill(0);
  const inTree = new Array<number>(n).fill(0);
  const total = runIR(primGrowIR, 'prim', [
    adjacencyMatrix(data) as unknown as Value,
    start,
    key as unknown as Value,
    parent as unknown as Value,
    inTree as unknown as Value,
  ]);
  return { total, parent, key };
}

function adjacencyMatrix(data: PrimMstData): number[][] {
  const w = Array.from({ length: data.vertexCount }, () =>
    new Array<number>(data.vertexCount).fill(0),
  );
  for (const e of data.edges) {
    w[e.a]![e.b] = e.w;
    w[e.b]![e.a] = e.w;
  }
  return w;
}

describe('프림 — 나무 하나를 키운다', () => {
  it('붙는 차례와 무게가 사양의 대조와 같다', async () => {
    const { events } = await record(SPEC);
    const attached = payloadsOf<{ vertex: number; from: number | null; weight: number }>(
      events,
      'attach',
    );
    // 첫 회는 출발점이라 간선이 없다.
    expect(attached[0]).toEqual({
      vertex: 0,
      from: null,
      weight: 0,
      total: 0,
      treeSize: 1,
    });
    const edges = attached
      .filter((a) => a.from !== null)
      .map((a) => ({ from: a.from!, to: a.vertex, weight: a.weight }));
    expect(edges).toEqual(SPEC_ORDER);
    expect(edges.reduce((s, e) => s + e.weight, 0)).toBe(SPEC_TOTAL);
  });

  it('무게 5 인 2-4 는 나무가 4 에 닿은 뒤에야 붙는다', async () => {
    const { events } = await record(SPEC);
    const attached = payloadsOf<{ vertex: number; from: number | null }>(events, 'attach');
    const joinIndex = (v: number): number => attached.findIndex((a) => a.vertex === v);
    // 그림 전체의 최소 무게(5)를 가진 간선인데도 여섯 번째다 — 경계의 최소이지
    // 전체의 최소를 고르는 것이 아니라는 증거.
    expect(joinIndex(2)).toBe(5);
    expect(joinIndex(4)).toBeLessThan(joinIndex(2));
  });

  it('done 이 알리는 값이 붙인 간선과 맞아떨어진다', async () => {
    const { events } = await record(SPEC);
    const done = payloadsOf<{ edgeCount: number; total: number }>(events, 'done')[0];
    expect(done).toEqual({ edgeCount: SPEC.vertexCount - 1, total: SPEC_TOTAL });
  });

  it('메트릭은 훑기 49 · 가벼워진 값 10 · 붙인 간선 6', async () => {
    const { events, metrics } = await record(SPEC);
    // 회는 정점 수만큼이고 회마다 배열 전체를 훑는다.
    expect(metrics['scan-count']).toBe(SPEC.vertexCount * SPEC.vertexCount);
    expect(metrics['attach-count']).toBe(SPEC.vertexCount - 1);
    expect(metrics['improve-count']).toBe(10);
    // 메트릭 이름은 facet.ts 에 선언된 것만 쓴다 (C5).
    const declared = new Set(
      (primMstFacet.blocks.controls as { metrics: { name: string }[] }).metrics.map((m) => m.name),
    );
    for (const name of Object.keys(metrics)) expect(declared.has(name)).toBe(true);
    // 발신된 이벤트 수와 메트릭이 갈리지 않는지.
    expect(payloadsOf(events, 'scan')).toHaveLength(metrics['scan-count']!);
    expect(
      payloadsOf<{ improved: boolean }>(events, 'offer').filter((o) => o.improved),
    ).toHaveLength(metrics['improve-count']!);
  });

  it('내민 간선은 간선 열하나를 양쪽에서 한 번씩 본 스물둘이다', async () => {
    const { events } = await record(SPEC);
    const offers = payloadsOf<{ from: number; to: number; weight: number }>(events, 'offer');
    expect(offers).toHaveLength(SPEC.edges.length * 2);
    // 화면에 뜨는 무게가 자료의 무게와 같은가 (지어낸 값이 아닌가).
    const weightOf = new Map(SPEC.edges.map((e) => [`${e.a}-${e.b}`, e.w]));
    for (const o of offers) {
      const key = o.from < o.to ? `${o.from}-${o.to}` : `${o.to}-${o.from}`;
      expect(o.weight).toBe(weightOf.get(key));
    }
  });

  it('나무가 자라는 차례는 0 · 3 · 5 · 1 · 4 · 2 · 6 이다', async () => {
    const { events } = await record(SPEC);
    const attached = payloadsOf<{ vertex: number; weight: number }>(events, 'attach');
    const seq = attached.map((a) => a.vertex);
    expect(seq).toEqual([0, 3, 5, 1, 4, 2, 6]);
    // 무게 7 인 간선 둘이 연달아 붙는다. 다만 둘은 같은 회에서 겨루지 않았다 —
    // 1 이 붙는 회에 4 의 key 는 아직 8 이었고, 그 다음 회에 7 로 줄어 붙는다.
    expect(attached[3]!.weight).toBe(7);
    expect(attached[4]!.weight).toBe(7);
  });

  it('이 자료에서는 동점이 한 번도 겨루지 않는다', async () => {
    const { events } = await record(SPEC);
    // 훑는 동안 후보 둘이 같은 key 로 맞선 적이 있는가. 없다면 동점 규칙은 이
    // 자료에서 답을 바꾸지 않으며, 최소 신장 트리도 하나뿐이다.
    const scans = payloadsOf<{
      key: number | null;
      bestKey: number | null;
      inTree: boolean;
      became: boolean;
    }>(events, 'scan');
    const ties = scans.filter(
      (s) => !s.inTree && !s.became && s.key !== null && s.key === s.bestKey,
    );
    expect(ties).toHaveLength(0);
  });

  it('동점이 실제로 겨루면 번호가 작은 정점이 이긴다', async () => {
    // 사양의 자료로는 동점 규칙을 잴 수 없으므로 겨루는 판을 따로 만든다.
    // 0 에서 1 과 2 로 나가는 간선이 둘 다 4 다.
    const tie: PrimMstData = {
      type: 'weighted-graph',
      vertexCount: 3,
      start: 0,
      edges: [
        { a: 0, b: 1, w: 4 },
        { a: 0, b: 2, w: 4 },
        { a: 1, b: 2, w: 9 },
      ],
    };
    const { events } = await record(tie);
    const seq = payloadsOf<{ vertex: number }>(events, 'attach').map((a) => a.vertex);
    expect(seq).toEqual([0, 1, 2]);
    // IR 도 같은 부등호를 쓰므로 무게 합이 같고, 같은 나무를 만든다.
    const ran = runPrim(tie, 0);
    expect(ran.total).toBe(8);
    expect(ran.parent).toEqual([-1, 0, 0]);
  });

  it('phase 이벤트는 모두 silent 이고 IR 과 어휘가 같다', async () => {
    const { events } = await record(SPEC);
    const phaseEvents = events.filter((e) => e.type === 'phase');
    expect(phaseEvents.length).toBeGreaterThan(0);
    expect(phaseEvents.every((e) => e.silent === true)).toBe(true);
    const fromAlgorithm = new Set(
      phaseEvents.map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...fromAlgorithm].sort()).toEqual(PHASES);
    expect([...irPhases(primGrowIR)].sort()).toEqual(PHASES);
  });

  it('설명이 말하는 대로 다익스트라의 나무와 다르다', async () => {
    // description.ts 가 "최단 경로 나무는 44, 최소 신장 트리는 39" 라고 적었다.
    // 그 수가 지어낸 것이 아닌지 여기서 잰다 — 다익스트라를 이 자리에서 손으로
    // 돌려 본다 (다른 facet 패키지를 참조하지 않는다, S-facet).
    const n = SPEC.vertexCount;
    const w = adjacencyMatrix(SPEC);
    const dist = new Array<number>(n).fill(Number.POSITIVE_INFINITY);
    const parent = new Array<number>(n).fill(-1);
    const settled = new Array<boolean>(n).fill(false);
    dist[SPEC.start] = 0;
    for (let round = 0; round < n; round += 1) {
      let u = -1;
      for (let v = 0; v < n; v += 1) {
        if (!settled[v] && (u < 0 || dist[v]! < dist[u]!)) u = v;
      }
      settled[u] = true;
      for (let v = 0; v < n; v += 1) {
        if (w[u]![v]! <= 0) continue;
        if (dist[u]! + w[u]![v]! < dist[v]!) {
          dist[v] = dist[u]! + w[u]![v]!;
          parent[v] = u;
        }
      }
    }
    const spt = parent
      .map((p, v) => (p < 0 ? null : { from: p, to: v }))
      .filter((e): e is { from: number; to: number } => e !== null);
    const sptWeight = spt.reduce((sum, e) => sum + w[e.from]![e.to]!, 0);
    expect(sptWeight).toBe(44);
    expect(sptWeight).toBeGreaterThan(SPEC_TOTAL);

    const asKey = (e: { from: number; to: number }): string =>
      e.from < e.to ? `${e.from}-${e.to}` : `${e.to}-${e.from}`;
    const sptSet = new Set(spt.map(asKey));
    const mstSet = new Set(SPEC_ORDER.map(asKey));
    expect([...sptSet].sort()).toEqual(['0-1', '0-3', '1-2', '1-4', '3-5', '5-6']);
    expect([...mstSet].sort()).toEqual(['0-1', '0-3', '1-4', '2-4', '3-5', '4-6']);
    // 겹치지 않는 간선이 양쪽에 둘씩 있다.
    expect([...mstSet].filter((k) => !sptSet.has(k))).toHaveLength(2);
    expect(dist[6]).toBe(22);
  });

  it('정점이 없어도 터지지 않는다', async () => {
    const { events } = await record({
      type: 'weighted-graph',
      vertexCount: 0,
      start: 0,
      edges: [],
    });
    expect(payloadsOf(events, 'done')[0]).toEqual({ edgeCount: 0, total: 0 });
  });
});

describe('IR — 하나가 여섯 언어로 갈린다', () => {
  it('표준 runIR 이 낸 무게 합이 39 이고 나무도 같다', () => {
    const { total, parent, key } = runPrim(SPEC, SPEC.start);
    expect(total).toBe(SPEC_TOTAL);
    // IR 이 남긴 parent 가 곧 최소 신장 트리다 — 알고리즘이 붙인 간선과 같은가.
    const fromIR = parent
      .map((from, to) => (from < 0 ? null : { from, to }))
      .filter((e): e is { from: number; to: number } => e !== null)
      .map((e) => (e.from < e.to ? `${e.from}-${e.to}` : `${e.to}-${e.from}`))
      .sort();
    const fromAlgorithm = SPEC_ORDER.map((e) =>
      e.from < e.to ? `${e.from}-${e.to}` : `${e.to}-${e.from}`,
    ).sort();
    expect(fromIR).toEqual(fromAlgorithm);
    // 화면의 key 줄에 뜨는 마지막 값과도 같아야 한다.
    expect(key).toEqual([0, 7, 5, 5, 7, 6, 9]);
  });

  it('출발점을 바꿔도 최소 신장 트리의 무게는 그대로다', () => {
    const w = adjacencyMatrix(SPEC);
    for (let start = 0; start < SPEC.vertexCount; start += 1) {
      expect(runPrim(SPEC, start).total).toBe(SPEC_TOTAL);
    }
    // 행렬이 대칭인지도 여기서 확인한다 — 무방향 그래프의 전제.
    for (let a = 0; a < SPEC.vertexCount; a += 1) {
      for (let b = 0; b < SPEC.vertexCount; b += 1) expect(w[a]![b]).toBe(w[b]![a]);
    }
  });

  it('여섯 언어가 모두 온전한 줄을 낸다', () => {
    const transpilers = [
      pythonTranspiler,
      javascriptTranspiler,
      typescriptTranspiler,
      javaTranspiler,
      cppTranspiler,
      csharpTranspiler,
    ];
    const phases = irPhases(primGrowIR);
    for (const t of transpilers) {
      const { lines } = t.transpile(primGrowIR);
      expect(lines.length).toBeGreaterThan(20);
      const source = lines.map((l) => l.code).join('\n');
      expect(source).not.toContain('undefined');
      expect(source).not.toContain('NaN');
      // 알고리즘의 핵심 한 줄이 여섯 언어에 모두 있어야 한다.
      expect(source).toContain('key[v]');
      expect(source).toContain('w[u][v]');
      // 우선순위 큐로 도망가지 않았다는 증거 — 훑는 반복문이 그대로 있다.
      expect(source.includes('for v in range(n)') || source.includes('v < n')).toBe(true);
      // 정의 없는 이름이 하나도 없어야 한다. transpiler 는 call 을 그대로 내므로
      // IR 이 부르는 이름은 그 언어에 없는 함수가 된다 — 그래서 배열을 인자로 민다.
      const called = new Set(
        [...source.matchAll(/(?<![.\w])([A-Za-z_][A-Za-z_0-9]*)\s*\(/g)].map((m) => m[1]!),
      );
      // 언어 문법 키워드와 각 언어의 내장 표현만 남아야 한다.
      // 파이썬의 `and (` / `or (` 처럼 뒤에 괄호가 오는 연산자 낱말도 걸러 낸다.
      for (const name of ['if', 'for', 'while', 'range', 'len', 'and', 'or', 'not']) {
        called.delete(name);
      }
      expect([...called]).toEqual(['prim']);
      expect(source).not.toContain('zeros');
      for (const line of lines) {
        if (line.phase === null) continue;
        expect(phases.has(line.phase)).toBe(true);
      }
      // phase 다섯이 모두 어느 줄엔가 붙어 있어야 코드 패널이 다 짚는다.
      const onLines = new Set(lines.map((l) => l.phase).filter((p): p is string => p !== null));
      expect([...onLines].sort()).toEqual(PHASES);
    }
  });

  it('IR 에 이름 붙인 호출이 하나도 없다', () => {
    // transpiler 여섯은 call 을 `fn(args)` 로 그대로 낸다. IR 이 부르는 이름은
    // 그 언어에 정의가 없으므로, 호출이 0 이어야 여섯 코드가 모두 돈다.
    const names = new Set<string>();
    const walkExpr = (e: unknown): void => {
      if (!e || typeof e !== 'object') return;
      const node = e as { kind?: string; fn?: string; [k: string]: unknown };
      if (node.kind === 'call' && typeof node.fn === 'string') names.add(node.fn);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(walkExpr);
        else if (value && typeof value === 'object') walkExpr(value);
      }
    };
    for (const f of primGrowIR.functions) f.body.forEach(walkExpr);
    expect([...names]).toEqual([]);
    // 작업 배열은 인자로 온다. 데이터가 먼저다.
    expect(primGrowIR.functions[0]!.params.map((p) => p.name)).toEqual([
      'w',
      'start',
      'key',
      'parent',
      'inTree',
    ]);
  });
});

describe('무대 — 화면에 뜨는 수는 알고리즘이 셈한 값이다', () => {
  let host: HTMLElement;

  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  async function feed(): Promise<SVGSVGElement> {
    registerView('prim-mst-stage', primMstStageView);
    const stage = mountView(primMstStageView, host, {
      config: { type: 'prim-mst-stage' },
      initialData: primMstFacet.initialData as unknown as Record<string, unknown>,
    });
    const projector = primMstProjector({ stage });
    projector.onInit?.(primMstFacet.initialData);
    const { events } = await record(SPEC);
    for (const e of events) await projector.onEvent(e);
    return host.querySelector('svg')!;
  }

  it('마지막 화면의 무게 합과 붙은 차례가 대조와 같다', async () => {
    const svg = await feed();
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent ?? '');
    expect(texts).toContain(String(SPEC_TOTAL));
    // 붙은 차례 칩 여섯. 무게도 함께 떠 있어야 한다.
    for (const e of SPEC_ORDER) {
      expect(texts).toContain(`${e.from}–${e.to}`);
    }
    expect(texts.filter((t) => /^\d+–\d+$/.test(t))).toHaveLength(SPEC_ORDER.length);
  });

  it('끝난 뒤 key 줄에 ∞ 가 하나도 남지 않는다', async () => {
    const svg = await feed();
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent ?? '');
    expect(texts).not.toContain('∞');
  });

  it('첫 화면에서는 출발점만 0 이고 나머지는 ∞ 다', () => {
    const stage = mountView(primMstStageView, host, {
      config: { type: 'prim-mst-stage' },
      initialData: primMstFacet.initialData as unknown as Record<string, unknown>,
    });
    const projector = primMstProjector({ stage });
    projector.onInit?.(primMstFacet.initialData);
    const svg = host.querySelector('svg')!;
    const texts = [...svg.querySelectorAll('text')].map((t) => t.textContent ?? '');
    expect(texts.filter((t) => t === '∞')).toHaveLength(SPEC.vertexCount - 1);
    // 무게 합은 아직 0.
    expect(texts).toContain('0');
  });
});

describe('러너에 붙였을 때', () => {
  let host: HTMLElement;
  let errors: unknown[][];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
    registerPrimMst();
    host = document.createElement('div');
    document.body.appendChild(host);
    errors = [];
    spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
  });

  afterEach(() => {
    spy.mockRestore();
    host.remove();
  });

  it('캔버스가 붙고 viewBox 가 마운트 뒤 바뀌지 않는다', () => {
    const handle = runFacet(primMstFacet, host, { autoStart: false });
    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const before = svg!.getAttribute('viewBox');
    expect(before).toBe('0 0 660 392');
    handle.step();
    expect(svg!.getAttribute('viewBox')).toBe(before);
    expect(errors).toHaveLength(0);
    handle.destroy();
  });

  it('무대의 destroy 가 제가 붙인 것만 거둔다', async () => {
    // 러너의 destroy 는 마운트 지점을 통째로 비우므로 무대가 제 몫을 했는지
    // 알 수 없다. 무대를 직접 띄워 그림을 다 그린 뒤 거둬 본다.
    const stage = mountView(primMstStageView, host, {
      config: { type: 'prim-mst-stage' },
      initialData: primMstFacet.initialData as unknown as Record<string, unknown>,
    });
    const projector = primMstProjector({ stage });
    projector.onInit?.(primMstFacet.initialData);
    const { events } = await record(SPEC);
    for (const e of events) await projector.onEvent(e);
    const svg = host.querySelector('svg')!;
    expect(svg.querySelectorAll('*').length).toBeGreaterThan(50);
    stage.destroy();
    expect(document.body.contains(svg)).toBe(true);
    expect(svg.childElementCount).toBe(0);
    expect(errors).toHaveLength(0);
  });

  it('되감으면 첫 화면으로 돌아간다', async () => {
    const stage = mountView(primMstStageView, host, {
      config: { type: 'prim-mst-stage' },
      initialData: primMstFacet.initialData as unknown as Record<string, unknown>,
    });
    const projector = primMstProjector({ stage });
    projector.onInit?.(primMstFacet.initialData);
    const { events } = await record(SPEC);
    for (const e of events) await projector.onEvent(e);
    const svg = host.querySelector('svg')!;
    expect([...svg.querySelectorAll('text')].map((t) => t.textContent)).toContain('39');

    projector.onReset?.();
    const after = [...svg.querySelectorAll('text')].map((t) => t.textContent ?? '');
    expect(after.filter((t) => t === '∞')).toHaveLength(SPEC.vertexCount - 1);
    expect(after.filter((t) => /^\d+–\d+$/.test(t))).toHaveLength(0);
    expect(after).not.toContain('39');
    expect(errors).toHaveLength(0);
  });
});

describe('선언 — facet.ts 가 규범대로 적혀 있다', () => {
  const LOCALES = ['en', 'ko', 'ar', 'es', 'fr', 'hi', 'id', 'pt'];

  /** `en` 을 가진 객체를 LocaleStr 로 보고 전부 모은다. */
  function localeStrings(value: unknown, path: string, out: [string, string[]][]): void {
    if (Array.isArray(value)) {
      value.forEach((v, i) => localeStrings(v, `${path}[${i}]`, out));
      return;
    }
    if (!value || typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    if (typeof obj['en'] === 'string') {
      out.push([path, Object.keys(obj)]);
      return;
    }
    for (const [k, v] of Object.entries(obj)) localeStrings(v, `${path}.${k}`, out);
  }

  it('사람이 읽는 문자열은 모두 여덟 언어를 갖는다', () => {
    const found: [string, string[]][] = [];
    localeStrings(primMstFacet, 'facet', found);
    // 제목 · 한 줄 설명 · 메트릭 셋 · 코드 패널 이름 · 문안 스물하나 = 스물일곱.
    expect(found.length).toBe(27);
    for (const [path, keys] of found) {
      expect([path, [...keys].sort()]).toEqual([path, [...LOCALES].sort()]);
    }
  });

  it('빌트인 view 를 쓰지 않는다 — 조작 경로와 코드 패널만 예외', () => {
    const types = Object.values(primMstFacet.blocks).map((b) => b.type);
    expect(types.sort()).toEqual(['code-view', 'control-bar', 'prim-mst-stage']);
    expect(primMstFacet.blocks.stage!.type).toBe('prim-mst-stage');
    // 제목 블록을 두지 않는다 — 이름은 글이 준다.
    expect(types).not.toContain('title-block');
  });

  it('모듈 참조와 IR 참조가 등록 이름과 맞는다', () => {
    expect(primMstFacet.id).toBe('facet:primMst');
    expect(primMstFacet.algorithm).toBe('module:primMst');
    expect(primMstFacet.projector).toBe('module:primMstProjector');
    expect((primMstFacet.blocks.codePanel as { ir: string }).ir).toBe('ir:prim-grow');
    expect(primGrowIR.id).toBe('prim-grow');
    expect(primGrowIR.algorithm).toBe('primMst');
    // description 의 토큰은 facet id 와 같아야 한다 (C4).
    expect(primMstDescription).toContain('{facet:primMst}');
  });

  it('자료에는 좌표가 없다 — 구조뿐이다', () => {
    const data = primMstFacet.initialData as unknown as PrimMstData;
    expect(data).toEqual(SPEC);
    const flat = JSON.stringify(data);
    expect(flat).not.toContain('"x"');
    expect(flat).not.toContain('"y"');
  });
});
