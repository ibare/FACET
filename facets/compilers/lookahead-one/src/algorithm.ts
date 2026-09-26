/**
 * lookahead-one — 재귀 하강 파서가 갈래를 고를 때마다 다음 토큰 하나를 먹지 않고 들여다본다.
 *
 * 문법(rules)에서 갈래마다 받는 단말(FIRST, 몸이 비워질 수 있으면 왼쪽 비단말의 FOLLOW 를 더함)을 셈하고,
 * 토큰 열 끝에 EOF 를 붙여 시작 기호(첫 규칙의 왼쪽)부터 실제로 재귀 하강한다.
 * 갈래가 둘 이상인 비단말에서 다음 토큰을 들여다보고 하나를 고르는 것만 걸음이다.
 * 갈래가 하나뿐인 규칙 · 토큰 먹기 · 함수 부르기는 걸음이 아니다.
 *
 * 이벤트
 * - `init` (silent) — 바탕. 걸음 0 을 갈아 끼운다.
 *     payload: {
 *       tokens: { kind: string; text: string; line: number }[]   // 끝에 EOF (text '', line -1)
 *       accept: { rule: string; terms: string[] }[]              // 규칙 차례대로, 받는 단말
 *     }
 * - `pick` — 고르기 한 번.
 *     payload: {
 *       nt: string      // 갈래를 고르는 비단말
 *       pos: number     // 들여다본 토큰 자리 (0 부터). 그 앞 토큰은 모두 먹혔다
 *       term: string    // 들여다본 토큰이 문법에서 불리는 단말 (NAME · NUM · 원문 · EOF)
 *       rule: string    // 고른 규칙 id
 *     }
 *
 * 던지는 경우 (C6): 원문과 토큰 원문이 줄마다 맞지 않음, 두 갈래가 같은 단말을 받음(LL(1) 아님),
 * 들여다본 단말을 받는 갈래가 없음, 기대한 단말이 아님, 시작 기호 뒤에 입력이 남음.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface LookaheadToken {
  kind: string;
  text: string;
}

export interface LookaheadRule {
  id: string;
  lhs: string;
  rhs: string[];
}

export interface LookaheadOneFacetData {
  type: 'lookahead-one';
  stepMs: number;
  source: string[];
  tokens: LookaheadToken[];
  rules: LookaheadRule[];
}

export const EOF = 'EOF';

/** 토큰이 문법에서 불리는 단말 — NAME · NUM 은 종류 이름, 그 밖은 원문, EOF 는 EOF. */
export function termOf(tok: LookaheadToken): string {
  if (tok.kind === EOF) return EOF;
  if (tok.kind === 'NAME' || tok.kind === 'NUM') return tok.kind;
  return tok.text;
}

/** 규칙 한 줄의 글자 — `Stmts → Stmt Stmts`, 빈 몸은 `ε`. 장면 · 그림이 같은 함수를 부른다. */
export function ruleText(rule: LookaheadRule): string {
  const body = rule.rhs.length === 0 ? 'ε' : rule.rhs.join(' ');
  return rule.lhs + ' → ' + body;
}

/** 토큰마다 속한 원문 줄. 빈칸을 뺀 줄 글자와 토큰 원문을 이은 글자가 줄마다 같아야 한다. */
export function tokenLines(source: string[], tokens: LookaheadToken[]): number[] {
  const out: number[] = [];
  let k = 0;
  for (let li = 0; li < source.length; li += 1) {
    const want = source[li]!.replace(/\s+/g, '');
    let got = '';
    while (got.length < want.length) {
      if (k >= tokens.length) throw new Error(`줄 ${li + 1}: 토큰이 모자란다 ('${want}' 중 '${got}' 까지)`);
      got += tokens[k]!.text;
      out.push(li);
      k += 1;
    }
    if (got !== want) throw new Error(`줄 ${li + 1}: 원문 '${want}' 과 토큰 원문 '${got}' 이 다르다`);
  }
  if (k !== tokens.length) throw new Error(`원문 줄보다 토큰이 많다 (${tokens.length - k} 남음)`);
  return out;
}

/** 갈래마다 받는 단말 — FIRST(몸), 몸이 비워질 수 있으면 FOLLOW(왼쪽) 를 더한다. */
export function acceptSets(rules: LookaheadRule[]): Map<string, Set<string>> {
  if (rules.length === 0) throw new Error('규칙이 없다');
  const nts = new Set(rules.map((r) => r.lhs));
  const start = rules[0]!.lhs;
  const nullable = new Set<string>();
  const first = new Map<string, Set<string>>();
  const follow = new Map<string, Set<string>>();
  for (const n of nts) {
    first.set(n, new Set());
    follow.set(n, new Set());
  }
  follow.get(start)!.add(EOF);

  const firstOfSeq = (seq: string[]): { set: Set<string>; empty: boolean } => {
    const set = new Set<string>();
    for (const sym of seq) {
      if (!nts.has(sym)) {
        set.add(sym);
        return { set, empty: false };
      }
      for (const a of first.get(sym)!) set.add(a);
      if (!nullable.has(sym)) return { set, empty: false };
    }
    return { set, empty: true };
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rules) {
      const f = firstOfSeq(r.rhs);
      const into = first.get(r.lhs)!;
      for (const a of f.set) {
        if (!into.has(a)) {
          into.add(a);
          changed = true;
        }
      }
      if (f.empty && !nullable.has(r.lhs)) {
        nullable.add(r.lhs);
        changed = true;
      }
    }
  }
  changed = true;
  while (changed) {
    changed = false;
    for (const r of rules) {
      for (let i = 0; i < r.rhs.length; i += 1) {
        const sym = r.rhs[i]!;
        if (!nts.has(sym)) continue;
        const rest = firstOfSeq(r.rhs.slice(i + 1));
        const into = follow.get(sym)!;
        const add = new Set(rest.set);
        if (rest.empty) for (const a of follow.get(r.lhs)!) add.add(a);
        for (const a of add) {
          if (!into.has(a)) {
            into.add(a);
            changed = true;
          }
        }
      }
    }
  }

  const out = new Map<string, Set<string>>();
  for (const r of rules) {
    const f = firstOfSeq(r.rhs);
    const set = new Set(f.set);
    if (f.empty) for (const a of follow.get(r.lhs)!) set.add(a);
    out.set(r.id, set);
  }
  // LL(1) 확인 — 같은 왼쪽의 두 갈래가 같은 단말을 받으면 고를 수 없다
  for (const n of nts) {
    const alts = rules.filter((r) => r.lhs === n);
    for (let i = 0; i < alts.length; i += 1) {
      for (let j = i + 1; j < alts.length; j += 1) {
        for (const a of out.get(alts[i]!.id)!) {
          if (out.get(alts[j]!.id)!.has(a)) {
            throw new Error(`${n}: ${alts[i]!.id} 와 ${alts[j]!.id} 가 같은 단말 '${a}' 를 받는다 — LL(1) 이 아니다`);
          }
        }
      }
    }
  }
  return out;
}

export async function lookaheadOne(ctxIn: FacetContext<LookaheadOneFacetData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<LookaheadOneFacetData>;
  const { rules, tokens, source, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const lines = tokenLines(source, tokens);
  const accept = acceptSets(rules);
  const stream: LookaheadToken[] = [...tokens, { kind: EOF, text: '' }];
  const nts = new Set(rules.map((r) => r.lhs));

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      tokens: stream.map((tk, i) => ({ kind: tk.kind, text: tk.text, line: i < lines.length ? lines[i]! : -1 })),
      accept: rules.map((r) => ({ rule: r.id, terms: [...accept.get(r.id)!] })),
    },
  });

  let pos = 0;

  /** 비단말 하나를 파싱한다. 취소되면 false. */
  async function parse(nt: string): Promise<boolean> {
    const alts = rules.filter((r) => r.lhs === nt);
    if (alts.length === 0) throw new Error(`비단말 '${nt}' 의 규칙이 없다`);
    let chosen: LookaheadRule;
    if (alts.length === 1) {
      chosen = alts[0]!;
    } else {
      const tok = stream[pos];
      if (!tok) throw new Error(`자리 ${pos}: 토큰이 없다`);
      const term = termOf(tok);
      const hit = alts.filter((r) => accept.get(r.id)!.has(term));
      if (hit.length !== 1) throw new Error(`${nt}: 자리 ${pos} 의 '${term}' 를 받는 갈래가 ${hit.length} 개`);
      chosen = hit[0]!;
      if (!(await pause())) return false;
      await ctx.emit({ type: 'pick', payload: { nt, pos, term, rule: chosen.id } });
    }
    for (const sym of chosen.rhs) {
      if (ctx.cancelled) return false;
      if (nts.has(sym)) {
        if (!(await parse(sym))) return false;
      } else {
        const tok = stream[pos];
        if (!tok) throw new Error(`자리 ${pos}: '${sym}' 를 기대했으나 토큰이 없다`);
        if (termOf(tok) !== sym) throw new Error(`자리 ${pos}: '${sym}' 를 기대했으나 '${termOf(tok)}'`);
        pos += 1;
      }
    }
    return true;
  }

  if (!(await parse(rules[0]!.lhs))) return;
  const last = stream[pos];
  if (!last || last.kind !== EOF) throw new Error(`자리 ${pos}: 시작 기호를 다 읽었는데 입력이 남았다`);
}
