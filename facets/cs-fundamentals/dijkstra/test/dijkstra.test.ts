// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FacetRuntimeEvent, IR, IRExpr, IRStmt, View } from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  getAlgorithm,
  getDescription,
  getIR,
  getProjector,
  getView,
  registerBuiltinViews,
  registerView,
  runFacet,
} from '@ffacet/core/runtime';
import {
  dijkstra,
  dijkstraDescription,
  dijkstraFacet,
  dijkstraSettleIR,
  registerDijkstra,
  type DijkstraData,
} from '../src/index.js';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

/** 사양의 자료 — 정점 여섯, 무방향 간선 아홉, 출발은 0. */
const SPEC = dijkstraFacet.initialData as unknown as DijkstraData;

/** 사양의 대조. 0 에서 각 정점까지의 최단 거리. */
const TRUTH = [0, 7, 9, 20, 20, 11];

const PHASES = [
  'init',
  'pick-min',
  'relax-apply',
  'relax-check',
  'return-dist',
  'round-begin',
  'scan',
  'settle',
  'stop-check',
];

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(data?: Partial<DijkstraData>): Promise<Recorded> {
  const full: DijkstraData = {
    type: SPEC.type,
    vertexCount: SPEC.vertexCount,
    source: SPEC.source,
    edges: SPEC.edges.map((e) => ({ ...e })),
    ...data,
  };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await dijkstra({
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

/** IR 안의 `call` 노드를 모두 모은다. 이름 붙인 호출이 있는지 재는 검사용. */
function irCalls(ir: IR): string[] {
  const out: string[] = [];
  const expr = (e: IRExpr | undefined): void => {
    if (!e) return;
    switch (e.kind) {
      case 'call':
        out.push(e.fn);
        e.args.forEach(expr);
        return;
      case 'index':
        expr(e.arr);
        expr(e.idx);
        return;
      case 'len':
        expr(e.of);
        return;
      case 'binop':
        expr(e.l);
        expr(e.r);
        return;
      case 'unop':
        expr(e.x);
        return;
      default:
        return;
    }
  };
  const walk = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if (s.kind === 'var') expr(s.init);
      else if (s.kind === 'assign') {
        expr(s.target);
        expr(s.expr);
      } else if (s.kind === 'if') {
        expr(s.cond);
        walk(s.then);
        if (s.else) walk(s.else);
      } else if (s.kind === 'for-range') {
        expr(s.from);
        expr(s.to);
        walk(s.body);
      } else if (s.kind === 'while') {
        expr(s.cond);
        walk(s.body);
      } else if (s.kind === 'return') expr(s.expr);
      else if (s.kind === 'expr-stmt') expr(s.expr);
    }
  };
  for (const f of ir.functions) walk(f.body);
  return out;
}

/** 사양의 간선 목록에서 인접 목록 둘을 짓는다 — IR 에 넘길 인자. */
function adjacency(): { adj: number[][]; wgt: number[][] } {
  const adj: number[][] = Array.from({ length: SPEC.vertexCount }, () => []);
  const wgt: number[][] = Array.from({ length: SPEC.vertexCount }, () => []);
  for (const e of SPEC.edges) {
    adj[e.a]!.push(e.b);
    wgt[e.a]!.push(e.w);
    adj[e.b]!.push(e.a);
    wgt[e.b]!.push(e.w);
  }
  return { adj, wgt };
}

const TRANSPILERS = [
  pythonTranspiler,
  javascriptTranspiler,
  typescriptTranspiler,
  javaTranspiler,
  cppTranspiler,
  csharpTranspiler,
];

describe('IR — 코드 패널이 보이는 코드가 실제로 도는 코드인가', () => {
  it('IR 을 돌린 답이 사양의 대조와 같다', () => {
    const { adj, wgt } = adjacency();
    const dist = Array.from({ length: SPEC.vertexCount }, () => 0);
    const done = Array.from({ length: SPEC.vertexCount }, () => 0);
    const out = runIR(dijkstraSettleIR, 'dijkstra', [adj, wgt, SPEC.source, dist, done]);
    expect(out).toEqual(TRUTH);
    // 여섯 정점이 모두 굳었다.
    expect(done).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('출발점을 바꿔도 IR 이 스스로 셈한다 — 5 에서 재면 다른 답이 나온다', () => {
    const { adj, wgt } = adjacency();
    const dist = Array.from({ length: SPEC.vertexCount }, () => 0);
    const done = Array.from({ length: SPEC.vertexCount }, () => 0);
    const out = runIR(dijkstraSettleIR, 'dijkstra', [adj, wgt, 5, dist, done]) as number[];
    // 5 에서: 2 까지 2, 0 까지 11 (5−2−0), 4 까지 9, 3 까지 13 (5−2−3), 1 까지 12 (5−2−1).
    expect(out).toEqual([11, 12, 2, 13, 9, 0]);
    expect(out).not.toEqual(TRUTH);
  });

  it('이름 붙인 호출이 하나도 없다 — 고르는 일도 펴는 일도 펼쳐 썼다', () => {
    expect(irCalls(dijkstraSettleIR)).toEqual([]);
  });

  it('여섯 언어가 모두 나오고 undefined 가 섞이지 않는다', () => {
    for (const t of TRANSPILERS) {
      const lines = t.transpile(dijkstraSettleIR).lines;
      expect(lines.length).toBeGreaterThan(20);
      expect(lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      // IR 의 phase 는 하나도 빠짐없이 어느 줄엔가 붙어야 코드 패널이 짚는다.
      const emitted = new Set(lines.map((l) => l.phase).filter((p): p is string => p !== null));
      expect([...emitted].sort()).toEqual(PHASES);
    }
  });

  it('파이썬 출력에 훑기와 완화가 그대로 있다', () => {
    const code = pythonTranspiler.transpile(dijkstraSettleIR).lines.map((l) => l.code);
    expect(code.some((l) => l.includes('if (done[i] == 0) and (dist[i] < best)'))).toBe(true);
    expect(code.some((l) => l.includes('dist[v] = dist[u] + w'))).toBe(true);
    expect(code.some((l) => l.includes('for k in range(len(adj[u])):'))).toBe(true);
  });
});

describe('phase 어휘', () => {
  it('irs 와 algorithm 의 phase 집합이 같다 (C3)', async () => {
    const { events } = await record();
    const emitted = new Set(
      payloadsOf<{ phase: string }>(events, 'phase').map((p) => p.phase),
    );
    expect([...irPhases(dijkstraSettleIR)].sort()).toEqual(PHASES);
    expect([...emitted].sort()).toEqual(PHASES);
  });

  it('phase 이벤트는 모두 silent 다 (C2)', async () => {
    const { events } = await record();
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

describe('알고리즘 — 굳히고 편다', () => {
  it('최종 거리가 사양의 대조와 같다', async () => {
    const { events } = await record();
    const done = payloadsOf<{ dist: number[]; order: number[] }>(events, 'done')[0]!;
    expect(done.dist).toEqual(TRUTH);
  });

  it('굳힌 차례는 0 · 1 · 2 · 5 · 3 · 4 이고 값은 한 번도 줄지 않는다', async () => {
    const { events } = await record();
    const settles = payloadsOf<{ node: number; dist: number }>(events, 'settle');
    expect(settles.map((s) => s.node)).toEqual([0, 1, 2, 5, 3, 4]);
    expect(settles.map((s) => s.dist)).toEqual([0, 7, 9, 11, 20, 20]);
    for (let i = 1; i < settles.length; i += 1) {
      expect(settles[i]!.dist).toBeGreaterThanOrEqual(settles[i - 1]!.dist);
    }
  });

  it('굳은 뒤로는 그 정점의 값이 다시 바뀌지 않는다', async () => {
    const { events } = await record();
    const settledAt = new Map<number, number>();
    let broken = 0;
    events.forEach((e, i) => {
      const p = e.payload as { node?: number } | undefined;
      if (e.type === 'settle' && typeof p?.node === 'number') settledAt.set(p.node, i);
      if (e.type === 'relax-apply' && typeof p?.node === 'number') {
        const when = settledAt.get(p.node);
        if (when !== undefined && when < i) broken += 1;
      }
    });
    expect(settledAt.size).toBe(6);
    expect(broken).toBe(0);
  });

  it('잠정인 동안에는 흔들린다 — 정점 3 은 22 였다가 20 이 된다', async () => {
    const { events } = await record();
    const applies = payloadsOf<{ node: number; before: number | null; after: number }>(
      events,
      'relax-apply',
    );
    const three = applies.filter((a) => a.node === 3);
    expect(three.map((a) => a.after)).toEqual([22, 20]);
    expect(three[1]!.before).toBe(22);
  });

  it('4 로 가는 최단은 이음 셋을 밟는 0−2−5−4 다', async () => {
    const { events } = await record();
    const settles = payloadsOf<{ node: number; dist: number; path: number[] }>(events, 'settle');
    const four = settles.find((s) => s.node === 4)!;
    expect(four.path).toEqual([0, 2, 5, 4]);
    expect(four.dist).toBe(20);
    // 이음 둘만 밟는 0−2−3−4 는 9 + 11 + 6 = 26 이라 오히려 멀다.
    const w = (a: number, b: number): number =>
      SPEC.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))!.w;
    expect(w(0, 2) + w(2, 3) + w(3, 4)).toBe(26);
    expect(w(0, 2) + w(2, 5) + w(5, 4)).toBe(20);
  });

  it('메트릭은 셈한 값이다 — 훑기 36 · 굳힘 6 · 줄인 값 7', async () => {
    const { events, metrics } = await record();
    expect(metrics['scan-count']).toBe(SPEC.vertexCount * SPEC.vertexCount);
    expect(metrics['settle-count']).toBe(SPEC.vertexCount);
    expect(metrics['improve-count']).toBe(
      payloadsOf<unknown>(events, 'relax-apply').length,
    );
    expect(metrics['improve-count']).toBe(7);
    // 간선 아홉을 양쪽에서 한 번씩 — 열여덟 번 들여다보고 일곱 번만 줄었다.
    expect(payloadsOf<unknown>(events, 'relax-check')).toHaveLength(SPEC.edges.length * 2);
    // facet.ts 가 선언한 메트릭만 갱신한다 (C5).
    const declared = (
      (dijkstraFacet.blocks['controls'] as { metrics: { name: string }[] }).metrics
    ).map((m) => m.name);
    expect(Object.keys(metrics).sort()).toEqual([...declared].sort());
  });

  it('간선을 하나 지우면 답이 달라진다 — 상수를 박아 둔 것이 아니다', async () => {
    const { events } = await record({
      edges: SPEC.edges.filter((e) => !(e.a === 2 && e.b === 5)),
    });
    const done = payloadsOf<{ dist: number[] }>(events, 'done')[0]!;
    // 2−5 가 없으면 5 는 14 (0−5), 4 는 23 (0−5−4) 이 된다.
    expect(done.dist).toEqual([0, 7, 9, 20, 23, 14]);
  });

  it('무한대는 payload 에서 null 로 나간다', async () => {
    const { events } = await record();
    const init = payloadsOf<{ dist: (number | null)[]; source: number }>(events, 'state-changed')[0]!;
    expect(init.source).toBe(0);
    expect(init.dist).toEqual([0, null, null, null, null, null]);
  });
});

describe('선언 정합 (C4)', () => {
  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
  });

  it('module: / ir: 참조가 실제 등록 이름과 글자까지 같다', () => {
    registerDijkstra();
    expect(dijkstraFacet.algorithm).toBe('module:dijkstra');
    expect(dijkstraFacet.projector).toBe('module:dijkstraProjector');
    expect(getAlgorithm('dijkstra')).toBeDefined();
    expect(getProjector('dijkstraProjector')).toBeDefined();
    // 이름이 갈려 있어야 module: 참조만 보고도 어느 쪽인지 안다.
    expect(getAlgorithm('dijkstraProjector')).toBeUndefined();
    expect(getProjector('dijkstra')).toBeUndefined();

    const panel = dijkstraFacet.blocks['codePanel'] as { ir?: string };
    expect(panel.ir).toBe('ir:dijkstra-settle');
    expect(getIR('dijkstra-settle')).toBe(dijkstraSettleIR);
    expect(getView('dijkstra-stage')).toBeDefined();
    expect(getDescription('facet:dijkstra')).toBe(dijkstraDescription);
  });

  it('글이 자기 facet 을 부른다', () => {
    expect(dijkstraFacet.id).toBe('facet:dijkstra');
    expect(dijkstraDescription).toContain('{facet:dijkstra}');
  });

  it('projector 가 쓰는 문안 키가 messages 에 다 있다', () => {
    const declared = Object.keys(dijkstraFacet.messages ?? {});
    const used = [
      'label.source',
      'label.ledger',
      'label.tentative',
      'label.settled',
      'caption.init',
      'caption.round',
      'caption.scanSettled',
      'caption.scanUnreached',
      'caption.scanFarther',
      'caption.scanValue',
      'caption.bestUpdate',
      'caption.choose',
      'caption.settle',
      'caption.relaxCheck',
      'caption.relaxApply',
      'caption.done',
    ];
    expect([...declared].sort()).toEqual([...used].sort());
    // 저장소가 번역 번들을 갖춘 열 언어를 다 갖춘다 (S-piece).
    for (const key of declared) {
      const value = dijkstraFacet.messages![key] as Record<string, string>;
      expect(Object.keys(value).sort()).toEqual(
        ['ar', 'en', 'es', 'fr', 'hi', 'id', 'ja', 'ko', 'pt', 'zh'],
      );
    }
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
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });

    registerDijkstra();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(dijkstraFacet, host, { autoStart: false });
    handle.setSpeed(60);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    expect(box).toBe('0 0 760 386');
    // 정점 여섯 + 기록 칸 여섯 + 범례 둘 = 열넷. 기록은 아직 다 비어 있다.
    expect(host.querySelectorAll('svg circle').length).toBe(SPEC.vertexCount + 2);

    handle.start();
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline && new Set(seenPhases).size < PHASES.length) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(box);
    expect([...new Set(seenPhases)].sort()).toEqual(PHASES);

    // 화면의 수는 알고리즘이 셈한 것이다 — 기록에 최단 거리와 그 길이 떠 있다.
    const texts = [...host.querySelectorAll('svg text')].map((t) => t.textContent ?? '');
    for (const d of TRUTH) expect(texts).toContain(String(d));
    expect(texts).toContain('0 → 2 → 5 → 4');
    expect(texts.some((t) => t.includes('∞'))).toBe(false);

    handle.destroy();
    expect(host.querySelectorAll('svg').length).toBe(0);
    expect(errors).toEqual([]);
    spy.mockRestore();
    host.remove();
  }, 40_000);
});
