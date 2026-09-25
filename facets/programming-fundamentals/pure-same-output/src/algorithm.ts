/**
 * pure-same-output 알고리즘 — 같은 인자로 두 함수를 세 번씩 부르고, 출력이 같은지 본다.
 *
 * 1차 데이터는 줄 목록이다. 줄마다 화면 글자(`text`)와 그 줄이 하는 일의 구조(`stmt`)가 있고,
 * 이 파일이 구조를 해석해 걸음 · 출력 · 바깥 값을 셈한다. 글자를 파싱하지 않는다.
 *
 * 걸음은 **문 걸음**이다.
 *  - 걸음 0 = 시작. 프로그램 전체가 보이고 아무 문도 밟지 않았다 (`init`).
 *  - 맨 위(들여쓰기 0)의 문 하나 = 한 걸음. `function` 머리줄과 그 몸은 맨 위의 문이 아니다.
 *  - 부르기가 든 `show` 줄은 함수 몸에 들어가 돌려받기까지가 그 한 걸음이다. 몸이 읽은 바깥 이름과
 *    그 값은 그 걸음이 가진다. "바깥" = 함수의 인자 · 지역 이름이 아닌 이름.
 *
 * 발신 이벤트 (모두 silent 아님, 하나가 한 걸음):
 *  - `init`   { lines: { indent: number; text: string }[];
 *               lanes: { name: string; header: number; body: number[]; outer: string[] }[];
 *               maxOut: number; rows: number }
 *      lanes = 코드에 정의된 함수 (정의 차례). header · body 는 줄 번호(0 부터).
 *      outer = 몸이 읽는 바깥 이름 (몸의 식에서 셈). maxOut = 모든 출력의 최댓값.
 *      rows = 한 함수를 가장 많이 부른 횟수.
 *  - `assign` { line: number; name: string; value: number }
 *      맨 위의 문이 바깥 이름에 값을 넣었다.
 *  - `call`   { line: number; lane: number; args: number[]; out: number;
 *               reads: { name: string; value: number }[] }
 *      `show f(…)` — lane 번 함수를 불러 out 을 돌려받아 내보냈다. reads = 몸이 읽은 바깥 값 (읽은 차례).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PureExpr =
  | { num: number }
  | { var: string }
  | { op: string; l: PureExpr; r: PureExpr }
  | { call: string; args: PureExpr[] };

export type PureStmt =
  | { k: 'assign'; to: string; value: PureExpr; declare?: boolean }
  | { k: 'show'; value: PureExpr }
  | { k: 'function'; name: string; params: string[] }
  | { k: 'return'; value: PureExpr };

export type PureCodeLine = { indent: number; text: string; stmt: PureStmt };

export type PureSameOutputFacetData = {
  type: 'pure-same-output';
  stepMs: number;
  lines: PureCodeLine[];
};

type FnDef = { name: string; header: number; params: string[]; body: number[] };

export type PureStep =
  | { kind: 'assign'; line: number; name: string; value: number }
  | {
      kind: 'call';
      line: number;
      lane: number;
      args: number[];
      out: number;
      reads: { name: string; value: number }[];
    };

/** 함수 정의를 찾는다 — 머리줄 아래로 더 깊은 줄이 이어지는 동안이 몸, 그 가운데 한 칸 깊은 줄이 몸의 문. */
function collectFunctions(lines: PureCodeLine[]): FnDef[] {
  const fns: FnDef[] = [];
  lines.forEach((ln, i) => {
    if (ln.stmt.k !== 'function') return;
    const body: number[] = [];
    for (let j = i + 1; j < lines.length && lines[j].indent > ln.indent; j += 1) {
      if (lines[j].indent === ln.indent + 1) body.push(j);
    }
    fns.push({ name: ln.stmt.name, header: i, params: [...ln.stmt.params], body });
  });
  return fns;
}

/** 몸의 식에서 인자가 아닌 이름 — 몸이 읽는 바깥 이름 (처음 나온 차례). */
function outerNames(fn: FnDef, lines: PureCodeLine[]): string[] {
  const out: string[] = [];
  const walk = (e: PureExpr): void => {
    if ('var' in e) {
      if (!fn.params.includes(e.var) && !out.includes(e.var)) out.push(e.var);
    } else if ('op' in e) {
      walk(e.l);
      walk(e.r);
    } else if ('call' in e) {
      for (const a of e.args) walk(a);
    }
  };
  for (const i of fn.body) {
    const s = lines[i].stmt;
    if (s.k === 'return' || s.k === 'show') walk(s.value);
    else if (s.k === 'assign') walk(s.value);
  }
  return out;
}

function applyOp(op: string, a: number, b: number): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '>': return a > b ? 1 : 0;
    case '==': return a === b ? 1 : 0;
    case 'mod': return a % b;
    case 'div': return Math.floor(a / b);
    default: throw new Error(`pure-same-output: 모르는 연산 ${op}`);
  }
}

/** 프로그램을 밟아 맨 위의 문마다 한 걸음을 얻는다. */
export function traceProgram(lines: PureCodeLine[]): { fns: FnDef[]; steps: PureStep[] } {
  const fns = collectFunctions(lines);
  const globals = new Map<string, number>();
  const steps: PureStep[] = [];

  const evalExpr = (
    e: PureExpr,
    locals: Map<string, number> | null,
    reads: { name: string; value: number }[],
  ): number => {
    if ('num' in e) return e.num;
    if ('var' in e) {
      if (locals && locals.has(e.var)) return locals.get(e.var) as number;
      const v = globals.get(e.var);
      if (v === undefined) throw new Error(`pure-same-output: 없는 이름 ${e.var}`);
      if (locals) reads.push({ name: e.var, value: v });
      return v;
    }
    if ('op' in e) return applyOp(e.op, evalExpr(e.l, locals, reads), evalExpr(e.r, locals, reads));
    const fn = fns.find((f) => f.name === e.call);
    if (!fn) throw new Error(`pure-same-output: 없는 함수 ${e.call}`);
    const args = e.args.map((a) => evalExpr(a, locals, reads));
    return callFn(fn, args, reads);
  };

  const callFn = (fn: FnDef, args: number[], reads: { name: string; value: number }[]): number => {
    const locals = new Map<string, number>();
    fn.params.forEach((p, i) => locals.set(p, args[i]));
    for (const i of fn.body) {
      const s = lines[i].stmt;
      if (s.k === 'return') return evalExpr(s.value, locals, reads);
      if (s.k === 'assign' && s.declare) {
        locals.set(s.to, evalExpr(s.value, locals, reads));
        continue;
      }
      throw new Error(`pure-same-output: 몸에서 다루지 않는 문 ${s.k}`);
    }
    throw new Error(`pure-same-output: ${fn.name} 이 돌려주지 않는다`);
  };

  lines.forEach((ln, i) => {
    if (ln.indent !== 0) return;
    const s = ln.stmt;
    if (s.k === 'function') return;
    if (s.k === 'assign') {
      const value = evalExpr(s.value, null, []);
      globals.set(s.to, value);
      steps.push({ kind: 'assign', line: i, name: s.to, value });
      return;
    }
    if (s.k === 'show' && 'call' in s.value) {
      const callee = s.value.call;
      const lane = fns.findIndex((f) => f.name === callee);
      if (lane < 0) throw new Error(`pure-same-output: 없는 함수 ${callee}`);
      const args = s.value.args.map((a) => evalExpr(a, null, []));
      const reads: { name: string; value: number }[] = [];
      const out = callFn(fns[lane], args, reads);
      steps.push({ kind: 'call', line: i, lane, args, out, reads });
      return;
    }
    throw new Error(`pure-same-output: 맨 위에서 다루지 않는 문 ${s.k}`);
  });

  return { fns, steps };
}

export async function pureSameOutput(ctx: FacetContext<PureSameOutputFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<PureSameOutputFacetData>;
  const { lines, stepMs } = ctx.data;
  const { fns, steps } = traceProgram(lines);

  const outs = steps.flatMap((s) => (s.kind === 'call' ? [s.out] : []));
  const perLane = fns.map((_, k) => steps.filter((s) => s.kind === 'call' && s.lane === k).length);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 — 프로그램 전체가 이미 읽을 것이라 곧바로 세우고, 다음 걸음 앞에서 머문다.
  await ctx.emit({
    type: 'init',
    payload: {
      lines: lines.map((l) => ({ indent: l.indent, text: l.text })),
      lanes: fns.map((f) => ({
        name: f.name,
        header: f.header,
        body: [...f.body],
        outer: outerNames(f, lines),
      })),
      maxOut: Math.max(0, ...outs),
      rows: Math.max(0, ...perLane),
    },
  });

  for (let n = 0; n < steps.length; n += 1) {
    if (!(await pause())) return;
    const s = steps[n];
    if (s.kind === 'assign') {
      await ctx.emit({
        type: 'assign',
        payload: { line: s.line, name: s.name, value: s.value },
      });
    } else {
      await ctx.emit({
        type: 'call',
        payload: {
          line: s.line,
          lane: s.lane,
          args: [...s.args],
          out: s.out,
          reads: s.reads.map((r) => ({ ...r })),
        },
      });
    }
  }
}
