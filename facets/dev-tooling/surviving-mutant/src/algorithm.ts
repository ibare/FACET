/**
 * surviving-mutant — 코드의 한 자리를 바꾼 사본(변이)마다 시험이 차례로 달려든다.
 * 하나라도 떨어지면 그 변이는 잡혀 죽고, 모두 통과하면 살아남는다.
 *
 * 화면 코드(가상 표기)를 작은 해석기로 **실제로 돌려** 판정한다. 결과를 적어 두지 않는다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *
 * - `run` — 한 사본에 시험 하나를 돌렸다
 *   payload: {
 *     copy: number      // 0 = 원본, 1.. = mutants[copy - 1]
 *     test: number      // tests 의 자리 (0 부터)
 *     got: string       // 사본이 돌려준 글자
 *     want: string      // 시험이 기대한 글자
 *     pass: boolean     // got == want
 *     verdict: 'none' | 'killed' | 'survived'
 *                       // killed = 이 시험이 잡았다(남은 시험 건너뜀),
 *                       // survived = 마지막 시험까지 모두 통과했다. 원본은 늘 none
 *   }
 * - `score` — 끝. payload: { killed: number, total: number }
 *   백분율은 `mutationPercent(killed, total)` 로 그림이 셈한다
 *
 * 원본이 시험에 떨어지거나, 모르는 줄 모양 · 코드 밖 줄 번호를 만나면 줄 번호를 담아 던진다 (C6).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TestCase = { id: string; text: string };
export type Mutant = { id: string; line: number; text: string };

export type SurvivingMutantFacetData = {
  type: 'surviving-mutant';
  stepMs: number;
  code: string[];
  tests: TestCase[];
  mutants: Mutant[];
};

export type Verdict = 'none' | 'killed' | 'survived';

type Op = '>=' | '<=' | '>' | '<' | '==' | '!=';
const OPS: readonly Op[] = ['>=', '<=', '>', '<', '==', '!='];

type Stmt =
  | { line: number; indent: number; kind: 'if'; name: string; op: Op; num: number }
  | { line: number; indent: number; kind: 'return'; value: string };

type Program = { name: string; param: string; body: Stmt[] };

const INDENT = 4;

function parseOp(text: string, line: number): Op {
  for (const op of OPS) if (op === text) return op;
  throw new Error(`surviving-mutant: 줄 ${line} — 모르는 견줌 '${text}'`);
}

/** 화면 코드를 읽는다. 줄 번호는 1 부터. */
export function parseProgram(code: readonly string[]): Program {
  const head = /^function ([A-Za-z]\w*)\(([A-Za-z]\w*)\)$/.exec(code[0] ?? '');
  if (!head) throw new Error('surviving-mutant: 줄 1 — function 정의가 아니다');
  const body: Stmt[] = [];
  for (let i = 1; i < code.length; i += 1) {
    const raw = code[i] as string;
    const line = i + 1;
    const indent = raw.length - raw.trimStart().length;
    if (indent === 0 || indent % INDENT !== 0) {
      throw new Error(`surviving-mutant: 줄 ${line} — 들여쓰기가 넷의 배수가 아니다`);
    }
    const text = raw.trim();
    const cond = /^if ([A-Za-z]\w*) (\S+) (-?\d+)$/.exec(text);
    if (cond) {
      body.push({
        line,
        indent,
        kind: 'if',
        name: cond[1] as string,
        op: parseOp(cond[2] as string, line),
        num: Number(cond[3]),
      });
      continue;
    }
    const ret = /^return "([^"]*)"$/.exec(text);
    if (ret) {
      body.push({ line, indent, kind: 'return', value: ret[1] as string });
      continue;
    }
    throw new Error(`surviving-mutant: 줄 ${line} — 모르는 문 '${text}'`);
  }
  return { name: head[1] as string, param: head[2] as string, body };
}

function compare(a: number, op: Op, b: number): boolean {
  switch (op) {
    case '>=':
      return a >= b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '<':
      return a < b;
    case '==':
      return a === b;
    case '!=':
      return a !== b;
  }
}

/** stmts[start..] 중 들여쓰기 indent 의 몸을 돌린다. 돌려준 글자 또는 null(몸이 끝남). */
function execBlock(
  p: Program,
  start: number,
  indent: number,
  arg: number,
): { value: string | null; next: number } {
  let i = start;
  while (i < p.body.length) {
    const s = p.body[i] as Stmt;
    if (s.indent < indent) break;
    if (s.indent > indent) throw new Error(`surviving-mutant: 줄 ${s.line} — 뜻밖의 들여쓰기`);
    if (s.kind === 'return') return { value: s.value, next: i + 1 };
    if (s.name !== p.param) throw new Error(`surviving-mutant: 줄 ${s.line} — 없는 이름 '${s.name}'`);
    const inner = p.body[i + 1];
    if (!inner || inner.indent !== indent + INDENT) {
      throw new Error(`surviving-mutant: 줄 ${s.line} — if 의 몸이 없다`);
    }
    let end = i + 1;
    while (end < p.body.length && (p.body[end] as Stmt).indent > indent) end += 1;
    if (compare(arg, s.op, s.num)) {
      const r = execBlock(p, i + 1, indent + INDENT, arg);
      if (r.value !== null) return r;
    }
    i = end;
  }
  return { value: null, next: i };
}

/** 프로그램을 인자 하나로 부른다. */
export function callProgram(p: Program, arg: number): string {
  const r = execBlock(p, 0, INDENT, arg);
  if (r.value === null) throw new Error(`surviving-mutant: ${p.name} 이 아무것도 돌려주지 않고 끝났다`);
  return r.value;
}

/** 시험 글자 `name(n) == "want"` 을 읽는다. */
export function parseTest(t: TestCase): { name: string; arg: number; want: string } {
  const m = /^([A-Za-z]\w*)\((-?\d+)\) == "([^"]*)"$/.exec(t.text);
  if (!m) throw new Error(`surviving-mutant: 시험 ${t.id} — 모르는 모양 '${t.text}'`);
  return { name: m[1] as string, arg: Number(m[2]), want: m[3] as string };
}

/** 원본 코드에서 한 줄을 바꾼 사본. */
export function applyMutant(code: readonly string[], m: Mutant): string[] {
  if (!Number.isInteger(m.line) || m.line < 1 || m.line > code.length) {
    throw new Error(`surviving-mutant: 변이 ${m.id} — 줄 ${m.line} 이 코드 밖이다`);
  }
  return code.map((text, i) => (i + 1 === m.line ? m.text : text));
}

/** 표시용 백분율 — 소수 없이, 0.5 는 올림. 셈은 정수로 끝까지 한다. */
export function mutationPercent(killed: number, total: number): number {
  if (total <= 0) throw new Error('surviving-mutant: 변이가 없다');
  return Math.floor((200 * killed + total) / (2 * total));
}

function runTest(code: readonly string[], t: TestCase): { got: string; want: string } {
  const prog = parseProgram(code);
  const test = parseTest(t);
  if (test.name !== prog.name) {
    throw new Error(`surviving-mutant: 시험 ${t.id} — '${test.name}' 은 코드에 없다`);
  }
  return { got: callProgram(prog, test.arg), want: test.want };
}

export async function survivingMutant(ctx: FacetContext<SurvivingMutantFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<SurvivingMutantFacetData>;
  const { code, tests, mutants, stepMs } = rctx.data;
  if (tests.length === 0) throw new Error('surviving-mutant: 시험이 없다');

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 원본 — 걸음 0 에 코드가 이미 있으니 첫 발신 앞에도 읽을 틈을 둔다
  for (let ti = 0; ti < tests.length; ti += 1) {
    if (!(await pause())) return;
    const t = tests[ti] as TestCase;
    const r = runTest(code, t);
    if (r.got !== r.want) {
      throw new Error(`surviving-mutant: 원본이 시험 ${t.id} 에 떨어졌다 ("${r.got}" ≠ "${r.want}")`);
    }
    await rctx.emit({
      type: 'run',
      payload: { copy: 0, test: ti, got: r.got, want: r.want, pass: true, verdict: 'none' },
    });
  }

  let killed = 0;
  for (let mi = 0; mi < mutants.length; mi += 1) {
    if (rctx.cancelled) return;
    const copy = applyMutant(code, mutants[mi] as Mutant);
    for (let ti = 0; ti < tests.length; ti += 1) {
      if (!(await pause())) return;
      const r = runTest(copy, tests[ti] as TestCase);
      const pass = r.got === r.want;
      const verdict: Verdict = !pass ? 'killed' : ti === tests.length - 1 ? 'survived' : 'none';
      await rctx.emit({
        type: 'run',
        payload: { copy: mi + 1, test: ti, got: r.got, want: r.want, pass, verdict },
      });
      if (!pass) {
        killed += 1;
        break;
      }
    }
  }

  if (!(await pause())) return;
  await rctx.emit({ type: 'score', payload: { killed, total: mutants.length } });
}
