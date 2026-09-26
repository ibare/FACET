/**
 * one-function-per-rule — 규칙마다 함수 하나인 재귀 하강 파서가 토큰 열을 읽는 동안
 * 흐름이 함수 사이를 드나드는 차례를 낸다.
 *
 * 한 걸음 = 흐름이 한 함수에서 다른 함수로 옮겨 가는 것 (부름 또는 돌아옴). 그 사이 지금 함수가
 * 먹은 토큰은 그 옮김 걸음에 든다. 갈래 고르기(다음 토큰 하나로)는 걸음이 아니다.
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 채운다 (아무 함수도 불리지 않음) — `init` 이벤트는 없다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음)
 *
 * - `call`   흐름이 부르는 함수에서 불리는 함수로 들어간다
 *   payload: {
 *     from: string | null,   // 부르는 비단말. 맨 바깥이면 null
 *     to: string,            // 불리는 비단말
 *     path: number[],        // 부르는 함수 안에서 이번 걸음에 지나간 줄 (functionCode 의 줄 자리). 바깥이면 []
 *     eaten: number[],       // 이번 걸음에 부르는 함수가 먹은 토큰 자리 (0 부터)
 *   }
 * - `return` 흐름이 몸을 다 따라간 함수에서 부른 쪽으로 돌아 나온다
 *   payload: {
 *     from: string,          // 돌아 나오는 비단말
 *     to: string | null,     // 돌아가는 비단말. 맨 바깥이면 null
 *     path: number[],        // 돌아 나오는 함수 안에서 이번 걸음에 지나간 줄
 *     eaten: number[],       // 이번 걸음에 돌아 나오는 함수가 먹은 토큰 자리
 *     eof: boolean,          // 바깥으로 돌아왔을 때 다음 토큰이 EOF 인가 (바깥이 아니면 false)
 *   }
 *
 * 문법 · 토큰 · 코드 줄은 모두 initialData 에서 셈한다. 모르는 모양 · 받을 갈래가 없는 토큰 · 왼쪽 재귀 ·
 * 원문과 어긋나는 토큰 열은 던진다 (C6).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GrammarRule = { id: string; lhs: string; rhs: string[] };
export type SourceToken = { kind: string; text: string };

export type OneFunctionPerRuleFacetData = {
  type: 'one-function-per-rule';
  source: string;
  tokens: SourceToken[];
  rules: GrammarRule[];
  stepMs: number;
};

/** 입력 끝 표식. 데이터에 넣지 않고 셈에서 토큰 열 끝에 붙는다. */
export const EOF = 'EOF';

const RULE_ID = /^R\d+$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** initialData 를 좁힌다. 모양이 어긋나면 던진다. */
export function narrowData(raw: unknown): OneFunctionPerRuleFacetData {
  if (!isRecord(raw)) throw new Error('one-function-per-rule: initialData 가 객체가 아니다');
  if (raw.type !== 'one-function-per-rule') throw new Error(`one-function-per-rule: type 이 다르다 — ${String(raw.type)}`);
  const { source, tokens, rules, stepMs } = raw;
  if (typeof source !== 'string' || source.length === 0) throw new Error('one-function-per-rule: source 가 없다');
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('one-function-per-rule: stepMs 가 양수가 아니다');
  if (!Array.isArray(tokens) || tokens.length === 0) throw new Error('one-function-per-rule: tokens 가 없다');
  if (!Array.isArray(rules) || rules.length === 0) throw new Error('one-function-per-rule: rules 가 없다');
  const toks: SourceToken[] = tokens.map((tk, i) => {
    if (!isRecord(tk) || typeof tk.kind !== 'string' || typeof tk.text !== 'string' || tk.kind === '' || tk.text === '') {
      throw new Error(`one-function-per-rule: 토큰 #${i} 의 모양이 어긋난다`);
    }
    if (tk.kind === EOF) throw new Error(`one-function-per-rule: 토큰 #${i} — EOF 는 데이터에 넣지 않는다`);
    return { kind: tk.kind, text: tk.text };
  });
  const rs: GrammarRule[] = rules.map((r, i) => {
    if (!isRecord(r) || typeof r.id !== 'string' || !RULE_ID.test(r.id) || typeof r.lhs !== 'string' || r.lhs === '') {
      throw new Error(`one-function-per-rule: 규칙 #${i} 의 모양이 어긋난다`);
    }
    if (!Array.isArray(r.rhs) || !r.rhs.every((s): s is string => typeof s === 'string' && s !== '')) {
      throw new Error(`one-function-per-rule: 규칙 ${r.id} 의 몸이 어긋난다`);
    }
    if (r.id !== `R${i + 1}`) throw new Error(`one-function-per-rule: 규칙 번호가 차례와 다르다 — ${r.id} 자리 ${i + 1}`);
    return { id: r.id, lhs: r.lhs, rhs: [...r.rhs] };
  });
  // 원문에서 빈칸을 뺀 글자 = 토큰 원문을 이은 글자
  const bare = source.replace(/\s+/g, '');
  const joined = toks.map((tk) => tk.text).join('');
  if (bare !== joined) throw new Error(`one-function-per-rule: 원문과 토큰 열이 어긋난다 — "${bare}" / "${joined}"`);
  return { type: 'one-function-per-rule', source, tokens: toks, rules: rs, stepMs };
}

/** 비단말 — lhs 에 나오는 이름, 처음 나온 차례로. */
export function nonterminals(rules: readonly GrammarRule[]): string[] {
  const out: string[] = [];
  for (const r of rules) if (!out.includes(r.lhs)) out.push(r.lhs);
  return out;
}

/** 문법이 보는 단말 — NAME · NUM 은 종류, 그 밖은 원문. */
export function terminalOf(tok: SourceToken | null): string {
  if (tok === null) return EOF;
  if (tok.kind === 'NAME' || tok.kind === 'NUM') return tok.kind;
  return tok.text;
}

/** 토큰 글자 — `NAME a` · 끝은 `EOF`. */
export function tokenLabel(tok: SourceToken | null): string {
  return tok === null ? EOF : `${tok.kind} ${tok.text}`;
}

/** 파서 함수 이름 — 비단말의 첫 글자를 작게. */
export function functionName(nonterminal: string): string {
  return nonterminal.charAt(0).toLowerCase() + nonterminal.slice(1);
}

/** 한 비단말의 규칙 글자 — `Atom → ( Expr ) | NAME | NUM`. */
export function ruleText(rules: readonly GrammarRule[], lhs: string): string {
  const alts = rules.filter((r) => r.lhs === lhs);
  if (alts.length === 0) throw new Error(`one-function-per-rule: 비단말 ${lhs} 의 규칙이 없다`);
  return `${lhs} → ${alts.map((r) => (r.rhs.length === 0 ? 'ε' : r.rhs.join(' '))).join(' | ')}`;
}

export type Ll1 = {
  /** 비단말 → (받는 단말 → 규칙 자리) */
  table: Map<string, Map<string, number>>;
  /** 규칙 자리 → 그 갈래가 받는 단말 (적힌 차례를 지킨 정렬) */
  accepts: string[][];
};

/** FIRST · FOLLOW 로 LL(1) 표를 짓는다. 한 칸에 갈래가 둘이면 던진다. */
export function ll1(rules: readonly GrammarRule[]): Ll1 {
  const nts = nonterminals(rules);
  const isNt = (s: string): boolean => nts.includes(s);
  const start = nts[0];
  if (start === undefined) throw new Error('one-function-per-rule: 시작 기호가 없다');
  const first = new Map<string, Set<string>>(nts.map((n) => [n, new Set<string>()]));
  const nullable = new Set<string>();
  const firstOf = (n: string): Set<string> => {
    const f = first.get(n);
    if (f === undefined) throw new Error(`one-function-per-rule: 비단말이 아니다 — ${n}`);
    return f;
  };
  const firstSeq = (seq: readonly string[]): { set: Set<string>; empty: boolean } => {
    const set = new Set<string>();
    for (const x of seq) {
      if (!isNt(x)) {
        set.add(x);
        return { set, empty: false };
      }
      for (const a of firstOf(x)) set.add(a);
      if (!nullable.has(x)) return { set, empty: false };
    }
    return { set, empty: true };
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rules) {
      const f = firstOf(r.lhs);
      const before = f.size;
      const wasNull = nullable.has(r.lhs);
      const { set, empty } = firstSeq(r.rhs);
      for (const a of set) f.add(a);
      if (empty) nullable.add(r.lhs);
      if (f.size !== before || nullable.has(r.lhs) !== wasNull) changed = true;
    }
  }
  const follow = new Map<string, Set<string>>(nts.map((n) => [n, new Set<string>()]));
  const followOf = (n: string): Set<string> => {
    const f = follow.get(n);
    if (f === undefined) throw new Error(`one-function-per-rule: 비단말이 아니다 — ${n}`);
    return f;
  };
  followOf(start).add(EOF);
  changed = true;
  while (changed) {
    changed = false;
    for (const r of rules) {
      r.rhs.forEach((x, i) => {
        if (!isNt(x)) return;
        const fx = followOf(x);
        const before = fx.size;
        const { set, empty } = firstSeq(r.rhs.slice(i + 1));
        for (const a of set) fx.add(a);
        if (empty) for (const a of followOf(r.lhs)) fx.add(a);
        if (fx.size !== before) changed = true;
      });
    }
  }
  const table = new Map<string, Map<string, number>>(nts.map((n) => [n, new Map<string, number>()]));
  const accepts: string[][] = [];
  rules.forEach((r, ri) => {
    const { set, empty } = firstSeq(r.rhs);
    const keys = [...set];
    if (empty) for (const a of followOf(r.lhs)) if (!keys.includes(a)) keys.push(a);
    const row = table.get(r.lhs);
    if (row === undefined) throw new Error(`one-function-per-rule: 표에 ${r.lhs} 줄이 없다`);
    for (const a of keys) {
      const had = row.get(a);
      if (had !== undefined) {
        throw new Error(`one-function-per-rule: LL(1) 충돌 — ${r.lhs} 에서 ${a}: ${rules[had]?.id ?? '?'} 과 ${r.id}`);
      }
      row.set(a, ri);
    }
    accepts.push(keys);
  });
  return { table, accepts };
}

/** 코드 글자 안의 단말 — 종류(NAME · NUM)는 그대로, 원문은 큰따옴표. */
function codeTerminal(a: string): string {
  return a === 'NAME' || a === 'NUM' || a === EOF ? a : `"${a}"`;
}

export type FunctionAlt = {
  /** 규칙 자리 (0 부터) */
  rule: number;
  /** 갈래를 고르는 줄 자리 — 갈래가 하나면 null */
  cond: number | null;
  /** 몸의 기호마다 그 기호를 다루는 줄 자리 */
  sym: number[];
};

export type FunctionCode = {
  lhs: string;
  name: string;
  /** 줄 글자 (들여쓰기 빈칸 포함). 0 번 줄이 `function name()` */
  lines: string[];
  alts: FunctionAlt[];
};

const INDENT = '    ';

/**
 * 문법을 파서 함수로 옮긴다 — 비단말마다 함수 하나, pseudo-notation.
 * 비단말은 `name()` 부르기, 단말은 `eat(…)`, 갈래가 여럿이면 `if peek() == …` 사슬과 `throw Unexpected`.
 */
export function functionCode(rules: readonly GrammarRule[]): FunctionCode[] {
  const nts = nonterminals(rules);
  const { accepts } = ll1(rules);
  return nts.map((lhs) => {
    const own = rules.map((r, ri) => ({ r, ri })).filter(({ r }) => r.lhs === lhs);
    const name = functionName(lhs);
    const lines: string[] = [`function ${name}()`];
    const alts: FunctionAlt[] = [];
    const bodyLine = (s: string, pad: string): string => (nts.includes(s) ? `${pad}${functionName(s)}()` : `${pad}eat(${codeTerminal(s)})`);
    if (own.length === 1) {
      const only = own[0];
      if (only === undefined) throw new Error(`one-function-per-rule: ${lhs} 의 갈래가 없다`);
      if (only.r.rhs.length === 0) throw new Error(`one-function-per-rule: ${only.r.id} — 빈 몸의 코드 모양이 없다`);
      const sym = only.r.rhs.map((s) => {
        lines.push(bodyLine(s, INDENT));
        return lines.length - 1;
      });
      alts.push({ rule: only.ri, cond: null, sym });
    } else {
      own.forEach(({ r, ri }, k) => {
        if (r.rhs.length === 0) throw new Error(`one-function-per-rule: ${r.id} — 빈 몸의 코드 모양이 없다`);
        const keys = accepts[ri];
        if (keys === undefined || keys.length === 0) throw new Error(`one-function-per-rule: ${r.id} 가 받는 단말이 없다`);
        const test = keys.map((a) => `peek() == ${codeTerminal(a)}`).join(' or ');
        lines.push(`${INDENT}${k === 0 ? 'if' : 'else if'} ${test}`);
        const cond = lines.length - 1;
        const sym = r.rhs.map((s) => {
          lines.push(bodyLine(s, INDENT + INDENT));
          return lines.length - 1;
        });
        alts.push({ rule: ri, cond, sym });
      });
      lines.push(`${INDENT}else`);
      lines.push(`${INDENT}${INDENT}throw Unexpected`);
    }
    return { lhs, name, lines, alts };
  });
}

/** 왼쪽 재귀를 막는다 — 몸의 첫 기호가 자기 이름인 규칙이 있으면 던진다. */
export function assertNoLeftRecursion(rules: readonly GrammarRule[]): void {
  for (const r of rules) {
    if (r.rhs[0] === r.lhs) throw new Error(`one-function-per-rule: ${r.id} 이 왼쪽 재귀다 — 재귀 하강이 끝없이 깊어진다`);
  }
}

export async function oneFunctionPerRule(context: FacetContext<OneFunctionPerRuleFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<OneFunctionPerRuleFacetData>;
  const data = narrowData(ctx.data);
  const { rules, tokens, stepMs } = data;
  assertNoLeftRecursion(rules);
  const { table } = ll1(rules);
  const codes = functionCode(rules);
  const nts = nonterminals(rules);
  const start = nts[0];
  if (start === undefined) throw new Error('one-function-per-rule: 시작 기호가 없다');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let pos = 0;
  /** 지금 함수가 마지막 옮김 뒤로 먹은 토큰 자리 */
  let eaten: number[] = [];
  /** 지금 함수 안에서 마지막 옮김 뒤로 지나간 줄 */
  let path: number[] = [];

  const peek = (): SourceToken | null => {
    if (pos > tokens.length) throw new Error(`one-function-per-rule: 입력 끝을 넘어 읽었다 — 자리 ${pos}`);
    return pos < tokens.length ? (tokens[pos] ?? null) : null;
  };

  async function enter(lhs: string, caller: string | null): Promise<boolean> {
    const code = codes.find((c) => c.lhs === lhs);
    if (code === undefined) throw new Error(`one-function-per-rule: ${lhs} 의 함수가 없다`);
    const row = table.get(lhs);
    if (row === undefined) throw new Error(`one-function-per-rule: 표에 ${lhs} 줄이 없다`);
    const la = peek();
    const ri = row.get(terminalOf(la));
    if (ri === undefined) throw new Error(`one-function-per-rule: ${lhs} 에서 토큰 #${pos} ${tokenLabel(la)} 를 받는 갈래가 없다`);
    const alt = code.alts.find((a) => a.rule === ri);
    const rule = rules[ri];
    if (alt === undefined || rule === undefined) throw new Error(`one-function-per-rule: ${lhs} 에 규칙 자리 ${ri} 의 갈래가 없다`);
    path = [0];
    if (alt.cond !== null) path.push(alt.cond);
    for (let k = 0; k < rule.rhs.length; k += 1) {
      if (ctx.cancelled) return false;
      const sym = rule.rhs[k];
      const line = alt.sym[k];
      if (sym === undefined || line === undefined) throw new Error(`one-function-per-rule: ${rule.id} 의 기호 ${k} 에 줄이 없다`);
      path.push(line);
      if (nts.includes(sym)) {
        if (!(await pause())) return false;
        await ctx.emit({ type: 'call', payload: { from: lhs, to: sym, path: [...path], eaten: [...eaten] } });
        eaten = [];
        if (!(await enter(sym, lhs))) return false;
        path = [line];
      } else {
        const tok = peek();
        if (terminalOf(tok) !== sym) {
          throw new Error(`one-function-per-rule: ${rule.id} — ${sym} 를 바랐는데 토큰 #${pos} ${tokenLabel(tok)}`);
        }
        eaten.push(pos);
        pos += 1;
      }
    }
    if (!(await pause())) return false;
    const eof = terminalOf(peek()) === EOF;
    if (caller === null && !eof) throw new Error(`one-function-per-rule: 바깥으로 돌아왔는데 토큰 #${pos} 가 남았다`);
    await ctx.emit({ type: 'return', payload: { from: lhs, to: caller, path: [...path], eaten: [...eaten], eof: caller === null && eof } });
    eaten = [];
    path = [];
    return true;
  }

  // 맨 바깥에서 시작 기호를 부른다. 걸음 0 은 읽을 것이 있는 화면이라 첫 발신 앞에도 문을 둔다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'call', payload: { from: null, to: start, path: [], eaten: [] } });
  await enter(start, null);
}
