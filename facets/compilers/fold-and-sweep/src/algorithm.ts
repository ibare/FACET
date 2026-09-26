/**
 * fold-and-sweep — 상수 폴딩(전파를 곁들일 수 있다)과 죽은 코드 제거(DCE) 두 패스를 잇달아 돌린다.
 *
 * 한 판 = 원래 프로그램에서 출발 → (폴딩이 켜져 있으면) 줄마다 접기 → (DCE 가 켜져 있으면) 쓰임 셈 · 지움 판 반복 →
 * 실행 연산 셈 → `waitForInput` → 받은 손잡이 값으로 다시 원래 프로그램에서.
 *
 * 규약
 * - 차례는 늘 폴딩 → DCE. 폴딩은 줄 위 → 아래(L2 … L6, 그다음 L7 의 `return` 식), 한 줄의 식은 뒤차례(왼쪽 → 오른쪽 → 자기).
 *   두 자식이 (이미 접힌 것까지 쳐서) 다 수이면 그 마디를 셈한 수로 바꾼다 = 접은 마디 하나. 정수 `+ - *` 만.
 * - 전파(fold = 2) — 식이 수 하나로 접힌 `let` 의 이름은 알려짐이 되고, 아래 줄에서 그 이름을 만나면 수로 바꾼다(바꾼 이름 하나).
 *   매개변수 `n` 은 끝까지 이름이다. 폴딩은 줄을 지우지 않는다.
 * - DCE — 판마다 남은 줄 전부에서 `let` 이름의 쓰임을 세고(한 식에 두 번이면 둘), 쓰임 0 인 `let` 줄을 그 판에 한꺼번에 지운다.
 *   지울 것이 없는 판이 마지막. 머리줄 · `return` 줄은 지우지 않는다.
 * - 실행 연산 = 남은 줄의 op 마디 수. 줄 = 머리줄 · `return` 포함.
 * - 동률 — 없다 (줄 차례 · 뒤차례가 모두 정해져 있다). 지움은 한 판에 여럿이어도 줄 차례로 싣는다.
 *
 * 이벤트 (payload 의 `rows` 는 늘 그 걸음을 마친 프로그램 전체 — `SnapRow[]`: `{ indent, alive, stmt }`, 식 마디마다 `id`)
 * - `round`  { fold: 0|1|2, sweep: 0|1, rows }                                   — 걸음 0. 원래 프로그램
 * - `fold`   { line, rows, folded, subst: { node, from }[], known: { name, val } | null, changed }
 *                                                                               — 줄 하나 접기. line · from 은 줄 번호 0 부터
 * - `uses`   { round, uses: { line, count }[], zero }                            — DCE 한 판의 쓰임 셈 (남은 let 줄만)
 * - `remove` { round, lines: number[], rows }                                    — DCE 한 판의 지움
 * - `count`  { ops, lines, rows }                                               — 마지막 셈
 * - `phase`  { phase } silent — 걸음마다 하나
 *
 * phase 어휘 (irs.ts 와 정확히 같다): `fold-line` · `fold-known` · `sweep-count` · `sweep-remove` · `count-ops`
 *
 * 계기 (걸음마다 그 걸음을 마친 프로그램의 값): `exec-ops` · `code-lines` · `folded-nodes` · `removed-lines`.
 * 판 머리에서 원래 프로그램의 값(7 · 7 · 0 · 0)으로 되돌린다.
 *
 * 손잡이 입력: `fold` { value: 0|1|2 } · `sweep` { value: 0|1 }.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

// ─────────────────────────────────────────────── 구조

export type Op = '+' | '-' | '*';

/** 식 마디 — `id` 는 프로그램 전체의 전위 차례 번호 (L2 의 식부터, 마지막이 `return` 식). IR 의 마디 번호와 같다. */
export type Expr =
  | { id: number; k: 'num'; v: number }
  | { id: number; k: 'var'; name: string }
  | { id: number; k: 'op'; op: Op; l: Expr; r: Expr };

export type Stmt =
  | { k: 'function'; name: string; params: string[] }
  | { k: 'let'; name: string; value: Expr }
  | { k: 'return'; value: Expr };

export type SnapRow = { indent: number; alive: boolean; stmt: Stmt };

/** initialData 의 줄 — 식은 `{ num }` · `{ var }` · `{ op, l, r }`. `text` 는 찍개의 결과와 같아야 한다. */
export type SrcExpr = { num: number } | { var: string } | { op: Op; l: SrcExpr; r: SrcExpr };
export type SrcLine = {
  indent: number;
  text: string;
  stmt:
    | { k: 'function'; name: string; params: string[] }
    | { k: 'let'; name: string; value: SrcExpr }
    | { k: 'return'; value: SrcExpr };
};

export type FoldAndSweepData = {
  type: 'fold-and-sweep';
  stepMs: number;
  fold: number;
  sweep: number;
  foldLadder: number[];
  sweepLadder: number[];
  program: SrcLine[];
};

// ─────────────────────────────────────────────── 좁히기 (C6 · C9 — 모르는 모양은 던진다)

function isRec(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function readOp(x: unknown): Op {
  if (x === '+' || x === '-' || x === '*') return x;
  throw new Error(`fold-and-sweep: 모르는 연산 ${String(x)}`);
}

/** 원본 식(`{ num }` 꼴)을 읽어 전위 차례로 번호를 붙인다. */
function readSrcExpr(x: unknown, next: { id: number }): Expr {
  if (!isRec(x)) throw new Error('fold-and-sweep: 식이 객체가 아니다');
  const id = next.id;
  next.id += 1;
  if (typeof x.num === 'number') return { id, k: 'num', v: x.num };
  if (typeof x.var === 'string') return { id, k: 'var', name: x.var };
  if ('op' in x) {
    const op = readOp(x.op);
    const l = readSrcExpr(x.l, next);
    const r = readSrcExpr(x.r, next);
    return { id, k: 'op', op, l, r };
  }
  throw new Error('fold-and-sweep: 모르는 식 모양');
}

/** initialData.program 을 읽는다 — 글자가 구조에서 찍은 것과 다르면 던진다. */
export function readProgram(raw: unknown): SnapRow[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('fold-and-sweep: program 이 비었다');
  const next = { id: 0 };
  return raw.map((line): SnapRow => {
    if (!isRec(line) || typeof line.indent !== 'number' || typeof line.text !== 'string' || !isRec(line.stmt)) {
      throw new Error('fold-and-sweep: 줄 모양이 아니다');
    }
    const s = line.stmt;
    let stmt: Stmt;
    if (s.k === 'function' && typeof s.name === 'string' && Array.isArray(s.params)) {
      const params = s.params.map((p) => {
        if (typeof p !== 'string') throw new Error('fold-and-sweep: 매개변수가 글자가 아니다');
        return p;
      });
      stmt = { k: 'function', name: s.name, params };
    } else if (s.k === 'let' && typeof s.name === 'string') {
      stmt = { k: 'let', name: s.name, value: readSrcExpr(s.value, next) };
    } else if (s.k === 'return') {
      stmt = { k: 'return', value: readSrcExpr(s.value, next) };
    } else {
      throw new Error(`fold-and-sweep: 모르는 문 ${String(s.k)}`);
    }
    const row: SnapRow = { indent: line.indent, alive: true, stmt };
    if (rowText(row) !== line.text) throw new Error(`fold-and-sweep: 줄 글자가 구조와 다르다 — "${line.text}" 대 "${rowText(row)}"`);
    return row;
  });
}

function readIdExpr(x: unknown): Expr {
  if (!isRec(x) || typeof x.id !== 'number') throw new Error('fold-and-sweep: 마디 번호가 없다');
  if (x.k === 'num' && typeof x.v === 'number') return { id: x.id, k: 'num', v: x.v };
  if (x.k === 'var' && typeof x.name === 'string') return { id: x.id, k: 'var', name: x.name };
  if (x.k === 'op') return { id: x.id, k: 'op', op: readOp(x.op), l: readIdExpr(x.l), r: readIdExpr(x.r) };
  throw new Error('fold-and-sweep: 모르는 마디');
}

/** 이벤트 payload 의 `rows` 를 읽는다 (projector 가 쓴다). */
export function readSnapshot(raw: unknown): SnapRow[] {
  if (!Array.isArray(raw)) throw new Error('fold-and-sweep: rows 가 배열이 아니다');
  return raw.map((row): SnapRow => {
    if (!isRec(row) || typeof row.indent !== 'number' || typeof row.alive !== 'boolean' || !isRec(row.stmt)) {
      throw new Error('fold-and-sweep: 줄 모양이 아니다');
    }
    const s = row.stmt;
    let stmt: Stmt;
    if (s.k === 'function' && typeof s.name === 'string' && Array.isArray(s.params)) {
      const params = s.params.map((p) => {
        if (typeof p !== 'string') throw new Error('fold-and-sweep: 매개변수가 글자가 아니다');
        return p;
      });
      stmt = { k: 'function', name: s.name, params };
    } else if (s.k === 'let' && typeof s.name === 'string') {
      stmt = { k: 'let', name: s.name, value: readIdExpr(s.value) };
    } else if (s.k === 'return') {
      stmt = { k: 'return', value: readIdExpr(s.value) };
    } else {
      throw new Error(`fold-and-sweep: 모르는 문 ${String(s.k)}`);
    }
    return { indent: row.indent, alive: row.alive, stmt };
  });
}

// ─────────────────────────────────────────────── 찍개 (글자는 구조에서)

const PREC: Record<Op, number> = { '+': 1, '-': 1, '*': 2 };

/** 화면의 글자 한 토막. `col` 은 줄 머리(들여쓰기 뒤)부터의 칸, `anc` 는 가까운 조상 마디부터. */
export type Token = { key: string; text: string; col: number; anc: number[]; op: boolean };

function pushExpr(e: Expr, anc: number[], out: Token[], at: { col: number }): void {
  const put = (key: string, text: string, op: boolean): void => {
    out.push({ key, text, col: at.col, anc, op });
    at.col += text.length;
  };
  if (e.k === 'num') return put(`n${e.id}`, String(e.v), false);
  if (e.k === 'var') return put(`n${e.id}`, e.name, false);
  const inner = [e.id, ...anc];
  const lp = e.l.k === 'op' && PREC[e.l.op] < PREC[e.op];
  const rp = e.r.k === 'op' && PREC[e.r.op] <= PREC[e.op];
  if (lp) put(`n${e.l.id}(`, '(', false);
  pushExpr(e.l, inner, out, at);
  if (lp) put(`n${e.l.id})`, ')', false);
  at.col += 1;
  put(`n${e.id}`, e.op, true);
  at.col += 1;
  if (rp) put(`n${e.r.id}(`, '(', false);
  pushExpr(e.r, inner, out, at);
  if (rp) put(`n${e.r.id})`, ')', false);
}

/** 줄 하나의 토막 — 줄 번호 `line` 이 글자 없는 토막(키워드 · 이름)의 키가 된다. */
export function rowTokens(row: SnapRow, line: number): Token[] {
  const out: Token[] = [];
  const at = { col: 0 };
  const put = (key: string, text: string): void => {
    out.push({ key: `r${line}:${key}`, text, col: at.col, anc: [], op: false });
    at.col += text.length;
  };
  const s = row.stmt;
  if (s.k === 'function') {
    put('fn', `function ${s.name}(${s.params.join(', ')})`);
  } else if (s.k === 'let') {
    put('kw', 'let');
    at.col += 1;
    put('name', s.name);
    at.col += 1;
    put('eq', '=');
    at.col += 1;
    pushExpr(s.value, [], out, at);
  } else {
    put('kw', 'return');
    at.col += 1;
    pushExpr(s.value, [], out, at);
  }
  return out;
}

export function rowText(row: SnapRow): string {
  let text = '';
  for (const tok of rowTokens(row, 0)) text = text.padEnd(tok.col, ' ') + tok.text;
  return text;
}

export function showExpr(e: Expr): string {
  return rowText({ indent: 0, alive: true, stmt: { k: 'return', value: e } }).slice('return '.length);
}

// ─────────────────────────────────────────────── 셈

export function opsIn(e: Expr): number {
  return e.k === 'op' ? 1 + opsIn(e.l) + opsIn(e.r) : 0;
}

function namesIn(e: Expr, out: string[]): string[] {
  if (e.k === 'var') out.push(e.name);
  if (e.k === 'op') {
    namesIn(e.l, out);
    namesIn(e.r, out);
  }
  return out;
}

type Known = Map<string, { val: number; line: number }>;
type FoldOut = { expr: Expr; folded: number; subst: { node: number; from: number }[] };

/** 뒤차례 접기. `known` 이 있으면 알려진 이름을 수로 바꾼다(전파). 새 식을 돌려준다 — 받은 식은 고치지 않는다. */
export function foldExpr(e: Expr, known: Known | null, acc: FoldOut = { expr: e, folded: 0, subst: [] }): FoldOut {
  const go = (x: Expr): Expr => {
    if (x.k === 'num') return x;
    if (x.k === 'var') {
      const hit = known?.get(x.name);
      if (hit === undefined) return x;
      acc.subst.push({ node: x.id, from: hit.line });
      return { id: x.id, k: 'num', v: hit.val };
    }
    const l = go(x.l);
    const r = go(x.r);
    if (l.k === 'num' && r.k === 'num') {
      acc.folded += 1;
      const v = x.op === '+' ? l.v + r.v : x.op === '-' ? l.v - r.v : l.v * r.v;
      return { id: x.id, k: 'num', v };
    }
    return { id: x.id, k: 'op', op: x.op, l, r };
  };
  acc.expr = go(e);
  return acc;
}

/** 지금 프로그램의 실행 연산 · 줄. */
export function measure(rows: SnapRow[]): { ops: number; lines: number } {
  let ops = 0;
  let lines = 0;
  for (const row of rows) {
    if (!row.alive) continue;
    lines += 1;
    if (row.stmt.k !== 'function') ops += opsIn(row.stmt.value);
  }
  return { ops, lines };
}

/** DCE 한 판의 쓰임 — 남은 `let` 줄마다 (줄 차례). */
export function countUses(rows: SnapRow[]): { line: number; count: number }[] {
  const seen: string[] = [];
  for (const row of rows) {
    if (row.alive && row.stmt.k !== 'function') namesIn(row.stmt.value, seen);
  }
  const out: { line: number; count: number }[] = [];
  rows.forEach((row, line) => {
    if (!row.alive || row.stmt.k !== 'let') return;
    const name = row.stmt.name;
    out.push({ line, count: seen.filter((x) => x === name).length });
  });
  return out;
}

// ─────────────────────────────────────────────── 한 판 (순수) — 검사와 알고리즘이 같이 쓴다

export type RoundResult = { ops: number; lines: number; folded: number; subst: number; removed: number; passes: number; steps: number; rows: SnapRow[] };

/** 걸음 없이 한 판을 끝까지 셈한다 (검사용 · 알고리즘과 같은 셈). */
export function runRound(program: SnapRow[], fold: number, sweep: number): RoundResult {
  const rows = program.map((r) => ({ ...r }));
  let folded = 0;
  let subst = 0;
  let removed = 0;
  let passes = 0;
  let steps = 1;
  if (fold > 0) {
    const known: Known | null = fold === 2 ? new Map() : null;
    rows.forEach((row, line) => {
      const s = row.stmt;
      if (s.k === 'function') return;
      const res = foldExpr(s.value, known);
      folded += res.folded;
      subst += res.subst.length;
      rows[line] = { ...row, stmt: { ...s, value: res.expr } };
      if (known && s.k === 'let' && res.expr.k === 'num') known.set(s.name, { val: res.expr.v, line });
      steps += 1;
    });
  }
  if (sweep === 1) {
    for (;;) {
      passes += 1;
      steps += 1;
      const dead = countUses(rows).filter((u) => u.count === 0);
      if (dead.length === 0) break;
      for (const d of dead) rows[d.line] = { ...rows[d.line]!, alive: false };
      removed += dead.length;
      steps += 1;
    }
  }
  steps += 1;
  const m = measure(rows);
  return { ops: m.ops, lines: m.lines, folded, subst, removed, passes, steps, rows };
}

// ─────────────────────────────────────────────── 알고리즘

type Shown = { ops: number; lines: number; folded: number; removed: number };

export async function foldAndSweepAlgorithm(ctx: FacetContext<FoldAndSweepData>): Promise<void> {
  const rc = ctx as ReactiveContext<FoldAndSweepData>;
  const data = ctx.data;
  const foldLadder = data.foldLadder;
  const sweepLadder = data.sweepLadder;
  if (!foldLadder.includes(data.fold) || !sweepLadder.includes(data.sweep)) throw new Error('fold-and-sweep: 기본값이 사다리에 없다');
  let fold = data.fold;
  let sweep = data.sweep;

  const shown: Shown = { ops: 0, lines: 0, folded: 0, removed: 0 };
  let first = true;
  const showMetrics = (now: Shown): void => {
    // 누적 채널 — 지금 보이는 값과의 차이만 보낸다. 첫 판은 차이 0 이어도 보낸다.
    const d = { ops: now.ops - shown.ops, lines: now.lines - shown.lines, folded: now.folded - shown.folded, removed: now.removed - shown.removed };
    if (first || d.ops !== 0) ctx.metric('exec-ops', d.ops);
    if (first || d.lines !== 0) ctx.metric('code-lines', d.lines);
    if (first || d.folded !== 0) ctx.metric('folded-nodes', d.folded);
    if (first || d.removed !== 0) ctx.metric('removed-lines', d.removed);
    first = false;
    Object.assign(shown, now);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playRound = async (): Promise<boolean> => {
    const rows = readProgram(data.program);
    let folded = 0;
    let removed = 0;
    const now = (): Shown => ({ ...measure(rows), folded, removed });

    // 걸음 0 — 원래 프로그램
    await ctx.emit({ type: 'round', payload: { fold, sweep, rows: rows.map((r) => ({ ...r })) } });
    showMetrics(now());
    if (!(await rc.sleep(data.stepMs))) return false;

    // 폴딩 패스 — 줄 하나가 한 걸음
    if (fold > 0) {
      const known: Known | null = fold === 2 ? new Map() : null;
      for (let line = 0; line < rows.length; line += 1) {
        if (ctx.cancelled) return false;
        const row = rows[line]!;
        const s = row.stmt;
        if (s.k === 'function') continue;
        const res = foldExpr(s.value, known);
        folded += res.folded;
        rows[line] = { ...row, stmt: { ...s, value: res.expr } };
        let learnt: { name: string; val: number } | null = null;
        if (known && s.k === 'let' && res.expr.k === 'num') {
          known.set(s.name, { val: res.expr.v, line });
          learnt = { name: s.name, val: res.expr.v };
        }
        if (learnt) await phase('fold-known');
        else await phase('fold-line');
        await ctx.emit({
          type: 'fold',
          payload: {
            line,
            rows: rows.map((r) => ({ ...r })),
            folded: res.folded,
            subst: res.subst,
            known: learnt,
            changed: res.folded > 0 || res.subst.length > 0,
          },
        });
        showMetrics(now());
        if (!(await rc.sleep(data.stepMs))) return false;
      }
    }

    // DCE 패스 — 판마다 쓰임 셈 한 걸음 · 지움이 있으면 지움 한 걸음
    if (sweep === 1) {
      for (let pass = 1; ; pass += 1) {
        if (ctx.cancelled) return false;
        const uses = countUses(rows);
        const dead = uses.filter((u) => u.count === 0).map((u) => u.line);
        await phase('sweep-count');
        await ctx.emit({ type: 'uses', payload: { round: pass, uses, zero: dead.length } });
        showMetrics(now());
        if (!(await rc.sleep(data.stepMs))) return false;
        if (dead.length === 0) break;
        for (const line of dead) rows[line] = { ...rows[line]!, alive: false };
        removed += dead.length;
        await phase('sweep-remove');
        await ctx.emit({ type: 'remove', payload: { round: pass, lines: dead, rows: rows.map((r) => ({ ...r })) } });
        showMetrics(now());
        if (!(await rc.sleep(data.stepMs))) return false;
      }
    }

    // 셈 — 마지막 걸음 (다음 손잡이 입력까지 이 화면이 머문다)
    const m = measure(rows);
    await phase('count-ops');
    await ctx.emit({ type: 'count', payload: { ops: m.ops, lines: m.lines, rows: rows.map((r) => ({ ...r })) } });
    showMetrics(now());
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound())) return;
      // 손잡이 입력을 기다린다 — 우리 것이 아니거나 사다리 밖이면 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rc.waitForInput();
        if (ctx.cancelled) return;
        const p = input.payload;
        const value = isRec(p) ? p.value : undefined;
        if (typeof value !== 'number') continue;
        if (input.type === 'fold' && foldLadder.includes(value)) {
          fold = value;
          break;
        }
        if (input.type === 'sweep' && sweepLadder.includes(value)) {
          sweep = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
