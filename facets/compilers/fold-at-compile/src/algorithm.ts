/**
 * fold-at-compile — 상수 폴딩. 컴파일러가 식 나무의 연산 마디를 하나씩 보고, 두 자식이 다 수이면
 * 그 자리에서 셈해 수 하나로 바꾼다. 한쪽이라도 이름이면 그대로 둔다. 상수 전파는 하지 않는다 —
 * 앞 줄에서 수로 정해진 이름도 이름으로 남는다.
 *
 * 차례: 줄은 위 → 아래, 한 줄의 식 안은 뒤차례(왼쪽 자식 → 오른쪽 자식 → 자기).
 * 연산 마디 하나 = 한 걸음. 접지 않은 마디도 한 걸음이다.
 *
 * 이벤트 (모두 silent 아님 — 걸음 하나씩):
 *   - `fold`  { line: number; path: string; value: number }
 *       line  — 1 부터 센 줄 번호
 *       path  — 그 줄 식의 뿌리에서 마디까지의 길 ('' = 뿌리, 'l' · 'r' 을 이어 붙인다)
 *       value — 두 자식을 셈한 수 (정수)
 *   - `keep`  { line: number; path: string; blocked: 'left' | 'right' | 'both' }
 *       blocked — 수가 아니어서 접지 못하게 한 쪽
 *
 * 걸음 0(시작)은 장면의 `initial()` 이 `initialData` 에서 채운다. 앞 프로그램이 이미 읽을 것이라
 * 첫 발신 앞에도 `stepMs` 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type OpSym = '+' | '-' | '*' | '<';

export type Expr =
  | { num: number }
  | { var: string }
  | { op: OpSym; l: Expr; r: Expr };

export type Stmt =
  | { k: 'function'; name: string; params: string[] }
  | { k: 'let'; name: string; value: Expr }
  | { k: 'set'; name: string; value: Expr }
  | { k: 'return'; value: Expr };

export type ProgLine = { indent: number; text: string; stmt: Stmt };

export type FoldAtCompileFacetData = {
  type: 'fold-at-compile';
  stepMs: number;
  lines: ProgLine[];
};

export type Side = 'left' | 'right' | 'both';

/** 화면에 찍히는 글자 조각 하나. `path` 는 그 조각을 낸 마디의 길. */
export type ExprToken = {
  text: string;
  path: string;
  role: 'num' | 'var' | 'op' | 'open' | 'close';
};

const PREC: Record<OpSym, number> = { '<': 0, '+': 1, '-': 1, '*': 2 };
const OPS: readonly string[] = ['+', '-', '*', '<'];

function fail(line: number, why: string): never {
  throw new Error(`fold-at-compile: L${line} — ${why}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readExpr(v: unknown, line: number): Expr {
  if (!isRecord(v)) fail(line, '식이 객체가 아니다');
  if ('num' in v) {
    if (typeof v.num !== 'number' || !Number.isSafeInteger(v.num)) fail(line, '수가 정수가 아니다');
    return { num: v.num };
  }
  if ('var' in v) {
    if (typeof v.var !== 'string' || v.var === '') fail(line, '이름이 비었다');
    return { var: v.var };
  }
  if ('op' in v) {
    if (typeof v.op !== 'string' || !OPS.includes(v.op)) fail(line, `모르는 연산 ${String(v.op)}`);
    return { op: v.op as OpSym, l: readExpr(v.l, line), r: readExpr(v.r, line) };
  }
  fail(line, '이 조각이 모르는 식 모양');
}

function readStmt(v: unknown, line: number): Stmt {
  if (!isRecord(v)) fail(line, '문이 객체가 아니다');
  const name = (): string => {
    if (typeof v.name !== 'string' || v.name === '') fail(line, '이름이 비었다');
    return v.name;
  };
  switch (v.k) {
    case 'function': {
      if (!Array.isArray(v.params) || !v.params.every((p) => typeof p === 'string' && p !== '')) {
        fail(line, '매개변수 목록이 틀렸다');
      }
      return { k: 'function', name: name(), params: [...(v.params as string[])] };
    }
    case 'let':
      return { k: 'let', name: name(), value: readExpr(v.value, line) };
    case 'set':
      return { k: 'set', name: name(), value: readExpr(v.value, line) };
    case 'return':
      return { k: 'return', value: readExpr(v.value, line) };
    default:
      fail(line, `이 조각이 모르는 문 ${String(v.k)}`);
  }
}

/** 식을 글자 조각으로 찍는다. 괄호는 안쪽이 낮을 때 · 오른쪽 자식이 같은 높이일 때만. */
export function exprTokens(e: Expr, path = '', parent?: OpSym, right = false): ExprToken[] {
  if ('num' in e) {
    return [{ text: e.num >= 0 ? String(e.num) : `(${e.num})`, path, role: 'num' }];
  }
  if ('var' in e) return [{ text: e.var, path, role: 'var' }];
  const inner: ExprToken[] = [
    ...exprTokens(e.l, `${path}l`, e.op, false),
    { text: e.op, path, role: 'op' },
    ...exprTokens(e.r, `${path}r`, e.op, true),
  ];
  const wrap =
    parent !== undefined && (PREC[e.op] < PREC[parent] || (right && PREC[e.op] === PREC[parent]));
  return wrap
    ? [{ text: '(', path, role: 'open' }, ...inner, { text: ')', path, role: 'close' }]
    : inner;
}

/** 글자 조각을 한 줄 글자로 잇는다 — 연산 기호 앞뒤에만 빈칸 하나. */
export function joinTokens(tokens: readonly ExprToken[]): string {
  let out = '';
  for (const tok of tokens) {
    if (tok.role === 'op') out += ` ${tok.text} `;
    else out += tok.text;
  }
  return out;
}

/** 문의 머리(식 앞 글자). 식이 없는 문은 머리가 곧 줄 전체다. */
export function stmtHead(s: Stmt): string {
  switch (s.k) {
    case 'function':
      return `function ${s.name}(${s.params.join(', ')})`;
    case 'let':
      return `let ${s.name} = `;
    case 'set':
      return `${s.name} = `;
    case 'return':
      return 'return ';
  }
}

export function stmtExpr(s: Stmt): Expr | null {
  return s.k === 'function' ? null : s.value;
}

export function lineText(s: Stmt): string {
  const e = stmtExpr(s);
  return stmtHead(s) + (e === null ? '' : joinTokens(exprTokens(e)));
}

/** 식 안의 연산 마디 수 — 실행 때 셈하는 연산 수. */
export function countOps(e: Expr): number {
  return 'op' in e ? 1 + countOps(e.l) + countOps(e.r) : 0;
}

/** `initialData.lines` 를 좁히고, 줄마다 글자가 구조에서 찍은 것과 같은지 대조한다. */
export function readProgram(data: unknown): ProgLine[] {
  if (!isRecord(data) || !Array.isArray(data.lines) || data.lines.length === 0) {
    throw new Error('fold-at-compile: initialData.lines 가 없다');
  }
  return data.lines.map((raw: unknown, i) => {
    const line = i + 1;
    if (!isRecord(raw)) fail(line, '줄이 객체가 아니다');
    if (typeof raw.indent !== 'number' || !Number.isInteger(raw.indent) || raw.indent < 0) {
      fail(line, '들여쓰기가 틀렸다');
    }
    if (typeof raw.text !== 'string') fail(line, '글자가 없다');
    const stmt = readStmt(raw.stmt, line);
    const printed = lineText(stmt);
    if (printed !== raw.text) fail(line, `글자가 구조와 어긋난다: "${raw.text}" ≠ "${printed}"`);
    return { indent: raw.indent, text: raw.text, stmt };
  });
}

function readStepMs(data: unknown): number {
  if (!isRecord(data) || typeof data.stepMs !== 'number' || !(data.stepMs > 0)) {
    throw new Error('fold-at-compile: initialData.stepMs 가 없다');
  }
  return data.stepMs;
}

function apply(op: OpSym, a: number, b: number, line: number): number {
  let v: number;
  switch (op) {
    case '+':
      v = a + b;
      break;
    case '-':
      v = a - b;
      break;
    case '*':
      v = a * b;
      break;
    case '<':
      fail(line, '견줌(<)은 정수가 아니라 접지 않는다 — 이 조각은 정수 연산만 접는다');
  }
  if (!Number.isSafeInteger(v)) fail(line, `셈한 값이 안전한 정수를 넘는다: ${a} ${op} ${b}`);
  return v;
}

export async function foldAtCompile(ctx: FacetContext<FoldAtCompileFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<FoldAtCompileFacetData>;
  const lines = readProgram(rc.data);
  const stepMs = readStepMs(rc.data);

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  /** 뒤차례로 마디를 본다. 접었으면 수를, 아니면 (자식이 접힌) 마디를 돌려준다. 취소면 null. */
  async function visit(e: Expr, line: number, path: string): Promise<Expr | null> {
    if (!('op' in e)) return e;
    const l = await visit(e.l, line, `${path}l`);
    if (l === null) return null;
    const r = await visit(e.r, line, `${path}r`);
    if (r === null) return null;
    if (!(await pause())) return null;
    if ('num' in l && 'num' in r) {
      const value = apply(e.op, l.num, r.num, line);
      await rc.emit({ type: 'fold', payload: { line, path, value } });
      return { num: value };
    }
    const blocked: Side = !('num' in l) && !('num' in r) ? 'both' : 'num' in l ? 'right' : 'left';
    await rc.emit({ type: 'keep', payload: { line, path, blocked } });
    return { op: e.op, l, r };
  }

  for (const [i, ln] of lines.entries()) {
    if (rc.cancelled) return;
    const e = stmtExpr(ln.stmt);
    if (e === null) continue;
    if ((await visit(e, i + 1, '')) === null) return;
  }
}
