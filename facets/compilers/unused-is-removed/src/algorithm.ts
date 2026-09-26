/**
 * unused-is-removed — 죽은 코드 제거를 판(round) 단위로 끝까지 돌린다.
 *
 * 1차 데이터는 줄 목록이다. 줄마다 화면 글자(`text`)와 구조(`stmt`)를 함께 둔다.
 * 알고리즘은 구조를 찍개로 다시 찍어 글자와 대조하고(어긋나면 던진다), 판마다 남은
 * 줄에서 `let` 이름의 쓰임을 세어 쓰임 0 인 `let` 줄을 그 판에 한꺼번에 지운다.
 * 지울 것이 없는 판이 마지막 걸음이다. 매개변수와 `return` 줄은 지우지 않는다.
 *
 * 이벤트:
 *   - `init` (silent) — 바탕. 걸음 0 을 갈아 끼운다
 *       payload: {
 *         lines: { n: number; segs: { s: string; ref?: string; def?: boolean }[] }[];
 *         edges: { from: number; to: number; name: string }[];  // from 줄이 to 줄의 이름을 쓴다 (줄 번호는 1 부터)
 *         names: string[];                                     // let 이름, 줄 차례
 *         uses: { name: string; n: number }[];                 // 지금 남은 줄에서의 쓰임
 *         lines0: number; ops0: number;                        // 처음 줄 수 · 연산 수
 *       }
 *   - `drop` — 한 판. 쓰임 0 인 줄을 지웠다
 *       payload: {
 *         round: number;
 *         uses: { name: string; n: number }[];   // 이 판을 시작할 때 센 쓰임
 *         gone: number[];                        // 지운 줄 번호
 *         after: { name: string; n: number }[];  // 지운 뒤 남은 줄에서의 쓰임
 *         lines: number; ops: number;            // 지운 뒤 줄 수 · 연산 수
 *       }
 *   - `stop` — 마지막 판. 쓰임 0 인 줄이 없어 멈춘다
 *       payload: { round: number; uses: { name: string; n: number }[] }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 식. 곱이 더하기 · 빼기보다 먼저, 같은 높이는 왼쪽부터 묶는다. */
export type Expr =
  | { num: number }
  | { var: string }
  | { op: '+' | '-' | '*' | '<'; l: Expr; r: Expr };

export type Stmt =
  | { k: 'function'; name: string; params: string[] }
  | { k: 'let'; name: string; value: Expr }
  | { k: 'return'; value: Expr };

export type SourceLine = { indent: number; text: string; stmt: Stmt };

export type UnusedIsRemovedFacetData = {
  type: 'unused-is-removed';
  stepMs: number;
  lines: SourceLine[];
};

export type Seg = { s: string; ref?: string; def?: boolean };
export type Use = { name: string; n: number };

const PREC: Record<string, number> = { '<': 1, '+': 2, '-': 2, '*': 3 };

function fail(line: number, msg: string): never {
  throw new Error(`unused-is-removed: L${line}: ${msg}`);
}

function exprOf(raw: unknown, line: number): Expr {
  if (typeof raw !== 'object' || raw === null) fail(line, 'expression is not an object');
  const e = raw as Record<string, unknown>;
  if ('num' in e) {
    if (typeof e.num !== 'number') fail(line, 'num is not a number');
    return { num: e.num };
  }
  if ('var' in e) {
    if (typeof e.var !== 'string' || e.var === '') fail(line, 'var has no name');
    return { var: e.var };
  }
  if ('op' in e) {
    const op = e.op;
    if (op !== '+' && op !== '-' && op !== '*' && op !== '<') fail(line, `unknown op ${String(op)}`);
    return { op, l: exprOf(e.l, line), r: exprOf(e.r, line) };
  }
  return fail(line, `unknown expression shape ${JSON.stringify(raw)}`);
}

function stmtOf(raw: unknown, line: number): Stmt {
  if (typeof raw !== 'object' || raw === null) fail(line, 'stmt is not an object');
  const s = raw as Record<string, unknown>;
  if (s.k === 'function') {
    if (typeof s.name !== 'string' || s.name === '') fail(line, 'function has no name');
    if (!Array.isArray(s.params) || !s.params.every((p): p is string => typeof p === 'string'))
      fail(line, 'function params are not names');
    return { k: 'function', name: s.name, params: [...s.params] };
  }
  if (s.k === 'let') {
    if (typeof s.name !== 'string' || s.name === '') fail(line, 'let has no name');
    return { k: 'let', name: s.name, value: exprOf(s.value, line) };
  }
  if (s.k === 'return') return { k: 'return', value: exprOf(s.value, line) };
  return fail(line, `unsupported statement kind ${String(s.k)}`);
}

/** 초기 자료를 좁힌다. 모양이 틀리면 줄 번호를 담아 던진다. */
export function readLines(raw: unknown): SourceLine[] {
  if (!Array.isArray(raw)) throw new Error('unused-is-removed: lines is not an array');
  return raw.map((r: unknown, i) => {
    const line = i + 1;
    if (typeof r !== 'object' || r === null) fail(line, 'line is not an object');
    const o = r as Record<string, unknown>;
    if (typeof o.indent !== 'number') fail(line, 'indent is not a number');
    if (typeof o.text !== 'string') fail(line, 'text is not a string');
    return { indent: o.indent, text: o.text, stmt: stmtOf(o.stmt, line) };
  });
}

/** 식을 조각 글자로 찍는다. `ref` 는 let 이름을 가리키는 자리다. */
function printExpr(e: Expr, lets: Set<string>, parent: number, right: boolean): Seg[] {
  if ('num' in e) return [{ s: String(e.num) }];
  if ('var' in e) return lets.has(e.var) ? [{ s: e.var, ref: e.var }] : [{ s: e.var }];
  const p = PREC[e.op];
  if (p === undefined) throw new Error(`unused-is-removed: unknown op ${e.op}`);
  const body = [
    ...printExpr(e.l, lets, p, false),
    { s: ` ${e.op} ` },
    ...printExpr(e.r, lets, p, true),
  ];
  const wrap = p < parent || (right && p === parent);
  return wrap ? [{ s: '(' }, ...body, { s: ')' }] : body;
}

function printStmt(st: Stmt, lets: Set<string>): Seg[] {
  if (st.k === 'function') return [{ s: `function ${st.name}(${st.params.join(', ')})` }];
  if (st.k === 'let')
    return [{ s: 'let ' }, { s: st.name, ref: st.name, def: true }, { s: ' = ' }, ...printExpr(st.value, lets, 0, false)];
  return [{ s: 'return ' }, ...printExpr(st.value, lets, 0, false)];
}

function namesIn(e: Expr): string[] {
  if ('num' in e) return [];
  if ('var' in e) return [e.var];
  return [...namesIn(e.l), ...namesIn(e.r)];
}

function opsIn(e: Expr): number {
  if ('num' in e || 'var' in e) return 0;
  return 1 + opsIn(e.l) + opsIn(e.r);
}

function valueOf(st: Stmt): Expr | null {
  return st.k === 'function' ? null : st.value;
}

export async function unusedIsRemoved(ctx: FacetContext<UnusedIsRemovedFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<UnusedIsRemovedFacetData>;
  const stepMs = ctx.data.stepMs;
  const src = readLines(ctx.data.lines);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 이름의 자리 — 매개변수와 let. 쓰는 이름은 위에서 이미 선 것이어야 한다.
  const lets = new Set<string>();
  const defLine = new Map<string, number>();
  const params = new Set<string>();
  const names: string[] = [];
  const edges: { from: number; to: number; name: string }[] = [];
  src.forEach((ln, i) => {
    const line = i + 1;
    const st = ln.stmt;
    if (st.k === 'function') {
      if (i !== 0) fail(line, 'function header must be the first line');
      for (const p of st.params) params.add(p);
      return;
    }
    if (i === 0) fail(line, 'first line must be the function header');
    for (const n of namesIn(st.value)) {
      const to = defLine.get(n);
      if (to !== undefined) edges.push({ from: line, to, name: n });
      else if (!params.has(n)) fail(line, `name ${n} is not defined above`);
    }
    if (st.k === 'let') {
      if (lets.has(st.name) || params.has(st.name)) fail(line, `name ${st.name} is defined twice`);
      lets.add(st.name);
      defLine.set(st.name, line);
      names.push(st.name);
    }
  });

  const segLines = src.map((ln, i) => {
    const segs = printStmt(ln.stmt, lets);
    const printed = segs.map((g) => g.s).join('');
    if (printed !== ln.text) fail(i + 1, `text "${ln.text}" does not match structure "${printed}"`);
    return { n: i + 1, segs };
  });

  let alive = src.map((_, i) => i + 1);

  function countUses(): Use[] {
    const tally = new Map<string, number>();
    for (const n of alive) {
      const st = src[n - 1]!.stmt;
      if (st.k === 'let') tally.set(st.name, 0);
    }
    for (const n of alive) {
      const v = valueOf(src[n - 1]!.stmt);
      if (v === null) continue; // 머리줄에는 식이 없다
      for (const name of namesIn(v)) {
        const c = tally.get(name);
        if (c !== undefined) tally.set(name, c + 1);
        else if (!params.has(name)) fail(n, `name ${name} lost its definition`);
      }
    }
    return [...tally].map(([name, c]) => ({ name, n: c }));
  }

  function opsNow(): number {
    let sum = 0;
    for (const n of alive) {
      const v = valueOf(src[n - 1]!.stmt);
      if (v !== null) sum += opsIn(v);
    }
    return sum;
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { lines: segLines, edges, names, uses: countUses(), lines0: alive.length, ops0: opsNow() },
  });

  // 판마다 남은 줄이 줄어들므로 판의 수는 줄 수를 넘지 않는다.
  for (let round = 1; round <= src.length + 1; round += 1) {
    if (!(await pause())) return;
    const uses = countUses();
    const zero = new Set(uses.filter((u) => u.n === 0).map((u) => u.name));
    const gone = alive.filter((n) => {
      const st = src[n - 1]!.stmt;
      return st.k === 'let' && zero.has(st.name);
    });
    if (gone.length === 0) {
      await ctx.emit({ type: 'stop', payload: { round, uses } });
      return;
    }
    alive = alive.filter((n) => !gone.includes(n));
    await ctx.emit({
      type: 'drop',
      payload: { round, uses, gone, after: countUses(), lines: alive.length, ops: opsNow() },
    });
  }
  throw new Error('unused-is-removed: rounds did not settle');
}
