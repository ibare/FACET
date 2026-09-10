// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type {
  FacetContext,
  FacetRuntimeEvent,
  IR,
  IRStmt,
  View,
  ViewInstance,
} from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  registerBuiltinViews,
  registerView,
  runFacet,
} from '@ffacet/core/runtime';
import {
  hierarchical,
  hierarchicalFacet,
  hierarchicalProjector,
  hierarchicalMergeIR,
  registerHierarchical,
  type HierarchicalData,
  type HierarchicalInputEvent,
} from '../src/index.js';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

const PHASES = [
  'link-average',
  'link-complete',
  'link-single',
  'merge',
  'pick-closest',
  'point-pair',
  'report',
  'scan-pairs',
];

/**
 * 사양의 대조표 — 손으로 셈한 값이라 알고리즘·IR 과 견주는 용도다.
 * 한 줄이 `[살아남는 무리, 흡수되는 무리, 높이]` 이고 번호는 그 무리에 든 점의
 * 최소 번호다 (a = 0 … h = 7).
 */
const SPEC_TREE: Record<number, Array<[number, number, number]>> = {
  0: [
    [0, 1, 0.919],
    [5, 6, 1.006],
    [5, 7, 1.012],
    [3, 4, 1.051],
    [0, 2, 1.098],
    [3, 5, 1.645],
    [0, 3, 1.981],
  ],
  1: [
    [0, 1, 0.919],
    [5, 6, 1.006],
    [3, 4, 1.051],
    [0, 2, 1.334],
    [5, 7, 1.346],
    [3, 5, 3.696],
    [0, 3, 6.521],
  ],
  2: [
    [0, 1, 0.919],
    [5, 6, 1.006],
    [3, 4, 1.051],
    [5, 7, 1.179],
    [0, 2, 1.216],
    [0, 3, 2.808],
    [0, 5, 4.49],
  ],
};

/** 자르는 높이별 무리 수 — `[단일, 완전, 평균]`. 높이 2 의 줄이 이 완제품의 논증이다. */
const SPEC_CUT: Array<[number, [number, number, number]]> = [
  [1.0, [7, 7, 7]],
  [1.5, [3, 3, 3]],
  [2.0, [1, 3, 3]],
  [2.5, [1, 3, 3]],
  [3.5, [1, 3, 2]],
  [5.0, [1, 2, 1]],
];

/** 한 나무를 짓는 동안 재는 점쌍 거리의 수. 병합 차례가 달라 셋이 같지 않다. */
const SPEC_DISTANCES = [164, 165, 165];

function freshData(): HierarchicalData {
  return structuredClone(hierarchicalFacet.initialData) as unknown as HierarchicalData;
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

type MergePayload = { step: number; into: number; gone: number; height: number };
type TreePayload = { linkIndex: number; merges: MergePayload[]; distanceCount: number };
type CutPayload = { cutIndex: number; cutHeight: number; groups: number[]; clusterCount: number };
type DonePayload = {
  linkIndex: number;
  cutIndex: number;
  cutHeight: number;
  clusterCount: number;
  chained: boolean;
  textKey: string;
};

type Recorded = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
  /** 배지에 한 번이라도 찍힌 값 전부. `String(value)` 그대로다. */
  shown: string[];
};

/**
 * 알고리즘을 가짜 ReactiveContext 로 돌린다. 각본이 바닥나면 취소로 깨워
 * 끝낸다 — 메커니즘의 되감기가 하는 일과 같다.
 */
async function drive(script: HierarchicalInputEvent[]): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const shown: string[] = [];
  const queue = [...script];
  let cancelled = false;
  const ctx = {
    data: freshData(),
    get cancelled() {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
      shown.push(`${name}=${String(metrics[name])}`);
    },
    async sleep() {
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      const next = queue.shift();
      if (next !== undefined) return next;
      cancelled = true;
      throw new Error('cancelled');
    },
  } as unknown as FacetContext<HierarchicalData>;

  try {
    await hierarchical(ctx);
  } catch (err) {
    if ((err as Error).message !== 'cancelled') throw err;
  }
  return { events, metrics, shown };
}

const of = <T,>(events: FacetRuntimeEvent[], type: string): T[] =>
  events.filter((e) => e.type === type).map((e) => e.payload as T);

/** 열여덟 칸(연결 셋 × 높이 여섯)을 모두 한 번씩 지나가는 각본. */
function grandTour(): HierarchicalInputEvent[] {
  const heights = (hierarchicalFacet.initialData as unknown as HierarchicalData).cutHeights;
  const script: HierarchicalInputEvent[] = [];
  for (let c = 0; c < heights.length; c++) {
    script.push({ type: 'set-cut', payload: { segmentIndex: c, value: heights[c] } });
    for (let l = 0; l < 3; l++) {
      script.push({ type: 'set-link', payload: { segmentIndex: l, value: l } });
    }
  }
  return script;
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

/** IR 을 일곱 번 불러 나무 하나를 짓는다. 인자 배열은 호출부가 만들어 넘긴다. */
function buildTreeWithIR(mode: number): Array<[number, number, number]> {
  const d = freshData();
  const x = d.points.map((p) => [p.x, p.y]);
  const n = x.length;
  const member = Array.from({ length: n }, (_, i) => i);
  const alive = Array.from({ length: n }, () => 1);
  const out: Array<[number, number, number]> = [];
  for (let step = 0; step < n - 1; step++) {
    const merged = [0, 0, 0];
    const height = runIR(hierarchicalMergeIR, 'merge_step', [
      x,
      member,
      alive,
      merged,
      mode,
    ]) as number;
    out.push([merged[0], merged[1], height]);
    expect(merged[2]).toBe(height);
  }
  return out;
}

describe('연결 방식 셋이 서로 다른 나무를 짓는다', () => {
  it.each([0, 1, 2])('mode %i 의 병합 차례와 높이가 사양의 대조와 맞는다', async (mode) => {
    const { events } = await drive([{ type: 'set-link', payload: { segmentIndex: mode, value: mode } }]);
    const trees = of<TreePayload>(events, 'tree-built');
    const tree = trees[trees.length - 1];
    expect(tree.linkIndex).toBe(mode);
    expect(tree.merges.map((m) => [m.into, m.gone, r3(m.height)])).toEqual(SPEC_TREE[mode]);
  });

  it('나무 하나를 짓는 동안 잰 점쌍 거리의 수가 셋이 서로 다르다', async () => {
    const { events } = await drive([
      { type: 'set-link', payload: { segmentIndex: 1, value: 1 } },
      { type: 'set-link', payload: { segmentIndex: 2, value: 2 } },
    ]);
    const trees = of<TreePayload>(events, 'tree-built');
    expect(trees.map((t) => t.distanceCount)).toEqual(SPEC_DISTANCES);
  });

  it('열여덟 칸이 모두 사양의 대조표와 맞는다 — 높이 2 에서 1 / 3 / 3', async () => {
    const { events } = await drive(grandTour());
    const table = new Map<string, number>();
    for (const d of of<DonePayload>(events, 'done')) {
      table.set(`${d.linkIndex}-${d.cutIndex}`, d.clusterCount);
    }
    for (let r = 0; r < SPEC_CUT.length; r++) {
      for (let c = 0; c < 3; c++) {
        expect(table.get(`${c}-${r}`), `link ${c} · cut ${SPEC_CUT[r][0]}`).toBe(SPEC_CUT[r][1][c]);
      }
    }
    // 높이 2 의 한 줄이 이 완제품의 논증이다.
    expect([table.get('0-2'), table.get('1-2'), table.get('2-2')]).toEqual([1, 3, 3]);
  });

  it('단일 연결만 다리를 타고 이어 붙는다 (체이닝)', async () => {
    const { events } = await drive([
      { type: 'set-link', payload: { segmentIndex: 1, value: 1 } },
      { type: 'set-link', payload: { segmentIndex: 2, value: 2 } },
    ]);
    const dones = of<DonePayload>(events, 'done');
    // 높이 2 에서 단일만 chained. 셋 다 같은 높이를 본다.
    expect(dones.map((d) => d.cutHeight)).toEqual([2, 2, 2]);
    expect(dones.map((d) => d.chained)).toEqual([true, false, false]);
    expect(dones.map((d) => d.textKey)).toEqual([
      'caption.chained',
      'caption.separate',
      'caption.separate',
    ]);
  });

  it('자르는 높이만 옮기면 나무를 다시 짓지 않는다', async () => {
    const heights = freshData().cutHeights;
    const { events, metrics } = await drive([
      { type: 'set-cut', payload: { segmentIndex: 5, value: heights[5] } },
      { type: 'set-cut', payload: { segmentIndex: 0, value: heights[0] } },
    ]);
    // 나무는 처음 한 번만 지어졌다 — 병합 일곱 그대로다.
    expect(metrics['merge-count']).toBe(7);
    expect(of<TreePayload>(events, 'tree-built')).toHaveLength(1);
    // 그래도 답은 세 번 갈아 끼워졌다.
    expect(of<CutPayload>(events, 'cut-changed').map((c) => c.clusterCount)).toEqual([1, 1, 7]);
  });

  it('연결 방식을 바꾸면 나무를 다시 짓는다 — 같은 것을 다시 고르면 안 짓는다', async () => {
    const { events, metrics } = await drive([
      { type: 'set-link', payload: { segmentIndex: 0, value: 0 } },
      { type: 'set-link', payload: { segmentIndex: 1, value: 1 } },
      { type: 'speed', payload: 4 },
      { type: 'set-link', payload: { segmentIndex: 9, value: 9 } },
    ]);
    expect(of<TreePayload>(events, 'tree-built')).toHaveLength(2);
    expect(metrics['merge-count']).toBe(14);
    expect(metrics['distance-count']).toBe(SPEC_DISTANCES[0] + SPEC_DISTANCES[1]);
  });

  it('한 걸음마다 무리 수가 줄고, 자르는 높이를 넘어서면 멈춘다', async () => {
    // 완전 연결 · 높이 2 — 다섯 번째 병합(1.346)까지만 높이 2 아래다.
    const { events } = await drive([{ type: 'set-link', payload: { segmentIndex: 1, value: 1 } }]);
    const merges = events.filter((e) => e.type === 'merge-made');
    const complete = merges.slice(7).map((e) => (e.payload as { clusterCount: number }).clusterCount);
    expect(complete).toEqual([7, 6, 5, 4, 3, 3, 3]);
    // 단일 연결은 끝까지 내려간다.
    const single = merges.slice(0, 7).map((e) => (e.payload as { clusterCount: number }).clusterCount);
    expect(single).toEqual([7, 6, 5, 4, 3, 2, 1]);
  });

  it('메트릭 셋이 배지에 정수로만 찍힌다', async () => {
    const { metrics, shown } = await drive([]);
    expect(metrics['merge-count']).toBe(7);
    expect(metrics['cluster-count']).toBe(1);
    expect(metrics['distance-count']).toBe(SPEC_DISTANCES[0]);
    // 배지는 `String(value)` 를 그대로 찍는다 — 누적 차분이 새면 꼬리가 붙는다.
    expect(shown.filter((v) => !/^[a-z-]+=\d+$/.test(v))).toEqual([]);
  });

  it('발신하는 이벤트 어휘는 머리말에 적은 다섯뿐이다 (C2)', async () => {
    const { events } = await drive(grandTour());
    expect([...new Set(events.map((e) => e.type))].sort()).toEqual([
      'cut-changed',
      'done',
      'merge-made',
      'phase',
      'tree-built',
    ]);
  });

  it('phase 이벤트만 silent 이다', async () => {
    const { events } = await drive([]);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
    expect(events.filter((e) => e.type !== 'phase').every((e) => e.silent !== true)).toBe(true);
  });

  it('merge-made 는 합친 두 무리를 식별자로 짚는다 (C1)', async () => {
    const { events } = await drive([]);
    const targets = events.filter((e) => e.type === 'merge-made').map((e) => e.target);
    expect(targets).toEqual(
      SPEC_TREE[0].map(([into, gone]) => [`cluster:${into}`, `cluster:${gone}`]),
    );
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    // 연결 방식 셋을 다 지나야 link-* 셋이 모두 발신된다.
    const { events } = await drive([
      { type: 'set-link', payload: { segmentIndex: 1, value: 1 } },
      { type: 'set-link', payload: { segmentIndex: 2, value: 2 } },
    ]);
    const emitted = new Set(
      events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(hierarchicalMergeIR)].sort());
    expect([...emitted].sort()).toEqual(PHASES);
  });

  it('한 연결 방식만 돌면 그 방식의 link phase 하나만 나온다', async () => {
    const { events } = await drive([]);
    const emitted = new Set(
      events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    expect(emitted.has('link-single')).toBe(true);
    expect(emitted.has('link-complete')).toBe(false);
    expect(emitted.has('link-average')).toBe(false);
  });
});

describe('IR 을 실제로 돌린다', () => {
  it.each([0, 1, 2])('인터프리터가 mode %i 의 나무를 사양대로 짓는다', (mode) => {
    expect(buildTreeWithIR(mode).map(([a, b, h]) => [a, b, r3(h)])).toEqual(SPEC_TREE[mode]);
  });

  it('IR 과 algorithm 이 같은 수를 낸다 — 반올림 없이 비트까지', async () => {
    const { events } = await drive([
      { type: 'set-link', payload: { segmentIndex: 1, value: 1 } },
      { type: 'set-link', payload: { segmentIndex: 2, value: 2 } },
    ]);
    const trees = of<TreePayload>(events, 'tree-built');
    for (let mode = 0; mode < 3; mode++) {
      const fromIR = buildTreeWithIR(mode);
      const fromAlgo = trees[mode].merges;
      expect(fromAlgo).toHaveLength(7);
      for (let k = 0; k < 7; k++) {
        expect(fromAlgo[k].into).toBe(fromIR[k][0]);
        expect(fromAlgo[k].gone).toBe(fromIR[k][1]);
        expect(fromAlgo[k].height).toBe(fromIR[k][2]);
      }
    }
  });

  it('한 걸음은 member 와 alive 를 제자리에서 갈아 끼운다', () => {
    const d = freshData();
    const x = d.points.map((p) => [p.x, p.y]);
    const member = Array.from({ length: 8 }, (_, i) => i);
    const alive = Array.from({ length: 8 }, () => 1);
    const merged = [0, 0, 0];
    const h = runIR(hierarchicalMergeIR, 'merge_step', [x, member, alive, merged, 0]) as number;
    // a 와 b 가 가장 가깝다 — b 가 a 에 흡수된다.
    expect(r3(h)).toBe(0.919);
    expect(member).toEqual([0, 0, 2, 3, 4, 5, 6, 7]);
    expect(alive).toEqual([1, 0, 1, 1, 1, 1, 1, 1]);
    expect(merged).toEqual([0, 1, h]);
  });

  it('mode 만 갈아 끼우면 첫 걸음은 같고 넷째 걸음부터 갈린다', () => {
    const single = buildTreeWithIR(0);
    const complete = buildTreeWithIR(1);
    // 점 하나끼리는 최솟값도 최댓값도 같은 수다.
    expect(single.slice(0, 2)).toEqual(complete.slice(0, 2));
    expect(single[2]).not.toEqual(complete[2]);
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
    '%s — 줄이 나오고 undefined 가 섞이지 않으며 phase 여덟이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(hierarchicalMergeIR);
      expect(res.lines.length).toBeGreaterThan(30);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual(PHASES);

      const all = res.lines.map((l) => l.code).join('\n');
      // 나무가 갈리는 세 줄. 감싸면 코드 패널이 할 말을 잃는다.
      expect(all).toMatch(/mode == 0\)? (&&|and) \(\(cnt == 0\) (\|\||or) \(d < acc\)\)/);
      expect(all).toMatch(/mode == 1\)? (&&|and) \(\(cnt == 0\) (\|\||or) \(d > acc\)\)/);
      expect(all).toContain('acc = acc + d');
      expect(all).toContain('acc = acc / cnt');
      // 거리는 제곱이 아니라 sqrt 다 — 화면에 높이로 뜨는 값이라서.
      expect(all).toMatch(/sqrt\(\(dx \* dx\) \+ \(dy \* dy\)\)/i);
      // 무리의 소속은 배열 하나로 편다.
      expect(all).toContain('member[p] == i');
      expect(all).toContain('member[q] == j');
      expect(all).toContain('member[p] = bi');
      expect(all).toContain('alive[bj] = 0');
      // 배열을 지어내지 않는다 — 전부 인자로 받는다.
      expect(all).not.toContain('zeros');
      // C# 의 예약어를 피해 결과 인자를 `merged` 로 적었다.
      expect(all).not.toMatch(/\bout\b/);
    },
  );

  it('정적 언어 넷이 2차원 double 배열을 각자의 표기로 낸다', () => {
    const src = (t: (typeof ALL)[number]): string =>
      t.transpile(hierarchicalMergeIR).lines.map((l) => l.code).join('\n');
    expect(src(javaTranspiler)).toContain('double[][] x');
    expect(src(csharpTranspiler)).toContain('double[][] x');
    expect(src(cppTranspiler)).toContain('std::vector<std::vector<double>>& x');
    expect(src(typescriptTranspiler)).toContain('x: number[][]');
    expect(src(typescriptTranspiler)).toContain('member: number[]');
    // 함수가 하나뿐이라 C++ 전방 선언은 붙지 않는다.
    expect(src(cppTranspiler).split('double merge_step').length - 1).toBe(1);
  });
});

describe('Projector 배선', () => {
  it('이벤트를 stage 와 코드 패널의 제 메서드로 옮긴다', async () => {
    const { events } = await drive([
      { type: 'set-link', payload: { segmentIndex: 1, value: 1 } },
      { type: 'set-cut', payload: { segmentIndex: 4, value: 3.5 } },
    ]);

    const trees: Array<{ count: number; link: number }> = [];
    const cuts: Array<{ cutIndex: number; clusterCount: number }> = [];
    const ledger: Array<{ linkIndex: number; cutIndex: number; clusterCount: number }> = [];
    const actives: Array<{ into: number; gone: number } | null> = [];
    const phaseCalls: (string | null)[] = [];
    let scenePoints = 0;
    let captionLines: string[] = [];

    const stage = {
      setScene(scene: { points: unknown[] }) {
        scenePoints = scene.points.length;
      },
      setTree(merges: unknown[], link: number) {
        trees.push({ count: merges.length, link });
      },
      setActivePair(pair: { into: number; gone: number } | null) {
        actives.push(pair);
      },
      setCut(cut: { cutIndex: number; clusterCount: number }) {
        cuts.push({ cutIndex: cut.cutIndex, clusterCount: cut.clusterCount });
      },
      record(row: { linkIndex: number; cutIndex: number; clusterCount: number }) {
        ledger.push(row);
      },
      setCaption(lines: string[]) {
        captionLines = lines;
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

    const projector = hierarchicalProjector({ stage, codePanel });
    projector.onInit?.(hierarchicalFacet.initialData);
    for (const e of events) await projector.onEvent(e);

    expect(scenePoints).toBe(8);
    // 나무 둘 × (한 걸음씩 일곱 + 다 지어진 한 번).
    expect(trees.filter((t) => t.count === 7)).toHaveLength(4);
    expect(trees[trees.length - 1].link).toBe(1);
    expect(actives[actives.length - 1]).toBeNull();
    // 기록장에 셋이 쌓인다 — 지우지 않는 것이 이 완제품의 논증이다.
    expect(ledger).toEqual([
      { linkIndex: 0, cutIndex: 2, clusterCount: 1 },
      { linkIndex: 1, cutIndex: 2, clusterCount: 3 },
      { linkIndex: 1, cutIndex: 4, clusterCount: 3 },
    ]);
    expect(cuts[cuts.length - 1]).toEqual({ cutIndex: 4, clusterCount: 3 });
    // 단일의 여섯 + 완전으로 갈아탄 뒤의 link-complete.
    expect(new Set(phaseCalls.filter((p): p is string => p !== null)).size).toBe(7);
    expect(phaseCalls[phaseCalls.length - 1]).toBeNull();
    expect(captionLines).toHaveLength(2);
    expect(captionLines[0]).toContain('3.5');
    expect(captionLines[0]).toContain('3');
  });
});

describe('마운트와 조작', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  function mountFacet(): {
    host: HTMLElement;
    handle: ReturnType<typeof runFacet>;
    phases: string[];
  } {
    const phases: string[] = [];
    const fakeCodeView: View = {
      mount(container: HTMLElement) {
        const node = document.createElement('div');
        container.appendChild(node);
        return {
          destroy() {
            node.remove();
          },
          highlightPhase(phase: string | null) {
            if (phase) phases.push(phase);
          },
          clearHighlight() {},
        };
      },
    };
    registerHierarchical();
    registerView('code-view', fakeCodeView);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(hierarchicalFacet, host, { locale: 'en' });
    handle.setSpeed(8);
    return { host, handle, phases };
  }

  const stageTexts = (host: HTMLElement): string[] =>
    [...host.querySelectorAll('svg text')].map((t) => t.textContent ?? '');

  const cellText = (host: HTMLElement, cell: string): string =>
    host.querySelector(`[data-cell="${cell}"]`)?.textContent ?? '';

  const metricText = (host: HTMLElement, name: string): string => {
    const badge = host.querySelector(`.facet-control-bar__metric--${name}`);
    return badge?.lastElementChild?.textContent ?? '';
  };

  const sliderSegments = (host: HTMLElement, which: number): HTMLElement[] => {
    const tracks = [...host.querySelectorAll('[role="slider"]')] as HTMLElement[];
    return [...tracks[which].querySelectorAll('[data-seg-index]')] as HTMLElement[];
  };

  async function waitFor(check: () => boolean, ms = 20_000): Promise<void> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline && !check()) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  it('캔버스가 붙고 세로가 변하지 않으며 화면의 수가 알고리즘이 셈한 값이다', async () => {
    const { host, handle, phases } = mountFacet();
    const svgEl = host.querySelector('svg');
    expect(svgEl).not.toBeNull();
    const box = svgEl?.getAttribute('viewBox');
    expect(box).toBe('0 0 620 392');
    // mount 직후에도 점 여덟이 이미 그려져 있다.
    expect(host.querySelectorAll('svg circle').length).toBeGreaterThanOrEqual(8);

    // 자동 시연의 마지막 걸음에서도 'clusters: 1' 이 잠깐 뜨므로, 답이 기록표에
    // 들어온 것을 기다린다.
    await waitFor(() => cellText(host, '0-2') === '1');
    const texts = stageTexts(host);
    // 자르는 높이와 그 높이에서의 답.
    expect(texts).toContain('h = 2.0');
    expect(texts).toContain('clusters: 1');
    // 마지막 병합의 높이 — 단일 연결은 1.981 에서 전부가 하나가 된다.
    expect(texts).toContain('1.981');
    expect(texts).toContain('0.919');
    expect(metricText(host, 'merge-count')).toBe('7');
    expect(metricText(host, 'cluster-count')).toBe('1');
    expect(metricText(host, 'distance-count')).toBe('164');
    // 기록표의 단일 · 높이 2 칸에 답이 들어왔다.
    expect(cellText(host, '0-2')).toBe('1');
    expect(cellText(host, '1-2')).toBe('·');

    expect(svgEl?.getAttribute('viewBox')).toBe(box);
    expect([...new Set(phases)].sort()).toEqual([
      'link-single',
      'merge',
      'pick-closest',
      'point-pair',
      'report',
      'scan-pairs',
    ]);
    expect(errorSpy).not.toHaveBeenCalled();

    handle.destroy();
    expect(host.childElementCount).toBe(0);
    host.remove();
  }, 40_000);

  it('연결 방식을 옮기면 나무가 다시 서고 앞서 본 답이 남는다', async () => {
    const { host, handle } = mountFacet();
    await waitFor(() => cellText(host, '0-2') === '1');

    const links = sliderSegments(host, 0);
    expect(links).toHaveLength(3);
    links[1].dispatchEvent(new Event('click', { bubbles: true }));
    await waitFor(() => stageTexts(host).includes('clusters: 3'));

    const texts = stageTexts(host);
    // 완전 연결의 뿌리는 6.521 이다.
    expect(texts).toContain('6.521');
    expect(texts).toContain('h = 2.0');
    expect(metricText(host, 'cluster-count')).toBe('3');
    expect(metricText(host, 'merge-count')).toBe('14');
    // 앞서 본 칸을 지우지 않는다 — 그것이 견줌이다.
    expect(cellText(host, '0-2')).toBe('1');
    expect(cellText(host, '1-2')).toBe('3');

    links[2].dispatchEvent(new Event('click', { bubbles: true }));
    await waitFor(() => cellText(host, '2-2') === '3');
    expect([cellText(host, '0-2'), cellText(host, '1-2'), cellText(host, '2-2')]).toEqual([
      '1',
      '3',
      '3',
    ]);
    expect(errorSpy).not.toHaveBeenCalled();

    handle.destroy();
    host.remove();
  }, 40_000);

  it('자르는 높이를 옮기면 같은 나무에서 답만 갈아 끼워진다', async () => {
    const { host, handle } = mountFacet();
    await waitFor(() => cellText(host, '0-2') === '1');

    const links = sliderSegments(host, 0);
    links[2].dispatchEvent(new Event('click', { bubbles: true }));
    await waitFor(() => cellText(host, '2-2') === '3');
    expect(metricText(host, 'merge-count')).toBe('14');

    const cuts = sliderSegments(host, 1);
    expect(cuts).toHaveLength(6);
    cuts[4].dispatchEvent(new Event('click', { bubbles: true }));
    await waitFor(() => cellText(host, '2-4') === '2');
    // 나무를 다시 짓지 않았다.
    expect(metricText(host, 'merge-count')).toBe('14');
    expect(stageTexts(host)).toContain('h = 3.5');
    expect(stageTexts(host)).toContain('clusters: 2');
    expect(metricText(host, 'cluster-count')).toBe('2');

    cuts[0].dispatchEvent(new Event('click', { bubbles: true }));
    await waitFor(() => cellText(host, '2-0') === '7');
    expect(metricText(host, 'merge-count')).toBe('14');
    expect(errorSpy).not.toHaveBeenCalled();

    handle.destroy();
    host.remove();
  }, 40_000);
});
