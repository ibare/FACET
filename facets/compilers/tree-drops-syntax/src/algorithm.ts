/**
 * tree-drops-syntax — 파스 나무를 후위로 걸으며 AST 규약대로 걷어 낸다.
 *
 * 파스 나무는 1차 데이터다 (파싱이 아니라 걷어 내기가 주장이라 나무를 구조로 받는다).
 * 알고리즘은 나무를 믿지 않고 확인한다 — 노드마다 자식의 기호가 규칙 몸과 차례대로 같은지,
 * 잎을 왼쪽부터 읽은 토큰 자리가 0 · 1 · … 인지, 원문에서 빈칸을 뺀 글자가 토큰 원문을 이은 것과 같은지.
 * 어긋나면 노드 자리(전위 번호)를 담아 던진다.
 *
 * 이벤트 (걸음 0 은 scene.initial 이 initialData 로 세운다 — init 이벤트는 없다)
 *
 *   walk  (silent 아님) — 안쪽 노드 하나를 규약대로 바꾼 한 걸음. 후위 차례
 *     payload: {
 *       node:    string            바뀌는 안쪽 노드 id ('n0' …, 전위 번호)
 *       rule:    string            그 노드의 규칙 id ('R1' …)
 *       kind:    'op' | 'pass' | 'paren' | 'leaf'   AST 규약
 *       lift:    string            그 자리로 오르는 것의 id (노드 id 또는 토큰 id 't0' …)
 *       kids:    string[]          op 일 때 오른 연산자 노드의 새 자식 id 둘 (왼쪽 · 오른쪽). 그 밖엔 []
 *       dropped: number[]          버린 토큰 자리 (paren 일 때 괄호 둘). 그 밖엔 []
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type AstKind = 'op' | 'pass' | 'paren' | 'leaf';

export type GrammarRule = { id: string; lhs: string; rhs: string[]; ast: AstKind };
export type Token = { kind: string; text: string };
export type TreeSpec = { rule: string; kids: TreeSpec[] } | { tok: number };

export type TreeDropsSyntaxFacetData = {
  type: 'tree-drops-syntax';
  stepMs: number;
  source: string;
  tokens: Token[];
  rules: GrammarRule[];
  tree: TreeSpec;
};

/**
 * 나무 노드 — 파스 나무와 AST 가 한 모양을 쓴다.
 * 안쪽 파스 노드는 `rule` 이 있고 `tok` 이 없다. 토큰은 `tok` 이 있고, 연산자로 올라서면 자식을 얻는다.
 */
export type TreeNode = {
  id: string;
  rule: string | null;
  tok: number | null;
  kids: TreeNode[];
};

const AST_KINDS: readonly AstKind[] = ['op', 'pass', 'paren', 'leaf'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readToken(v: unknown, i: number): Token {
  if (!isRecord(v) || typeof v.kind !== 'string' || typeof v.text !== 'string') {
    throw new Error(`tree-drops-syntax: 토큰 #${i} 의 모양이 틀렸다`);
  }
  return { kind: v.kind, text: v.text };
}

function readRule(v: unknown, i: number): GrammarRule {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.lhs !== 'string' || !Array.isArray(v.rhs)) {
    throw new Error(`tree-drops-syntax: 규칙 #${i} 의 모양이 틀렸다`);
  }
  const rhs = v.rhs.map((s, k) => {
    if (typeof s !== 'string') throw new Error(`tree-drops-syntax: 규칙 ${String(v.id)} 의 몸 #${k} 가 글자가 아니다`);
    return s;
  });
  const ast = AST_KINDS.find((k) => k === v.ast);
  if (ast === undefined) throw new Error(`tree-drops-syntax: 규칙 ${v.id} 의 AST 규약을 모른다 — ${String(v.ast)}`);
  return { id: v.id, lhs: v.lhs, rhs, ast };
}

function readSpec(v: unknown, path: string): TreeSpec {
  if (!isRecord(v)) throw new Error(`tree-drops-syntax: 나무 ${path} 가 객체가 아니다`);
  const keys = Object.keys(v).sort().join(',');
  if (keys === 'tok') {
    if (typeof v.tok !== 'number' || !Number.isInteger(v.tok)) {
      throw new Error(`tree-drops-syntax: 나무 ${path} 의 토큰 자리가 정수가 아니다`);
    }
    return { tok: v.tok };
  }
  if (keys === 'kids,rule') {
    if (typeof v.rule !== 'string' || !Array.isArray(v.kids)) {
      throw new Error(`tree-drops-syntax: 나무 ${path} 의 rule · kids 모양이 틀렸다`);
    }
    return { rule: v.rule, kids: v.kids.map((k, i) => readSpec(k, `${path}.${i}`)) };
  }
  throw new Error(`tree-drops-syntax: 나무 ${path} 의 모양을 모른다 — 필드 [${keys}]`);
}

/** initialData 를 좁힌다. 모양이 틀리면 던진다. */
export function readTreeDropsData(raw: unknown): TreeDropsSyntaxFacetData {
  if (!isRecord(raw)) throw new Error('tree-drops-syntax: initialData 가 없다');
  if (raw.type !== 'tree-drops-syntax') throw new Error(`tree-drops-syntax: 모르는 type ${String(raw.type)}`);
  if (typeof raw.source !== 'string') throw new Error('tree-drops-syntax: source 가 없다');
  if (typeof raw.stepMs !== 'number' || !Number.isFinite(raw.stepMs) || raw.stepMs <= 0) {
    throw new Error(`tree-drops-syntax: stepMs 는 0 보다 큰 수여야 한다 — ${String(raw.stepMs)}`);
  }
  if (!Array.isArray(raw.tokens) || !Array.isArray(raw.rules)) {
    throw new Error('tree-drops-syntax: tokens · rules 가 배열이 아니다');
  }
  return {
    type: 'tree-drops-syntax',
    stepMs: raw.stepMs,
    source: raw.source,
    tokens: raw.tokens.map(readToken),
    rules: raw.rules.map(readRule),
    tree: readSpec(raw.tree, 'root'),
  };
}

/** 문법이 보는 단말 — NAME · NUM 은 종류 이름, 그 밖은 원문. */
export function terminalOf(tok: Token): string {
  return tok.kind === 'NAME' || tok.kind === 'NUM' ? tok.kind : tok.text;
}

export function ruleById(rules: readonly GrammarRule[], id: string): GrammarRule {
  const r = rules.find((x) => x.id === id);
  if (r === undefined) throw new Error(`tree-drops-syntax: 없는 규칙 ${id}`);
  return r;
}

/** 규칙 글자 — `Factor → ( Expr )`. */
export function ruleText(r: GrammarRule): string {
  return `${r.lhs} → ${r.rhs.length === 0 ? 'ε' : r.rhs.join(' ')}`;
}

/**
 * 파스 나무를 확인하며 노드로 세운다. 안쪽 노드 id 는 전위 번호 `n0` …, 토큰은 `t<자리>`.
 * 장면(걸음 0)과 알고리즘이 같은 함수를 부른다.
 */
export function buildParseTree(data: TreeDropsSyntaxFacetData): TreeNode {
  const joined = data.tokens.map((t) => t.text).join('');
  const bare = data.source.replace(/\s+/g, '');
  if (joined !== bare) throw new Error(`tree-drops-syntax: 원문 "${bare}" 과 토큰 원문 "${joined}" 이 다르다`);

  let inner = 0;
  let nextLeaf = 0;
  const walk = (spec: TreeSpec): { node: TreeNode; sym: string } => {
    if ('tok' in spec) {
      if (spec.tok !== nextLeaf) {
        throw new Error(`tree-drops-syntax: 잎 차례가 틀렸다 — 기대 ${nextLeaf}, 받음 ${spec.tok}`);
      }
      const tok = data.tokens[spec.tok];
      if (tok === undefined) throw new Error(`tree-drops-syntax: 없는 토큰 자리 ${spec.tok}`);
      nextLeaf += 1;
      return { node: { id: `t${spec.tok}`, rule: null, tok: spec.tok, kids: [] }, sym: terminalOf(tok) };
    }
    const id = `n${inner}`;
    inner += 1;
    const rule = ruleById(data.rules, spec.rule);
    const kids = spec.kids.map(walk);
    const syms = kids.map((k) => k.sym);
    if (syms.length !== rule.rhs.length || syms.some((s, i) => s !== rule.rhs[i])) {
      throw new Error(
        `tree-drops-syntax: 노드 ${id} (${rule.id}) 의 자식 [${syms.join(' ')}] 이 몸 [${rule.rhs.join(' ')}] 과 다르다`,
      );
    }
    return { node: { id, rule: rule.id, tok: null, kids: kids.map((k) => k.node) }, sym: rule.lhs };
  };
  const root = walk(data.tree).node;
  if (nextLeaf !== data.tokens.length) {
    throw new Error(`tree-drops-syntax: 잎 ${nextLeaf} 개 — 토큰은 ${data.tokens.length} 개`);
  }
  return root;
}

export function countNodes(n: TreeNode): number {
  return 1 + n.kids.reduce((s, k) => s + countNodes(k), 0);
}

export function depthOf(n: TreeNode): number {
  return 1 + n.kids.reduce((m, k) => Math.max(m, depthOf(k)), 0);
}

/** 나무에 남은 토큰 자리 (잎이든 연산자 노드든). */
export function tokensIn(n: TreeNode): number[] {
  const own = n.tok === null ? [] : [n.tok];
  return [...own, ...n.kids.flatMap(tokensIn)];
}

export type WalkPayload = {
  node: string;
  rule: string;
  kind: AstKind;
  lift: string;
  kids: string[];
  dropped: number[];
};

export async function treeDropsSyntax(context: FacetContext<TreeDropsSyntaxFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<TreeDropsSyntaxFacetData>;
  const data = readTreeDropsData(ctx.data);
  const stepMs = data.stepMs;
  const root = buildParseTree(data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 후위 차례 — 자식을 왼쪽부터 먼저, 그다음 부모.
  const order: TreeNode[] = [];
  const post = (n: TreeNode): void => {
    for (const k of n.kids) post(k);
    if (n.rule !== null) order.push(n);
  };
  post(root);

  /** 노드 자리에 지금 서 있는 것의 id. */
  const standing = new Map<string, string>();
  const at = (n: TreeNode): string => {
    if (n.rule === null) return n.id;
    const s = standing.get(n.id);
    if (s === undefined) throw new Error(`tree-drops-syntax: 노드 ${n.id} 가 아직 걷히지 않았다`);
    return s;
  };
  const tokAt = (n: TreeNode | undefined, where: string): TreeNode => {
    if (n === undefined || n.tok === null) throw new Error(`tree-drops-syntax: ${where} 에 토큰 잎이 없다`);
    return n;
  };

  for (const n of order) {
    if (!(await pause())) return;
    if (n.rule === null) throw new Error(`tree-drops-syntax: 잎 ${n.id} 을 걸을 수 없다`);
    const rule = ruleById(data.rules, n.rule);
    let payload: WalkPayload;
    if (rule.ast === 'op') {
      const [l, o, r] = n.kids;
      if (n.kids.length !== 3 || l === undefined || r === undefined) {
        throw new Error(`tree-drops-syntax: op 규약의 노드 ${n.id} 는 자식이 셋이어야 한다`);
      }
      const opTok = tokAt(o, `노드 ${n.id} 의 가운데`);
      payload = { node: n.id, rule: rule.id, kind: 'op', lift: opTok.id, kids: [at(l), at(r)], dropped: [] };
      standing.set(n.id, opTok.id);
    } else if (rule.ast === 'pass') {
      const [only] = n.kids;
      if (n.kids.length !== 1 || only === undefined || only.rule === null) {
        throw new Error(`tree-drops-syntax: pass 규약의 노드 ${n.id} 는 안쪽 자식 하나여야 한다`);
      }
      payload = { node: n.id, rule: rule.id, kind: 'pass', lift: at(only), kids: [], dropped: [] };
      standing.set(n.id, at(only));
    } else if (rule.ast === 'paren') {
      const [open, mid, close] = n.kids;
      if (n.kids.length !== 3 || mid === undefined) {
        throw new Error(`tree-drops-syntax: paren 규약의 노드 ${n.id} 는 자식이 셋이어야 한다`);
      }
      const a = tokAt(open, `노드 ${n.id} 의 왼쪽`);
      const b = tokAt(close, `노드 ${n.id} 의 오른쪽`);
      if (a.tok === null || b.tok === null) throw new Error(`tree-drops-syntax: 노드 ${n.id} 의 괄호 자리가 없다`);
      payload = { node: n.id, rule: rule.id, kind: 'paren', lift: at(mid), kids: [], dropped: [a.tok, b.tok] };
      standing.set(n.id, at(mid));
    } else if (rule.ast === 'leaf') {
      const [only] = n.kids;
      const leaf = tokAt(only, `노드 ${n.id} 의 아래`);
      if (n.kids.length !== 1) throw new Error(`tree-drops-syntax: leaf 규약의 노드 ${n.id} 는 자식이 하나여야 한다`);
      payload = { node: n.id, rule: rule.id, kind: 'leaf', lift: leaf.id, kids: [], dropped: [] };
      standing.set(n.id, leaf.id);
    } else {
      throw new Error(`tree-drops-syntax: 규칙 ${rule.id} 의 AST 규약을 모른다`);
    }
    await ctx.emit({ type: 'walk', target: `tree:${n.id}`, payload });
  }
}
