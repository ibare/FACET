/**
 * no-side-effect — 함수를 부른 뒤에도 바깥은 부르기 전 그대로인가.
 *
 * 1차 데이터는 줄 목록이다. 줄마다 화면 글자(`text`)와 그 줄이 하는 일의 구조(`stmt`)를 둔다.
 * 알고리즘은 이 구조를 작은 해석기로 실제로 밟아, 걸음마다 무엇을 불렀고 무엇을 돌려받았는지,
 * 몸 안에서 바깥 이름에 무엇을 썼는지, 부르기 전과 뒤의 바깥이 어땠는지를 셈한다.
 * 글자를 파싱하지 않는다. 걸음표를 손으로 적지 않는다.
 *
 * 걸음 규약 — 문 걸음.
 *   - 걸음 0 = 시작 (`init`). 프로그램 전체가 보이고 아무 문도 밟지 않았다.
 *   - 맨 위(들여쓰기 0)의 문 하나 = 한 걸음 (`step`). `function` 머리줄은 밟지 않는다 —
 *     시작 전에 정의돼 있다.
 *   - 부르기가 든 줄은 함수 몸에 들어가 돌려받기까지가 그 한 걸음 안이다. 몸 안에서 일어난
 *     바깥 쓰기는 그 걸음의 사건이다.
 *   - "바깥에 쓴다" = 함수 몸의 대입이 그 함수의 인자 · 지역 이름이 아닌 이름에 넣는 것.
 *
 * 이벤트 (silent 없음 — 모두 걸음 경계다)
 *   init  payload: {
 *           lines: { indent: number; text: string }[];
 *           functions: { name: string; header: number; last: number }[]   // 줄 번호는 0 기반
 *         }
 *   step  payload: {
 *           line: number;                          // 밟은 맨 위 줄 (0 기반)
 *           declared: { name: string; value: number } | null;
 *           call: { fn: string; args: number[]; header: number; returnLine: number; value: number } | null;
 *           writes: { line: number; name: string; before: number; after: number }[];
 *           outerBefore: { name: string; value: number }[];
 *           outerAfter: { name: string; value: number }[];
 *           shown: number | null;                  // show 가 찍은 값
 *           readOuter: string | null;              // 맨 위에서 show 가 곧바로 읽은 바깥 이름
 *         }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 식. `sim.py` 의 모양 그대로. */
export type Expr =
  | { num: number }
  | { var: string }
  | { op: '+' | '*' | '>' | '==' | 'mod' | 'div'; l: Expr; r: Expr }
  | { call: string; args: Expr[] };

/** 문. */
export type Stmt =
  | { k: 'assign'; to: string; value: Expr; declare?: boolean }
  | { k: 'show'; value: Expr }
  | { k: 'function'; name: string; params: string[] }
  | { k: 'return'; value: Expr }
  | { k: 'if'; cond: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type NoSideEffectFacetData = {
  type: 'no-side-effect';
  stepMs: number;
  lines: CodeLine[];
};

type FnValue = { name: string; params: string[]; header: number };
type Value = number | FnValue;
type NamedValue = { name: string; value: number };
type Write = { line: number; name: string; before: number; after: number };
type CallRecord = { fn: string; args: number[]; header: number; returnLine: number; value: number };

/** 머리줄 i 의 몸 — 한 칸 깊은 줄들의 번호. */
export function bodyOf(lines: readonly { indent: number }[], i: number): number[] {
  const base = lines[i]!.indent;
  const out: number[] = [];
  for (let j = i + 1; j < lines.length && lines[j]!.indent > base; j += 1) {
    if (lines[j]!.indent === base + 1) out.push(j);
  }
  return out;
}

/** 머리줄 i 의 몸이 끝나는 줄 (더 깊은 줄이 이어지는 마지막). */
function lastOf(lines: readonly { indent: number }[], i: number): number {
  const base = lines[i]!.indent;
  let j = i;
  while (j + 1 < lines.length && lines[j + 1]!.indent > base) j += 1;
  return j;
}

class Interpreter {
  readonly outer = new Map<string, Value>();
  private readonly frames: Map<string, Value>[] = [];
  writes: Write[] = [];
  calls: CallRecord[] = [];
  readOuter: string | null = null;
  shown: number | null = null;

  constructor(private readonly lines: readonly CodeLine[]) {}

  private currentLine = -1;

  private read(name: string): Value {
    const frame = this.frames[this.frames.length - 1];
    if (frame && frame.has(name)) return frame.get(name)!;
    const v = this.outer.get(name);
    if (v === undefined) throw new Error(`선언 없는 이름: ${name}`);
    if (!frame && typeof v === 'number') this.readOuter = name;
    return v;
  }

  private write(name: string, v: Value, declare: boolean): void {
    const frame = this.frames[this.frames.length - 1];
    if (frame) {
      if (declare || frame.has(name)) {
        frame.set(name, v);
        return;
      }
      const before = this.outer.get(name);
      if (typeof before !== 'number' || typeof v !== 'number') throw new Error(`바깥 쓰기: ${name}`);
      this.outer.set(name, v);
      this.writes.push({ line: this.currentLine, name, before, after: v });
      return;
    }
    if (declare === this.outer.has(name)) throw new Error(`선언 규칙 어긋남: ${name}`);
    this.outer.set(name, v);
  }

  private num(e: Expr): number {
    const v = this.ev(e);
    if (typeof v !== 'number') throw new Error('수가 아니다');
    return v;
  }

  ev(e: Expr): Value {
    if ('num' in e) return e.num;
    if ('var' in e) return this.read(e.var);
    if ('op' in e) {
      const a = this.num(e.l);
      const b = this.num(e.r);
      switch (e.op) {
        case '+': return a + b;
        case '*': return a * b;
        case '>': return a > b ? 1 : 0;
        case '==': return a === b ? 1 : 0;
        case 'mod': return a % b;
        case 'div': return Math.trunc(a / b);
      }
    }
    const fn = this.read(e.call);
    if (typeof fn === 'number') throw new Error(`부를 수 없다: ${e.call}`);
    const args = e.args.map((a) => this.num(a));
    return this.invoke(fn, args);
  }

  private invoke(fn: FnValue, args: number[]): number {
    this.frames.push(new Map(fn.params.map((p, i) => [p, args[i]!] as [string, Value])));
    const back = this.block(bodyOf(this.lines, fn.header));
    this.frames.pop();
    if (!back) throw new Error(`${fn.name} 가 돌려주지 않았다`);
    this.calls.push({ fn: fn.name, args, header: fn.header, returnLine: back.line, value: back.value });
    return back.value;
  }

  /** 몸을 밟는다. return 을 만나면 그 줄과 값. */
  block(idxs: readonly number[]): { line: number; value: number } | null {
    for (const i of idxs) {
      const s = this.lines[i]!.stmt;
      this.currentLine = i;
      if (s.k === 'function') continue;
      if (s.k === 'assign') this.write(s.to, this.ev(s.value), s.declare === true);
      else if (s.k === 'show') this.shown = this.num(s.value);
      else if (s.k === 'return') return { line: i, value: this.num(s.value) };
      else if (this.num(s.cond) !== 0) {
        const r = this.block(bodyOf(this.lines, i));
        if (r) return r;
      }
    }
    return null;
  }

  outerNumbers(): NamedValue[] {
    const out: NamedValue[] = [];
    for (const [name, value] of this.outer) if (typeof value === 'number') out.push({ name, value });
    return out;
  }
}

export async function noSideEffect(context: FacetContext<NoSideEffectFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<NoSideEffectFacetData>;
  const { lines, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const run = new Interpreter(lines);
  const top: number[] = [];
  const functions: { name: string; header: number; last: number }[] = [];
  lines.forEach((ln, i) => {
    if (ln.indent !== 0) return;
    if (ln.stmt.k !== 'function') top.push(i);
    else {
      run.outer.set(ln.stmt.name, { name: ln.stmt.name, params: ln.stmt.params, header: i });
      functions.push({ name: ln.stmt.name, header: i, last: lastOf(lines, i) });
    }
  });

  await ctx.emit({
    type: 'init',
    payload: { lines: lines.map((ln) => ({ indent: ln.indent, text: ln.text })), functions },
  });

  for (const i of top) {
    if (!(await pause())) return;
    const s = lines[i]!.stmt;
    const outerBefore = run.outerNumbers();
    run.writes = [];
    run.calls = [];
    run.readOuter = null;
    run.shown = null;
    run.block([i]);
    const outerAfter = run.outerNumbers();
    const declared =
      s.k === 'assign' && s.declare === true
        ? (outerAfter.find((o) => o.name === s.to) ?? null)
        : null;
    await ctx.emit({
      type: 'step',
      payload: {
        line: i,
        declared,
        call: run.calls[run.calls.length - 1] ?? null,
        writes: run.writes,
        outerBefore,
        outerAfter,
        shown: run.shown,
        readOuter: run.calls.length === 0 ? run.readOuter : null,
      },
    });
  }
}
