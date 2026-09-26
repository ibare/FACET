/**
 * derivation-tree 장면.
 *
 * 바탕: 문법 · 토큰 · 원문 · 층 수 (init 이 한 번 정한다)
 * 자취: 매단 노드 전부 (펼친 노드는 지워지지 않는다) · 읽은 잎의 짝
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readDerivationData, startSymbol, type GrammarRule, type SourceToken } from './algorithm.js';

export type TreeNode = {
  id: number;
  sym: string;
  terminal: boolean;
  parent: number | null;
  depth: number;
  /** 끝내 덮는 토큰 자리 [from, to) */
  from: number;
  to: number;
  /** 펼친 규칙 id. 아직 펼치지 않았거나 잎이면 null */
  rule: string | null;
};

export type LeafPair = { node: number; token: number };

export type DerivationStep =
  | { kind: 'start' }
  | { kind: 'hang'; parent: number; rule: string; kids: number[] }
  | { kind: 'read'; matched: number };

export type DerivationTreeScene = {
  rules: GrammarRule[];
  tokens: SourceToken[];
  source: string;
  levels: number;
  nodes: TreeNode[];
  pairs: LeafPair[];
  step: DerivationStep;
};

function fail(msg: string): never {
  throw new Error(`derivation-tree scene: ${msg}`);
}

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(`${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function int(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(`${what} 가 0 이상 정수가 아니다`);
  return v;
}

export const derivationTreeScene: ScenePlan<DerivationTreeScene> = {
  initial(initialData: unknown): DerivationTreeScene {
    const data = readDerivationData(initialData);
    return {
      rules: data.rules.map((r) => ({ id: r.id, lhs: r.lhs, rhs: [...r.rhs] })),
      tokens: data.tokens.map((tk) => ({ kind: tk.kind, text: tk.text })),
      source: data.source,
      levels: 1,
      nodes: [
        {
          id: 0,
          sym: startSymbol(data.rules),
          terminal: false,
          parent: null,
          depth: 1,
          from: 0,
          to: data.tokens.length,
          rule: null,
        },
      ],
      pairs: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: DerivationTreeScene, event: FacetRuntimeEvent): DerivationTreeScene {
    const p = rec(event.payload, `${event.type} payload`);
    switch (event.type) {
      case 'init':
        return { ...scene, levels: int(p.levels, 'levels') };
      case 'hang': {
        const parentId = int(p.parent, 'parent');
        const rule = p.rule;
        if (typeof rule !== 'string') fail('rule 이 글자가 아니다');
        const parent = scene.nodes.find((n) => n.id === parentId);
        if (parent === undefined) fail(`없는 노드 ${parentId} 아래에 매달 수 없다`);
        if (!Array.isArray(p.kids)) fail('kids 가 목록이 아니다');
        const kids = p.kids.map((raw, i): TreeNode => {
          const k = rec(raw, `kids #${i}`);
          if (typeof k.sym !== 'string' || typeof k.terminal !== 'boolean') fail(`kids #${i} 의 모양이 틀렸다`);
          return {
            id: int(k.id, 'kid id'),
            sym: k.sym,
            terminal: k.terminal,
            parent: parentId,
            depth: parent.depth + 1,
            from: int(k.from, 'from'),
            to: int(k.to, 'to'),
            rule: null,
          };
        });
        const nodes = scene.nodes.map((n) => (n.id === parentId ? { ...n, rule } : { ...n }));
        return {
          ...scene,
          nodes: [...nodes, ...kids],
          step: { kind: 'hang', parent: parentId, rule, kids: kids.map((k) => k.id) },
        };
      }
      case 'read': {
        if (!Array.isArray(p.pairs)) fail('pairs 가 목록이 아니다');
        const pairs = p.pairs.map((raw, i): LeafPair => {
          const q = rec(raw, `pairs #${i}`);
          return { node: int(q.node, 'node'), token: int(q.token, 'token') };
        });
        return {
          ...scene,
          nodes: scene.nodes.map((n) => ({ ...n })),
          pairs,
          step: { kind: 'read', matched: int(p.matched, 'matched') },
        };
      }
      default:
        fail(`모르는 이벤트: ${event.type}`);
    }
  },
};
