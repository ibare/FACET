/**
 * which-condition-decided — `and` 로 묶인 두 조건 가운데 결정을 실제로 가른 것이
 * 어느 조건인지, 시험의 짝으로 보인다 (변형 조건 · 결정 커버리지 MC/DC).
 *
 * 화면 코드(`initialData.code`)를 작은 해석기로 읽어 시험마다 실제로 돌린다.
 * 조건값은 **입력이 정한다** — `and` 의 단락 평가로 읽히지 않는 조건도 값을 셈한다.
 *
 * 걸음 차례는 데이터 순회에서 나온다 — 시험을 돌린 차례대로 하나씩 돌리고, 돌린
 * 시험이 둘 이상이면 아직 확인되지 않은 조건을 선언 차례로 하나씩 짝 찾기 한다.
 *
 * 이벤트 (모두 silent 아님 — 한 걸음씩):
 *   run   { test: number, conds: boolean[], decision: boolean }
 *         test 는 initialData.tests 의 자리, conds 는 initialData.conditions 차례의 조건값
 *   pair  { cond: number, found: true, first: number, second: number }
 *         조건 cond 의 짝 — 그 조건 값만 다르고 다른 조건 값은 같으며 결정이 다른 두 시험.
 *         first < second 는 돌린 차례의 자리. 여럿이면 사전순 첫 짝
 *   pair  { cond: number, found: false, same: boolean | null }
 *         짝이 없음. same 은 돌린 시험 모두가 그 조건에서 같은 값이면 그 값, 아니면 null
 *
 * 알 수 없는 코드 모양 · 없는 이름 · 인자 수 어긋남은 줄 번호를 담아 던진다 (C6).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ConditionSpec = { id: string; text: string };
export type TestSpec = { id: string; args: (number | boolean)[] };

export type WhichConditionDecidedFacetData = {
  type: 'which-condition-decided';
  stepMs: number;
  code: string[];
  conditions: ConditionSpec[];
  tests: TestSpec[];
};

/** 해석한 프로그램 — 매개변수 · 결정을 이루는 조건 자리 · 두 반환값. */
export type Program = {
  params: string[];
  /** `if` 의 `and` 항 차례대로, conditions 에서의 자리 */
  terms: number[];
  whenTrue: boolean;
  whenFalse: boolean;
};

export type TestRun = { conds: boolean[]; decision: boolean };

const INDENT = '    ';

function parseBool(word: string, lineNo: number): boolean {
  if (word === 'true') return true;
  if (word === 'false') return false;
  throw new Error(`줄 ${lineNo}: 참 · 거짓 값이 아니다 — ${word}`);
}

/** 화면 코드 넷 줄을 읽는다. 모르는 모양은 줄 번호와 함께 던진다. */
export function parseProgram(code: readonly string[], conditions: readonly ConditionSpec[]): Program {
  if (code.length !== 4) throw new Error(`코드는 넷 줄이어야 한다 — ${code.length} 줄`);
  const head = /^function \w+\(([^)]*)\)$/.exec(code[0]!);
  if (head === null) throw new Error(`줄 1: 함수 정의 모양이 아니다 — ${code[0]}`);
  const params = head[1]!.split(', ');
  const cond = new RegExp(`^${INDENT}if (.+)$`).exec(code[1]!);
  if (cond === null) throw new Error(`줄 2: if 문이 아니다 — ${code[1]}`);
  const parts = cond[1]!.split(' and ');
  const terms = parts.map((part) => {
    const at = conditions.findIndex((c) => c.text === part);
    if (at < 0) throw new Error(`줄 2: 선언되지 않은 조건 — ${part}`);
    return at;
  });
  if (terms.length !== conditions.length) {
    throw new Error(`줄 2: 조건 수가 선언과 다르다 — ${terms.length} / ${conditions.length}`);
  }
  const ret3 = new RegExp(`^${INDENT}${INDENT}return (\\w+)$`).exec(code[2]!);
  if (ret3 === null) throw new Error(`줄 3: return 문이 아니다 — ${code[2]}`);
  const ret4 = new RegExp(`^${INDENT}return (\\w+)$`).exec(code[3]!);
  if (ret4 === null) throw new Error(`줄 4: return 문이 아니다 — ${code[3]}`);
  return {
    params,
    terms,
    whenTrue: parseBool(ret3[1]!, 3),
    whenFalse: parseBool(ret4[1]!, 4),
  };
}

function lookup(env: ReadonlyMap<string, number | boolean>, name: string): number | boolean {
  const v = env.get(name);
  if (v === undefined) throw new Error(`줄 2: 없는 이름 — ${name}`);
  return v;
}

/** 조건 글자 하나를 입력으로 셈한다. `이름 견줌 수` 또는 `이름` 두 모양만 안다. */
function evalCondition(text: string, env: ReadonlyMap<string, number | boolean>): boolean {
  const cmp = /^(\w+) (>=|<=|>|<|==|!=) (-?\d+)$/.exec(text);
  if (cmp !== null) {
    const left = lookup(env, cmp[1]!);
    if (typeof left !== 'number') throw new Error(`줄 2: 수가 아닌 값을 견준다 — ${cmp[1]}`);
    const right = Number(cmp[3]);
    switch (cmp[2]) {
      case '>=': return left >= right;
      case '<=': return left <= right;
      case '>': return left > right;
      case '<': return left < right;
      case '==': return left === right;
      case '!=': return left !== right;
      default: throw new Error(`줄 2: 모르는 연산자 — ${cmp[2]}`);
    }
  }
  if (/^\w+$/.test(text)) {
    const v = lookup(env, text);
    if (typeof v !== 'boolean') throw new Error(`줄 2: 참 · 거짓이 아닌 값 — ${text}`);
    return v;
  }
  throw new Error(`줄 2: 모르는 조건 모양 — ${text}`);
}

/**
 * 시험 하나를 돌린다. 조건값은 모두 입력에서 셈한다 (단락 평가와 무관).
 * 결정은 `and` 이므로 모든 항이 참일 때만 참 쪽 반환값.
 */
export function runTest(
  program: Program,
  conditions: readonly ConditionSpec[],
  args: readonly (number | boolean)[],
): TestRun {
  if (args.length !== program.params.length) {
    throw new Error(`줄 1: 인자 수가 매개변수 수와 다르다 — ${args.length} / ${program.params.length}`);
  }
  const env = new Map<string, number | boolean>();
  program.params.forEach((p, i) => env.set(p, args[i]!));
  const conds = conditions.map((c) => evalCondition(c.text, env));
  const all = program.terms.every((at) => conds[at] === true);
  return { conds, decision: all ? program.whenTrue : program.whenFalse };
}

/**
 * 조건 `cond` 의 짝. 그 조건 값만 다르고 다른 조건 값은 모두 같으며 결정이 다른 두 시험을,
 * 돌린 차례로 사전순 첫 짝으로 고른다. 없으면 null.
 */
export function findPair(
  ran: readonly TestRun[],
  cond: number,
): { first: number; second: number } | null {
  for (let i = 0; i < ran.length; i += 1) {
    for (let j = i + 1; j < ran.length; j += 1) {
      const a = ran[i]!;
      const b = ran[j]!;
      if (a.conds[cond] === b.conds[cond]) continue;
      const othersSame = a.conds.every((v, k) => k === cond || v === b.conds[k]);
      if (othersSame && a.decision !== b.decision) return { first: i, second: j };
    }
  }
  return null;
}

/** 입력 글자 — `(20, true)`. 코드 표기의 값 그대로다. */
export function argsText(args: readonly (number | boolean)[]): string {
  return `(${args.map((v) => String(v)).join(', ')})`;
}

/** 조건 글자가 화면 코드의 `if` 줄 어느 칸에서 시작하는가 (줄 · 칸 모두 0 부터). 매개변수 이름과 헷갈리지 않게 `if` 줄에서만 찾는다. */
export function locateCondition(code: readonly string[], text: string): { line: number; col: number } {
  const line = code.findIndex((l) => l.trimStart().startsWith('if '));
  if (line < 0) throw new Error('코드에 if 줄이 없다');
  const col = code[line]!.indexOf(text);
  if (col < 0) throw new Error(`줄 ${line + 1}: 없는 조건 글자 — ${text}`);
  return { line, col };
}

export async function whichConditionDecided(
  ctx0: FacetContext<WhichConditionDecidedFacetData>,
): Promise<void> {
  const ctx = ctx0 as ReactiveContext<WhichConditionDecidedFacetData>;
  const { code, conditions, tests, stepMs } = ctx.data;
  const program = parseProgram(code, conditions);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const ran: TestRun[] = [];
  const confirmed = new Set<number>();

  // 걸음 0 은 이미 코드와 시험 셋이 선 화면이라, 첫 발신 앞에도 읽을 틈을 둔다.
  for (let t = 0; t < tests.length; t += 1) {
    if (!(await pause())) return;
    const result = runTest(program, conditions, tests[t]!.args);
    ran.push(result);
    await ctx.emit({
      type: 'run',
      payload: { test: t, conds: [...result.conds], decision: result.decision },
    });
    if (ran.length < 2) continue;
    for (let c = 0; c < conditions.length; c += 1) {
      if (ctx.cancelled) return;
      if (confirmed.has(c)) continue;
      if (!(await pause())) return;
      const pair = findPair(ran, c);
      if (pair !== null) {
        confirmed.add(c);
        await ctx.emit({
          type: 'pair',
          payload: { cond: c, found: true, first: pair.first, second: pair.second },
        });
      } else {
        const v0 = ran[0]!.conds[c]!;
        const same = ran.every((r) => r.conds[c] === v0) ? v0 : null;
        await ctx.emit({ type: 'pair', payload: { cond: c, found: false, same } });
      }
    }
  }
}
