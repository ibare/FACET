/**
 * table-per-scope — 컴파일러가 글을 위에서 아래로 한 번 읽으며 스코프마다 이름 표를 얹고,
 * 선언을 맨 위 표에 적고, 몸이 끝나면 맨 위 표를 통째로 걷는다.
 *
 * 프로그램을 돌리지 않는다. 값을 셈하지 않고 부르기를 따라가지 않는다 — 함수 몸도 `for` 몸도
 * 글에 한 번 있으니 한 번 읽는다. 이름의 쓰임은 걸음이 아니다 (찾기는 이 조각의 말이 아니다).
 * 쓰임은 데이터가 맞는지 보려고 조용히 찾아만 본다 — 못 찾으면 던진다.
 *
 * 스코프 규칙 (이 장난감 언어의 규칙):
 *   - 스코프 = 맨 바깥 하나 + 머리줄(`function` · `if` · `for`)의 몸마다 하나. 몸 = 머리줄 아래로
 *     들여쓰기가 더 깊은 줄이 이어지는 동안
 *   - 선언 = `let 이름` · `function 이름` · 함수의 인자 · `for` 의 변수
 *   - `let` · `function f` 의 이름은 그 줄이 속한 몸(= 지금 맨 위 표)에 든다. 인자와 `for` 변수는
 *     새로 얹히는 표에 처음부터 든다
 *   - 몸 둘이 같은 줄에서 끝나면 안쪽이 먼저 닫힌다
 *
 * 이벤트 (전부 silent 아님 — 하나가 한 걸음):
 *   open     { line: number, id: string, kind: 'function' | 'if' | 'for', owner: string | null,
 *              end: number, names: string[] }
 *            line 은 머리줄 번호(1 부터), end 는 몸의 마지막 줄 번호, names 는 표에 처음부터 드는 이름
 *   declare  { line: number, name: string, id: string }
 *            id 는 이름이 적히는 표 (늘 맨 위 표)
 *   close    { line: number, id: string }
 *            line 은 몸의 마지막 줄 번호 — 그 줄 **뒤**에서 표가 걷힌다
 *
 * 걸음 0 은 장면의 `initial()` 이 채운다 — 프로그램 전체와 빈 맨 바깥 표 하나.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Expr =
  | { k: 'int'; v: number }
  | { k: 'float'; v: number }
  | { k: 'bool'; v: boolean }
  | { k: 'string'; v: string }
  | { k: 'var'; name: string }
  | { k: 'op'; op: string; l: Expr; r: Expr }
  | { k: 'call'; name: string; args: Expr[] };

export type Stmt =
  | { k: 'let'; name: string; type?: string; value: Expr }
  | { k: 'assign'; to: string; value: Expr }
  | { k: 'function'; name: string; params: string[] }
  | { k: 'return'; value: Expr }
  | { k: 'if'; cond: Expr }
  | { k: 'for'; var: string; lo: Expr; hi: Expr }
  | { k: 'show'; value: Expr }
  | { k: 'expr'; value: Expr };

export type ProgramLine = { indent: number; text: string; stmt: Stmt };

export type TablePerScopeFacetData = {
  type: 'table-per-scope';
  stepMs: number;
  lines: ProgramLine[];
};

const OPS = new Set(['+', '-', '*', '/', 'div', 'mod', '<', '<=', '>', '>=', '==', '!=', 'and', 'or']);

/** 식 안의 이름 쓰임을 글자 차례(왼쪽 → 오른쪽)로 모은다. 모르는 모양은 던진다. */
function exprNames(e: Expr, line: number, out: string[]): string[] {
  switch (e.k) {
    case 'int':
    case 'float':
    case 'bool':
    case 'string':
      return out;
    case 'var':
      out.push(e.name);
      return out;
    case 'op':
      if (!OPS.has(e.op)) throw new Error(`L${line}: 모르는 연산자 ${e.op}`);
      exprNames(e.l, line, out);
      exprNames(e.r, line, out);
      return out;
    case 'call':
      out.push(e.name);
      for (const a of e.args) exprNames(a, line, out);
      return out;
    default:
      throw new Error(`L${line}: 모르는 식 모양 ${JSON.stringify(e)}`);
  }
}

/** 한 줄의 쓰임. `let` 은 식 안만, `assign` 은 왼쪽 이름이 먼저, `for` 는 lo · hi. */
function stmtUses(st: Stmt, line: number): string[] {
  switch (st.k) {
    case 'let':
      return exprNames(st.value, line, []);
    case 'assign':
      return exprNames(st.value, line, [st.to]);
    case 'return':
    case 'show':
    case 'expr':
      return exprNames(st.value, line, []);
    case 'if':
      return exprNames(st.cond, line, []);
    case 'for':
      return exprNames(st.hi, line, exprNames(st.lo, line, []));
    case 'function':
      return [];
    default:
      throw new Error(`L${line}: 모르는 문 모양 ${JSON.stringify(st)}`);
  }
}

/** 머리줄 i(0 부터)의 몸이 끝나는 줄 번호(1 부터 — 몸의 마지막 줄). 빈 몸은 던진다. */
function bodyEnd(lines: ProgramLine[], i: number): number {
  const head = lines[i];
  if (head === undefined) throw new Error(`L${i + 1}: 줄이 없다`);
  let j = i + 1;
  for (; j < lines.length; j += 1) {
    const ln = lines[j];
    if (ln === undefined || ln.indent <= head.indent) break;
  }
  if (j === i + 1) throw new Error(`L${i + 1}: 몸이 비었다`);
  return j;
}

type OpenTable = { id: string; end: number; names: string[] };

export async function tablePerScope(
  ctxBase: FacetContext<TablePerScopeFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<TablePerScopeFacetData>;
  const { lines, stepMs } = ctx.data;
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('lines 가 비었다');
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('stepMs 가 없다');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 맨 바깥 표는 걸음 0 부터 있고 끝까지 걷히지 않는다.
  const pile: OpenTable[] = [{ id: 'top', end: lines.length, names: [] }];

  /** 줄 i(0 부터)에 들어서기 전에, 그 앞에서 끝난 몸의 표를 안쪽부터 걷는다. */
  async function closeUntil(i: number): Promise<boolean> {
    for (;;) {
      if (ctx.cancelled) return false;
      const top = pile[pile.length - 1];
      if (top === undefined || pile.length === 1 || top.end > i) return true;
      if (!(await pause())) return false;
      pile.pop();
      await ctx.emit({ type: 'close', payload: { line: top.end, id: top.id } });
    }
  }

  function topTable(line: number): OpenTable {
    const top = pile[pile.length - 1];
    if (top === undefined) throw new Error(`L${line}: 표가 하나도 없다`);
    return top;
  }

  function checkFresh(table: OpenTable, name: string, line: number): void {
    if (table.names.includes(name)) throw new Error(`L${line}: ${name} 을 한 몸 안에서 두 번 선언했다`);
  }

  /** 쓰임을 안쪽 표부터 바깥으로 찾아본다 — 걸음이 아니다. 못 찾으면 데이터가 틀렸다. */
  function checkResolves(name: string, line: number): void {
    for (let d = pile.length - 1; d >= 0; d -= 1) {
      const table = pile[d];
      if (table === undefined) break;
      if (table.names.includes(name)) return;
    }
    throw new Error(`L${line}: 선언 없는 이름 ${name}`);
  }

  for (let i = 0; i < lines.length; i += 1) {
    if (!(await closeUntil(i))) return;
    const ln = lines[i];
    if (ln === undefined) throw new Error(`L${i + 1}: 줄이 없다`);
    const line = i + 1;
    const st = ln.stmt;
    for (const u of stmtUses(st, line)) checkResolves(u, line);

    if (st.k === 'let' || st.k === 'function') {
      const top = topTable(line);
      checkFresh(top, st.name, line);
      if (!(await pause())) return;
      top.names.push(st.name);
      await ctx.emit({ type: 'declare', payload: { line, name: st.name, id: top.id } });
    }

    if (st.k === 'function' || st.k === 'if' || st.k === 'for') {
      const end = bodyEnd(lines, i);
      const names = st.k === 'function' ? [...st.params] : st.k === 'for' ? [st.var] : [];
      if (new Set(names).size !== names.length) throw new Error(`L${line}: 같은 인자 이름이 둘이다`);
      const id = st.k === 'function' ? `fn-${st.name}` : `${st.k}-L${line}`;
      const owner = st.k === 'function' ? st.name : null;
      if (!(await pause())) return;
      pile.push({ id, end, names: [...names] });
      await ctx.emit({
        type: 'open',
        payload: { line, id, kind: st.k, owner, end, names },
      });
    }
  }
  await closeUntil(lines.length);
}
