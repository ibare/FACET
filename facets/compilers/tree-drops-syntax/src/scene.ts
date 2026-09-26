/**
 * tree-drops-syntax 장면.
 *
 * 바탕 — 원문 · 토큰 · 규칙 (initialData 에서 베낀다)
 * 자취 — 지금의 나무 · 버린 토큰 자리 · 걸은 노드 수
 * 이번 걸음 — 무엇을 바꿨는가와, 바꾸기 앞의 나무(`before`: 운동의 출발)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  buildParseTree,
  readTreeDropsData,
  type AstKind,
  type GrammarRule,
  type Token,
  type TreeNode,
} from './algorithm.js';

export type TreeDropsStep = {
  node: string;
  rule: string;
  kind: AstKind;
  lift: string;
  dropped: number[];
  before: TreeNode;
};

export type TreeDropsSyntaxScene = {
  source: string;
  tokens: Token[];
  rules: GrammarRule[];
  tree: TreeNode;
  dropped: number[];
  walked: number;
  step: TreeDropsStep | null;
};

const KINDS: readonly AstKind[] = ['op', 'pass', 'paren', 'leaf'];

function strings(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`tree-drops-syntax 장면: ${what} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`tree-drops-syntax 장면: ${what} 에 글자가 아닌 값`);
    return x;
  });
}

function numbers(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`tree-drops-syntax 장면: ${what} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number') throw new Error(`tree-drops-syntax 장면: ${what} 에 수가 아닌 값`);
    return x;
  });
}

/** 노드 id 자리를 `make(그 노드)` 로 갈아 끼운 새 나무. 못 찾으면 null. */
function replace(n: TreeNode, id: string, make: (old: TreeNode) => TreeNode): TreeNode | null {
  if (n.id === id) return make(n);
  for (const [i, kid] of n.kids.entries()) {
    const got = replace(kid, id, make);
    if (got !== null) {
      const kids = n.kids.slice();
      kids[i] = got;
      return { ...n, kids };
    }
  }
  return null;
}

function kidById(n: TreeNode, id: string): TreeNode {
  const k = n.kids.find((x) => x.id === id);
  if (k === undefined) throw new Error(`tree-drops-syntax 장면: 노드 ${n.id} 아래에 ${id} 가 없다`);
  return k;
}

export const treeDropsSyntaxScene: ScenePlan<TreeDropsSyntaxScene> = {
  initial(initialData: unknown): TreeDropsSyntaxScene {
    const data = readTreeDropsData(initialData);
    return {
      source: data.source,
      tokens: data.tokens.map((t) => ({ ...t })),
      rules: data.rules.map((r) => ({ ...r, rhs: r.rhs.slice() })),
      tree: buildParseTree(data),
      dropped: [],
      walked: 0,
      step: null,
    };
  },

  reduce(scene: TreeDropsSyntaxScene, event: FacetRuntimeEvent): TreeDropsSyntaxScene {
    if (event.type !== 'walk') throw new Error(`tree-drops-syntax 장면: 모르는 이벤트 ${event.type}`);
    const p = event.payload;
    if (typeof p !== 'object' || p === null) throw new Error('tree-drops-syntax 장면: walk 에 payload 가 없다');
    const node: unknown = Reflect.get(p, 'node');
    const rule: unknown = Reflect.get(p, 'rule');
    const kindRaw: unknown = Reflect.get(p, 'kind');
    const lift: unknown = Reflect.get(p, 'lift');
    if (typeof node !== 'string' || typeof rule !== 'string' || typeof lift !== 'string') {
      throw new Error('tree-drops-syntax 장면: walk payload 의 node · rule · lift 가 글자가 아니다');
    }
    const kind = KINDS.find((k) => k === kindRaw);
    if (kind === undefined) throw new Error(`tree-drops-syntax 장면: 모르는 규약 ${String(kindRaw)}`);
    const kids = strings(Reflect.get(p, 'kids'), 'kids');
    const dropped = numbers(Reflect.get(p, 'dropped'), 'dropped');

    const tree = replace(scene.tree, node, (old) => {
      const risen = kidById(old, lift);
      if (kind !== 'op') return risen;
      return { ...risen, kids: kids.map((id) => kidById(old, id)) };
    });
    if (tree === null) throw new Error(`tree-drops-syntax 장면: 나무에 노드 ${node} 가 없다`);

    return {
      ...scene,
      tree,
      dropped: [...scene.dropped, ...dropped],
      walked: scene.walked + 1,
      step: { node, rule, kind, lift, dropped, before: scene.tree },
    };
  },
};
