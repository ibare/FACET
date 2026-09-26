/**
 * rule-expands — 가장 왼쪽 비단말을 한 걸음에 하나씩 규칙의 몸으로 펼친다.
 *
 * 문법과 목표 단말 열(토큰 열에서 얻는다)로 가장 왼쪽 유도를 **찾고**, 찾은 유도를
 * 한 걸음에 한 펼침씩 내보낸다. 되돌아간 시도는 내보내지 않는다. 유도가 하나가
 * 아니면 던진다.
 *
 * 걸음 0 은 장면의 `initial()` 이 준다 (문장형 = 시작 기호 하나). 읽을 것이 있는
 * 화면이라 첫 발신 앞에 `stepMs` 를 둔다.
 *
 * 이벤트
 * - `expand` (silent 아님) — 펼침 하나
 *   payload: {
 *     k: number            // 몇 번째 펼침 (1 부터)
 *     pos: number          // 펼친 자리 (문장형 안, 0 부터)
 *     ruleId: string       // 쓴 규칙 (R1 …)
 *     lhs: string          // 펼친 비단말
 *     body: string[]       // 그 자리에 들어선 몸
 *     form: string[]       // 펼친 뒤 문장형
 *     selfAt: number[]     // 몸 안에서 lhs 가 다시 나타난 자리 (펼친 뒤 문장형 기준)
 *     ntLeft: number       // 펼친 뒤 문장형에 남은 비단말 수
 *     nextPos: number      // 다음에 펼칠 자리 (없으면 -1)
 *   }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GrammarRule = { id: string; lhs: string; rhs: string[] };
export type Token = { kind: string; text: string };

export type RuleExpandsFacetData = {
  type: 'rule-expands';
  source: string;
  tokens: Token[];
  rules: GrammarRule[];
  stepMs: number;
};

/** 펼침 하나 — 유도 찾기의 결과 */
export type Expansion = { pos: number; rule: GrammarRule; form: string[] };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function stringArray(x: unknown, where: string): string[] {
  if (!Array.isArray(x)) throw new Error(`${where}: 목록이 아니다`);
  return x.map((s, i) => {
    if (typeof s !== 'string' || s === '') throw new Error(`${where}[${i}]: 빈 글자이거나 글자가 아니다`);
    return s;
  });
}

/** initialData 를 좁힌다. 모양이 틀리면 던진다. 값을 베껴 돌려준다. */
export function narrowRuleExpandsData(x: unknown): RuleExpandsFacetData {
  if (!isRecord(x)) throw new Error('rule-expands: initialData 가 객체가 아니다');
  if (x.type !== 'rule-expands') throw new Error(`rule-expands: type 이 다르다 (${String(x.type)})`);
  if (typeof x.source !== 'string' || x.source === '') throw new Error('rule-expands: source 가 없다');
  if (typeof x.stepMs !== 'number' || !(x.stepMs > 0)) throw new Error('rule-expands: stepMs 가 없다');
  if (!Array.isArray(x.tokens) || x.tokens.length === 0) throw new Error('rule-expands: tokens 가 없다');
  if (!Array.isArray(x.rules) || x.rules.length === 0) throw new Error('rule-expands: rules 가 없다');
  const tokens = x.tokens.map((t, i): Token => {
    if (!isRecord(t) || typeof t.kind !== 'string' || typeof t.text !== 'string' || t.kind === '' || t.text === '') {
      throw new Error(`rule-expands: tokens[${i}] 모양이 틀렸다`);
    }
    return { kind: t.kind, text: t.text };
  });
  const rules = x.rules.map((r, i): GrammarRule => {
    if (!isRecord(r) || typeof r.id !== 'string' || typeof r.lhs !== 'string' || r.lhs === '') {
      throw new Error(`rule-expands: rules[${i}] 모양이 틀렸다`);
    }
    if (r.id !== `R${i + 1}`) throw new Error(`rule-expands: rules[${i}] 의 번호가 적힌 차례와 다르다 (${r.id})`);
    return { id: r.id, lhs: r.lhs, rhs: stringArray(r.rhs, `rules[${i}].rhs`) };
  });
  return { type: 'rule-expands', source: x.source, tokens, rules, stepMs: x.stepMs };
}

/** 토큰 → 문법이 보는 단말. NAME · NUM 은 종류 이름, 그 밖은 원문. */
export function terminalOf(tok: Token): string {
  return tok.kind === 'NAME' || tok.kind === 'NUM' ? tok.kind : tok.text;
}

/** 비단말 = lhs 에 나오는 이름 전부 (처음 나온 차례) */
export function nonterminalsOf(rules: GrammarRule[]): string[] {
  const out: string[] = [];
  for (const r of rules) if (!out.includes(r.lhs)) out.push(r.lhs);
  return out;
}

/** 시작 기호 = 첫 규칙의 왼쪽 */
export function startSymbolOf(rules: GrammarRule[]): string {
  const first = rules[0];
  if (first === undefined) throw new Error('rule-expands: 규칙이 없다');
  return first.lhs;
}

/** 원문에서 빈칸을 뺀 글자와 토큰 원문을 이은 글자가 같은지 본다 */
export function checkSourceMatchesTokens(source: string, tokens: Token[]): void {
  const a = source.replace(/\s+/g, '');
  const b = tokens.map((t) => t.text).join('');
  if (a !== b) throw new Error(`rule-expands: 원문과 토큰이 다르다 (${a} ≠ ${b})`);
}

/**
 * 가장 왼쪽 유도를 전부 찾는다. 갈래는 적힌 차례로 시도하고, 문장형이 목표보다 길어지거나
 * 가장 왼쪽 비단말 앞의 단말이 목표의 앞과, 마지막 비단말 뒤의 단말이 목표의 꼬리와 어긋나면
 * 되돌아간다. ε 규칙이 있으면 문장형이 줄어 이 가지치기가 끝을 보장하지 못하므로 던진다.
 */
export function leftmostDerivations(rules: GrammarRule[], target: string[]): Expansion[][] {
  const nts = new Set(nonterminalsOf(rules));
  for (const r of rules) {
    if (r.rhs.length === 0) throw new Error(`rule-expands: ${r.id} 가 ε 규칙이다 — 이 탐색이 다루지 않는다`);
  }
  const found: Expansion[][] = [];
  const path: Expansion[] = [];
  let visits = 0;
  const LIMIT = 10_000;

  const go = (form: string[]): void => {
    visits += 1;
    if (visits > LIMIT) throw new Error('rule-expands: 유도 탐색 한도를 넘었다');
    if (form.length > target.length) return;
    const idxs: number[] = [];
    form.forEach((s, i) => {
      if (nts.has(s)) idxs.push(i);
    });
    if (idxs.length === 0) {
      if (form.length === target.length && form.every((s, i) => s === target[i])) found.push([...path]);
      return;
    }
    const p = idxs[0]!;
    for (let i = 0; i < p; i += 1) if (form[i] !== target[i]) return;
    const q = idxs[idxs.length - 1]!;
    const tail = form.slice(q + 1);
    const off = target.length - tail.length;
    for (let i = 0; i < tail.length; i += 1) if (tail[i] !== target[off + i]) return;
    for (const rule of rules) {
      if (rule.lhs !== form[p]) continue;
      const next = [...form.slice(0, p), ...rule.rhs, ...form.slice(p + 1)];
      path.push({ pos: p, rule, form: next });
      go(next);
      path.pop();
    }
  };

  go([startSymbolOf(rules)]);
  return found;
}

/** 자료에서 단 하나뿐인 가장 왼쪽 유도를 얻는다 — 원문 · 토큰 · 유도 수를 확인한다 */
export function findTheDerivation(data: RuleExpandsFacetData): Expansion[] {
  checkSourceMatchesTokens(data.source, data.tokens);
  const target = data.tokens.map(terminalOf);
  const all = leftmostDerivations(data.rules, target);
  if (all.length !== 1) throw new Error(`rule-expands: 가장 왼쪽 유도가 하나가 아니다 (${all.length})`);
  return all[0]!;
}

export async function ruleExpands(context: FacetContext<RuleExpandsFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<RuleExpandsFacetData>;
  const data = narrowRuleExpandsData(ctx.data);
  const nts = new Set(nonterminalsOf(data.rules));
  const derivation = findTheDerivation(data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (let k = 0; k < derivation.length; k += 1) {
    // 걸음 0 도 읽을 것이 있는 화면이라 첫 펼침 앞에서도 머문다
    if (!(await pause())) return;
    const step = derivation[k]!;
    const selfAt: number[] = [];
    step.rule.rhs.forEach((s, j) => {
      if (s === step.rule.lhs) selfAt.push(step.pos + j);
    });
    const ntIdx: number[] = [];
    step.form.forEach((s, i) => {
      if (nts.has(s)) ntIdx.push(i);
    });
    await ctx.emit({
      type: 'expand',
      payload: {
        k: k + 1,
        pos: step.pos,
        ruleId: step.rule.id,
        lhs: step.rule.lhs,
        body: [...step.rule.rhs],
        form: [...step.form],
        selfAt,
        ntLeft: ntIdx.length,
        nextPos: ntIdx.length > 0 ? ntIdx[0]! : -1,
      },
    });
  }
}
