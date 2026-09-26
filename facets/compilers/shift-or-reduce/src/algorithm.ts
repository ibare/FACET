/**
 * shift-or-reduce — 아래에서 위로 짓는 파서가 토큰마다 밀지 접을지 정하는 차례.
 *
 * 문법에서 SLR(1) 표를 짓고(`S' → 시작기호` 를 더한 LR(0) 항목 모음 + FOLLOW),
 * 토큰 열 끝에 EOF 를 붙여 그 표대로 파서를 돌린다. 동작 하나가 걸음 하나다.
 * 표의 한 칸에 동작이 둘이면 이 조각의 문법이 아니다 — 던진다.
 *
 * 이벤트 (모두 silent 아님, 걸음 하나씩):
 *   shift   payload { sym: string; text: string; la: string; matches: string[] }
 *           sym = 밀린 토큰의 문법 단말, text = 토큰 원문, la = 들여다본 단말(= sym),
 *           matches = 밀기 **앞** 스택 꼭대기가 몸과 맞던 규칙 id 들(적힌 차례, 없으면 []).
 *   reduce  payload { rule: string; lhs: string; size: number; la: string }
 *           rule = 접은 규칙 id, lhs = 그 왼쪽 이름, size = 접힌 꼭대기 칸 수, la = 다음 단말.
 *   accept  payload { la: string; start: string }
 *           la = 'EOF', start = 스택에 홀로 남은 시작 기호.
 *
 * 걸음 0(시작)은 장면의 initial() 이 initialData 에서 채운다 — init 이벤트는 없다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Tok = { kind: string; text: string };
export type Rule = { id: string; lhs: string; rhs: string[] };

export type ShiftOrReduceFacetData = {
  type: 'shift-or-reduce';
  source: string;
  rules: Rule[];
  tokens: Tok[];
  stepMs: number;
};

const EOF = 'EOF';

/** 문법이 보는 단말 — NAME · NUM · EOF 는 종류 이름, 그 밖은 원문. */
export function terminalOf(tok: Tok): string {
  if (tok.kind === 'NAME' || tok.kind === 'NUM' || tok.kind === EOF) return tok.kind;
  if (tok.text === '') throw new Error(`shift-or-reduce: 원문이 빈 토큰 (${tok.kind})`);
  return tok.text;
}

/** 파서가 읽는 입력 — 토큰 열 끝에 EOF 를 붙인다. 장면 · 그림 · 알고리즘이 함께 부른다. */
export function inputWithEof(tokens: readonly Tok[]): Tok[] {
  return [...tokens.map((k) => ({ kind: k.kind, text: k.text })), { kind: EOF, text: '' }];
}

/** 규칙 글자 — `Expr → Expr + Term`. */
export function ruleText(rule: Rule): string {
  const body = rule.rhs.length === 0 ? 'ε' : rule.rhs.join(' ');
  return `${rule.lhs} → ${body}`;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function readTok(x: unknown, at: number): Tok {
  if (!isRecord(x) || typeof x.kind !== 'string' || typeof x.text !== 'string') {
    throw new Error(`shift-or-reduce: tokens[${at}] 모양이 틀렸다`);
  }
  return { kind: x.kind, text: x.text };
}

function readRule(x: unknown, at: number): Rule {
  if (!isRecord(x) || typeof x.id !== 'string' || typeof x.lhs !== 'string' || !Array.isArray(x.rhs)) {
    throw new Error(`shift-or-reduce: rules[${at}] 모양이 틀렸다`);
  }
  const rhs = x.rhs.map((s, j) => {
    if (typeof s !== 'string') throw new Error(`shift-or-reduce: rules[${at}].rhs[${j}] 가 글자가 아니다`);
    return s;
  });
  return { id: x.id, lhs: x.lhs, rhs };
}

/** initialData 좁히개 — 장면과 알고리즘이 함께 쓴다. 모양이 틀리면 던진다. */
export function readShiftOrReduceData(x: unknown): ShiftOrReduceFacetData {
  if (!isRecord(x) || x.type !== 'shift-or-reduce') throw new Error('shift-or-reduce: initialData.type 이 틀렸다');
  if (typeof x.source !== 'string') throw new Error('shift-or-reduce: source 가 없다');
  if (!Array.isArray(x.rules) || x.rules.length === 0) throw new Error('shift-or-reduce: rules 가 없다');
  if (!Array.isArray(x.tokens) || x.tokens.length === 0) throw new Error('shift-or-reduce: tokens 가 없다');
  if (typeof x.stepMs !== 'number') throw new Error('shift-or-reduce: stepMs 가 없다');
  return {
    type: 'shift-or-reduce',
    source: x.source,
    rules: x.rules.map(readRule),
    tokens: x.tokens.map(readTok),
    stepMs: x.stepMs,
  };
}

// ---------------------------------------------------------------- SLR(1) 표

type Action =
  | { act: 'shift'; to: number }
  | { act: 'reduce'; rule: number }
  | { act: 'accept' };

type Table = {
  action: Map<string, Action>[];
  goto: Map<string, number>[];
};

const AUG = "S'";

function firstSets(rules: readonly Rule[], nts: ReadonlySet<string>): { first: Map<string, Set<string>>; nullable: Set<string> } {
  const first = new Map<string, Set<string>>();
  for (const n of nts) first.set(n, new Set());
  const nullable = new Set<string>();
  let changed = true;
  let rounds = 0;
  while (changed) {
    if ((rounds += 1) > 1000) throw new Error('shift-or-reduce: FIRST 가 수렴하지 않는다');
    changed = false;
    for (const r of rules) {
      const into = first.get(r.lhs);
      if (!into) throw new Error(`shift-or-reduce: 비단말 ${r.lhs} 의 FIRST 자리가 없다`);
      let allNull = true;
      for (const s of r.rhs) {
        if (!nts.has(s)) {
          if (!into.has(s)) { into.add(s); changed = true; }
          allNull = false;
          break;
        }
        const fs = first.get(s);
        if (!fs) throw new Error(`shift-or-reduce: 비단말 ${s} 의 FIRST 자리가 없다`);
        for (const a of fs) if (!into.has(a)) { into.add(a); changed = true; }
        if (!nullable.has(s)) { allNull = false; break; }
      }
      if (allNull && !nullable.has(r.lhs)) { nullable.add(r.lhs); changed = true; }
    }
  }
  return { first, nullable };
}

function followSets(rules: readonly Rule[], nts: ReadonlySet<string>, start: string): Map<string, Set<string>> {
  const { first, nullable } = firstSets(rules, nts);
  const follow = new Map<string, Set<string>>();
  for (const n of nts) follow.set(n, new Set());
  const startSet = follow.get(start);
  if (!startSet) throw new Error(`shift-or-reduce: 시작 기호 ${start} 가 비단말이 아니다`);
  startSet.add(EOF);
  let changed = true;
  let rounds = 0;
  while (changed) {
    if ((rounds += 1) > 1000) throw new Error('shift-or-reduce: FOLLOW 가 수렴하지 않는다');
    changed = false;
    for (const r of rules) {
      for (let i = 0; i < r.rhs.length; i += 1) {
        const b = r.rhs[i];
        if (b === undefined || !nts.has(b)) continue;
        const into = follow.get(b);
        if (!into) throw new Error(`shift-or-reduce: 비단말 ${b} 의 FOLLOW 자리가 없다`);
        let restNull = true;
        for (let j = i + 1; j < r.rhs.length; j += 1) {
          const s = r.rhs[j];
          if (s === undefined) throw new Error('shift-or-reduce: 몸의 자리가 비었다');
          if (!nts.has(s)) {
            if (!into.has(s)) { into.add(s); changed = true; }
            restNull = false;
            break;
          }
          const fs = first.get(s);
          if (!fs) throw new Error(`shift-or-reduce: 비단말 ${s} 의 FIRST 자리가 없다`);
          for (const a of fs) if (!into.has(a)) { into.add(a); changed = true; }
          if (!nullable.has(s)) { restNull = false; break; }
        }
        if (restNull) {
          const from = follow.get(r.lhs);
          if (!from) throw new Error(`shift-or-reduce: 비단말 ${r.lhs} 의 FOLLOW 자리가 없다`);
          for (const a of from) if (!into.has(a)) { into.add(a); changed = true; }
        }
      }
    }
  }
  return follow;
}

/** 항목 = [규칙 자리, 점 자리]. 규칙 자리 0 은 덧붙인 S' → 시작. */
type Item = readonly [number, number];

function itemKey(set: readonly Item[]): string {
  return set.map(([r, d]) => `${r}.${d}`).sort().join(' ');
}

/** 문법에서 SLR(1) 표를 짓는다. 한 칸에 동작이 둘이면 던진다. */
export function buildSlrTable(rules: readonly Rule[]): { table: Table; states: number } {
  const first = rules[0];
  if (!first) throw new Error('shift-or-reduce: 규칙이 없다');
  const start = first.lhs;
  const aug: Rule[] = [{ id: AUG, lhs: AUG, rhs: [start] }, ...rules];
  const nts = new Set(rules.map((r) => r.lhs));
  const follow = followSets(rules, nts, start);

  const closure = (seed: readonly Item[]): Item[] => {
    const out: Item[] = [...seed];
    const seen = new Set(out.map(([r, d]) => `${r}.${d}`));
    for (let k = 0; k < out.length; k += 1) {
      const it = out[k];
      if (!it) throw new Error('shift-or-reduce: 항목 자리가 비었다');
      const rule = aug[it[0]];
      if (!rule) throw new Error(`shift-or-reduce: 규칙 자리 ${it[0]} 가 없다`);
      const next = rule.rhs[it[1]];
      if (next === undefined || !nts.has(next)) continue;
      aug.forEach((r, ri) => {
        if (r.lhs !== next) return;
        const key = `${ri}.0`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push([ri, 0]);
      });
    }
    return out;
  };

  const seed = closure([[0, 0]]);
  const states: Item[][] = [seed];
  const index = new Map<string, number>([[itemKey(seed), 0]]);
  const trans: Map<string, number>[] = [];
  for (let s = 0; s < states.length; s += 1) {
    if (s > 10_000) throw new Error('shift-or-reduce: 상태가 너무 많다');
    const items = states[s];
    if (!items) throw new Error(`shift-or-reduce: 상태 ${s} 가 없다`);
    const bySym = new Map<string, Item[]>();
    for (const [ri, d] of items) {
      const rule = aug[ri];
      if (!rule) throw new Error(`shift-or-reduce: 규칙 자리 ${ri} 가 없다`);
      const x = rule.rhs[d];
      if (x === undefined) continue;
      const list = bySym.get(x);
      if (list) list.push([ri, d + 1]);
      else bySym.set(x, [[ri, d + 1]]);
    }
    const row = new Map<string, number>();
    for (const [x, kernel] of bySym) {
      const set = closure(kernel);
      const key = itemKey(set);
      let to = index.get(key);
      if (to === undefined) {
        to = states.length;
        states.push(set);
        index.set(key, to);
      }
      row.set(x, to);
    }
    trans[s] = row;
  }

  const action: Map<string, Action>[] = [];
  const gotoRows: Map<string, number>[] = [];
  const put = (s: number, a: string, act: Action): void => {
    const row = action[s];
    if (!row) throw new Error(`shift-or-reduce: 상태 ${s} 의 동작 줄이 없다`);
    const had = row.get(a);
    if (had && JSON.stringify(had) !== JSON.stringify(act)) {
      throw new Error(`shift-or-reduce: 표 충돌 — 한 칸(${a})에 동작 둘`);
    }
    row.set(a, act);
  };
  for (let s = 0; s < states.length; s += 1) {
    action[s] = new Map();
    const g = new Map<string, number>();
    const row = trans[s];
    if (!row) throw new Error(`shift-or-reduce: 상태 ${s} 의 옮김 줄이 없다`);
    for (const [x, to] of row) {
      if (nts.has(x)) g.set(x, to);
      else put(s, x, { act: 'shift', to });
    }
    gotoRows[s] = g;
    const items = states[s];
    if (!items) throw new Error(`shift-or-reduce: 상태 ${s} 의 항목이 없다`);
    for (const [ri, d] of items) {
      const rule = aug[ri];
      if (!rule) throw new Error(`shift-or-reduce: 규칙 자리 ${ri} 가 없다`);
      if (d < rule.rhs.length) continue;
      if (ri === 0) { put(s, EOF, { act: 'accept' }); continue; }
      const fs = follow.get(rule.lhs);
      if (!fs) throw new Error(`shift-or-reduce: 비단말 ${rule.lhs} 의 FOLLOW 자리가 없다`);
      for (const a of fs) put(s, a, { act: 'reduce', rule: ri - 1 });
    }
  }
  return { table: { action, goto: gotoRows }, states: states.length };
}

/** 스택 꼭대기가 몸과 맞는 규칙 id — 적힌 차례. 빈 몸은 치지 않는다. */
export function bodiesOnTop(rules: readonly Rule[], stack: readonly string[]): string[] {
  const out: string[] = [];
  for (const r of rules) {
    const n = r.rhs.length;
    if (n === 0 || n > stack.length) continue;
    const top = stack.slice(stack.length - n);
    if (top.every((s, i) => s === r.rhs[i])) out.push(r.id);
  }
  return out;
}

function checkSource(source: string, tokens: readonly Tok[]): void {
  const want = source.replace(/\s+/g, '');
  const got = tokens.map((k) => k.text).join('');
  if (want !== got) throw new Error(`shift-or-reduce: 원문(${want})과 토큰 원문(${got})이 다르다`);
}

export async function shiftOrReduce(context: FacetContext<ShiftOrReduceFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ShiftOrReduceFacetData>;
  const data = readShiftOrReduceData(ctx.data);
  checkSource(data.source, data.tokens);
  const { table } = buildSlrTable(data.rules);
  const input = inputWithEof(data.tokens);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const states: number[] = [0];
  const syms: string[] = [];
  let pos = 0;
  const limit = 4 * input.length * (data.rules.length + 2);
  for (let n = 0; ; n += 1) {
    // 걸음 0 이 이미 읽을 화면이라 첫 동작 앞에도 머문다.
    if (!(await pause())) return;
    if (n > limit) throw new Error('shift-or-reduce: 동작이 끝나지 않는다');
    const tok = input[pos];
    if (!tok) throw new Error(`shift-or-reduce: 입력 자리 ${pos} 가 없다`);
    const la = terminalOf(tok);
    const top = states[states.length - 1];
    if (top === undefined) throw new Error('shift-or-reduce: 상태 스택이 비었다');
    const row = table.action[top];
    if (!row) throw new Error(`shift-or-reduce: 상태 ${top} 의 동작 줄이 없다`);
    const act = row.get(la);
    if (!act) throw new Error(`shift-or-reduce: 표에 칸이 없다 — 다음 ${la}`);

    if (act.act === 'shift') {
      const matches = bodiesOnTop(data.rules, syms);
      states.push(act.to);
      syms.push(la);
      pos += 1;
      await ctx.emit({ type: 'shift', payload: { sym: la, text: tok.text, la, matches } });
    } else if (act.act === 'reduce') {
      const rule = data.rules[act.rule];
      if (!rule) throw new Error(`shift-or-reduce: 규칙 자리 ${act.rule} 가 없다`);
      const size = rule.rhs.length;
      if (syms.length < size) throw new Error(`shift-or-reduce: ${rule.id} 를 접을 칸이 모자란다`);
      states.splice(states.length - size, size);
      syms.splice(syms.length - size, size);
      const under = states[states.length - 1];
      if (under === undefined) throw new Error('shift-or-reduce: 접은 뒤 상태 스택이 비었다');
      const to = table.goto[under]?.get(rule.lhs);
      if (to === undefined) throw new Error(`shift-or-reduce: goto 칸이 없다 — ${rule.lhs}`);
      states.push(to);
      syms.push(rule.lhs);
      await ctx.emit({ type: 'reduce', payload: { rule: rule.id, lhs: rule.lhs, size, la } });
    } else {
      const start = syms[0];
      if (syms.length !== 1 || start === undefined) throw new Error('shift-or-reduce: 받음인데 스택이 한 칸이 아니다');
      await ctx.emit({ type: 'accept', payload: { la, start } });
      return;
    }
  }
}
