/**
 * loop-back — 반복문은 흐름을 어떻게 되풀이하는가.
 *
 * 1차 데이터는 줄 목록이다. 줄마다 화면 글자(`text`)와 그 줄이 하는 일의 구조(`stmt`)를 둔다.
 * 알고리즘은 그 구조를 해석하며 줄을 밟는다 — 밟는 차례 · 변수 값 · 조건의 참거짓은 여기서 셈한다.
 * 걸음표를 손으로 적지 않고, 글자를 파싱하지 않는다.
 *
 * 걸음 규약 (줄 걸음): 밟은 줄 하나가 한 걸음. `while` 조건 줄은 셈할 때마다 한 걸음이며
 * 마지막 거짓 셈도 한 걸음이다. 첫 걸음 앞에도 `stepMs` 를 둔다 — 걸음 0(시작 화면)도 읽을 틈이 있어야 한다.
 *
 * 이벤트 (전부 silent 아님):
 *   step  { line: number, act: 'assign', name: string, value: number }
 *           대입 줄을 밟았다. line 은 0 부터 센 줄 차례
 *   step  { line: number, act: 'cond', cond: boolean }
 *           조건 줄을 밟아 조건을 셈했다
 *   step  { line: number, act: 'print', out: string }
 *           `print` 부르기 한 줄을 밟았다. out 은 출력에 더해진 한 줄
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LoopBackExpr =
  | { num: number }
  | { var: string }
  | { op: '+' | '-' | '*' | '<' | '<=' | '>' | '>=' | '==' | '!='; l: LoopBackExpr; r: LoopBackExpr }
  | { call: 'print'; args: LoopBackExpr[] };

export type LoopBackStmt =
  | { k: 'assign'; to: string; value: LoopBackExpr }
  | { k: 'expr'; value: LoopBackExpr }
  | { k: 'while'; cond: LoopBackExpr };

export type LoopBackLine = { indent: number; text: string; stmt: LoopBackStmt };

export type LoopBackFacetData = {
  type: 'loop-back';
  stepMs: number;
  lines: LoopBackLine[];
};

type Value = number | boolean;

/** 머리줄 i 의 몸 — 바로 아래로 더 깊은 줄이 이어지는 동안, 그 가운데 한 칸 깊은 줄들. */
function bodyOf(lines: readonly LoopBackLine[], i: number): number[] {
  const base = lines[i]!.indent;
  const out: number[] = [];
  for (let j = i + 1; j < lines.length && lines[j]!.indent > base; j += 1) {
    if (lines[j]!.indent === base + 1) out.push(j);
  }
  return out;
}

function evalExpr(e: LoopBackExpr, vars: Map<string, Value>, output: string[]): Value | null {
  if ('num' in e) return e.num;
  if ('var' in e) {
    const v = vars.get(e.var);
    if (v === undefined) throw new Error(`loop-back: 정의되지 않은 변수 ${e.var}`);
    return v;
  }
  if ('op' in e) {
    const l = evalExpr(e.l, vars, output);
    const r = evalExpr(e.r, vars, output);
    if (typeof l !== 'number' || typeof r !== 'number') throw new Error('loop-back: 수가 아닌 피연산자');
    switch (e.op) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '<': return l < r;
      case '<=': return l <= r;
      case '>': return l > r;
      case '>=': return l >= r;
      case '==': return l === r;
      case '!=': return l !== r;
    }
  }
  // print — 틀을 세우지 않는 내장. 출력 목록에 한 줄을 더할 뿐이다
  output.push(e.args.map((a) => String(evalExpr(a, vars, output))).join(' '));
  return null;
}

export async function loopBack(ctx: FacetContext<LoopBackFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<LoopBackFacetData>;
  const { lines, stepMs } = ctx.data;
  const vars = new Map<string, Value>();
  const output: string[] = [];

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  /** 줄 idxs 를 차례로 밟는다. 취소되면 false. */
  async function run(idxs: readonly number[]): Promise<boolean> {
    for (const i of idxs) {
      if (ctx.cancelled) return false;
      const st = lines[i]!.stmt;
      if (st.k === 'while') {
        for (;;) {
          if (!(await pause())) return false;
          const cond = evalExpr(st.cond, vars, output) === true;
          await ctx.emit({ type: 'step', payload: { line: i, act: 'cond', cond } });
          if (!cond) break;
          if (!(await run(bodyOf(lines, i)))) return false;
        }
      } else if (st.k === 'assign') {
        if (!(await pause())) return false;
        const value = evalExpr(st.value, vars, output);
        if (typeof value !== 'number') throw new Error('loop-back: 대입 값은 수여야 한다');
        vars.set(st.to, value);
        await ctx.emit({ type: 'step', payload: { line: i, act: 'assign', name: st.to, value } });
      } else {
        if (!(await pause())) return false;
        const before = output.length;
        evalExpr(st.value, vars, output);
        const out = output.slice(before).join('\n');
        await ctx.emit({ type: 'step', payload: { line: i, act: 'print', out } });
      }
    }
    return true;
  }

  const top: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (ctx.cancelled) return;
    if (lines[i]!.indent === 0) top.push(i);
  }
  await run(top);
}
