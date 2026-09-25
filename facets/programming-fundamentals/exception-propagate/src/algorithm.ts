/**
 * 예외 전파 — 줄 구조를 해석하며 밟는다.
 *
 * 1차 데이터는 줄 목록이다. 줄마다 화면 글자(text)와 그 줄이 하는 일의 구조(stmt)가 있고,
 * 밟는 차례 · 변수 값 · 조건의 참거짓 · 예외가 닿는 자리는 여기 작은 해석기가 셈한다.
 * 걸음표를 손으로 적지 않는다.
 *
 * 걸음 (줄 걸음)
 *   - 걸음 0 = 시작(`init`). 아무 줄도 밟지 않았다
 *   - 밟은 줄 하나 = 한 걸음. 조건 셈은 머리줄 걸음 안에서 일어난다
 *   - `function` · `else` 줄은 밟지 않는다. `try` 는 들어갈 때, `catch` 는 잡을 때 밟는다
 *   - 부르기가 든 줄: 부르는 걸음 하나(`call`) + 돌아와 마무리하는 걸음 하나
 *   - `throw` 줄 한 걸음(`throw`). 예외가 틀을 떠나 부른 줄에 닿을 때마다 한 걸음(`arrive`)
 *
 * 이벤트 (전부 silent 아님 — 하나가 한 걸음. 줄 번호 `line` 은 0 부터 센 줄 자리)
 *   init    { lines: { indent: number; text: string; k: string; name: string | null;
 *                      params: string[]; calls: string[] }[] }
 *           걸음 0. 줄 구조를 장면이 베낄 수 있는 모양으로 넘긴다
 *   enter   { line }                                   try 몸으로 들어간다
 *   call    { line; fn: string; args: Value[] }        부르는 걸음 — 피호출 틀이 선다
 *   test    { line; value: boolean }                   if · else if · while 조건을 셈했다
 *   assign  { line; to: string; value: Value }         값을 이름에 묶었다
 *   show    { line; out: string }                      출력 목록에 한 줄 (`show 값`)
 *   line    { line }                                   그 밖의 줄 (값 없는 식 한 줄)
 *   return  { line; value: Value }                     함수가 값을 들고 돌아간다 — 틀이 걷힌다
 *   throw   { line; error: string; skipped: number[] } throw 줄 — 예외가 선다
 *   arrive  { line; error: string; left: string; skipped: number[]; caught: boolean }
 *           예외가 `left` 틀을 떠나 부른 줄 `line` 에 닿았다. `skipped` = 떠난 틀에서 밟지
 *           않게 된 남은 줄. `caught` = 닿은 자리가 이름이 맞는 catch 를 가진 try 몸 안인가
 *   catch   { line; error: string; skipped: number[] }
 *           catch 줄이 잡았다. `skipped` = try 몸에서 밟지 않게 된 남은 줄
 *
 *   Value = number | string | null
 *
 * throw 의 `skipped` 는 비어 있다 — 남은 줄은 예외가 그 틀을 떠날 때(arrive) 정해진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Value = number | string | null;

export type Op = '+' | '-' | '*' | '<' | '<=' | '>' | '>=' | '==' | '!=';

export type Expr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { op: Op; l: Expr; r: Expr }
  | { call: string; args: Expr[] };

export type Stmt =
  | { k: 'assign'; to: string; value: Expr; declare?: boolean }
  | { k: 'expr'; value: Expr }
  | { k: 'show'; value: Expr }
  | { k: 'if'; cond: Expr }
  | { k: 'elseIf'; cond: Expr }
  | { k: 'while'; cond: Expr }
  | { k: 'else' }
  | { k: 'function'; name: string; params: string[] }
  | { k: 'return'; value?: Expr }
  | { k: 'throw'; error: string }
  | { k: 'try' }
  | { k: 'catch'; error: string };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type ExceptionPropagateFacetData = {
  type: 'exception-propagate';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  lines: CodeLine[];
};

/** 예외 — `at` 은 그 예외가 지금 걸려 있는 줄(지금 틀 안의 자리). */
class Thrown {
  constructor(
    readonly name: string,
    public at: number,
  ) {}
}
class Returned {
  constructor(readonly value: Value) {}
}
/** 취소 — 해석을 통째로 빠져나간다. */
class Halt {}

type Frame = { fn: string; def: number; vars: Map<string, Value>; handlers: string[][] };

function callsIn(e: Expr, out: string[]): string[] {
  if ('op' in e) {
    callsIn(e.l, out);
    callsIn(e.r, out);
  } else if ('call' in e) {
    out.push(e.call);
    for (const a of e.args) callsIn(a, out);
  }
  return out;
}

function stmtCalls(st: Stmt): string[] {
  if (st.k === 'assign' || st.k === 'expr' || st.k === 'show') return callsIn(st.value, []);
  if (st.k === 'if' || st.k === 'elseIf' || st.k === 'while') return callsIn(st.cond, []);
  if (st.k === 'return' && st.value !== undefined) return callsIn(st.value, []);
  return [];
}

function show(v: Value): string {
  return v === null ? 'null' : String(v);
}

export async function exceptionPropagate(
  context: FacetContext<ExceptionPropagateFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<ExceptionPropagateFacetData>;
  const { lines, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }
  /** 걸음 사이 문. 닫히면 해석을 통째로 빠져나간다. */
  async function gate(): Promise<void> {
    if (!(await pause())) throw new Halt();
  }

  const defs = new Map<string, number>();
  lines.forEach((l, i) => {
    if (l.stmt.k === 'function') defs.set(l.stmt.name, i);
  });

  /** 머리줄 i 의 몸 — 한 칸 깊은 형제 줄들. */
  function body(i: number): number[] {
    const ind = lines[i].indent;
    const out: number[] = [];
    for (let j = i + 1; j < lines.length && lines[j].indent > ind; j += 1) {
      if (lines[j].indent === ind + 1) out.push(j);
    }
    return out;
  }
  /** 머리줄 i 가 거느린 줄 전체의 마지막 자리. */
  function blockEnd(i: number): number {
    const ind = lines[i].indent;
    let j = i;
    while (j + 1 < lines.length && lines[j + 1].indent > ind) j += 1;
    return j;
  }
  /** (from, to] 안에서 밟을 수 있었던 줄. */
  function rest(from: number, to: number): number[] {
    const out: number[] = [];
    for (let j = from + 1; j <= to; j += 1) {
      if (lines[j].stmt.k !== 'function') out.push(j);
    }
    return out;
  }

  const top: Frame = { fn: '', def: -1, vars: new Map(), handlers: [] };
  const frames: Frame[] = [top];
  const cur = (): Frame => frames[frames.length - 1];

  function lookup(name: string): Value {
    const v = cur().vars.get(name);
    return v === undefined ? null : v;
  }

  async function evaluate(e: Expr, line: number): Promise<Value> {
    if ('num' in e) return e.num;
    if ('str' in e) return e.str;
    if ('var' in e) return lookup(e.var);
    if ('op' in e) {
      const a = await evaluate(e.l, line);
      const b = await evaluate(e.r, line);
      const x = Number(a);
      const y = Number(b);
      switch (e.op) {
        case '+':
          return typeof a === 'string' || typeof b === 'string' ? show(a) + show(b) : x + y;
        case '-':
          return x - y;
        case '*':
          return x * y;
        case '<':
          return x < y ? 1 : 0;
        case '<=':
          return x <= y ? 1 : 0;
        case '>':
          return x > y ? 1 : 0;
        case '>=':
          return x >= y ? 1 : 0;
        case '==':
          return a === b ? 1 : 0;
        case '!=':
          return a !== b ? 1 : 0;
      }
    }
    const args: Value[] = [];
    for (const a of e.args) {
      if (ctx.cancelled) throw new Halt();
      args.push(await evaluate(a, line));
    }
    return invoke(e.call, args, line);
  }

  async function invoke(name: string, args: Value[], line: number): Promise<Value> {
    const di = defs.get(name);
    if (di === undefined) return null;
    const st = lines[di].stmt;
    const params = st.k === 'function' ? st.params : [];
    await gate();
    await ctx.emit({ type: 'call', payload: { line, fn: name, args } });
    const vars = new Map<string, Value>();
    params.forEach((p, i) => vars.set(p, i < args.length ? args[i] : null));
    frames.push({ fn: name, def: di, vars, handlers: [] });
    try {
      await run(body(di));
      frames.pop();
      return null;
    } catch (x) {
      if (x instanceof Returned) {
        frames.pop();
        return x.value;
      }
      if (!(x instanceof Thrown)) throw x;
      frames.pop();
      const skipped = rest(x.at, blockEnd(di));
      x.at = line;
      const caught = cur().handlers.some((h) => h.includes(x.name));
      await gate();
      await ctx.emit({
        type: 'arrive',
        payload: { line, error: x.name, left: name, skipped, caught },
      });
      throw x;
    }
  }

  async function run(idxs: number[]): Promise<void> {
    let k = 0;
    while (k < idxs.length) {
      if (ctx.cancelled) throw new Halt();
      const i = idxs[k];
      const st = lines[i].stmt;
      if (st.k === 'function' || st.k === 'else' || st.k === 'elseIf' || st.k === 'catch') {
        k += 1;
        continue;
      }
      if (st.k === 'if') {
        const chain = [i];
        let m = k + 1;
        while (m < idxs.length) {
          if (ctx.cancelled) throw new Halt();
          const nk = lines[idxs[m]].stmt.k;
          if (nk !== 'elseIf' && nk !== 'else') break;
          chain.push(idxs[m]);
          m += 1;
        }
        for (const c of chain) {
          if (ctx.cancelled) throw new Halt();
          const cs = lines[c].stmt;
          if (cs.k === 'else') {
            await run(body(c));
            break;
          }
          if (cs.k !== 'if' && cs.k !== 'elseIf') break;
          const value = (await evaluate(cs.cond, c)) !== 0;
          await gate();
          await ctx.emit({ type: 'test', payload: { line: c, value } });
          if (value) {
            await run(body(c));
            break;
          }
        }
        k = m;
        continue;
      }
      if (st.k === 'while') {
        for (;;) {
          if (ctx.cancelled) throw new Halt();
          const value = (await evaluate(st.cond, i)) !== 0;
          await gate();
          await ctx.emit({ type: 'test', payload: { line: i, value } });
          if (!value) break;
          await run(body(i));
        }
        k += 1;
        continue;
      }
      if (st.k === 'try') {
        await gate();
        await ctx.emit({ type: 'enter', payload: { line: i } });
        const handlers: number[] = [];
        let m = k + 1;
        while (m < idxs.length) {
          if (ctx.cancelled) throw new Halt();
          const hs = lines[idxs[m]].stmt;
          if (hs.k !== 'catch') break;
          handlers.push(idxs[m]);
          m += 1;
        }
        const names = handlers.map((h) => {
          const hs = lines[h].stmt;
          return hs.k === 'catch' ? hs.error : '';
        });
        const frame = cur();
        frame.handlers.push(names);
        try {
          await run(body(i));
          frame.handlers.pop();
        } catch (x) {
          frame.handlers.pop();
          if (!(x instanceof Thrown)) throw x;
          const h = handlers.find((j) => {
            const hs = lines[j].stmt;
            return hs.k === 'catch' && hs.error === x.name;
          });
          if (h === undefined) throw x;
          const skipped = rest(x.at, blockEnd(i));
          await gate();
          await ctx.emit({ type: 'catch', payload: { line: h, error: x.name, skipped } });
          await run(body(h));
        }
        k = m;
        continue;
      }
      if (st.k === 'assign') {
        const value = await evaluate(st.value, i);
        cur().vars.set(st.to, value);
        await gate();
        await ctx.emit({ type: 'assign', payload: { line: i, to: st.to, value } });
      } else if (st.k === 'show') {
        const out = show(await evaluate(st.value, i));
        await gate();
        await ctx.emit({ type: 'show', payload: { line: i, out } });
      } else if (st.k === 'expr') {
        await evaluate(st.value, i);
        await gate();
        await ctx.emit({ type: 'line', payload: { line: i } });
      } else if (st.k === 'return') {
        const value = st.value === undefined ? null : await evaluate(st.value, i);
        await gate();
        await ctx.emit({ type: 'return', payload: { line: i, value } });
        throw new Returned(value);
      } else if (st.k === 'throw') {
        await gate();
        await ctx.emit({ type: 'throw', payload: { line: i, error: st.error, skipped: [] } });
        throw new Thrown(st.error, i);
      }
      k += 1;
    }
  }

  // 걸음 0 — 문 밖에서 곧바로. 프로그램 전체가 보이고 아무 줄도 밟지 않았다
  await ctx.emit({
    type: 'init',
    payload: {
      lines: lines.map((l) => ({
        indent: l.indent,
        text: l.text,
        k: l.stmt.k,
        name: l.stmt.k === 'function' ? l.stmt.name : null,
        params: l.stmt.k === 'function' ? [...l.stmt.params] : [],
        calls: stmtCalls(l.stmt),
      })),
    },
  });

  const topLevel = lines.map((_, i) => i).filter((i) => lines[i].indent === 0);
  try {
    await run(topLevel);
  } catch (x) {
    // 취소 · 맨 바깥까지 잡히지 않은 예외 · 맨 바깥의 return — 재생을 그대로 마친다
    if (!(x instanceof Halt) && !(x instanceof Thrown) && !(x instanceof Returned)) throw x;
  }
}
