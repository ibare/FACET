/**
 * parse-tree-to-ast — 파스 나무를 걷어 AST 로 만든다.
 *
 * 토큰기가 원시 글을 토큰으로 자르고, 문법에서 지은 SLR(1) 표로 토큰 열을 파싱해 파스 나무를 얻는다
 * (접을 때마다 마디 하나). 그 나무를 AST 규약 넷으로 걷는다 — 규약 하나 = 한 걸음, 그 규약의 마디를
 * 한꺼번에. 차례는 leaf → pass → paren → op. 걸을 마디가 없는 규약은 걸음을 두지 않는다.
 * 끝에 AST 로 값을 셈한다 (`-` = 왼쪽 − 오른쪽).
 *
 * 규약 (tree-drops-syntax 와 같다):
 *   op    가운데 연산자 잎이 마디 이름으로 오르고 자식 = 왼쪽 · 오른쪽 결과 (마디 −1)
 *   pass  마디가 사라지고 하나뿐인 자식의 결과가 오른다 (−1)
 *   paren 괄호 잎 둘을 버리고 가운데 결과가 오른다 (마디와 괄호 잎 둘로 −3)
 *   leaf  마디가 사라지고 잎(토큰)이 오른다 (−1)
 *   네 값 밖이면 던진다.
 *
 * 나무를 세는 법: 마디 = 안쪽 + 잎, 층은 뿌리 = 1 층. 펼침 = 안쪽 마디 수.
 * 동률 규칙: 없다 — SLR(1) 표에 충돌이 있으면 던진다 (이 데이터의 두 문법은 충돌 0).
 *
 * 코드 패널의 IR(`irs.ts`)은 다른 길로 같은 답을 낸다 — 파스 나무의 전위 색인 배열을 받아
 * 같은 네 규약으로 값과 AST 크기를 셈한다. 이 파일의 `toIndexArrays` 가 그 배열을 짓는다.
 *
 * ── 이벤트 (reactive, 판 하나 = 괄호 없음 6 걸음 · 괄호 있음 7 걸음)
 *   phase       { phase: 'leaf' | 'pass' | 'paren' | 'op' | 'value' }                    silent
 *   round       { source, tokens: TokenOut[], tokenCount, rules: RuleOut[], grammar: number,
 *                 parens: number }                                                         걸음 #0
 *   parse-tree  { tree: TreeOut, total, inner, leaves, levels }                            걸음 #1
 *   walk        { conv, count, removed: string[], dropped: string[], droppedNow, risen: string[],
 *                 tree: TreeOut, remaining, droppedTotal }                                 걷기 걸음마다
 *   value       { ast, value, astNodes, astLevels, values: { id, value }[] }              끝 걸음
 *     TokenOut = { kind, text } · RuleOut = { name: 'R1'…, lhs, rhs: string[], conv }
 *     TreeOut  = { root: string, nodes: { id, label, kind: 'rule' | 'token' | 'op', conv: string | null,
 *                  kids: string[] }[] }  (nodes 는 전위 차례)
 *
 * ── phase 어휘 — leaf · pass · paren · op · value (irs.ts 와 같다)
 *   걸음 #0 · #1 은 phase 가 없다 (파싱은 IR 밖) — projector 가 round 에서 강조를 끈다.
 *
 * ── 계기
 *   parse-nodes     #1 에 파스 나무 마디 수
 *   tree-nodes      지금 나무의 마디 수 — #1 에 파스 마디, 걷기 걸음마다 줄어 끝에 AST 마디
 *   dropped-tokens  paren 걸음에 버린 괄호 잎 누적
 *   판 머리에서 셋 다 0 으로 되돌린다 (지금 값을 들고 차이만 보낸다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Conv = 'op' | 'pass' | 'paren' | 'leaf';
export const CONV_ORDER: readonly Conv[] = ['leaf', 'pass', 'paren', 'op'];

export type ParseTreeToAstRule = { lhs: string; rhs: string[]; conv: string };
export type ParseTreeToAstGrammar = { id: string; rules: ParseTreeToAstRule[] };
export type ParseTreeToAstName = { name: string; value: number };

export type ParseTreeToAstData = {
  type: 'parse-tree-to-ast';
  stepMs: number;
  /** 문법의 시작 기호 */
  start: string;
  /** 원시 글 넷 — 괄호 손잡이 사다리 차례 */
  sources: string[];
  /** 문법 둘 — 문법 손잡이 사다리 차례 */
  grammars: ParseTreeToAstGrammar[];
  /** 이름의 값 (예로 정한 값) */
  names: ParseTreeToAstName[];
  parensLadder: number[];
  grammarLadder: number[];
  /** 기본값 */
  parens: number;
  grammar: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// 좁히개
// ─────────────────────────────────────────────────────────────────────────────

export function isConv(x: unknown): x is Conv {
  return x === 'op' || x === 'pass' || x === 'paren' || x === 'leaf';
}

function toConv(x: string): Conv {
  if (!isConv(x)) throw new Error(`parse-tree-to-ast: 모르는 AST 규약 "${x}"`);
  return x;
}

// ─────────────────────────────────────────────────────────────────────────────
// 토큰기 (parsing common)
// ─────────────────────────────────────────────────────────────────────────────

export type Token = { kind: string; text: string };

const OPS = new Set(['+', '-', '*', '=']);
const PUNCTS = new Set(['(', ')', ',']);
const KEYWORDS = new Set(['show']);

export function tokenize(source: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === ' ') {
      i += 1;
    } else if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < source.length && /[A-Za-z0-9]/.test(source[j]!)) j += 1;
      const word = source.slice(i, j);
      out.push({ kind: KEYWORDS.has(word) ? word.toUpperCase() : 'NAME', text: word });
      i = j;
    } else if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < source.length && /[0-9]/.test(source[j]!)) j += 1;
      out.push({ kind: 'NUM', text: source.slice(i, j) });
      i = j;
    } else if (OPS.has(ch)) {
      out.push({ kind: 'OP', text: ch });
      i += 1;
    } else if (PUNCTS.has(ch)) {
      out.push({ kind: 'PUNCT', text: ch });
      i += 1;
    } else {
      throw new Error(`parse-tree-to-ast: 토큰이 될 수 없는 글자 "${ch}"`);
    }
  }
  const joined = out.map((tk) => tk.text).join('');
  if (joined !== source.replace(/ /g, '')) {
    throw new Error(`parse-tree-to-ast: 토큰 원문을 이은 글이 원시와 다르다 (${joined})`);
  }
  return out;
}

/** 문법이 보는 단말 — NAME · NUM 은 종류 이름, 그 밖은 원문 */
export function terminalOf(tk: Token): string {
  return tk.kind === 'NAME' || tk.kind === 'NUM' ? tk.kind : tk.text;
}

// ─────────────────────────────────────────────────────────────────────────────
// SLR(1) 표 (parsing common) — 문법 앞에 S' → 시작, LR(0) 항목 모음, FOLLOW 로 접기
// ─────────────────────────────────────────────────────────────────────────────

export const EOF = 'EOF';
const AUG = "S'";

type Prod = { lhs: string; rhs: string[] };
type Action = { kind: 'shift'; to: number } | { kind: 'reduce'; prod: number } | { kind: 'accept' };
export type SlrTable = {
  prods: Prod[];
  action: Map<string, Action>[];
  gotoNt: Map<string, number>[];
};

export function buildSlr(rules: readonly ParseTreeToAstRule[], start: string): SlrTable {
  const prods: Prod[] = [{ lhs: AUG, rhs: [start] }, ...rules.map((r) => ({ lhs: r.lhs, rhs: [...r.rhs] }))];
  for (const p of prods) {
    if (p.rhs.length === 0) throw new Error('parse-tree-to-ast: 빈 규칙은 다루지 않는다');
  }
  const nts = new Set(prods.map((p) => p.lhs));
  const isNt = (s: string): boolean => nts.has(s);
  if (!isNt(start)) throw new Error(`parse-tree-to-ast: 시작 기호 ${start} 의 규칙이 없다`);

  // FIRST (빈 규칙이 없으니 rhs 첫 기호만 본다)
  const first = new Map<string, Set<string>>();
  for (const n of nts) first.set(n, new Set());
  const firstOf = (s: string): Set<string> => (isNt(s) ? first.get(s)! : new Set([s]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of prods) {
      const into = first.get(p.lhs)!;
      for (const x of firstOf(p.rhs[0]!)) {
        if (!into.has(x)) {
          into.add(x);
          changed = true;
        }
      }
    }
  }
  // FOLLOW
  const follow = new Map<string, Set<string>>();
  for (const n of nts) follow.set(n, new Set());
  follow.get(AUG)!.add(EOF);
  changed = true;
  while (changed) {
    changed = false;
    for (const p of prods) {
      p.rhs.forEach((sym, k) => {
        if (!isNt(sym)) return;
        const into = follow.get(sym)!;
        const src = k + 1 < p.rhs.length ? firstOf(p.rhs[k + 1]!) : follow.get(p.lhs)!;
        for (const x of src) {
          if (!into.has(x)) {
            into.add(x);
            changed = true;
          }
        }
      });
    }
  }

  // LR(0) 항목 모음
  type Item = { prod: number; dot: number };
  const keyOf = (items: Item[]): string =>
    items
      .map((it) => `${it.prod}.${it.dot}`)
      .sort()
      .join(' ');
  const closure = (seed: Item[]): Item[] => {
    const out = [...seed];
    const seen = new Set(out.map((it) => `${it.prod}.${it.dot}`));
    for (let k = 0; k < out.length; k += 1) {
      const it = out[k]!;
      const sym = prods[it.prod]!.rhs[it.dot];
      if (sym === undefined || !isNt(sym)) continue;
      prods.forEach((p, pi) => {
        if (p.lhs !== sym) return;
        const key = `${pi}.0`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ prod: pi, dot: 0 });
      });
    }
    return out;
  };
  const states: Item[][] = [closure([{ prod: 0, dot: 0 }])];
  const index = new Map<string, number>([[keyOf(states[0]!), 0]]);
  const trans: Map<string, number>[] = [];
  for (let s = 0; s < states.length; s += 1) {
    const moves = new Map<string, Item[]>();
    for (const it of states[s]!) {
      const sym = prods[it.prod]!.rhs[it.dot];
      if (sym === undefined) continue;
      const list = moves.get(sym) ?? [];
      list.push({ prod: it.prod, dot: it.dot + 1 });
      moves.set(sym, list);
    }
    const row = new Map<string, number>();
    for (const [sym, seed] of moves) {
      const set = closure(seed);
      const key = keyOf(set);
      let to = index.get(key);
      if (to === undefined) {
        to = states.length;
        states.push(set);
        index.set(key, to);
      }
      row.set(sym, to);
    }
    trans.push(row);
  }

  const action: Map<string, Action>[] = [];
  const gotoNt: Map<string, number>[] = [];
  states.forEach((items, s) => {
    const act = new Map<string, Action>();
    const gt = new Map<string, number>();
    const put = (term: string, a: Action): void => {
      const had = act.get(term);
      if (had !== undefined && JSON.stringify(had) !== JSON.stringify(a)) {
        throw new Error(`parse-tree-to-ast: SLR(1) 충돌 — 상태 ${s}, 단말 ${term}`);
      }
      act.set(term, a);
    };
    for (const [sym, to] of trans[s]!) {
      if (isNt(sym)) gt.set(sym, to);
      else put(sym, { kind: 'shift', to });
    }
    for (const it of items) {
      const p = prods[it.prod]!;
      if (it.dot < p.rhs.length) continue;
      if (it.prod === 0) put(EOF, { kind: 'accept' });
      else for (const term of follow.get(p.lhs)!) put(term, { kind: 'reduce', prod: it.prod });
    }
    action.push(act);
    gotoNt.push(gt);
  });
  return { prods, action, gotoNt };
}

// ─────────────────────────────────────────────────────────────────────────────
// 파스 나무
// ─────────────────────────────────────────────────────────────────────────────

export type ParseNode =
  | { kind: 'rule'; id: string; rule: number; lhs: string; conv: Conv; kids: ParseNode[] }
  | { kind: 'token'; id: string; token: Token };

/** SLR(1) 표로 토큰 열을 파싱한다. 접을 때마다 마디 하나를 짓는다 (규칙 번호 = 적힌 차례, 1 부터). */
export function parse(tokens: readonly Token[], rules: readonly ParseTreeToAstRule[], start: string): ParseNode {
  const table = buildSlr(rules, start);
  const states: number[] = [0];
  const nodes: ParseNode[] = [];
  let pos = 0;
  let made = 0;
  const limit = 4 * (tokens.length + 1) * (rules.length + 1) + 8;
  for (let guard = 0; guard < limit; guard += 1) {
    const tk = tokens[pos];
    const term = tk === undefined ? EOF : terminalOf(tk);
    const act = table.action[states[states.length - 1]!]!.get(term);
    if (act === undefined) throw new Error(`parse-tree-to-ast: 문법에 맞지 않는 토큰 ${term} (자리 ${pos})`);
    if (act.kind === 'accept') {
      if (nodes.length !== 1) throw new Error('parse-tree-to-ast: 받았는데 나무가 하나가 아니다');
      return nodes[0]!;
    }
    if (act.kind === 'shift') {
      if (tk === undefined) throw new Error('parse-tree-to-ast: EOF 를 밀 수 없다');
      nodes.push({ kind: 'token', id: `t${pos}`, token: tk });
      states.push(act.to);
      pos += 1;
      continue;
    }
    const prod = table.prods[act.prod]!;
    const k = prod.rhs.length;
    const kids = nodes.splice(nodes.length - k, k);
    states.splice(states.length - k, k);
    const rule = rules[act.prod - 1]!;
    nodes.push({ kind: 'rule', id: `n${made}`, rule: act.prod, lhs: prod.lhs, conv: toConv(rule.conv), kids });
    made += 1;
    const to = table.gotoNt[states[states.length - 1]!]!.get(prod.lhs);
    if (to === undefined) throw new Error(`parse-tree-to-ast: ${prod.lhs} 로 갈 상태가 없다`);
    states.push(to);
  }
  throw new Error('parse-tree-to-ast: 파싱이 끝나지 않는다');
}

export type TreeStats = { total: number; inner: number; leaves: number; levels: number };

export function parseStats(root: ParseNode): TreeStats {
  if (root.kind === 'token') return { total: 1, inner: 0, leaves: 1, levels: 1 };
  const acc: TreeStats = { total: 1, inner: 1, leaves: 0, levels: 1 };
  for (const kid of root.kids) {
    const s = parseStats(kid);
    acc.total += s.total;
    acc.inner += s.inner;
    acc.leaves += s.leaves;
    acc.levels = Math.max(acc.levels, s.levels + 1);
  }
  return acc;
}

/** 파스 나무를 괄호 글로 — `R1 [ R2 [ … ] · - · R5 [ 1 ] ]` (사양의 대조 꼴) */
export function parseTreeText(node: ParseNode): string {
  if (node.kind === 'token') return node.token.text;
  return `R${node.rule} [ ${node.kids.map(parseTreeText).join(' · ')} ]`;
}

// ─────────────────────────────────────────────────────────────────────────────
// IR 에 넘기는 색인 배열 — 전위 차례 0 부터
// ─────────────────────────────────────────────────────────────────────────────

export const CONV_CODE: Record<Conv | 'token', number> = { op: 0, pass: 1, paren: 2, leaf: 3, token: 4 };

export type IndexArrays = {
  root: number;
  conv: number[];
  kid0: number[];
  kid1: number[];
  kid2: number[];
  leafVal: number[];
};

export function valueOfToken(tk: Token, names: readonly ParseTreeToAstName[]): number {
  if (tk.kind === 'NUM') return Number(tk.text);
  if (tk.kind === 'NAME') {
    const hit = names.find((n) => n.name === tk.text);
    if (hit === undefined) throw new Error(`parse-tree-to-ast: 이름 ${tk.text} 의 값이 없다`);
    return hit.value;
  }
  return 0;
}

export function toIndexArrays(root: ParseNode, names: readonly ParseTreeToAstName[]): IndexArrays {
  const out: IndexArrays = { root: 0, conv: [], kid0: [], kid1: [], kid2: [], leafVal: [] };
  const visit = (node: ParseNode): number => {
    const at = out.conv.length;
    out.conv.push(node.kind === 'token' ? CONV_CODE.token : CONV_CODE[node.conv]);
    out.kid0.push(-1);
    out.kid1.push(-1);
    out.kid2.push(-1);
    out.leafVal.push(node.kind === 'token' ? valueOfToken(node.token, names) : 0);
    if (node.kind === 'rule') {
      if (node.kids.length > 3) throw new Error('parse-tree-to-ast: 자식이 셋보다 많은 마디');
      const slots = [out.kid0, out.kid1, out.kid2];
      node.kids.forEach((kid, k) => {
        slots[k]![at] = visit(kid);
      });
    }
    return at;
  };
  visit(root);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 걷기 — 나무를 실제로 고친다
// ─────────────────────────────────────────────────────────────────────────────

/** 걷는 동안의 나무. op 는 연산자 잎이 마디 이름으로 오른 AST 마디 */
export type WorkNode =
  | { kind: 'rule'; id: string; rule: number; lhs: string; conv: Conv; kids: WorkNode[] }
  | { kind: 'token'; id: string; token: Token }
  | { kind: 'op'; id: string; token: Token; kids: WorkNode[] };

export function toWork(node: ParseNode): WorkNode {
  if (node.kind === 'token') return node;
  return { ...node, kids: node.kids.map(toWork) };
}

export type WalkResult = {
  tree: WorkNode;
  /** 걷힌 규칙 마디 */
  removed: string[];
  /** 버린 괄호 잎 */
  dropped: string[];
  /** 마디 이름으로 오른 연산자 잎 */
  risen: string[];
};

/** 규약 하나의 마디를 한꺼번에 걷는다 */
export function walkConv(tree: WorkNode, conv: Conv): WalkResult {
  const removed: string[] = [];
  const dropped: string[] = [];
  const risen: string[] = [];
  const go = (node: WorkNode): WorkNode => {
    if (node.kind === 'token') return node;
    const kids = node.kids.map(go);
    if (node.kind === 'op' || node.conv !== conv) return { ...node, kids };
    removed.push(node.id);
    switch (conv) {
      case 'leaf': {
        const only = kids[0];
        if (kids.length !== 1 || only === undefined || only.kind !== 'token') {
          throw new Error(`parse-tree-to-ast: leaf 마디 ${node.id} 의 자식이 잎 하나가 아니다`);
        }
        return only;
      }
      case 'pass': {
        const only = kids[0];
        if (kids.length !== 1 || only === undefined) {
          throw new Error(`parse-tree-to-ast: pass 마디 ${node.id} 의 자식이 하나가 아니다`);
        }
        return only;
      }
      case 'paren': {
        const [open, mid, close] = kids;
        if (kids.length !== 3 || open?.kind !== 'token' || close?.kind !== 'token' || mid === undefined) {
          throw new Error(`parse-tree-to-ast: paren 마디 ${node.id} 의 꼴이 ( 가운데 ) 가 아니다`);
        }
        dropped.push(open.id, close.id);
        return mid;
      }
      case 'op': {
        const [left, opTok, right] = kids;
        if (kids.length !== 3 || opTok?.kind !== 'token' || left === undefined || right === undefined) {
          throw new Error(`parse-tree-to-ast: op 마디 ${node.id} 의 꼴이 왼쪽 연산자 오른쪽이 아니다`);
        }
        risen.push(opTok.id);
        return { kind: 'op', id: opTok.id, token: opTok.token, kids: [left, right] };
      }
    }
  };
  return { tree: go(tree), removed, dropped, risen };
}

export function workCount(node: WorkNode): number {
  if (node.kind === 'token') return 1;
  return 1 + node.kids.reduce((s, k) => s + workCount(k), 0);
}

export function workLevels(node: WorkNode): number {
  if (node.kind === 'token') return 1;
  return 1 + Math.max(0, ...node.kids.map(workLevels));
}

/** 다 걷은 나무여야 한다 — 규칙 마디가 남아 있으면 던진다 */
export function astText(node: WorkNode): string {
  if (node.kind === 'token') return node.token.text;
  if (node.kind === 'rule') throw new Error(`parse-tree-to-ast: 걷히지 않은 마디 ${node.id}`);
  return `${node.token.text}(${node.kids.map(astText).join(', ')})`;
}

/** AST 로 값을 셈한다. 마디마다의 값도 함께 모은다 */
export function astValue(
  node: WorkNode,
  names: readonly ParseTreeToAstName[],
  into: { id: string; value: number }[],
): number {
  let v: number;
  if (node.kind === 'token') {
    if (node.token.kind !== 'NAME' && node.token.kind !== 'NUM') {
      throw new Error(`parse-tree-to-ast: AST 잎에 값이 없는 토큰 ${node.token.text}`);
    }
    v = valueOfToken(node.token, names);
  } else if (node.kind === 'op') {
    if (node.token.text !== '-' || node.kids.length !== 2) {
      throw new Error(`parse-tree-to-ast: 모르는 연산 ${node.token.text}`);
    }
    v = astValue(node.kids[0]!, names, into) - astValue(node.kids[1]!, names, into);
  } else {
    throw new Error(`parse-tree-to-ast: 걷히지 않은 마디 ${node.id}`);
  }
  into.push({ id: node.id, value: v });
  return v;
}

export type TreeOutNode = { id: string; label: string; kind: 'rule' | 'token' | 'op'; conv: string | null; kids: string[] };
export type TreeOut = { root: string; nodes: TreeOutNode[] };

export function treeOut(root: WorkNode): TreeOut {
  const nodes: TreeOutNode[] = [];
  const visit = (node: WorkNode): void => {
    if (node.kind === 'token') {
      nodes.push({ id: node.id, label: node.token.text, kind: 'token', conv: null, kids: [] });
      return;
    }
    nodes.push({
      id: node.id,
      label: node.kind === 'rule' ? node.lhs : node.token.text,
      kind: node.kind,
      conv: node.kind === 'rule' ? node.conv : null,
      kids: node.kids.map((k) => k.id),
    });
    node.kids.forEach(visit);
  };
  visit(root);
  return { root: root.id, nodes };
}

// ─────────────────────────────────────────────────────────────────────────────
// 한 판을 통째로 셈한다 (검사 · 알고리즘이 함께 쓴다)
// ─────────────────────────────────────────────────────────────────────────────

export type WalkStep = {
  conv: Conv;
  count: number;
  removed: string[];
  dropped: string[];
  risen: string[];
  tree: WorkNode;
  remaining: number;
  droppedTotal: number;
};

export type RoundPlan = {
  source: string;
  tokens: Token[];
  rules: ParseTreeToAstRule[];
  parseTree: ParseNode;
  stats: TreeStats;
  walks: WalkStep[];
  ast: WorkNode;
  astString: string;
  astNodes: number;
  astLevels: number;
  value: number;
  values: { id: string; value: number }[];
};

export function planRound(data: ParseTreeToAstData, parens: number, grammar: number): RoundPlan {
  const source = data.sources[parens];
  const g = data.grammars[grammar];
  if (source === undefined) throw new Error(`parse-tree-to-ast: 괄호 사다리 밖 ${parens}`);
  if (g === undefined) throw new Error(`parse-tree-to-ast: 문법 사다리 밖 ${grammar}`);
  const tokens = tokenize(source);
  const parseTree = parse(tokens, g.rules, data.start);
  const stats = parseStats(parseTree);
  let tree = toWork(parseTree);
  let droppedTotal = 0;
  const walks: WalkStep[] = [];
  for (const conv of CONV_ORDER) {
    const r = walkConv(tree, conv);
    tree = r.tree;
    if (r.removed.length === 0) continue;
    droppedTotal += r.dropped.length;
    walks.push({
      conv,
      count: r.removed.length,
      removed: r.removed,
      dropped: r.dropped,
      risen: r.risen,
      tree,
      remaining: workCount(tree),
      droppedTotal,
    });
  }
  const values: { id: string; value: number }[] = [];
  const value = astValue(tree, data.names, values);
  return {
    source,
    tokens,
    rules: g.rules,
    parseTree,
    stats,
    walks,
    ast: tree,
    astString: astText(tree),
    astNodes: workCount(tree),
    astLevels: workLevels(tree),
    value,
    values,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 알고리즘
// ─────────────────────────────────────────────────────────────────────────────

type MetricName = 'parse-nodes' | 'tree-nodes' | 'dropped-tokens';

export async function parseTreeToAstAlgorithm(ctx: FacetContext<ParseTreeToAstData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ParseTreeToAstData>;
  const data = ctx.data;
  if (!data.parensLadder.includes(data.parens) || !data.grammarLadder.includes(data.grammar)) {
    throw new Error('parse-tree-to-ast: 기본값이 사다리에 없다');
  }
  let parens = data.parens;
  let grammar = data.grammar;

  const shown: Record<MetricName, number> = { 'parse-nodes': 0, 'tree-nodes': 0, 'dropped-tokens': 0 };
  const setMetric = (name: MetricName, v: number): void => {
    ctx.metric(name, v - shown[name]);
    shown[name] = v;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const convPhase = async (conv: Conv): Promise<void> => {
    switch (conv) {
      case 'leaf':
        return phase('leaf');
      case 'pass':
        return phase('pass');
      case 'paren':
        return phase('paren');
      case 'op':
        return phase('op');
    }
  };

  const playRound = async (): Promise<boolean> => {
    const plan = planRound(data, parens, grammar);
    // #0 시작
    setMetric('parse-nodes', 0);
    setMetric('tree-nodes', 0);
    setMetric('dropped-tokens', 0);
    await ctx.emit({
      type: 'round',
      payload: {
        source: plan.source,
        tokens: plan.tokens.map((tk) => ({ kind: tk.kind, text: tk.text })),
        tokenCount: plan.tokens.length,
        rules: plan.rules.map((r, i) => ({ name: `R${i + 1}`, lhs: r.lhs, rhs: [...r.rhs], conv: r.conv })),
        grammar,
        parens,
      },
    });
    if (!(await rctx.sleep(data.stepMs))) return false;

    // #1 파스 나무
    if (ctx.cancelled) return false;
    setMetric('parse-nodes', plan.stats.total);
    setMetric('tree-nodes', plan.stats.total);
    await ctx.emit({
      type: 'parse-tree',
      payload: {
        tree: treeOut(toWork(plan.parseTree)),
        total: plan.stats.total,
        inner: plan.stats.inner,
        leaves: plan.stats.leaves,
        levels: plan.stats.levels,
      },
    });
    if (!(await rctx.sleep(data.stepMs))) return false;

    // 걷기 — 규약 하나 = 한 걸음
    for (const w of plan.walks) {
      if (ctx.cancelled) return false;
      await convPhase(w.conv);
      setMetric('tree-nodes', w.remaining);
      setMetric('dropped-tokens', w.droppedTotal);
      await ctx.emit({
        type: 'walk',
        payload: {
          conv: w.conv,
          count: w.count,
          removed: w.removed,
          dropped: w.dropped,
          droppedNow: w.dropped.length,
          risen: w.risen,
          tree: treeOut(w.tree),
          remaining: w.remaining,
          droppedTotal: w.droppedTotal,
        },
      });
      if (!(await rctx.sleep(data.stepMs))) return false;
    }

    // 끝 — 값
    if (ctx.cancelled) return false;
    await phase('value');
    await ctx.emit({
      type: 'value',
      payload: {
        ast: plan.astString,
        value: plan.value,
        astNodes: plan.astNodes,
        astLevels: plan.astLevels,
        values: plan.values,
      },
    });
    return rctx.sleep(data.stepMs);
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound())) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null ? (p as { value?: unknown }).value : undefined;
        if (typeof value !== 'number') continue;
        if (input.type === 'parens' && data.parensLadder.includes(value)) {
          parens = value;
          break;
        }
        if (input.type === 'grammar' && data.grammarLadder.includes(value)) {
          grammar = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
