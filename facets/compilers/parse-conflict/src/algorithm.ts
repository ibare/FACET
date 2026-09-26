/**
 * parse-conflict — 모호한 문법은 LR 표의 한 칸에 두 동작을 넣는다.
 *
 * 문법 앞에 `S' → 시작기호` 를 더해 LR(0) 항목 모음을 짓고, FOLLOW 로 접기 칸을 채워
 * SLR(1) 표를 만든다. 한 칸에 동작이 둘 이상이면 충돌이다 — 충돌 자리는 데이터로 받지 않고
 * 표를 지으며 찾는다. 그다음 토큰 열을 그 표로 돌리다가 충돌 칸에 닿으면 멈추고, 칸에 든
 * 동작마다 그 동작을 골랐다면 끝까지 어떻게 되는지를 따로 돌려 묶음(나무)과 값을 셈한다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *
 * - `shift`    { token: number, stack: StackCell[] }
 *              다음 토큰(자리 `token`)을 스택에 올렸다. `stack` 은 올린 뒤의 스택.
 * - `reduce`   { rule: string, stack: StackCell[] }
 *              스택 위의 몸을 규칙 `rule` 의 왼쪽으로 접었다. `stack` 은 접은 뒤의 스택.
 * - `conflict` { actions: ConflictAction[] }
 *              지금 상태 · 다음 토큰의 칸에 동작이 둘 이상 들었다. 파서는 여기서 멈춘다.
 *              `actions` 는 접기 먼저 · 밀기 다음 차례, 동작마다 그 동작을 낳은 항목들.
 * - `branch`   { choice: number, actions: BranchAct[], tree: TreeNode, group: string, value: number }
 *              충돌 칸의 `choice` 번째 동작을 골랐다면: 그 동작부터 받음까지 남은 동작 전부,
 *              끝에 선 나무 · 괄호 묶음 글자 · 값 (`-` 는 왼쪽 − 오른쪽).
 *
 * payload 스키마:
 *   StackCell      = { sym: string, text: string | null }      // 단말이면 토큰 원문, 비단말이면 null
 *   ConflictAction = { kind: 'reduce', rule: string, items: Item[] } | { kind: 'shift', items: Item[] }
 *   Item           = { rule: string, dot: number }
 *   BranchAct      = { kind: 'shift', token: number } | { kind: 'reduce', rule: string } | { kind: 'accept' }
 *   TreeNode       = { sym: string, text: string | null, value: number | null, kids: TreeNode[] }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Rule = { id: string; lhs: string; rhs: string[] };
export type Token = { kind: string; text: string };
export type StackCell = { sym: string; text: string | null };
export type Item = { rule: string; dot: number };
export type ConflictAction =
  | { kind: 'reduce'; rule: string; items: Item[] }
  | { kind: 'shift'; items: Item[] };
export type BranchAct =
  | { kind: 'shift'; token: number }
  | { kind: 'reduce'; rule: string }
  | { kind: 'accept' };
export type TreeNode = { sym: string; text: string | null; value: number | null; kids: TreeNode[] };

export type ParseConflictFacetData = {
  type: 'parse-conflict';
  source: string;
  tokens: Token[];
  rules: Rule[];
  stepMs: number;
};

export const EOF = 'EOF';
const AUG = "S'";

// ---------------------------------------------------------------- 공용 (scene · stage 가 함께 쓴다)

/** initialData 를 좁힌다. 모양이 틀리면 던진다. */
export function narrowParseConflictData(raw: unknown): ParseConflictFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('parse-conflict: initialData 가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'parse-conflict') throw new Error(`parse-conflict: type 이 다르다 (${String(r.type)})`);
  if (typeof r.source !== 'string') throw new Error('parse-conflict: source 가 글자가 아니다');
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) throw new Error('parse-conflict: stepMs 가 양수가 아니다');
  if (!Array.isArray(r.tokens) || r.tokens.length === 0) throw new Error('parse-conflict: tokens 가 비었다');
  if (!Array.isArray(r.rules) || r.rules.length === 0) throw new Error('parse-conflict: rules 가 비었다');
  const tokens: Token[] = r.tokens.map((v: unknown, i: number) => {
    if (typeof v !== 'object' || v === null) throw new Error(`parse-conflict: 토큰 #${i} 가 객체가 아니다`);
    const o = v as Record<string, unknown>;
    if (typeof o.kind !== 'string' || typeof o.text !== 'string' || o.text === '')
      throw new Error(`parse-conflict: 토큰 #${i} 의 kind · text 가 틀렸다`);
    return { kind: o.kind, text: o.text };
  });
  const rules: Rule[] = r.rules.map((v: unknown, i: number) => {
    if (typeof v !== 'object' || v === null) throw new Error(`parse-conflict: 규칙 #${i} 가 객체가 아니다`);
    const o = v as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.lhs !== 'string' || !Array.isArray(o.rhs))
      throw new Error(`parse-conflict: 규칙 #${i} 의 id · lhs · rhs 가 틀렸다`);
    const rhs = o.rhs.map((s: unknown) => {
      if (typeof s !== 'string' || s === '') throw new Error(`parse-conflict: 규칙 ${String(o.id)} 의 몸에 빈 기호`);
      return s;
    });
    return { id: o.id, lhs: o.lhs, rhs };
  });
  const joined = tokens.map((tk) => tk.text).join('');
  if (r.source.replace(/\s+/g, '') !== joined)
    throw new Error(`parse-conflict: source 와 토큰 원문이 다르다 (${r.source} / ${joined})`);
  return { type: 'parse-conflict', source: r.source, tokens, rules, stepMs: r.stepMs };
}

/** 토큰 열 끝에 입력 끝 표식을 붙인다. */
export function withEof(tokens: readonly Token[]): Token[] {
  return [...tokens.map((tk) => ({ kind: tk.kind, text: tk.text })), { kind: EOF, text: '' }];
}

/** 문법이 보는 단말 — NAME · NUM 은 종류 이름, EOF 는 EOF, 그 밖은 원문. */
export function termOf(tok: Token): string {
  if (tok.kind === EOF) return EOF;
  if (tok.kind === 'NAME' || tok.kind === 'NUM') return tok.kind;
  return tok.text;
}

/** 화면에 적는 토큰 글자 — 원문, 입력 끝이면 EOF. */
export function tokenLabel(tok: Token): string {
  return tok.kind === EOF ? EOF : tok.text;
}

export function findRule(rules: readonly Rule[], id: string): Rule {
  const r = rules.find((x) => x.id === id);
  if (!r) throw new Error(`parse-conflict: 없는 규칙 ${id}`);
  return r;
}

/** `Expr → Expr - Expr` */
export function ruleText(rule: Rule): string {
  return [rule.lhs, '→', ...rule.rhs].join(' ');
}

/** `Expr → Expr · - Expr` */
export function itemText(rules: readonly Rule[], item: Item): string {
  const rule = findRule(rules, item.rule);
  if (item.dot < 0 || item.dot > rule.rhs.length) throw new Error(`parse-conflict: 항목 점 자리가 틀렸다 (${item.rule} · ${item.dot})`);
  return [rule.lhs, '→', ...rule.rhs.slice(0, item.dot), '·', ...rule.rhs.slice(item.dot)].join(' ');
}

// ---------------------------------------------------------------- SLR(1) 표

type Act = { kind: 'shift'; to: number } | { kind: 'reduce'; rule: number } | { kind: 'accept' };
type Table = {
  rules: Rule[]; // 0 번이 S'
  states: [number, number][][];
  action: Map<string, Act[]>[];
  goto: Map<string, number>[];
  conflicts: number;
};

function buildTable(given: readonly Rule[]): Table {
  const start = given[0]!.lhs;
  const rules: Rule[] = [{ id: AUG, lhs: AUG, rhs: [start] }, ...given];
  const nonterms = new Set(rules.map((r) => r.lhs));
  const isNT = (s: string) => nonterms.has(s);

  // FIRST · nullable
  const nullable = new Set<string>();
  const first = new Map<string, Set<string>>();
  for (const n of nonterms) first.set(n, new Set());
  const firstOfSeq = (seq: readonly string[]): { set: Set<string>; empty: boolean } => {
    const set = new Set<string>();
    for (const s of seq) {
      if (!isNT(s)) {
        set.add(s);
        return { set, empty: false };
      }
      for (const a of first.get(s)!) set.add(a);
      if (!nullable.has(s)) return { set, empty: false };
    }
    return { set, empty: true };
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of rules) {
      const f = firstOfSeq(r.rhs);
      const into = first.get(r.lhs)!;
      for (const a of f.set) if (!into.has(a)) { into.add(a); changed = true; }
      if (f.empty && !nullable.has(r.lhs)) { nullable.add(r.lhs); changed = true; }
    }
  }
  // FOLLOW
  const follow = new Map<string, Set<string>>();
  for (const n of nonterms) follow.set(n, new Set());
  follow.get(AUG)!.add(EOF);
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of rules) {
      r.rhs.forEach((s, i) => {
        if (!isNT(s)) return;
        const into = follow.get(s)!;
        const f = firstOfSeq(r.rhs.slice(i + 1));
        const add = [...f.set, ...(f.empty ? follow.get(r.lhs)! : [])];
        for (const a of add) if (!into.has(a)) { into.add(a); changed = true; }
      });
    }
  }

  const key = (items: [number, number][]) => items.map(([r, d]) => `${r}.${d}`).join(' ');
  const closure = (seed: [number, number][]): [number, number][] => {
    const out: [number, number][] = [...seed];
    const seen = new Set(out.map(([r, d]) => `${r}.${d}`));
    for (let i = 0; i < out.length; i += 1) {
      const [ri, d] = out[i]!;
      const next = rules[ri]!.rhs[d];
      if (next === undefined || !isNT(next)) continue;
      rules.forEach((r, j) => {
        if (r.lhs !== next || seen.has(`${j}.0`)) return;
        seen.add(`${j}.0`);
        out.push([j, 0]);
      });
    }
    return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  };

  const states: [number, number][][] = [closure([[0, 0]])];
  const index = new Map<string, number>([[key(states[0]!), 0]]);
  const trans: Map<string, number>[] = [];
  for (let i = 0; i < states.length; i += 1) {
    const moves = new Map<string, number>();
    const symbols: string[] = [];
    for (const [ri, d] of states[i]!) {
      const s = rules[ri]!.rhs[d];
      if (s !== undefined && !symbols.includes(s)) symbols.push(s);
    }
    for (const s of symbols) {
      const seed = states[i]!.filter(([ri, d]) => rules[ri]!.rhs[d] === s).map(([ri, d]): [number, number] => [ri, d + 1]);
      const target = closure(seed);
      const k = key(target);
      let j = index.get(k);
      if (j === undefined) {
        j = states.length;
        states.push(target);
        index.set(k, j);
      }
      moves.set(s, j);
    }
    trans.push(moves);
  }

  const action: Map<string, Act[]>[] = [];
  const gotoT: Map<string, number>[] = [];
  let conflicts = 0;
  states.forEach((items, i) => {
    const row = new Map<string, Act[]>();
    const put = (a: string, act: Act) => {
      const cell = row.get(a) ?? [];
      const same = cell.some((c) => c.kind === act.kind && JSON.stringify(c) === JSON.stringify(act));
      if (!same) cell.push(act);
      row.set(a, cell);
    };
    for (const [ri, d] of items) {
      const r = rules[ri]!;
      const s = r.rhs[d];
      if (s !== undefined) {
        if (!isNT(s)) put(s, { kind: 'shift', to: trans[i]!.get(s)! });
      } else if (ri === 0) {
        put(EOF, { kind: 'accept' });
      } else {
        for (const a of follow.get(r.lhs)!) put(a, { kind: 'reduce', rule: ri });
      }
    }
    for (const cell of row.values()) if (cell.length > 1) conflicts += 1;
    action.push(row);
    const g = new Map<string, number>();
    for (const [s, j] of trans[i]!) if (isNT(s)) g.set(s, j);
    gotoT.push(g);
  });
  return { rules, states, action, goto: gotoT, conflicts };
}

// ---------------------------------------------------------------- 파서 한 판

type Frame = { state: number; node: TreeNode };
type Machine = { frames: Frame[]; pos: number };

function stackOf(m: Machine): StackCell[] {
  return m.frames.slice(1).map((f) => ({ sym: f.node.sym, text: f.node.text }));
}

function valueOf(sym: string, kids: TreeNode[]): number {
  if (kids.length === 1) {
    const v = kids[0]!.value;
    if (v === null) throw new Error(`parse-conflict: ${sym} 의 값을 셈할 수 없다 (자식에 값이 없다)`);
    return v;
  }
  if (kids.length === 3 && kids[1]!.kids.length === 0 && kids[1]!.text === '-') {
    const l = kids[0]!.value;
    const r = kids[2]!.value;
    if (l === null || r === null) throw new Error(`parse-conflict: ${sym} 의 두 쪽 값이 없다`);
    return l - r;
  }
  throw new Error(`parse-conflict: 값을 셈할 수 없는 모양 (${sym} → ${kids.map((k) => k.sym).join(' ')})`);
}

function leaf(tok: Token): TreeNode {
  let value: number | null = null;
  if (tok.kind === 'NUM') {
    if (!/^\d+$/.test(tok.text)) throw new Error(`parse-conflict: 수가 아닌 NUM (${tok.text})`);
    value = Number(tok.text);
  }
  return { sym: termOf(tok), text: tok.text, value, kids: [] };
}

/** 한 동작을 기계에 적용한다. */
function apply(tb: Table, m: Machine, toks: readonly Token[], act: Act): BranchAct {
  if (act.kind === 'shift') {
    const tok = toks[m.pos]!;
    m.frames.push({ state: act.to, node: leaf(tok) });
    m.pos += 1;
    return { kind: 'shift', token: m.pos - 1 };
  }
  if (act.kind === 'reduce') {
    const rule = tb.rules[act.rule]!;
    const n = rule.rhs.length;
    const popped = m.frames.splice(m.frames.length - n, n);
    const kids = popped.map((f) => f.node);
    kids.forEach((k, i) => {
      if (k.sym !== rule.rhs[i]) throw new Error(`parse-conflict: 접을 몸이 스택과 다르다 (${rule.id})`);
    });
    const node: TreeNode = { sym: rule.lhs, text: null, value: valueOf(rule.lhs, kids), kids };
    const below = m.frames[m.frames.length - 1]!.state;
    const to = tb.goto[below]!.get(rule.lhs);
    if (to === undefined) throw new Error(`parse-conflict: goto 칸이 없다 (${rule.lhs})`);
    m.frames.push({ state: to, node });
    return { kind: 'reduce', rule: rule.id };
  }
  return { kind: 'accept' };
}

function cellOf(tb: Table, m: Machine, toks: readonly Token[]): Act[] {
  const state = m.frames[m.frames.length - 1]!.state;
  const la = termOf(toks[m.pos]!);
  const cell = tb.action[state]!.get(la);
  if (!cell || cell.length === 0) throw new Error(`parse-conflict: 표에 칸이 없다 (다음 ${la}) — 문법이 이 입력을 받지 않는다`);
  return cell;
}

function cloneMachine(m: Machine): Machine {
  return { frames: m.frames.map((f) => ({ state: f.state, node: f.node })), pos: m.pos };
}

/** 충돌 칸의 한 동작을 골랐다면 — 받음까지 돌린다. 뒤에 또 충돌이 나면 같은 종류를 고른다. */
function runBranch(tb: Table, start: Machine, toks: readonly Token[], chosen: Act): { acts: BranchAct[]; tree: TreeNode } {
  const m = cloneMachine(start);
  const acts: BranchAct[] = [apply(tb, m, toks, chosen)];
  const limit = toks.length * (tb.rules.length + 2) * 4;
  while (acts[acts.length - 1]!.kind !== 'accept') {
    if (acts.length > limit) throw new Error('parse-conflict: 갈래가 끝나지 않는다');
    const cell = cellOf(tb, m, toks);
    let act = cell[0]!;
    if (cell.length > 1) {
      const same = cell.filter((c) => c.kind === chosen.kind);
      if (same.length !== 1) throw new Error('parse-conflict: 갈래 안의 충돌을 고를 수 없다');
      act = same[0]!;
    }
    acts.push(apply(tb, m, toks, act));
  }
  if (m.frames.length !== 2) throw new Error('parse-conflict: 받았는데 스택에 기호가 하나가 아니다');
  return { acts, tree: m.frames[1]!.node };
}

function groupOf(node: TreeNode, top: boolean): string {
  if (node.kids.length === 0) {
    if (node.text === null) throw new Error('parse-conflict: 원문 없는 잎');
    return node.text;
  }
  if (node.kids.length === 1) return groupOf(node.kids[0]!, top);
  const inner = node.kids.map((k) => groupOf(k, false)).join(' ');
  return top ? inner : `(${inner})`;
}

function itemsFor(tb: Table, state: number, act: Act, la: string): Item[] {
  return tb.states[state]!
    .filter(([ri, d]) => {
      const r = tb.rules[ri]!;
      if (act.kind === 'shift') return r.rhs[d] === la;
      if (act.kind === 'reduce') return ri === act.rule && d === r.rhs.length;
      return ri === 0 && d === 1;
    })
    .map(([ri, d]) => ({ rule: tb.rules[ri]!.id, dot: d }));
}

// ---------------------------------------------------------------- 알고리즘

export async function parseConflict(ctx0: FacetContext<ParseConflictFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<ParseConflictFacetData>;
  const data = narrowParseConflictData(ctx.data);
  const stepMs = data.stepMs;
  const toks = withEof(data.tokens);
  const tb = buildTable(data.rules);
  if (tb.conflicts === 0) throw new Error('parse-conflict: 표에 충돌 칸이 없다 — 이 조각이 보일 것이 없다');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const m: Machine = { frames: [{ state: 0, node: { sym: AUG, text: null, value: null, kids: [] } }], pos: 0 };
  const limit = toks.length * (tb.rules.length + 2) * 4;
  let steps = 0;
  // 걸음 0 이 이미 읽을 것이 있는 화면이라 첫 동작 앞에도 문을 둔다.
  for (;;) {
    if (!(await pause())) return;
    steps += 1;
    if (steps > limit) throw new Error('parse-conflict: 파서가 끝나지 않는다');
    const cell = cellOf(tb, m, toks);
    if (cell.length > 1) {
      const state = m.frames[m.frames.length - 1]!.state;
      const la = termOf(toks[m.pos]!);
      const ordered = [...cell.filter((c) => c.kind === 'reduce'), ...cell.filter((c) => c.kind === 'shift')];
      if (ordered.length !== cell.length) throw new Error('parse-conflict: 받음이 낀 충돌 칸은 다루지 않는다');
      const actions: ConflictAction[] = ordered.map((c) =>
        c.kind === 'reduce'
          ? { kind: 'reduce', rule: tb.rules[c.rule]!.id, items: itemsFor(tb, state, c, la) }
          : { kind: 'shift', items: itemsFor(tb, state, c, la) },
      );
      await ctx.emit({ type: 'conflict', payload: { actions } });
      let choice = 0;
      for (const act of ordered) {
        if (!(await pause())) return;
        const run = runBranch(tb, m, toks, act);
        const value = run.tree.value;
        if (value === null) throw new Error('parse-conflict: 갈래 나무에 값이 없다');
        await ctx.emit({
          type: 'branch',
          payload: { choice, actions: run.acts, tree: run.tree, group: groupOf(run.tree, true), value },
        });
        choice += 1;
      }
      return;
    }
    const act = cell[0]!;
    if (act.kind === 'accept') throw new Error('parse-conflict: 충돌 칸에 닿기 전에 받았다 — 이 입력은 충돌을 드러내지 않는다');
    const done = apply(tb, m, toks, act);
    if (done.kind === 'shift') {
      await ctx.emit({ type: 'shift', payload: { token: done.token, stack: stackOf(m) } });
    } else if (done.kind === 'reduce') {
      await ctx.emit({ type: 'reduce', payload: { rule: done.rule, stack: stackOf(m) } });
    }
  }
}
