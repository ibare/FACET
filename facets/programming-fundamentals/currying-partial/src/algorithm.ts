/**
 * 커링 · 부분 적용 — 인자 셋을 받는 함수에 하나만 주면 무엇이 나오는가.
 *
 * `initialData.lines` 는 줄 목록이다. 줄마다 화면 글자(`text`)와 그 줄이 하는 일의 구조(`stmt`)를
 * 함께 둔다. 이 알고리즘이 구조를 해석해 담긴 값 · 남은 인자 수 · 남은 함수의 글자를 셈한다.
 * 걸음은 **적용 걸음**이다 — 걸음 0 시작, 바깥의 문 하나 = 한 걸음. 부르기가 든 문도 한 걸음이며
 * 이름 없는 함수의 몸으로 들어가는 것은 걸음으로 세지 않는다.
 *
 * 남은 함수의 글자 = 남은 식을 찍되 이미 받은 인자 이름은 받은 값으로 바꿔 찍는다 (교육용 표기).
 * 줄마다 구조에서 찍은 글자가 `text` 와 같은지 대조하고, 다르면 던진다.
 *
 * 이벤트 (모두 걸음이다. silent 없음):
 *   init   { lines: { indent: number; text: string }[]; names: string[]; slotCount: number }
 *            — 걸음 0. 프로그램 전체. names = 값을 담는 이름들(차례대로), slotCount = 가장 많은 인자 칸 수
 *   bind   { line: number; name: string; slots: Slot[]; left: number; text: string }
 *            — 부르기 없이 함수를 담는 줄 (`let add = a => …`)
 *   apply  { line: number; name: string; from: string; slot: number; param: string; arg: string;
 *            argCol: number; argLen: number; slots: Slot[]; left: number;
 *            text: string | null; value: string | null }
 *            — 함수에 인자 하나를 주고 결과를 담는 줄. 결과가 함수면 text(남은 함수 글자), 값이면 value.
 *              slot = 이번에 닫힌 칸의 차례, argCol · argLen = 줄 글자 안에서 준 인자의 자리
 *   show   { line: number; from: string | null; value: string }
 *
 *   Slot = { param: string; value: string | null }   — value 가 null 이면 열린 칸
 *   line 은 0 부터 센 줄 차례. 값 글자는 코드 표기(`17` · `"a"` · `null`)다 — 문안이 아니다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Expr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { op: '+' | '-' | '*'; l: Expr; r: Expr }
  | { call: string; args: Expr[] }
  | LambdaExpr;

export type LambdaExpr = { lambda: string[]; body: Expr };

export type Stmt =
  | { k: 'assign'; to: string; value: Expr; declare?: boolean }
  | { k: 'show'; value: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type CurryingPartialFacetData = {
  type: 'currying-partial';
  stepMs: number;
  lines: CodeLine[];
};

type Fn = { lam: LambdaExpr; env: Env };
type Val = number | string | null | Fn;
type Env = { params: string[]; vars: Map<string, Val>; parent: Env | null; outer: boolean };
type Slot = { param: string; value: string | null };

const PREC: Record<string, number> = { '+': 5, '-': 5, '*': 6 };

function isFn(v: Val): v is Fn {
  return typeof v === 'object' && v !== null;
}

function fmtVal(v: Val): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return '"' + v + '"';
  if (typeof v === 'number') return String(v);
  return fmt(v.lam, subst(v));
}

/** 식 → 글자. `sub` 에 있는 이름은 그 값으로 바꿔 찍는다. */
function fmt(e: Expr, sub: Map<string, string>, parent?: string, right = false): string {
  if ('num' in e) return String(e.num);
  if ('str' in e) return '"' + e.str + '"';
  if ('var' in e) return sub.get(e.var) ?? e.var;
  if ('op' in e) {
    const s = fmt(e.l, sub, e.op, false) + ' ' + e.op + ' ' + fmt(e.r, sub, e.op, true);
    const pp = parent === undefined ? undefined : PREC[parent];
    const mp = PREC[e.op] ?? 0;
    if (pp !== undefined && (mp < pp || (right && mp === pp))) return '(' + s + ')';
    return s;
  }
  if ('call' in e) return e.call + '(' + e.args.map((a) => fmt(a, sub)).join(', ') + ')';
  const inner = new Map(sub);
  for (const p of e.lambda) inner.delete(p);
  const head = e.lambda.length === 1 ? e.lambda[0] : '(' + e.lambda.join(', ') + ')';
  return head + ' => ' + fmt(e.body, inner);
}

function fmtStmt(s: Stmt): string {
  if (s.k === 'show') return 'show ' + fmt(s.value, new Map());
  return (s.declare ? 'let ' : '') + s.to + ' = ' + fmt(s.value, new Map());
}

/** 붙잡은 틀들 — 바깥(맨 위)은 붙잡은 것이 아니다. 먼저 받은 것이 앞에 온다. */
function capturedFrames(f: Fn): Env[] {
  const out: Env[] = [];
  for (let e: Env | null = f.env; e && !e.outer; e = e.parent) out.unshift(e);
  return out;
}

function subst(f: Fn): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of capturedFrames(f)) {
    for (const [n, v] of e.vars) if (!isFn(v)) m.set(n, fmtVal(v));
  }
  return m;
}

/** 칸 — 받은 인자(닫힌 칸) 뒤에 맨 앞부터 이어진 이름 없는 함수의 인자(열린 칸). */
function slotsOf(f: Fn): Slot[] {
  const slots: Slot[] = [];
  for (const e of capturedFrames(f)) {
    for (const p of e.params) {
      const v = e.vars.get(p);
      slots.push({ param: p, value: v === undefined || isFn(v) ? null : fmtVal(v) });
    }
  }
  let body: Expr = f.lam;
  while ('lambda' in body) {
    for (const p of body.lambda) slots.push({ param: p, value: null });
    body = body.body;
  }
  return slots;
}

function leftOf(f: Fn): number {
  let n = 0;
  let body: Expr = f.lam;
  while ('lambda' in body) {
    n += body.lambda.length;
    body = body.body;
  }
  return n;
}

function lookup(env: Env, name: string): Val {
  for (let e: Env | null = env; e; e = e.parent) {
    if (e.vars.has(name)) return e.vars.get(name) ?? null;
  }
  throw new Error(`이름 ${name} 이 없다`);
}

function evalExpr(e: Expr, env: Env): Val {
  if ('num' in e) return e.num;
  if ('str' in e) return e.str;
  if ('var' in e) return lookup(env, e.var);
  if ('op' in e) {
    const l = evalExpr(e.l, env);
    const r = evalExpr(e.r, env);
    if (typeof l !== 'number' || typeof r !== 'number') throw new Error('수가 아닌 것을 셈한다');
    if (e.op === '+') return l + r;
    if (e.op === '-') return l - r;
    return l * r;
  }
  if ('call' in e) {
    const f = lookup(env, e.call);
    if (!isFn(f)) throw new Error(`${e.call} 은 함수가 아니다`);
    return applyFn(f, e.args.map((a) => evalExpr(a, env)));
  }
  return { lam: e, env };
}

function applyFn(f: Fn, args: Val[]): Val {
  if (args.length !== f.lam.lambda.length) throw new Error('인자 수가 맞지 않는다');
  const vars = new Map<string, Val>();
  f.lam.lambda.forEach((p, i) => vars.set(p, args[i] ?? null));
  return evalExpr(f.lam.body, { params: [...f.lam.lambda], vars, parent: f.env, outer: false });
}

type Step =
  | { type: 'bind'; payload: { line: number; name: string; slots: Slot[]; left: number; text: string } }
  | {
      type: 'apply';
      payload: {
        line: number;
        name: string;
        from: string;
        slot: number;
        param: string;
        arg: string;
        argCol: number;
        argLen: number;
        slots: Slot[];
        left: number;
        text: string | null;
        value: string | null;
      };
    }
  | { type: 'show'; payload: { line: number; from: string | null; value: string } };

/** 줄 구조를 해석해 걸음을 셈한다. */
function interpret(lines: CodeLine[]): Step[] {
  const glob: Env = { params: [], vars: new Map(), parent: null, outer: true };
  const steps: Step[] = [];
  lines.forEach((ln, line) => {
    const s = ln.stmt;
    if (fmtStmt(s) !== ln.text) throw new Error(`줄 ${line + 1} 의 글자가 구조와 다르다`);
    if (s.k === 'show') {
      const v = evalExpr(s.value, glob);
      steps.push({
        type: 'show',
        payload: { line, from: 'var' in s.value ? s.value.var : null, value: fmtVal(v) },
      });
      return;
    }
    const e = s.value;
    if ('call' in e) {
      const callee = lookup(glob, e.call);
      if (!isFn(callee)) throw new Error(`${e.call} 은 함수가 아니다`);
      const arg0 = e.args[0];
      if (e.args.length !== 1 || arg0 === undefined) throw new Error('한 번에 인자 하나만 준다');
      const argVal = evalExpr(arg0, glob);
      const result = applyFn(callee, [argVal]);
      const before = slotsOf(callee);
      const slot = before.findIndex((x) => x.value === null);
      const argText = fmtVal(argVal);
      const slots = before.map((x, i) => (i === slot ? { param: x.param, value: argText } : { ...x }));
      glob.vars.set(s.to, result);
      const prefix = (s.declare ? 'let ' : '') + s.to + ' = ' + e.call + '(';
      steps.push({
        type: 'apply',
        payload: {
          line,
          name: s.to,
          from: e.call,
          slot,
          param: before[slot]?.param ?? '',
          arg: argText,
          argCol: prefix.length,
          argLen: fmt(arg0, new Map()).length,
          slots: isFn(result) ? slotsOf(result) : slots,
          left: isFn(result) ? leftOf(result) : 0,
          text: isFn(result) ? fmtVal(result) : null,
          value: isFn(result) ? null : fmtVal(result),
        },
      });
      return;
    }
    const v = evalExpr(e, glob);
    glob.vars.set(s.to, v);
    if (!isFn(v)) throw new Error('이 조각은 함수나 부르기의 결과만 담는다');
    steps.push({
      type: 'bind',
      payload: { line, name: s.to, slots: slotsOf(v), left: leftOf(v), text: fmtVal(v) },
    });
  });
  return steps;
}

export async function curryingPartial(ctxIn: FacetContext<CurryingPartialFacetData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<CurryingPartialFacetData>;
  const { lines, stepMs } = ctx.data;
  const steps = interpret(lines);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let slotCount = 0;
  for (const st of steps) {
    if (st.type !== 'show') slotCount = Math.max(slotCount, st.payload.slots.length);
  }
  await ctx.emit({
    type: 'init',
    payload: {
      lines: lines.map((l) => ({ indent: l.indent, text: l.text })),
      names: steps.flatMap((st) => (st.type === 'show' ? [] : [st.payload.name])),
      slotCount,
    },
  });

  for (const st of steps) {
    if (!(await pause())) return;
    if (st.type === 'bind') await ctx.emit({ type: 'bind', payload: st.payload });
    else if (st.type === 'apply') await ctx.emit({ type: 'apply', payload: st.payload });
    else await ctx.emit({ type: 'show', payload: st.payload });
  }
}
