/**
 * derivation-tree — 펼친 자취가 나무가 된다.
 *
 * 문법과 토큰 열에서 가장 왼쪽 유도를 **실제로 찾고**, 그 유도의 펼침 하나마다
 * 펼친 노드 아래에 규칙의 몸을 자식으로 매단다. 펼친 기호는 지우지 않는다.
 * 끝에 잎(단말)을 왼쪽부터 읽어 토큰 열과 짝짓는다.
 *
 * 이벤트 (모두 `await ctx.emit`):
 *   - `init`  (silent) — 걸음 0 을 갈아 끼운다. 다 지은 나무의 층 수로 세로 간격을 정한다.
 *       payload: { levels: number }
 *   - `hang`  — 노드 하나 아래에 규칙의 몸이 한꺼번에 매달린다 (가장 왼쪽 유도의 한 걸음).
 *       payload: { parent: number, rule: string,
 *                  kids: { id: number, sym: string, terminal: boolean, from: number, to: number }[] }
 *       `from`·`to` 는 그 노드가 끝내 덮는 토큰 자리 [from, to) — 노드가 놓일 가로 자리를 정한다
 *   - `read`  — 잎을 왼쪽부터 읽어 토큰과 차례대로 짝짓는다.
 *       payload: { pairs: { node: number, token: number }[], matched: number }
 *
 * 노드 id 는 등장 차례 (뿌리 = 0). 모르는 모양 · 찾을 수 없는 유도는 던진다 (C6).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GrammarRule = { id: string; lhs: string; rhs: string[] };
export type SourceToken = { kind: string; text: string };

export type DerivationTreeFacetData = {
  type: 'derivation-tree';
  stepMs: number;
  source: string;
  tokens: SourceToken[];
  rules: GrammarRule[];
};

function fail(msg: string): never {
  throw new Error(`derivation-tree: ${msg}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** initialData 를 좁힌다. 모양이 다르면 던진다. scene 도 이 함수를 쓴다. */
export function readDerivationData(raw: unknown): DerivationTreeFacetData {
  if (!isRecord(raw)) fail('initialData 가 객체가 아니다');
  if (raw.type !== 'derivation-tree') fail(`type 이 derivation-tree 가 아니다: ${String(raw.type)}`);
  const stepMs = raw.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) fail('stepMs 가 양수가 아니다');
  const source = raw.source;
  if (typeof source !== 'string' || source.length === 0) fail('source 가 비었다');
  if (!Array.isArray(raw.tokens) || raw.tokens.length === 0) fail('tokens 가 비었다');
  const tokens = raw.tokens.map((tk, i): SourceToken => {
    if (!isRecord(tk) || typeof tk.kind !== 'string' || typeof tk.text !== 'string') {
      fail(`토큰 #${i} 의 모양이 틀렸다`);
    }
    if (tk.kind.length === 0 || tk.text.length === 0) fail(`토큰 #${i} 의 종류나 원문이 비었다`);
    return { kind: tk.kind, text: tk.text };
  });
  if (!Array.isArray(raw.rules) || raw.rules.length === 0) fail('rules 가 비었다');
  const rules = raw.rules.map((r, i): GrammarRule => {
    if (!isRecord(r) || typeof r.id !== 'string' || typeof r.lhs !== 'string' || !Array.isArray(r.rhs)) {
      fail(`규칙 #${i} 의 모양이 틀렸다`);
    }
    const rhs = r.rhs.map((s, j) => {
      if (typeof s !== 'string' || s.length === 0) fail(`규칙 ${r.id} 의 몸 #${j} 가 기호가 아니다`);
      return s;
    });
    return { id: r.id, lhs: r.lhs, rhs };
  });
  return { type: 'derivation-tree', stepMs, source, tokens, rules };
}

/** 시작 기호 = 첫 규칙의 왼쪽. */
export function startSymbol(rules: readonly GrammarRule[]): string {
  const first = rules[0];
  if (first === undefined) fail('규칙이 없다');
  return first.lhs;
}

/** 문법이 보는 단말 — NAME · NUM 은 종류 이름, 그 밖은 원문. */
export function terminalOf(tok: SourceToken): string {
  return tok.kind === 'NAME' || tok.kind === 'NUM' ? tok.kind : tok.text;
}

/** 규칙 한 줄의 글자 (`Expr → Expr + Term`). 장면 · 그림이 같은 함수를 부른다. */
export function ruleText(rule: GrammarRule): string {
  return `${rule.lhs} → ${rule.rhs.length === 0 ? 'ε' : rule.rhs.join(' ')}`;
}

type Expansion = { pos: number; rule: number };

/** 가장 왼쪽 유도를 전부 찾는다. ε 가 없는 문법만 — 문장형이 줄지 않아 길이로 끝이 난다. */
function leftmostDerivations(rules: readonly GrammarRule[], target: readonly string[]): Expansion[][] {
  const nonterms = new Set(rules.map((r) => r.lhs));
  for (const r of rules) if (r.rhs.length === 0) fail(`ε 규칙 ${r.id} 는 이 탐색이 다루지 않는다`);
  const found: Expansion[][] = [];
  const path: Expansion[] = [];
  let budget = 10_000;

  const same = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((x, i) => x === b[i]);

  const go = (form: readonly string[]): void => {
    budget -= 1;
    if (budget < 0) fail('유도 탐색 한도를 넘었다');
    if (form.length > target.length) return;
    const idxs: number[] = [];
    form.forEach((x, i) => {
      if (nonterms.has(x)) idxs.push(i);
    });
    const p = idxs[0];
    const q = idxs[idxs.length - 1];
    if (p === undefined || q === undefined) {
      if (same(form, target)) found.push([...path]);
      return;
    }
    if (!same(form.slice(0, p), target.slice(0, p))) return;
    const tail = form.slice(q + 1);
    if (tail.length > 0 && !same(target.slice(target.length - tail.length), tail)) return;
    rules.forEach((r, ri) => {
      if (r.lhs !== form[p]) return;
      path.push({ pos: p, rule: ri });
      go([...form.slice(0, p), ...r.rhs, ...form.slice(p + 1)]);
      path.pop();
    });
  };

  go([startSymbol(rules)]);
  return found;
}

type BuiltNode = { id: number; sym: string; terminal: boolean; kids: BuiltNode[]; from: number; to: number };

export async function derivationTree(context: FacetContext<DerivationTreeFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<DerivationTreeFacetData>;
  const data = readDerivationData(ctx.data);
  const { rules, tokens, stepMs } = data;

  const joined = tokens.map((tk) => tk.text).join('');
  if (data.source.replace(/\s+/g, '') !== joined) {
    fail(`원문과 토큰 원문이 어긋난다: "${data.source}" / "${joined}"`);
  }
  const nonterms = new Set(rules.map((r) => r.lhs));
  const target = tokens.map(terminalOf);

  const ds = leftmostDerivations(rules, target);
  const deriv = ds[0];
  if (deriv === undefined) fail('유도를 찾지 못했다');
  if (ds.length !== 1) fail(`가장 왼쪽 유도가 하나가 아니다: ${ds.length}`);

  // 유도를 따라 나무를 짓는다. 걸음마다 매단 자리를 적어 둔다.
  let nextId = 0;
  const mk = (sym: string): BuiltNode => ({
    id: nextId++,
    sym,
    terminal: !nonterms.has(sym),
    kids: [],
    from: -1,
    to: -1,
  });
  const root = mk(startSymbol(rules));
  let frontier: BuiltNode[] = [root];
  const hung: { parent: BuiltNode; rule: GrammarRule; kids: BuiltNode[] }[] = [];
  for (const ex of deriv) {
    const node = frontier[ex.pos];
    const rule = rules[ex.rule];
    if (node === undefined || rule === undefined) fail('유도의 자리가 문장형 밖이다');
    if (node.sym !== rule.lhs || node.kids.length > 0) fail(`유도와 나무가 어긋난다: ${node.sym} / ${rule.id}`);
    const kids = rule.rhs.map(mk);
    node.kids = kids;
    frontier = [...frontier.slice(0, ex.pos), ...kids, ...frontier.slice(ex.pos + 1)];
    hung.push({ parent: node, rule, kids });
  }

  // 잎 = 단말. 왼쪽부터 토큰과 차례대로 짝짓고, 노드마다 덮는 토큰 자리를 셈한다.
  const leaves: BuiltNode[] = [];
  const span = (n: BuiltNode): number => {
    if (n.kids.length === 0) {
      if (!n.terminal) fail(`펼치지 않은 비단말이 남았다: ${n.sym}`);
      n.from = leaves.length;
      leaves.push(n);
      n.to = leaves.length;
      return 1;
    }
    n.from = leaves.length;
    let depth = 0;
    for (const k of n.kids) depth = Math.max(depth, span(k));
    n.to = leaves.length;
    return depth + 1;
  };
  const levels = span(root);
  if (leaves.length !== tokens.length) fail(`잎 수와 토큰 수가 다르다: ${leaves.length} / ${tokens.length}`);
  const pairs = leaves.map((leaf, i) => {
    const tk = tokens[i];
    if (tk === undefined || terminalOf(tk) !== leaf.sym) fail(`잎 #${i} 가 토큰과 맞지 않는다: ${leaf.sym}`);
    return { node: leaf.id, token: i };
  });

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({ type: 'init', payload: { levels }, silent: true });

  for (const h of hung) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'hang',
      payload: {
        parent: h.parent.id,
        rule: h.rule.id,
        kids: h.kids.map((k) => ({ id: k.id, sym: k.sym, terminal: k.terminal, from: k.from, to: k.to })),
      },
    });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'read', payload: { pairs, matched: pairs.length } });
}
