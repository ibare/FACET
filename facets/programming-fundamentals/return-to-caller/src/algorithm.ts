/**
 * return-to-caller — 함수가 돌려준 값은 어디로 가는가.
 *
 * `initialData.lines` 의 줄 구조를 해석한다. 걸음표를 손으로 적지 않는다 — 밟는 차례 ·
 * 인자 값 · 돌려준 값 · 부른 자리의 글자는 모두 여기서 셈한다.
 *
 * 걸음 규약 (공통 줄 걸음에서 한 곳만 바꾼다): 부르기가 든 문의 마무리(넣기 · 출력 ·
 * 돌려줌)를 마지막 돌아옴 걸음에 묶지 않고 **제 걸음으로 뗀다.** 값이 자리에 끼워지는
 * 걸음과 그 값으로 셈하는 걸음을 가르기 위해서다.
 *
 * 부르기 식(`call`)에는 프로그램 전체에서 앞에서부터 번호(`cid`)를 붙인다. 장면과 그림은
 * 이 번호로 "어느 부른 자리" 인지를 가른다.
 *
 * 글자 조각 `Seg`:
 *   { kind: 'text', text }                      — 그냥 글자
 *   { kind: 'call', cid, text }                 — 아직 값이 오지 않은 부르기 식
 *   { kind: 'value', cid, call, value }         — 값이 돌아와 끼워진 자리 (call = 원래 식 글자)
 *
 * 이벤트 (모두 걸음이다. silent 없음. 발신마다 stepMs 머문다):
 *   init    { lines: { indent: number; segs: Seg[] }[]; calls: number }
 *           걸음 0. 프로그램 전체. calls = 부르기 식의 수
 *   call    { line: number; cid: number; header: number; depth: number;
 *             args: { param: string; value: string }[] }
 *           부름 걸음. line 은 부르기 식이 적힌 줄, header 는 불린 함수의 머리줄
 *   return  { line: number; cid: number; value: string; expr: string; depth: number }
 *           돌려줌 걸음. cid 는 이 몸을 부른 부르기 식. expr 은 돌려줄 식 글자
 *   arrive  { line: number; cid: number; value: string; from: number; segs: Seg[]; depth: number }
 *           돌아옴 걸음. from 은 값이 나온 return 줄, segs 는 **이 걸음 뒤의** 부른 줄 글자
 *   assign  { line: number; name: string; value: string; expr: string; depth: number }
 *           넣기 (부르기가 있었다면 마무리 걸음). expr 은 값이 끼워진 식 글자
 *   show    { line: number; value: string; expr: string; depth: number }
 *           출력
 *
 * 값은 화면에 뜨는 코드 글자(`'9'` · `'"a"'`)로 싣는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ReturnToCallerExpr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { op: '+' | '-' | '*'; l: ReturnToCallerExpr; r: ReturnToCallerExpr }
  | { call: string; args: ReturnToCallerExpr[] };

export type ReturnToCallerParam = string | { name: string; ref: true };

export type ReturnToCallerStmt =
  | { k: 'function'; name: string; params: ReturnToCallerParam[] }
  | { k: 'assign'; to: string; declare?: boolean; value: ReturnToCallerExpr }
  | { k: 'expr'; value: ReturnToCallerExpr }
  | { k: 'return'; value: ReturnToCallerExpr }
  | { k: 'show'; value: ReturnToCallerExpr };

export type ReturnToCallerLine = { indent: number; text: string; stmt: ReturnToCallerStmt };

export type ReturnToCallerFacetData = {
  type: 'return-to-caller';
  stepMs: number;
  lines: ReturnToCallerLine[];
};

export type ReturnToCallerSeg =
  | { kind: 'text'; text: string }
  | { kind: 'call'; cid: number; text: string }
  | { kind: 'value'; cid: number; call: string; value: string };

type Expr = ReturnToCallerExpr;
type Stmt = ReturnToCallerStmt;
type Seg = ReturnToCallerSeg;

type FnVal = { fn: number };
type Val = number | string | null | FnVal;
type Cell = { value: Val };
type Env = { vars: Map<string, Cell>; parent: Env | null };

const HALT: unique symbol = Symbol('halt');
type Halt = typeof HALT;

const PREC: Record<'+' | '-' | '*', number> = { '+': 1, '-': 1, '*': 2 };

function isFn(v: Val): v is FnVal {
  return typeof v === 'object' && v !== null;
}

/** 값의 코드 글자. */
export function valueText(v: Val): string {
  if (v === null) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return `"${v}"`;
  return 'function';
}

function paramName(p: ReturnToCallerParam): string {
  return typeof p === 'string' ? p : p.name;
}

/**
 * 식을 글자 조각으로 찍는다. 값이 돌아온 부르기(`resolved`)는 그 값으로 찍는다.
 * 부르기 안에 든 부르기는 바깥 부르기의 글자 안에 들어간다.
 */
function exprSegs(
  e: Expr,
  cids: Map<Expr, number>,
  resolved: Map<Expr, Val>,
  parentPrec = 0,
  right = false,
): Seg[] {
  if ('num' in e) return [{ kind: 'text', text: String(e.num) }];
  if ('str' in e) return [{ kind: 'text', text: `"${e.str}"` }];
  if ('var' in e) return [{ kind: 'text', text: e.var }];
  if ('call' in e) {
    const cid = cids.get(e) ?? -1;
    const text = `${e.call}(${e.args.map((a) => flat(exprSegs(a, cids, resolved))).join(', ')})`;
    if (resolved.has(e)) {
      const v = resolved.get(e) ?? null;
      return [{ kind: 'value', cid, call: callText(e, cids), value: valueText(v) }];
    }
    return [{ kind: 'call', cid, text }];
  }
  const p = PREC[e.op];
  const wrap = p < parentPrec || (p === parentPrec && right && e.op === '-');
  const body: Seg[] = [
    ...exprSegs(e.l, cids, resolved, p, false),
    { kind: 'text', text: ` ${e.op} ` },
    ...exprSegs(e.r, cids, resolved, p, true),
  ];
  return wrap ? [{ kind: 'text', text: '(' }, ...body, { kind: 'text', text: ')' }] : body;
}

/** 값이 오기 전의 부르기 식 글자. */
function callText(e: Expr, cids: Map<Expr, number>): string {
  return flat(exprSegs(e, cids, new Map()));
}

/** 조각을 한 줄 글자로. */
export function flat(segs: readonly Seg[]): string {
  return segs.map((s) => (s.kind === 'value' ? s.value : s.text)).join('');
}

/** 이웃한 글자 조각을 하나로 잇는다. */
function merge(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (s.kind === 'text' && last !== undefined && last.kind === 'text') {
      out[out.length - 1] = { kind: 'text', text: last.text + s.text };
    } else {
      out.push(s);
    }
  }
  return out;
}

/** 문 하나를 글자 조각으로 찍는다. */
function stmtSegs(s: Stmt, cids: Map<Expr, number>, resolved: Map<Expr, Val>): Seg[] {
  const piece = (text: string): Seg => ({ kind: 'text', text });
  switch (s.k) {
    case 'function': {
      const ps = s.params.map((p) => (typeof p === 'string' ? p : `ref ${p.name}`)).join(', ');
      return [piece(`function ${s.name}(${ps})`)];
    }
    case 'assign':
      return merge([piece(`${s.declare === true ? 'let ' : ''}${s.to} = `), ...exprSegs(s.value, cids, resolved)]);
    case 'expr':
      return merge(exprSegs(s.value, cids, resolved));
    case 'return':
      return merge([piece('return '), ...exprSegs(s.value, cids, resolved)]);
    case 'show':
      return merge([piece('show '), ...exprSegs(s.value, cids, resolved)]);
  }
}

/** 문이 품은 식. */
function stmtExpr(s: Stmt): Expr | null {
  return s.k === 'function' ? null : s.value;
}

/** 부르기 식에 앞에서부터 번호를 붙인다 (바깥 부르기가 먼저). */
function numberCalls(lines: readonly ReturnToCallerLine[]): Map<Expr, number> {
  const cids = new Map<Expr, number>();
  const walk = (e: Expr): void => {
    if ('call' in e) {
      cids.set(e, cids.size);
      e.args.forEach(walk);
    } else if ('op' in e) {
      walk(e.l);
      walk(e.r);
    }
  };
  for (const line of lines) {
    const e = stmtExpr(line.stmt);
    if (e !== null) walk(e);
  }
  return cids;
}

/** 머리줄 `header` 의 몸 — 그 아래로 들여쓰기가 더 깊은 줄들. */
function bodyOf(lines: readonly ReturnToCallerLine[], header: number): number[] {
  const out: number[] = [];
  const base = lines[header]?.indent ?? 0;
  for (let i = header + 1; i < lines.length && (lines[i]?.indent ?? 0) > base; i += 1) {
    if ((lines[i]?.indent ?? 0) === base + 1) out.push(i);
  }
  return out;
}

function lookup(env: Env, name: string): Cell {
  for (let e: Env | null = env; e !== null; e = e.parent) {
    const c = e.vars.get(name);
    if (c !== undefined) return c;
  }
  throw new Error(`return-to-caller: 이름 ${name} 이 없다`);
}

function arith(op: '+' | '-' | '*', a: Val, b: Val): Val {
  if (op === '+' && (typeof a === 'string' || typeof b === 'string')) return `${valueText(a)}${valueText(b)}`;
  if (typeof a !== 'number' || typeof b !== 'number') throw new Error('return-to-caller: 수가 아닌 값의 셈');
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  return a * b;
}

export async function returnToCaller(ctx: FacetContext<ReturnToCallerFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<ReturnToCallerFacetData>;
  const { lines, stepMs } = rc.data;
  const cids = numberCalls(lines);

  // 구조에서 찍은 글자와 화면 글자가 같은지 — 다르면 데이터가 틀렸다
  const initLines = lines.map((line) => {
    const segs = stmtSegs(line.stmt, cids, new Map());
    if (flat(segs) !== line.text) {
      throw new Error(`return-to-caller: 줄 글자가 구조와 다르다 — ${line.text} / ${flat(segs)}`);
    }
    return { indent: line.indent, segs };
  });

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  const global: Env = { vars: new Map(), parent: null };
  const top: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined || line.indent !== 0) continue;
    if (line.stmt.k === 'function') global.vars.set(line.stmt.name, { value: { fn: i } });
    else top.push(i);
  }

  /** 부르기 하나 — 부름 걸음, 몸, 돌아옴 걸음. 돌려준 값과 그 return 줄. */
  async function invoke(
    e: Extract<Expr, { call: string }>,
    lineIdx: number,
    env: Env,
    depth: number,
    resolved: Map<Expr, Val>,
  ): Promise<Val | Halt> {
    const argVals: Val[] = [];
    for (const a of e.args) {
      if (rc.cancelled) return HALT;
      const v = await evaluate(a, lineIdx, env, depth, resolved);
      if (v === HALT) return HALT;
      argVals.push(v);
    }
    const target = lookup(env, e.call).value;
    if (!isFn(target)) throw new Error(`return-to-caller: ${e.call} 은 함수가 아니다`);
    const header = lines[target.fn];
    if (header === undefined || header.stmt.k !== 'function') throw new Error('return-to-caller: 머리줄이 아니다');
    const frame: Env = { vars: new Map(), parent: global };
    const args = header.stmt.params.map((p, i) => {
      const v = argVals[i] ?? null;
      if (typeof p === 'string') {
        frame.vars.set(p, { value: v });
      } else {
        const arg = e.args[i];
        if (arg === undefined || !('var' in arg)) throw new Error('return-to-caller: ref 인자에는 변수 이름만 온다');
        frame.vars.set(p.name, lookup(env, arg.var));
      }
      return { param: paramName(p), value: valueText(v) };
    });
    const cid = cids.get(e) ?? -1;
    await rc.emit({ type: 'call', payload: { line: lineIdx, cid, header: target.fn, depth, args } });
    if (!(await pause())) return HALT;

    const res = await runBody(target.fn, frame, depth + 1, cid);
    if (res === HALT) return HALT;
    resolved.set(e, res.value);
    const segs = stmtSegs(lines[lineIdx]!.stmt, cids, resolved);
    await rc.emit({
      type: 'arrive',
      payload: { line: lineIdx, cid, value: valueText(res.value), from: res.from, segs, depth },
    });
    if (!(await pause())) return HALT;
    return res.value;
  }

  async function evaluate(e: Expr, lineIdx: number, env: Env, depth: number, resolved: Map<Expr, Val>): Promise<Val | Halt> {
    if ('num' in e) return e.num;
    if ('str' in e) return e.str;
    if ('var' in e) return lookup(env, e.var).value;
    if ('op' in e) {
      const l = await evaluate(e.l, lineIdx, env, depth, resolved);
      if (l === HALT) return HALT;
      const r = await evaluate(e.r, lineIdx, env, depth, resolved);
      if (r === HALT) return HALT;
      return arith(e.op, l, r);
    }
    return invoke(e, lineIdx, env, depth, resolved);
  }

  /** 문 하나. 돌려줌이면 { value }, 아니면 null. */
  async function exec(lineIdx: number, env: Env, depth: number, cid: number): Promise<{ value: Val } | null | Halt> {
    const s = lines[lineIdx]!.stmt;
    if (s.k === 'function') {
      env.vars.set(s.name, { value: { fn: lineIdx } });
      return null;
    }
    const resolved = new Map<Expr, Val>();
    const v = await evaluate(s.value, lineIdx, env, depth, resolved);
    if (v === HALT) return HALT;
    const expr = flat(exprSegs(s.value, cids, resolved));
    switch (s.k) {
      case 'expr':
        return null;
      case 'assign': {
        if (s.declare === true) env.vars.set(s.to, { value: v });
        else lookup(env, s.to).value = v;
        await rc.emit({ type: 'assign', payload: { line: lineIdx, name: s.to, value: valueText(v), expr, depth } });
        if (!(await pause())) return HALT;
        return null;
      }
      case 'show': {
        await rc.emit({ type: 'show', payload: { line: lineIdx, value: valueText(v), expr, depth } });
        if (!(await pause())) return HALT;
        return null;
      }
      case 'return': {
        await rc.emit({ type: 'return', payload: { line: lineIdx, cid, value: valueText(v), expr, depth } });
        if (!(await pause())) return HALT;
        return { value: v };
      }
    }
  }

  async function runBody(header: number, frame: Env, depth: number, cid: number): Promise<{ value: Val; from: number } | Halt> {
    for (const i of bodyOf(lines, header)) {
      if (rc.cancelled) return HALT;
      const r = await exec(i, frame, depth, cid);
      if (r === HALT) return HALT;
      if (r !== null) return { value: r.value, from: i };
    }
    return { value: null, from: -1 };
  }

  // 걸음 0 — 프로그램 전체가 읽을 거리라 첫 발신 뒤에 stepMs 를 둔다
  await rc.emit({ type: 'init', payload: { lines: initLines, calls: cids.size } });
  if (!(await pause())) return;

  for (const i of top) {
    if (rc.cancelled) return;
    const r = await exec(i, global, 0, -1);
    if (r === HALT) return;
  }
}
