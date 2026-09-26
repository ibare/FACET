// @vitest-environment happy-dom
/**
 * instruction-selection 고유 검수 — IR ↔ algorithm 전 조합, 사양 표 대조, 마디 번호 섞기, 사다리, 판마다 계기, 무대 되감기.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetContext } from '@ffacet/core/runtime';
import {
  instructionSelectionAlgorithm,
  instructionSelectionFacet,
  instructionSelectionImperativeIR,
  instructionSelectionInitialData as data,
  instructionSelectionProjector,
  instructionSelectionStageView,
  layoutTree,
  patternSize,
  selectInstructions,
  type InstructionSelectionData,
  type IsNode,
} from '../src/index.js';

const KIND: Record<IsNode['kind'], number> = { STORE: 0, ADD: 1, MUL: 2, MEM: 3, NAME: 4, NUM: 5 };

/** 나무를 번호 배열로 — 전위 차례 0 부터, perm 이 있으면 번호를 섞는다. */
function flatten(tree: IsNode, perm?: number[]) {
  const kind: number[] = [];
  const kid0: number[] = [];
  const kid1: number[] = [];
  const put = (n: IsNode): number => {
    const i = kind.length;
    kind.push(KIND[n.kind]);
    kid0.push(-1);
    kid1.push(-1);
    const a = n.kids[0];
    const b = n.kids[1];
    if (a !== undefined) kid0[i] = put(a);
    if (b !== undefined) kid1[i] = put(b);
    return i;
  };
  const root = put(tree);
  if (perm === undefined) return { root, kind, kid0, kid1 };
  const m = (i: number) => {
    const v = perm[i];
    if (v === undefined) throw new Error('perm 길이');
    return v;
  };
  const nk = new Array<number>(kind.length).fill(0);
  const n0 = new Array<number>(kind.length).fill(0);
  const n1 = new Array<number>(kind.length).fill(0);
  kind.forEach((k, i) => {
    nk[m(i)] = k;
    n0[m(i)] = (kid0[i] ?? -1) >= 0 ? m(kid0[i] as number) : -1;
    n1[m(i)] = (kid1[i] ?? -1) >= 0 ? m(kid1[i] as number) : -1;
  });
  return { root: m(root), kind: nk, kid0: n0, kid1: n1 };
}

function irCount(tree: IsNode, isa: number, perm?: number[]) {
  const f = flatten(tree, perm);
  const stats = [0, 0];
  const r = runIR(instructionSelectionImperativeIR, 'selectCount', [
    f.root,
    f.kind,
    f.kid0,
    f.kid1,
    isa >= 1 ? 1 : 0,
    isa >= 2 ? 1 : 0,
    stats,
  ]);
  return { ret: r, instrs: stats[0], temps: stats[1] };
}

// 사양 실측표 (sim instruction-selection)
const TABLE: Record<string, { nodes: number; instrs: number; temps: number; live: number; steps: number; out: string[] }> = {
  '0,0': {
    nodes: 10, instrs: 9, temps: 8, live: 3, steps: 11,
    out: ['load t1, list', 'li t2, 16', 'add t3, t1, t2', 'load t4, [t3+0]', 'load t5, n', 'li t6, 4', 'mul t7, t5, t6', 'add t8, t4, t7', 'store y, t8'],
  },
  '0,1': {
    nodes: 10, instrs: 7, temps: 6, live: 2, steps: 9,
    out: ['load t1, list', 'addi t2, t1, 16', 'load t3, [t2+0]', 'load t4, n', 'mul t5, t4, 4', 'add t6, t3, t5', 'store y, t6'],
  },
  '0,2': {
    nodes: 10, instrs: 6, temps: 5, live: 2, steps: 8,
    out: ['load t1, list', 'load t2, [t1+16]', 'load t3, n', 'mul t4, t3, 4', 'add t5, t2, t4', 'store y, t5'],
  },
  '1,0': {
    nodes: 12, instrs: 11, temps: 10, live: 3, steps: 13,
    out: ['load t1, list', 'load t2, i', 'li t3, 8', 'mul t4, t2, t3', 'add t5, t1, t4', 'load t6, [t5+0]', 'load t7, n', 'li t8, 4', 'mul t9, t7, t8', 'add t10, t6, t9', 'store y, t10'],
  },
  '1,1': {
    nodes: 12, instrs: 9, temps: 8, live: 2, steps: 11,
    out: ['load t1, list', 'load t2, i', 'mul t3, t2, 8', 'add t4, t1, t3', 'load t5, [t4+0]', 'load t6, n', 'mul t7, t6, 4', 'add t8, t5, t7', 'store y, t8'],
  },
  '1,2': {
    nodes: 12, instrs: 9, temps: 8, live: 2, steps: 11,
    out: ['load t1, list', 'load t2, i', 'mul t3, t2, 8', 'add t4, t1, t3', 'load t5, [t4+0]', 'load t6, n', 'mul t7, t6, 4', 'add t8, t5, t7', 'store y, t8'],
  },
};

const treeOf = (e: number): IsNode => {
  const t = data.trees[e];
  if (t === undefined) throw new Error(`나무 ${e}`);
  return t;
};

describe('instruction-selection — 사양 표와 IR', () => {
  it('여섯 칸 모두 사양 표와 같다 (마디 · 명령 · 임시 · 산 값 최대 · 명령 글자 · 덮인 마디 합)', () => {
    for (const e of data.exprLadder) {
      for (const isa of data.isaLadder) {
        const want = TABLE[`${e},${isa}`];
        if (want === undefined) throw new Error('표 칸');
        const r = selectInstructions(treeOf(e), data.patterns, isa);
        expect(r.nodeCount).toBe(want.nodes);
        expect(r.instrs).toBe(want.instrs);
        expect(r.temps).toBe(want.temps);
        expect(r.maxLive).toBe(want.live);
        expect(r.lines.map((l) => l.text)).toEqual(want.out);
        expect(r.tiles.reduce((s, x) => s + x.size, 0)).toBe(want.nodes);
        // 걸음 = 걸음 0 + 무늬 + 냄
        expect(1 + r.tiles.length + 1).toBe(want.steps);
      }
    }
  });

  it('runIR 이 모든 손잡이 조합에서 algorithm 의 명령 수 · 임시 수와 같다', () => {
    for (const e of data.exprLadder) {
      for (const isa of data.isaLadder) {
        const a = selectInstructions(treeOf(e), data.patterns, isa);
        const b = irCount(treeOf(e), isa);
        expect(b.ret).toBe(a.instrs);
        expect(b.instrs).toBe(a.instrs);
        expect(b.temps).toBe(a.temps);
      }
    }
  });

  it('마디 번호를 섞어도 IR 의 답이 같다 (마흔 번)', () => {
    let seed = 9;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let k = 0; k < 40; k += 1) {
      for (const e of data.exprLadder) {
        const nNodes = selectInstructions(treeOf(e), data.patterns, 0).nodeCount;
        const perm = Array.from({ length: nNodes }, (_, i) => i);
        for (let i = perm.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rnd() * (i + 1));
          const x = perm[i] as number;
          perm[i] = perm[j] as number;
          perm[j] = x;
        }
        for (const isa of data.isaLadder) {
          const a = selectInstructions(treeOf(e), data.patterns, isa);
          const b = irCount(treeOf(e), isa, perm);
          expect([b.instrs, b.temps]).toEqual([a.instrs, a.temps]);
        }
      }
    }
  });

  it('조각 pattern-to-instruction 과 대조 — ① × + 주소 더하기 명령 6, ① × + 즉시값 명령 7', () => {
    expect(selectInstructions(treeOf(0), data.patterns, 2).instrs).toBe(6);
    expect(selectInstructions(treeOf(0), data.patterns, 1).instrs).toBe(7);
  });

  it('② × + 주소 더하기 — MEM 에서 load-offset 이 안 맞아 load-mem 이 고른다', () => {
    const r = selectInstructions(treeOf(1), data.patterns, 2);
    const mem = r.tiles[2];
    expect(mem?.name).toBe('load-mem');
    expect(mem?.skipped).toEqual(['load-offset']);
  });

  it('동률 — 한 모음 안에서 같은 뿌리 종류 · 같은 덮는 마디의 무늬 쌍이 없다 (이 데이터에서 걸리지 않는다)', () => {
    for (const isa of data.isaLadder) {
      const inSet = data.patterns.filter((p) => p.set <= isa);
      const pairs: string[] = [];
      inSet.forEach((a, i) => {
        inSet.slice(i + 1).forEach((b) => {
          if (a.shape.kind === b.shape.kind && patternSize(a.shape) === patternSize(b.shape)) pairs.push(`${a.name}/${b.name}`);
        });
      });
      expect(pairs).toEqual([]);
    }
  });

  it('사다리가 segments 의 value 와 같고 기본값이 initialData 와 같다', () => {
    const controls = (instructionSelectionFacet.blocks['controls'] as { controls: unknown[] }).controls;
    const slider = (action: string) => {
      const c = controls.find((x) => typeof x === 'object' && x !== null && (x as { action?: string }).action === action) as
        | { segments: { value: number; default?: boolean }[] }
        | undefined;
      if (c === undefined) throw new Error(action);
      return c;
    };
    const isa = slider('isa');
    const expr = slider('expr');
    expect(isa.segments.map((s) => s.value)).toEqual(data.isaLadder);
    expect(expr.segments.map((s) => s.value)).toEqual(data.exprLadder);
    expect(isa.segments.find((s) => s.default)?.value).toBe(data.isa);
    expect(expr.segments.find((s) => s.default)?.value).toBe(data.expr);
    expect(data.isaLadder).toEqual([0, 1, 2]);
    expect(data.exprLadder).toEqual([0, 1]);
    expect(data.trees).toHaveLength(2);
    expect(data.sources).toHaveLength(2);
    expect(data.patterns).toHaveLength(9);
  });

  it('나무 가로 자리 — 잎 수 5 · 6', () => {
    expect(layoutTree(treeOf(0)).leafCount).toBe(5);
    expect(layoutTree(treeOf(1)).leafCount).toBe(6);
  });
});

type Ev = { type: string; payload?: unknown; silent?: boolean };

/** 알고리즘을 입력 목록대로 돌려 판마다 사건과 계기를 모은다. */
async function drive(inputs: { type: string; value: number }[]) {
  const events: Ev[] = [];
  const metrics: Record<string, number> = {};
  const rounds: { metrics: Record<string, number>; events: Ev[] }[] = [];
  let cur: Ev[] = [];
  let cancelled = false;
  let k = 0;
  const ctx = {
    data: structuredClone(data) as InstructionSelectionData,
    get cancelled() {
      return cancelled;
    },
    async emit(e: Ev) {
      events.push(e);
      cur.push(e);
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
      // 판이 끝난 자리에서만 적는다 — 받지 않은 입력 뒤의 되기다림은 판이 아니다
      if (cur.length > 0) rounds.push({ metrics: { ...metrics }, events: cur });
      cur = [];
      const next = inputs[k];
      k += 1;
      if (next === undefined) {
        cancelled = true;
        return { type: 'none' };
      }
      return { type: next.type, payload: { value: next.value } };
    },
  };
  await instructionSelectionAlgorithm(ctx as unknown as FacetContext<InstructionSelectionData>);
  return { events, rounds };
}

describe('instruction-selection — 판', () => {
  it('손잡이를 A → B → A 로 돌려 회차마다 계기가 사양 표와 같다', async () => {
    const { rounds } = await drive([
      { type: 'isa', value: 2 },
      { type: 'isa', value: 0 },
      { type: 'expr', value: 1 },
      { type: 'isa', value: 1 },
      { type: 'isa', value: 2 },
    ]);
    const keys = ['0,0', '0,2', '0,0', '1,0', '1,1', '1,2'];
    expect(rounds).toHaveLength(keys.length);
    rounds.forEach((r, i) => {
      const want = TABLE[keys[i] as string];
      if (want === undefined) throw new Error('표 칸');
      expect(r.metrics['instr-count']).toBe(want.instrs);
      expect(r.metrics['max-live']).toBe(want.live);
      expect(r.metrics['tile-count']).toBe(want.steps - 2);
      // 걸음 0(round) + 무늬 + 냄
      const visible = r.events.filter((e) => e.type === 'round' || e.type === 'tile' || e.type === 'emit');
      expect(visible).toHaveLength(want.steps);
      expect(visible[0]?.type).toBe('round');
    });
  });

  it('사다리 밖의 값 · 모르는 입력은 판을 새로 세우지 않는다', async () => {
    const { rounds } = await drive([
      { type: 'isa', value: 7 },
      { type: 'other', value: 1 },
      { type: 'expr', value: 1 },
    ]);
    expect(rounds).toHaveLength(2);
    expect(rounds[1]?.metrics['instr-count']).toBe(11);
  });

  it('무대 — 판을 돌리면 명령 열이 채워지고 onReset 이 앞 화면을 걷는다', async () => {
    const { events } = await drive([{ type: 'isa', value: 2 }]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(instructionSelectionStageView, container, {
      config: { type: 'instruction-selection-stage' },
      isInstant: () => true,
    });
    const highlights: (string | null)[] = [];
    const code = { highlightPhase: (p: string | null) => highlights.push(p), clearHighlight: () => undefined, destroy: () => undefined };
    const proj = instructionSelectionProjector({ stage, codePanel: code }, { getSpeed: () => 1, t: (_k, f) => f });
    for (const e of events) await proj.onEvent(e as never);
    const svg = container.querySelector('svg');
    if (svg === null) throw new Error('svg 없음');
    const text = svg.textContent ?? '';
    expect(text).toContain('load t2, [t1+16]');
    expect(text).toContain('let y = list[2] + n * 4');
    proj.onReset?.();
    expect(svg.textContent ?? '').not.toContain('load t2, [t1+16]');
    expect(svg.textContent ?? '').not.toContain('let y');
    expect(highlights[highlights.length - 1]).toBeNull();
    stage.destroy();
  });

  it('운동 도중 되감기 · 되짚기 — 걷히던 앞 판의 무늬 · 명령 줄 · 마디가 남지 않는다', async () => {
    const { events } = await drive([{ type: 'expr', value: 1 }]);
    const secondRound = events.findIndex((e, i) => i > 0 && e.type === 'round');
    expect(secondRound).toBeGreaterThan(0);
    const mountLive = () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      let scrub: (() => void) | undefined;
      const stage = mountView(instructionSelectionStageView, container, {
        config: { type: 'instruction-selection-stage' },
        isInstant: () => false,
        onScrubStart: (fn) => {
          scrub = fn;
        },
      });
      const proj = instructionSelectionProjector({ stage }, { getSpeed: () => 1, t: (_k, f) => f });
      const svg = container.querySelector('svg');
      if (svg === null) throw new Error('svg 없음');
      const startScrub = () => {
        if (scrub === undefined) throw new Error('onScrubStart 를 맡기지 않았다');
        scrub();
      };
      return { stage, proj, svg, startScrub };
    };
    const liveTiles = (svg: SVGSVGElement) => [...svg.querySelectorAll('g[opacity]')].filter((g) => g.querySelector('rect[rx="10"]') !== null);

    // 되감기 — 새 판의 걸음 0(무늬가 걷히는 중)에서 onReset
    {
      const { stage, proj, svg } = mountLive();
      for (const e of events.slice(0, secondRound + 1)) await proj.onEvent(e as never);
      expect(svg.textContent ?? '').toContain('store y, t8'); // 걷히는 중 — 아직 붙어 있다
      proj.onReset?.();
      expect(svg.textContent ?? '').not.toContain('store y, t8');
      expect(liveTiles(svg)).toHaveLength(0);
      expect(svg.textContent ?? '').not.toContain('NAME');
      stage.destroy();
    }
    // 되짚기 시작 — 걸린 운동을 끝 상태로 마무리한다 (걷히던 것은 지워지고 새 나무는 제자리)
    {
      const { stage, proj, svg, startScrub } = mountLive();
      for (const e of events.slice(0, secondRound + 1)) await proj.onEvent(e as never);
      startScrub();
      expect(svg.textContent ?? '').not.toContain('store y, t8');
      expect(liveTiles(svg)).toHaveLength(0);
      expect(svg.textContent ?? '').toContain('NAME i');
      stage.destroy();
    }
  });
});
