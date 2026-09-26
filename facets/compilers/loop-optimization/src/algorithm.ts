/**
 * loop-optimization — 반복을 고치는 두 변환(꺼내기 · 펼치기)이 반복 횟수에 값을 거는 것을 보인다.
 *
 * 한 판 = 원래 프로그램(걸음 0) → (꺼내기 켬) 판정 · 꺼냄 → (배수 ≥ 2) 벌 붙이기 F − 1 걸음 ·
 * 조건과 올림 고치기 · 나머지 R 걸음 → 셈. 그다음 손잡이 입력을 기다렸다가 **원래 프로그램에서** 다시 선다.
 *
 * 규약 (사양 그대로)
 *   - 차례는 늘 꺼내기 → 펼치기.
 *   - 꺼내기 — 몸의 줄마다 (1) 넣는 이름을 몸에서 한 번만 넣고 (2) 읽는 이름마다 수이거나 몸에서 넣지 않는
 *     이름이거나 이미 불변인 줄이 넣는 이름이면 불변. 새 불변이 없을 때까지 판을 거듭한다. 칸 읽기의 목록
 *     이름(`list`)은 판정에서 뺀다. 불변 줄은 `while` 머리줄 바로 앞으로 옮긴다.
 *   - 펼치기 — `let i = lo` · `while i < hi` · 몸 끝 `i = i + s` 가 다 수일 때만. N = ⌈(hi − lo) / s⌉ (hi ≤ lo 이면 0),
 *     G = N div F, R = N mod F. 벌 k(0 부터)는 식 안 `i` 를 `i + k × s` 로. 새 조건 `i < lo + G × F × s` ·
 *     새 올림 `i = i + F × s`. 나머지 R 벌은 반복 뒤에 곧은 줄로. 한 몸 안에서 같은 이름을 두 번 `let` 하지
 *     않는다 — 벌 k ≥ 1 과 나머지 k ≥ 1 의 `let` 은 넣기로 적는다.
 *   - 셈은 실행기 없이 구조에서 — 곧은 줄 한 번 · 조건 식은 (도는 바퀴 + 1) 번 · 몸 줄은 도는 바퀴 번.
 *     실행 연산 = 모든 op 마디(`list[i + 1]` 의 `+` 도). 반복 관리 = 조건 셈 + 올림 셈. 코드 줄 = 머리줄 · return 포함.
 *   - 동률 규칙은 없다 — 판정은 줄마다 참 · 거짓이고 셈은 정수 더하기뿐이다.
 *
 * 이벤트 (payload 는 모두 평범한 객체)
 *   round  { trips, factor, hoist, lines: ProgramLine[], ops, overhead, codeLines, scaleOps, scaleLines }
 *          — 걸음 0. 원래 프로그램과 그 셈. scale* 은 사다리 전 조합에서 가장 큰 값(막대 눈금)
 *   judge  { marks: JudgeMark[] }                      — 판정 걸음
 *   hoist  { lines, moved: string[] }                  — 꺼냄 걸음 (moved = 옮긴 줄 key)
 *   copy   { lines, copy, factor, shift, added: string[] } — 벌 붙이기 (copy 는 1 부터 센 벌 번호)
 *   bound  { lines, oldHi, newHi, oldStep, newStep, changed: string[] } — 조건 · 올림 고치기
 *   tail   { lines, tail, rest, added: string[] }       — 나머지 한 벌 (tail 은 1 부터)
 *   count  { lines, ops, overhead, codeLines, iterations, ops0, overhead0, codeLines0 } — 셈 걸음
 *   phase  { phase } silent — 걸음마다 하나
 *
 * phase 어휘 (irs.ts 와 같다): hoist-check · hoist-move · unroll-copy · unroll-bound · unroll-tail · count-ops
 *
 * 계기: exec-ops · loop-overhead · code-lines — 걸음 0 과 셈 걸음에서만 바뀐다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BinOp = '+' | '-' | '*' | '<';

export type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'index'; list: string; at: Expr }
  | { kind: 'op'; op: BinOp; l: Expr; r: Expr };

export type Stmt =
  | { kind: 'let'; name: string; expr: Expr }
  | { kind: 'set'; name: string; expr: Expr }
  | { kind: 'while'; cond: Expr; body: Stmt[] }
  | { kind: 'return'; expr: Expr };

export type LoopOptimizationData = {
  type: 'loop-optimization';
  stepMs: number;
  motionMs: number;
  fnName: string;
  fnParams: string[];
  program: Stmt[];
  tripsLadder: number[];
  factorLadder: number[];
  hoistLadder: number[];
  trips: number;
  factor: number;
  hoist: number;
};

/** 화면의 한 줄. key 는 판을 넘어 같은 줄을 잇는다. */
export type ProgramLine = {
  key: string;
  text: string;
  indent: number;
  /** 이 줄이 나온 원래 몸 줄의 key (새 판에서 접혀 들어갈 자리). 원래 줄이면 null */
  home: string | null;
  /** 이 줄이 처음 나타날 때 출발하는 줄의 key. 원래 줄이면 null */
  from: string | null;
  /** 벌 번호 (1 부터). 몸 · 나머지 줄이 아니면 0 */
  copy: number;
  /** 'body' 반복 몸 · 'tail' 반복 뒤 나머지 · 'plain' 그 밖 */
  part: 'body' | 'tail' | 'plain';
};

export type JudgeMark = {
  key: string;
  invariant: boolean;
  /** 'steady' 불변 · 'changes' 몸에서 바뀌는 이름을 읽음 · 'twice' 같은 이름을 몸에서 두 번 넣음 */
  reason: 'steady' | 'changes' | 'twice';
  names: string[];
};

type Keyed = { key: string; stmt: Stmt; home: string | null; from: string | null; copy: number };

type LoopState = {
  pre: Keyed[];
  hoisted: Keyed[];
  cond: Expr;
  body: Keyed[];
  tail: Keyed[];
  post: Keyed[];
  /** 펼쳤으면 G, 아니면 N */
  iterations: number;
};

export type LoopCost = { ops: number; overhead: number; codeLines: number };

// ─────────────────────────────────────────────── 식 셈 · 찍개

const PREC: Record<BinOp, number> = { '<': 0, '+': 1, '-': 1, '*': 2 };

export function showExpr(e: Expr): string {
  switch (e.kind) {
    case 'num':
      return String(e.value);
    case 'var':
      return e.name;
    case 'index':
      return `${e.list}[${showExpr(e.at)}]`;
    case 'op': {
      let sl = showExpr(e.l);
      let sr = showExpr(e.r);
      if (e.l.kind === 'op' && PREC[e.l.op] < PREC[e.op]) sl = `(${sl})`;
      if (e.r.kind === 'op' && PREC[e.r.op] <= PREC[e.op]) sr = `(${sr})`;
      return `${sl} ${e.op} ${sr}`;
    }
    default:
      throw new Error(`loop-optimization: 모르는 식 ${JSON.stringify(e)}`);
  }
}

/** 식 안의 op 마디 수 — 칸 읽기 안의 더하기도 센다. */
export function opsIn(e: Expr): number {
  switch (e.kind) {
    case 'num':
    case 'var':
      return 0;
    case 'index':
      return opsIn(e.at);
    case 'op':
      return 1 + opsIn(e.l) + opsIn(e.r);
    default:
      throw new Error(`loop-optimization: 모르는 식 ${JSON.stringify(e)}`);
  }
}

/** 식이 읽는 이름 (나오는 차례, 겹침 포함). 칸 읽기의 목록 이름도 넣는다. */
export function namesIn(e: Expr): string[] {
  switch (e.kind) {
    case 'num':
      return [];
    case 'var':
      return [e.name];
    case 'index':
      return [e.list, ...namesIn(e.at)];
    case 'op':
      return [...namesIn(e.l), ...namesIn(e.r)];
    default:
      throw new Error(`loop-optimization: 모르는 식 ${JSON.stringify(e)}`);
  }
}

/** 칸 읽기 가운데 칸 식에 반복 변수가 든 것의 수 (벌마다 더하기가 얹히는 자리). */
export function indexUsesOf(e: Expr, loopVar: string): number {
  switch (e.kind) {
    case 'num':
    case 'var':
      return 0;
    case 'index':
      return (namesIn(e.at).includes(loopVar) ? 1 : 0) + indexUsesOf(e.at, loopVar);
    case 'op':
      return indexUsesOf(e.l, loopVar) + indexUsesOf(e.r, loopVar);
    default:
      throw new Error(`loop-optimization: 모르는 식 ${JSON.stringify(e)}`);
  }
}

/** 식 안의 loopVar 를 loopVar + k 로 (k = 0 이면 그대로). */
function shiftVar(e: Expr, loopVar: string, k: number): Expr {
  if (k === 0) return e;
  switch (e.kind) {
    case 'num':
      return e;
    case 'var':
      return e.name === loopVar
        ? { kind: 'op', op: '+', l: e, r: { kind: 'num', value: k } }
        : e;
    case 'index':
      return { kind: 'index', list: e.list, at: shiftVar(e.at, loopVar, k) };
    case 'op':
      return { kind: 'op', op: e.op, l: shiftVar(e.l, loopVar, k), r: shiftVar(e.r, loopVar, k) };
    default:
      throw new Error(`loop-optimization: 모르는 식 ${JSON.stringify(e)}`);
  }
}

function exprOf(s: Stmt): Expr {
  if (s.kind === 'while') return s.cond;
  return s.expr;
}

function writeOf(s: Stmt): string {
  if (s.kind === 'let' || s.kind === 'set') return s.name;
  throw new Error(`loop-optimization: 넣는 이름이 없는 줄 ${s.kind}`);
}

export function showStmt(s: Stmt): string {
  switch (s.kind) {
    case 'let':
      return `let ${s.name} = ${showExpr(s.expr)}`;
    case 'set':
      return `${s.name} = ${showExpr(s.expr)}`;
    case 'while':
      return `while ${showExpr(s.cond)}`;
    case 'return':
      return `return ${showExpr(s.expr)}`;
    default:
      throw new Error(`loop-optimization: 모르는 줄 ${JSON.stringify(s)}`);
  }
}

// ─────────────────────────────────────────────── 프로그램 짜임

function num(value: number): Expr {
  return { kind: 'num', value };
}

/** 원래 프로그램을 판의 상태로 편다. `while` 조건의 오른쪽 수가 N 으로 바뀐다. */
function initialState(data: LoopOptimizationData, trips: number): LoopState {
  const loopAt = data.program.findIndex((s) => s.kind === 'while');
  if (loopAt < 0) throw new Error('loop-optimization: 프로그램에 while 이 없다');
  const loop = data.program[loopAt];
  if (loop === undefined || loop.kind !== 'while') throw new Error('loop-optimization: while 을 못 찾았다');
  if (loop.cond.kind !== 'op' || loop.cond.op !== '<' || loop.cond.r.kind !== 'num') {
    throw new Error('loop-optimization: 조건이 `변수 < 수` 꼴이 아니다');
  }
  const cond: Expr = { kind: 'op', op: '<', l: loop.cond.l, r: num(trips) };
  const top = (s: Stmt, i: number): Keyed => ({ key: `top-${i}`, stmt: s, home: null, from: null, copy: 0 });
  const pre = data.program.slice(0, loopAt).map((s, i) => top(s, i));
  const post = data.program.slice(loopAt + 1).map((s, i) => top(s, loopAt + 1 + i));
  const body = loop.body.map((s, j): Keyed => ({ key: `body-${j}`, stmt: s, home: null, from: null, copy: 1 }));
  return { pre, hoisted: [], cond, body, tail: [], post, iterations: tripsOf(pre, cond, body) };
}

/** 셈에 쓰는 도는 바퀴 — 펼치기 전에는 N. */
function tripsOf(pre: Keyed[], cond: Expr, body: Keyed[]): number {
  const shape = loopShape(pre, cond, body);
  if (shape.hi <= shape.lo) return 0;
  return Math.ceil((shape.hi - shape.lo) / shape.step);
}

type LoopShape = { loopVar: string; lo: number; hi: number; step: number };

/** `let i = lo` · `while i < hi` · 몸 끝 `i = i + s` 를 읽는다. 꼴이 아니면 던진다. */
function loopShape(pre: Keyed[], cond: Expr, body: Keyed[]): LoopShape {
  if (cond.kind !== 'op' || cond.op !== '<' || cond.l.kind !== 'var' || cond.r.kind !== 'num') {
    throw new Error('loop-optimization: 조건이 `i < 수` 꼴이 아니다');
  }
  const loopVar = cond.l.name;
  const init = pre.find((k) => k.stmt.kind === 'let' && k.stmt.name === loopVar);
  if (init === undefined || init.stmt.kind !== 'let' || init.stmt.expr.kind !== 'num') {
    throw new Error('loop-optimization: 반복 변수의 처음 값이 수가 아니다');
  }
  const last = body[body.length - 1];
  if (last === undefined) throw new Error('loop-optimization: 몸이 비었다');
  const inc = last.stmt;
  if (
    inc.kind !== 'set' ||
    inc.name !== loopVar ||
    inc.expr.kind !== 'op' ||
    inc.expr.op !== '+' ||
    inc.expr.l.kind !== 'var' ||
    inc.expr.l.name !== loopVar ||
    inc.expr.r.kind !== 'num' ||
    inc.expr.r.value <= 0
  ) {
    throw new Error('loop-optimization: 몸 끝이 `i = i + 수` 가 아니다');
  }
  return { loopVar, lo: init.stmt.expr.value, hi: cond.r.value, step: inc.expr.r.value };
}

export function linesOf(data: LoopOptimizationData, st: LoopState): ProgramLine[] {
  const line = (k: Keyed, indent: number, part: ProgramLine['part']): ProgramLine => ({
    key: k.key,
    text: showStmt(k.stmt),
    indent,
    home: k.home,
    from: k.from,
    copy: part === 'plain' ? 0 : k.copy,
    part,
  });
  const plain = (key: string, text: string, indent: number): ProgramLine => ({
    key,
    text,
    indent,
    home: null,
    from: null,
    copy: 0,
    part: 'plain',
  });
  return [
    plain('head', `function ${data.fnName}(${data.fnParams.join(', ')})`, 0),
    ...st.pre.map((k) => line(k, 1, 'plain')),
    ...st.hoisted.map((k) => line(k, 1, 'plain')),
    plain('loop', `while ${showExpr(st.cond)}`, 1),
    ...st.body.map((k) => line(k, 2, 'body')),
    ...st.tail.map((k) => line(k, 1, 'tail')),
    ...st.post.map((k) => line(k, 1, 'plain')),
  ];
}

/** 구조에서 셈한다 — 곧은 줄 한 번 · 조건 (바퀴 + 1) 번 · 몸 줄 바퀴 번. */
function costOf(data: LoopOptimizationData, st: LoopState): LoopCost {
  const straight = [...st.pre, ...st.hoisted, ...st.tail, ...st.post].reduce(
    (a, k) => a + opsIn(exprOf(k.stmt)),
    0,
  );
  const n = st.iterations;
  const condOps = opsIn(st.cond) * (n + 1);
  const bodyOps = st.body.reduce((a, k) => a + opsIn(exprOf(k.stmt)), 0) * n;
  const last = st.body[st.body.length - 1];
  if (last === undefined) throw new Error('loop-optimization: 몸이 비었다');
  const incOps = opsIn(exprOf(last.stmt)) * n;
  return {
    ops: straight + condOps + bodyOps,
    overhead: condOps + incOps,
    codeLines: linesOf(data, st).length,
  };
}

/** 불변 판정 — 새 불변이 없을 때까지 판을 거듭한다. 올림 줄도 판정 대상이다. */
export function judgeBody(body: Stmt[], skipName: string[]): { invariant: boolean[]; marks: Omit<JudgeMark, 'key'>[] } {
  const writes = body.map(writeOf);
  const inv = body.map(() => false);
  let changed = true;
  while (changed) {
    changed = false;
    body.forEach((s, j) => {
      if (inv[j]) return;
      const name = writeOf(s);
      let ok = writes.filter((w) => w === name).length === 1;
      for (const x of namesIn(exprOf(s))) {
        if (skipName.includes(x)) continue;
        const q = writes.indexOf(x);
        if (q >= 0 && !inv[q]) ok = false;
      }
      if (ok) {
        inv[j] = true;
        changed = true;
      }
    });
  }
  const marks = body.map((s, j): Omit<JudgeMark, 'key'> => {
    const read = [...new Set(namesIn(exprOf(s)).filter((x) => !skipName.includes(x)))];
    const name = writeOf(s);
    if (inv[j]) return { invariant: true, reason: 'steady', names: read };
    if (writes.filter((w) => w === name).length !== 1) return { invariant: false, reason: 'twice', names: [name] };
    const moving = read.filter((x) => {
      const q = writes.indexOf(x);
      return q >= 0 && !inv[q];
    });
    return { invariant: false, reason: 'changes', names: moving };
  });
  return { invariant: inv, marks };
}

/** 칸 읽기의 목록 이름 — 판정에서 뺀다. */
function listNames(e: Expr): string[] {
  switch (e.kind) {
    case 'num':
    case 'var':
      return [];
    case 'index':
      return [e.list, ...listNames(e.at)];
    case 'op':
      return [...listNames(e.l), ...listNames(e.r)];
    default:
      throw new Error(`loop-optimization: 모르는 식 ${JSON.stringify(e)}`);
  }
}

function skipNamesOf(body: Stmt[]): string[] {
  return [...new Set(body.flatMap((s) => listNames(exprOf(s))))];
}

/** 벌 · 나머지 한 벌 — k ≥ 1 이면 `let` 을 넣기로. */
function copyStmt(s: Stmt, loopVar: string, k: number): Stmt {
  if (s.kind === 'let') {
    const expr = shiftVar(s.expr, loopVar, k);
    return k === 0 ? { kind: 'let', name: s.name, expr } : { kind: 'set', name: s.name, expr };
  }
  if (s.kind === 'set') return { kind: 'set', name: s.name, expr: shiftVar(s.expr, loopVar, k) };
  throw new Error(`loop-optimization: 몸에 둘 수 없는 줄 ${s.kind}`);
}

// ─────────────────────────────────────────────── 한 판의 걸음 (순수)

export type LoopStep =
  | { kind: 'round'; lines: ProgramLine[]; cost: LoopCost }
  | { kind: 'judge'; lines: ProgramLine[]; marks: JudgeMark[] }
  | { kind: 'hoist'; lines: ProgramLine[]; moved: string[] }
  | { kind: 'copy'; lines: ProgramLine[]; copy: number; factor: number; shift: number; added: string[] }
  | { kind: 'bound'; lines: ProgramLine[]; oldHi: number; newHi: number; oldStep: number; newStep: number; changed: string[] }
  | { kind: 'tail'; lines: ProgramLine[]; tail: number; rest: number; added: string[] }
  | { kind: 'count'; lines: ProgramLine[]; cost: LoopCost; base: LoopCost; iterations: number };

/** 손잡이 값 셋으로 한 판의 걸음 전부를 셈한다. 알고리즘과 검사가 같이 쓴다. */
export function planRound(data: LoopOptimizationData, trips: number, factor: number, hoist: number): LoopStep[] {
  const st = initialState(data, trips);
  const steps: LoopStep[] = [];
  const base = costOf(data, st);
  steps.push({ kind: 'round', lines: linesOf(data, st), cost: base });

  if (hoist === 1) {
    const bodyStmts = st.body.map((k) => k.stmt);
    const { invariant, marks } = judgeBody(bodyStmts, skipNamesOf(bodyStmts));
    steps.push({
      kind: 'judge',
      lines: linesOf(data, st),
      marks: marks.map((m, j) => {
        const k = st.body[j];
        if (k === undefined) throw new Error('loop-optimization: 판정 줄이 모자란다');
        return { key: k.key, ...m };
      }),
    });
    const moved = st.body.filter((_, j) => invariant[j] === true);
    st.hoisted = moved;
    st.body = st.body.filter((_, j) => invariant[j] !== true);
    if (st.body.length === 0) throw new Error('loop-optimization: 올림 줄까지 꺼내면 반복이 아니다');
    steps.push({ kind: 'hoist', lines: linesOf(data, st), moved: moved.map((k) => k.key) });
  }

  if (factor >= 2) {
    const shape = loopShape(st.pre, st.cond, st.body);
    const n = st.iterations;
    const g = Math.floor(n / factor);
    const r = n % factor;
    const inc = st.body[st.body.length - 1];
    if (inc === undefined) throw new Error('loop-optimization: 몸이 비었다');
    const work = st.body.slice(0, -1);
    const copies: Keyed[] = [...work];
    for (let k = 1; k < factor; k++) {
      const added = work.map(
        (w): Keyed => ({
          key: `copy-${k}-${w.key}`,
          stmt: copyStmt(w.stmt, shape.loopVar, k * shape.step),
          home: w.key,
          from: w.key,
          copy: k + 1,
        }),
      );
      copies.push(...added);
      st.body = [...copies, inc];
      steps.push({
        kind: 'copy',
        lines: linesOf(data, st),
        copy: k + 1,
        factor,
        shift: k * shape.step,
        added: added.map((a) => a.key),
      });
    }
    const newHi = shape.lo + g * factor * shape.step;
    const newStep = factor * shape.step;
    st.cond = { kind: 'op', op: '<', l: { kind: 'var', name: shape.loopVar }, r: num(newHi) };
    const incNew: Keyed = {
      key: inc.key,
      stmt: {
        kind: 'set',
        name: shape.loopVar,
        expr: { kind: 'op', op: '+', l: { kind: 'var', name: shape.loopVar }, r: num(newStep) },
      },
      home: inc.home,
      from: inc.from,
      copy: inc.copy,
    };
    st.body = [...copies, incNew];
    st.iterations = g;
    steps.push({
      kind: 'bound',
      lines: linesOf(data, st),
      oldHi: shape.hi,
      newHi,
      oldStep: shape.step,
      newStep,
      changed: ['loop', inc.key],
    });
    for (let k = 0; k < r; k++) {
      const added = work.map(
        (w): Keyed => ({
          key: `tail-${k}-${w.key}`,
          stmt: copyStmt(w.stmt, shape.loopVar, k * shape.step),
          home: w.key,
          from: k === 0 ? w.key : `copy-${k}-${w.key}`,
          copy: k + 1,
        }),
      );
      st.tail = [...st.tail, ...added];
      steps.push({ kind: 'tail', lines: linesOf(data, st), tail: k + 1, rest: r, added: added.map((a) => a.key) });
    }
  }

  steps.push({ kind: 'count', lines: linesOf(data, st), cost: costOf(data, st), base, iterations: st.iterations });
  return steps;
}

/** 마지막 걸음의 셈 — 검사 · 막대 눈금이 쓴다. */
export function finalCost(data: LoopOptimizationData, trips: number, factor: number, hoist: number): LoopCost {
  const last = planRound(data, trips, factor, hoist).at(-1);
  if (last === undefined || last.kind !== 'count') throw new Error('loop-optimization: 판이 셈으로 끝나지 않았다');
  return last.cost;
}

/** IR 매개변수 — 몸 줄을 번호 배열로 편다. 이름 번호는 부르는 쪽이 짓는다. */
export type LoopIRArgs = {
  bodyOps: number[];
  bodyIdx: number[];
  bodyWrite: number[];
  bodyReads: number[];
  nBody: number;
  width: number;
  lo: number;
  hi: number;
  step: number;
};

export function irArgsOf(data: LoopOptimizationData, trips: number, names: string[], width = 3): LoopIRArgs {
  const st = initialState(data, trips);
  const shape = loopShape(st.pre, st.cond, st.body);
  const body = st.body.map((k) => k.stmt);
  const skip = skipNamesOf(body);
  const id = (x: string): number => {
    const i = names.indexOf(x);
    if (i < 0) throw new Error(`loop-optimization: 이름 번호가 없다 ${x}`);
    return i;
  };
  const bodyReads: number[] = [];
  for (const s of body) {
    const rs = [...new Set(namesIn(exprOf(s)).filter((x) => !skip.includes(x)))].map(id);
    if (rs.length > width) throw new Error('loop-optimization: 읽는 이름이 width 보다 많다');
    bodyReads.push(...rs, ...Array.from({ length: width - rs.length }, () => -1));
  }
  return {
    bodyOps: body.map((s) => opsIn(exprOf(s))),
    bodyIdx: body.map((s) => indexUsesOf(exprOf(s), shape.loopVar)),
    bodyWrite: body.map((s) => id(writeOf(s))),
    bodyReads,
    nBody: body.length,
    width,
    lo: shape.lo,
    hi: shape.hi,
    step: shape.step,
  };
}

/** 몸 줄 차례를 바꾼 데이터 — 올림 줄은 끝에 둔다 (검사용). */
export function withBodyOrder(data: LoopOptimizationData, order: number[]): LoopOptimizationData {
  return {
    ...data,
    program: data.program.map((s) => {
      if (s.kind !== 'while') return s;
      const work = s.body.slice(0, -1);
      const inc = s.body[s.body.length - 1];
      if (inc === undefined || order.length !== work.length) throw new Error('loop-optimization: 차례가 맞지 않는다');
      return {
        kind: 'while',
        cond: s.cond,
        body: [
          ...order.map((i) => {
            const w = work[i];
            if (w === undefined) throw new Error('loop-optimization: 차례 번호가 넘친다');
            return w;
          }),
          inc,
        ],
      };
    }),
  };
}

// ─────────────────────────────────────────────── 알고리즘

function knob(payload: unknown, ladder: number[]): number | null {
  if (payload === null || typeof payload !== 'object') return null;
  const v = (payload as { value?: unknown }).value;
  if (typeof v !== 'number') return null;
  return ladder.includes(v) ? v : null;
}

export async function loopOptimizationAlgorithm(ctx: FacetContext<LoopOptimizationData>): Promise<void> {
  const rctx = ctx as ReactiveContext<LoopOptimizationData>;
  const data = ctx.data;
  let trips = data.trips;
  let factor = data.factor;
  let hoist = data.hoist;

  let scaleOps = 0;
  let scaleLines = 0;
  for (const n of data.tripsLadder) {
    for (const f of data.factorLadder) {
      for (const h of data.hoistLadder) {
        const c = finalCost(data, n, f, h);
        const b = planRound(data, n, f, h)[0];
        if (b === undefined || b.kind !== 'round') throw new Error('loop-optimization: 걸음 0 이 없다');
        scaleOps = Math.max(scaleOps, c.ops, b.cost.ops);
        scaleLines = Math.max(scaleLines, c.codeLines, b.cost.codeLines);
      }
    }
  }

  const shown = { ops: 0, overhead: 0, lines: 0 };
  const showCost = (c: LoopCost) => {
    ctx.metric('exec-ops', c.ops - shown.ops);
    ctx.metric('loop-overhead', c.overhead - shown.overhead);
    ctx.metric('code-lines', c.codeLines - shown.lines);
    shown.ops = c.ops;
    shown.overhead = c.overhead;
    shown.lines = c.codeLines;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => rctx.sleep(data.stepMs + data.motionMs);

  for (;;) {
    if (ctx.cancelled) return;
    const steps = planRound(data, trips, factor, hoist);
    for (const s of steps) {
      if (ctx.cancelled) return;
      switch (s.kind) {
        case 'round':
          showCost(s.cost);
          await ctx.emit({
            type: 'round',
            payload: {
              trips,
              factor,
              hoist,
              lines: s.lines,
              ops: s.cost.ops,
              overhead: s.cost.overhead,
              codeLines: s.cost.codeLines,
              scaleOps,
              scaleLines,
            },
          });
          break;
        case 'judge':
          await phase('hoist-check');
          await ctx.emit({ type: 'judge', payload: { lines: s.lines, marks: s.marks } });
          break;
        case 'hoist':
          await phase('hoist-move');
          await ctx.emit({ type: 'hoist', payload: { lines: s.lines, moved: s.moved } });
          break;
        case 'copy':
          await phase('unroll-copy');
          await ctx.emit({
            type: 'copy',
            payload: { lines: s.lines, copy: s.copy, factor: s.factor, shift: s.shift, added: s.added },
          });
          break;
        case 'bound':
          await phase('unroll-bound');
          await ctx.emit({
            type: 'bound',
            payload: {
              lines: s.lines,
              oldHi: s.oldHi,
              newHi: s.newHi,
              oldStep: s.oldStep,
              newStep: s.newStep,
              changed: s.changed,
            },
          });
          break;
        case 'tail':
          await phase('unroll-tail');
          await ctx.emit({ type: 'tail', payload: { lines: s.lines, tail: s.tail, rest: s.rest, added: s.added } });
          break;
        case 'count':
          await phase('count-ops');
          showCost(s.cost);
          await ctx.emit({
            type: 'count',
            payload: {
              lines: s.lines,
              ops: s.cost.ops,
              overhead: s.cost.overhead,
              codeLines: s.cost.codeLines,
              iterations: s.iterations,
              ops0: s.base.ops,
              overhead0: s.base.overhead,
              codeLines0: s.base.codeLines,
            },
          });
          break;
        default:
          throw new Error('loop-optimization: 모르는 걸음');
      }
      if (!(await pause())) return;
    }

    // 한 판이 끝났다 — 손잡이를 기다린다
    for (;;) {
      if (ctx.cancelled) return;
      const input = await rctx.waitForInput();
      if (ctx.cancelled) return;
      if (input.type === 'trips') {
        const v = knob(input.payload, data.tripsLadder);
        if (v === null) continue;
        trips = v;
      } else if (input.type === 'factor') {
        const v = knob(input.payload, data.factorLadder);
        if (v === null) continue;
        factor = v;
      } else if (input.type === 'hoist') {
        const v = knob(input.payload, data.hoistLadder);
        if (v === null) continue;
        hoist = v;
      } else {
        continue;
      }
      break;
    }
  }
}
