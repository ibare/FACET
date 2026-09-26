/**
 * recursive-descent — 재귀 하강 파서의 부름 깊이와 왼쪽 재귀.
 *
 * 규칙마다 함수 하나(`parseStmt` · `parseExpr` · `parseAtom`)를 irs.ts 의 IR 과 **같은 모양으로** TS 로 돌리며,
 * 부름 · 먹기 · 돌아옴 · 거절 갈고리로 걸음을 모은다. 셈은 한 벌이다 — 걸음을 위해 다른 셈을 짜지 않는다.
 * 다 돈 뒤 걸음에서 센 calls · max-depth · eaten 이 파서의 stats 와 다르면 던진다.
 *
 * 규약
 *   - 다음 토큰은 **들여다보기만** 한다 (먹지 않는다). parseAtom 은 `(` · NAME · NUM 을 들여다봐 갈래를 고른다
 *   - 왼쪽 재귀 문법의 parseExpr 는 R2 `Expr → Expr + Atom` 을 그대로 옮긴 함수 — 첫 일이 parseExpr 부름.
 *     R2 · R3 은 FIRST 가 같아 들여다봄으로 가를 수 없어, 적힌 첫 갈래 R2 로 썼다
 *   - 부름 한계 `limit` — parseExpr 가 `depth > limit` 이면 부름을 받지 않고 −1. 거절된 부름은 calls 에 세지 않는다.
 *     되대 보기는 없다 (한계에 닿으면 파서가 멈춘다)
 *   - 깊이 = 지금 열린 함수 수 (Stmt = 1). 토큰 자리는 0 부터, 끝 EOF 는 알고리즘이 붙인다
 *   - 단말 번호: show 0 · NAME 1 · NUM 2 · + 3 · ( 4 · ) 5 · EOF 6
 *   - 동률은 없다 — 갈래는 들여다본 토큰 하나로 정해진다
 *
 * 걸음 — **부름 하나 = 한 걸음.** 한 걸음은 앞 부름 뒤의 먹기 · 돌아옴을 품고 이 부름으로 끝난다.
 *   판 걸음 = calls + 2 (#0 시작 · 부름마다 · 끝). 끝 걸음 = 마지막 부름 뒤의 먹기 · 돌아옴 · EOF 확인,
 *   또는 한계에서 −1 이 바깥까지 돌아 나옴.
 *
 * 이벤트
 *   - `parse-round` (silent 아님) — 판 머리. payload
 *       { source: string, tokens: { kind: string; text: string }[] (끝 EOF 포함), rules: string[] (지금 문법, 적힌 차례),
 *         limit: number, nesting: number, grammar: number }
 *   - `parse-step` (silent 아님) — 걸음 하나. payload
 *       { step: number (0 부터), stack: Frame[] (걸음 끝에 열린 함수, 얕은 것부터), returned: Frame[] (이 걸음에 돌아온 함수, 돌아온 차례),
 *         ate: number[] (이 걸음에 먹힌 토큰 자리), pos: number (읽는 자리), returns: number (이 걸음의 돌아옴 수),
 *         returnedDeepest: number (이 걸음에 돌아온 함수의 가장 깊은 깊이, 없으면 0),
 *         calls: number, maxDepth: number, eaten: number (이 걸음까지 누적), activeRules: number[] (부른 함수의 규칙 색인),
 *         called: Frame | null (이 걸음의 부름), outcome: 'running' | 'accepted' | 'limit', result: number | null (파서의 돌려줌),
 *         refusedDepth: number | null (거절된 부름의 깊이) }
 *       Frame = { id: number (부름 차례 1 부터), rule: 'Stmt' | 'Expr' | 'Atom', name: string, depth: number, eaten: number[] }
 *   - `phase` (silent: true) — { phase }
 *
 * phase 어휘 (irs.ts 와 같다): `stmt` · `expr` · `atom` · `limit` · `done`
 *   #0 없음 (projector 가 판 머리에서 highlightPhase(null)) · 부름 걸음 = 불린 함수의 phase · 끝 걸음 = `done` 또는 `limit`
 *
 * 계기: `calls` · `max-depth` · `eaten` — 판 머리에 0, 걸음마다 그 걸음까지의 누적 (지금 값을 들고 차이만 보낸다)
 *
 * 손잡이 (reactive): `nesting` (괄호 겹, 사다리 `nestingLadder`) · `grammar` (0 왼쪽 재귀 없음 · 1 왼쪽 재귀, 사다리 `grammarLadder`)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

// ─── 자료 ──────────────────────────────────────────────────────────────────

export type RecursiveDescentRule = { lhs: string; rhs: string };

export type RecursiveDescentData = {
  type: 'recursive-descent';
  stepMs: number;
  /** 부름 한계 — 파서가 스스로 둔 지킴 값 */
  limit: number;
  /** 원시 넷, 사다리 차례 (괄호 겹 0 · 1 · 2 · 3) */
  sources: string[];
  /** 문법 둘 — 0 왼쪽 재귀 없음 · 1 왼쪽 재귀. 규칙은 적힌 차례 (R1 …) */
  grammars: RecursiveDescentRule[][];
  nestingLadder: number[];
  grammarLadder: number[];
  start: { nesting: number; grammar: number };
};

export type RuleName = 'Stmt' | 'Expr' | 'Atom';

export type Token = { kind: string; text: string };

export type Frame = { id: number; rule: RuleName; name: string; depth: number; eaten: number[] };

export type Outcome = 'running' | 'accepted' | 'limit';

export type RoundPayload = {
  source: string;
  tokens: Token[];
  rules: string[];
  limit: number;
  nesting: number;
  grammar: number;
};

export type StepPayload = {
  step: number;
  stack: Frame[];
  returned: Frame[];
  ate: number[];
  pos: number;
  returns: number;
  /** 이 걸음에 돌아온 함수 가운데 가장 깊은 깊이 (없으면 0) — −1 · 돌려줌 표가 오르기 시작하는 자리 */
  returnedDeepest: number;
  calls: number;
  maxDepth: number;
  eaten: number;
  activeRules: number[];
  called: Frame | null;
  outcome: Outcome;
  result: number | null;
  refusedDepth: number | null;
};

// ─── 토큰 ──────────────────────────────────────────────────────────────────

/** 단말 번호 — IR 이 보는 수. show 0 · NAME 1 · NUM 2 · + 3 · ( 4 · ) 5 · EOF 6 */
export const EOF_KIND = 6;

export function tokenize(source: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    if (c === ' ') {
      i += 1;
    } else if (/[a-z]/.test(c)) {
      let j = i;
      while (j < source.length && /[a-z0-9]/.test(source[j]!)) j += 1;
      const word = source.slice(i, j);
      out.push({ kind: word === 'show' ? 'SHOW' : 'NAME', text: word });
      i = j;
    } else if (/[0-9]/.test(c)) {
      let j = i;
      while (j < source.length && /[0-9]/.test(source[j]!)) j += 1;
      out.push({ kind: 'NUM', text: source.slice(i, j) });
      i = j;
    } else if ('+-*='.includes(c)) {
      out.push({ kind: 'OP', text: c });
      i += 1;
    } else if ('(),'.includes(c)) {
      out.push({ kind: 'PUNCT', text: c });
      i += 1;
    } else {
      throw new Error(`토큰으로 읽을 수 없는 글자: "${c}" (${source})`);
    }
  }
  const joined = out.map((tk) => tk.text).join('');
  if (joined !== source.replace(/ /g, '')) throw new Error(`토큰 원문을 이은 글이 원시와 다르다: ${joined}`);
  out.push({ kind: 'EOF', text: '' });
  return out;
}

/** 토큰 → 단말 번호. 이 문법이 모르는 토큰이면 던진다 */
export function terminalOf(tk: Token): number {
  if (tk.kind === 'SHOW') return 0;
  if (tk.kind === 'NAME') return 1;
  if (tk.kind === 'NUM') return 2;
  if (tk.kind === 'EOF') return EOF_KIND;
  if (tk.text === '+') return 3;
  if (tk.text === '(') return 4;
  if (tk.text === ')') return 5;
  throw new Error(`이 문법이 보지 않는 토큰: ${tk.kind} ${tk.text}`);
}

// ─── 파서 (irs.ts 의 IR 과 같은 모양) ─────────────────────────────────────

/** 파서의 갈고리 — 걸음을 모으는 자리. 셈에는 끼지 않는다 */
export type ParseHooks = {
  call(rule: RuleName, depth: number): void;
  eat(pos: number): void;
  ret(): void;
  refuse(depth: number): void;
};

const NO_HOOKS: ParseHooks = { call() {}, eat() {}, ret() {}, refuse() {} };

/** stats[0] calls · [1] max-depth · [2] eaten. 돌려줌 = 다 먹은 자리(= 토큰 수) 또는 −1 */
export function parseProgram(kind: number[], leftRec: number, limit: number, stats: number[], hooks: ParseHooks = NO_HOOKS): number {
  stats[0] = 0;
  stats[1] = 0;
  stats[2] = 0;
  const p = parseStmt(kind, 0, leftRec, limit, stats, hooks);
  if (p < 0) return -1;
  if (kind[p] !== EOF_KIND) return -1;
  return p;
}

function parseStmt(kind: number[], pos: number, leftRec: number, limit: number, stats: number[], hooks: ParseHooks): number {
  stats[0]! += 1;
  hooks.call('Stmt', 1);
  stats[1] = Math.max(stats[1]!, 1);
  if (kind[pos] !== 0) {
    hooks.ret();
    return -1;
  }
  stats[2]! += 1;
  hooks.eat(pos);
  const r = parseExpr(kind, pos + 1, 2, leftRec, limit, stats, hooks);
  hooks.ret();
  return r;
}

function parseExpr(kind: number[], pos: number, depth: number, leftRec: number, limit: number, stats: number[], hooks: ParseHooks): number {
  if (depth > limit) {
    hooks.refuse(depth);
    return -1;
  }
  stats[0]! += 1;
  hooks.call('Expr', depth);
  stats[1] = Math.max(stats[1]!, depth);
  let p: number;
  if (leftRec === 1) p = parseExpr(kind, pos, depth + 1, leftRec, limit, stats, hooks);
  else p = parseAtom(kind, pos, depth + 1, leftRec, limit, stats, hooks);
  if (p < 0) {
    hooks.ret();
    return -1;
  }
  if (kind[p] !== 3) {
    hooks.ret();
    return -1;
  }
  stats[2]! += 1;
  hooks.eat(p);
  const r = parseAtom(kind, p + 1, depth + 1, leftRec, limit, stats, hooks);
  hooks.ret();
  return r;
}

function parseAtom(kind: number[], pos: number, depth: number, leftRec: number, limit: number, stats: number[], hooks: ParseHooks): number {
  stats[0]! += 1;
  hooks.call('Atom', depth);
  stats[1] = Math.max(stats[1]!, depth);
  if (kind[pos] === 4) {
    stats[2]! += 1;
    hooks.eat(pos);
    const p = parseExpr(kind, pos + 1, depth + 1, leftRec, limit, stats, hooks);
    if (p < 0) {
      hooks.ret();
      return -1;
    }
    if (kind[p] !== 5) {
      hooks.ret();
      return -1;
    }
    stats[2]! += 1;
    hooks.eat(p);
    hooks.ret();
    return p + 1;
  }
  if (kind[pos] === 1 || kind[pos] === 2) {
    stats[2]! += 1;
    hooks.eat(pos);
    hooks.ret();
    return pos + 1;
  }
  hooks.ret();
  return -1;
}

// ─── 걸음 모으기 ──────────────────────────────────────────────────────────

type Mark =
  | { kind: 'call'; rule: RuleName; depth: number }
  | { kind: 'eat'; pos: number }
  | { kind: 'ret' }
  | { kind: 'refuse'; depth: number };

export type Round = {
  round: RoundPayload;
  steps: StepPayload[];
  result: number;
  stats: number[];
};

const deepestOf = (fs: Frame[]): number => fs.reduce((m, f) => Math.max(m, f.depth), 0);

const FN_NAME: Record<RuleName, string> = { Stmt: 'parseStmt', Expr: 'parseExpr', Atom: 'parseAtom' };

/** 한 판 — 파서를 한 번 돌려 갈고리 자국을 부름 단위의 걸음으로 묶는다 */
export function buildRound(data: RecursiveDescentData, nesting: number, grammar: number): Round {
  const source = data.sources[nesting];
  if (source === undefined) throw new Error(`괄호 겹 ${nesting} 의 원시가 없다`);
  const rules = data.grammars[grammar];
  if (rules === undefined) throw new Error(`문법 ${grammar} 이 없다`);
  const tokens = tokenize(source);
  const kind = tokens.map(terminalOf);
  const marks: Mark[] = [];
  const hooks: ParseHooks = {
    call: (rule, depth) => marks.push({ kind: 'call', rule, depth }),
    eat: (pos) => marks.push({ kind: 'eat', pos }),
    ret: () => marks.push({ kind: 'ret' }),
    refuse: (depth) => marks.push({ kind: 'refuse', depth }),
  };
  const stats = [0, 0, 0];
  const result = parseProgram(kind, grammar, data.limit, stats, hooks);

  const steps: StepPayload[] = [];
  const stack: Frame[] = [];
  let calls = 0;
  let maxDepth = 0;
  let eaten = 0;
  let pos = 0;
  let nextId = 1;
  let ate: number[] = [];
  let returned: Frame[] = [];
  let refusedDepth: number | null = null;
  const snapshot = (): Frame[] => stack.map((f) => ({ ...f, eaten: [...f.eaten] }));
  steps.push({
    step: 0, stack: [], returned: [], ate: [], pos: 0, returns: 0, returnedDeepest: 0, calls: 0, maxDepth: 0, eaten: 0,
    activeRules: [], called: null, outcome: 'running', result: null, refusedDepth: null,
  });
  for (const m of marks) {
    if (m.kind === 'eat') {
      const top = stack[stack.length - 1];
      if (!top) throw new Error('열린 함수 없이 토큰을 먹었다');
      if (m.pos !== pos) throw new Error(`읽는 자리 ${pos} 가 아닌 ${m.pos} 를 먹었다`);
      top.eaten.push(m.pos);
      ate.push(m.pos);
      eaten += 1;
      pos += 1;
    } else if (m.kind === 'ret') {
      const top = stack.pop();
      if (!top) throw new Error('열린 함수 없이 돌아왔다');
      returned.push({ ...top, eaten: [...top.eaten] });
    } else if (m.kind === 'refuse') {
      refusedDepth = m.depth;
    } else {
      if (m.depth !== stack.length + 1) throw new Error(`깊이 ${m.depth} 가 열린 함수 수와 맞지 않는다`);
      const frame: Frame = { id: nextId, rule: m.rule, name: FN_NAME[m.rule], depth: m.depth, eaten: [] };
      nextId += 1;
      stack.push(frame);
      calls += 1;
      maxDepth = Math.max(maxDepth, m.depth);
      const activeRules: number[] = [];
      rules.forEach((r, i) => {
        if (r.lhs === m.rule) activeRules.push(i);
      });
      steps.push({
        step: steps.length, stack: snapshot(), returned, ate, pos, returns: returned.length, returnedDeepest: deepestOf(returned), calls, maxDepth, eaten,
        activeRules, called: { ...frame, eaten: [] }, outcome: 'running', result: null, refusedDepth: null,
      });
      ate = [];
      returned = [];
    }
  }
  if (stack.length !== 0) throw new Error('판이 끝났는데 열린 함수가 남았다');
  let outcome: Outcome;
  if (result >= 0) outcome = 'accepted';
  else if (refusedDepth !== null) outcome = 'limit';
  else throw new Error(`한계 밖의 까닭으로 −1 — 이 데이터에 없는 판이다 (${source})`);
  steps.push({
    step: steps.length, stack: [], returned, ate, pos, returns: returned.length, returnedDeepest: deepestOf(returned), calls, maxDepth, eaten,
    activeRules: [], called: null, outcome, result, refusedDepth,
  });
  if (calls !== stats[0] || maxDepth !== stats[1] || eaten !== stats[2]) {
    throw new Error(`걸음에서 센 수와 파서의 stats 가 다르다: ${calls}/${maxDepth}/${eaten} 대 ${stats.join('/')}`);
  }
  return {
    round: {
      source,
      tokens,
      rules: rules.map((r) => `${r.lhs} → ${r.rhs}`),
      limit: data.limit,
      nesting,
      grammar,
    },
    steps,
    result,
    stats,
  };
}

// ─── payload 좁히개 (projector · stage 가 가져간다) ──────────────────────

function obj(x: unknown, what: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null) throw new Error(`${what} 가 객체가 아니다`);
  return x as Record<string, unknown>;
}
function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number') throw new Error(`${k} 가 수가 아니다`);
  return v;
}
function numOrNull(o: Record<string, unknown>, k: string): number | null {
  const v = o[k];
  if (v === null) return null;
  if (typeof v !== 'number') throw new Error(`${k} 가 수도 null 도 아니다`);
  return v;
}
function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`${k} 가 글자가 아니다`);
  return v;
}
function nums(o: Record<string, unknown>, k: string): number[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`${k} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number') throw new Error(`${k} 에 수가 아닌 칸`);
    return x;
  });
}
function readFrame(x: unknown): Frame {
  const o = obj(x, 'frame');
  const rule = o.rule;
  if (rule !== 'Stmt' && rule !== 'Expr' && rule !== 'Atom') throw new Error(`모르는 규칙 함수: ${String(rule)}`);
  return { id: num(o, 'id'), rule, name: str(o, 'name'), depth: num(o, 'depth'), eaten: nums(o, 'eaten') };
}
function frames(o: Record<string, unknown>, k: string): Frame[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`${k} 가 배열이 아니다`);
  return v.map(readFrame);
}

export function readRoundPayload(x: unknown): RoundPayload {
  const o = obj(x, 'parse-round payload');
  const toks = o.tokens;
  if (!Array.isArray(toks)) throw new Error('tokens 가 배열이 아니다');
  const rules = o.rules;
  if (!Array.isArray(rules)) throw new Error('rules 가 배열이 아니다');
  return {
    source: str(o, 'source'),
    tokens: toks.map((tk) => {
      const r = obj(tk, 'token');
      return { kind: str(r, 'kind'), text: str(r, 'text') };
    }),
    rules: rules.map((r) => {
      if (typeof r !== 'string') throw new Error('rules 에 글자가 아닌 칸');
      return r;
    }),
    limit: num(o, 'limit'),
    nesting: num(o, 'nesting'),
    grammar: num(o, 'grammar'),
  };
}

export function readStepPayload(x: unknown): StepPayload {
  const o = obj(x, 'parse-step payload');
  const outcome = o.outcome;
  if (outcome !== 'running' && outcome !== 'accepted' && outcome !== 'limit') throw new Error(`모르는 판정: ${String(outcome)}`);
  return {
    step: num(o, 'step'),
    stack: frames(o, 'stack'),
    returned: frames(o, 'returned'),
    ate: nums(o, 'ate'),
    pos: num(o, 'pos'),
    returns: num(o, 'returns'),
    returnedDeepest: num(o, 'returnedDeepest'),
    calls: num(o, 'calls'),
    maxDepth: num(o, 'maxDepth'),
    eaten: num(o, 'eaten'),
    activeRules: nums(o, 'activeRules'),
    called: o.called === null ? null : readFrame(o.called),
    outcome,
    result: numOrNull(o, 'result'),
    refusedDepth: numOrNull(o, 'refusedDepth'),
  };
}

// ─── 알고리즘 ─────────────────────────────────────────────────────────────

function checkData(d: RecursiveDescentData): void {
  if (d.sources.length !== d.nestingLadder.length) throw new Error('원시 수와 괄호 겹 사다리 길이가 다르다');
  if (d.grammars.length !== d.grammarLadder.length) throw new Error('문법 수와 문법 사다리 길이가 다르다');
  d.nestingLadder.forEach((v, i) => {
    if (v !== i) throw new Error('괄호 겹 사다리는 0 부터의 순번이다');
  });
  d.grammarLadder.forEach((v, i) => {
    if (v !== i) throw new Error('문법 사다리는 0 부터의 순번이다');
  });
  if (!d.nestingLadder.includes(d.start.nesting) || !d.grammarLadder.includes(d.start.grammar)) throw new Error('시작 값이 사다리에 없다');
}

export async function recursiveDescentAlgorithm(ctx0: FacetContext<RecursiveDescentData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<RecursiveDescentData>;
  const data = ctx.data;
  checkData(data);
  let nesting = data.start.nesting;
  let grammar = data.start.grammar;

  const phase = (name: string): Promise<void> => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const shown = new Map<string, number>();
  /** 계기 — 지금 보이는 값을 들고 차이만 보낸다 (처음 한 번은 차이 0 이어도) */
  const put = (name: string, value: number): void => {
    ctx.metric(name, value - (shown.get(name) ?? 0));
    shown.set(name, value);
  };

  const play = async (): Promise<boolean> => {
    const r = buildRound(data, nesting, grammar);
    await ctx.emit({ type: 'parse-round', payload: r.round });
    for (const s of r.steps) {
      if (ctx.cancelled) return false;
      await ctx.emit({ type: 'parse-step', payload: s });
      if (s.called !== null) {
        if (s.called.rule === 'Stmt') await phase('stmt');
        else if (s.called.rule === 'Expr') await phase('expr');
        else await phase('atom');
      } else if (s.outcome === 'accepted') {
        await phase('done');
      } else if (s.outcome === 'limit') {
        await phase('limit');
      }
      put('calls', s.calls);
      put('max-depth', s.maxDepth);
      put('eaten', s.eaten);
      if (!(await ctx.sleep(data.stepMs))) return false;
    }
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await play())) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null ? (p as { value?: unknown }).value : undefined;
        if (typeof value !== 'number') continue;
        if (input.type === 'nesting' && data.nestingLadder.includes(value)) {
          nesting = value;
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
