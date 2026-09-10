// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FacetContext, FacetRuntimeEvent, IR, IRStmt, View } from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  getColors,
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
  countCorrect,
  decisionTree,
  decisionTreeFacet,
  decisionTreeGrowIR,
  decisionTreeProjector,
  growDecisionTree,
  registerDecisionTree,
  summarize,
  type DecisionTreeData,
  type LabeledPoint,
  type TreeNodeShape,
} from '../src/index.js';

/** facet 선언에 박힌 점 열여덟을 그대로 읽어 온다 — 검사가 자료를 따로 들지 않는다. */
const POINTS = (decisionTreeFacet.initialData as unknown as { points: LabeledPoint[] }).points;

/** 사양의 대조 — 깊이 상한별 (맞힌 수, 잎 수, 시험한 후보 수). */
const SPEC_BY_DEPTH: Array<[depth: number, correct: number, leaves: number, cuts: number]> = [
  [1, 13, 2, 19],
  [2, 15, 3, 34],
  [3, 17, 4, 45],
  [4, 17, 5, 51],
  [5, 18, 6, 53],
];

/** 사양의 대조 — 탐욕적으로 기른 나무의 왼쪽 등뼈. */
const SPEC_SPINE: Array<[axis: 0 | 1, cut: number, wgini: number, drop: number]> = [
  [0, 5, 0.357, 0.143],
  [1, 3.25, 0.268, 0.191],
  [0, 2.5, 0.188, 0.281],
  [0, 1.45, 0.25, 0.125],
  [0, 1.2, 0, 0.5],
];

const PHASES = [
  'depth-check',
  'impurity',
  'keep-best',
  'leaf',
  'node-open',
  'partition',
  'recurse',
  'sort-axis',
  'split',
  'try-cut',
];

const ALL_TRANSPILERS = [
  pythonTranspiler,
  javascriptTranspiler,
  typescriptTranspiler,
  javaTranspiler,
  cppTranspiler,
  csharpTranspiler,
];

// ── IR 을 실제로 돌리는 껍데기 ────────────────────────────────────────────

type IRTree = { used: number; feature: number[]; threshold: number[]; left: number[]; right: number[] };

/**
 * IR 의 `growTree` 를 인터프리터로 돌린다.
 *
 * 배열 넷과 색인 배열은 전부 **여기서 만들어 넘긴다** — IR 안에 `zeros` 가
 * 없는 것이 그 뜻이다.
 */
function runGrowIR(points: LabeledPoint[], depthLimit: number): IRTree {
  const n = points.length;
  const slots = 2 * n;
  const feature = new Array<number>(slots).fill(0);
  const threshold = new Array<number>(slots).fill(0);
  const left = new Array<number>(slots).fill(0);
  const right = new Array<number>(slots).fill(0);
  const args: Value[] = [
    [points.map((p) => p.x), points.map((p) => p.y)],
    points.map((p) => p.label),
    points.map((_, i) => i),
    0,
    n,
    0,
    depthLimit,
    0,
    feature,
    threshold,
    left,
    right,
  ];
  const used = runIR(decisionTreeGrowIR, 'growTree', args) as number;
  return { used, feature, threshold, left, right };
}

/** IR 이 채운 배열 넷으로 점을 떨어뜨려 맞힌 수를 센다. */
function correctFromArrays(points: LabeledPoint[], t: IRTree): number {
  let ok = 0;
  for (const p of points) {
    let i = 0;
    while (t.left[i] >= 0) {
      i = (t.feature[i] === 0 ? p.x : p.y) < t.threshold[i] ? t.left[i] : t.right[i];
    }
    // 잎의 이름표는 left 자리에 `-1 - 이름표` 로 접혀 있다.
    if (-t.left[i] - 1 === p.label) ok += 1;
  }
  return ok;
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

// ── 알고리즘을 굴리는 껍데기 ──────────────────────────────────────────────

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

/**
 * 반응형 algorithm 을 검사에서 굴린다.
 *
 * 줄 것이 떨어지면 `waitForInput` 이 취소로 깨워 algorithm 이 스스로 끝난다 —
 * 러너의 `destroy()` 가 하는 일과 같은 모양이다.
 */
async function drive(
  inputs: Array<{ type: string; payload?: unknown }>,
  depthLimit?: number,
): Promise<Recorded> {
  const data: DecisionTreeData = {
    type: 'decision-tree',
    points: POINTS.map((p) => ({ ...p })),
    depthChoices: [1, 2, 3, 4, 5],
    initialDepthLimit: depthLimit ?? 3,
    timings: { scanMs: 0, structureMs: 0 },
  };
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
    async waitForInput() {
      const next = queue.shift();
      if (next) return next;
      cancelled = true;
      throw new Error('cancelled');
    },
    pollInput() {
      return queue.shift() ?? null;
    },
    async sleep() {
      return !cancelled;
    },
  };
  await decisionTree(ctx as unknown as FacetContext<DecisionTreeData>);
  return { events, metrics };
}

function payloadsOf<T>(events: FacetRuntimeEvent[], type: string): T[] {
  return events.filter((e) => e.type === type).map((e) => e.payload as T);
}

// ── 1. IR 을 실제로 돌린다 ────────────────────────────────────────────────

describe('IR 을 실제로 돌린다', () => {
  it.each(SPEC_BY_DEPTH)(
    '깊이 상한 %i 에서 맞힌 수 %i · 잎 %i (사양의 대조)',
    (depth, correct, leaves) => {
      const t = runGrowIR(POINTS, depth);
      expect(correctFromArrays(POINTS, t)).toBe(correct);
      let leafCount = 0;
      for (let i = 0; i < t.used; i++) if (t.left[i] < 0) leafCount += 1;
      expect(leafCount).toBe(leaves);
      // 배열 넷은 전위 순서로 빈틈없이 채워진다.
      expect(t.used).toBe(2 * leaves - 1);
    },
  );

  it('왼쪽 등뼈의 (축, 자름값) 다섯이 사양과 같다', () => {
    const t = runGrowIR(POINTS, 5);
    let i = 0;
    for (const [axis, cut] of SPEC_SPINE) {
      expect(t.feature[i]).toBe(axis);
      expect(t.threshold[i]).toBeCloseTo(cut, 6);
      i = t.left[i];
    }
    // 등뼈 끝은 잎이고 이름표 A 가 접혀 있다 (-1 - 0).
    expect(t.left[i]).toBe(-1);
  });

  it('깊이 상한을 6 으로 올려도 5 와 같은 나무다 — 되풀이가 스스로 멈춘다', () => {
    const five = runGrowIR(POINTS, 5);
    const six = runGrowIR(POINTS, 6);
    expect(six.used).toBe(five.used);
    expect(six.left.slice(0, six.used)).toEqual(five.left.slice(0, five.used));
    expect(six.threshold.slice(0, six.used)).toEqual(five.threshold.slice(0, five.used));
  });

  it('IR 이 채운 배열 넷과 algorithm 이 기른 나무가 글자 하나 다르지 않다', () => {
    for (const [depth] of SPEC_BY_DEPTH) {
      const t = runGrowIR(POINTS, depth);
      const { nodes } = growDecisionTree(POINTS, depth);
      expect(nodes.length).toBe(t.used);
      for (const n of nodes) {
        if (n.leaf) {
          expect(t.left[n.id]).toBe(-1 - n.label);
        } else {
          expect(t.feature[n.id]).toBe(n.axis);
          expect(t.threshold[n.id]).toBeCloseTo(n.cut, 9);
          expect(t.left[n.id]).toBe(n.left);
          expect(t.right[n.id]).toBe(n.right);
        }
      }
    }
  });
});

// ── 2. 여섯 언어로 낸다 ───────────────────────────────────────────────────

describe('여섯 언어 emit (S-transpiler)', () => {
  it.each(ALL_TRANSPILERS.map((t) => [t.id, t] as const))(
    '%s — undefined 가 없고 phase 열이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(decisionTreeGrowIR);
      expect(res.lines.length).toBeGreaterThan(40);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual(PHASES);

      const all = res.lines.map((l) => l.code).join('\n');
      // 재귀가 이 IR 의 존재 이유다 — 진입점이 자기 이름을 두 번 부른다.
      // (정의 한 줄 + 스스로를 부르는 두 줄 = 이름이 세 번 나온다.)
      expect(all.split('growTree(').length - 1).toBe(3);
      expect(all).toContain('growTree(points, label, order, lo, mid, depth + 1');
      expect(all).toContain('growTree(points, label, order, mid, hi, depth + 1');
      // 지니는 감싸지 않고 펼쳐 쓴다. 세 자리에 같은 모양이 나온다.
      expect(all).toContain('(1 - (pa * pa)) - (pb * pb)');
      expect(all).toContain('(1 - (pla * pla)) - (plb * plb)');
      expect(all).toContain('(1 - (pra * pra)) - (prb * prb)');
      // 2차원 첨자와 색인 배열의 이중 참조.
      expect(all).toContain('points[axis][order[k]]');
      // 잎의 이름표는 left 자리에 접힌다.
      expect(all).toContain('left[me] = -2');
      // 없는 이름을 지어내지 않았다.
      expect(all).not.toContain('zeros');
    },
  );

  it('정적 언어 넷이 2차원 실수 표를 각자의 표기로 낸다', () => {
    const of = (t: (typeof ALL_TRANSPILERS)[number]) =>
      t.transpile(decisionTreeGrowIR).lines.map((l) => l.code).join('\n');
    expect(of(javaTranspiler)).toContain('double[][] points');
    expect(of(csharpTranspiler)).toContain('double[][] points');
    expect(of(cppTranspiler)).toContain('std::vector<std::vector<double>>& points');
    expect(of(typescriptTranspiler)).toContain('number[][]');
    // 세는 값도 실수로 잡는다 — 정수 나눗셈이면 비율이 0 으로 눌린다.
    expect(of(javaTranspiler)).toContain('double a = 0');
    expect(of(cppTranspiler)).toContain('double lc = 0');
  });

  it('함수가 하나뿐이라 C++ 전방 선언이 붙지 않는다', () => {
    const lines = cppTranspiler.transpile(decisionTreeGrowIR).lines.map((l) => l.code);
    expect(decisionTreeGrowIR.functions).toHaveLength(1);
    expect(lines.filter((c) => c.endsWith(');') && c.startsWith('int growTree('))).toEqual([]);
  });
});

// ── 3. phase 대조 ─────────────────────────────────────────────────────────

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const { events } = await drive([]);
    const emitted = new Set(
      events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(decisionTreeGrowIR)].sort());
    expect([...emitted].sort()).toEqual(PHASES);
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const { events } = await drive([]);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

// ── 알고리즘이 셈한 값 ────────────────────────────────────────────────────

describe('탐욕적으로 기르는 나무', () => {
  it.each(SPEC_BY_DEPTH)(
    '깊이 상한 %i — 맞힌 수 %i · 잎 %i · 시험한 후보 %i',
    (depth, correct, leaves, cuts) => {
      const grown = growDecisionTree(POINTS, depth);
      const s = summarize(POINTS, depth, grown.nodes);
      expect(s.correct).toBe(correct);
      expect(s.leafCount).toBe(leaves);
      expect(grown.candidates).toBe(cuts);
      expect(s.total).toBe(18);
    },
  );

  it('뿌리의 지니는 0.5 이고 등뼈의 가중 지니가 사양과 같다', () => {
    const { nodes } = growDecisionTree(POINTS, 5);
    expect(nodes[0].gini).toBeCloseTo(0.5, 6);
    let i = 0;
    for (const [axis, cut, wgini, drop] of SPEC_SPINE) {
      expect(nodes[i].axis).toBe(axis);
      expect(nodes[i].cut).toBeCloseTo(cut, 6);
      // 사양의 대조는 소수 셋째 자리에서 반올림된 값이라 그 자리까지만 견준다.
      expect(nodes[i].wgini).toBeCloseTo(wgini, 2);
      expect(nodes[i].drop).toBeCloseTo(drop, 2);
      i = nodes[i].left;
    }
  });

  it('깊이 4 는 3 보다 잎이 하나 많은데 맞히는 수는 그대로다', () => {
    const three = summarize(POINTS, 3, growDecisionTree(POINTS, 3).nodes);
    const four = summarize(POINTS, 4, growDecisionTree(POINTS, 4).nodes);
    expect(four.leafCount).toBe(three.leafCount + 1);
    expect(four.correct).toBe(three.correct);
    expect(four.verdictKey).toBe('verdict.noGain');
  });

  it('깊이 5 의 마지막 두 질문은 점 하나만을 위한 것이다', () => {
    const { nodes } = growDecisionTree(POINTS, 5);
    const s = summarize(POINTS, 5, nodes);
    expect(s.correct).toBe(18);
    expect(s.verdictKey).toBe('verdict.onePoint');
    const singletons = nodes.filter((n) => n.leaf && n.a + n.b === 1);
    // 잡음점 하나와 그 짝 하나 — 마지막 자름 `x < 1.2` 가 낳은 잎 둘이다.
    expect(singletons).toHaveLength(2);
    const noise = POINTS.find((p) => p.x === 1.4 && p.y === 1.6);
    expect(noise?.label).toBe(1);
    // 깊이 4 까지는 그 잡음점을 틀리고, 5 에서만 맞힌다.
    expect(countCorrect(growDecisionTree(POINTS, 4).nodes, [noise as LabeledPoint])).toBe(0);
    expect(countCorrect(nodes, [noise as LabeledPoint])).toBe(1);
  });

  it('깊이 1 · 2 · 3 은 물을수록 늘어난다', () => {
    const of = (d: number) => summarize(POINTS, d, growDecisionTree(POINTS, d).nodes);
    expect(of(1).verdictKey).toBe('verdict.gain');
    expect(of(2).verdictKey).toBe('verdict.gain');
    expect(of(3).verdictKey).toBe('verdict.gain');
  });
});

describe('메트릭과 조작', () => {
  it('한 호흡 다 돌면 메트릭 셋이 그 깊이의 셈과 같아진다', async () => {
    const { events, metrics } = await drive([]);
    expect(metrics['candidate-count']).toBe(45);
    expect(metrics['leaf-count']).toBe(4);
    expect(metrics['correct-count']).toBe(17);
    const done = payloadsOf<{ correct: number; leafCount: number; depthLimit: number }>(
      events,
      'done',
    );
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ depthLimit: 3, leafCount: 4, correct: 17 });
  });

  it('깊이 슬라이더를 옮기면 다시 셈해 나무를 통째로 갈아 끼운다', async () => {
    const { events, metrics } = await drive([{ type: 'depth', payload: { value: 5 } }]);
    const snap = payloadsOf<{ depthLimit: number; correct: number; nodes: TreeNodeShape[] }>(
      events,
      'tree-snapshot',
    );
    expect(snap).toHaveLength(1);
    expect(snap[0].depthLimit).toBe(5);
    expect(snap[0].correct).toBe(18);
    expect(snap[0].nodes).toHaveLength(11);
    // 재생을 처음부터 돌린 것이 아니라 다 자란 나무를 보인 것이다.
    expect(events.filter((e) => e.type === 'node-open')).toHaveLength(0);
    expect(metrics['candidate-count']).toBe(53);
    expect(metrics['leaf-count']).toBe(6);
    expect(metrics['correct-count']).toBe(18);
  });

  it('슬라이더 값이 눈금 밖이면 눈금 안으로 눌러 담는다', async () => {
    const { events } = await drive([{ type: 'depth', payload: { value: 42 } }]);
    expect(payloadsOf<{ depthLimit: number }>(events, 'tree-snapshot')[0].depthLimit).toBe(5);
  });

  it('재생 어휘는 알고리즘이 알지 못한다 — 메커니즘의 것이다', async () => {
    // 재생·멈춤·한 걸음이 알고리즘에 흘러들어도 아무 일이 없어야 한다.
    // 그 셋을 스스로 들고 있으면 메커니즘의 상태와 둘로 갈린다.
    const bare = await drive([]);
    const noisy = await drive([{ type: 'play' }, { type: 'pause' }, { type: 'step' }]);
    expect(noisy.metrics).toEqual(bare.metrics);
    expect(noisy.events.map((e) => e.type)).toEqual(bare.events.map((e) => e.type));
  });
});

// ── Projector 배선 ────────────────────────────────────────────────────────

describe('Projector 배선', () => {
  it('phase 를 코드 패널로 넘기고 나무의 사건을 stage 로 옮긴다', async () => {
    const { events } = await drive([]);
    const phaseCalls: (string | null)[] = [];
    const opened: number[] = [];
    const splits: Array<[number, number, number]> = [];
    const leaves: number[] = [];
    const cuts: number[] = [];
    let summary = '';
    let verdict = '';

    const stage = {
      destroy() {},
      resetTree() {},
      openNode(n: { id: number }) {
        opened.push(n.id);
      },
      showCut(_id: number, _axis: 0 | 1, cut: number) {
        cuts.push(cut);
      },
      keepBest() {},
      splitNode(id: number, axis: 0 | 1, cut: number) {
        splits.push([id, axis, cut]);
      },
      markLeaf(id: number) {
        leaves.push(id);
      },
      focusNode() {},
      setTree() {},
      setCaption() {},
      setSummary(text: string) {
        summary = text;
      },
      setVerdict(text: string) {
        verdict = text;
      },
    };
    const codePanel = {
      destroy() {},
      highlightPhase(p: string | null) {
        phaseCalls.push(p);
      },
      clearHighlight() {
        phaseCalls.push(null);
      },
    };

    const projector = decisionTreeProjector({ stage, codePanel });
    projector.onInit?.(decisionTreeFacet.initialData);
    for (const e of events) await projector.onEvent(e);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null))).toEqual(new Set(PHASES));
    expect(opened).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(leaves).toEqual([3, 4, 5, 6]);
    expect(splits.map((s) => s[0])).toEqual([0, 0, 1, 1, 2, 2]);
    expect(splits[0]).toEqual([0, 0, 5]);
    expect(cuts.length).toBe(45);
    expect(summary).toContain('correct 17 of 18');
    expect(verdict).toContain('17 of 18');
    expect(phaseCalls[phaseCalls.length - 1]).toBeNull();
  });
});

// ── 마운트와 재생 ─────────────────────────────────────────────────────────

describe('마운트와 재생', () => {
  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
  });

  it('캔버스가 붙고 세로가 변하지 않으며 화면의 수가 알고리즘이 셈한 것이다', async () => {
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
    registerDecisionTree();
    registerView('code-view', fakeCodeView);

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(decisionTreeFacet, host);
    handle.setSpeed(30);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    expect(box).toBe('0 0 720 400');

    // 표준 재생 묶음 넷이 떠 있다.
    const btn = (id: string): HTMLButtonElement | null =>
      host.querySelector<HTMLButtonElement>(`button[data-control-id="${id}"]`);
    expect(
      [...host.querySelectorAll<HTMLButtonElement>('button[data-control-id]')]
        .map((b) => b.dataset.controlId)
        .sort(),
    ).toEqual(['pause', 'play', 'reset', 'step']);

    const textsNow = (): string[] =>
      [...host.querySelectorAll('svg text')].map((t) => t.textContent ?? '');

    const waitFor = async (ok: () => boolean, ms = 25_000): Promise<void> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline && !ok()) {
        await new Promise((r) => setTimeout(r, 20));
      }
    };
    const settle = (ms = 120): Promise<void> => new Promise((r) => setTimeout(r, ms));

    /** 화면이 몇 걸음 갔는지 재는 자 — 시험한 자름의 누적 수. */
    const tried = (): number =>
      Number(
        host
          .querySelector('.facet-control-bar__metric--candidate-count')
          ?.textContent?.replace(/\D+/g, '') ?? '-1',
      );

    // ── 재생 · 멈춤 · 한 걸음 (표준 컨트롤)
    //
    // 누르는 것은 `FacetRunHandle` 로 한다 — 러너가 control-bar 의 클릭을
    // `mechanism.onControl('play'|'pause'|'step')` 로 보내는데, 지금
    // `ReactiveMechanism.onControl` 은 그 셋을 `dispatch` 로 흘려 보내고
    // `start()`/`stop()`/`step()` 을 부르지 않는다. 단추의 **활성**은 코어가
    // 제대로 몰아 주므로 아래에서 그것도 함께 잰다.
    await waitFor(() => tried() > 3, 5_000);
    expect(btn('play')?.disabled, '나아가는 중에는 재생이 꺼져 있다').toBe(true);
    expect(btn('pause')?.disabled, '나아가는 중에는 멈춤이 켜져 있다').toBe(false);

    // 멈춤 — 걸음의 경계에서 서고 재생·한 걸음이 켜진다.
    handle.stop();
    await settle(200);
    expect(btn('pause')?.disabled, '멈춘 뒤에는 멈춤이 꺼진다').toBe(true);
    expect(btn('play')?.disabled, '멈춘 뒤에는 재생이 켜진다').toBe(false);
    expect(btn('step')?.disabled, '멈춘 뒤에는 한 걸음이 켜진다').toBe(false);
    // 걸음을 세는 자 — 걸음마다 코드 패널의 phase 가 한 번 이상 바뀐다
    // (걸음 하나가 내는 phase 는 1개 또는 3개다: 노드를 여는 걸음만 셋).
    const marks = (): number => seenPhases.length;
    const frozen = tried();
    const frozenMarks = marks();
    await settle(300);
    expect(tried(), '멈춘 동안은 자름을 하나도 더 시험하지 않는다').toBe(frozen);
    expect(marks(), '멈춘 동안은 코드 줄도 움직이지 않는다').toBe(frozenMarks);

    // 한 걸음 — 딱 한 걸음만 가고 다시 선다.
    handle.step();
    await settle(300);
    const afterOne = marks();
    expect(afterOne - frozenMarks, '한 걸음이 실제로 나아간다').toBeGreaterThan(0);
    expect(afterOne - frozenMarks, '한 걸음을 넘지 않는다').toBeLessThanOrEqual(3);
    expect(tried() - frozen, '한 걸음이 시험하는 후보는 많아야 하나').toBeLessThanOrEqual(1);
    expect(btn('play')?.disabled, '그 한 걸음 뒤에는 다시 멈춰 있다').toBe(false);
    await settle(300);
    expect(marks(), '한 걸음 뒤에는 저절로 더 가지 않는다').toBe(afterOne);

    // 또 누르면 또 한 걸음.
    handle.step();
    await settle(300);
    expect(marks(), '또 한 걸음').toBeGreaterThan(afterOne);

    // 재생 — 다시 이어 끝까지 간다.
    handle.start();
    await waitFor(() => textsNow().some((t) => t.includes('correct 17 of 18')));

    // 입력 대기 — 되돌리기와 위젯만 남는다.
    await settle(200);
    expect(btn('play')?.disabled, '다 자란 뒤에는 재생이 꺼진다').toBe(true);
    expect(btn('step')?.disabled, '다 자란 뒤에는 한 걸음이 꺼진다').toBe(true);
    expect(btn('pause')?.disabled, '다 자란 뒤에는 멈춤이 꺼진다').toBe(true);
    expect(btn('reset')?.disabled, '되돌리기는 남는다').toBe(false);

    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(box);
    expect([...new Set(seenPhases)].sort()).toEqual(PHASES);

    // 화면에 뜨는 수는 알고리즘이 셈한 것이다.
    const texts = textsNow();
    expect(texts).toContain('x<5.00');
    expect(texts).toContain('y<3.25');
    expect(texts.some((t) => t.includes('depth cap 3 · leaves 4 · correct 17 of 18'))).toBe(true);
    const metricBadge = host.querySelector('.facet-control-bar__metric--correct-count');
    expect(metricBadge?.textContent).toContain('17');
    expect(svg?.outerHTML).not.toContain('NaN');

    // 틀리게 맞힌 점에만 붉은 테를 두른다 — 깊이 3 에서는 잡음점 하나뿐이다.
    const danger = getColors('light').danger;
    const ringed = (): number =>
      [...host.querySelectorAll('svg circle')].filter((c) => c.getAttribute('stroke') === danger)
        .length;
    expect(ringed()).toBe(1);

    // 깊이 상한 슬라이더가 화면을 실제로 바꾼다 — 5 로 옮기면 열여덟을 다 맞힌다.
    const seg5 = host.querySelector<HTMLElement>('[data-seg-index="4"]');
    expect(seg5).not.toBeNull();
    seg5?.click();
    await waitFor(() => textsNow().some((t) => t.includes('correct 18 of 18')), 5_000);
    const after = textsNow();
    expect(after).toContain('x<1.20');
    expect(after.some((t) => t.includes('leaves 6 · correct 18 of 18'))).toBe(true);
    expect(svg?.getAttribute('viewBox')).toBe(box);
    // 깊이 5 에서는 틀리는 점이 없다 — 잡음까지 외웠기 때문이다.
    expect(ringed()).toBe(0);
    expect(svg?.outerHTML).not.toContain('NaN');

    expect(errors).not.toHaveBeenCalled();

    handle.destroy();
    expect(host.querySelector('svg')).toBeNull();
    expect(host.children.length).toBe(0);
    errors.mockRestore();
    host.remove();
  }, 40_000);
});
