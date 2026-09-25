/**
 * monad-chain-in-box — 값이 없을 수도 있는 상자를 함수 여럿에 차례로 이어 넘긴다.
 *
 * 1차 자료는 줄 목록이다. 줄마다 화면 글자(`text`)와 그 줄이 하는 일의 구조(`stmt`)를
 * 둔다. 이 알고리즘은 구조를 **해석해서** 걸음 · 상자 · 부르기를 셈한다. 글자를 파싱하지 않는다.
 *
 * 걸음 규약 — 문 걸음. 걸음 0 은 시작(프로그램 전체가 보이고 아무 문도 밟지 않았다).
 * 맨 위(들여쓰기 0)의 문 하나가 한 걸음이다. `function` 머리줄과 그 몸은 맨 위의 문이 아니다.
 * 이음 줄(`then(…)`)에서 `half` 몸에 들어가 돌려받기까지가 그 한 걸음 안이다.
 *
 * 내장 — `box(v)` 는 값 v 가 든 상자, `empty` 는 빈 상자(값이 없음을 뜻하는 **상자**).
 * `then(b, f)` 는 b 가 찬 상자면 f(v) 를 불러 그 결과(상자)를 돌려주고, 빈 상자면 f 를 부르지 않고
 * `empty` 를 돌려준다. 결과를 한 번 더 상자에 담지 않는다.
 *
 * 이벤트 (전부 silent 아님 — 하나가 한 걸음)
 * - `init`     { lines: { indent: number; text: string }[]; fnName: string; slotLines: number[] }
 *              걸음 0. 프로그램 전체. fnName 은 코드에 정의된 함수 이름(상자를 받는 쪽).
 *              slotLines 는 이름에 상자를 담는 맨 위의 줄들 (상자 칸이 설 줄)
 * - `bind`     { line: number; name: string; out: BoxOut; code: string }
 *              이음 없이 상자를 이름에 담았다 (`let a = box(20)`)
 * - `thenCall` { line: number; name: string; fromLine: number; n: number;
 *                condLine: number; cond: boolean; out: BoxOut; code: string }
 *              찬 상자를 열어 n 을 함수에 넘겼다. 몸의 `if`(condLine) 가 cond 였고, 돌아온 상자가 out
 * - `thenSkip` { line: number; name: string; fromLine: number; out: BoxOut; code: string }
 *              빈 상자라 함수를 부르지 않았다. 빈 상자가 그대로 넘어갔다
 * - `show`     { line: number; fromLine: number; code: string }
 *              출력. fromLine 은 찍은 이름을 담은 줄(이름이 아니면 -1).
 *              code 는 상자를 이 표기로 찍은 글자 (`box(10)` · `empty`)
 *
 * 줄 번호(line · fromLine · condLine)는 lines 의 0 부터 센 자리다.
 * BoxOut = { kind: 'box'; v: number } | { kind: 'empty' }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Expr =
  | { num: number }
  | { var: string }
  | { op: '+' | '*' | '>' | '==' | 'mod' | 'div'; l: Expr; r: Expr }
  | { call: string; args: Expr[] }
  | { const: 'empty' };

export type Stmt =
  | { k: 'function'; name: string; params: string[] }
  | { k: 'if'; cond: Expr }
  | { k: 'return'; value: Expr }
  | { k: 'assign'; to: string; value: Expr; declare?: boolean }
  | { k: 'show'; value: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type MonadChainInBoxFacetData = {
  type: 'monad-chain-in-box';
  stepMs: number;
  lines: CodeLine[];
};

export type BoxOut = { kind: 'box'; v: number } | { kind: 'empty' };

type FnVal = { kind: 'fn'; name: string };
type Val = number | boolean | BoxOut | FnVal;

type Trace = {
  opens: { from: string | null; n: number }[];
  skips: { from: string | null }[];
  conds: { line: number; value: boolean }[];
};

function isBox(v: Val): v is BoxOut {
  return typeof v === 'object' && (v.kind === 'box' || v.kind === 'empty');
}

/** 상자를 이 표기의 글자로 찍는다 — `box(10)` · `empty`. */
function boxCode(b: BoxOut): string {
  return b.kind === 'box' ? `box(${b.v})` : 'empty';
}

/** 머리줄(header) 바로 아래 한 칸 깊은 줄들 — 그 몸. 더 깊은 줄은 안쪽 머리줄의 몸이다. */
function bodyOf(lines: CodeLine[], header: number): number[] {
  const base = lines[header].indent;
  const out: number[] = [];
  for (let i = header + 1; i < lines.length; i += 1) {
    const ind = lines[i].indent;
    if (ind <= base) break;
    if (ind === base + 1) out.push(i);
  }
  return out;
}

export async function monadChainInBox(
  context: FacetContext<MonadChainInBoxFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<MonadChainInBoxFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;
  const lines = data.lines;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 코드에 정의된 함수는 시작 전에 정의돼 있다 (머리줄은 밟지 않는다).
  const fns = new Map<string, number>();
  for (let i = 0; i < lines.length; i += 1) {
    const s = lines[i].stmt;
    if (lines[i].indent === 0 && s.k === 'function') fns.set(s.name, i);
  }
  const globals = new Map<string, Val>();
  const declaredAt = new Map<string, number>();

  function lookup(name: string, env: Map<string, Val> | null): Val {
    if (env && env.has(name)) return env.get(name) as Val;
    if (globals.has(name)) return globals.get(name) as Val;
    if (fns.has(name)) return { kind: 'fn', name };
    throw new Error(`monadChainInBox: 알 수 없는 이름 ${name}`);
  }

  function callUser(name: string, args: Val[], tr: Trace): Val {
    const header = fns.get(name);
    if (header === undefined) throw new Error(`monadChainInBox: 정의 없는 함수 ${name}`);
    const h = lines[header].stmt;
    if (h.k !== 'function') throw new Error('monadChainInBox: 함수 머리줄이 아니다');
    const env = new Map<string, Val>();
    h.params.forEach((p, i) => env.set(p, args[i]));
    const r = execBlock(header, env, tr);
    if (r === undefined) throw new Error(`monadChainInBox: ${name} 이 값을 돌려주지 않았다`);
    return r;
  }

  function execBlock(header: number, env: Map<string, Val>, tr: Trace): Val | undefined {
    for (const i of bodyOf(lines, header)) {
      const s = lines[i].stmt;
      if (s.k === 'if') {
        const c = evalE(s.cond, env, tr);
        if (typeof c !== 'boolean') throw new Error('monadChainInBox: 조건이 참/거짓이 아니다');
        tr.conds.push({ line: i, value: c });
        if (c) {
          const r = execBlock(i, env, tr);
          if (r !== undefined) return r;
        }
      } else if (s.k === 'return') {
        return evalE(s.value, env, tr);
      } else {
        throw new Error(`monadChainInBox: 몸 안에서 다루지 않는 문 ${s.k}`);
      }
    }
    return undefined;
  }

  function num(v: Val): number {
    if (typeof v !== 'number') throw new Error('monadChainInBox: 수가 아니다');
    return v;
  }

  function evalE(e: Expr, env: Map<string, Val> | null, tr: Trace): Val {
    if ('num' in e) return e.num;
    if ('var' in e) return lookup(e.var, env);
    if ('const' in e) return { kind: 'empty' };
    if ('op' in e) {
      const l = num(evalE(e.l, env, tr));
      const r = num(evalE(e.r, env, tr));
      switch (e.op) {
        case '+': return l + r;
        case '*': return l * r;
        case '>': return l > r;
        case '==': return l === r;
        case 'mod': return ((l % r) + r) % r;
        case 'div': return Math.floor(l / r);
      }
    }
    if ('call' in e) {
      if (e.call === 'box') {
        return { kind: 'box', v: num(evalE(e.args[0], env, tr)) };
      }
      if (e.call === 'then') {
        const b = evalE(e.args[0], env, tr);
        const f = evalE(e.args[1], env, tr);
        if (!isBox(b)) throw new Error('monadChainInBox: then 의 첫 인자가 상자가 아니다');
        if (typeof f !== 'object' || f.kind !== 'fn') {
          throw new Error('monadChainInBox: then 의 둘째 인자가 함수가 아니다');
        }
        const from = 'var' in e.args[0] ? e.args[0].var : null;
        if (b.kind === 'empty') {
          tr.skips.push({ from });
          return { kind: 'empty' };
        }
        tr.opens.push({ from, n: b.v });
        const r = callUser(f.name, [b.v], tr);
        if (!isBox(r)) throw new Error('monadChainInBox: 이어 부른 함수가 상자를 돌려주지 않았다');
        return r;
      }
      if (fns.has(e.call)) {
        return callUser(e.call, e.args.map((a) => evalE(a, env, tr)), tr);
      }
      throw new Error(`monadChainInBox: 알 수 없는 내장 ${e.call}`);
    }
    throw new Error('monadChainInBox: 알 수 없는 식');
  }

  function fromLineOf(from: string | null): number {
    const at = from === null ? undefined : declaredAt.get(from);
    if (at === undefined) throw new Error('monadChainInBox: 이음의 앞 상자를 찾지 못했다');
    return at;
  }

  // 걸음이 되는 줄 — 맨 위의 문 가운데 함수 머리줄이 아닌 것
  const topLevel: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].indent === 0 && lines[i].stmt.k !== 'function') topLevel.push(i);
  }

  const firstFn = [...fns.keys()][0] ?? '';
  await ctx.emit({
    type: 'init',
    payload: {
      lines: lines.map((l) => ({ indent: l.indent, text: l.text })),
      fnName: firstFn,
      slotLines: topLevel.filter((i) => lines[i].stmt.k === 'assign'),
    },
  });

  for (const i of topLevel) {
    if (!(await pause())) return;
    const s = lines[i].stmt;
    const tr: Trace = { opens: [], skips: [], conds: [] };

    if (s.k === 'assign') {
      const v = evalE(s.value, null, tr);
      if (!isBox(v)) throw new Error('monadChainInBox: 이 조각의 이름은 상자만 담는다');
      globals.set(s.to, v);
      if (s.declare) declaredAt.set(s.to, i);
      if (tr.opens.length + tr.skips.length > 1) {
        throw new Error('monadChainInBox: 한 줄에 이음 하나만 다룬다');
      }
      if (tr.opens.length === 1) {
        const cond = tr.conds[0];
        await ctx.emit({
          type: 'thenCall',
          payload: {
            line: i,
            name: s.to,
            fromLine: fromLineOf(tr.opens[0].from),
            n: tr.opens[0].n,
            condLine: cond ? cond.line : -1,
            cond: cond ? cond.value : false,
            out: v,
            code: boxCode(v),
          },
        });
      } else if (tr.skips.length === 1) {
        await ctx.emit({
          type: 'thenSkip',
          payload: {
            line: i,
            name: s.to,
            fromLine: fromLineOf(tr.skips[0].from),
            out: v,
            code: boxCode(v),
          },
        });
      } else {
        await ctx.emit({
          type: 'bind',
          payload: { line: i, name: s.to, out: v, code: boxCode(v) },
        });
      }
    } else if (s.k === 'show') {
      const v = evalE(s.value, null, tr);
      if (!isBox(v)) throw new Error('monadChainInBox: show 는 상자만 받는다');
      const shownFrom = 'var' in s.value ? (declaredAt.get(s.value.var) ?? -1) : -1;
      await ctx.emit({ type: 'show', payload: { line: i, fromLine: shownFrom, code: boxCode(v) } });
    } else {
      throw new Error(`monadChainInBox: 맨 위에서 다루지 않는 문 ${s.k}`);
    }
  }
}
