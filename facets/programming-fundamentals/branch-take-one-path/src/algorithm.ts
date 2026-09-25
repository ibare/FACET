/**
 * branchTakeOnePath — 짧은 프로그램 하나를 줄 걸음으로 밟는다. if-else 가 두 갈래 중
 * 하나만 밟는다는 것을 보이는 조각의 알고리즘.
 *
 * 1차 데이터는 줄 목록이다. 줄마다 들여쓰기 · 화면 글자 · 문 구조를 두고, 밟는 차례 ·
 * 변수 값 · 조건의 참거짓은 이 알고리즘이 구조를 해석해 셈한다. 글자는 파싱하지 않는다.
 *
 * 걸음 규약 (줄 걸음):
 *   - 걸음 0 = 시작 (`init`). 아무 줄도 밟지 않았다
 *   - 밟은 줄 하나 = 한 걸음 (`step`). 조건은 그 머리줄의 걸음 안에서 셈한다
 *   - `else` 줄은 밟지 않는다 — 갈래가 골라지면 흐름은 곧장 몸의 첫 줄로 간다
 *   - `else if` 줄은 셈했을 때만 밟는다
 *   - `let` 선언 줄도 한 걸음이다
 *
 * 변수 (조각 코드 표기 — `tasks/pseudo-notation.md`):
 *   - `let x = 값` 이 이름을 만들고 처음 값을 넣는다. 그 뒤 `x = 값` 은 값만 바꾼다
 *   - `let` 으로 만든 이름은 그 몸 안에서만 산다. 이 조각의 자료는 맨 바깥에서만 선언하므로
 *     몸 안의 `let` 은 해석하지 않고 던진다 (스코프가 끝나는 것은 이 조각의 주장이 아니다)
 *
 * 이벤트 (전부 silent 아님 — 하나가 한 걸음):
 *   - `init`  payload `{ lines: Line[] }`
 *             프로그램 전체. 아직 아무 줄도 밟지 않았다
 *   - `step`  payload `{ line: number; cond?: boolean; operands?: [Value, Value];
 *                        value?: Value; out?: string }`
 *             `line` — 밟은 줄의 0 기반 차례
 *             `cond` · `operands` — 머리줄(if · else if)에서 셈한 조건과 그 두 피연산자 값
 *             `value` — 선언 · 대입 줄이 넣은 값
 *             `out` — show 가 내보낸 한 줄
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Value = number | string | boolean | null;

export type BinOp = '+' | '-' | '*' | '<' | '<=' | '>' | '>=' | '==' | '!=';

export type Expr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { op: BinOp; l: Expr; r: Expr };

export type Stmt =
  | { k: 'assign'; to: string; value: Expr; declare?: boolean }
  | { k: 'show'; value: Expr }
  | { k: 'if'; cond: Expr }
  | { k: 'elif'; cond: Expr }
  | { k: 'else' };

export type Line = { indent: number; text: string; stmt: Stmt };

export type BranchTakeOnePathFacetData = {
  type: 'branch-take-one-path';
  stepMs: number;
  lines: Line[];
};

/** 머리줄 i 의 몸 — 바로 아래로 더 깊은 줄이 이어지는 동안, 한 칸 깊은 줄들. */
export function bodyOf(lines: readonly Line[], i: number): number[] {
  const head = lines[i];
  if (!head) return [];
  const out: number[] = [];
  for (let j = i + 1; j < lines.length; j += 1) {
    const l = lines[j];
    if (!l || l.indent <= head.indent) break;
    if (l.indent === head.indent + 1) out.push(j);
  }
  return out;
}

/** 맨 바깥 줄들 (들여쓰기 0). */
export function topOf(lines: readonly Line[]): number[] {
  const out: number[] = [];
  lines.forEach((l, i) => {
    if (l.indent === 0) out.push(i);
  });
  return out;
}

function applyOp(op: BinOp, a: Value, b: Value): Value {
  if (typeof a === 'number' && typeof b === 'number') {
    switch (op) {
      case '+':
        return a + b;
      case '-':
        return a - b;
      case '*':
        return a * b;
      case '<':
        return a < b;
      case '<=':
        return a <= b;
      case '>':
        return a > b;
      case '>=':
        return a >= b;
      case '==':
        return a === b;
      case '!=':
        return a !== b;
    }
  }
  if (op === '==') return a === b;
  if (op === '!=') return a !== b;
  if (op === '+' && typeof a === 'string' && typeof b === 'string') return a + b;
  throw new Error(`branchTakeOnePath: ${op} 를 셈할 수 없는 값`);
}

export async function branchTakeOnePath(
  ctx: FacetContext<BranchTakeOnePathFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<BranchTakeOnePathFacetData>;
  const { lines, stepMs } = ctx.data;
  const vars = new Map<string, Value>();

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  function show(v: Value): string {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v);
  }

  function evaluate(e: Expr): Value {
    if ('num' in e) return e.num;
    if ('str' in e) return e.str;
    if ('var' in e) {
      const v = vars.get(e.var);
      if (v === undefined) throw new Error(`branchTakeOnePath: 없는 변수 ${e.var}`);
      return v;
    }
    return applyOp(e.op, evaluate(e.l), evaluate(e.r));
  }

  // 조건의 두 피연산자 — 식이 연산이면 그 두 값, 아니면 없음
  function operandsOf(e: Expr): [Value, Value] | undefined {
    if ('op' in e) return [evaluate(e.l), evaluate(e.r)];
    return undefined;
  }

  // 몸 하나를 밟는다. 취소되면 false.
  async function run(idxs: readonly number[]): Promise<boolean> {
    let k = 0;
    while (k < idxs.length) {
      if (!(await pause())) return false;
      const i = idxs[k]!;
      const st = lines[i]!.stmt;
      if (st.k === 'if') {
        const chain = [i];
        let m = k + 1;
        while (m < idxs.length) {
          const kk = lines[idxs[m]!]!.stmt.k;
          if (kk !== 'elif' && kk !== 'else') break;
          chain.push(idxs[m]!);
          m += 1;
        }
        for (let c = 0; c < chain.length; c += 1) {
          if (ctx.cancelled) return false;
          const head = chain[c]!;
          const hs = lines[head]!.stmt;
          if (hs.k === 'else') {
            if (!(await run(bodyOf(lines, head)))) return false;
            break;
          }
          if (hs.k !== 'if' && hs.k !== 'elif') break;
          // 첫 머리줄은 이미 문을 지났다. 뒤따르는 else if 는 제 문을 지난다
          if (c > 0 && !(await pause())) return false;
          const cond = evaluate(hs.cond) === true;
          const operands = operandsOf(hs.cond);
          await ctx.emit({
            type: 'step',
            payload: operands ? { line: head, cond, operands } : { line: head, cond },
          });
          if (cond) {
            if (!(await run(bodyOf(lines, head)))) return false;
            break;
          }
        }
        k = m;
        continue;
      }
      if (st.k === 'assign') {
        const declared = vars.has(st.to);
        if (st.declare && (declared || lines[i]!.indent > 0)) {
          throw new Error(`branchTakeOnePath: 해석하지 않는 선언 ${st.to}`);
        }
        if (!st.declare && !declared) {
          throw new Error(`branchTakeOnePath: 선언 없는 이름 ${st.to}`);
        }
        const value = evaluate(st.value);
        vars.set(st.to, value);
        await ctx.emit({ type: 'step', payload: { line: i, value } });
      } else if (st.k === 'show') {
        const out = show(evaluate(st.value));
        await ctx.emit({ type: 'step', payload: { line: i, out } });
      }
      k += 1;
    }
    return true;
  }

  await ctx.emit({ type: 'init', payload: { lines } });
  await run(topOf(lines));
}
