/**
 * loop-termination — 조건이 읽는 값을 몸이 바꾸지 않는 while 은 끝나지 않는다.
 *
 * 자료는 줄 목록이다. 줄마다 화면 글자(`text`)와 그 줄이 하는 일의 구조(`stmt`)가 있고,
 * 이 알고리즘이 구조를 해석해 밟는 차례 · 변수 값 · 조건의 답을 셈한다. 해석하는 문은
 * `assign`(`declare` 가 참이면 `let` 으로 처음 만드는 줄) · `show`(값 하나를 보인다) · `while` 셋이다.
 * `let` 으로 만든 이름은 그 몸 안에서만 산다 — 몸을 한 번 밟을 때마다 새 칸이 선다.
 *
 * 걸음은 줄 걸음이다 — 밟은 줄 하나가 한 걸음, 조건 셈은 머리줄의 걸음 안에서 일어난다.
 * 재생은 while 조건을 `whileCap` 번 셈한 걸음에서 멈춘다. 상한은 화면의 사정이다.
 * "끝나지 않는다" 의 근거는 상한이 아니라 구조에서 셈한다 — 조건이 읽는 변수 집합과
 * 루프 몸의 `assign` 이 쓰는 변수 집합의 겹침(`overlap`). 겹침이 비면 조건의 값이
 * 바뀔 길이 없다.
 *
 * 이벤트 (모두 걸음이다. silent 없음)
 *
 * - `init`   걸음 0. 프로그램 전체가 보이고 아무 줄도 밟지 않았다.
 *            payload: {
 *              lines: { indent: number; text: string }[];
 *              loop: number;        // 첫 while 줄의 자리 (0 부터). 없으면 -1
 *              reads: string[];     // 그 조건이 읽는 변수 (나오는 차례)
 *              writes: string[];    // 그 몸이 바깥 이름에 넣는 변수 (나오는 차례).
 *                                   // 몸 안의 `let` 은 몸 안에만 사는 새 이름이라 쓰기로 치지 않는다
 *              overlap: string[];   // reads ∩ writes
 *              names: string[];     // 프로그램이 값을 넣는 변수 전부 (나오는 차례)
 *              cap: number;         // whileCap
 *            }
 * - `assign` 대입 줄을 밟았다.
 *            payload: { line: number; name: string; value: number | string }
 * - `cond`   while 머리줄을 밟고 조건을 셈했다.
 *            payload: {
 *              line: number; answer: boolean;
 *              count: number;              // 몇 번째 조건 셈인가 (1 부터)
 *              shown: string;              // 조건 식에 지금 값을 넣은 코드 글자 (예: `0 < 3`)
 *              halt: boolean;              // 이 셈에서 재생이 멈추는가
 *            }
 * - `show`   값을 보이는 줄을 밟았다.
 *            payload: { line: number }
 *
 * 줄 자리(`line`)는 0 부터 센다. 화면의 줄 번호는 stage 가 1 을 더해 쓴다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LtOp = '+' | '-' | '*' | '<' | '<=' | '>' | '>=' | '==' | '!=';

export type LtExpr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { op: LtOp; l: LtExpr; r: LtExpr }
  | { call: string; args: LtExpr[] };

export type LtStmt =
  | { k: 'assign'; to: string; value: LtExpr; declare?: boolean }
  | { k: 'show'; value: LtExpr }
  | { k: 'while'; cond: LtExpr };

export type LtLine = { indent: number; text: string; stmt: LtStmt };

export type LoopTerminationFacetData = {
  type: 'loop-termination';
  stepMs: number;
  /** while 조건을 몇 번 셈한 걸음에서 재생을 멈추나 */
  whileCap: number;
  lines: LtLine[];
};

type Value = number | string | boolean;

/** 머리줄 i 의 몸 — 바로 아래, 들여쓰기가 더 깊은 동안 이어지는 줄 가운데 한 칸 깊은 줄들. */
function bodyOf(lines: LtLine[], i: number): number[] {
  const ind = lines[i].indent;
  const out: number[] = [];
  for (let j = i + 1; j < lines.length && lines[j].indent > ind; j += 1) {
    if (lines[j].indent === ind + 1) out.push(j);
  }
  return out;
}

/** 식이 읽는 변수 — 나오는 차례로, 겹치지 않게. */
function readsOf(e: LtExpr, out: string[] = []): string[] {
  if ('var' in e) {
    if (!out.includes(e.var)) out.push(e.var);
  } else if ('op' in e) {
    readsOf(e.l, out);
    readsOf(e.r, out);
  } else if ('call' in e) {
    for (const a of e.args) readsOf(a, out);
  }
  return out;
}

/**
 * 몸이 쓰는 변수 — 몸 안(더 깊은 줄 포함)에서 몸 바깥의 이름에 값을 넣는 대상.
 * 몸 안에서 `let` 으로 만든 이름은 몸 안에서만 살므로, 그 이름에 넣는 것은 바깥 이름을
 * 바꾸지 않는다 (선언이 있는 줄부터 그 이름은 몸 안의 것이다).
 */
function writesOf(lines: LtLine[], i: number): string[] {
  const out: string[] = [];
  const inner: string[] = [];
  const ind = lines[i].indent;
  for (let j = i + 1; j < lines.length && lines[j].indent > ind; j += 1) {
    const st = lines[j].stmt;
    if (st.k !== 'assign') continue;
    if (st.declare) {
      if (!inner.includes(st.to)) inner.push(st.to);
    } else if (!inner.includes(st.to) && !out.includes(st.to)) {
      out.push(st.to);
    }
  }
  return out;
}

/** 조건 식에 지금 값을 넣은 코드 글자. */
function showWith(e: LtExpr, env: Map<string, Value>): string {
  if ('num' in e) return String(e.num);
  if ('str' in e) return `"${e.str}"`;
  if ('var' in e) return show(env.get(e.var));
  if ('op' in e) return `${showWith(e.l, env)} ${e.op} ${showWith(e.r, env)}`;
  return `${e.call}(${e.args.map((a) => showWith(a, env)).join(', ')})`;
}

function show(v: Value | undefined): string {
  if (v === undefined) return '?';
  if (typeof v === 'string') return `"${v}"`;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function apply(op: LtOp, a: Value, b: Value): Value {
  switch (op) {
    case '+':
      return typeof a === 'number' && typeof b === 'number' ? a + b : `${a}${b}`;
    case '-':
      return Number(a) - Number(b);
    case '*':
      return Number(a) * Number(b);
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

export async function loopTermination(
  context: FacetContext<LoopTerminationFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<LoopTerminationFacetData>;
  const { lines, stepMs, whileCap } = ctx.data;

  /** 이름 칸의 층 — 맨 앞이 바깥. 몸을 밟을 때마다 새 층이 선다. */
  const scopes: Map<string, Value>[] = [new Map()];
  let whileCount = 0;

  function lookup(name: string): Value | undefined {
    for (let k = scopes.length - 1; k >= 0; k -= 1) {
      if (scopes[k].has(name)) return scopes[k].get(name);
    }
    return undefined;
  }

  function store(name: string, value: Value, declare: boolean): void {
    if (!declare) {
      for (let k = scopes.length - 1; k >= 0; k -= 1) {
        if (scopes[k].has(name)) {
          scopes[k].set(name, value);
          return;
        }
      }
    }
    scopes[scopes.length - 1].set(name, value);
  }

  /** 지금 보이는 이름과 값 — 안쪽 층이 바깥을 가린다. */
  function visible(): Map<string, Value> {
    const out = new Map<string, Value>();
    for (const s of scopes) for (const [k, v] of s) out.set(k, v);
    return out;
  }

  function evalExpr(e: LtExpr): Value {
    if ('num' in e) return e.num;
    if ('str' in e) return e.str;
    if ('var' in e) return lookup(e.var) ?? 0;
    if ('op' in e) return apply(e.op, evalExpr(e.l), evalExpr(e.r));
    // 부르기 — 이 조각의 프로그램에는 없다. 인자만 셈한다
    for (const a of e.args) evalExpr(a);
    return 0;
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  /** 줄 목록을 차례로 밟는다. 재생이 멈추거나 취소되면 거짓. */
  async function run(idxs: number[]): Promise<boolean> {
    for (const i of idxs) {
      if (ctx.cancelled) return false;
      const st = lines[i].stmt;
      if (st.k === 'assign') {
        const value = evalExpr(st.value);
        store(st.to, value, st.declare === true);
        if (!(await pause())) return false;
        await ctx.emit({
          type: 'assign',
          payload: { line: i, name: st.to, value: typeof value === 'boolean' ? show(value) : value },
        });
      } else if (st.k === 'show') {
        evalExpr(st.value);
        if (!(await pause())) return false;
        await ctx.emit({ type: 'show', payload: { line: i } });
      } else {
        const body = bodyOf(lines, i);
        for (;;) {
          if (ctx.cancelled) return false;
          const shown = showWith(st.cond, visible());
          const answer = Boolean(evalExpr(st.cond));
          whileCount += 1;
          const halt = whileCount >= whileCap;
          if (!(await pause())) return false;
          await ctx.emit({
            type: 'cond',
            payload: { line: i, answer, count: whileCount, shown, halt },
          });
          if (halt) return false;
          if (!answer) break;
          scopes.push(new Map());
          const ok = await run(body);
          scopes.pop();
          if (!ok) return false;
        }
      }
    }
    return true;
  }

  // 바탕 — 구조에서 셈한다
  const loop = lines.findIndex((l) => l.stmt.k === 'while');
  const loopStmt = loop >= 0 ? lines[loop].stmt : null;
  const reads = loopStmt && loopStmt.k === 'while' ? readsOf(loopStmt.cond) : [];
  const writes = loop >= 0 ? writesOf(lines, loop) : [];
  const overlap = reads.filter((n) => writes.includes(n));
  const names: string[] = [];
  for (const l of lines) {
    if (l.stmt.k === 'assign' && !names.includes(l.stmt.to)) names.push(l.stmt.to);
  }

  // 걸음 0 — 문 밖에서 곧바로 (첫 걸음 앞에 빈 화면을 두지 않는다)
  await ctx.emit({
    type: 'init',
    payload: {
      lines: lines.map((l) => ({ indent: l.indent, text: l.text })),
      loop,
      reads,
      writes,
      overlap,
      names,
      cap: whileCap,
    },
  });

  const top = lines.map((l, i) => (l.indent === 0 ? i : -1)).filter((i) => i >= 0);
  await run(top);
}
