/**
 * resolve-to-declaration — 이름을 쓰는 자리에서 그 이름을 선언한 자리로 선을 잇는다.
 *
 * 컴파일러는 원시 프로그램을 위에서 아래로, 한 줄 안에서는 왼쪽에서 오른쪽으로 한 번 읽는다.
 * 값을 셈하지 않고 부르기를 따라가지 않는다 — 함수 몸은 글에 있는 자리에서 읽는다.
 *
 * 스코프 = 맨 바깥 하나 + 머리줄(`function` · `if` · `for`)의 몸마다 하나. 선언은 `let 이름` ·
 * `function 이름`(그 줄이 속한 몸에 든다) · 인자(그 함수의 몸) · `for` 변수(그 `for` 의 몸).
 * 그 밖에 이름이 나오는 자리는 모두 쓰임이다. 쓰임 하나마다 가장 안쪽 스코프부터 한 겹씩 바깥으로
 * 넓혀 가며, 그 쓰임보다 위에서 선언된 같은 이름을 처음 만나는 자리에서 멈춘다.
 *
 * ## 발신하는 이벤트
 *
 * - `init` (silent) — 바탕. 줄 구조를 해석해 한 번 정한다.
 *   payload: {
 *     scopes: { kind: 'top' | 'function' | 'if' | 'for'; name: string | null;
 *               head: number | null; first: number; last: number }[]
 *       — 0 번이 맨 바깥. `head` 는 머리줄 번호(1 부터), `first`~`last` 는 몸의 줄 범위
 *     decls: { name: string; line: number; col: number; scope: number; slot: number; slots: number }[]
 *       — 글 차례. `col` 은 들여쓰기를 뺀 글자 안의 자리(0 부터), `slot`/`slots` 는 그 줄의 이름 자리 가운데 몇 번째 · 몇 개
 *     uses:  { name: string; line: number; col: number; slot: number; slots: number }[]
 *       — 쓰임의 글 차례 (위 → 아래, 한 줄 안은 왼쪽 → 오른쪽. 대입은 왼쪽 이름이 먼저)
 *   }
 * - `resolve` — 쓰임 하나를 선언에 잇는다. 한 걸음.
 *   payload: { use: number; decl: number; looked: number[] }
 *     — `use` · `decl` 은 init 의 목록 번호, `looked` 는 찾아본 스코프 번호 (안쪽 → 바깥, 마지막이 선언을 만난 스코프)
 *
 * 모르는 문 · 식 모양, 글자와 구조가 어긋나는 줄, 비어 있는 몸, 같은 몸 안의 두 번 선언,
 * 선언을 찾지 못한 쓰임은 줄 번호를 담아 던진다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Expr =
  | { int: number }
  | { float: number }
  | { bool: boolean }
  | { string: string }
  | { var: string }
  | { op: string; l: Expr; r: Expr }
  | { call: string; args: Expr[] };

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

export type ResolveToDeclarationFacetData = {
  type: 'resolve-to-declaration';
  stepMs: number;
  lines: ProgramLine[];
};

export type ScopeKind = 'top' | 'function' | 'if' | 'for';
export type ScopeInfo = {
  kind: ScopeKind;
  name: string | null;
  head: number | null;
  first: number;
  last: number;
};
export type DeclInfo = {
  name: string;
  line: number;
  col: number;
  scope: number;
  slot: number;
  slots: number;
};
export type UseInfo = { name: string; line: number; col: number; slot: number; slots: number };

const PREC: Record<string, number> = {
  or: 1,
  and: 2,
  '==': 3,
  '!=': 3,
  '<': 3,
  '<=': 3,
  '>': 3,
  '>=': 3,
  '+': 4,
  '-': 4,
  '*': 5,
  '/': 5,
  div: 5,
  mod: 5,
};

type Name = { name: string; col: number; role: 'use' | 'decl' };

/** 식을 글자로 찍으며 이름이 선 자리를 모은다. 글자 차례가 곧 쓰임의 차례다. */
function writeExpr(e: Expr, parent: number, out: { s: string; names: Name[] }, line: number): void {
  if ('int' in e || 'float' in e) {
    const v = 'int' in e ? e.int : e.float;
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`L${line}: 수 글자가 수가 아니다`);
    out.s += String(v);
    return;
  }
  if ('bool' in e) {
    out.s += e.bool ? 'true' : 'false';
    return;
  }
  if ('string' in e) {
    out.s += '"' + e.string + '"';
    return;
  }
  if ('var' in e) {
    out.names.push({ name: e.var, col: out.s.length, role: 'use' });
    out.s += e.var;
    return;
  }
  if ('call' in e) {
    out.names.push({ name: e.call, col: out.s.length, role: 'use' });
    out.s += e.call + '(';
    e.args.forEach((a, i) => {
      if (i > 0) out.s += ', ';
      writeExpr(a, 0, out, line);
    });
    out.s += ')';
    return;
  }
  if ('op' in e) {
    const p = PREC[e.op];
    if (p === undefined) throw new Error(`L${line}: 모르는 연산자 ${e.op}`);
    const paren = p < parent;
    if (paren) out.s += '(';
    writeExpr(e.l, p, out, line);
    out.s += ' ' + e.op + ' ';
    writeExpr(e.r, p + 1, out, line);
    if (paren) out.s += ')';
    return;
  }
  throw new Error(`L${line}: 모르는 식 모양`);
}

/** 문을 글자로 찍으며 이름 자리를 글자 차례로 모은다. */
function writeStmt(st: Stmt, line: number): { s: string; names: Name[] } {
  const out = { s: '', names: [] as Name[] };
  const decl = (name: string): void => {
    out.names.push({ name, col: out.s.length, role: 'decl' });
    out.s += name;
  };
  switch (st.k) {
    case 'let':
      out.s += 'let ';
      decl(st.name);
      if (st.type !== undefined) out.s += ': ' + st.type;
      out.s += ' = ';
      writeExpr(st.value, 0, out, line);
      return out;
    case 'assign':
      out.names.push({ name: st.to, col: 0, role: 'use' });
      out.s += st.to + ' = ';
      writeExpr(st.value, 0, out, line);
      return out;
    case 'function':
      out.s += 'function ';
      decl(st.name);
      out.s += '(';
      st.params.forEach((p, i) => {
        if (i > 0) out.s += ', ';
        decl(p);
      });
      out.s += ')';
      return out;
    case 'return':
      out.s += 'return ';
      writeExpr(st.value, 0, out, line);
      return out;
    case 'if':
      out.s += 'if ';
      writeExpr(st.cond, 0, out, line);
      return out;
    case 'for':
      out.s += 'for ';
      decl(st.var);
      out.s += ' from ';
      writeExpr(st.lo, 0, out, line);
      out.s += ' to ';
      writeExpr(st.hi, 0, out, line);
      return out;
    case 'show':
      out.s += 'show ';
      writeExpr(st.value, 0, out, line);
      return out;
    case 'expr':
      writeExpr(st.value, 0, out, line);
      return out;
    default:
      throw new Error(`L${line}: 모르는 문 모양`);
  }
}

export type Resolution = { use: number; decl: number; looked: number[] };

/** 글을 한 번 읽어 스코프 · 선언 · 쓰임을 세우고, 쓰임마다 선언을 찾는다. */
export function analyzeProgram(lines: ProgramLine[]): {
  scopes: ScopeInfo[];
  decls: DeclInfo[];
  uses: UseInfo[];
  resolutions: Resolution[];
} {
  const scopes: ScopeInfo[] = [{ kind: 'top', name: null, head: null, first: 1, last: lines.length }];
  const decls: DeclInfo[] = [];
  const uses: UseInfo[] = [];
  const resolutions: Resolution[] = [];
  // 열린 스코프 — 안쪽이 끝. table 은 이름 → decls 번호
  const open: { scope: number; table: Map<string, number> }[] = [{ scope: 0, table: new Map() }];

  const declare = (name: string, line: number, col: number, into: { scope: number; table: Map<string, number> }, slot: number, slots: number): void => {
    if (into.table.has(name)) throw new Error(`L${line}: 같은 몸에 ${name} 을 두 번 선언했다`);
    into.table.set(name, decls.length);
    decls.push({ name, line, col, scope: into.scope, slot, slots });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const ln = lines[i];
    const lineNo = i + 1;
    // 몸이 끝난 스코프를 닫는다 — 같은 줄에서 끝나면 안쪽이 먼저
    while (open.length > 1 && scopes[open[open.length - 1].scope].last < lineNo) open.pop();
    if (ln.indent !== open.length - 1) throw new Error(`L${lineNo}: 들여쓰기 ${ln.indent} 가 몸의 깊이와 맞지 않는다`);

    const written = writeStmt(ln.stmt, lineNo);
    if (written.s !== ln.text) throw new Error(`L${lineNo}: 글자 "${ln.text}" 와 구조 "${written.s}" 가 다르다`);
    const slots = written.names.length;
    const slotOf = (n: Name): number => written.names.indexOf(n);

    const resolveUse = (n: Name): void => {
      const useIdx = uses.length;
      uses.push({ name: n.name, line: lineNo, col: n.col, slot: slotOf(n), slots });
      const looked: number[] = [];
      for (let s = open.length - 1; s >= 0; s -= 1) {
        looked.push(open[s].scope);
        const found = open[s].table.get(n.name);
        if (found !== undefined) {
          resolutions.push({ use: useIdx, decl: found, looked });
          return;
        }
      }
      throw new Error(`L${lineNo}: ${n.name} 의 선언을 찾지 못했다`);
    };

    const st = ln.stmt;
    const useNames = written.names.filter((n) => n.role === 'use');
    const declNames = written.names.filter((n) => n.role === 'decl');
    const current = open[open.length - 1];

    if (st.k === 'function' || st.k === 'if' || st.k === 'for') {
      let j = i + 1;
      while (j < lines.length && lines[j].indent > ln.indent) j += 1;
      if (j === i + 1) throw new Error(`L${lineNo}: 몸이 비었다`);
      // 머리줄의 쓰임(if 조건 · for 범위)은 몸을 열기 전에 찾는다
      for (const n of useNames) resolveUse(n);
      const body = { scope: scopes.length, table: new Map<string, number>() };
      scopes.push({ kind: st.k, name: st.k === 'function' ? st.name : null, head: lineNo, first: lineNo + 1, last: j });
      if (st.k === 'function') {
        // 함수 이름은 그 줄이 속한 몸에 적은 뒤에 새 몸을 연다. 인자는 새 몸에 든다
        const [fname, ...params] = declNames;
        if (fname === undefined || params.length !== st.params.length) throw new Error(`L${lineNo}: 함수 머리줄의 이름 자리가 맞지 않는다`);
        declare(fname.name, lineNo, fname.col, current, slotOf(fname), slots);
        for (const p of params) declare(p.name, lineNo, p.col, body, slotOf(p), slots);
      } else if (st.k === 'for') {
        for (const d of declNames) declare(d.name, lineNo, d.col, body, slotOf(d), slots);
      }
      open.push(body);
    } else {
      // let 은 식 안의 쓰임을 먼저 찾고 그 뒤에 이름을 적는다
      for (const n of useNames) resolveUse(n);
      for (const d of declNames) declare(d.name, lineNo, d.col, current, slotOf(d), slots);
    }
  }
  return { scopes, decls, uses, resolutions };
}

export async function resolveToDeclaration(ctx: FacetContext<ResolveToDeclarationFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ResolveToDeclarationFacetData>;
  const { stepMs, lines } = rctx.data;
  const { scopes, decls, uses, resolutions } = analyzeProgram(lines);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  await rctx.emit({ type: 'init', payload: { scopes, decls, uses }, silent: true });
  // 걸음 0 은 프로그램 전체 — 읽을 틈을 두고 첫 쓰임으로 간다
  for (const r of resolutions) {
    if (!(await pause())) return;
    await rctx.emit({ type: 'resolve', payload: { use: r.use, decl: r.decl, looked: r.looked } });
  }
}
