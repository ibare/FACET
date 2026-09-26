/**
 * lr-precedence — 모호한 문법의 LR 표에 생긴 충돌 칸을 우선순위 규칙으로 정하고, 같은 토큰 열을 표 운전기로 읽는다.
 *
 * 1차 데이터는 문법 · 원시 글 · 우선순위 규칙 넷 · 손잡이 사다리뿐이다. 토큰 · SLR(1) 표 · 충돌 칸 · 모든 수는 여기서 셈한다.
 *
 * 셈의 차례 (한 판):
 *   1. 원시 글을 토큰으로 나눈다 (`NUM` · `OP` · `NAME` · `PUNCT`, 빈칸은 토큰이 아니다). 빈칸을 뺀 원문과 토큰 원문을 이은
 *      글이 다르면 던진다. 끝 표식 `EOF` 는 데이터에 두지 않고 여기서 붙인다
 *   2. SLR(1) 표를 짓는다 — 문법 앞에 `E' → E`, LR(0) 항목 모음(상태는 생긴 차례 · 시작 상태 0), FOLLOW 로 접기.
 *      한 칸에 동작이 둘 드는 자리가 충돌 칸이다 (데이터로 주지 않는다)
 *   3. 우선순위 풀이 (yacc 식) — 접기 규칙의 우선순위 = 몸의 마지막 연산자. 다음 토큰의 연산자가 더 높으면 밀기, 낮으면 접기,
 *      같으면 왼쪽 결합 → 접기 · 오른쪽 결합 → 밀기. 밀기 하나 · 접기 하나가 아닌 충돌, 우선순위가 없는 연산자는 던진다
 *   4. 표를 `actKind`(0 오류 · 1 밀기 · 2 접기 · 3 받음) · `actArg` 두 배열로 펴서 `runLr` 로 돌린다. `runLr` 는 irs.ts 의
 *      IR 과 **같은 함수**다 — 갈고리로 동작마다 걸음을 모으고, 기호 스택 · 나무는 그 옆에서 쥔다 (IR 에는 없다)
 *
 * 번호: 단말은 입력에 처음 나온 차례(그 밖 문법 단말은 뒤로) + 끝에 EOF — 이 데이터에서 NUM 0 · + 1 · * 2 · EOF 3.
 * 규칙은 0 `E' → E` 뒤로 적힌 차례 (R1 = 1 …). 충돌 칸은 (접기 규칙 번호, 단말 번호) 차례로 늘어놓는다.
 * 동률: 우선순위 높이가 같을 때만 결합 방향이 가른다 — "* 먼저" · "+ 먼저" 에서는 같은 연산자끼리인 두 칸(+ 뒤 +, * 뒤 *),
 *       "같게 · 왼쪽" · "같게 · 오른쪽" 에서는 네 칸 모두 걸린다.
 *
 * 이벤트 (silent 는 phase 만):
 *   - `round-start`  { precedence: number, tokens: string[] (`NUM 1` · `OP +` · `EOF`), remaining: number,
 *                      conflicts: { item: string, look: string, reduceRule: string }[], ops: { op, level, assoc }[] }    걸음 #0
 *   - `resolve`      { cells: { action: 'shift' | 'reduce', rule: string }[], shiftCells: number, reduceCells: number }                        걸음 #1
 *   - `shift`        { token: number, look: string, symbol: string, stack: string[], cell: number, remaining: number,
 *                      shifts, maxStack }       동작 걸음
 *   - `reduce`       { rule: string, pop: number, look: string, stack: string[], value: number, cell: number,
 *                      node: { id, x, level, label, value, kids: number[] }, reduces, maxStack }                           동작 걸음
 *   - `accept`       { value: number, tree: string, look: string, root: number }                                           동작 걸음
 *   - `phase`        { phase } — silent
 *   `cell` 은 이 동작이 읽은 충돌 칸의 자리(0..3), 충돌 칸이 아니면 −1. `node.x` 는 나무 마디가 선 토큰 자리(잎 = 그 수, 가지 = 연산자).
 *
 * phase 어휘: `shift` · `reduce` · `accept` (irs.ts 와 같다). #0 · #1 은 IR 밖이라 phase 가 없다.
 * 계기: `shift-cells` (#1 에 충돌 칸 중 밀기 수) · `shifts` · `reduces` (동작마다 누적) · `max-stack` (지금까지 가장 높은 스택,
 *       기호 칸). 판 머리에 넷 다 0 으로 — 지금 값을 들고 차이만 보낸다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LrRule = { lhs: string; body: string[] };
export type LrOpPrec = { op: string; level: number; assoc: 'left' | 'right' };
export type LrPrecRule = { ops: LrOpPrec[] };

export type LrPrecedenceData = {
  type: 'lr-precedence';
  stepMs: number;
  grammar: LrRule[];
  source: string;
  precedenceRules: LrPrecRule[];
  precedenceLadder: number[];
  precedence: number;
};

// ── 토큰

export type LrToken = { kind: 'NUM' | 'NAME' | 'OP' | 'PUNCT'; text: string };

export function tokenize(source: string): LrToken[] {
  const out: LrToken[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i] as string;
    if (c === ' ') {
      i += 1;
    } else if (c >= '0' && c <= '9') {
      let j = i;
      while (j < source.length && (source[j] as string) >= '0' && (source[j] as string) <= '9') j += 1;
      out.push({ kind: 'NUM', text: source.slice(i, j) });
      i = j;
    } else if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
      let j = i;
      while (j < source.length && /[A-Za-z0-9]/.test(source[j] as string)) j += 1;
      out.push({ kind: 'NAME', text: source.slice(i, j) });
      i = j;
    } else if ('+-*='.includes(c)) {
      out.push({ kind: 'OP', text: c });
      i += 1;
    } else if ('(),'.includes(c)) {
      out.push({ kind: 'PUNCT', text: c });
      i += 1;
    } else {
      throw new Error(`lr-precedence: 토큰이 될 수 없는 글자 '${c}'`);
    }
  }
  const joined = out.map((tk) => tk.text).join('');
  if (joined !== source.split(' ').join('')) {
    throw new Error('lr-precedence: 토큰 원문을 이은 글이 원시 글과 다르다');
  }
  return out;
}

/** 문법이 보는 단말 — NUM · NAME 은 종류 이름, 그 밖은 원문. */
export function terminalOf(tk: LrToken): string {
  return tk.kind === 'NUM' || tk.kind === 'NAME' ? tk.kind : tk.text;
}

export function tokenLabel(tk: LrToken): string {
  return `${tk.kind} ${tk.text}`;
}

export const EOF = 'EOF';

/** 규칙 글자 — `E → E + E`. */
export function ruleText(rule: LrRule): string {
  return `${rule.lhs} → ${rule.body.join(' ')}`;
}

/** 다 읽은 항목 글자 — `E → E + E ·`. */
export function completeItemText(rule: LrRule): string {
  return `${ruleText(rule)} ·`;
}

// ── SLR(1) 표

type Item = { rule: number; dot: number };
type Action = { kind: 'shift'; to: number } | { kind: 'reduce'; rule: number } | { kind: 'accept' };

export type LrConflict = {
  state: number;
  term: number;
  shiftTo: number;
  reduceRule: number;
};

export type LrTable = {
  /** 0 = 붙인 규칙 `S' → 시작`, 1.. = 적힌 차례. */
  rules: LrRule[];
  terminals: string[];
  nonterminal: string;
  nStates: number;
  nTerm: number;
  actKind: number[];
  actArg: number[];
  gotoTab: number[];
  ruleLen: number[];
  ruleOp: number[];
  conflicts: LrConflict[];
};

const OP_CODE: Record<string, number> = { '+': 1, '*': 2 };

export function buildSlrTable(grammar: LrRule[], inputTerms: string[]): LrTable {
  const first = grammar[0];
  if (first === undefined) throw new Error('lr-precedence: 문법이 비었다');
  const start = first.lhs;
  const nonterms = new Set(grammar.map((r) => r.lhs));
  if (nonterms.size !== 1) {
    throw new Error('lr-precedence: 표 운전기의 gotoTab 은 비단말 하나만 담는다');
  }
  const rules: LrRule[] = [{ lhs: `${start}'`, body: [start] }, ...grammar];
  for (const r of rules) if (r.body.length === 0) throw new Error('lr-precedence: 빈 몸 규칙은 다루지 않는다');

  const terminals: string[] = [];
  const addTerm = (s: string): void => {
    if (!nonterms.has(s) && !terminals.includes(s)) terminals.push(s);
  };
  for (const s of inputTerms) addTerm(s);
  for (const r of grammar) for (const s of r.body) addTerm(s);
  for (const s of inputTerms) {
    if (!terminals.includes(s)) throw new Error(`lr-precedence: 문법에 없는 단말 '${s}'`);
  }
  terminals.push(EOF);
  const nTerm = terminals.length;
  const termIndex = (s: string): number => {
    const k = terminals.indexOf(s);
    if (k < 0) throw new Error(`lr-precedence: 모르는 단말 '${s}'`);
    return k;
  };

  // FIRST (빈 몸이 없으니 몸의 첫 기호만 본다) · FOLLOW
  const firstOf = new Map<string, Set<string>>();
  for (const nt of nonterms) firstOf.set(nt, new Set());
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of grammar) {
      const set = firstOf.get(r.lhs) as Set<string>;
      const head = r.body[0] as string;
      const add = nonterms.has(head) ? [...(firstOf.get(head) as Set<string>)] : [head];
      for (const s of add) if (!set.has(s)) { set.add(s); changed = true; }
    }
  }
  const follow = new Map<string, Set<string>>();
  for (const nt of nonterms) follow.set(nt, new Set());
  (follow.get(start) as Set<string>).add(EOF);
  changed = true;
  while (changed) {
    changed = false;
    for (const r of grammar) {
      r.body.forEach((sym, k) => {
        if (!nonterms.has(sym)) return;
        const set = follow.get(sym) as Set<string>;
        const after = r.body[k + 1];
        const add =
          after === undefined
            ? [...(follow.get(r.lhs) as Set<string>)]
            : nonterms.has(after)
              ? [...(firstOf.get(after) as Set<string>)]
              : [after];
        for (const s of add) if (!set.has(s)) { set.add(s); changed = true; }
      });
    }
  }

  // LR(0) 항목 모음
  const key = (items: Item[]): string =>
    items.map((it) => `${it.rule}.${it.dot}`).sort().join(',');
  const closure = (kernel: Item[]): Item[] => {
    const out = [...kernel];
    for (let q = 0; q < out.length; q += 1) {
      const it = out[q] as Item;
      const sym = (rules[it.rule] as LrRule).body[it.dot];
      if (sym === undefined || !nonterms.has(sym)) continue; // 다 읽었거나 단말 — 펼칠 것이 없다
      rules.forEach((r, ri) => {
        if (r.lhs === sym && !out.some((o) => o.rule === ri && o.dot === 0)) out.push({ rule: ri, dot: 0 });
      });
    }
    return out;
  };
  const states: Item[][] = [closure([{ rule: 0, dot: 0 }])];
  const stateKeys = [key(states[0] as Item[])];
  const trans: Map<string, number>[] = [];
  for (let s = 0; s < states.length; s += 1) {
    const items = states[s] as Item[];
    const tr = new Map<string, number>();
    const symbols: string[] = [];
    for (const it of items) {
      const sym = (rules[it.rule] as LrRule).body[it.dot];
      if (sym !== undefined && !symbols.includes(sym)) symbols.push(sym);
    }
    for (const sym of symbols) {
      const kernel = items
        .filter((it) => (rules[it.rule] as LrRule).body[it.dot] === sym)
        .map((it) => ({ rule: it.rule, dot: it.dot + 1 }));
      const next = closure(kernel);
      const k = key(next);
      let idx = stateKeys.indexOf(k);
      if (idx < 0) {
        idx = states.length;
        states.push(next);
        stateKeys.push(k);
      }
      tr.set(sym, idx);
    }
    trans.push(tr);
  }
  const nStates = states.length;

  const cells: Action[][] = Array.from({ length: nStates * nTerm }, () => []);
  const gotoTab: number[] = Array.from({ length: nStates }, () => -1);
  states.forEach((items, s) => {
    const tr = trans[s] as Map<string, number>;
    for (const [sym, to] of tr) {
      if (nonterms.has(sym)) gotoTab[s] = to;
      else (cells[s * nTerm + termIndex(sym)] as Action[]).push({ kind: 'shift', to });
    }
    for (const it of items) {
      const r = rules[it.rule] as LrRule;
      if (it.dot < r.body.length) continue; // 아직 다 읽지 않은 항목 — 접기 자리가 아니다
      if (it.rule === 0) {
        (cells[s * nTerm + termIndex(EOF)] as Action[]).push({ kind: 'accept' });
        continue;
      }
      for (const la of follow.get(r.lhs) as Set<string>) {
        (cells[s * nTerm + termIndex(la)] as Action[]).push({ kind: 'reduce', rule: it.rule });
      }
    }
  });

  const actKind: number[] = [];
  const actArg: number[] = [];
  const conflicts: LrConflict[] = [];
  cells.forEach((acts, c) => {
    const s = Math.floor(c / nTerm);
    const term = c % nTerm;
    if (acts.length === 0) {
      actKind.push(0);
      actArg.push(0);
    } else if (acts.length === 1) {
      const a = acts[0] as Action;
      actKind.push(a.kind === 'shift' ? 1 : a.kind === 'reduce' ? 2 : 3);
      actArg.push(a.kind === 'shift' ? a.to : a.kind === 'reduce' ? a.rule : 0);
    } else {
      const sh = acts.filter((a) => a.kind === 'shift');
      const re = acts.filter((a) => a.kind === 'reduce');
      if (acts.length !== 2 || sh.length !== 1 || re.length !== 1) {
        throw new Error('lr-precedence: 밀기 하나 · 접기 하나가 아닌 충돌');
      }
      const shA = sh[0] as { kind: 'shift'; to: number };
      const reA = re[0] as { kind: 'reduce'; rule: number };
      conflicts.push({ state: s, term, shiftTo: shA.to, reduceRule: reA.rule });
      // 자리만 잡는다 — 우선순위 풀이가 채운다
      actKind.push(0);
      actArg.push(0);
    }
  });
  conflicts.sort((x, y) => x.reduceRule - y.reduceRule || x.term - y.term);
  for (let k = 1; k < conflicts.length; k += 1) {
    const a = conflicts[k - 1] as LrConflict;
    const b = conflicts[k] as LrConflict;
    if (a.reduceRule === b.reduceRule && a.term === b.term) {
      throw new Error('lr-precedence: 같은 항목 · 같은 다음 토큰의 충돌 칸이 둘 — 항목으로 가를 수 없다');
    }
  }

  const ruleOp = rules.map((r, ri) => {
    if (ri === 0) return 0;
    if (r.body.length === 1) return 0;
    const op = r.body[1] as string;
    const code = OP_CODE[op];
    if (r.body.length !== 3 || code === undefined) throw new Error(`lr-precedence: 값을 셈할 수 없는 규칙 ${ruleText(r)}`);
    return code;
  });

  return {
    rules,
    terminals,
    nonterminal: start,
    nStates,
    nTerm,
    actKind,
    actArg,
    gotoTab,
    ruleLen: rules.map((r) => r.body.length),
    ruleOp,
    conflicts,
  };
}

// ── 우선순위 풀이

export type LrResolved = { action: 'shift' | 'reduce'; rule: number };

function precOf(rule: LrPrecRule, op: string): LrOpPrec {
  const p = rule.ops.find((o) => o.op === op);
  if (p === undefined) throw new Error(`lr-precedence: 우선순위가 없는 연산자 '${op}'`);
  return p;
}

/** 충돌 칸마다 이 규칙이 고른 동작. 표의 두 배열을 고쳐 쓴 사본과 함께 돌려준다. */
export function resolveConflicts(
  table: LrTable,
  rule: LrPrecRule,
): { resolved: LrResolved[]; actKind: number[]; actArg: number[] } {
  const actKind = [...table.actKind];
  const actArg = [...table.actArg];
  const resolved = table.conflicts.map((c) => {
    const body = (table.rules[c.reduceRule] as LrRule).body;
    const lastOp = [...body].reverse().find((s) => rule.ops.some((o) => o.op === s));
    if (lastOp === undefined) throw new Error('lr-precedence: 우선순위를 가진 연산자가 없는 접기 규칙');
    const rp = precOf(rule, lastOp);
    const lp = precOf(rule, table.terminals[c.term] as string);
    const shift = lp.level > rp.level ? true : lp.level < rp.level ? false : rp.assoc === 'right';
    const at = c.state * table.nTerm + c.term;
    actKind[at] = shift ? 1 : 2;
    actArg[at] = shift ? c.shiftTo : c.reduceRule;
    return { action: shift ? ('shift' as const) : ('reduce' as const), rule: c.reduceRule };
  });
  return { resolved, actKind, actArg };
}

// ── 표 운전기 — irs.ts 의 runLr 와 같은 함수

export type LrHooks = {
  shift(i: number, cellAt: number, top: number): void;
  reduce(r: number, v: number, cellAt: number, top: number): void;
  accept(v: number, cellAt: number): void;
};

export function runLr(
  actKind: number[],
  actArg: number[],
  gotoTab: number[],
  ruleLen: number[],
  ruleOp: number[],
  nTerm: number,
  toks: number[],
  inVal: number[],
  stack: number[],
  vals: number[],
  counts: number[],
  hooks?: LrHooks,
): number {
  let top = 0;
  stack[0] = 0;
  vals[0] = 0;
  let i = 0;
  while (i < toks.length) {
    const s = stack[top] as number;
    const a = toks[i] as number;
    const at = s * nTerm + a;
    const k = actKind[at] as number;
    const arg = actArg[at] as number;
    if (k === 1) {
      top = top + 1;
      stack[top] = arg;
      vals[top] = inVal[i] as number;
      counts[0] = (counts[0] as number) + 1;
      counts[2] = Math.max(counts[2] as number, top);
      hooks?.shift(i, at, top);
      i = i + 1;
    } else if (k === 2) {
      let v = vals[top] as number;
      if (ruleOp[arg] === 1) v = (vals[top - 2] as number) + (vals[top] as number);
      if (ruleOp[arg] === 2) v = (vals[top - 2] as number) * (vals[top] as number);
      top = top - (ruleLen[arg] as number);
      stack[top + 1] = gotoTab[stack[top] as number] as number;
      top = top + 1;
      vals[top] = v;
      counts[1] = (counts[1] as number) + 1;
      counts[2] = Math.max(counts[2] as number, top);
      hooks?.reduce(arg, v, at, top);
    } else if (k === 3) {
      hooks?.accept(vals[top] as number, at);
      return vals[top] as number;
    } else {
      return -1;
    }
  }
  return -1;
}

// ── 한 판의 셈 (걸음 모으기)

export type LrNode = { id: number; x: number; level: number; label: string; value: number; kids: number[] };

export type LrStep =
  | {
      kind: 'shift';
      token: number;
      look: string;
      symbol: string;
      stack: string[];
      cell: number;
      remaining: number;
      shifts: number;
      maxStack: number;
    }
  | {
      kind: 'reduce';
      rule: string;
      pop: number;
      look: string;
      stack: string[];
      value: number;
      cell: number;
      node: LrNode;
      reduces: number;
      maxStack: number;
    }
  | { kind: 'accept'; value: number; tree: string; look: string; root: number };

export type LrRound = {
  tokens: string[];
  conflicts: { item: string; look: string; reduceRule: string }[];
  resolved: { action: 'shift' | 'reduce'; rule: string }[];
  shiftCells: number;
  reduceCells: number;
  steps: LrStep[];
  value: number;
  tree: string;
  shifts: number;
  reduces: number;
  maxStack: number;
  /** IR 에 넘기는 인자 — 검사가 같은 배열로 runIR 을 돈다. */
  irArgs: {
    actKind: number[];
    actArg: number[];
    gotoTab: number[];
    ruleLen: number[];
    ruleOp: number[];
    nTerm: number;
    toks: number[];
    inVal: number[];
    bufLen: number;
  };
};

export function ruleName(r: number): string {
  return `R${r}`;
}

export function computeRound(data: LrPrecedenceData, precedence: number): LrRound {
  const rule = data.precedenceRules[precedence];
  if (rule === undefined) throw new Error(`lr-precedence: 우선순위 규칙 ${precedence} 이 없다`);
  const toksRaw = tokenize(data.source);
  const inputTerms = toksRaw.map(terminalOf);
  const table = buildSlrTable(data.grammar, inputTerms);
  const { resolved, actKind, actArg } = resolveConflicts(table, rule);
  const termIdx = (s: string): number => {
    const k = table.terminals.indexOf(s);
    if (k < 0) throw new Error(`lr-precedence: 모르는 단말 '${s}'`);
    return k;
  };
  const toks = [...inputTerms.map(termIdx), termIdx(EOF)];
  const inVal = [...toksRaw.map((tk) => (tk.kind === 'NUM' ? Number(tk.text) : 0)), 0];
  const texts = [...toksRaw.map((tk) => tk.text), EOF];
  const bufLen = toksRaw.length + 2;
  const stack: number[] = Array.from({ length: bufLen }, () => 0);
  const vals: number[] = Array.from({ length: bufLen }, () => 0);
  const counts = [0, 0, 0];
  const conflictAt = table.conflicts.map((c) => c.state * table.nTerm + c.term);

  // 옆에서 쥐는 기호 스택 · 나무 (칸마다 기호 · 마디 · 토큰 자리)
  type Cell = { symbol: string; node: number; tokIdx: number };
  const symStack: Cell[] = [];
  const nodes: LrNode[] = [];
  const steps: LrStep[] = [];
  const textOf = (id: number): string => {
    const n = nodes[id] as LrNode;
    if (n.kids.length === 0) return n.label;
    return `(${textOf(n.kids[0] as number)} ${n.label} ${textOf(n.kids[1] as number)})`;
  };

  const value = runLr(actKind, actArg, table.gotoTab, table.ruleLen, table.ruleOp, table.nTerm, toks, inVal, stack, vals, counts, {
    shift(i, at, top) {
      symStack.push({ symbol: table.terminals[toks[i] as number] as string, node: -1, tokIdx: i });
      if (symStack.length !== top) throw new Error('lr-precedence: 기호 스택과 상태 스택의 높이가 어긋났다');
      steps.push({
        kind: 'shift',
        token: i,
        look: texts[i] as string,
        symbol: table.terminals[toks[i] as number] as string,
        stack: symStack.map((c) => c.symbol),
        cell: conflictAt.indexOf(at),
        remaining: texts.length - i - 1,
        shifts: counts[0] as number,
        maxStack: counts[2] as number,
      });
    },
    reduce(r, v, at, top) {
      const len = table.ruleLen[r] as number;
      const popped = symStack.splice(symStack.length - len, len);
      const kids = popped.filter((c) => c.node >= 0).map((c) => c.node);
      const opCell = popped.find((c) => c.node < 0 && c.symbol !== 'NUM');
      const numCell = popped.find((c) => c.symbol === 'NUM');
      const x = opCell !== undefined ? opCell.tokIdx : numCell !== undefined ? numCell.tokIdx : -1;
      if (x < 0) throw new Error('lr-precedence: 마디를 세울 자리가 없다');
      const level = kids.length === 0 ? 0 : 1 + Math.max(...kids.map((k) => (nodes[k] as LrNode).level));
      const label = opCell !== undefined ? opCell.symbol : String(v);
      const node: LrNode = { id: nodes.length, x, level, label, value: v, kids };
      nodes.push(node);
      symStack.push({ symbol: table.nonterminal, node: node.id, tokIdx: x });
      if (symStack.length !== top) throw new Error('lr-precedence: 기호 스택과 상태 스택의 높이가 어긋났다');
      steps.push({
        kind: 'reduce',
        rule: ruleName(r),
        pop: len,
        // 접기 갈고리는 i 를 받지 않는다 — 지금 읽는 자리는 먹은 토큰 수(밀기 수)와 같다
        look: texts[counts[0] as number] as string,
        stack: symStack.map((c) => c.symbol),
        value: v,
        cell: conflictAt.indexOf(at),
        node,
        reduces: counts[1] as number,
        maxStack: counts[2] as number,
      });
    },
    accept(v, _at) {
      const root = symStack[0];
      if (symStack.length !== 1 || root === undefined) throw new Error('lr-precedence: 받았는데 스택에 기호가 하나가 아니다');
      steps.push({ kind: 'accept', value: v, tree: textOf(root.node), look: EOF, root: root.node });
    },
  });
  if (value < 0) throw new Error('lr-precedence: 표가 입력을 받지 못했다');
  const last = steps[steps.length - 1];
  if (last === undefined || last.kind !== 'accept') throw new Error('lr-precedence: 받음 걸음이 없다');

  return {
    tokens: [...toksRaw.map(tokenLabel), EOF],
    conflicts: table.conflicts.map((c) => ({
      item: completeItemText(table.rules[c.reduceRule] as LrRule),
      look: table.terminals[c.term] as string,
      reduceRule: ruleName(c.reduceRule),
    })),
    resolved: resolved.map((r) => ({ action: r.action, rule: ruleName(r.rule) })),
    shiftCells: resolved.filter((r) => r.action === 'shift').length,
    reduceCells: resolved.filter((r) => r.action === 'reduce').length,
    steps,
    value,
    tree: last.tree,
    shifts: counts[0] as number,
    reduces: counts[1] as number,
    maxStack: counts[2] as number,
    irArgs: {
      actKind,
      actArg,
      gotoTab: table.gotoTab,
      ruleLen: table.ruleLen,
      ruleOp: table.ruleOp,
      nTerm: table.nTerm,
      toks,
      inVal,
      bufLen,
    },
  };
}

// ── 알고리즘

export async function lrPrecedenceAlgorithm(ctx: FacetContext<LrPrecedenceData>): Promise<void> {
  const rctx = ctx as ReactiveContext<LrPrecedenceData>;
  const data = ctx.data;
  const ladder = data.precedenceLadder;
  if (!ladder.includes(data.precedence)) throw new Error('lr-precedence: 기본 우선순위가 사다리에 없다');

  // 계기는 누적 채널이다 — 지금 보이는 값을 들고 차이만 보낸다 (첫 판은 차이 0 이어도 보낸다)
  const shown = new Map<string, number>([
    ['shift-cells', 0],
    ['shifts', 0],
    ['reduces', 0],
    ['max-stack', 0],
  ]);
  const setMetric = (name: string, value: number): void => {
    const cur = shown.get(name);
    if (cur === undefined) throw new Error(`lr-precedence: 선언하지 않은 계기 ${name}`);
    shown.set(name, value);
    ctx.metric(name, value - cur);
  };
  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playRound = async (precedence: number): Promise<boolean> => {
    const round = computeRound(data, precedence);
    const rule = data.precedenceRules[precedence] as LrPrecRule;

    // #0 시작
    setMetric('shift-cells', 0);
    setMetric('shifts', 0);
    setMetric('reduces', 0);
    setMetric('max-stack', 0);
    await ctx.emit({
      type: 'round-start',
      payload: {
        precedence,
        tokens: round.tokens,
        remaining: round.tokens.length,
        conflicts: round.conflicts,
        ops: rule.ops.map((o) => ({ op: o.op, level: o.level, assoc: o.assoc })),
      },
    });
    if (!(await rctx.sleep(data.stepMs))) return false;

    // #1 표 정하기
    await ctx.emit({
      type: 'resolve',
      payload: { cells: round.resolved, shiftCells: round.shiftCells, reduceCells: round.reduceCells },
    });
    setMetric('shift-cells', round.shiftCells);
    if (!(await rctx.sleep(data.stepMs))) return false;

    // 동작 하나 = 한 걸음
    for (const step of round.steps) {
      if (ctx.cancelled) return false;
      if (step.kind === 'shift') {
        await phase('shift');
        await ctx.emit({ type: 'shift', payload: { ...step } });
        setMetric('shifts', step.shifts);
        setMetric('max-stack', step.maxStack);
      } else if (step.kind === 'reduce') {
        await phase('reduce');
        await ctx.emit({ type: 'reduce', payload: { ...step, node: { ...step.node, kids: [...step.node.kids] } } });
        setMetric('reduces', step.reduces);
        setMetric('max-stack', step.maxStack);
      } else {
        await phase('accept');
        await ctx.emit({ type: 'accept', payload: { ...step } });
      }
      if (!(await rctx.sleep(data.stepMs))) return false;
    }
    return true;
  };

  try {
    let precedence = data.precedence;
    while (!ctx.cancelled) {
      if (!(await playRound(precedence))) return;
      let got: number | null = null;
      while (got === null) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'precedence') continue; // 우리 손잡이가 아닌 입력
        const p = input.payload;
        if (typeof p !== 'object' || p === null) continue;
        const v = (p as { value?: unknown }).value;
        if (typeof v !== 'number' || !ladder.includes(v)) continue;
        got = v;
      }
      precedence = got;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
