/**
 * parse-tree-to-ast 고유 검수 — 사양 표 대조 · IR ↔ algorithm 전 조합 (마디 번호 섞기 · 값 바꾸기 포함) ·
 * 회차별 계기 (A → B → A) · 사다리 · 자리는 모양에서만.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import type { FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  parseTreeText,
  parseTreeToAstAlgorithm,
  planRound,
  toIndexArrays,
  treeOut,
  type IndexArrays,
  type ParseTreeToAstData,
} from '../src/algorithm.js';
import { parseTreeToAstFacet } from '../src/facet.js';
import { parseTreeToAstImperativeIR } from '../src/irs.js';
import { layoutTree } from '../src/parse-tree-to-ast-stage.js';

const data = parseTreeToAstFacet.initialData as unknown as ParseTreeToAstData;

/** 사양 실측표 (sim parse-tree-to-ast) — [문법, 괄호, 토큰, 펼침, 파스 마디, 파스 층, AST, AST 마디, AST 층, 버린 토큰, 값, 판 걸음] */
const TABLE: [number, number, number, number, number, number, string, number, number, number, number, number][] = [
  [0, 0, 5, 6, 11, 5, '-(-(a, b), 1)', 5, 3, 0, 1, 6],
  [0, 1, 7, 8, 15, 7, '-(-(a, b), 1)', 5, 3, 2, 1, 7],
  [0, 2, 9, 10, 19, 9, '-(-(a, b), 1)', 5, 3, 4, 1, 7],
  [0, 3, 7, 8, 15, 6, '-(a, -(b, 1))', 5, 3, 2, 3, 7],
  [1, 0, 5, 6, 11, 5, '-(a, -(b, 1))', 5, 3, 0, 3, 6],
  [1, 1, 7, 8, 15, 6, '-(-(a, b), 1)', 5, 3, 2, 1, 7],
  [1, 2, 9, 10, 19, 8, '-(-(a, b), 1)', 5, 3, 4, 1, 7],
  [1, 3, 7, 8, 15, 7, '-(a, -(b, 1))', 5, 3, 2, 3, 7],
];

/** 걷기 걸음 (sim) — [규약, 걷은 마디, 남은 마디, 버린 토큰 누적] */
const WALKS: Record<string, [string, number, number, number][]> = {
  '0,0': [['leaf', 3, 8, 0], ['pass', 1, 7, 0], ['op', 2, 5, 0]],
  '0,1': [['leaf', 3, 12, 0], ['pass', 2, 10, 0], ['paren', 1, 7, 2], ['op', 2, 5, 2]],
  '0,2': [['leaf', 3, 16, 0], ['pass', 3, 13, 0], ['paren', 2, 7, 4], ['op', 2, 5, 4]],
  '0,3': [['leaf', 3, 12, 0], ['pass', 2, 10, 0], ['paren', 1, 7, 2], ['op', 2, 5, 2]],
  '1,0': [['leaf', 3, 8, 0], ['pass', 1, 7, 0], ['op', 2, 5, 0]],
  '1,1': [['leaf', 3, 12, 0], ['pass', 2, 10, 0], ['paren', 1, 7, 2], ['op', 2, 5, 2]],
  '1,2': [['leaf', 3, 16, 0], ['pass', 3, 13, 0], ['paren', 2, 7, 4], ['op', 2, 5, 4]],
  '1,3': [['leaf', 3, 12, 0], ['pass', 2, 10, 0], ['paren', 1, 7, 2], ['op', 2, 5, 2]],
};

function evaluate(a: IndexArrays): { value: number; size: number } {
  const sizes = [0];
  const value = runIR(parseTreeToAstImperativeIR, 'evaluate', [a.root, a.conv, a.kid0, a.kid1, a.kid2, a.leafVal, sizes]);
  if (typeof value !== 'number' || typeof sizes[0] !== 'number') throw new Error('IR 답이 수가 아니다');
  return { value, size: sizes[0] };
}

/** 마디 번호를 바꿔 매긴다 — perm[옛 번호] = 새 번호 */
function renumber(a: IndexArrays, perm: number[]): IndexArrays {
  const len = a.conv.length;
  const out: IndexArrays = {
    root: perm[a.root]!,
    conv: new Array<number>(len),
    kid0: new Array<number>(len),
    kid1: new Array<number>(len),
    kid2: new Array<number>(len),
    leafVal: new Array<number>(len),
  };
  const mapKid = (k: number): number => (k < 0 ? -1 : perm[k]!);
  for (let i = 0; i < len; i += 1) {
    const j = perm[i]!;
    out.conv[j] = a.conv[i]!;
    out.kid0[j] = mapKid(a.kid0[i]!);
    out.kid1[j] = mapKid(a.kid1[i]!);
    out.kid2[j] = mapKid(a.kid2[i]!);
    out.leafVal[j] = a.leafVal[i]!;
  }
  return out;
}

/** 식까지 적힌 생성기 (선형 합동) */
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('parse-tree-to-ast — 사양 표 대조', () => {
  it('여덟 조합 모두 실측표와 같다', () => {
    for (const [g, pa, tokens, inner, total, levels, ast, astNodes, astLevels, dropped, value, steps] of TABLE) {
      const plan = planRound(data, pa, g);
      expect(plan.tokens.length).toBe(tokens);
      expect(plan.stats.inner).toBe(inner);
      expect(plan.stats.total).toBe(total);
      expect(plan.stats.leaves).toBe(total - inner);
      expect(plan.stats.levels).toBe(levels);
      expect(plan.astString).toBe(ast);
      expect(plan.astNodes).toBe(astNodes);
      expect(plan.astLevels).toBe(astLevels);
      expect(plan.walks.at(-1)!.droppedTotal).toBe(dropped);
      expect(plan.value).toBe(value);
      // 판 걸음 = 시작 · 파스 나무 · 걷기 · 값
      expect(2 + plan.walks.length + 1).toBe(steps);
      expect(plan.walks.map((w) => [w.conv, w.count, w.remaining, w.droppedTotal])).toEqual(WALKS[`${g},${pa}`]);
    }
  });

  it('기본값의 파스 나무와 IR 배열이 사양의 대조와 같다', () => {
    const plan = planRound(data, data.parens, data.grammar);
    expect(parseTreeText(plan.parseTree)).toBe('R1 [ R2 [ R3 [ ( · R1 [ R2 [ R4 [ a ] ] · - · R4 [ b ] ] · ) ] ] · - · R5 [ 1 ] ]');
    const a = toIndexArrays(plan.parseTree, data.names);
    expect(a.conv).toEqual([0, 1, 2, 4, 0, 1, 3, 4, 4, 3, 4, 4, 4, 3, 4]);
    expect(a.kid0).toEqual([1, 2, 3, -1, 5, 6, 7, -1, -1, 10, -1, -1, -1, 14, -1]);
    expect(a.kid1).toEqual([12, -1, 4, -1, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]);
    expect(a.kid2).toEqual([13, -1, 11, -1, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]);
    expect(a.leafVal).toEqual([0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 3, 0, 0, 0, 1]);
  });
});

describe('parse-tree-to-ast — IR ↔ algorithm', () => {
  const combos: [number, number][] = [];
  for (const g of data.grammarLadder) for (const pa of data.parensLadder) combos.push([pa, g]);

  it('모든 손잡이 조합에서 IR 의 값 · AST 크기가 화면과 같다', () => {
    expect(combos.length).toBe(8);
    for (const [pa, g] of combos) {
      const plan = planRound(data, pa, g);
      const got = evaluate(toIndexArrays(plan.parseTree, data.names));
      expect(got.value).toBe(plan.value);
      expect(got.size).toBe(plan.astNodes);
    }
  });

  it('마디 번호를 서른 번 섞어도 같다', () => {
    const rnd = lcg(20260926);
    for (const [pa, g] of combos) {
      const plan = planRound(data, pa, g);
      const a = toIndexArrays(plan.parseTree, data.names);
      for (let k = 0; k < 30; k += 1) {
        const perm = a.conv.map((_, i) => i);
        for (let i = perm.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rnd() * (i + 1));
          [perm[i], perm[j]] = [perm[j]!, perm[i]!];
        }
        const got = evaluate(renumber(a, perm));
        expect(got.value).toBe(plan.value);
        expect(got.size).toBe(plan.astNodes);
      }
    }
  });

  it('a · b 를 바꾼 값에서도 같다', () => {
    for (const [va, vb] of [
      [9, 2],
      [1, 7],
    ] as const) {
      const d: ParseTreeToAstData = { ...data, names: [{ name: 'a', value: va }, { name: 'b', value: vb }] };
      for (const [pa, g] of combos) {
        const plan = planRound(d, pa, g);
        const got = evaluate(toIndexArrays(plan.parseTree, d.names));
        expect(got.value).toBe(plan.value);
        expect(got.size).toBe(plan.astNodes);
      }
    }
  });
});

describe('parse-tree-to-ast — 사다리 · 자리', () => {
  it('사다리가 segments[].value 와 같다', () => {
    const controls = (parseTreeToAstFacet.blocks.controls as { controls: { action: string; segments?: { value: number }[] }[] })
      .controls;
    const seg = (action: string): number[] => controls.find((c) => c.action === action)!.segments!.map((s) => s.value);
    expect(seg('parens')).toEqual(data.parensLadder);
    expect(seg('grammar')).toEqual(data.grammarLadder);
    expect(data.sources.length).toBe(4);
    expect(data.grammars.length).toBe(2);
    expect(data.parensLadder.at(-1)).toBe(3);
    expect(data.grammarLadder.at(-1)).toBe(1);
  });

  it('AST 의 자리는 모양에서만 정한다 — 모양이 같으면 자리가 같다', () => {
    const shape = (pa: number, g: number): string => {
      const plan = planRound(data, pa, g);
      const out = treeOut(plan.ast);
      const at = layoutTree(out);
      return out.nodes.map((n) => `${n.label}@${at.get(n.id)!.x},${at.get(n.id)!.y}`).join(' ');
    };
    expect(shape(0, 0)).toBe(shape(1, 0));
    expect(shape(2, 0)).toBe(shape(1, 0));
    expect(shape(3, 0)).not.toBe(shape(1, 0));
    expect(shape(0, 1)).toBe(shape(3, 0));
  });
});

describe('parse-tree-to-ast — 회차별 계기 (A → B → A)', () => {
  it('판마다 사양 표의 계기로 되돌아가 다시 선다', async () => {
    const inputs = [
      { type: 'parens', payload: { value: 2 } },
      { type: 'parens', payload: { value: 1 } },
    ];
    const metrics = new Map<string, number>();
    const rounds: Record<string, number>[] = [];
    let cancelled = false;
    const ctx = {
      data: structuredClone(data),
      get cancelled() {
        return cancelled;
      },
      async emit(e: FacetRuntimeEvent) {
        if (e.type === 'round') rounds.push({});
        if (e.type === 'value') rounds[rounds.length - 1] = Object.fromEntries(metrics);
      },
      metric(name: string, delta: number | 'inc') {
        metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
      },
      async sleep() {
        return !cancelled;
      },
      async waitForInput() {
        const next = inputs.shift();
        if (next === undefined) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return next;
      },
      pollInput() {
        return null;
      },
    };
    await parseTreeToAstAlgorithm(ctx);
    expect(rounds).toEqual([
      { 'parse-nodes': 15, 'tree-nodes': 5, 'dropped-tokens': 2 },
      { 'parse-nodes': 19, 'tree-nodes': 5, 'dropped-tokens': 4 },
      { 'parse-nodes': 15, 'tree-nodes': 5, 'dropped-tokens': 2 },
    ]);
  });
});
