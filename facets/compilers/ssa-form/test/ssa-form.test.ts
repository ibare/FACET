// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  blockName,
  compileSsa,
  instructionParts,
  partsText,
  phiParts,
  readSlots,
  runSsa,
  ssaFormAlgorithm,
  ssaNames,
  type SsaCompiled,
  type SsaFormData,
  type SsaInstruction,
} from '../src/algorithm.js';
import { ssaFormFacet } from '../src/facet.js';
import { ssaFormImperativeIR } from '../src/irs.js';
import { ssaFormProjector } from '../src/projector.js';
import { ssaFormStageView } from '../src/ssa-form-stage.js';

const data = ssaFormFacet.initialData as SsaFormData;

/** 사양 실측표 (sim.py ssa-form) */
const SPEC = [
  {
    v: 0, ins: 9, blocks: 3, phis: 1, versions: 5, steps: 9,
    phiLines: ['x3 = φ(B1: x1, B2: x2)'],
    run: { 8: { path: 'B1 → B2 → B3', picks: ['x3←x2'], value: 20 }, 3: { path: 'B1 → B3', picks: ['x3←x1'], value: 10 } },
  },
  {
    v: 1, ins: 11, blocks: 4, phis: 2, versions: 7, steps: 10,
    phiLines: ['x3 = φ(B2: x2, B3: x1)', 'y3 = φ(B2: y1, B3: y2)'],
    run: { 8: { path: 'B1 → B2 → B4', picks: ['x3←x2', 'y3←y1'], value: 20 }, 3: { path: 'B1 → B3 → B4', picks: ['x3←x1', 'y3←y2'], value: 11 } },
  },
  {
    v: 2, ins: 11, blocks: 4, phis: 1, versions: 6, steps: 10,
    phiLines: ['x4 = φ(B2: x2, B3: x3)'],
    run: { 8: { path: 'B1 → B2 → B4', picks: ['x4←x2'], value: 20 }, 3: { path: 'B1 → B3 → B4', picks: ['x4←x3'], value: 11 } },
  },
  {
    v: 3, ins: 12, blocks: 4, phis: 2, versions: 8, steps: 10,
    phiLines: ['x3 = φ(B2: x2, B3: x1)', 'y4 = φ(B2: y2, B3: y3)'],
    run: { 8: { path: 'B1 → B2 → B4', picks: ['x3←x2', 'y4←y2'], value: 21 }, 3: { path: 'B1 → B3 → B4', picks: ['x3←x1', 'y4←y3'], value: 11 } },
  },
] as const;

/** 사양의 SSA 글자 (x | y) */
const SSA_XY = [
  'x1 = a', 'y1 = 1', 'z1 = a * 2', 't1 = x1 > 5', 'ifnot t1 goto L1', 'x2 = x1 - 5', 'goto L2',
  'y2 = 2', 't2 = x3 + y3', 't3 = t2 + z1', 'return t3',
];

type IrOut = { nPhi: number; readVer: number[]; writeVer: number[]; phiBlock: number[]; phiName: number[]; phiVer: number[]; phiArg: number[] };

/** IR 을 부른다 — 이름 번호는 perm[첫 넣기 차례] */
function irRun(code: SsaInstruction[], compiled: SsaCompiled, perm: number[]): IrOut {
  const names = compiled.names;
  const id = (n: string): number => perm[names.indexOf(n)];
  const readName: number[] = [];
  const writeName: number[] = [];
  for (const ins of code) {
    for (const o of readSlots(ins)) readName.push(o !== null && 'var' in o && names.includes(o.var) ? id(o.var) : -1);
    writeName.push((ins.k === 'bin' || ins.k === 'copy') && names.includes(ins.dst) ? id(ins.dst) : -1);
  }
  const nb = compiled.cfg.blocks.length;
  const N = names.length;
  const pred0 = compiled.cfg.preds.map((p) => (p.length > 0 ? p[0] : -1));
  const pred1 = compiled.cfg.preds.map((p) => (p.length > 1 ? p[1] : -1));
  const cur = new Array<number>(nb * N).fill(0);
  const counter = new Array<number>(N).fill(0);
  const readVer = new Array<number>(code.length * 2).fill(0);
  const writeVer = new Array<number>(code.length).fill(0);
  const phiBlock = new Array<number>(N).fill(-1);
  const phiName = new Array<number>(N).fill(-1);
  const phiVer = new Array<number>(N).fill(-1);
  const phiArg = new Array<number>(2 * N).fill(-1);
  const nPhi = runIR(ssaFormImperativeIR, 'numberVersions', [
    compiled.cfg.insBlock, readName, writeName, pred0, pred1, N, cur, counter, readVer, writeVer, phiBlock, phiName, phiVer, phiArg,
  ]);
  if (typeof nPhi !== 'number') throw new Error('IR 이 수를 돌려주지 않았다');
  return { nPhi, readVer, writeVer, phiBlock, phiName, phiVer, phiArg };
}

function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  for (const rest of permutations(n - 1)) for (let i = 0; i <= rest.length; i++) out.push([...rest.slice(0, i), n - 1, ...rest.slice(i)]);
  return out;
}

describe('ssa-form — 셈', () => {
  it('사다리가 손잡이 구간 · 기본값과 같다', () => {
    const controls = (ssaFormFacet.blocks.controls as { controls: { name?: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const seg = (name: string) => {
      const c = controls.find((x) => x.name === name);
      if (c?.segments === undefined) throw new Error(name);
      return c.segments;
    };
    expect(seg('branchSets').map((s) => s.value)).toEqual(data.branchSetsLadder);
    expect(seg('argA').map((s) => s.value)).toEqual(data.argLadder);
    expect(seg('branchSets').find((s) => s.default)?.value).toBe(data.startBranchSets);
    expect(seg('argA').find((s) => s.default)?.value).toBe(data.startArgA);
    expect(data.variants.length).toBe(4);
    expect(data.branchSetsLadder[3]).toBe(3);
    expect(data.argLadder[1]).toBe(8);
  });

  it('네 갈래 — 명령 · 블록 · 파이 · 판 이름 · 파이 줄이 사양 표와 같다', () => {
    for (const s of SPEC) {
      const { code } = data.variants[s.v];
      const c = compileSsa(code);
      expect(code.length).toBe(s.ins);
      expect(c.cfg.blocks.length).toBe(s.blocks);
      expect(c.phis.length).toBe(s.phis);
      expect(c.versions).toBe(s.versions);
      expect(c.phis.map((_, k) => partsText(phiParts(c, k)))).toEqual(s.phiLines);
      expect(ssaNames(code)).toEqual(['x', 'y', 'z']);
    }
    const xy = compileSsa(data.variants[1].code);
    expect(data.variants[1].code.map((_, i) => partsText(instructionParts(data.variants[1].code, i, xy)))).toEqual(SSA_XY);
    expect(xy.cfg.insBlock).toEqual([0, 0, 0, 0, 0, 1, 1, 2, 3, 3, 3]);
    expect(xy.cfg.preds.map((p) => p.map(blockName))).toEqual([[], ['B1'], ['B1'], ['B2', 'B3']]);
  });

  it('여덟 조합 — 길 · 고름 · 돌려준 값이 사양 표와 같다', () => {
    for (const s of SPEC) {
      const { code } = data.variants[s.v];
      const c = compileSsa(code);
      for (const a of [8, 3] as const) {
        const r = runSsa(code, c, data.param, a);
        const want = s.run[a];
        expect(r.path.map(blockName).join(' → ')).toBe(want.path);
        expect(c.phis.map((p, k) => `${p.name}${p.ver}←${p.name}${p.args[r.picks[k]]}`)).toEqual(want.picks);
        expect(r.value).toBe(want.value);
      }
    }
  });

  it('여덟 조합 — IR 의 파이 수 · readVer · writeVer · 파이 배열이 알고리즘과 같다 (a 가 달라도 같은 답)', () => {
    for (const s of SPEC) {
      const { code } = data.variants[s.v];
      const answers: string[] = [];
      for (const _a of data.argLadder) {
        const c = compileSsa(code);
        const ir = irRun(code, c, [0, 1, 2]);
        expect(ir.nPhi).toBe(c.phis.length);
        expect(ir.readVer).toEqual(c.readVer);
        expect(ir.writeVer).toEqual(c.writeVer);
        expect(ir.phiBlock.slice(0, ir.nPhi)).toEqual(c.phis.map((p) => p.block));
        expect(ir.phiName.slice(0, ir.nPhi)).toEqual(c.phis.map((p) => c.names.indexOf(p.name)));
        expect(ir.phiVer.slice(0, ir.nPhi)).toEqual(c.phis.map((p) => p.ver));
        expect(ir.phiArg.slice(0, 2 * ir.nPhi)).toEqual(c.phis.flatMap((p) => p.args));
        answers.push(JSON.stringify(ir));
      }
      expect(new Set(answers).size).toBe(1);
    }
  });

  it('이름 번호의 차례를 섞어도 명령마다의 판 · 파이 모음이 같다 (3! 전부)', () => {
    for (const s of SPEC) {
      const { code } = data.variants[s.v];
      const c = compileSsa(code);
      const phiSet = (ir: IrOut, perm: number[]) =>
        Array.from({ length: ir.nPhi }, (_, k) => {
          const name = c.names[perm.indexOf(ir.phiName[k])];
          return `${ir.phiBlock[k]}:${name}${ir.phiVer[k]}(${ir.phiArg[2 * k]},${ir.phiArg[2 * k + 1]})`;
        }).sort();
      const base = irRun(code, c, [0, 1, 2]);
      for (const perm of permutations(3)) {
        const ir = irRun(code, c, perm);
        expect(ir.readVer).toEqual(base.readVer);
        expect(ir.writeVer).toEqual(base.writeVer);
        expect(phiSet(ir, perm)).toEqual(phiSet(base, [0, 1, 2]));
      }
    }
  });
});

// ─────────────────────────────── 알고리즘을 회차째 돌린다

type Round = { events: FacetRuntimeEvent[]; metrics: Record<string, number>; phases: string[]; steps: number };

async function playRounds(inputs: { type: string; value: number }[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const shown: Record<string, number> = {};
  let cur: Round = { events: [], metrics: shown, phases: [], steps: 1 };
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      cur.events.push(e);
      if (e.type === 'phase') {
        const p = e.payload as { phase: string };
        cur.phases.push(p.phase);
      }
    },
    metric(name: string, delta: number | 'inc') {
      shown[name] = (shown[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      cur.steps += 1;
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      rounds.push({ ...cur, metrics: { ...shown } });
      cur = { events: [], metrics: shown, phases: [], steps: 1 };
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        return { type: 'end' };
      }
      return { type: next.type, payload: { value: next.value } };
    },
  };
  await ssaFormAlgorithm(ctx as never);
  return rounds;
}

describe('ssa-form — 회차', () => {
  it('회차마다 걸음 수 · 계기가 사양과 같다 (갈래 A → B → A, a 만 바꾼 회차)', async () => {
    const rounds = await playRounds([
      { type: 'branchSets', value: 0 },
      { type: 'branchSets', value: 1 },
      { type: 'argA', value: 3 },
      { type: 'branchSets', value: 3 },
      { type: 'argA', value: 8 },
      { type: 'branchSets', value: 2 },
    ]);
    const got = rounds.map((r) => ({ steps: r.steps, ...r.metrics }));
    expect(got).toEqual([
      { steps: 10, phis: 2, versions: 7, result: 20 },
      { steps: 9, phis: 1, versions: 5, result: 20 },
      { steps: 10, phis: 2, versions: 7, result: 20 },
      { steps: 3, phis: 2, versions: 7, result: 11 },
      { steps: 10, phis: 2, versions: 8, result: 11 },
      { steps: 3, phis: 2, versions: 8, result: 21 },
      { steps: 10, phis: 1, versions: 6, result: 20 },
    ]);
    // a 만 바뀐 회차는 phase 를 보내지 않는다 · 전체 회차는 셋 다 닿는다
    expect(rounds[3].phases).toEqual([]);
    expect(new Set(rounds[0].phases)).toEqual(new Set(['rename', 'phi-new', 'phi-same']));
    expect(rounds[0].phases).toEqual(['rename', 'rename', 'rename', 'phi-new', 'phi-new', 'phi-same', 'rename']);
  });

  it('phase 어휘가 IR 과 같다', () => {
    const found = new Set<string>();
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (typeof x === 'object' && x !== null) {
        const o = x as Record<string, unknown>;
        if (typeof o.phase === 'string') found.add(o.phase);
        Object.values(o).forEach(walk);
      }
    };
    walk(ssaFormImperativeIR.functions);
    expect(found).toEqual(new Set(['rename', 'phi-new', 'phi-same']));
  });

  it('무대가 모든 회차의 이벤트를 받아 그린다', async () => {
    const rounds = await playRounds([
      { type: 'branchSets', value: 0 },
      { type: 'argA', value: 3 },
      { type: 'branchSets', value: 3 },
    ]);
    const container = document.createElement('div');
    const stage = mountView(ssaFormStageView, container, { config: {}, locale: 'ko' });
    const calls: (string | null)[] = [];
    const panel = {
      destroy() {},
      highlightPhase: (p: string | null) => calls.push(p),
      clearHighlight: () => calls.push(null),
    };
    const projector = ssaFormProjector({ stage, codePanel: panel });
    for (const r of rounds) for (const e of r.events) void projector.onEvent(e);
    const text = container.textContent ?? '';
    expect(text).toContain('x3 = φ(B2: x2, B3: x1)');
    expect(text).toContain('y4 = φ(B2: y2, B3: y3)');
    expect(text).toContain('21');
    expect(calls).toContain('phi-new');
    stage.destroy();
  });
});
