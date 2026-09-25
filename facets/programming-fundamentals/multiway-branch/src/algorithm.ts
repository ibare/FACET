/**
 * multiway-branch — if / elif / else 사슬을 줄 걸음으로 밟는다.
 *
 * 1차 데이터는 줄 목록이다. 줄마다 들여쓰기 · 화면 글자 · 문 구조를 둔다. 이 알고리즘이
 * 문 구조를 해석해 밟는 차례와 조건의 참거짓을 셈한다 — 걸음표를 손으로 적지 않는다.
 * 사슬은 위에서부터 조건을 셈해 처음 참인 갈래 하나만 몸을 밟는다. 참을 만난 뒤의 `elif`
 * 는 셈하지도 밟지도 않는다. `else:` 줄은 밟지 않는다 (흐름이 곧장 몸의 첫 줄로 간다).
 *
 * 이벤트 (둘 다 걸음이다. silent 없음)
 *
 * - `init`  — 걸음 0 (시작). 아무 줄도 밟지 않았다.
 *     payload: { lines: { indent: number; text: string; kind: StmtKind }[] }
 * - `step`  — 밟은 줄 하나.
 *     payload: {
 *       line: number;                     // 0 부터 센 줄 차례
 *       test?: { result: boolean; l?: Value; op?: Op; r?: Value };
 *                                         // if / elif 를 셈한 결과. 비교식이면 양쪽 값
 *       assigned?: { name: string; value: Value };   // 대입한 변수와 값
 *       printed?: string;                 // print 가 낸 한 줄
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Value = number | string;
export type Op = '+' | '-' | '*' | '<' | '<=' | '>' | '>=' | '==' | '!=';

export type Expr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { op: Op; l: Expr; r: Expr }
  | { call: string; args: Expr[] };

export type Stmt =
  | { k: 'assign'; to: string; value: Expr }
  | { k: 'expr'; value: Expr }
  | { k: 'if'; cond: Expr }
  | { k: 'elif'; cond: Expr }
  | { k: 'else' };

export type StmtKind = Stmt['k'];

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type MultiwayBranchFacetData = {
  type: 'multiway-branch';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  lines: CodeLine[];
};

export type Test = { result: boolean; l?: Value; op?: Op; r?: Value };

type Step = {
  line: number;
  test?: Test;
  assigned?: { name: string; value: Value };
  printed?: string;
};

/** 해석이 밟을 수 있는 걸음의 상한 — 잘못된 자료가 끝없이 돌지 않게 */
const STEP_CAP = 400;

function binary(op: Op, a: Value, b: Value): Value | boolean {
  if (op === '+') return typeof a === 'number' && typeof b === 'number' ? a + b : String(a) + String(b);
  if (op === '-') return Number(a) - Number(b);
  if (op === '*') return Number(a) * Number(b);
  if (op === '<') return a < b;
  if (op === '<=') return a <= b;
  if (op === '>') return a > b;
  if (op === '>=') return a >= b;
  if (op === '==') return a === b;
  return a !== b;
}

/**
 * 줄 목록을 실제로 밟아 걸음 차례를 뽑는다. 순수 함수 — ctx 를 모른다.
 */
function trace(lines: readonly CodeLine[]): Step[] {
  const env = new Map<string, Value>();
  const out: Step[] = [];

  function evaluate(e: Expr, printed: string[]): Value | boolean | null {
    if ('num' in e) return e.num;
    if ('str' in e) return e.str;
    if ('var' in e) {
      const v = env.get(e.var);
      if (v === undefined) throw new Error(`multiway-branch: 정의되지 않은 변수 ${e.var}`);
      return v;
    }
    if ('op' in e) {
      const a = evaluate(e.l, printed);
      const b = evaluate(e.r, printed);
      if (typeof a === 'boolean' || typeof b === 'boolean' || a === null || b === null) {
        throw new Error('multiway-branch: 비교식의 양쪽은 수나 글자여야 한다');
      }
      return binary(e.op, a, b);
    }
    if (e.call === 'print') {
      const parts: string[] = [];
      for (const a of e.args) parts.push(String(evaluate(a, printed)));
      printed.push(parts.join(' '));
      return null;
    }
    throw new Error(`multiway-branch: 부를 수 없는 이름 ${e.call}`);
  }

  function test(cond: Expr): Test {
    if ('op' in cond) {
      const l = evaluate(cond.l, []);
      const r = evaluate(cond.r, []);
      if (typeof l === 'boolean' || typeof r === 'boolean' || l === null || r === null) {
        throw new Error('multiway-branch: 조건의 양쪽은 수나 글자여야 한다');
      }
      return { result: Boolean(binary(cond.op, l, r)), l, op: cond.op, r };
    }
    return { result: Boolean(evaluate(cond, [])) };
  }

  /** 머리줄 i 의 몸 — 바로 아래 들여쓰기가 더 깊은 줄들 가운데 한 칸 깊은 것 */
  function body(i: number): number[] {
    const ind = lines[i].indent;
    const idxs: number[] = [];
    for (let j = i + 1; j < lines.length && lines[j].indent > ind; j += 1) {
      if (lines[j].indent === ind + 1) idxs.push(j);
    }
    return idxs;
  }

  function push(step: Step): void {
    if (out.length >= STEP_CAP) throw new Error('multiway-branch: 걸음이 너무 많다');
    out.push(step);
  }

  function run(idxs: readonly number[]): void {
    let k = 0;
    while (k < idxs.length) {
      const i = idxs[k];
      const st = lines[i].stmt;
      if (st.k === 'assign') {
        const v = evaluate(st.value, []);
        if (typeof v === 'boolean' || v === null) throw new Error('multiway-branch: 대입할 값이 없다');
        env.set(st.to, v);
        push({ line: i, assigned: { name: st.to, value: v } });
        k += 1;
      } else if (st.k === 'expr') {
        const printed: string[] = [];
        evaluate(st.value, printed);
        push(printed.length > 0 ? { line: i, printed: printed.join('\n') } : { line: i });
        k += 1;
      } else if (st.k === 'if') {
        // 사슬: if 뒤로 이어지는 같은 들여쓰기의 elif · else
        const chain = [i];
        let j = k + 1;
        while (j < idxs.length) {
          const kk = lines[idxs[j]].stmt.k;
          if (kk !== 'elif' && kk !== 'else') break;
          chain.push(idxs[j]);
          j += 1;
        }
        for (const head of chain) {
          const hs = lines[head].stmt;
          if (hs.k === 'else') {
            run(body(head));
            break;
          }
          if (hs.k !== 'if' && hs.k !== 'elif') break;
          const t = test(hs.cond);
          push({ line: head, test: t });
          if (t.result) {
            run(body(head));
            break;
          }
        }
        k = j;
      } else {
        throw new Error(`multiway-branch: 사슬 밖의 ${st.k} (L${i + 1})`);
      }
    }
  }

  const top: number[] = [];
  for (let i = 0; i < lines.length; i += 1) if (lines[i].indent === 0) top.push(i);
  run(top);
  return out;
}

export async function multiwayBranch(
  context: FacetContext<MultiwayBranchFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<MultiwayBranchFacetData>;
  const { lines, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const steps = trace(lines);

  // 걸음 0 — 첫 발신은 문 밖에 둔다 (마운트 직후 빈 화면을 두지 않는다)
  await ctx.emit({
    type: 'init',
    payload: { lines: lines.map((l) => ({ indent: l.indent, text: l.text, kind: l.stmt.k })) },
  });

  for (const step of steps) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'step', payload: step });
  }
}
