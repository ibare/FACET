// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { FacetRuntimeEvent, IR, IRExpr, IRStmt, View, ViewInstance } from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  registerBuiltinViews,
  registerView,
  runFacet,
} from '@ffacet/core/runtime';
import {
  dfs,
  dfsFacet,
  dfsProjector,
  dfsRecursiveIR,
  registerDfs,
  type DfsData,
} from '../src/index.js';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

/** 사양의 자료. 이웃 목록에 적힌 차례가 곧 보는 차례다. */
const SPEC_ADJACENCY: number[][] = [[1, 2], [3, 4], [5], [], [5, 6], [], [7], []];
const SPEC_START = 0;
/** 사양의 대조 — 여덟을 다 보고, 2 에서 5 로는 들어가지 않는다. */
const SPEC_ORDER = [0, 1, 3, 4, 5, 6, 7, 2];

const PHASES = ['ascend', 'check', 'descend', 'mark', 'scan'];

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(adjacency: number[][], start: number): Promise<Recorded> {
  const data: DfsData = {
    type: 'dfs',
    adjacency: adjacency.map((row) => [...row]),
    start,
  };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await dfs({
    data,
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

describe('깊이 우선 탐색', () => {
  it('방문 차례가 사양의 대조와 같다', async () => {
    const { events } = await record(SPEC_ADJACENCY, SPEC_START);
    const order = payloadsOf<{ node: number }>(events, 'mark').map((p) => p.node);
    expect(order).toEqual(SPEC_ORDER);
  });

  it('여덟을 다 보고, 2 에서 5 로 가는 간선 하나만 거절당한다', async () => {
    const { events, metrics } = await record(SPEC_ADJACENCY, SPEC_START);
    const done = payloadsOf<{ count: number; depth: number; skipped: number }>(
      events,
      'done',
    )[0]!;
    expect(done.count).toBe(8);
    expect(done.skipped).toBe(1);
    expect(metrics['visit-count']).toBe(8);
    expect(metrics['skip-count']).toBe(1);

    const refused = payloadsOf<{ from: number; to: number }>(events, 'edge-skipped');
    expect(refused).toEqual([{ from: 2, to: 5 }]);

    // 간선 여덟을 정확히 한 번씩 본다 — 들어간 일곱 + 거절당한 하나.
    const looked = payloadsOf<{ node: number; neighbor: number }>(events, 'scan');
    expect(looked).toHaveLength(8);
    expect(payloadsOf(events, 'edge-open')).toHaveLength(7);
  });

  it('부른 만큼 돌아 나온다 — 그리고 둘은 서로 다른 이벤트다', async () => {
    const { events } = await record(SPEC_ADJACENCY, SPEC_START);
    const dives = payloadsOf<{ from: number; to: number }>(events, 'descend');
    const backs = payloadsOf<{ node: number; parent: number | null }>(events, 'ascend');
    // 첫 부름은 바깥에서 온 것이라 descend 가 없다. 돌아 나오는 것은 여덟 번.
    expect(dives).toHaveLength(7);
    expect(backs).toHaveLength(8);
    expect(backs.filter((b) => b.parent === null)).toEqual([
      { node: 0, parent: null, depth: 1 },
    ]);
    // 파고든 간선마다 되짚어 나온 짝이 있다.
    const pairs = backs
      .filter((b) => b.parent !== null)
      .map((b) => `${b.parent}>${b.node}`)
      .sort();
    expect(pairs).toEqual(dives.map((d) => `${d.from}>${d.to}`).sort());
  });

  it('이벤트만으로 호출 스택을 다시 세우면 깊이가 5 에서 멈춘다', async () => {
    const { events, metrics } = await record(SPEC_ADJACENCY, SPEC_START);
    const stack: number[] = [];
    let deepest = 0;
    for (const e of events) {
      if (e.type === 'mark') {
        stack.push((e.payload as { node: number }).node);
        deepest = Math.max(deepest, stack.length);
      } else if (e.type === 'ascend') {
        expect(stack[stack.length - 1]).toBe((e.payload as { node: number }).node);
        stack.pop();
      }
    }
    // 되짚어 나오는 것으로 스택이 정확히 비워진다.
    expect(stack).toEqual([]);
    // 0 → 1 → 4 → 6 → 7 이 가장 깊다.
    expect(deepest).toBe(5);
    expect(metrics['max-depth']).toBe(5);
    expect(payloadsOf<{ depth: number }>(events, 'done')[0]!.depth).toBe(5);
  });

  it('mark 는 깊이와 차례를 함께 싣는다', async () => {
    const { events } = await record(SPEC_ADJACENCY, SPEC_START);
    const marks = payloadsOf<{ node: number; parent: number | null; depth: number; seq: number }>(
      events,
      'mark',
    );
    expect(marks.map((m) => m.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(marks.map((m) => m.depth)).toEqual([1, 2, 3, 3, 4, 4, 5, 2]);
    expect(marks.map((m) => m.parent)).toEqual([null, 0, 1, 1, 4, 4, 6, 0]);
  });

  it('이웃 목록의 차례를 뒤집으면 방문 차례도 뒤집힌다', async () => {
    const flipped = SPEC_ADJACENCY.map((row) => [...row].reverse());
    const { events } = await record(flipped, SPEC_START);
    const order = payloadsOf<{ node: number }>(events, 'mark').map((p) => p.node);
    expect(order).toEqual([0, 2, 5, 1, 4, 6, 7, 3]);
    expect(new Set(order).size).toBe(8);
  });

  it('정점이 없으면 걸음 없이 끝난다', async () => {
    const { events } = await record([], 0);
    expect(payloadsOf(events, 'mark')).toHaveLength(0);
    expect(payloadsOf(events, 'done')[0]).toEqual({
      order: [],
      count: 0,
      depth: 0,
      skipped: 0,
    });
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const { events } = await record(SPEC_ADJACENCY, SPEC_START);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

describe('IR 을 실제로 돌린다', () => {
  it('인터프리터가 여덟을 모두 본 자리로 표시한다', () => {
    const adj = SPEC_ADJACENCY.map((row) => [...row]);
    const visited = new Array<number>(8).fill(0);
    runIR(dfsRecursiveIR, 'dfs', [adj, visited, SPEC_START]);
    expect(visited).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('이미 본 자리를 미리 찍어 두면 그 갈래로 들어가지 않는다', () => {
    const adj = SPEC_ADJACENCY.map((row) => [...row]);
    // 1 을 이미 본 것으로 두면 0 은 2 쪽만 파고들 수 있다.
    const visited = [0, 1, 0, 0, 0, 0, 0, 0];
    runIR(dfsRecursiveIR, 'dfs', [adj, visited, SPEC_START]);
    expect(visited).toEqual([1, 1, 1, 0, 0, 1, 0, 0]);
  });

  it('IR 이 표시한 집합과 algorithm 이 본 집합이 같다', async () => {
    const adj = SPEC_ADJACENCY.map((row) => [...row]);
    const visited = new Array<number>(8).fill(0);
    runIR(dfsRecursiveIR, 'dfs', [adj, visited, SPEC_START]);
    const fromIR = visited.flatMap((v, i) => (v === 1 ? [i] : []));

    const { events } = await record(SPEC_ADJACENCY, SPEC_START);
    const fromAlgorithm = payloadsOf<{ node: number }>(events, 'mark')
      .map((p) => p.node)
      .sort((a, b) => a - b);
    expect(fromAlgorithm).toEqual(fromIR);
  });

  it('인접 목록을 건드리지 않는다 — 표만 채운다', () => {
    const adj = SPEC_ADJACENCY.map((row) => [...row]);
    runIR(dfsRecursiveIR, 'dfs', [adj, new Array<number>(8).fill(0), SPEC_START]);
    expect(adj).toEqual(SPEC_ADJACENCY);
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const { events } = await record(SPEC_ADJACENCY, SPEC_START);
    const emitted = new Set(
      events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(dfsRecursiveIR)].sort());
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
      const res = transpiler.transpile(dfsRecursiveIR);
      expect(res.lines.length).toBeGreaterThan(5);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual(PHASES);

      const all = res.lines.map((l) => l.code).join('\n');
      // 재귀가 이 IR 의 전부다 — 함수가 자기를 부르는 줄이 있어야 한다.
      expect(all).toContain('dfs(adj, visited, nb)');
      // 2 차원 인접 목록을 이름 붙인 호출 없이 그대로 읽는다.
      expect(all).toContain('adj[node][i]');
      expect(all).toContain('visited[node] = 1');
      expect(all).toContain('visited[nb] == 0');
      // 돌아오는 일에 짚을 줄 — 없어도 도는 줄이지만 일부러 두었다 (irs.ts).
      const ascendLines = res.lines.filter((l) => l.phase === 'ascend');
      expect(ascendLines).toHaveLength(1);
      expect(ascendLines[0]!.code.trim().replace(/;$/, '')).toBe('return');
    },
  );

  it('이름 붙인 호출은 dfs 자신뿐이다 — zeros/max 류 바깥 도우미가 없다', () => {
    const called = new Set<string>();
    const walkExpr = (e: IRExpr): void => {
      switch (e.kind) {
        case 'call':
          called.add(e.fn);
          e.args.forEach(walkExpr);
          return;
        case 'index':
          walkExpr(e.arr);
          walkExpr(e.idx);
          return;
        case 'len':
          walkExpr(e.of);
          return;
        case 'binop':
          walkExpr(e.l);
          walkExpr(e.r);
          return;
        case 'unop':
          walkExpr(e.x);
          return;
        default:
          return;
      }
    };
    const walk = (stmts: IRStmt[]): void => {
      for (const s of stmts) {
        if (s.kind === 'var') walkExpr(s.init);
        else if (s.kind === 'assign') {
          walkExpr(s.target);
          walkExpr(s.expr);
        } else if (s.kind === 'if') {
          walkExpr(s.cond);
          walk(s.then);
          if (s.else) walk(s.else);
        } else if (s.kind === 'for-range') {
          walkExpr(s.from);
          walkExpr(s.to);
          walk(s.body);
        } else if (s.kind === 'while') {
          walkExpr(s.cond);
          walk(s.body);
        } else if (s.kind === 'expr-stmt') walkExpr(s.expr);
        else if (s.kind === 'return' && s.expr) walkExpr(s.expr);
      }
    };
    for (const f of dfsRecursiveIR.functions) walk(f.body);
    expect([...called]).toEqual(['dfs']);
    // 함수도 하나뿐이라 C++ 이 전방 선언을 붙일 일이 없다.
    expect(dfsRecursiveIR.functions.map((f) => f.name)).toEqual(['dfs']);
  });

  it('정적 언어 넷이 2차원 인접 목록을 각자의 표기로 낸다', () => {
    const of = (t: (typeof ALL)[number]) =>
      t.transpile(dfsRecursiveIR).lines.map((l) => l.code).join('\n');
    expect(of(javaTranspiler)).toContain('int[][] adj');
    expect(of(csharpTranspiler)).toContain('int[][] adj');
    expect(of(cppTranspiler)).toContain('std::vector<std::vector<int>>& adj');
    expect(of(typescriptTranspiler)).toContain('adj: number[][]');
    // 이웃 수 세기도 언어마다 표기가 갈린다.
    expect(of(javaTranspiler)).toContain('adj[node].length');
    expect(of(cppTranspiler)).toContain('adj[node].size()');
    expect(of(csharpTranspiler)).toContain('adj[node].Length');
    expect(of(pythonTranspiler)).toContain('len(adj[node])');
  });
});

describe('Projector 배선', () => {
  it('파고드는 걸음과 물러나는 걸음이 stage 에서 서로 다른 일로 나온다', async () => {
    const { events } = await record(SPEC_ADJACENCY, SPEC_START);
    const phaseCalls: (string | null)[] = [];
    const pushed: number[] = [];
    const popped: number[] = [];
    const activeKinds: string[] = [];
    const settled: string[] = [];
    let liveStack = 0;
    let deepest = 0;
    let lastCaption = '';

    const stage = {
      setGraph() {},
      pushFrame(node: number) {
        pushed.push(node);
        liveStack += 1;
        deepest = Math.max(deepest, liveStack);
      },
      setFrameCursor() {},
      popFrame(node: number) {
        popped.push(node);
        liveStack -= 1;
      },
      setActiveEdge(from: number, to: number, kind: string) {
        activeKinds.push(`${kind}:${from}>${to}`);
      },
      clearActiveEdge() {},
      settleEdge(from: number, to: number, kind: string) {
        settled.push(`${kind}:${from}>${to}`);
      },
      setCaption(value: string) {
        lastCaption = value;
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

    const projector = dfsProjector({ stage, codePanel });
    projector.onInit?.(dfsFacet.initialData);
    for (const e of events) await projector.onEvent(e);

    expect(pushed).toEqual(SPEC_ORDER);
    // 물러나는 차례는 파고든 차례의 거울이다 (가장 깊은 것이 먼저 나온다).
    expect(popped).toEqual([3, 5, 7, 6, 4, 1, 2, 0]);
    expect(deepest).toBe(5);
    expect(liveStack).toBe(0);

    // 파고듦 일곱 · 물러남 일곱 (뿌리는 되짚을 간선이 없다) 이 서로 다른 표시다.
    expect(activeKinds.filter((k) => k.startsWith('dive:'))).toHaveLength(7);
    expect(activeKinds.filter((k) => k.startsWith('back:'))).toHaveLength(7);
    expect(settled.filter((s) => s.startsWith('tree:'))).toHaveLength(7);
    expect(settled.filter((s) => s.startsWith('skip:'))).toEqual(['skip:2>5']);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null)).size).toBe(5);
    expect(phaseCalls[phaseCalls.length - 1]).toBeNull();
    // 마지막 문안에 알고리즘이 셈한 수가 그대로 들어간다.
    expect(lastCaption).toContain('8');
    expect(lastCaption).toContain('5');
  });
});

describe('마운트와 재생', () => {
  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
  });

  it('그래프가 서고, 재생 내내 세로가 변하지 않고, 방문 차례가 화면에 남는다', async () => {
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
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    registerDfs();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(dfsFacet, host, { autoStart: false });
    handle.setSpeed(40);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    // 정점 여덟 = 원 여덟 + 초점 링 여덟.
    expect(host.querySelectorAll('svg circle').length).toBe(16);
    // 호출 스택 자리 여덟 + 방문 차례 칸 여덟.
    expect(host.querySelectorAll('svg rect').length).toBe(16);
    // 방향 간선 여덟.
    expect(host.querySelectorAll('svg line').length).toBe(8 + 2);

    handle.start();
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline && new Set(seenPhases).size < PHASES.length) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // 걸음이 끝날 때까지 조금 더 기다린다 (마지막 done 까지).
    await new Promise((r) => setTimeout(r, 300));

    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(box);
    expect([...new Set(seenPhases)].sort()).toEqual(PHASES);

    // 화면의 수는 알고리즘이 셈한 것이다 — 방문 차례 띠를 그대로 읽는다.
    const ribbon = [...(svg?.querySelectorAll('text') ?? [])]
      .filter((t) => t.getAttribute('y') === '374')
      .sort((a, b) => Number(a.getAttribute('x')) - Number(b.getAttribute('x')))
      .map((t) => t.textContent ?? '');
    expect(ribbon).toEqual(SPEC_ORDER.map(String));

    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();

    handle.destroy();
    expect(host.querySelector('svg')).toBeNull();
    host.remove();
  }, 40_000);
});
