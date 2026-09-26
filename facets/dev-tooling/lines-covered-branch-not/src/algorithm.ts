/**
 * lines-covered-branch-not — 줄을 다 밟은 시험이 갈래 하나를 빠뜨린다.
 *
 * 화면 코드(`initialData.code`)를 작은 해석기로 실제로 돌린다. 시험 글자
 * (`initialData.test`)를 읽어 함수를 부르고, 문 하나를 밟을 때마다 한 걸음을 낸다.
 * `if` 줄을 밟은 걸음에는 그 줄이 고른 갈래(`true` · `false`)를 함께 싣는다.
 * 밟은 줄 · 탄 갈래 · 백분율 · 돌려준 값 · 안 간 갈래는 모두 여기서 셈한다.
 *
 * 줄 번호는 화면 코드의 맨 윗줄을 1 로 센다. `function` 정의 줄은 세지 않고,
 * 그 아래의 문 줄은 모두 센다.
 *
 * 이벤트 (모두 silent 아님):
 *   line — 실행이 줄 하나를 밟는다
 *     payload: { line: number; from: number; branch: 'true' | 'false' | null }
 *       from   — 건너온 줄. 첫 문은 function 줄에서 들어온다
 *       branch — 이 줄이 if 이면 고른 갈래, 아니면 null
 *   end — 시험이 끝나고 두 계기를 백분율로 셈한다
 *     payload: {
 *       lines: number; linesOf: number; linesPct: number;
 *       branches: number; branchesOf: number; branchesPct: number;
 *       returned: string;
 *       missing: { line: number; branch: 'true' | 'false'; to: number }[];
 *     }
 *       백분율은 표시용 — 소수 없이 0.5 올림으로 반올림한다
 *       missing 은 한 번도 타지 않은 갈래와 그 갈래가 가는 줄
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LinesCoveredBranchNotFacetData = {
  type: 'lines-covered-branch-not';
  stepMs: number;
  /** 화면 코드. 번역하지 않는 자료. 맨 윗줄이 function 정의 줄 */
  code: string[];
  /** 시험 글자 — 함수 부르기 하나 */
  test: string;
};

export type BranchId = 'true' | 'false';

// ---------------------------------------------------------------------------
// 식
// ---------------------------------------------------------------------------

type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'name'; name: string }
  | { kind: 'bin'; op: '+' | '-'; left: Expr; right: Expr };

type Value = number | boolean;

function tokenize(src: string, line: number): string[] {
  const out: string[] = [];
  const re = /\s*(\d+|[A-Za-z_]\w*|[-+(),])/y;
  let at = 0;
  while (at < src.length) {
    if (src.slice(at).trim() === '') break;
    re.lastIndex = at;
    const m = re.exec(src);
    if (!m || m[1] === undefined) {
      throw new Error(`줄 ${line}: 읽을 수 없는 글자 — "${src.slice(at)}"`);
    }
    out.push(m[1]);
    at = re.lastIndex;
  }
  return out;
}

function parseExprTokens(tokens: string[], pos: { i: number }, line: number): Expr {
  function atom(): Expr {
    const tok = tokens[pos.i];
    if (tok === undefined) throw new Error(`줄 ${line}: 식이 끝에서 끊겼다`);
    pos.i += 1;
    if (/^\d+$/.test(tok)) return { kind: 'num', value: Number(tok) };
    if (tok === 'true') return { kind: 'bool', value: true };
    if (tok === 'false') return { kind: 'bool', value: false };
    if (/^[A-Za-z_]\w*$/.test(tok)) return { kind: 'name', name: tok };
    throw new Error(`줄 ${line}: 모르는 식 모양 — "${tok}"`);
  }
  let left = atom();
  for (;;) {
    const op = tokens[pos.i];
    if (op !== '+' && op !== '-') return left;
    pos.i += 1;
    left = { kind: 'bin', op, left, right: atom() };
  }
}

function parseExpr(src: string, line: number): Expr {
  const tokens = tokenize(src, line);
  const pos = { i: 0 };
  const expr = parseExprTokens(tokens, pos, line);
  if (pos.i !== tokens.length) {
    throw new Error(`줄 ${line}: 식 뒤에 남은 글자 — "${tokens.slice(pos.i).join(' ')}"`);
  }
  return expr;
}

function evaluate(expr: Expr, env: Map<string, Value>, line: number): Value {
  switch (expr.kind) {
    case 'num':
    case 'bool':
      return expr.value;
    case 'name': {
      const v = env.get(expr.name);
      if (v === undefined) throw new Error(`줄 ${line}: 없는 이름 — ${expr.name}`);
      return v;
    }
    case 'bin': {
      const a = evaluate(expr.left, env, line);
      const b = evaluate(expr.right, env, line);
      if (typeof a !== 'number' || typeof b !== 'number') {
        throw new Error(`줄 ${line}: 수가 아닌 값에 ${expr.op} 를 썼다`);
      }
      return expr.op === '+' ? a + b : a - b;
    }
  }
}

function showValue(v: Value): string {
  return typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
}

// ---------------------------------------------------------------------------
// 문
// ---------------------------------------------------------------------------

type Stmt =
  | { kind: 'let'; line: number; name: string; expr: Expr }
  | { kind: 'set'; line: number; name: string; expr: Expr }
  | { kind: 'return'; line: number; expr: Expr }
  | { kind: 'if'; line: number; cond: Expr; body: Stmt[] };

export type Program = {
  name: string;
  params: string[];
  /** function 줄의 번호 — 실행이 여기서 들어온다 */
  headerLine: number;
  body: Stmt[];
  /** 세는 줄 — 문 줄 전부, 차례대로 */
  counted: number[];
  /** 줄에서 줄로 건너갈 수 있는 길 전부 */
  flow: FlowEdge[];
};

export type FlowEdge = {
  from: number;
  to: number;
  /** 갈래 길이면 그 갈래, 아니면 null */
  branch: BranchId | null;
};

const INDENT = 4;

function indentOf(text: string, line: number): number {
  const m = /^ */.exec(text);
  const n = m ? m[0].length : 0;
  if (n % INDENT !== 0) throw new Error(`줄 ${line}: 들여쓰기가 넷의 배수가 아니다`);
  return n / INDENT;
}

function parseStmt(text: string, line: number): Stmt {
  const s = text.trim();
  let m = /^let ([A-Za-z_]\w*) = (.+)$/.exec(s);
  if (m && m[1] !== undefined && m[2] !== undefined) {
    return { kind: 'let', line, name: m[1], expr: parseExpr(m[2], line) };
  }
  m = /^if (.+)$/.exec(s);
  if (m && m[1] !== undefined) return { kind: 'if', line, cond: parseExpr(m[1], line), body: [] };
  m = /^return (.+)$/.exec(s);
  if (m && m[1] !== undefined) return { kind: 'return', line, expr: parseExpr(m[1], line) };
  m = /^([A-Za-z_]\w*) = (.+)$/.exec(s);
  if (m && m[1] !== undefined && m[2] !== undefined) {
    return { kind: 'set', line, name: m[1], expr: parseExpr(m[2], line) };
  }
  throw new Error(`줄 ${line}: 모르는 문 모양 — "${s}"`);
}

/** 화면 코드를 읽어 문 나무 · 세는 줄 · 길을 셈한다. 장면과 그림도 이것을 부른다. */
export function parseProgram(code: readonly string[]): Program {
  const head = code[0];
  if (head === undefined) throw new Error('코드가 비었다');
  const hm = /^function ([A-Za-z_]\w*)\(([^)]*)\)$/.exec(head);
  if (!hm || hm[1] === undefined || hm[2] === undefined) {
    throw new Error(`줄 1: function 정의 줄이 아니다 — "${head}"`);
  }
  const params = hm[2].split(',').map((p) => p.trim()).filter((p) => p !== '');

  const body: Stmt[] = [];
  // 들여쓰기 깊이마다 문을 받아 줄 몸
  const stack: { depth: number; into: Stmt[] }[] = [{ depth: 1, into: body }];
  let last: Stmt | null = null;
  for (let i = 1; i < code.length; i += 1) {
    const line = i + 1;
    const text = code[i];
    if (text === undefined || text.trim() === '') throw new Error(`줄 ${line}: 빈 줄`);
    const depth = indentOf(text, line);
    let top = stack[stack.length - 1];
    if (top === undefined) throw new Error(`줄 ${line}: 몸을 잃었다`);
    if (depth > top.depth) {
      if (last === null || last.kind !== 'if' || depth !== top.depth + 1) {
        throw new Error(`줄 ${line}: 들여쓰기가 앞 줄과 맞지 않는다`);
      }
      stack.push({ depth, into: last.body });
    } else {
      while (top !== undefined && depth < top.depth) {
        stack.pop();
        top = stack[stack.length - 1];
      }
      if (top === undefined || depth !== top.depth) {
        throw new Error(`줄 ${line}: 들여쓰기가 어느 몸에도 맞지 않는다`);
      }
    }
    const into = stack[stack.length - 1];
    if (into === undefined) throw new Error(`줄 ${line}: 몸을 잃었다`);
    const stmt = parseStmt(text, line);
    into.into.push(stmt);
    last = stmt;
  }
  for (const s of allStmts(body)) {
    if (s.kind === 'if' && s.body.length === 0) throw new Error(`줄 ${s.line}: if 의 몸이 비었다`);
  }
  const first = body[0];
  if (first === undefined) throw new Error('함수 몸이 비었다');

  const counted = allStmts(body).map((s) => s.line).sort((a, b) => a - b);
  const flow: FlowEdge[] = [{ from: 1, to: first.line, branch: null }];
  collectFlow(body, null, flow);
  return { name: hm[1], params, headerLine: 1, body, counted, flow };
}

function allStmts(block: Stmt[]): Stmt[] {
  const out: Stmt[] = [];
  for (const s of block) {
    out.push(s);
    if (s.kind === 'if') out.push(...allStmts(s.body));
  }
  return out;
}

/** block 을 다 지난 뒤 실행이 가는 줄은 after (없으면 함수 끝) */
function collectFlow(block: Stmt[], after: number | null, out: FlowEdge[]): void {
  block.forEach((s, i) => {
    const nextStmt = block[i + 1];
    const next = nextStmt !== undefined ? nextStmt.line : after;
    if (s.kind === 'return') return;
    if (s.kind === 'if') {
      const inner = s.body[0];
      if (inner === undefined) throw new Error(`줄 ${s.line}: if 의 몸이 비었다`);
      if (next === null) throw new Error(`줄 ${s.line}: 거짓 쪽이 갈 줄이 없다`);
      out.push({ from: s.line, to: inner.line, branch: 'true' });
      out.push({ from: s.line, to: next, branch: 'false' });
      collectFlow(s.body, next, out);
      return;
    }
    if (next === null) throw new Error(`줄 ${s.line}: return 없이 함수 끝에 닿는다`);
    out.push({ from: s.line, to: next, branch: null });
  });
}

// ---------------------------------------------------------------------------
// 시험 돌리기
// ---------------------------------------------------------------------------

export type TraceStep = { line: number; from: number; branch: BranchId | null };

export type TestRun = { trace: TraceStep[]; returned: string };

/** 시험 글자(`price(50, true)`)를 읽어 함수를 실제로 돌린다 */
export function runTest(program: Program, test: string): TestRun {
  const cm = /^([A-Za-z_]\w*)\((.*)\)$/.exec(test.trim());
  if (!cm || cm[1] === undefined || cm[2] === undefined) {
    throw new Error(`시험 글자가 함수 부르기가 아니다 — "${test}"`);
  }
  if (cm[1] !== program.name) throw new Error(`시험이 부르는 함수 ${cm[1]} 가 코드에 없다`);
  const argSrc = cm[2].trim() === '' ? [] : cm[2].split(',');
  if (argSrc.length !== program.params.length) {
    throw new Error(`시험의 인자 수 ${argSrc.length} 가 함수의 ${program.params.length} 와 다르다`);
  }
  const env = new Map<string, Value>();
  program.params.forEach((p, i) => {
    const src = argSrc[i];
    if (src === undefined) throw new Error(`시험의 인자 ${i} 가 없다`);
    env.set(p, evaluate(parseExpr(src, 0), new Map(), 0));
  });

  const trace: TraceStep[] = [];
  let from = program.headerLine;
  let returned: Value | null = null;

  function exec(block: Stmt[]): boolean {
    for (const s of block) {
      if (s.kind === 'if') {
        const c = evaluate(s.cond, env, s.line);
        if (typeof c !== 'boolean') throw new Error(`줄 ${s.line}: 조건이 참 · 거짓이 아니다`);
        trace.push({ line: s.line, from, branch: c ? 'true' : 'false' });
        from = s.line;
        if (c && exec(s.body)) return true;
        continue;
      }
      trace.push({ line: s.line, from, branch: null });
      from = s.line;
      if (s.kind === 'let') {
        if (env.has(s.name)) throw new Error(`줄 ${s.line}: ${s.name} 를 두 번 선언했다`);
        env.set(s.name, evaluate(s.expr, env, s.line));
      } else if (s.kind === 'set') {
        if (!env.has(s.name)) throw new Error(`줄 ${s.line}: 선언 없는 이름 — ${s.name}`);
        env.set(s.name, evaluate(s.expr, env, s.line));
      } else {
        returned = evaluate(s.expr, env, s.line);
        return true;
      }
    }
    return false;
  }

  if (!exec(program.body)) throw new Error('함수가 return 에 닿지 않았다');
  if (returned === null) throw new Error('돌려준 값이 없다');
  return { trace, returned: showValue(returned) };
}

/** 두 계기의 셈 — 알고리즘과 그림이 같은 함수로 센다. 겹쳐 밟은 줄 · 겹쳐 탄 갈래는 한 번 */
export function countStepped(program: Program, stepped: readonly number[]): number {
  return program.counted.filter((l) => stepped.includes(l)).length;
}

export type TakenBranch = { line: number; branch: BranchId };

function isTaken(e: FlowEdge, taken: readonly TakenBranch[]): boolean {
  return e.branch !== null && taken.some((k) => k.line === e.from && k.branch === e.branch);
}

export function countTaken(program: Program, taken: readonly TakenBranch[]): number {
  return program.flow.filter((e) => isTaken(e, taken)).length;
}

/** 표시용 백분율 — 소수 없이, 0.5 는 올린다. 셈은 정수로 끝까지 */
export function percent(num: number, den: number): number {
  if (den <= 0) throw new Error('분모가 0 이다');
  return Math.floor((200 * num + den) / (2 * den));
}

// ---------------------------------------------------------------------------
// 알고리즘
// ---------------------------------------------------------------------------

function narrow(raw: unknown): LinesCoveredBranchNotFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('initialData 가 없다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'lines-covered-branch-not') throw new Error('initialData.type 이 다르다');
  if (typeof d.stepMs !== 'number') throw new Error('initialData.stepMs 가 수가 아니다');
  if (!Array.isArray(d.code) || !d.code.every((l): l is string => typeof l === 'string')) {
    throw new Error('initialData.code 가 글자 목록이 아니다');
  }
  if (typeof d.test !== 'string') throw new Error('initialData.test 가 글자가 아니다');
  return { type: 'lines-covered-branch-not', stepMs: d.stepMs, code: [...d.code], test: d.test };
}

export async function linesCoveredBranchNot(
  baseCtx: FacetContext<LinesCoveredBranchNotFacetData>,
): Promise<void> {
  const ctx = baseCtx as ReactiveContext<LinesCoveredBranchNotFacetData>;
  const data = narrow(ctx.data);
  const program = parseProgram(data.code);
  const run = runTest(program, data.test);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(data.stepMs)) && !ctx.cancelled;
  }

  const stepped: number[] = [];
  const taken: TakenBranch[] = [];

  // 걸음 0 은 코드와 시험이 이미 보이는 화면이라 읽을 틈을 먼저 준다
  for (const step of run.trace) {
    if (!(await pause())) return;
    stepped.push(step.line);
    if (step.branch !== null) taken.push({ line: step.line, branch: step.branch });
    await ctx.emit({
      type: 'line',
      payload: { line: step.line, from: step.from, branch: step.branch },
    });
  }

  if (!(await pause())) return;
  const branchEdges = program.flow.filter((e) => e.branch !== null);
  const missing = branchEdges
    .filter((e) => !isTaken(e, taken))
    .map((e) => ({ line: e.from, branch: e.branch, to: e.to }));
  const lines = countStepped(program, stepped);
  const linesOf = program.counted.length;
  const branches = countTaken(program, taken);
  const branchesOf = branchEdges.length;
  await ctx.emit({
    type: 'end',
    payload: {
      lines,
      linesOf,
      linesPct: percent(lines, linesOf),
      branches,
      branchesOf,
      branchesPct: percent(branches, branchesOf),
      returned: run.returned,
      missing,
    },
  });
}
