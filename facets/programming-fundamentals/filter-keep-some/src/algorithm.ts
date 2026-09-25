/**
 * filter-keep-some — filter 는 목록에서 무엇을 남기는가.
 *
 * `initialData.lines` 의 줄 구조를 작은 해석기로 밟는다. 걸음은 **원소 걸음** —
 * 맨 위(들여쓰기 0)의 문 하나가 한 걸음이고, `filter` 가 든 줄은 원소 하나가 한 걸음으로
 * 펴진다 (그 줄 자체는 따로 걸음이 없다). 걸음 차례 · 남음/떨어짐 · 출력은 전부 이 해석이 셈한다.
 *
 * 이벤트 (전부 사용자 걸음 — silent 없음)
 *   init        { lines: { indent: number; text: string }[] }
 *               걸음 0. 프로그램 전체가 보이고 아무 문도 밟지 않았다.
 *   assign      { line: number; name: string; items: number[] }
 *               목록 값을 이름에 넣었다 (`let ages = [...]`). line 은 0 부터.
 *   filterItem  { line: number; index: number; value: number; keep: boolean;
 *                 test: string; fn: string; source: string; target: string }
 *               `filter` 가 자리 index 의 원소 value 에 함수를 불렀다. keep 이 참이면 그 값이
 *               그대로 새 목록 끝에 붙는다. test 는 인자를 값으로 바꿔 쓴 몸의 코드 글자(`7 > 4`),
 *               fn 은 넘긴 함수의 코드 글자(`x => x > 4`), source · target 은 옛 목록 · 새 목록의 이름.
 *   show        { line: number; items: number[] }
 *               `show` 가 목록 값을 내보냈다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Expr =
  | { num: number }
  | { var: string }
  | { op: string; l: Expr; r: Expr }
  | { call: string; args: Expr[] }
  | { list: Expr[] }
  | { fn: { params: string[]; body: Expr } };

export type Stmt =
  | { k: 'assign'; to: string; value: Expr; declare?: boolean }
  | { k: 'show'; value: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type FilterKeepSomeFacetData = {
  type: 'filter-keep-some';
  stepMs: number;
  lines: CodeLine[];
};

type Fn = { params: string[]; body: Expr };
type Value = number | boolean | number[] | Fn;

function isFn(v: Value): v is Fn {
  return typeof v === 'object' && !Array.isArray(v);
}

/** 식을 코드 글자로 찍는다. env 에 든 이름은 그 값으로 바꿔 쓴다. */
function print(e: Expr, env: Record<string, number> = {}): string {
  if ('num' in e) return String(e.num);
  if ('var' in e) return e.var in env ? String(env[e.var]) : e.var;
  if ('op' in e) return `${print(e.l, env)} ${e.op} ${print(e.r, env)}`;
  if ('list' in e) return '[' + e.list.map((x) => print(x, env)).join(', ') + ']';
  if ('call' in e) return e.call + '(' + e.args.map((x) => print(x, env)).join(', ') + ')';
  const ps = e.fn.params;
  const head = ps.length === 1 ? ps[0] : '(' + ps.join(', ') + ')';
  return `${head} => ${print(e.fn.body, env)}`;
}

function binary(op: string, a: Value, b: Value): Value {
  if (typeof a !== 'number' || typeof b !== 'number') throw new Error(`연산 ${op} 은 수만 받는다`);
  switch (op) {
    case '+': return a + b;
    case '*': return a * b;
    case '>': return a > b;
    case '==': return a === b;
    case 'mod': return a % b;
    case 'div': return Math.trunc(a / b);
    default: throw new Error(`모르는 연산 ${op}`);
  }
}

/** 부르기 없는 식을 셈한다. */
function evaluate(e: Expr, env: Map<string, Value>): Value {
  if ('num' in e) return e.num;
  if ('var' in e) {
    const v = env.get(e.var);
    if (v === undefined) throw new Error(`없는 이름 ${e.var}`);
    return v;
  }
  if ('op' in e) return binary(e.op, evaluate(e.l, env), evaluate(e.r, env));
  if ('list' in e) {
    return e.list.map((x) => {
      const v = evaluate(x, env);
      if (typeof v !== 'number') throw new Error('목록에는 수만 담는다');
      return v;
    });
  }
  if ('fn' in e) return { params: e.fn.params, body: e.fn.body };
  throw new Error(`이 자리에서는 부를 수 없다: ${e.call}`);
}

export async function filterKeepSome(ctx: FacetContext<FilterKeepSomeFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<FilterKeepSomeFacetData>;
  const { lines, stepMs } = rctx.data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const globals = new Map<string, Value>();

  /** `filter(list, f)` — 원소 하나 = 한 걸음. 취소되면 null. */
  async function runFilter(line: number, target: string, args: Expr[]): Promise<number[] | null> {
    const [listArg, fnArg] = args;
    if (listArg === undefined || fnArg === undefined) throw new Error('filter 는 인자 둘을 받는다');
    const list = evaluate(listArg, globals);
    const fn = evaluate(fnArg, globals);
    if (!Array.isArray(list) || !isFn(fn)) throw new Error('filter(list, f) 의 모양이 아니다');
    const param = fn.params[0];
    if (param === undefined) throw new Error('filter 의 함수는 인자 하나를 받는다');
    const source = 'var' in listArg ? listArg.var : print(listArg);
    const fnText = print(fnArg);
    const kept: number[] = [];
    for (let index = 0; index < list.length; index += 1) {
      if (!(await pause())) return null;
      const value = list[index] as number;
      const local = new Map(globals);
      local.set(param, value);
      const keep = evaluate(fn.body, local) === true;
      if (keep) kept.push(value);
      await rctx.emit({
        type: 'filterItem',
        payload: {
          line,
          index,
          value,
          keep,
          test: print(fn.body, { [param]: value }),
          fn: fnText,
          source,
          target,
        },
      });
    }
    return kept;
  }

  await rctx.emit({
    type: 'init',
    payload: { lines: lines.map((l) => ({ indent: l.indent, text: l.text })) },
  });

  for (let line = 0; line < lines.length; line += 1) {
    if (rctx.cancelled) return;
    const code = lines[line];
    if (code === undefined || code.indent !== 0) continue;
    const stmt = code.stmt;
    if (stmt.k === 'assign') {
      const e = stmt.value;
      if ('call' in e && e.call === 'filter') {
        const kept = await runFilter(line, stmt.to, e.args);
        if (kept === null) return;
        globals.set(stmt.to, kept);
        continue;
      }
      const value = evaluate(e, globals);
      if (!Array.isArray(value)) throw new Error('이 조각은 목록 값만 넣는다');
      globals.set(stmt.to, value);
      if (!(await pause())) return;
      await rctx.emit({ type: 'assign', payload: { line, name: stmt.to, items: [...value] } });
      continue;
    }
    const value = evaluate(stmt.value, globals);
    if (!Array.isArray(value)) throw new Error('이 조각은 목록 값만 내보낸다');
    if (!(await pause())) return;
    await rctx.emit({ type: 'show', payload: { line, items: [...value] } });
  }
}
