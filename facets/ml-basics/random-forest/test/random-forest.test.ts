// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import type {
  FacetContext,
  FacetRuntimeEvent,
  IR,
  IRStmt,
  ReactiveContext,
  ReactiveInputEvent,
  View,
} from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
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
  randomForest,
  randomForestFacet,
  randomForestVoteIR,
  growRandomForest,
  cellCenter,
  registerRandomForest,
  type FlatTree,
  type ForestPoint,
  type RandomForestData,
} from '../src/index.js';

const DATA = randomForestFacet.initialData as unknown as RandomForestData;
const POINTS: ForestPoint[] = DATA.points;

/** 사양의 나무별 대조 — [뽑힌 서로 다른 자리, 남은 것, 잎 수, 훈련 정확도]. */
const SPEC_TREES: number[][] = [
  [12, 6, 7, 16],
  [12, 6, 5, 16],
  [11, 7, 6, 17],
  [9, 9, 3, 11],
  [11, 7, 4, 17],
  [16, 2, 10, 16],
  [10, 8, 6, 14],
  [11, 7, 5, 14],
  [11, 7, 5, 14],
  [10, 8, 5, 13],
  [11, 7, 4, 16],
  [11, 7, 6, 16],
  [11, 7, 3, 15],
  [12, 6, 6, 14],
  [14, 4, 7, 16],
  [12, 6, 4, 16],
];

/** 사양의 숲 크기별 대조 — 크기 → [표가 갈리는 칸, 맞힌 수]. */
const SPEC_FOREST: Array<[number, number, number]> = [
  [1, 0, 16],
  [2, 149, 16],
  [4, 541, 15],
  [8, 688, 17],
  [16, 814, 18],
];

const PHASES = [
  'ask-split',
  'cast-vote',
  'enter-root',
  'go-left',
  'go-right',
  'majority',
  'pick-tree',
  'reset-tally',
  'walk-down',
];

function phasesOfStmts(stmts: IRStmt[], out: Set<string>): void {
  for (const s of stmts) {
    if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
    if (s.kind === 'if') {
      phasesOfStmts(s.then, out);
      if (s.else) phasesOfStmts(s.else, out);
    } else if (s.kind === 'for-range' || s.kind === 'while') {
      phasesOfStmts(s.body, out);
    }
  }
}

function phasesOfIR(ir: IR): string[] {
  const out = new Set<string>();
  for (const f of ir.functions) phasesOfStmts(f.body, out);
  return [...out].sort();
}

/** IR 이 받는 모양 그대로 숲을 편다 — 나무 색인 × 노드 색인. */
function irArgs(trees: FlatTree[]): {
  feature: number[][];
  threshold: number[][];
  left: number[][];
  right: number[][];
  label: number[][];
} {
  return {
    feature: trees.map((t) => t.feature),
    threshold: trees.map((t) => t.threshold),
    left: trees.map((t) => t.left),
    right: trees.map((t) => t.right),
    label: trees.map((t) => t.label),
  };
}

type Driven = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
  phases: string[];
};

/**
 * 알고리즘을 검사 안에서 직접 굴린다. `sleep` 은 곧바로 돌아오고, 줄 입력이
 * 떨어지면 `waitForInput` 이 취소로 끝낸다 — reactive 알고리즘은 스스로
 * 끝나지 않으므로 끝을 검사가 정해야 한다.
 */
async function drive(inputs: ReactiveInputEvent[]): Promise<Driven> {
  const data = JSON.parse(JSON.stringify(DATA)) as RandomForestData;
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const queue = [...inputs];
  let cancelled = false;

  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return !cancelled;
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
  } as unknown as ReactiveContext<RandomForestData>;

  try {
    await randomForest(ctx as unknown as FacetContext<RandomForestData>);
  } catch (err) {
    if ((err as Error).message !== 'cancelled') throw err;
  }

  const phases: string[] = [];
  for (const e of events) {
    if (e.type !== 'phase') continue;
    const p = (e.payload as { phase?: unknown }).phase;
    if (typeof p === 'string') phases.push(p);
  }
  return { events, metrics, phases };
}

describe('숲을 기른다', () => {
  it('나무별 대조가 사양과 맞는다', () => {
    const { stats } = growRandomForest(POINTS, DATA.seed, DATA.treeCount);
    expect(stats.map((s) => [s.distinct, s.outOfBag, s.leaves, s.correct])).toEqual(SPEC_TREES);
    // 남은 것은 뽑힌 수의 나머지다 — 대조표를 그대로 옮겨 적지 않았는지 본다.
    for (const s of stats) expect(s.distinct + s.outOfBag).toBe(POINTS.length);
  });
});

describe('IR 을 실제로 돌린다', () => {
  it('격자 1024 칸과 훈련 점 열여덟에서 사양의 대조를 낸다', () => {
    const { trees } = growRandomForest(POINTS, DATA.seed, DATA.treeCount);
    const { feature, threshold, left, right, label } = irArgs(trees);
    const grid = DATA.gridSize;
    const planeMax = DATA.planeMax;

    const call = (n: number, qx: number, qy: number): { answer: number; a: number; b: number } => {
      const tally = [0, 0];
      const answer = runIR(randomForestVoteIR, 'forestPredict', [
        feature as unknown as Value,
        threshold as unknown as Value,
        left as unknown as Value,
        right as unknown as Value,
        label as unknown as Value,
        [qx, qy] as unknown as Value,
        n,
        tally as unknown as Value,
      ]);
      return { answer: answer as number, a: tally[0]!, b: tally[1]! };
    };

    for (const [n, specSplit, specCorrect] of SPEC_FOREST) {
      let split = 0;
      for (let gy = 0; gy < grid; gy += 1) {
        for (let gx = 0; gx < grid; gx += 1) {
          const r = call(n, cellCenter(gx, grid, planeMax), cellCenter(gy, grid, planeMax));
          expect(r.a + r.b).toBe(n);
          if (r.a > 0 && r.b > 0) split += 1;
        }
      }
      let correct = 0;
      for (const p of POINTS) {
        if (call(n, p.x, p.y).answer === p.label) correct += 1;
      }
      expect([n, split, correct]).toEqual([n, specSplit, specCorrect]);
    }
  }, 60_000);

  it('나무 하나는 어디서나 만장일치다', () => {
    const { trees } = growRandomForest(POINTS, DATA.seed, DATA.treeCount);
    const { feature, threshold, left, right, label } = irArgs(trees);
    let unanimous = 0;
    for (let gy = 0; gy < DATA.gridSize; gy += 1) {
      for (let gx = 0; gx < DATA.gridSize; gx += 1) {
        const tally = [0, 0];
        runIR(randomForestVoteIR, 'forestPredict', [
          feature as unknown as Value,
          threshold as unknown as Value,
          left as unknown as Value,
          right as unknown as Value,
          label as unknown as Value,
          [
            cellCenter(gx, DATA.gridSize, DATA.planeMax),
            cellCenter(gy, DATA.gridSize, DATA.planeMax),
          ] as unknown as Value,
          1,
          tally as unknown as Value,
        ]);
        if (tally[0] === 0 || tally[1] === 0) unanimous += 1;
      }
    }
    expect(unanimous).toBe(DATA.gridSize * DATA.gridSize);
  }, 30_000);
});

describe('여섯 언어', () => {
  const transpilers = [
    pythonTranspiler,
    javascriptTranspiler,
    typescriptTranspiler,
    javaTranspiler,
    cppTranspiler,
    csharpTranspiler,
  ];

  it('undefined 없이 나오고 줄 수가 말이 된다', () => {
    for (const t of transpilers) {
      const result = t.transpile(randomForestVoteIR);
      const code = result.lines.map((l) => l.code).join('\n');
      expect(code, t.id).not.toContain('undefined');
      expect(result.lines.length, t.id).toBeGreaterThanOrEqual(14);
      expect(result.lines.length, t.id).toBeLessThanOrEqual(24);
      expect(code, t.id).toContain('forestPredict');
      // 표 칸의 자리 번호가 곧 잎 표시라는 마지막 줄이 여섯 언어에 다 있어야 한다.
      expect(code, t.id).toContain('tally[label[t][node]]');
      // 이름 붙인 호출로 감싸지 않았다 — 갈래를 고르는 셈이 펴진 채로 나온다.
      expect(code, t.id).toContain('q[feature[t][node]]');
    }
  });

  it('정적 타입 언어는 2차원 배열 표기를 낸다', () => {
    expect(javaTranspiler.transpile(randomForestVoteIR).lines[0]!.code).toContain('double[][] threshold');
    expect(csharpTranspiler.transpile(randomForestVoteIR).lines[0]!.code).toContain('int[][] feature');
    expect(cppTranspiler.transpile(randomForestVoteIR).lines[0]!.code).toContain(
      'std::vector<std::vector<double>>& threshold',
    );
    expect(typescriptTranspiler.transpile(randomForestVoteIR).lines[0]!.code).toContain(
      'threshold: number[][]',
    );
  });

  it('phase 가 줄마다 붙는다', () => {
    for (const t of transpilers) {
      const labelled = t.transpile(randomForestVoteIR).lines.filter((l) => l.phase !== null);
      expect(labelled.length, t.id).toBeGreaterThan(8);
    }
  });
});

describe('phase 대조', () => {
  it('IR 의 phase 집합이 알고리즘이 보내는 것과 같다', async () => {
    const fromIR = phasesOfIR(randomForestVoteIR);
    const run = await drive([]);
    const fromAlgorithm = [...new Set(run.phases)].sort();
    expect(fromIR).toEqual(PHASES);
    expect(fromAlgorithm).toEqual(PHASES);
  }, 30_000);
});

describe('슬라이더가 논증을 진다', () => {
  it('숲 크기를 1 로 내리면 갈리는 칸이 0 이 되고 맞힌 수가 16 이 된다', async () => {
    const run = await drive([{ type: 'forest-size', payload: { value: 1 } }]);
    expect(run.metrics['tree-count']).toBe(DATA.treeCount);
    expect(run.metrics['split-cell-count']).toBe(0);
    expect(run.metrics['correct-count']).toBe(16);

    const fields = run.events.filter((e) => e.type === 'field-changed');
    const last = fields[fields.length - 1]!.payload as { size: number; votesA: number[] };
    expect(last.size).toBe(1);
    // 한 그루면 칸마다 표가 0 아니면 1 이다 — 갈릴 자리가 없다.
    expect([...new Set(last.votesA)].sort()).toEqual([0, 1]);

    const verdicts = run.events.filter((e) => e.type === 'vote-result');
    const final = verdicts[verdicts.length - 1]!.payload as { votesA: number; votesB: number };
    expect(final.votesA + final.votesB).toBe(1);
  }, 30_000);

  it('1 막이 끝나면 물음점의 표가 8 대 8 로 갈린다', async () => {
    const run = await drive([]);
    const verdicts = run.events.filter((e) => e.type === 'vote-result');
    expect(verdicts.length).toBe(1);
    const p = verdicts[0]!.payload as { votesA: number; votesB: number; label: number };
    expect([p.votesA, p.votesB]).toEqual([8, 8]);
    // 동점이면 앞엣것 — IR 의 `tally[1] > tally[0]` 이 그렇게 갈랐다.
    expect(p.label).toBe(0);
  }, 30_000);

  it('나무가 자라는 동안 갈리는 칸이 0 에서 늘어난다', async () => {
    const run = await drive([]);
    const splits = run.events
      .filter((e) => e.type === 'field-changed')
      .map((e) => (e.payload as { splitCells: number }).splitCells);
    expect(splits[0]).toBe(0);
    expect(splits[1]).toBe(149);
    expect(splits[splits.length - 1]).toBe(814);
  }, 30_000);
});

describe('마운트와 재생', () => {
  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
  });

  it('캔버스가 붙어 있고 세로가 변하지 않으며 화면의 수가 셈한 값이다', async () => {
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
    registerRandomForest();
    registerView('code-view', fakeCodeView);

    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((a) => String(a)).join(' '));
    };

    const host = document.createElement('div');
    document.body.appendChild(host);
    let handle;
    try {
      handle = runFacet(randomForestFacet, host);
      handle.setSpeed(60);

      const svg = host.querySelector('svg');
      expect(svg).not.toBeNull();
      const box = svg!.getAttribute('viewBox');
      expect(box).toBe('0 0 680 400');
      // 격자 1024 칸이 마운트에서 한 번 만들어진다.
      expect(host.querySelectorAll('svg rect').length).toBeGreaterThan(1024);

      const deadline = Date.now() + 40_000;
      while (Date.now() < deadline) {
        const texts = [...host.querySelectorAll('svg text')].map((t) => t.textContent ?? '');
        if (texts.some((t) => t.startsWith('16 trees say'))) break;
        await new Promise((r) => setTimeout(r, 40));
      }

      // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
      expect(svg!.getAttribute('viewBox')).toBe(box);
      expect([...new Set(seenPhases)].sort()).toEqual(PHASES);

      const texts = [...host.querySelectorAll('svg text')].map((t) => t.textContent ?? '');
      // 화면의 수는 알고리즘이 셈한 것이다 — 8 대 8 도 마지막 나무의 통계도.
      expect(texts).toContain('16 trees say A (8 to 8)');
      expect(texts).toContain('tree 16: 12 rows drawn, 6 left out, 4 leaves');
      expect(texts).toContain('looking at 16 of 16 trees');
      expect(errors).toEqual([]);
    } finally {
      console.error = original;
      handle?.destroy();
      host.remove();
    }
    expect(host.querySelectorAll('svg').length).toBe(0);
  }, 60_000);

  it('슬라이더를 1 로 옮기면 화면이 실제로 바뀐다', async () => {
    const fakeCodeView: View = {
      mount(container: HTMLElement) {
        const node = document.createElement('div');
        container.appendChild(node);
        return { destroy() { node.remove(); }, highlightPhase() {}, clearHighlight() {} };
      },
    };
    registerRandomForest();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(randomForestFacet, host);
    handle.setSpeed(60);

    const svgTexts = (): string[] =>
      [...host.querySelectorAll('svg text')].map((t) => t.textContent ?? '');
    const waitFor = async (want: (texts: string[]) => boolean): Promise<void> => {
      const deadline = Date.now() + 40_000;
      while (Date.now() < deadline && !want(svgTexts())) {
        await new Promise((r) => setTimeout(r, 40));
      }
    };

    await waitFor((t) => t.includes('looking at 16 of 16 trees'));
    expect(svgTexts()).toContain('looking at 16 of 16 trees');

    // 컨트롤바의 실제 경로로 누른다 — 위젯 → onAction → mechanism → 알고리즘.
    const first = host.querySelector('[data-seg-index="0"]');
    expect(first).not.toBeNull();
    (first as HTMLElement).click();

    await waitFor((t) => t.includes('looking at 1 of 16 trees'));
    const after = svgTexts();
    expect(after).toContain('looking at 1 of 16 trees');
    // 화면의 수는 알고리즘이 셈한 것이다 — 갈리는 칸 0, 적중 16.
    expect(after).toContain('One tree — sure everywhere. Split cells: 0 of 1024. Right on 16 of 18.');

    // 나무 하나면 밭이 고르게 짙다 — 짙기가 한 값뿐이라 옅은 띠가 없다.
    const cellOpacity = (): number[] => [
      ...new Set(
        [...host.querySelectorAll('svg .facet-rf-field rect')].map((r) =>
          Number(r.getAttribute('fill-opacity')),
        ),
      ),
    ];
    expect(cellOpacity()).toEqual([0.9]);

    handle.destroy();
    host.remove();
  }, 60_000);
});
