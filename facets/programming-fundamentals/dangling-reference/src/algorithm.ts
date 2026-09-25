/**
 * dangling-reference 알고리즘 — 가리키던 변수가 먼저 사라지면 그 주소를 든 변수는 무엇을 가리키는가.
 *
 * `initialData.lines` 의 줄 구조를 해석해 줄 걸음을 낸다. 걸음표를 손으로 적지 않는다 —
 * 밟는 차례 · 자리 주소 · 값 · 걷히는 이름은 전부 이 해석이 셈한다.
 *
 * 모형 (공통 안내문의 "이름 · 자리 · 주소"):
 * - 이름마다 자리 하나. `let` 줄은 오른쪽 식을 셈하기 **전에** 자리를 잡는다.
 * - 자리 주소는 100 부터 하나씩 쌓는다. 함수가 돌아오면 그 틀이 잡은 자리를 걷고, 다음에 잡는 자리가
 *   그 주소를 다시 쓴다. 걷힌 자리의 내용은 지우지 않는다.
 * - 이름 찾기는 지금 틀 → 맨 바깥 순서.
 * - `address(x)` 는 x 의 자리 주소, `valueAt(p)` 는 p 안의 주소에 든 내용. 둘 다 틀을 세우지 않는 내장이다.
 *
 * 걸음: 시작이 걸음 0. 밟은 줄 하나가 한 걸음. `function` 줄은 밟지 않는다. 부르기가 든 줄은 부르는 걸음과
 * 돌아와 마무리하는 걸음 둘을 갖고, 틀이 걷히는 것은 그 마무리 걸음이 가진다.
 *
 * 값 `Val` = `{ num: number }` (수) | `{ addr: number }` (주소) | `null` (빈 자리).
 *
 * 이벤트 (`init` 만 silent — 나머지는 하나가 한 걸음. 걸음 0 은 장면의 initial 이 바탕을 채운 시작 화면):
 * - `init`   { lines: { indent: number; text: string }[]; fns: string[] }   — silent. 바탕을 다시 정한다. fns 는 정의된 함수 이름 (정의 차례)
 * - `call`   { line: number; fn: string; base: number; slot: { name: string; addr: number } | null }
 *            — 부르는 걸음. base 는 새 틀이 처음 잡을 주소. slot 은 이 줄의 `let` 이 먼저 잡은 자리
 * - `assign` { line: number; fn: string | null; name: string; addr: number; value: Val; declare: boolean }
 *            — fn 은 그 자리를 가진 틀 (맨 바깥이면 null)
 * - `return` { line: number; fn: string; value: Val }
 * - `back`   { line: number; fn: string; gone: { name: string; addr: number }[]; to: { name: string; addr: number } | null; value: Val }
 *            — 돌아와 마무리하는 걸음. gone 은 걷힌 이름과 자리, to 는 돌려받은 값이 들어간 자리
 * - `show`   { line: number; value: Val; deref: { name: string; slot: number; addr: number } | null }
 *            — deref 는 `valueAt(이름)` 으로 따라간 읽기 (이름 · 그 이름의 자리 · 따라간 주소)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Expr =
  | { num: number }
  | { var: string }
  | { op: '+' | '-' | '*'; l: Expr; r: Expr }
  | { call: string; args: Expr[] };

export type Stmt =
  | { k: 'def'; name: string; params: string[] }
  | { k: 'assign'; to: string; value: Expr; declare?: boolean }
  | { k: 'return'; value: Expr }
  | { k: 'expr'; value: Expr }
  | { k: 'show'; value: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type DanglingReferenceFacetData = {
  type: 'dangling-reference';
  lines: CodeLine[];
  stepMs: number;
};

export type Val = { num: number } | { addr: number } | null;

type Frame = { fn: string | null; names: Map<string, number>; order: string[] };

type Deref = { name: string; slot: number; addr: number };

export async function danglingReference(context: FacetContext<DanglingReferenceFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<DanglingReferenceFacetData>;
  const { lines, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const mem = new Map<number, Val>();
  let sp = 100;
  const frames: Frame[] = [{ fn: null, names: new Map(), order: [] }];
  const defs = new Map<string, number>();
  lines.forEach((ln, i) => {
    if (ln.stmt.k === 'def') defs.set(ln.stmt.name, i);
  });

  const top = (): Frame => frames[frames.length - 1];
  const lookup = (name: string): number => {
    const own = top().names.get(name);
    if (own !== undefined) return own;
    const outer = frames[0].names.get(name);
    if (outer !== undefined) return outer;
    throw new Error(`dangling-reference: 모르는 이름 ${name}`);
  };
  const alloc = (name: string): number => {
    const addr = sp;
    sp += 1;
    top().names.set(name, addr);
    top().order.push(name);
    return addr;
  };

  /** 부르기가 없는 식을 셈한다. valueAt 으로 따라간 읽기는 derefs 에 남긴다. */
  function evaluate(e: Expr, derefs: Deref[]): Val {
    if ('num' in e) return { num: e.num };
    if ('var' in e) return mem.get(lookup(e.var)) ?? null;
    if ('op' in e) {
      const l = evaluate(e.l, derefs);
      const r = evaluate(e.r, derefs);
      if (!l || !r || !('num' in l) || !('num' in r)) return null;
      const n = e.op === '+' ? l.num + r.num : e.op === '-' ? l.num - r.num : l.num * r.num;
      return { num: n };
    }
    const arg = e.args[0];
    if (e.call === 'address' && arg && 'var' in arg) return { addr: lookup(arg.var) };
    if (e.call === 'valueAt' && arg && 'var' in arg) {
      const slot = lookup(arg.var);
      const held = mem.get(slot);
      if (!held || !('addr' in held)) return null;
      derefs.push({ name: arg.var, slot, addr: held.addr });
      return mem.get(held.addr) ?? null;
    }
    throw new Error(`dangling-reference: 셈할 수 없는 식 ${e.call}`);
  }

  const userCall = (e: Expr): string | null => ('call' in e && defs.has(e.call) ? e.call : null);

  /** 함수 몸을 밟는다. 돌려준 값을 내놓는다. 취소되면 undefined. */
  async function runBody(fn: string): Promise<Val | undefined> {
    const head = defs.get(fn) ?? -1;
    const depth = lines[head].indent;
    let result: Val = null;
    for (let i = head + 1; i < lines.length && lines[i].indent > depth; i += 1) {
      if (!(await pause())) return undefined;
      const out = await execLine(i);
      if (out === undefined) return undefined;
      if (out.returned) {
        result = out.value;
        break;
      }
    }
    return result;
  }

  /** 한 줄을 밟는다 (부르기가 들면 몸의 걸음까지). 취소되면 undefined. */
  async function execLine(i: number): Promise<{ returned: boolean; value: Val } | undefined> {
    const s = lines[i].stmt;
    const fnHere = top().fn;
    if (s.k === 'def') return { returned: false, value: null };

    const value = s.k === 'assign' || s.k === 'expr' ? s.value : null;
    const callee = value ? userCall(value) : null;
    if (callee !== null && (s.k === 'assign' || s.k === 'expr')) {
      const slot = s.k === 'assign' && s.declare ? { name: s.to, addr: alloc(s.to) } : null;
      await ctx.emit({ type: 'call', payload: { line: i, fn: callee, base: sp, slot } });
      frames.push({ fn: callee, names: new Map(), order: [] });
      const got = await runBody(callee);
      if (got === undefined) return undefined;
      const frame = frames.pop() as Frame;
      const gone = frame.order.map((name) => ({ name, addr: frame.names.get(name) as number }));
      sp -= gone.length;
      if (!(await pause())) return undefined;
      let to: { name: string; addr: number } | null = null;
      if (s.k === 'assign') {
        const addr = slot ? slot.addr : lookup(s.to);
        mem.set(addr, got);
        to = { name: s.to, addr };
      }
      await ctx.emit({ type: 'back', payload: { line: i, fn: callee, gone, to, value: got } });
      return { returned: false, value: null };
    }

    const derefs: Deref[] = [];
    if (s.k === 'assign') {
      const addr = s.declare ? alloc(s.to) : lookup(s.to);
      const v = evaluate(s.value, derefs);
      mem.set(addr, v);
      await ctx.emit({
        type: 'assign',
        payload: { line: i, fn: fnHere, name: s.to, addr, value: v, declare: s.declare === true },
      });
      return { returned: false, value: null };
    }
    if (s.k === 'return') {
      const v = evaluate(s.value, derefs);
      await ctx.emit({ type: 'return', payload: { line: i, fn: fnHere ?? '', value: v } });
      return { returned: true, value: v };
    }
    if (s.k === 'show') {
      const v = evaluate(s.value, derefs);
      await ctx.emit({ type: 'show', payload: { line: i, value: v, deref: derefs[0] ?? null } });
      return { returned: false, value: null };
    }
    evaluate(s.value, derefs);
    return { returned: false, value: null };
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      lines: lines.map((ln) => ({ indent: ln.indent, text: ln.text })),
      fns: [...defs.keys()],
    },
  });

  for (let i = 0; i < lines.length; i += 1) {
    if (ctx.cancelled) return;
    if (lines[i].indent > 0 || lines[i].stmt.k === 'def') continue;
    if (!(await pause())) return;
    if ((await execLine(i)) === undefined) return;
  }
}
