/**
 * function-as-value — 함수를 값처럼 담고 건네고, 받은 이름으로 부른다.
 *
 * `initialData.lines` 의 줄 구조를 작은 해석기가 밟는다. 밟는 차례 · 변수 값 · 돌려준 값은
 * 전부 여기서 셈한다 (공통 안내문의 해석 규약). 글자를 파싱하지 않는다 — 구조만 본다.
 *
 * 걸음 규약 (줄 걸음):
 * - 걸음 0 은 장면의 첫 모습(프로그램 전체)이다. 발신은 걸음 1 부터.
 * - 부르기가 없는 문 하나 = `stmt` 한 번.
 * - 부르기마다 `call` 한 번과 `arrive` 한 번. 문의 마무리(넣기 · 출력 · 돌려줌)는 그 문의
 *   **마지막** `arrive` 안에 실린다 (`done`).
 * - 이름 없는 함수의 몸 = 그 함수가 적힌 줄의 `eval` 한 번. 깊이는 부른 틀보다 하나 깊다.
 * - 맨 바깥 `function` 줄은 밟지 않는다 (시작 전에 정의돼 있다).
 *
 * 이벤트 (모두 silent 아님, 하나가 한 걸음):
 *
 *   stmt    { line, depth, done: Done, made: FnInfo[] }
 *   call    { line, depth, callee: string, fn: number, lambda: boolean,
 *             binds: { param: string, val: Val, from: string | null }[], made: FnInfo[] }
 *   eval    { line, depth, fn: number, args: { param: string, val: Val }[], shown: string, val: Val }
 *   arrive  { line, depth, callee: string, lambda: boolean, val: Val, done: Done | null }
 *
 *   Val     { t: 'num', n } | { t: 'str', s } | { t: 'fn', id } | { t: 'none' }
 *   FnInfo  { id, line, text, params: string[], lambda: boolean }  — 이 걸음에 만들어진 함수
 *   Done    { k: 'assign', to, declare: boolean, val, from: string | null }
 *         | { k: 'show', val, from: string | null }
 *         | { k: 'return', val, from: string | null }
 *         | { k: 'def', to, val }
 *         | { k: 'expr' }
 *
 * `line` 은 0 부터 센 줄 자리. `from` 은 값이 변수 하나에서 왔을 때 그 이름이다 — 그림이
 * 어디서 출발할지 고르는 계기값이다. `shown` 은 몸의 식에 인자 값을 넣어 찍은 코드 글자다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Expr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { op: '+' | '-' | '*'; l: Expr; r: Expr }
  | { call: string; args: Expr[] }
  | { lambda: string[]; body: Expr };

export type Param = string | { name: string; ref: true };

export type Stmt =
  | { k: 'function'; name: string; params: Param[] }
  | { k: 'assign'; to: string; declare?: boolean; value: Expr }
  | { k: 'expr'; value: Expr }
  | { k: 'return'; value: Expr }
  | { k: 'show'; value: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type FunctionAsValueFacetData = {
  type: 'function-as-value';
  stepMs: number;
  lines: CodeLine[];
};

export type Val =
  | { t: 'num'; n: number }
  | { t: 'str'; s: string }
  | { t: 'fn'; id: number }
  | { t: 'none' };

export type FnInfo = { id: number; line: number; text: string; params: string[]; lambda: boolean };

export type Done =
  | { k: 'assign'; to: string; declare: boolean; val: Val; from: string | null }
  | { k: 'show'; val: Val; from: string | null }
  | { k: 'return'; val: Val; from: string | null }
  | { k: 'def'; to: string; val: Val }
  | { k: 'expr' };

type Slot = { val: Val };

class Scope {
  readonly vars = new Map<string, Slot>();
  constructor(readonly parent: Scope | null) {}
  lookup(name: string): Slot | null {
    const own = this.vars.get(name);
    if (own) return own;
    return this.parent ? this.parent.lookup(name) : null;
  }
}

type FnVal = {
  info: FnInfo;
  params: Param[];
  /** 이름 있는 함수의 몸 줄들 (lambda 면 빈 목록) */
  bodyLines: number[];
  /** 이름 없는 함수의 몸 식 */
  bodyExpr: Expr | null;
  /** 만들어진 그때의 환경 */
  env: Scope;
};

function paramName(p: Param): string {
  return typeof p === 'string' ? p : p.name;
}

const PREC: Record<'+' | '-' | '*', number> = { '+': 1, '-': 1, '*': 2 };

/** 값을 코드 글자로. 함수는 여기서 찍지 않는다 (그림이 따로 그린다). */
export function valText(v: Val): string {
  if (v.t === 'num') return String(v.n);
  if (v.t === 'str') return `"${v.s}"`;
  if (v.t === 'fn') return 'function';
  return 'null';
}

/** 식을 표기(pseudo-notation) 글자로 찍는다. `subst` 의 이름은 값으로 바꿔 찍는다. */
export function exprText(e: Expr, subst: ReadonlyMap<string, Val> | null = null): string {
  if ('num' in e) return String(e.num);
  if ('str' in e) return `"${e.str}"`;
  if ('var' in e) {
    const v = subst?.get(e.var);
    return v ? valText(v) : e.var;
  }
  if ('op' in e) {
    const side = (c: Expr, right: boolean): string => {
      const s = exprText(c, subst);
      if (!('op' in c)) return s;
      const low = PREC[c.op] < PREC[e.op] || (right && PREC[c.op] === PREC[e.op] && e.op !== '+' && e.op !== '*');
      return low ? `(${s})` : s;
    };
    return `${side(e.l, false)} ${e.op} ${side(e.r, true)}`;
  }
  if ('call' in e) return `${e.call}(${e.args.map((a) => exprText(a, subst)).join(', ')})`;
  const head = e.lambda.length === 1 ? e.lambda[0] : `(${e.lambda.join(', ')})`;
  return `${head} => ${exprText(e.body, subst)}`;
}

/** 머리줄 아래로 들여쓰기가 더 깊은 줄들 — 그 함수의 몸. */
function bodyOf(lines: readonly CodeLine[], head: number): number[] {
  const out: number[] = [];
  const base = lines[head].indent;
  for (let i = head + 1; i < lines.length; i += 1) {
    if (lines[i].indent <= base) break;
    out.push(i);
  }
  return out;
}

/** 몸 줄들 가운데 한 층 위의 문들만 (안쪽 function 의 몸은 건너뛴다). */
function topStatements(lines: readonly CodeLine[], block: readonly number[]): number[] {
  if (block.length === 0) return [];
  const base = lines[block[0]].indent;
  return block.filter((i) => lines[i].indent === base);
}

export async function functionAsValue(ctx0: FacetContext<FunctionAsValueFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<FunctionAsValueFacetData>;
  const { lines, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const fns: FnVal[] = [];
  /** 이번 문에서 만들어져 아직 어느 걸음에도 실리지 않은 함수 */
  let made: FnInfo[] = [];
  /** 아직 내보내지 않은 돌아옴 — 문의 마지막 돌아옴이면 마무리가 실린다 */
  let pending: {
    line: number;
    depth: number;
    callee: string;
    lambda: boolean;
    val: Val;
    done: Done | null;
  } | null = null;

  function makeFn(line: number, params: Param[], bodyLines: number[], bodyExpr: Expr | null, env: Scope): Val {
    const id = fns.length;
    const lambda = bodyExpr !== null;
    const names = params.map(paramName);
    const text = lambda
      ? exprText({ lambda: names, body: bodyExpr })
      : `function ${(lines[line].stmt as { name: string }).name}(${names.join(', ')})`;
    const info: FnInfo = { id, line, text, params: names, lambda };
    fns.push({ info, params, bodyLines, bodyExpr, env });
    made.push(info);
    return { t: 'fn', id };
  }

  async function flush(): Promise<boolean> {
    if (pending === null) return true;
    const p = pending;
    pending = null;
    if (!(await pause())) return false;
    await ctx.emit({ type: 'arrive', payload: p });
    return true;
  }

  /** 식을 셈한다. 멈췄으면 null. */
  async function evalExpr(e: Expr, scope: Scope, line: number, depth: number): Promise<Val | null> {
    if ('num' in e) return { t: 'num', n: e.num };
    if ('str' in e) return { t: 'str', s: e.str };
    if ('var' in e) {
      const slot = scope.lookup(e.var);
      if (!slot) throw new Error(`function-as-value: 이름 없음 ${e.var}`);
      return slot.val;
    }
    if ('lambda' in e) return makeFn(line, e.lambda, [], e.body, scope);
    if ('op' in e) {
      const l = await evalExpr(e.l, scope, line, depth);
      if (l === null) return null;
      const r = await evalExpr(e.r, scope, line, depth);
      if (r === null) return null;
      if (l.t === 'num' && r.t === 'num') {
        const n = e.op === '+' ? l.n + r.n : e.op === '-' ? l.n - r.n : l.n * r.n;
        return { t: 'num', n };
      }
      if (e.op === '+' && l.t !== 'fn' && r.t !== 'fn') {
        return { t: 'str', s: `${l.t === 'str' ? l.s : valText(l)}${r.t === 'str' ? r.s : valText(r)}` };
      }
      throw new Error('function-as-value: 셈할 수 없는 연산');
    }
    return callFn(e, scope, line, depth);
  }

  async function callFn(
    e: { call: string; args: Expr[] },
    scope: Scope,
    line: number,
    depth: number,
  ): Promise<Val | null> {
    const target = scope.lookup(e.call);
    if (!target || target.val.t !== 'fn') throw new Error(`function-as-value: ${e.call} 은 함수가 아니다`);
    const fn = fns[target.val.id];

    // 인자는 왼쪽부터
    const argVals: Val[] = [];
    for (const a of e.args) {
      if (ctx.cancelled) return null;
      const v = await evalExpr(a, scope, line, depth);
      if (v === null) return null;
      argVals.push(v);
    }
    if (!(await flush())) return null;

    const frame = new Scope(fn.env);
    const binds = fn.params.map((p, i) => {
      const a = e.args[i];
      const from = a !== undefined && 'var' in a ? a.var : null;
      if (typeof p !== 'string' && from !== null) {
        const slot = scope.lookup(from);
        if (slot) frame.vars.set(p.name, slot);
      } else {
        frame.vars.set(paramName(p), { val: argVals[i] ?? { t: 'none' } });
      }
      return { param: paramName(p), val: argVals[i] ?? ({ t: 'none' } as Val), from };
    });
    const madeHere = made;
    made = [];
    if (!(await pause())) return null;
    await ctx.emit({
      type: 'call',
      payload: { line, depth, callee: e.call, fn: fn.info.id, lambda: fn.info.lambda, binds, made: madeHere },
    });

    let result: Val;
    if (fn.bodyExpr !== null) {
      const v = await evalExpr(fn.bodyExpr, frame, fn.info.line, depth + 1);
      if (v === null) return null;
      if (!(await flush())) return null;
      const subst = new Map<string, Val>();
      for (const b of binds) subst.set(b.param, b.val);
      if (!(await pause())) return null;
      await ctx.emit({
        type: 'eval',
        payload: {
          line: fn.info.line,
          depth: depth + 1,
          fn: fn.info.id,
          args: binds.map((b) => ({ param: b.param, val: b.val })),
          shown: exprText(fn.bodyExpr, subst),
          val: v,
        },
      });
      result = v;
    } else {
      const r = await runBlock(fn.bodyLines, frame, depth + 1);
      if (r === null) return null;
      result = r.ret ?? { t: 'none' };
    }
    pending = { line, depth, callee: e.call, lambda: fn.info.lambda, val: result, done: null };
    return result;
  }

  /** 문 하나를 끝맺는다 — 앞선 돌아옴이 있으면 거기에 싣고, 없으면 제 걸음을 낸다. */
  async function finish(line: number, depth: number, done: Done): Promise<boolean> {
    if (pending !== null) {
      pending = { ...pending, done };
      return flush();
    }
    const madeHere = made;
    made = [];
    if (!(await pause())) return false;
    await ctx.emit({ type: 'stmt', payload: { line, depth, done, made: madeHere } });
    return true;
  }

  async function runBlock(
    block: readonly number[],
    scope: Scope,
    depth: number,
  ): Promise<{ ret: Val | null } | null> {
    for (const i of topStatements(lines, block)) {
      if (ctx.cancelled) return null;
      const s = lines[i].stmt;
      const from = 'value' in s && 'var' in s.value ? s.value.var : null;
      if (s.k === 'function') {
        const v = makeFn(i, s.params, bodyOf(lines, i), null, scope);
        scope.vars.set(s.name, { val: v });
        if (!(await finish(i, depth, { k: 'def', to: s.name, val: v }))) return null;
        continue;
      }
      const v = await evalExpr(s.value, scope, i, depth);
      if (v === null) return null;
      if (s.k === 'assign') {
        const declare = s.declare === true;
        if (declare) scope.vars.set(s.to, { val: v });
        else {
          const slot = scope.lookup(s.to);
          if (!slot) throw new Error(`function-as-value: 선언 없는 ${s.to}`);
          slot.val = v;
        }
        if (!(await finish(i, depth, { k: 'assign', to: s.to, declare, val: v, from }))) return null;
      } else if (s.k === 'show') {
        if (!(await finish(i, depth, { k: 'show', val: v, from }))) return null;
      } else if (s.k === 'return') {
        if (!(await finish(i, depth, { k: 'return', val: v, from }))) return null;
        return { ret: v };
      } else if (!(await finish(i, depth, { k: 'expr' }))) return null;
    }
    return { ret: null };
  }

  // 맨 바깥 function 은 시작 전에 이미 있다 — 걸음을 내지 않는다.
  const global = new Scope(null);
  const top: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].indent !== 0) continue;
    const s = lines[i].stmt;
    if (s.k === 'function') global.vars.set(s.name, { val: makeFn(i, s.params, bodyOf(lines, i), null, global) });
    else top.push(i);
  }
  // 미리 만든 함수는 걸음에 싣지 않는다
  made = [];
  await runBlock(top, global, 0);
}
