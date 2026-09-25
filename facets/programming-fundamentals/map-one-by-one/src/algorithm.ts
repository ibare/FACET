/**
 * map-one-by-one — 줄 목록을 해석해 map 이 원소마다 함수를 지나게 하는 차례를 셈한다.
 *
 * 1차 데이터는 줄 목록이다. 줄마다 화면 글자(`text`)와 그 줄이 하는 일의 구조(`stmt`)가 있고,
 * 알고리즘이 구조를 밟아 값을 셈한다. 글자를 파싱하지 않는다 — 구조에서 글자를 찍어 내
 * `text` 와 대조만 한다 (어긋나면 자료가 틀린 것이라 던진다).
 *
 * 걸음은 **원소 걸음**이다. 맨 위 문 하나 = 한 걸음이되, `map` 이 든 줄은 원소 하나 = 한 걸음으로
 * 편다 (자리 0 부터). 그 줄 자체는 따로 걸음이 없다.
 *
 * 이벤트 (전부 silent 아님)
 * - `init`    { lines: { indent: number; text: string }[] }
 *             걸음 0 — 프로그램 전체가 보이고 아무 문도 밟지 않았다
 * - `assign`  { line: number; name: string; value: number | number[] }
 *             map 이 없는 넣기 줄 하나 (`line` 은 0 부터 센 줄 자리)
 * - `mapItem` { line: number; source: string | null; into: string; fn: string;
 *               index: number; input: number; output: number; length: number }
 *             map 의 원소 하나. `source` 는 첫 인자가 이름이면 그 이름, `into` 는 결과를 받는 이름,
 *             `fn` 은 함수 인자의 글자(구조에서 찍어 낸 것), `length` 는 들어간 목록의 길이
 * - `show`    { line: number; value: number | number[] }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MapExpr =
  | { num: number }
  | { var: string }
  | { op: string; l: MapExpr; r: MapExpr }
  | { call: string; args: MapExpr[] }
  | { list: MapExpr[] }
  | { fn: { params: string[]; body: MapExpr } };

export type MapStmt =
  | { k: 'assign'; to: string; value: MapExpr; declare?: boolean }
  | { k: 'show'; value: MapExpr };

export type MapLine = { indent: number; text: string; stmt: MapStmt };

export type MapOneByOneFacetData = {
  type: 'map-one-by-one';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  lines: MapLine[];
};

type Fn = { params: string[]; body: MapExpr; text: string };
type Value = number | number[] | Fn;

/** 식을 화면 글자로 찍는다 — `text` 대조와 함수 칸의 글자에 쓴다. */
export function exprText(e: MapExpr): string {
  if ('num' in e) return String(e.num);
  if ('var' in e) return e.var;
  if ('op' in e) {
    const side = (x: MapExpr): string => ('op' in x ? `(${exprText(x)})` : exprText(x));
    return `${side(e.l)} ${e.op} ${side(e.r)}`;
  }
  if ('call' in e) return `${e.call}(${e.args.map(exprText).join(', ')})`;
  if ('list' in e) return `[${e.list.map(exprText).join(', ')}]`;
  const ps = e.fn.params.length === 1 ? e.fn.params[0] : `(${e.fn.params.join(', ')})`;
  return `${ps} => ${exprText(e.fn.body)}`;
}

function stmtText(s: MapStmt): string {
  if (s.k === 'show') return `show ${exprText(s.value)}`;
  return `${s.declare ? 'let ' : ''}${s.to} = ${exprText(s.value)}`;
}

function isFn(v: Value): v is Fn {
  return typeof v === 'object' && !Array.isArray(v);
}

function asNumber(v: Value): number {
  if (typeof v !== 'number') throw new Error('map-one-by-one: 수가 와야 할 자리에 수가 아니다');
  return v;
}

function arith(op: string, a: number, b: number): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case 'div': return Math.trunc(a / b);
    case 'mod': return a % b;
    default: throw new Error(`map-one-by-one: 모르는 연산 ${op}`);
  }
}

export async function mapOneByOne(ctx: FacetContext<MapOneByOneFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<MapOneByOneFacetData>;
  const { lines, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (const ln of lines) {
    if (ln.indent !== 0) throw new Error('map-one-by-one: 이 조각의 줄은 모두 맨 위의 문이다');
    if (ln.text !== stmtText(ln.stmt)) {
      throw new Error(`map-one-by-one: 줄 글자와 구조가 다르다 — "${ln.text}"`);
    }
  }

  const env = new Map<string, Value>();

  /** 순수 식 — map 이 들지 않은 것만. */
  function evalPure(e: MapExpr, scope: Map<string, Value>): Value {
    if ('num' in e) return e.num;
    if ('var' in e) {
      const v = scope.get(e.var) ?? env.get(e.var);
      if (v === undefined) throw new Error(`map-one-by-one: 없는 이름 ${e.var}`);
      return v;
    }
    if ('op' in e) return arith(e.op, asNumber(evalPure(e.l, scope)), asNumber(evalPure(e.r, scope)));
    if ('list' in e) return e.list.map((x) => asNumber(evalPure(x, scope)));
    if ('fn' in e) return { params: e.fn.params, body: e.fn.body, text: exprText(e) };
    throw new Error(`map-one-by-one: ${e.call} 은 이 자리에서 부를 수 없다`);
  }

  function callFn(f: Fn, arg: number): number {
    const scope = new Map<string, Value>([[f.params[0], arg]]);
    return asNumber(evalPure(f.body, scope));
  }

  /** 줄 하나를 밟는다. map 이 든 줄이면 원소마다 걸음을 낸다. 취소되면 false. */
  async function runLine(at: number, s: MapStmt): Promise<boolean> {
    const top = s.value;
    if (s.k === 'assign' && 'call' in top && top.call === 'map') {
      const [listArg, fnArg] = top.args;
      const list = evalPure(listArg, new Map());
      const fn = evalPure(fnArg, new Map());
      if (!Array.isArray(list) || !isFn(fn)) throw new Error('map-one-by-one: map(목록, 함수) 꼴이 아니다');
      const out: number[] = [];
      for (let i = 0; i < list.length; i += 1) {
        if (!(await pause())) return false;
        const output = callFn(fn, list[i]);
        out.push(output);
        await ctx.emit({
          type: 'mapItem',
          payload: {
            line: at,
            source: 'var' in listArg ? listArg.var : null,
            into: s.to,
            fn: fn.text,
            index: i,
            input: list[i],
            output,
            length: list.length,
          },
        });
      }
      env.set(s.to, out);
      return true;
    }
    const v = evalPure(top, new Map());
    if (isFn(v)) throw new Error('map-one-by-one: 함수 값은 넣거나 보이지 않는다');
    if (!(await pause())) return false;
    if (s.k === 'assign') {
      env.set(s.to, v);
      await ctx.emit({ type: 'assign', payload: { line: at, name: s.to, value: v } });
    } else {
      await ctx.emit({ type: 'show', payload: { line: at, value: v } });
    }
    return true;
  }

  // 걸음 0 — 프로그램 전체. 곧바로 띄우고, 다음 걸음 앞의 문이 읽을 틈이 된다.
  await ctx.emit({
    type: 'init',
    payload: { lines: lines.map((l) => ({ indent: l.indent, text: l.text })) },
  });

  for (let at = 0; at < lines.length; at += 1) {
    if (ctx.cancelled) return;
    if (!(await runLine(at, lines[at].stmt))) return;
  }
}
