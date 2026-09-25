/**
 * call-stack-unwind — 재귀 호출은 어떤 차례로 끝나며, 돌려준 값은 어디로 가는가.
 *
 * 1차 데이터는 줄 목록이다. 줄마다 화면 글자(`text`)와 그 줄이 하는 일의 구조(`stmt`)가 있다.
 * 아래 `traceCalls` 가 그 구조를 실제로 밟아(파이썬 의미) 틀이 서고 걷히는 사건을 남기고,
 * 알고리즘은 그 사건을 **호출 걸음**으로 발신한다.
 *
 * 걸음 규약 (호출 걸음):
 *   걸음 0  시작 — 첫 장면. 아무 틀도 서지 않았다. 발신하지 않고 stepMs 만큼 머문다
 *   push    틀 하나가 선다 — 한 걸음
 *   pop     틀 하나가 걷힌다 — 한 걸음. 그 틀이 돌려준 값이 부른 자리(한 층 아래 틀, 또는 바깥)의
 *           빈자리에 들어간다. 받은 틀의 `n * ▢` 셈은 그 틀 자신의 pop 걸음에서 끝난다
 *
 * 이벤트 (전부 silent 아님 — 하나가 한 걸음):
 *   push  payload { fn: string, args: Value[], callLine: number, depth: number, maxDepth: number }
 *           fn        부른 함수 이름
 *           args      인자 값
 *           callLine  부른 줄의 번호 (0 부터 — 화면은 L 번호로 1 을 더한다)
 *           depth     새로 선 틀의 깊이 (맨 바깥 0, 틀마다 1)
 *           maxDepth  이 프로그램에서 가장 깊이 서는 틀의 깊이 — 무대가 행 수를 정한다
 *   pop   payload { depth: number, value: Value, retLine: number | null }
 *           depth     걷히는 틀의 깊이
 *           value     돌려준 값 (몸이 끝까지 가면 null)
 *           retLine   돌려준 `return` 줄 번호 (0 부터). 몸이 끝까지 가서 돌아가면 null
 *
 * `ctx.metric` 은 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Value = number | string | boolean | null;

export type BinOp = '+' | '-' | '*' | '<' | '<=' | '>' | '>=' | '==' | '!=';

export type Expr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { op: BinOp; l: Expr; r: Expr }
  | { call: string; args: Expr[] };

export type Stmt =
  | { k: 'assign'; to: string; value: Expr }
  | { k: 'expr'; value: Expr }
  | { k: 'if'; cond: Expr }
  | { k: 'elif'; cond: Expr }
  | { k: 'while'; cond: Expr }
  | { k: 'else' }
  | { k: 'def'; name: string; params: string[] }
  | { k: 'return'; value?: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type CallStackUnwindFacetData = {
  type: 'call-stack-unwind';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  lines: CodeLine[];
};

export type CallEvent =
  | { kind: 'push'; fn: string; args: Value[]; callLine: number; depth: number }
  | { kind: 'pop'; fn: string; value: Value; retLine: number | null; depth: number };

export type CallTrace = {
  events: CallEvent[];
  /** 가장 깊이 선 틀의 깊이 */
  maxDepth: number;
  /** 바깥 변수 — 프로그램이 끝난 뒤 */
  globals: Record<string, Value>;
};

/** 사건 · 틀 수의 안전 한도. 한도를 넘는 프로그램은 이 조각의 소재가 아니다. */
const EVENT_LIMIT = 500;
const FRAME_LIMIT = 64;

class Returned {
  constructor(
    readonly value: Value,
    readonly line: number,
  ) {}
}

function num(v: Value, what: string): number {
  if (typeof v !== 'number') throw new Error(`${what}: 수가 아니다 (${String(v)})`);
  return v;
}

function applyOp(op: BinOp, a: Value, b: Value): Value {
  switch (op) {
    case '+':
      if (typeof a === 'string' && typeof b === 'string') return a + b;
      return num(a, '+') + num(b, '+');
    case '-':
      return num(a, '-') - num(b, '-');
    case '*':
      return num(a, '*') * num(b, '*');
    case '<':
      return num(a, '<') < num(b, '<');
    case '<=':
      return num(a, '<=') <= num(b, '<=');
    case '>':
      return num(a, '>') > num(b, '>');
    case '>=':
      return num(a, '>=') >= num(b, '>=');
    case '==':
      return a === b;
    case '!=':
      return a !== b;
  }
}

/**
 * 줄 구조를 파이썬 의미로 밟아 틀이 서고 걷히는 사건을 남긴다. 순수 함수다.
 */
export function traceCalls(lines: readonly CodeLine[]): CallTrace {
  const funcs = new Map<string, number>();
  lines.forEach((l, i) => {
    if (l.stmt.k === 'def') funcs.set(l.stmt.name, i);
  });
  const events: CallEvent[] = [];
  const globals: Record<string, Value> = {};
  const frames: Record<string, Value>[] = [];
  let maxDepth = 0;

  const vars = (): Record<string, Value> => frames[frames.length - 1] ?? globals;

  const record = (e: CallEvent): void => {
    if (events.length >= EVENT_LIMIT) throw new Error('사건이 너무 많다');
    events.push(e);
  };

  // 머리줄 i 의 몸 — 아래로 들여쓰기가 더 깊은 줄이 이어지는 동안, 한 칸 깊은 줄들
  const body = (i: number): number[] => {
    const ind = lines[i]!.indent;
    const out: number[] = [];
    for (let j = i + 1; j < lines.length && lines[j]!.indent > ind; j += 1) {
      if (lines[j]!.indent === ind + 1) out.push(j);
    }
    return out;
  };

  const evalExpr = (e: Expr, line: number): Value => {
    if ('num' in e) return e.num;
    if ('str' in e) return e.str;
    if ('var' in e) {
      const v = vars()[e.var];
      if (v === undefined) throw new Error(`정의되지 않은 이름: ${e.var}`);
      return v;
    }
    if ('op' in e) return applyOp(e.op, evalExpr(e.l, line), evalExpr(e.r, line));
    const args = e.args.map((a) => evalExpr(a, line));
    if (e.call === 'print') return null;
    return invoke(e.call, args, line);
  };

  const invoke = (name: string, args: Value[], line: number): Value => {
    const di = funcs.get(name);
    if (di === undefined) throw new Error(`정의되지 않은 함수: ${name}`);
    const def = lines[di]!.stmt;
    if (def.k !== 'def') throw new Error(`함수가 아니다: ${name}`);
    if (frames.length >= FRAME_LIMIT) throw new Error('틀이 너무 깊다');
    const fr: Record<string, Value> = {};
    def.params.forEach((p, j) => {
      fr[p] = args[j] ?? null;
    });
    frames.push(fr);
    const depth = frames.length;
    if (depth > maxDepth) maxDepth = depth;
    record({ kind: 'push', fn: name, args, callLine: line, depth });
    let value: Value = null;
    let retLine: number | null = null;
    try {
      run(body(di));
    } catch (x) {
      if (!(x instanceof Returned)) throw x;
      value = x.value;
      retLine = x.line;
    }
    frames.pop();
    record({ kind: 'pop', fn: name, value, retLine, depth });
    return value;
  };

  const run = (idxs: readonly number[]): void => {
    let k = 0;
    while (k < idxs.length) {
      const i = idxs[k]!;
      const st = lines[i]!.stmt;
      if (st.k === 'def') {
        k += 1;
        continue;
      }
      if (st.k === 'if') {
        let m = k + 1;
        const chain = [i];
        while (m < idxs.length) {
          const kk = lines[idxs[m]!]!.stmt.k;
          if (kk !== 'elif' && kk !== 'else') break;
          chain.push(idxs[m]!);
          m += 1;
        }
        for (const c of chain) {
          const cs = lines[c]!.stmt;
          if (cs.k === 'else') {
            run(body(c));
            break;
          }
          if ((cs.k === 'if' || cs.k === 'elif') && evalExpr(cs.cond, c) === true) {
            run(body(c));
            break;
          }
        }
        k = m;
        continue;
      }
      if (st.k === 'while') {
        let guard = 0;
        while (evalExpr(st.cond, i) === true) {
          guard += 1;
          if (guard > EVENT_LIMIT) throw new Error('while 이 너무 오래 돈다');
          run(body(i));
        }
        k += 1;
        continue;
      }
      if (st.k === 'assign') {
        vars()[st.to] = evalExpr(st.value, i);
      } else if (st.k === 'expr') {
        evalExpr(st.value, i);
      } else if (st.k === 'return') {
        throw new Returned(st.value === undefined ? null : evalExpr(st.value, i), i);
      } else {
        throw new Error(`홀로 선 ${st.k} 줄: L${i + 1}`);
      }
      k += 1;
    }
  };

  const top: number[] = [];
  lines.forEach((l, i) => {
    if (l.indent === 0) top.push(i);
  });
  run(top);
  return { events, maxDepth, globals };
}

export async function callStackUnwind(
  context: FacetContext<CallStackUnwindFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<CallStackUnwindFacetData>;
  const stepMs = ctx.data.stepMs;
  const { events, maxDepth } = traceCalls(ctx.data.lines);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0(시작)은 첫 장면이다 — 프로그램과 빈 바깥이 서 있으니 빈 화면이 아니다.
  // 그 걸음도 읽을 틈(stepMs)을 가진다.
  for (const ev of events) {
    if (!(await pause())) return;
    if (ev.kind === 'push') {
      await ctx.emit({
        type: 'push',
        payload: {
          fn: ev.fn,
          args: [...ev.args],
          callLine: ev.callLine,
          depth: ev.depth,
          maxDepth,
        },
      });
    } else {
      await ctx.emit({
        type: 'pop',
        payload: { depth: ev.depth, value: ev.value, retLine: ev.retLine },
      });
    }
  }
}
