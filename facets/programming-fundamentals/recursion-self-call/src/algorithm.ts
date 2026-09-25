/**
 * recursion-self-call — 함수가 자기 이름을 부르면 흐름은 어디로 가는가.
 *
 * 자료는 줄 목록이다. 줄마다 화면 글자(`text`)와 그 줄이 하는 일의 구조(`stmt`)를 둔다.
 * 이 알고리즘이 구조를 해석해 밟는 차례 · 인자 · 조건의 참거짓 · 깊이 · 출력을 셈한다.
 * 걸음표를 손으로 적지 않는다 — 해석기가 밟은 자취가 곧 걸음이다.
 *
 * 걸음 규약 (줄 걸음)
 *   - 걸음 0 은 시작 (`init`). 아무 줄도 밟지 않았다
 *   - 밟은 줄 하나 = 한 걸음. 조건 셈은 그 머리줄의 걸음 안에서 일어난다
 *   - `function` · `else` 줄은 밟지 않는다
 *   - 부르기가 든 줄을 밟는 걸음이 곧 부르는 걸음(`call`)이다. 다음 걸음이 피호출 몸의 첫 줄이다
 *   - 재생은 **처음으로 조건이 거짓인 걸음**에서 멈춘다 — 가장 깊은 호출의 바닥 검사다.
 *     되돌아 나가는 길은 이 조각이 그리지 않는다. 그 전에 함수가 돌아오는 자료면 던진다
 *
 * 이벤트 (전부 silent 아님 — 하나가 한 걸음)
 *   init  { rows: { indent: number; text: string; role: 'def' | 'body' | 'top' }[];
 *           fn: string; params: string[]; maxDepth: number }
 *         프로그램 전체와, 멈출 때까지 쌓일 가장 깊은 깊이
 *   call  { line: number; depth: number; fn: string; args: (number | string)[]; self: boolean }
 *         line = 부르는 줄(0 부터), depth = 부르는 쪽의 깊이(맨 바깥 0),
 *         self = 부르는 쪽이 이미 같은 함수의 몸 안에 있는가
 *   line  { line: number; depth: number;
 *           cond?: { l: number | string; op: string; r: number | string; value: boolean };
 *           out?: string }
 *         cond = 이 줄이 셈한 조건 (양쪽 값과 결과), out = 이 줄이 출력에 더한 한 줄
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Expr =
  | { num: number }
  | { str: string }
  | { var: string }
  | { op: string; l: Expr; r: Expr }
  | { call: string; args: Expr[] };

export type Stmt =
  | { k: 'function'; name: string; params: string[] }
  | { k: 'if' | 'elseIf' | 'while'; cond: Expr }
  | { k: 'show'; value: Expr }
  | { k: 'else' }
  | { k: 'expr'; value: Expr }
  | { k: 'assign'; to: string; value: Expr }
  | { k: 'return'; value?: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type RecursionSelfCallFacetData = {
  type: 'recursion-self-call';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  lines: CodeLine[];
};

type Val = number | string;

type CondMark = { l: Val; op: string; r: Val; value: boolean };

type Walk =
  | { kind: 'call'; line: number; depth: number; fn: string; args: Val[]; self: boolean }
  | { kind: 'line'; line: number; depth: number; cond?: CondMark; out?: string };

/** 처음 거짓인 조건(또는 취소)에서 해석을 끊는 신호 */
class Cut {}

const COMPARE: Record<string, (a: number, b: number) => boolean> = {
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
};

const ARITH: Record<string, (a: number, b: number) => number> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
};

/**
 * 줄 목록을 밟아 걸음 자취를 남긴다. 처음 거짓인 조건의 걸음까지.
 * `stop` 이 참이 되면 그 자리에서 끊는다 (루프마다 첫머리에서 본다 — C8).
 */
export function walkProgram(lines: CodeLine[], stop: () => boolean): Walk[] {
  const walks: Walk[] = [];
  const defs = new Map<string, number>();
  lines.forEach((ln, i) => {
    if (ln.stmt.k === 'function') defs.set(ln.stmt.name, i);
  });
  const globals = new Map<string, Val>();
  const frames: { fn: string; vars: Map<string, Val> }[] = [];
  const scope = (): Map<string, Val> => frames[frames.length - 1]?.vars ?? globals;
  let shown: string | undefined;

  const body = (head: number): number[] => {
    const base = lines[head]!.indent;
    const out: number[] = [];
    for (let j = head + 1; j < lines.length && lines[j]!.indent > base; j += 1) {
      if (stop()) throw new Cut();
      if (lines[j]!.indent === base + 1) out.push(j);
    }
    return out;
  };

  const num = (v: Val | boolean, at: number): number => {
    if (typeof v !== 'number') throw new Error(`L${at + 1}: 수가 아닌 값`);
    return v;
  };

  const evalExpr = (e: Expr, at: number): Val | boolean => {
    if ('num' in e) return e.num;
    if ('str' in e) return e.str;
    if ('var' in e) {
      const v = scope().get(e.var);
      if (v === undefined) throw new Error(`L${at + 1}: 정의되지 않은 ${e.var}`);
      return v;
    }
    if ('op' in e) {
      const a = num(evalExpr(e.l, at), at);
      const b = num(evalExpr(e.r, at), at);
      const cmp = COMPARE[e.op];
      if (cmp) return cmp(a, b);
      const ar = ARITH[e.op];
      if (ar) return ar(a, b);
      throw new Error(`L${at + 1}: 모르는 연산 ${e.op}`);
    }
    const args = e.args.map((a) => {
      const v = evalExpr(a, at);
      if (typeof v === 'boolean') throw new Error(`L${at + 1}: 참거짓을 인자로 넘기지 않는다`);
      return v;
    });
    return invoke(e.call, args, at);
  };

  const invoke = (name: string, args: Val[], at: number): Val => {
    const head = defs.get(name);
    if (head === undefined) throw new Error(`L${at + 1}: 정의되지 않은 함수 ${name}`);
    const def = lines[head]!.stmt;
    if (def.k !== 'function') throw new Error('function 줄이 아니다');
    const self = frames[frames.length - 1]?.fn === name;
    walks.push({ kind: 'call', line: at, depth: frames.length, fn: name, args, self });
    const vars = new Map<string, Val>();
    def.params.forEach((p, i) => vars.set(p, args[i]!));
    frames.push({ fn: name, vars });
    if (walks.length > 400) throw new Error('걸음이 너무 많다');
    run(body(head));
    // 끝까지 가서 돌아오는 길은 이 조각이 그리지 않는다
    throw new Error(`${name} 이 돌아왔다 — 이 조각은 들어가는 길만 그린다`);
  };

  const condMark = (e: Expr, at: number): CondMark => {
    const value = evalExpr(e, at);
    if (typeof value !== 'boolean') throw new Error(`L${at + 1}: 조건이 참거짓이 아니다`);
    if ('op' in e) {
      const l = evalExpr(e.l, at);
      const r = evalExpr(e.r, at);
      if (typeof l !== 'boolean' && typeof r !== 'boolean') return { l, op: e.op, r, value };
    }
    throw new Error(`L${at + 1}: 비교 조건만 다룬다`);
  };

  const stepLine = (at: number, cond?: CondMark): void => {
    const w: Walk = { kind: 'line', line: at, depth: frames.length };
    if (cond) w.cond = cond;
    if (shown !== undefined) w.out = shown;
    shown = undefined;
    walks.push(w);
    if (cond && !cond.value) throw new Cut();
  };

  const run = (idxs: number[]): void => {
    for (let k = 0; k < idxs.length; k += 1) {
      if (stop()) throw new Cut();
      const at = idxs[k]!;
      const st = lines[at]!.stmt;
      if (st.k === 'function') continue;
      if (st.k === 'if') {
        let m = k + 1;
        const chain = [at];
        while (m < idxs.length) {
          if (stop()) throw new Cut();
          const kk = lines[idxs[m]!]!.stmt.k;
          if (kk !== 'elseIf' && kk !== 'else') break;
          chain.push(idxs[m]!);
          m += 1;
        }
        for (const c of chain) {
          if (stop()) throw new Cut();
          const cs = lines[c]!.stmt;
          if (cs.k === 'else') {
            run(body(c));
            break;
          }
          if (cs.k !== 'if' && cs.k !== 'elseIf') break;
          const mark = condMark(cs.cond, c);
          stepLine(c, mark);
          if (mark.value) {
            run(body(c));
            break;
          }
        }
        k = m - 1;
        continue;
      }
      if (st.k === 'while') {
        for (let guard = 0; guard < 200; guard += 1) {
          if (stop()) throw new Cut();
          const mark = condMark(st.cond, at);
          stepLine(at, mark);
          if (!mark.value) break;
          run(body(at));
        }
        continue;
      }
      if (st.k === 'assign') {
        const v = evalExpr(st.value, at);
        if (typeof v === 'boolean') throw new Error(`L${at + 1}: 참거짓을 담지 않는다`);
        scope().set(st.to, v);
        stepLine(at);
        continue;
      }
      if (st.k === 'show') {
        const v = evalExpr(st.value, at);
        if (typeof v === 'boolean') throw new Error(`L${at + 1}: 참거짓은 이 조각의 출력에 없다`);
        shown = String(v);
        stepLine(at);
        continue;
      }
      if (st.k === 'expr') {
        evalExpr(st.value, at);
        stepLine(at);
        continue;
      }
      throw new Error(`L${at + 1}: 이 조각이 다루지 않는 문 ${st.k}`);
    }
  };

  try {
    run(lines.map((l, i) => (l.indent === 0 ? i : -1)).filter((i) => i >= 0));
  } catch (err) {
    if (!(err instanceof Cut)) throw err;
  }
  return walks;
}

/** 자료에서 프로그램 모양(화면 글자 · 역할)을 뽑는다 */
function programRows(lines: CodeLine[]): { indent: number; text: string; role: 'def' | 'body' | 'top' }[] {
  return lines.map((ln) => ({
    indent: ln.indent,
    text: ln.text,
    role: ln.stmt.k === 'function' ? 'def' : ln.indent === 0 ? 'top' : 'body',
  }));
}

export async function recursionSelfCall(
  context: FacetContext<RecursionSelfCallFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<RecursionSelfCallFacetData>;
  const { lines, stepMs } = ctx.data;
  const walks = walkProgram(lines, () => ctx.cancelled);
  if (ctx.cancelled) return;
  const firstCall = walks.find((w) => w.kind === 'call');
  const fn = firstCall && firstCall.kind === 'call' ? firstCall.fn : '';
  const def = lines.find((l) => l.stmt.k === 'function' && l.stmt.name === fn)?.stmt;
  const params = def && def.k === 'function' ? def.params : [];
  const maxDepth = walks.reduce((m, w) => Math.max(m, w.kind === 'call' ? w.depth + 1 : w.depth), 0);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 — 첫 걸음은 문 밖에 둔다 (마운트 직후 빈 화면을 두지 않는다)
  await ctx.emit({ type: 'init', payload: { rows: programRows(lines), fn, params, maxDepth } });

  for (const w of walks) {
    if (!(await pause())) return;
    if (w.kind === 'call') {
      await ctx.emit({
        type: 'call',
        payload: { line: w.line, depth: w.depth, fn: w.fn, args: w.args, self: w.self },
      });
    } else {
      await ctx.emit({
        type: 'line',
        payload: {
          line: w.line,
          depth: w.depth,
          ...(w.cond ? { cond: w.cond } : {}),
          ...(w.out !== undefined ? { out: w.out } : {}),
        },
      });
    }
  }
}
