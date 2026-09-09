// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  FacetContext,
  FacetRuntimeEvent,
  IR,
  IRStmt,
  Transpiler,
} from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  getIR,
  getView,
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
  buildCapacityMatrix,
  maxFlowAlgorithm,
  maxFlowDescription,
  maxFlowEdmondsKarpIR,
  maxFlowFacet,
  registerMaxFlow,
  type MaxFlowData,
} from '../src/index.js';

const DATA = maxFlowFacet.initialData as unknown as MaxFlowData;

/** 사양이 준 대조값. 아래에서 최소 절단으로 다시 셈해 견준다. */
const SPEC_MAX_FLOW = 23;

const clone = (d: MaxFlowData): MaxFlowData => JSON.parse(JSON.stringify(d)) as MaxFlowData;

function freshWorkspace(n: number): { parent: number[]; queue: number[] } {
  return { parent: new Array<number>(n).fill(-1), queue: new Array<number>(n).fill(0) };
}

function runIRMaxFlow(data: MaxFlowData): { flow: number; cap: number[][] } {
  const cap = buildCapacityMatrix(data);
  const { parent, queue } = freshWorkspace(data.nodeCount);
  const flow = runIR(maxFlowEdmondsKarpIR, 'max_flow', [
    cap,
    data.source,
    data.sink,
    parent,
    queue,
  ]);
  return { flow: flow as number, cap };
}

/**
 * 최소 절단을 전수로 셈한다 — 들어오는 곳을 품고 나가는 곳을 뺀 모든 정점
 * 무리에 대해, 그 면을 건너는 원래 간선의 용량 합 중 가장 작은 값.
 *
 * 알고리즘과 겹치는 코드가 한 줄도 없는 다른 길이라 대조에 쓴다.
 */
function bruteForceMinCut(data: MaxFlowData): number {
  const n = data.nodeCount;
  let best = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 1 << n; mask += 1) {
    const inS = (i: number): boolean => (mask & (1 << i)) !== 0;
    if (!inS(data.source) || inS(data.sink)) continue;
    let cut = 0;
    for (const e of data.edges) if (inS(e.from) && !inS(e.to)) cut += e.capacity;
    if (cut < best) best = cut;
  }
  return best;
}

function collectIRPhases(ir: IR): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if (s.kind !== 'comment' && s.phase) out.add(s.phase);
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

type Run = {
  events: FacetRuntimeEvent[];
  metrics: Map<string, number>;
};

async function runAlgorithm(data: MaxFlowData): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const ctx: FacetContext<MaxFlowData> = {
    data,
    async emit(event: FacetRuntimeEvent): Promise<void> {
      events.push(event);
    },
    metric(name: string, delta: number | 'inc'): void {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    cancelled: false,
  };
  await maxFlowAlgorithm(ctx);
  return { events, metrics };
}

const payloadOf = <T>(e: FacetRuntimeEvent): T => e.payload as T;
const byType = (events: FacetRuntimeEvent[], type: string): FacetRuntimeEvent[] =>
  events.filter((e) => e.type === type);

const TRANSPILERS: Transpiler[] = [
  pythonTranspiler,
  javascriptTranspiler,
  typescriptTranspiler,
  javaTranspiler,
  cppTranspiler,
  csharpTranspiler,
];

afterEach(() => {
  clearRegistry();
  clearViewCatalog();
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────────────────
// 1. IR 을 실제로 돌린다
// ────────────────────────────────────────────────────────────────────────

describe('IR 실행', () => {
  it('사양의 망에서 최대 유량 23 에 닿는다', () => {
    const { flow } = runIRMaxFlow(clone(DATA));
    expect(flow).toBe(SPEC_MAX_FLOW);
  });

  it('최소 절단을 전수로 셈한 값과 같다', () => {
    const { flow } = runIRMaxFlow(clone(DATA));
    const cut = bruteForceMinCut(DATA);
    expect(cut).toBe(SPEC_MAX_FLOW);
    expect(flow).toBe(cut);
  });

  it('방향 간선은 열이고 관(정점 쌍)은 아홉이다', () => {
    expect(DATA.edges).toHaveLength(10);
    const pairs = new Set(
      DATA.edges.map((e) => (e.from < e.to ? `${e.from}:${e.to}` : `${e.to}:${e.from}`)),
    );
    expect(pairs.size).toBe(9);
    // 1 ↔ 2 만 양방향으로 선언되어 있어 간선 수와 관 수가 하나 어긋난다.
    expect(DATA.edges.filter((e) => e.from === 1 && e.to === 2)).toHaveLength(1);
    expect(DATA.edges.filter((e) => e.from === 2 && e.to === 1)).toHaveLength(1);
  });

  it('cap[u][v] + cap[v][u] 는 끝까지 변하지 않는다 — 되돌릴 폭이 정확히 흘린 만큼이다', () => {
    const before = buildCapacityMatrix(DATA);
    const { cap } = runIRMaxFlow(clone(DATA));
    let touched = 0;
    for (let u = 0; u < DATA.nodeCount; u += 1) {
      for (let v = u + 1; v < DATA.nodeCount; v += 1) {
        expect(cap[u][v] + cap[v][u]).toBe(before[u][v] + before[v][u]);
        if (cap[u][v] !== before[u][v]) touched += 1;
      }
    }
    // 흘린 관이 하나도 없으면 위 단언은 0 = 0 으로 통과해 버린다. 실제로 움직였는지 잰다.
    expect(touched).toBe(7);
  });

  it('나가는 곳으로 실제로 들어온 양이 23 이다', () => {
    const before = buildCapacityMatrix(DATA);
    const { cap } = runIRMaxFlow(clone(DATA));
    let intoSink = 0;
    for (let u = 0; u < DATA.nodeCount; u += 1) {
      intoSink += before[u][DATA.sink] - cap[u][DATA.sink];
    }
    expect(intoSink).toBe(SPEC_MAX_FLOW);
  });

  it('용량을 하나 줄이면 값도 따라 준다 — 상수를 되읽는 검사가 아니다', () => {
    const narrowed = clone(DATA);
    // 최소 절단을 이루는 3 → 5 (20) 이 아니라 절단에 걸린 4 → 5 (4) 를 좁힌다.
    const e = narrowed.edges.find((x) => x.from === 4 && x.to === 5);
    expect(e).toBeDefined();
    if (e) e.capacity = 1;
    expect(bruteForceMinCut(narrowed)).toBe(20);
    expect(runIRMaxFlow(narrowed).flow).toBe(20);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 2. 여섯 언어로 낸다
// ────────────────────────────────────────────────────────────────────────

describe('여섯 언어 전사', () => {
  it.each(TRANSPILERS.map((t) => [t.id, t] as const))('%s 가 온전한 소스를 낸다', (_id, t) => {
    const { lines } = t.transpile(maxFlowEdmondsKarpIR);
    const src = lines.map((l) => l.code).join('\n');
    expect(lines.length).toBeGreaterThan(30);
    expect(lines.length).toBeLessThan(60);
    expect(src).not.toContain('undefined');
    expect(src).not.toContain('[object');
    // 되돌릴 폭을 만드는 대목이 여섯 언어 모두에 펼쳐진 채로 나온다.
    expect(src).toContain('cap[v][u] = cap[v][u] + f');
    expect(src).toContain('cap[u][v] = cap[u][v] - f');
    // 큐가 이름 붙인 호출로 감싸이지 않았다.
    expect(src).not.toMatch(/queue\.(push|pop|shift|add|enqueue)/);
    expect(src).toContain('queue[tail] = w');
  });

  it('C++ 은 함수가 하나라 전방 선언을 붙이지 않는다', () => {
    const { lines } = cppTranspiler.transpile(maxFlowEdmondsKarpIR);
    expect(maxFlowEdmondsKarpIR.functions).toHaveLength(1);
    expect(lines[0].code).toContain('int max_flow(');
    expect(lines.filter((l) => /^int max_flow\(.*\);$/.test(l.code))).toHaveLength(0);
  });

  it('파이썬은 정수 나눗셈 표기를 쓸 일이 없다 — 자리 셈이 없는 알고리즘이다', () => {
    const src = pythonTranspiler
      .transpile(maxFlowEdmondsKarpIR)
      .lines.map((l) => l.code)
      .join('\n');
    expect(src).not.toContain('//');
    expect(src).toContain('while True:');
  });

  it('전사기가 IR 을 건드리지 않는다', () => {
    const before = JSON.stringify(maxFlowEdmondsKarpIR);
    for (const t of TRANSPILERS) t.transpile(maxFlowEdmondsKarpIR);
    expect(JSON.stringify(maxFlowEdmondsKarpIR)).toBe(before);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 3. phase 대조 (C3)
// ────────────────────────────────────────────────────────────────────────

describe('phase 어휘 동기화', () => {
  it('irs.ts 의 phase 집합과 algorithm.ts 가 보내는 집합이 정확히 같다', async () => {
    const irPhases = collectIRPhases(maxFlowEdmondsKarpIR);
    const { events } = await runAlgorithm(clone(DATA));
    const emitted = new Set<string>();
    for (const e of byType(events, 'phase')) {
      const p = payloadOf<{ phase: string }>(e);
      emitted.add(p.phase);
      expect(e.silent).toBe(true);
    }
    expect([...emitted].sort()).toEqual([...irPhases].sort());
    // 한쪽이 비어 있으면 위 단언이 공허하게 통과한다.
    expect(irPhases.size).toBe(11);
  });

  it('전사된 코드 줄에도 같은 phase 만 붙는다', () => {
    const irPhases = collectIRPhases(maxFlowEdmondsKarpIR);
    for (const t of TRANSPILERS) {
      const linePhases = new Set(
        t
          .transpile(maxFlowEdmondsKarpIR)
          .lines.map((l) => l.phase)
          .filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual([...irPhases].sort());
    }
  });
});

// ────────────────────────────────────────────────────────────────────────
// 4. 알고리즘이 보내는 값이 실측인가
// ────────────────────────────────────────────────────────────────────────

describe('알고리즘 발신', () => {
  it('메트릭 셋이 실제 걸음 수와 맞는다', async () => {
    const { events, metrics } = await runAlgorithm(clone(DATA));
    expect(metrics.get('path-count')).toBe(byType(events, 'path-found').length);
    expect(metrics.get('probe-count')).toBe(byType(events, 'probe-edge').length);
    expect(metrics.get('flow-sum')).toBe(SPEC_MAX_FLOW);
    expect(metrics.get('path-count')).toBe(3);
    // facet.ts 가 선언하지 않은 이름으로는 갱신하지 않는다 (C5).
    const controls = maxFlowFacet.blocks.controls as {
      metrics: { name: string }[];
    };
    const declared = new Set(controls.metrics.map((m) => m.name));
    for (const name of metrics.keys()) expect(declared.has(name)).toBe(true);
  });

  it('찾은 길이 실제로 들어오는 곳에서 나가는 곳까지 이어진다', async () => {
    const { events } = await runAlgorithm(clone(DATA));
    const paths = byType(events, 'path-found').map((e) => payloadOf<{ path: number[] }>(e).path);
    expect(paths).toHaveLength(3);
    for (const p of paths) {
      expect(p[0]).toBe(DATA.source);
      expect(p[p.length - 1]).toBe(DATA.sink);
      expect(new Set(p).size).toBe(p.length);
    }
    // 너비 우선이라 길이가 줄어드는 일이 없다 (에드몬즈-카프의 단조성).
    const lengths = paths.map((p) => p.length);
    expect([...lengths].sort((a, b) => a - b)).toEqual(lengths);
  });

  it('화면에 보낸 잔여 용량이 알고리즘의 표와 한 칸도 어긋나지 않는다', async () => {
    const { events } = await runAlgorithm(clone(DATA));
    // payload 의 residual 만으로 표를 다시 세운다 — 무대가 보는 것과 같은 값이다.
    const replay = buildCapacityMatrix(DATA);
    for (const e of events) {
      if (e.type !== 'push-flow' && e.type !== 'residual-grown') continue;
      const p = payloadOf<{ from: number; to: number; amount: number; residual: number }>(e);
      const expected =
        e.type === 'push-flow'
          ? replay[p.from][p.to] - p.amount
          : replay[p.from][p.to] + p.amount;
      expect(p.residual).toBe(expected);
      replay[p.from][p.to] = p.residual;
    }
    const { cap } = runIRMaxFlow(clone(DATA));
    expect(replay).toEqual(cap);
    expect(byType(events, 'push-flow')).toHaveLength(10);
    expect(byType(events, 'residual-grown')).toHaveLength(10);
  });

  it('마지막에 길이 없다고 알리고 총량을 준다', async () => {
    const { events } = await runAlgorithm(clone(DATA));
    expect(byType(events, 'no-path')).toHaveLength(1);
    const done = byType(events, 'done');
    expect(done).toHaveLength(1);
    expect(payloadOf<{ total: number; paths: number }>(done[0])).toEqual({
      total: SPEC_MAX_FLOW,
      paths: 3,
    });
    expect(events[events.length - 1]).toBe(done[0]);
  });

  it('큐가 머리와 꼬리로만 오간다 — 꺼낸 차례가 넣은 차례와 같다', async () => {
    const { events } = await runAlgorithm(clone(DATA));
    let pushed: number[] = [];
    let popped: number[] = [];
    for (const e of events) {
      if (e.type === 'search-begin') {
        expect(popped).toEqual(pushed);
        pushed = [...payloadOf<{ queue: number[] }>(e).queue];
        popped = [];
      } else if (e.type === 'enqueue') {
        pushed.push(payloadOf<{ node: number }>(e).node);
      } else if (e.type === 'dequeue') {
        popped.push(payloadOf<{ node: number }>(e).node);
      }
    }
    expect(popped).toEqual(pushed);
    expect(popped.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 5. 등록과 선언
// ────────────────────────────────────────────────────────────────────────

describe('등록', () => {
  it('registerMaxFlow 가 IR 과 무대를 이름 그대로 올린다', () => {
    registerMaxFlow();
    expect(getIR('max-flow-edmonds-karp')).toBe(maxFlowEdmondsKarpIR);
    expect(getView('max-flow-stage')).toBeDefined();
    const codePanel = maxFlowFacet.blocks.codePanel as { ir?: string };
    expect(codePanel.ir).toBe('ir:max-flow-edmonds-karp');
    expect(maxFlowFacet.algorithm).toBe('module:maxFlow');
    expect(maxFlowFacet.projector).toBe('module:maxFlowProjector');
  });

  it('글의 facet 토큰이 제 id 와 맞고, 조각 참조를 하나 데리고 있다 (C4)', () => {
    const tokens = maxFlowDescription.match(/\{facet:[A-Za-z]+\}/g) ?? [];
    expect(tokens).toContain(`{${maxFlowFacet.id}}`);
    // 되돌릴 폭이 실제로 쓰이는 장면은 이 망에 없다. 그 자리를 조각이 맡는다.
    expect(tokens).toContain('{facet:undoByBackEdge}');
    expect(maxFlowDescription).toContain('23 으로 똑같이 나온다');
  });

  it('무대 말고는 빌트인 view 를 쓰지 않는다 (원칙 6)', () => {
    const types = Object.values(maxFlowFacet.blocks).map((b) => b.type);
    expect(types.sort()).toEqual(['code-view', 'control-bar', 'max-flow-stage']);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 6. happy-dom 에 띄워 끝까지 굴린다
// ────────────────────────────────────────────────────────────────────────

describe('러너 통합', () => {
  it('마운트해 끝까지 재생하면 화면에 23 이 뜬다', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    registerBuiltinViews();
    registerMaxFlow();

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(maxFlowFacet, host);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const viewBoxAtMount = svg?.getAttribute('viewBox');
    expect(viewBoxAtMount).toBe('0 0 720 390');

    handle.setSpeed(50);
    handle.start();

    const deadline = Date.now() + 15000;
    const statusOf = (): string =>
      Array.from(svg?.querySelectorAll('text') ?? [])
        .map((t) => t.textContent ?? '')
        .join('\n');
    while (Date.now() < deadline && !statusOf().includes('Maximum flow: 23')) {
      await new Promise((r) => setTimeout(r, 20));
    }

    const finalText = statusOf();
    expect(finalText).toContain('Maximum flow: 23');
    expect(finalText).toContain('Routes used: 3');

    // 재생 중에 세로가 바뀌면 글 안에 박힌 그림이 위아래 문단을 민다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(viewBoxAtMount);
    expect(host.querySelectorAll('svg').length).toBeGreaterThan(0);
    expect(errorSpy).not.toHaveBeenCalled();

    // 화면에 남은 잔여 용량 숫자가 IR 이 셈한 표와 같은 값들이다.
    const { cap } = runIRMaxFlow(clone(DATA));
    const expected: number[] = [];
    for (let a = 0; a < DATA.nodeCount; a += 1) {
      for (let b = a + 1; b < DATA.nodeCount; b += 1) {
        if (cap[a][b] + cap[b][a] === 0) continue;
        if (cap[a][b] > 0) expected.push(cap[a][b]);
        if (cap[b][a] > 0) expected.push(cap[b][a]);
      }
    }
    const shown = Array.from(svg?.querySelectorAll('text') ?? [])
      .map((t) => Number(t.textContent))
      .filter((n) => Number.isFinite(n) && n > 0);
    for (const value of expected) {
      const at = shown.indexOf(value);
      expect(at, `화면에서 잔여 ${value} 를 찾지 못했다`).toBeGreaterThanOrEqual(0);
      shown.splice(at, 1);
    }
    expect(expected.length).toBe(14);

    handle.destroy();
    expect(host.innerHTML).toBe('');
    host.remove();
  }, 20000);
});
