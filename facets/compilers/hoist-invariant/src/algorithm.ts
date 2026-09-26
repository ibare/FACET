/**
 * hoist-invariant — 반복의 몸에서 바퀴마다 같은 값을 내는 줄을 반복 앞으로 꺼낸다.
 *
 * 1차 데이터는 줄 목록이다 (줄마다 들여쓰기 · 화면 글자 · 문 구조). 알고리즘은 반복의 몸을
 * 구조에서 찾고, 몸의 줄을 위 → 아래로 재어 불변 · 변함을 가른 뒤 불변인 줄을 몸에 있던
 * 차례대로 반복 머리줄 바로 앞으로 옮긴다. 걸음표를 손으로 적지 않는다.
 *
 * 불변 판정 (셋 다):
 *   (1) 그 줄이 넣는 이름을 몸에서 한 번만 넣는다
 *   (2) 읽는 이름마다 — 몸 밖에서 정해진 이름(매개변수 · 반복 앞의 이름)이거나 이미 불변으로
 *       판정된 줄이 넣는 이름이다. 반복 변수는 늘 바뀐다
 *   (3) 부르기가 없다
 * 새 불변이 생긴 판이 있으면 한 판 더 돈다. 걸음으로 세는 것은 첫 판의 판정뿐이다.
 *
 * 이벤트 (모두 silent 아님 — 한 걸음씩):
 *   judge  { line: number, invariant: boolean, block: 'none' | 'reassigned' | 'call',
 *            reads: { name: string, from: 'outer' | 'loop' | 'invariant' | 'body', at: number }[] }
 *          몸의 줄 하나를 판정했다. line · at 은 처음 프로그램의 줄 번호(0 부터).
 *          at 은 그 이름을 정한 줄 (매개변수면 함수 머리줄, 반복 변수면 반복 머리줄).
 *          첫 판은 몸의 줄마다 한 번. 뒤 판은 새로 불변이 된 줄만 다시 낸다.
 *   lift   { line: number }
 *          불변인 줄 하나를 반복 머리줄 바로 앞으로 옮겼다.
 *
 * 걸음 0 은 장면의 initial() 이 처음 프로그램으로 채운다. 첫 발신 앞에 stepMs 를 둔다 — 걸음 0 이
 * 이미 읽을 것(프로그램 전체)이 있는 화면이다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

// ─────────────── 구조 ───────────────

export type BinOp = '+' | '-' | '*' | '<';

export type Expr =
  | { num: number }
  | { var: string }
  | { op: BinOp; l: Expr; r: Expr }
  | { call: string; args: Expr[] }
  | { list: string; at: Expr };

export type Stmt =
  | { k: 'function'; name: string; params: string[] }
  | { k: 'let'; name: string; value: Expr }
  | { k: 'set'; name: string; value: Expr }
  | { k: 'return'; value: Expr }
  | { k: 'for'; var: string; from: Expr; to: Expr }
  | { k: 'while'; cond: Expr };

export type CodeLine = { indent: number; text: string; stmt: Stmt };

export type HoistInvariantFacetData = {
  type: 'hoist-invariant';
  stepMs: number;
  lines: CodeLine[];
};

export type ReadFrom = 'outer' | 'loop' | 'invariant' | 'body';
export type Block = 'none' | 'reassigned' | 'call';
export type Read = { name: string; from: ReadFrom; at: number };

/** 글자 조각. 줄의 글자는 이 조각들을 이은 것이다 (`def` 는 이름을 정하는 자리). */
export type Tok = { s: string; role: 'kw' | 'def' | 'name' | 'num' | 'op' | 'punct' | 'space' };

const PREC: Record<BinOp, number> = { '<': 1, '+': 2, '-': 2, '*': 3 };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readName(v: unknown, where: string): string {
  if (typeof v !== 'string' || !/^[A-Za-z_]\w*$/.test(v)) throw new Error(`${where}: 이름이 아니다 — ${String(v)}`);
  return v;
}

function readExpr(v: unknown, where: string): Expr {
  if (!isRecord(v)) throw new Error(`${where}: 식이 객체가 아니다`);
  if ('num' in v) {
    if (typeof v.num !== 'number' || !Number.isInteger(v.num)) throw new Error(`${where}: 수가 정수가 아니다`);
    return { num: v.num };
  }
  if ('var' in v) return { var: readName(v.var, where) };
  if ('op' in v) {
    const op = v.op;
    if (op !== '+' && op !== '-' && op !== '*' && op !== '<') throw new Error(`${where}: 모르는 연산 ${String(op)}`);
    return { op, l: readExpr(v.l, where), r: readExpr(v.r, where) };
  }
  if ('call' in v) {
    if (!Array.isArray(v.args)) throw new Error(`${where}: 부르기의 인자가 목록이 아니다`);
    return { call: readName(v.call, where), args: v.args.map((a) => readExpr(a, where)) };
  }
  if ('list' in v) return { list: readName(v.list, where), at: readExpr(v.at, where) };
  throw new Error(`${where}: 모르는 식 모양`);
}

function readStmt(v: unknown, where: string): Stmt {
  if (!isRecord(v)) throw new Error(`${where}: 문이 객체가 아니다`);
  switch (v.k) {
    case 'function': {
      if (!Array.isArray(v.params)) throw new Error(`${where}: 매개변수가 목록이 아니다`);
      return { k: 'function', name: readName(v.name, where), params: v.params.map((p) => readName(p, where)) };
    }
    case 'let':
      return { k: 'let', name: readName(v.name, where), value: readExpr(v.value, where) };
    case 'set':
      return { k: 'set', name: readName(v.name, where), value: readExpr(v.value, where) };
    case 'return':
      return { k: 'return', value: readExpr(v.value, where) };
    case 'for':
      return { k: 'for', var: readName(v.var, where), from: readExpr(v.from, where), to: readExpr(v.to, where) };
    case 'while':
      return { k: 'while', cond: readExpr(v.cond, where) };
    default:
      throw new Error(`${where}: 모르는 문 ${String(v.k)}`);
  }
}

// ─────────────── 찍개 ───────────────

function sp(): Tok {
  return { s: ' ', role: 'space' };
}

export function exprTokens(e: Expr, parent?: BinOp, right = false): Tok[] {
  if ('num' in e) return [{ s: e.num < 0 ? `(${e.num})` : String(e.num), role: 'num' }];
  if ('var' in e) return [{ s: e.var, role: 'name' }];
  if ('call' in e) {
    const out: Tok[] = [{ s: e.call, role: 'name' }, { s: '(', role: 'punct' }];
    e.args.forEach((a, i) => {
      if (i > 0) out.push({ s: ',', role: 'punct' }, sp());
      out.push(...exprTokens(a));
    });
    out.push({ s: ')', role: 'punct' });
    return out;
  }
  if ('list' in e) {
    return [{ s: e.list, role: 'name' }, { s: '[', role: 'punct' }, ...exprTokens(e.at), { s: ']', role: 'punct' }];
  }
  const inner: Tok[] = [...exprTokens(e.l, e.op), sp(), { s: e.op, role: 'op' }, sp(), ...exprTokens(e.r, e.op, true)];
  const wrap = parent !== undefined && (PREC[e.op] < PREC[parent] || (right && PREC[e.op] === PREC[parent]));
  return wrap ? [{ s: '(', role: 'punct' }, ...inner, { s: ')', role: 'punct' }] : inner;
}

/** 문 하나의 글자 조각 (들여쓰기 없이). */
export function stmtTokens(st: Stmt): Tok[] {
  switch (st.k) {
    case 'function': {
      const out: Tok[] = [{ s: 'function', role: 'kw' }, sp(), { s: st.name, role: 'def' }, { s: '(', role: 'punct' }];
      st.params.forEach((p, i) => {
        if (i > 0) out.push({ s: ',', role: 'punct' }, sp());
        out.push({ s: p, role: 'def' });
      });
      out.push({ s: ')', role: 'punct' });
      return out;
    }
    case 'let':
      return [{ s: 'let', role: 'kw' }, sp(), { s: st.name, role: 'def' }, sp(), { s: '=', role: 'punct' }, sp(), ...exprTokens(st.value)];
    case 'set':
      return [{ s: st.name, role: 'def' }, sp(), { s: '=', role: 'punct' }, sp(), ...exprTokens(st.value)];
    case 'return':
      return [{ s: 'return', role: 'kw' }, sp(), ...exprTokens(st.value)];
    case 'for':
      return [
        { s: 'for', role: 'kw' }, sp(), { s: st.var, role: 'def' }, sp(), { s: 'from', role: 'kw' }, sp(),
        ...exprTokens(st.from), sp(), { s: 'to', role: 'kw' }, sp(), ...exprTokens(st.to),
      ];
    case 'while':
      return [{ s: 'while', role: 'kw' }, sp(), ...exprTokens(st.cond)];
  }
}

// ─────────────── 셈 ───────────────

/** 식이 읽는 이름 (처음 나온 차례, 겹치지 않게). 부른 함수 이름은 읽는 이름이 아니다. */
export function namesIn(e: Expr): string[] {
  const out: string[] = [];
  const walk = (x: Expr): void => {
    if ('num' in x) return;
    if ('var' in x) {
      if (!out.includes(x.var)) out.push(x.var);
      return;
    }
    if ('call' in x) {
      x.args.forEach(walk);
      return;
    }
    if ('list' in x) {
      if (!out.includes(x.list)) out.push(x.list);
      walk(x.at);
      return;
    }
    walk(x.l);
    walk(x.r);
  };
  walk(e);
  return out;
}

export function hasCall(e: Expr): boolean {
  if ('num' in e || 'var' in e) return false;
  if ('call' in e) return true;
  if ('list' in e) return hasCall(e.at);
  return hasCall(e.l) || hasCall(e.r);
}

/** 연산 하나 = op 마디 하나. */
export function opsIn(e: Expr): number {
  if ('num' in e || 'var' in e) return 0;
  if ('call' in e) return e.args.reduce((n, a) => n + opsIn(a), 0);
  if ('list' in e) return opsIn(e.at);
  return 1 + opsIn(e.l) + opsIn(e.r);
}

/** 한 번 셀 때 드는 연산 수. 반복 머리줄의 조건 셈은 세지 않는다. */
export function stmtOps(st: Stmt): number {
  switch (st.k) {
    case 'function':
    case 'for':
      return 0;
    case 'let':
    case 'set':
    case 'return':
      return opsIn(st.value);
    case 'while':
      throw new Error('while 반복의 연산 수는 이 조각이 셈하지 않는다');
  }
}

/** 반복 머리줄과 그 몸 — 지금 줄 차례(order)와 들여쓰기에서 찾는다. */
export function loopOf(
  lines: readonly CodeLine[],
  order: readonly number[],
  indent: readonly number[],
): { head: number; headRow: number; body: number[] } {
  const headRow = order.findIndex((li) => lines[li]?.stmt.k === 'for');
  if (headRow < 0) throw new Error('반복(for) 줄이 없다');
  const head = order[headRow];
  if (head === undefined) throw new Error('반복 머리줄의 차례가 비었다');
  const headIndent = indent[head];
  if (headIndent === undefined) throw new Error(`L${head + 1}: 들여쓰기가 없다`);
  const body: number[] = [];
  for (let r = headRow + 1; r < order.length; r += 1) {
    const li = order[r];
    if (li === undefined) throw new Error(`${r} 번째 차례가 비었다`);
    const ind = indent[li];
    if (ind === undefined) throw new Error(`L${li + 1}: 들여쓰기가 없다`);
    if (ind <= headIndent) break;
    body.push(li);
  }
  if (body.length === 0) throw new Error(`L${head + 1}: 반복의 몸이 비었다`);
  return { head, headRow, body };
}

/** 반복이 도는 바퀴 수 — 양 끝이 수일 때만 셈한다. */
export function tripsOf(st: Stmt): number {
  if (st.k !== 'for') throw new Error('반복 머리줄이 for 가 아니다');
  if (!('num' in st.from) || !('num' in st.to)) throw new Error('반복의 양 끝이 수가 아니라 바퀴 수를 셈할 수 없다');
  const n = st.to.num - st.from.num + 1;
  if (n < 1) throw new Error('한 번도 돌지 않는 반복 — 꺼내면 뜻이 바뀔 수 있다');
  return n;
}

/** initialData 를 좁히고, 줄마다 글자가 구조를 찍은 것과 같은지 대조한다. 새 객체를 돌려준다. */
export function readProgram(data: unknown): HoistInvariantFacetData {
  if (!isRecord(data)) throw new Error('initialData 가 객체가 아니다');
  if (data.type !== 'hoist-invariant') throw new Error(`initialData.type 이 hoist-invariant 가 아니다: ${String(data.type)}`);
  if (typeof data.stepMs !== 'number' || !(data.stepMs > 0)) throw new Error('initialData.stepMs 가 양수가 아니다');
  if (!Array.isArray(data.lines) || data.lines.length === 0) throw new Error('initialData.lines 가 비었다');
  const lines = data.lines.map((raw, i): CodeLine => {
    const where = `L${i + 1}`;
    if (!isRecord(raw)) throw new Error(`${where}: 줄이 객체가 아니다`);
    if (typeof raw.indent !== 'number' || !Number.isInteger(raw.indent) || raw.indent < 0) {
      throw new Error(`${where}: 들여쓰기가 0 이상의 정수가 아니다`);
    }
    if (typeof raw.text !== 'string') throw new Error(`${where}: 글자가 없다`);
    const stmt = readStmt(raw.stmt, where);
    const printed = stmtTokens(stmt).map((tk) => tk.s).join('');
    if (printed !== raw.text) throw new Error(`${where}: 글자가 구조와 다르다 — "${raw.text}" / "${printed}"`);
    return { indent: raw.indent, text: raw.text, stmt };
  });
  return { type: 'hoist-invariant', stepMs: data.stepMs, lines };
}

// ─────────────── 알고리즘 ───────────────

export async function hoistInvariant(ctx: FacetContext<HoistInvariantFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<HoistInvariantFacetData>;
  const { lines, stepMs } = readProgram(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const order = lines.map((_, i) => i);
  const indent = lines.map((ln) => ln.indent);
  const { head, headRow, body } = loopOf(lines, order, indent);
  const headStmt = lines[head]?.stmt;
  if (headStmt?.k !== 'for') throw new Error(`L${head + 1}: 반복 머리줄이 아니다`);
  tripsOf(headStmt);
  const loopVar = headStmt.var;

  // 몸 밖에서 정해진 이름 — 반복 앞 줄들 (나중 것이 이긴다)
  const outer = new Map<string, number>();
  for (let r = 0; r < headRow; r += 1) {
    const li = order[r];
    const st = li === undefined ? undefined : lines[li]?.stmt;
    if (li === undefined || st === undefined) throw new Error(`${r} 번째 차례가 비었다`);
    if (st.k === 'function') for (const p of st.params) outer.set(p, li);
    else if (st.k === 'let' || st.k === 'set') outer.set(st.name, li);
  }

  // 몸에서 넣는 이름과 그 줄
  const assigned = new Map<string, number[]>();
  const bodyStmts = new Map<number, { name: string; value: Expr }>();
  for (const li of body) {
    const st = lines[li]?.stmt;
    if (st === undefined) throw new Error(`L${li + 1}: 줄이 없다`);
    if (st.k !== 'let' && st.k !== 'set') throw new Error(`L${li + 1}: 몸의 줄이 let · 넣기가 아니다 (${st.k})`);
    bodyStmts.set(li, { name: st.name, value: st.value });
    const at = assigned.get(st.name);
    if (at) at.push(li);
    else assigned.set(st.name, [li]);
  }

  const inv = new Set<number>();

  function resolve(name: string, li: number): Read {
    if (name === loopVar) return { name, from: 'loop', at: head };
    const inBody = assigned.get(name);
    if (inBody) {
      const at = inBody[0];
      if (at === undefined) throw new Error(`L${li + 1}: ${name} 을 넣는 줄이 비었다`);
      return { name, from: inBody.length === 1 && inv.has(at) ? 'invariant' : 'body', at };
    }
    const at = outer.get(name);
    if (at === undefined) throw new Error(`L${li + 1}: ${name} 을 정한 줄이 없다`);
    return { name, from: 'outer', at };
  }

  function judge(li: number): { invariant: boolean; block: Block; reads: Read[] } {
    const st = bodyStmts.get(li);
    if (!st) throw new Error(`L${li + 1}: 몸의 줄이 아니다`);
    const reads = namesIn(st.value).map((n) => resolve(n, li));
    const setters = assigned.get(st.name);
    if (!setters) throw new Error(`L${li + 1}: ${st.name} 을 넣는 줄을 못 찾았다`);
    const block: Block = setters.length !== 1 ? 'reassigned' : hasCall(st.value) ? 'call' : 'none';
    const invariant = block === 'none' && reads.every((r) => r.from === 'outer' || r.from === 'invariant');
    return { invariant, block, reads };
  }

  // 판정 — 새 불변이 없는 판까지. 걸음으로 내는 것은 첫 판의 판정과, 뒤 판에서 새로 불변이 된 줄뿐이다
  // (뒤 판에서 변함이 불변으로 바뀌면 화면의 판정도 바뀌어야 옮김이 말이 된다. 이 조각의 데이터엔 없다).
  let pass = 0;
  let grew = true;
  while (grew) {
    if (ctx.cancelled) return;
    pass += 1;
    grew = false;
    for (const li of body) {
      if (ctx.cancelled) return;
      if (inv.has(li)) continue;
      const v = judge(li);
      if (pass === 1 || v.invariant) {
        if (!(await pause())) return;
        await ctx.emit({ type: 'judge', payload: { line: li, invariant: v.invariant, block: v.block, reads: v.reads } });
      }
      if (v.invariant) {
        inv.add(li);
        grew = true;
      }
    }
  }

  // 옮김 — 몸에 있던 차례대로 하나씩
  for (const li of body.filter((x) => inv.has(x))) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'lift', payload: { line: li } });
  }
}
