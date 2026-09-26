/**
 * unroll-loop — 반복을 펴서 늘어놓으면 무엇이 줄고, 나머지는 어디로 가는가.
 *
 * 줄 목록(구조 포함)을 받아 `while` 반복 하나를 배수 `factor` 로 편다. 파서는 두지 않는다 —
 * 줄마다 `stmt` 가 구조이고, 화면 글자 `text` 는 그 구조를 찍은 결과와 같아야 한다 (다르면 던진다).
 * 반복 횟수 · 벌 · 나머지 · 셈은 모두 구조에서 얻는다. 실행기는 없다.
 *
 * 이벤트
 *   init     (silent) { loopVar, list, lo, hi, s, n, factor, whileId, workId, bumpId, read, at, cond }
 *            반복을 읽어 낸 바탕. lo = 시작 · hi = 끝(조건의 수) · s = 올림 · n = 반복 횟수.
 *            read = 일하는 줄이 읽는 칸의 글자 (`list[i]`) · at = 그 칸 번호 식의 글자 (`i`) · cond = 조건식 글자
 *            sweep = 이 프로그램이 한 번 돌 때의 훑기 (아래)
 *   copy     { id, from, after, indent, text, k, read, at, sweep }
 *            몸의 벌 k(0 부터, 1 이상) 를 줄 `after` 뒤에 놓는다. from = 베낀 원본 줄
 *   retune   { condId, condText, cond, bumpId, bumpText, bump, stride, bound, rest, sweep }
 *            조건과 올림을 함께 고친다. cond 는 바뀐 조건식 · bump 는 바뀐 올림 줄의 글자, stride = 새 올림, bound = 새 끝
 *   peel     { id, from, after, indent, text, k, at, was, rest }
 *            나머지 k(0 부터) 번째 줄을 반복 뒤(줄 `after` 뒤)에 곧은 줄로 붙인다. at = 그 줄이 읽는 칸 ·
 *            was = 같은 벌이 마지막 바퀴에서 읽던 칸
 *   compare  { lines, checks, bumps, adds }  각각 [앞, 뒤] — 한 번 부를 때의 셈 (구조에서)
 *
 * sweep = { starts, exit, reads } — 조건을 셈하는 i 값(바퀴마다 하나) · 빠져나가는 i 값 ·
 *         몸이 읽는 칸 [벌 k, 칸] 목록 (목록 범위 lo ≤ 칸 < hi 안의 것만)
 *
 * 줄 id 는 처음 줄이 `L1`… (자리 차례), 벌이 `C1`…, 나머지가 `R0`… 이다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type UnrollOp = '+' | '-' | '*' | '<';

export type UnrollExpr =
  | { num: number }
  | { var: string }
  | { op: UnrollOp; l: UnrollExpr; r: UnrollExpr }
  | { call: string; args: UnrollExpr[] }
  | { index: string; at: UnrollExpr };

export type UnrollStmt =
  | { k: 'function'; name: string; params: string[] }
  | { k: 'let'; name: string; value: UnrollExpr }
  | { k: 'set'; name: string; value: UnrollExpr }
  | { k: 'return'; value: UnrollExpr }
  | { k: 'while'; cond: UnrollExpr };

export type UnrollLine = { indent: number; text: string; stmt: UnrollStmt };

export type Sweep = { starts: number[]; exit: number; reads: [number, number][] };

export type UnrollLoopFacetData = {
  type: 'unroll-loop';
  stepMs: number;
  factor: number;
  lines: UnrollLine[];
};

const PREC: Record<UnrollOp, number> = { '<': 1, '+': 2, '-': 2, '*': 3 };

function isOp(v: unknown): v is UnrollOp {
  return v === '+' || v === '-' || v === '*' || v === '<';
}

/** 식을 글자로 찍는다. 괄호는 안쪽이 낮을 때 · 오른쪽 자식이 같은 높이일 때만. */
export function printExpr(e: UnrollExpr, parent?: UnrollOp, right = false): string {
  if ('num' in e) return e.num < 0 ? `(${e.num})` : String(e.num);
  if ('var' in e) return e.var;
  if ('call' in e) return `${e.call}(${e.args.map((a) => printExpr(a)).join(', ')})`;
  if ('index' in e) return `${e.index}[${printExpr(e.at)}]`;
  if ('op' in e) {
    if (!isOp(e.op)) throw new Error(`모르는 연산: ${String(e.op)}`);
    const s = `${printExpr(e.l, e.op)} ${e.op} ${printExpr(e.r, e.op, true)}`;
    if (parent && (PREC[e.op] < PREC[parent] || (right && PREC[e.op] === PREC[parent]))) return `(${s})`;
    return s;
  }
  throw new Error(`모르는 식 모양: ${JSON.stringify(e)}`);
}

export function printStmt(st: UnrollStmt): string {
  switch (st.k) {
    case 'function':
      return `function ${st.name}(${st.params.join(', ')})`;
    case 'let':
      return `let ${st.name} = ${printExpr(st.value)}`;
    case 'set':
      return `${st.name} = ${printExpr(st.value)}`;
    case 'return':
      return `return ${printExpr(st.value)}`;
    case 'while':
      return `while ${printExpr(st.cond)}`;
    default:
      throw new Error(`모르는 문: ${JSON.stringify(st)}`);
  }
}

/** 식 안의 반복 변수 v 를 `v + k` 로 바꾼다 (k = 0 이면 그대로). */
function shift(e: UnrollExpr, v: string, k: number): UnrollExpr {
  if (k === 0) return e;
  if ('num' in e) return e;
  if ('var' in e) return e.var === v ? { op: '+', l: { var: v }, r: { num: k } } : e;
  if ('op' in e) return { op: e.op, l: shift(e.l, v, k), r: shift(e.r, v, k) };
  if ('index' in e) return { index: e.index, at: shift(e.at, v, k) };
  if ('call' in e) return { call: e.call, args: e.args.map((a) => shift(a, v, k)) };
  throw new Error(`모르는 식 모양: ${JSON.stringify(e)}`);
}

/** 식에서 처음 만나는 칸 읽기를 찾는다. */
function firstIndex(e: UnrollExpr): { index: string; at: UnrollExpr } | null {
  if ('index' in e) return e;
  if ('op' in e) return firstIndex(e.l) ?? firstIndex(e.r);
  if ('call' in e) {
    for (const a of e.args) {
      const f = firstIndex(a);
      if (f) return f;
    }
  }
  return null;
}

function valueOf(st: UnrollStmt, where: string): UnrollExpr {
  if (st.k === 'let' || st.k === 'set' || st.k === 'return') return st.value;
  throw new Error(`${where}: 값이 있는 문이 아니다 (${st.k})`);
}

export async function unrollLoop(ctxBase: FacetContext<UnrollLoopFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<UnrollLoopFacetData>;
  const { lines, factor, stepMs } = ctx.data;
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('lines 가 비었다');
  if (!Number.isInteger(factor) || factor < 2) throw new Error(`factor 는 2 이상의 정수여야 한다: ${factor}`);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  lines.forEach((ln, i) => {
    const printed = printStmt(ln.stmt);
    if (printed !== ln.text) throw new Error(`L${i + 1}: 글자와 구조가 어긋난다 — "${ln.text}" / "${printed}"`);
  });
  const id = (i: number): string => `L${i + 1}`;

  const wi = lines.findIndex((ln) => ln.stmt.k === 'while');
  if (wi < 0) throw new Error('while 줄이 없다');
  const head = lines[wi];
  if (!head || head.stmt.k !== 'while') throw new Error(`L${wi + 1}: while 이 아니다`);
  const cond = head.stmt.cond;
  if (!('op' in cond) || cond.op !== '<' || !('var' in cond.l) || !('num' in cond.r)) {
    throw new Error(`L${wi + 1}: 조건이 "이름 < 수" 꼴이 아니다`);
  }
  const loopVar = cond.l.var;
  const hi = cond.r.num;

  const after0 = lines.findIndex((ln, i) => i > wi && ln.indent <= head.indent);
  const end = after0 < 0 ? lines.length : after0;
  const bodyAt = end - (wi + 1);
  if (bodyAt !== 2) throw new Error(`L${wi + 1}: 몸은 일하는 줄 하나와 올림 한 줄이어야 한다 (줄 ${bodyAt})`);
  const workAt = wi + 1;
  const bumpAt = wi + 2;
  const work = lines[workAt];
  const bump = lines[bumpAt];
  if (!work || !bump) throw new Error(`L${wi + 1}: 몸을 읽지 못했다`);
  if (work.stmt.k !== 'set') throw new Error(`L${workAt + 1}: 일하는 줄이 넣기(set)가 아니다`);
  const workStmt = work.stmt;
  if (bump.stmt.k !== 'set' || bump.stmt.name !== loopVar) throw new Error(`L${bumpAt + 1}: 올림 줄이 아니다`);
  const bv = bump.stmt.value;
  if (!('op' in bv) || bv.op !== '+' || !('var' in bv.l) || bv.l.var !== loopVar || !('num' in bv.r)) {
    throw new Error(`L${bumpAt + 1}: 올림이 "${loopVar} = ${loopVar} + 수" 꼴이 아니다`);
  }
  const s = bv.r.num;
  if (s <= 0) throw new Error(`L${bumpAt + 1}: 올림이 0 이하다 (${s})`);

  const initAt = lines.findIndex((ln, i) => i < wi && ln.stmt.k === 'let' && ln.stmt.name === loopVar);
  const initLine = lines[initAt];
  if (initAt < 0 || !initLine) throw new Error(`L${wi + 1}: 반복 앞에 "let ${loopVar} = 수" 가 없다`);
  const initVal = valueOf(initLine.stmt, `L${initAt + 1}`);
  if (!('num' in initVal)) throw new Error(`L${initAt + 1}: 시작값이 수가 아니다`);
  const lo = initVal.num;

  const reads = firstIndex(workStmt.value);
  if (!reads) throw new Error(`L${workAt + 1}: 일하는 줄이 칸을 읽지 않는다`);

  const n = Math.max(0, Math.ceil((hi - lo) / s));
  const groups = Math.floor(n / factor);
  const rest = n % factor;
  const bound = lo + groups * factor * s;
  const stride = factor * s;

  /** 올림 step · 끝 end · 벌 copies 인 반복이 한 번 돌 때 조건 셈 자리와 읽는 칸. */
  const sweep = (step: number, end: number, copies: number): Sweep => {
    const count = Math.max(0, Math.ceil((end - lo) / step));
    const starts = Array.from({ length: count }, (_, j) => lo + j * step);
    const reads = starts.flatMap((i) =>
      Array.from({ length: copies }, (_, k): [number, number] => [k, i + k * s]).filter(
        ([, cell]) => cell >= lo && cell < hi,
      ),
    );
    return { starts, exit: lo + count * step, reads };
  };

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      loopVar,
      list: reads.index,
      lo,
      hi,
      s,
      n,
      factor,
      whileId: id(wi),
      workId: id(workAt),
      bumpId: id(bumpAt),
      read: printExpr(reads),
      at: printExpr(reads.at),
      cond: printExpr(cond),
      sweep: sweep(s, hi, 1),
    },
  });

  const copyStmt = (k: number): { text: string; read: string; at: string } => {
    const value = shift(workStmt.value, loopVar, k * s);
    const f = firstIndex(value);
    if (!f) throw new Error(`L${workAt + 1}: 벌 ${k} 에서 칸 읽기가 사라졌다`);
    return { text: printStmt({ k: 'set', name: workStmt.name, value }), read: printExpr(f), at: printExpr(f.at) };
  };

  let after = id(workAt);
  const copyIds: string[] = [id(workAt)];
  for (let k = 1; k < factor; k += 1) {
    if (!(await pause())) return;
    const c = copyStmt(k);
    const cid = `C${k}`;
    await ctx.emit({
      type: 'copy',
      payload: { id: cid, from: id(workAt), after, indent: work.indent, text: c.text, k, read: c.read, at: c.at, sweep: sweep(s, hi, k + 1) },
    });
    copyIds.push(cid);
    after = cid;
  }

  if (!(await pause())) return;
  const newCond: UnrollExpr = { op: '<', l: { var: loopVar }, r: { num: bound } };
  const newBump: UnrollExpr = { op: '+', l: { var: loopVar }, r: { num: stride } };
  await ctx.emit({
    type: 'retune',
    payload: {
      condId: id(wi),
      condText: printStmt({ k: 'while', cond: newCond }),
      cond: printExpr(newCond),
      bumpId: id(bumpAt),
      bumpText: printStmt({ k: 'set', name: loopVar, value: newBump }),
      bump: printStmt({ k: 'set', name: loopVar, value: newBump }),
      stride,
      bound,
      rest,
      sweep: sweep(stride, bound, factor),
    },
  });

  let tailAfter = id(bumpAt);
  for (let k = 0; k < rest; k += 1) {
    if (!(await pause())) return;
    const from = copyIds[k];
    if (from === undefined) throw new Error(`나머지 ${k}: 베낄 벌이 없다`);
    const c = copyStmt(k);
    const rid = `R${k}`;
    await ctx.emit({
      type: 'peel',
      payload: { id: rid, from, after: tailAfter, indent: head.indent, text: c.text, k, at: bound + k * s, was: bound - stride + k * s, rest },
    });
    tailAfter = rid;
  }

  if (!(await pause())) return;
  await ctx.emit({
    type: 'compare',
    payload: {
      lines: [lines.length, lines.length + (factor - 1) + rest],
      checks: [n + 1, groups + 1],
      bumps: [n, groups],
      adds: [n, groups * factor + rest],
    },
  });
}
