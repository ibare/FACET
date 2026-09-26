// @vitest-environment happy-dom
/**
 * flow-graphs 고유 검수 — 사양 대조표 · IR ↔ 알고리즘 전 조합 · 변수 번호 섞기 · 회차별 계기 · 사다리 · 무대 마운트.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { makeTranslator, mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  analyzeFlow,
  defName,
  flowGraphsAlgorithm,
  flowGraphsFacet,
  flowGraphsImperativeIR,
  flowGraphsProjector,
  flowGraphsStageView,
  instrText,
  readNames,
  stepCount,
  type FlowGraphsData,
  type Instr,
} from '../src/index.js';

const data = flowGraphsFacet.initialData as FlowGraphsData;

// 사양 실측표 (sim.py flow-graphs) — 맞춰 볼 값
const SPEC = [
  { name: '곧은 줄', instr: 5, temps: 1, blocks: 1, edges: 0, jumps: 0, back: 0, sweeps: 1, chains: 5, two: 0, steps: 4 },
  { name: 'if', instr: 7, temps: 2, blocks: 3, edges: 3, jumps: 1, back: 0, sweeps: 1, chains: 8, two: 1, steps: 7 },
  { name: 'if-else', instr: 9, temps: 2, blocks: 4, edges: 4, jumps: 2, back: 0, sweeps: 1, chains: 9, two: 1, steps: 8 },
  { name: 'while', instr: 9, temps: 2, blocks: 4, edges: 4, jumps: 2, back: 1, sweeps: 2, chains: 15, two: 6, steps: 9 },
];

const SPEC_TEXT = [
  ['u = a * 3', 'v = u - b', 'u = v + 2', 't1 = u * v', 'return t1'],
  ['u = a * 3', 'v = u - b', 't1 = v > 8', 'ifnot t1 goto L1', 'u = v + 2', 'L1: t2 = u * v', 'return t2'],
  [
    'u = a * 3',
    'v = u - b',
    't1 = v > 8',
    'ifnot t1 goto L1',
    'u = v + 2',
    'goto L2',
    'L1: u = v - 2',
    'L2: t2 = u * v',
    'return t2',
  ],
  [
    'u = a * 3',
    'v = u - b',
    'L1: t1 = v > 8',
    'ifnot t1 goto L2',
    'u = u + v',
    'v = v - 3',
    'goto L1',
    'L2: t2 = u * v',
    'return t2',
  ],
];

/** IR 인자 — 명령을 번호로. 변수 번호 = 넣어지는 이름의 첫 넣기 차례 (perm 으로 섞을 수 있다) */
function irArgs(code: Instr[], perm?: number[]) {
  const names: string[] = [];
  for (const ins of code) {
    const d = defName(ins);
    if (d !== null && !names.includes(d)) names.push(d);
  }
  const P = perm ?? names.map((_, i) => i);
  const vid = (nm: string | null): number => (nm !== null && names.includes(nm) ? P[names.indexOf(nm)]! : -1);
  const labelAt = new Map<string, number>();
  code.forEach((ins, i) => {
    if (ins.label !== null) labelAt.set(ins.label, i);
  });
  const n = code.length;
  const zeros = (len: number) => new Array<number>(len).fill(0);
  return {
    names,
    kind: code.map((ins) => ({ bin: 0, copy: 0, ifnot: 1, goto: 2, return: 3 })[ins.k]),
    target: code.map((ins) => (ins.k === 'goto' || ins.k === 'ifnot' ? labelAt.get(ins.target)! : -1)),
    defVar: code.map((ins) => vid(defName(ins))),
    readVar: code.flatMap((ins) => readNames(ins).map(vid)),
    isLeader: zeros(n),
    blockOf: zeros(n),
    blockStart: zeros(n),
    edgeFrom: zeros(2 * n),
    edgeTo: zeros(2 * n),
    reachIn: zeros(n * n),
    reachOut: zeros(n * n),
    reachCount: zeros(2 * n),
    stats: zeros(6),
  };
}

function runFlowIR(code: Instr[], perm?: number[]) {
  const A = irArgs(code, perm);
  const ret = runIR(flowGraphsImperativeIR, 'flowGraph', [
    A.kind,
    A.target,
    A.defVar,
    A.readVar,
    A.isLeader,
    A.blockOf,
    A.blockStart,
    A.edgeFrom,
    A.edgeTo,
    A.reachIn,
    A.reachOut,
    A.reachCount,
    A.stats,
  ]);
  return { ...A, ret };
}

function permutations(k: number): number[][] {
  if (k === 0) return [[]];
  const out: number[][] = [];
  for (const rest of permutations(k - 1)) for (let i = 0; i <= rest.length; i++) out.push([...rest.slice(0, i), k - 1, ...rest.slice(i)]);
  return out;
}

describe('flow-graphs — 데이터와 사다리', () => {
  it('사다리가 segments[].value 와 같고 기본값이 startShape', () => {
    const controls = (flowGraphsFacet.blocks.controls as { controls: { action: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const knob = controls.find((c) => c.action === 'flowShape');
    expect(knob?.segments?.map((s) => s.value)).toEqual(data.flowShapeLadder);
    expect(knob?.segments?.find((s) => s.default)?.value).toBe(data.startShape);
    expect(data.flowShapeLadder).toEqual([0, 1, 2, 3]);
    expect(data.shapes.length).toBe(4);
    expect(data.stepMs).toBe(1200);
  });

  it('세 주소 코드 글자가 사양과 한 글자도 다르지 않다', () => {
    data.shapes.forEach((sh, v) => expect(sh.code.map(instrText)).toEqual(SPEC_TEXT[v]));
  });

  it('원시 줄이 사양과 같다', () => {
    const src = data.shapes.map((sh) => sh.source.map((l) => '    '.repeat(l.indent) + l.text).join('\n'));
    expect(src[2]).toBe('let u = a * 3\nlet v = u - b\nif v > 8\n    u = v + 2\nelse\n    u = v - 2\nreturn u * v');
    expect(src[3]).toBe('let u = a * 3\nlet v = u - b\nwhile v > 8\n    u = u + v\n    v = v - 3\nreturn u * v');
  });
});

describe('flow-graphs — 사양 대조와 IR', () => {
  data.shapes.forEach((sh, v) => {
    const spec = SPEC[v]!;
    it(`${spec.name}: 알고리즘의 셈이 사양 실측표와 같다`, () => {
      const an = analyzeFlow(sh.code);
      expect(sh.code.length).toBe(spec.instr);
      expect(an.names.filter((nm) => /^t\d+$/.test(nm)).length).toBe(spec.temps);
      expect(an.blocks.length).toBe(spec.blocks);
      expect(an.edges.length).toBe(spec.edges);
      expect(an.edges.filter((e) => e.kind === 'jump').length).toBe(spec.jumps);
      expect(an.edges.filter((e) => e.back).length).toBe(spec.back);
      expect(an.sweeps.length).toBe(spec.sweeps);
      expect(an.chains).toBe(spec.chains);
      expect(an.twoDefReads).toBe(spec.two);
      expect(stepCount(an)).toBe(spec.steps);
    });

    it(`${spec.name}: runIR 의 stats · 간선 · reachCount 가 알고리즘과 같다`, () => {
      const an = analyzeFlow(sh.code);
      const R = runFlowIR(sh.code);
      const n = sh.code.length;
      expect(R.ret).toBe(an.twoDefReads);
      expect(R.stats).toEqual([
        an.blocks.length,
        an.edges.length,
        an.edges.filter((e) => e.back).length,
        an.sweeps.length,
        an.chains,
        an.twoDefReads,
      ]);
      const ne = R.stats[1]!;
      expect(Array.from({ length: ne }, (_, e) => [R.edgeFrom[e], R.edgeTo[e]])).toEqual(an.edges.map((e) => [e.from, e.to]));
      const counts = new Array<number>(2 * n).fill(0);
      for (const reads of an.reads) for (const r of reads) counts[r.instr * 2 + r.slot] = r.defs.length;
      expect(R.reachCount).toEqual(counts);
      // 머리에 닿는 모음도 같다
      an.reachIn.forEach((set, b) => {
        const fromIR = Array.from({ length: n }, (_, d) => d).filter((d) => R.reachIn[b * n + d] === 1);
        expect(fromIR).toEqual(set);
      });
      // 버퍼 길이 — 데이터가 커지면 먼저 깨진다
      expect(R.reachIn.length).toBe(n * n);
      expect(R.edgeFrom.length).toBe(2 * n);
    });

    it(`${spec.name}: 변수 번호의 차례를 섞어도 IR 의 답이 같다`, () => {
      const base = runFlowIR(sh.code);
      for (const perm of permutations(base.names.length)) {
        const R = runFlowIR(sh.code, perm);
        expect(R.stats).toEqual(base.stats);
        expect(R.reachCount).toEqual(base.reachCount);
        expect(R.edgeFrom).toEqual(base.edgeFrom);
        expect(R.edgeTo).toEqual(base.edgeTo);
      }
    });
  });

  it('if-else 의 IR 인자가 사양의 대조와 같다', () => {
    const A = irArgs(data.shapes[2]!.code);
    expect(A.kind).toEqual([0, 0, 0, 1, 0, 2, 0, 0, 3]);
    expect(A.target).toEqual([-1, -1, -1, 6, -1, 7, -1, -1, -1]);
    expect(A.defVar).toEqual([0, 1, 2, -1, 0, -1, 0, 3, -1]);
    expect(A.readVar).toEqual([-1, -1, 0, -1, 1, -1, 2, -1, 1, -1, -1, -1, 1, -1, 0, 1, 3, -1]);
    expect(runFlowIR(data.shapes[2]!.code).stats).toEqual([4, 4, 0, 1, 9, 1]);
  });

  // 사양 글은 "u@5 · v@6 이 더해진다" 라고만 적었으나 sim.py 의 모음으로는 되돌이가 t1@3 도 함께 가져온다
  it('while 의 둘째 훑기가 B2 머리에 t1@3 · u@5 · v@6 을 더한다 (sim.py 모음)', () => {
    const an = analyzeFlow(data.shapes[3]!.code);
    const fresh = an.sweeps[1]!.sets[1]!.head.filter((c) => c.fresh).map((c) => `${c.name}@${c.def + 1}`);
    expect(fresh).toEqual(['t1@3', 'u@5', 'v@6']);
  });
});

/** 러너 없이 알고리즘을 돌리는 작은 반응형 틀 */
function harness(inputs: number[]) {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const rounds: { steps: number; metrics: Record<string, number> }[] = [];
  let steps = 1;
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      steps++;
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      rounds.push({ steps, metrics: Object.fromEntries(metrics) });
      steps = 1;
      const v = queue.shift();
      if (v === undefined) {
        cancelled = true;
        return { type: 'noop' };
      }
      return { type: 'flowShape', payload: { value: v } };
    },
  };
  return { ctx: ctx as unknown as FacetContext<FlowGraphsData>, events, rounds };
}

describe('flow-graphs — 회차별 계기와 걸음', () => {
  it('if-else → while → if-else → 곧은 줄 → if: 회차마다 사양 표와 같다 (쌓이지 않는다)', async () => {
    const h = harness([3, 2, 0, 1]);
    await flowGraphsAlgorithm(h.ctx);
    const order = [2, 3, 2, 0, 1];
    expect(h.rounds.length).toBe(order.length);
    h.rounds.forEach((r, i) => {
      const spec = SPEC[order[i]!]!;
      expect(r.steps).toBe(spec.steps);
      expect(r.metrics).toEqual({ blocks: spec.blocks, edges: spec.edges, chains: spec.chains, 'two-def-reads': spec.two });
    });
  });

  it('걸음마다 phase 하나 — if-else 는 leader · edge · reach · chain ×3 · two-defs', async () => {
    const h = harness([]);
    await flowGraphsAlgorithm(h.ctx);
    const phases = h.events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase);
    expect(phases).toEqual(['leader', 'edge', 'reach', 'chain', 'chain', 'chain', 'two-defs']);
  });

  it('사다리 밖 · 수 아닌 입력은 받지 않는다', async () => {
    const h = harness([]);
    let calls = 0;
    const inputs: unknown[] = [{ type: 'flowShape', payload: { value: 9 } }, { type: 'flowShape', payload: { value: '1' } }, { type: 'other' }];
    (h.ctx as unknown as { waitForInput: () => Promise<unknown> }).waitForInput = async () => {
      calls++;
      const next = inputs.shift();
      if (next === undefined) {
        (h.ctx as unknown as { sleep: () => Promise<boolean> }).sleep = async () => false;
        return { type: 'flowShape', payload: { value: 0 } };
      }
      return next;
    };
    await flowGraphsAlgorithm(h.ctx);
    const rounds = h.events.filter((e) => e.type === 'round').map((e) => (e.payload as { shape: number }).shape);
    expect(rounds).toEqual([2, 0]);
    expect(calls).toBe(4);
  });
});

describe('flow-graphs — 무대', () => {
  it('모든 흐름 꼴의 이벤트를 받아 그린다 (회차를 바꾸면 앞 회차의 틀 · 간선 · 사슬이 걷힌다)', async () => {
    const h = harness([3, 0, 1]);
    await flowGraphsAlgorithm(h.ctx);
    const container = document.createElement('div');
    const t = makeTranslator('ko', flowGraphsFacet.messages);
    const stage = mountView(flowGraphsStageView, container, { config: {}, locale: 'ko', t, isInstant: () => true });
    const proj = flowGraphsProjector({ stage }, { getSpeed: () => 1, t });
    for (const e of h.events) {
      await proj.onEvent(e);
      if (e.type === 'round') {
        // 걸음 0 — 틀 · 간선 · 칩 · 사슬이 없다
        expect(container.querySelectorAll('rect').length).toBe(0);
        expect(container.textContent).toContain('세 주소 코드 명령');
      }
    }
    // 마지막 회차는 if — 블록 셋의 틀, 두 가닥 뱃지 하나
    expect(container.querySelectorAll('circle').length).toBe(1);
    expect(container.textContent).toContain('B3');
    proj.onReset?.();
    expect(container.querySelectorAll('rect').length).toBe(0);
    stage.destroy();
  });

  it('initialData 없이 마운트해도 던지지 않는다', () => {
    const container = document.createElement('div');
    const stage = mountView(flowGraphsStageView, container, { config: {} });
    expect(container.querySelector('svg')).not.toBeNull();
    stage.destroy();
  });
});
