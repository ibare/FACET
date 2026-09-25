/**
 * base-case — 바닥에 닿아야 돌아온다.
 *
 * 줄 구조(`lines`)를 작은 해석기로 밟는다. 걸음은 **호출 걸음**이다 — 줄 걸음의 사건에서
 * 부르기 · 돌아옴 · 넘침만 추린다. 틀 한도(`maxFrames`)는 함수 틀만 센다 (바깥은 세지 않는다).
 *
 * 이벤트 (모두 걸음이다. silent 없음):
 *   init      { lines: { indent: number; text: string }[]; maxFrames: number;
 *               fn: string; test: string; floor: number | null; lo: number; hi: number }
 *             — 걸음 0. 바탕. `test` 는 바닥 조건 글자(`n == 0`), `floor` 는 그 조건이 견주는 수,
 *               `lo`·`hi` 는 이 실행에서 n 이 지나는 값(넘침 직전의 부르기 포함)과 바닥 값의 범위
 *   enter     { n: number; depth: number; line: number; test: boolean | null }
 *             — 틀에 들어가 바닥 조건을 셈하기까지. `line` 은 부른 줄(1 부터), `test` 는 조건의 참거짓
 *   return    { depth: number; line: number; value: string | number | null; into: string | null }
 *             — 깊이 `depth` 의 틀이 값을 돌려주고 걷힌다. 바깥으로 돌아가 대입되면 `into` 가 변수 이름
 *   overflow  { n: number; depth: number; line: number; error: 'RecursionError' }
 *             — 틀이 이미 `maxFrames` 개일 때의 부르기. 틀을 세우지 않고 넘친다. 잡히지 않아 프로그램이 멈춘다
 *
 * 넘침 뒤 틀들이 걷히는 것은 걸음으로 세지 않는다 (발신하지 않는다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Expr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { op: '+' | '-' | '*' | '<' | '<=' | '>' | '>=' | '==' | '!='; l: Expr; r: Expr }
  | { call: string; args: Expr[] };

export type Stmt =
  | { k: 'def'; name: string; params: string[] }
  | { k: 'if'; cond: Expr }
  | { k: 'return'; value?: Expr }
  | { k: 'assign'; to: string; value: Expr }
  | { k: 'expr'; value: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type BaseCaseFacetData = {
  type: 'base-case';
  stepMs: number;
  maxFrames: number;
  lines: CodeLine[];
};

type Val = string | number | boolean | null;

type Trace =
  | { kind: 'enter'; n: number; depth: number; line: number; test: boolean | null }
  | { kind: 'return'; depth: number; line: number; value: string | number | null; into: string | null }
  | { kind: 'overflow'; n: number; depth: number; line: number };

class Thrown {
  constructor(readonly error: string) {}
}
class Returned {
  constructor(readonly value: Val) {}
}

function showExpr(e: Expr): string {
  if ('num' in e) return String(e.num);
  if ('str' in e) return `"${e.str}"`;
  if ('var' in e) return e.var;
  if ('op' in e) return `${showExpr(e.l)} ${e.op} ${showExpr(e.r)}`;
  return `${e.call}(${e.args.map(showExpr).join(', ')})`;
}

function applyOp(op: string, a: Val, b: Val): Val {
  if (op === '==') return a === b;
  if (op === '!=') return a !== b;
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  if (op === '<') return a < b;
  if (op === '<=') return a <= b;
  if (op === '>') return a > b;
  return a >= b;
}

/** 머리줄 i 의 몸 — 아래로 더 깊은 줄이 이어지는 동안, 그 가운데 한 칸 깊은 줄들. */
function bodyOf(lines: CodeLine[], i: number): number[] {
  const ind = lines[i]!.indent;
  const out: number[] = [];
  for (let j = i + 1; j < lines.length && lines[j]!.indent > ind; j += 1) {
    if (lines[j]!.indent === ind + 1) out.push(j);
  }
  return out;
}

/**
 * 프로그램을 끝까지 밟아 호출 걸음의 사건을 남긴다. 순수 셈이다.
 * 틀 안의 첫 조건 셈이 그 틀의 `enter` 에 실린다.
 */
function trace(lines: CodeLine[], maxFrames: number): Trace[] {
  const out: Trace[] = [];
  const funcs = new Map<string, number>();
  lines.forEach((l, i) => {
    if (l.stmt.k === 'def') funcs.set(l.stmt.name, i);
  });
  const globals = new Map<string, Val>();
  const frames: { vars: Map<string, Val>; pending: Trace | null }[] = [];
  const vars = (): Map<string, Val> => frames[frames.length - 1]?.vars ?? globals;

  // 틀에 들어간 뒤 첫 줄을 밟을 때 enter 를 남긴다 — 그 줄이 조건이면 참거짓을 함께
  const flushEnter = (test: boolean | null): void => {
    const top = frames[frames.length - 1];
    if (top?.pending?.kind === 'enter') {
      out.push({ ...top.pending, test });
      top.pending = null;
    }
  };

  const evalExpr = (e: Expr, line: number): Val => {
    if ('num' in e) return e.num;
    if ('str' in e) return e.str;
    if ('var' in e) return vars().get(e.var) ?? null;
    if ('op' in e) return applyOp(e.op, evalExpr(e.l, line), evalExpr(e.r, line));
    const args = e.args.map((a) => evalExpr(a, line));
    return invoke(e.call, args, line);
  };

  const invoke = (name: string, args: Val[], line: number): Val => {
    const di = funcs.get(name);
    if (di === undefined) return null;
    const def = lines[di]!.stmt;
    const params = def.k === 'def' ? def.params : [];
    const n = typeof args[0] === 'number' ? args[0] : 0;
    if (frames.length >= maxFrames) {
      out.push({ kind: 'overflow', n, depth: frames.length, line: line + 1 });
      throw new Thrown('RecursionError');
    }
    const fv = new Map<string, Val>();
    params.forEach((p, i) => fv.set(p, args[i] ?? null));
    frames.push({
      vars: fv,
      pending: { kind: 'enter', n, depth: frames.length + 1, line: line + 1, test: null },
    });
    let value: Val = null;
    try {
      run(bodyOf(lines, di));
    } catch (x) {
      if (!(x instanceof Returned)) {
        frames.pop();
        throw x;
      }
      value = x.value;
    }
    const depth = frames.length;
    frames.pop();
    const at = lines[line]!.stmt;
    const into = frames.length === 0 && at.k === 'assign' ? at.to : null;
    out.push({ kind: 'return', depth, line: line + 1, value: typeof value === 'boolean' ? null : value, into });
    return value;
  };

  const run = (idxs: number[]): void => {
    for (const i of idxs) {
      const st = lines[i]!.stmt;
      if (st.k === 'def') continue;
      if (st.k === 'if') {
        const v = evalExpr(st.cond, i);
        flushEnter(v === true);
        if (v === true) run(bodyOf(lines, i));
        continue;
      }
      flushEnter(null);
      if (st.k === 'assign') vars().set(st.to, evalExpr(st.value, i));
      else if (st.k === 'expr') evalExpr(st.value, i);
      else throw new Returned(st.value === undefined ? null : evalExpr(st.value, i));
    }
  };

  try {
    run(lines.map((l, i) => (l.indent === 0 ? i : -1)).filter((i) => i >= 0));
  } catch (x) {
    // 잡히지 않은 예외 — 프로그램이 멈춘다. 그 뒤로는 사건이 없다.
    if (!(x instanceof Thrown)) throw x;
  }
  return out;
}

/** 함수 몸의 첫 조건 — `n == 0` 꼴이면 그 글자와 견주는 수. */
function baseTest(lines: CodeLine[]): { fn: string; test: string; floor: number | null } {
  const di = lines.findIndex((l) => l.stmt.k === 'def');
  const def = lines[di]?.stmt;
  const fn = def?.k === 'def' ? def.name : '';
  const first = di < 0 ? undefined : bodyOf(lines, di).map((i) => lines[i]!.stmt).find((s) => s.k === 'if');
  if (first?.k !== 'if') return { fn, test: '', floor: null };
  const c = first.cond;
  const floor = 'op' in c && c.op === '==' && 'num' in c.r ? c.r.num : null;
  return { fn, test: showExpr(c), floor };
}

export async function baseCase(ctxIn: FacetContext<BaseCaseFacetData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<BaseCaseFacetData>;
  const { lines, maxFrames, stepMs } = ctx.data;
  const events = trace(lines, maxFrames);
  const { fn, test, floor } = baseTest(lines);

  const ns: number[] = floor === null ? [] : [floor];
  for (const e of events) if (e.kind !== 'return') ns.push(e.n);
  const lo = ns.length > 0 ? Math.min(...ns) : 0;
  const hi = ns.length > 0 ? Math.max(...ns) : 0;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    payload: {
      lines: lines.map((l) => ({ indent: l.indent, text: l.text })),
      maxFrames,
      fn,
      test,
      floor,
      lo,
      hi,
    },
  });

  for (const e of events) {
    if (!(await pause())) return;
    if (e.kind === 'enter') {
      await ctx.emit({ type: 'enter', payload: { n: e.n, depth: e.depth, line: e.line, test: e.test } });
    } else if (e.kind === 'return') {
      await ctx.emit({
        type: 'return',
        payload: { depth: e.depth, line: e.line, value: e.value, into: e.into },
      });
    } else {
      await ctx.emit({
        type: 'overflow',
        payload: { n: e.n, depth: e.depth, line: e.line, error: 'RecursionError' },
      });
    }
  }
}
