/**
 * closure-captures — 함수가 만들어진 자리가 끝나도, 그 함수가 쓰던 바깥 변수는 산다.
 *
 * `initialData.lines` 의 줄 구조를 작은 해석기로 밟는다. 밟는 차례 · 자리 · 값 · 틀이
 * 걷힐 때 살아남는 자리는 전부 여기서 셈한다. 장면은 이 발신을 잇기만 한다.
 *
 * 걸음 규약 (줄 걸음):
 *  - 걸음 0 = 시작. 발신이 없다 — 장면의 `initial` 이 코드를 세운다. 첫 발신 앞에 stepMs 를 두어 읽을 틈을 준다
 *  - 맨 바깥 `function` 줄은 밟지 않는다. 몸 안의 `function` 줄은 밟는다 (`make`)
 *  - 부르기가 없는 문 하나 = `stmt` 한 걸음
 *  - 부르기마다 `call` 한 걸음과 `arrive` 한 걸음. 문의 마무리는 마지막 `arrive` 의 `then` 에 실린다
 *  - 이름 없는 함수의 몸 = 그 함수가 적힌 줄의 `stmt`(k: 'return') 한 걸음
 *
 * 값 `Val` = `{ t: 'num', n }` | `{ t: 'str', s }` | `{ t: 'fn', fn: 함수 번호, name }` | `{ t: 'none' }`
 *
 * 이벤트 (silent 없음 — 전부 걸음이다):
 *  - `call`   { line, callee, as, frame, depth, fn: 함수 번호 | null(맨 바깥 함수),
 *               args: { param, slot, value: Val, ref }[] }
 *             depth 는 새 틀의 깊이 (맨 바깥 = 0)
 *  - `make`   { line, fn, name, owner: 틀 번호 | null, depth, captures: 자리 번호[] }
 *             몸 안의 함수가 만들어졌다. captures 는 그 몸이 쓰는 바깥 자리
 *  - `stmt`   Then & { line, depth }
 *  - `arrive` { line, callee, as, frame, depth, value: Val,
 *               kept: { slot, by: 함수 번호 }[], keptFns: 함수 번호[], then: Then | null }
 *             frame 틀이 걷혔다. kept 는 그 틀의 자리 가운데 살아남은 것과 그것을 붙잡은 함수
 *
 * Then =
 *  | { k: 'set', slot, name, declare, owner: 틀 번호 | null, value: Val, was: Val }
 *  | { k: 'show', value: Val }
 *  | { k: 'return', value: Val, srcSlot: 자리 번호 | null }
 *  | { k: 'expr' }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CcExpr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { op: '+' | '-' | '*'; l: CcExpr; r: CcExpr }
  | { call: string; args: CcExpr[] }
  | { lambda: string[]; body: CcExpr };

export type CcParam = string | { name: string; ref: true };

export type CcStmt =
  | { k: 'function'; name: string; params: CcParam[] }
  | { k: 'assign'; to: string; value: CcExpr; declare?: boolean }
  | { k: 'expr'; value: CcExpr }
  | { k: 'return'; value: CcExpr }
  | { k: 'show'; value: CcExpr };

export type CcSourceLine = { indent: number; text: string; stmt: CcStmt };

export type ClosureCapturesFacetData = {
  type: 'closure-captures';
  stepMs: number;
  lines: CcSourceLine[];
};

export type CcValue =
  | { t: 'num'; n: number }
  | { t: 'str'; s: string }
  | { t: 'fn'; fn: number; name: string }
  | { t: 'none' };

type Slot = { id: number; name: string; value: RVal; owner: number | null };
type Env = { vars: Map<string, Slot>; parent: Env | null };
type Body = { kind: 'lines'; from: number; to: number; indent: number } | { kind: 'expr'; expr: CcExpr; line: number };
type FnV = {
  kind: 'fn';
  id: number;
  name: string;
  params: CcParam[];
  env: Env;
  body: Body;
  top: boolean;
  captures: Slot[];
};
type RVal = number | string | FnV | undefined;
type Frame = { id: number; env: Env; slots: Slot[]; fns: FnV[] };

type Then =
  | { k: 'set'; slot: number; name: string; declare: boolean; owner: number | null; value: CcValue; was: CcValue }
  | { k: 'show'; value: CcValue }
  | { k: 'return'; value: CcValue; srcSlot: number | null }
  | { k: 'expr' };

type Arrive = {
  line: number;
  callee: string;
  as: string;
  frame: number;
  depth: number;
  value: CcValue;
  kept: { slot: number; by: number }[];
  keptFns: number[];
  then: Then | null;
};

const CANCELLED = new Error('closure-captures: cancelled');

function paramName(p: CcParam): string {
  return typeof p === 'string' ? p : p.name;
}

function isRef(p: CcParam): boolean {
  return typeof p !== 'string' && p.ref === true;
}

function toValue(v: RVal): CcValue {
  if (typeof v === 'number') return { t: 'num', n: v };
  if (typeof v === 'string') return { t: 'str', s: v };
  if (v === undefined) return { t: 'none' };
  return { t: 'fn', fn: v.id, name: v.name };
}

function lookup(env: Env, name: string): Slot {
  for (let e: Env | null = env; e; e = e.parent) {
    const s = e.vars.get(name);
    if (s) return s;
  }
  throw new Error(`closure-captures: 이름 ${name} 을 찾지 못했다`);
}

/** 식이 부르는 이름과 읽는 이름. 이름 없는 함수의 몸도 들어간다 (그 몸도 바깥 이름을 쓴다). */
function namesIn(e: CcExpr, out: Set<string>, bound: Set<string>): void {
  if ('var' in e) {
    if (!bound.has(e.var)) out.add(e.var);
  } else if ('op' in e) {
    namesIn(e.l, out, bound);
    namesIn(e.r, out, bound);
  } else if ('call' in e) {
    if (!bound.has(e.call)) out.add(e.call);
    for (const a of e.args) namesIn(a, out, bound);
  } else if ('lambda' in e) {
    namesIn(e.body, out, new Set([...bound, ...e.lambda]));
  }
}

export async function closureCaptures(ctx0: FacetContext<ClosureCapturesFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<ClosureCapturesFacetData>;
  const { lines, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let nextSlot = 1;
  let nextFn = 1;
  let nextFrame = 1;
  const globals: Env = { vars: new Map(), parent: null };
  const active: Frame[] = [];
  let pending: Arrive | null = null;

  function bodyEnd(i: number): number {
    let j = i + 1;
    while (j < lines.length && lines[j]!.indent > lines[i]!.indent) j += 1;
    return j;
  }

  /** 몸이 쓰는 바깥 자리 — 몸 안에서 선언하거나 인자로 받은 이름은 뺀다. 맨 바깥 자리는 붙잡지 않는다. */
  function capturesOf(from: number, to: number, params: CcParam[], env: Env): Slot[] {
    const bound = new Set(params.map(paramName));
    const used = new Set<string>();
    for (let i = from; i < to; i += 1) {
      const s = lines[i]!.stmt;
      if (s.k === 'function') {
        bound.add(s.name);
        for (const p of s.params) bound.add(paramName(p));
      } else if (s.k === 'assign' && s.declare) bound.add(s.to);
    }
    for (let i = from; i < to; i += 1) {
      const s = lines[i]!.stmt;
      if (s.k === 'assign') {
        if (!bound.has(s.to)) used.add(s.to);
        namesIn(s.value, used, bound);
      } else if (s.k !== 'function') namesIn(s.value, used, bound);
    }
    const out: Slot[] = [];
    for (const name of used) {
      const slot = lookup(env, name);
      if (slot.owner !== null) out.push(slot);
    }
    return out;
  }

  async function flush(): Promise<void> {
    if (!pending) return;
    const p = pending;
    pending = null;
    await ctx.emit({ type: 'arrive', payload: p });
    if (!(await pause())) throw CANCELLED;
  }

  /** 문의 마무리 — 부르기가 있었으면 마지막 돌아옴 걸음에 얹고, 없었으면 제 걸음이 된다. */
  async function settle(then: Then, line: number, depth: number): Promise<void> {
    if (pending) {
      pending.then = then;
      await flush();
      return;
    }
    await ctx.emit({ type: 'stmt', payload: { ...then, line, depth } });
    if (!(await pause())) throw CANCELLED;
  }

  /** 틀이 걷힐 때 살아남는 것 — 돌려준 값과 아직 선 틀들에서 닿는 함수, 그 함수가 붙잡은 자리. */
  function survivors(frame: Frame, ret: RVal): { kept: { slot: number; by: number }[]; keptFns: number[] } {
    const fns = new Set<FnV>();
    const by = new Map<Slot, FnV>();
    const seen = new Set<Slot>();
    const visitVal = (v: RVal): void => {
      if (typeof v !== 'object' || fns.has(v)) return;
      fns.add(v);
      for (const s of v.captures) {
        if (!by.has(s)) by.set(s, v);
        visitSlot(s);
      }
    };
    const visitSlot = (s: Slot): void => {
      if (seen.has(s)) return;
      seen.add(s);
      visitVal(s.value);
    };
    visitVal(ret);
    for (const f of active) {
      for (let e: Env | null = f.env; e; e = e.parent) for (const s of e.vars.values()) visitSlot(s);
    }
    for (const s of globals.vars.values()) visitSlot(s);
    const kept: { slot: number; by: number }[] = [];
    for (const s of frame.slots) {
      const f = by.get(s);
      if (f) kept.push({ slot: s.id, by: f.id });
    }
    return { kept, keptFns: frame.fns.filter((f) => fns.has(f)).map((f) => f.id) };
  }

  async function callFn(f: FnV, as: string, args: (RVal | Slot)[], line: number, depth: number): Promise<RVal> {
    await flush();
    const frame: Frame = { id: nextFrame, env: { vars: new Map(), parent: f.env }, slots: [], fns: [] };
    nextFrame += 1;
    const info: { param: string; slot: number; value: CcValue; ref: boolean }[] = [];
    f.params.forEach((p, k) => {
      const a = args[k];
      let slot: Slot;
      if (isRef(p) && typeof a === 'object' && 'owner' in a) slot = a;
      else {
        slot = { id: nextSlot, name: paramName(p), value: a as RVal, owner: frame.id };
        nextSlot += 1;
        frame.slots.push(slot);
      }
      frame.env.vars.set(paramName(p), slot);
      info.push({ param: paramName(p), slot: slot.id, value: toValue(slot.value), ref: isRef(p) });
    });
    await ctx.emit({
      type: 'call',
      payload: { line, callee: f.name, as, frame: frame.id, depth: depth + 1, fn: f.top ? null : f.id, args: info },
    });
    if (!(await pause())) throw CANCELLED;
    active.push(frame);
    let ret: RVal;
    if (f.body.kind === 'expr') {
      ret = await evalE(f.body.expr, frame.env, depth + 1, f.body.line, frame);
      await settle({ k: 'return', value: toValue(ret), srcSlot: null }, f.body.line, depth + 1);
    } else {
      ret = await execBlock(f.body.from, f.body.to, f.body.indent, frame.env, depth + 1, frame);
    }
    active.pop();
    const { kept, keptFns } = survivors(frame, ret);
    pending = { line, callee: f.name, as, frame: frame.id, depth, value: toValue(ret), kept, keptFns, then: null };
    return ret;
  }

  async function evalE(e: CcExpr, env: Env, depth: number, line: number, frame: Frame | null): Promise<RVal> {
    if ('num' in e) return e.num;
    if ('str' in e) return e.str;
    if ('var' in e) return lookup(env, e.var).value;
    if ('op' in e) {
      const l = await evalE(e.l, env, depth, line, frame);
      const r = await evalE(e.r, env, depth, line, frame);
      if (e.op === '+' && (typeof l === 'string' || typeof r === 'string')) return `${String(l)}${String(r)}`;
      if (typeof l !== 'number' || typeof r !== 'number') throw new Error('closure-captures: 수가 아닌 셈');
      if (e.op === '+') return l + r;
      if (e.op === '-') return l - r;
      return l * r;
    }
    if ('lambda' in e) {
      const fn: FnV = {
        kind: 'fn',
        id: nextFn,
        name: '',
        params: e.lambda,
        env,
        body: { kind: 'expr', expr: e.body, line },
        top: false,
        captures: [],
      };
      nextFn += 1;
      const used = new Set<string>();
      namesIn(e.body, used, new Set(e.lambda));
      for (const name of used) {
        const s = lookup(env, name);
        if (s.owner !== null) fn.captures.push(s);
      }
      if (frame) frame.fns.push(fn);
      return fn;
    }
    const target = lookup(env, e.call).value;
    if (typeof target !== 'object') throw new Error(`closure-captures: ${e.call} 은 함수가 아니다`);
    const args: (RVal | Slot)[] = [];
    for (let k = 0; k < e.args.length; k += 1) {
      if (ctx.cancelled) throw CANCELLED;
      const a = e.args[k]!;
      const p = target.params[k];
      if (p !== undefined && isRef(p) && 'var' in a) args.push(lookup(env, a.var));
      else args.push(await evalE(a, env, depth, line, frame));
    }
    return callFn(target, e.call, args, line, depth);
  }

  async function execBlock(from: number, to: number, indent: number, env: Env, depth: number, frame: Frame | null): Promise<RVal> {
    for (let i = from; i < to; i += 1) {
      if (ctx.cancelled) throw CANCELLED;
      const ln = lines[i]!;
      if (ln.indent !== indent) continue;
      const s = ln.stmt;
      if (s.k === 'function') {
        if (frame === null) continue;
        const end = bodyEnd(i);
        const fn: FnV = {
          kind: 'fn',
          id: nextFn,
          name: s.name,
          params: s.params,
          env,
          body: { kind: 'lines', from: i + 1, to: end, indent: indent + 1 },
          top: false,
          captures: [],
        };
        nextFn += 1;
        const self: Slot = { id: nextSlot, name: s.name, value: fn, owner: frame.id };
        nextSlot += 1;
        env.vars.set(s.name, self);
        fn.captures = capturesOf(i + 1, end, s.params, env);
        frame.fns.push(fn);
        await ctx.emit({
          type: 'make',
          payload: { line: i, fn: fn.id, name: s.name, owner: frame.id, depth, captures: fn.captures.map((c) => c.id) },
        });
        if (!(await pause())) throw CANCELLED;
      } else if (s.k === 'assign') {
        const v = await evalE(s.value, env, depth, i, frame);
        let slot: Slot;
        let was: RVal;
        if (s.declare) {
          slot = { id: nextSlot, name: s.to, value: v, owner: frame ? frame.id : null };
          nextSlot += 1;
          env.vars.set(s.to, slot);
          if (frame) frame.slots.push(slot);
        } else {
          slot = lookup(env, s.to);
          was = slot.value;
          slot.value = v;
        }
        await settle(
          {
            k: 'set',
            slot: slot.id,
            name: s.to,
            declare: s.declare === true,
            owner: slot.owner,
            value: toValue(v),
            was: toValue(was),
          },
          i,
          depth,
        );
      } else if (s.k === 'expr') {
        await evalE(s.value, env, depth, i, frame);
        await settle({ k: 'expr' }, i, depth);
      } else if (s.k === 'show') {
        const v = await evalE(s.value, env, depth, i, frame);
        await settle({ k: 'show', value: toValue(v) }, i, depth);
      } else {
        const v = await evalE(s.value, env, depth, i, frame);
        const src = 'var' in s.value && typeof v !== 'object' ? lookup(env, s.value.var).id : null;
        await settle({ k: 'return', value: toValue(v), srcSlot: src }, i, depth);
        return v;
      }
    }
    return undefined;
  }

  // 맨 바깥 함수는 시작 전에 이미 있다.
  lines.forEach((ln, i) => {
    const s = ln.stmt;
    if (ln.indent !== 0 || s.k !== 'function') return;
    const fn: FnV = {
      kind: 'fn',
      id: nextFn,
      name: s.name,
      params: s.params,
      env: globals,
      body: { kind: 'lines', from: i + 1, to: bodyEnd(i), indent: 1 },
      top: true,
      captures: [],
    };
    nextFn += 1;
    globals.vars.set(s.name, { id: nextSlot, name: s.name, value: fn, owner: null });
    nextSlot += 1;
  });

  // 걸음 0 은 프로그램 전체가 보이는 화면이다 — 첫 발신 앞에 읽을 틈을 둔다.
  if (!(await pause())) return;
  try {
    await execBlock(0, lines.length, 0, globals, 0, null);
  } catch (e) {
    if (e === CANCELLED) return;
    throw e;
  }
}
