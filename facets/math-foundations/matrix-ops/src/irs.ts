/**
 * matrix-ops 의 IR — 알고리즘과 같은 길로 셈한다.
 *
 * - `sameAsTwoJumps(x, y, px, py, yx)` — Y (X p) 와 (YX) p 가 같은 점 수 (늘 점 수와 같다 · 걸음 4)
 * - `samePoints(x, y, px, py, yx, xy)` — (YX) p 와 (XY) p 가 같은 점 수 = 계기 `same-spot` (걸음 5)
 * - `compose(y, x, dst)` — dst = y · x, 칸마다 행 · 열 맞물림
 * - `det(m)` — m[0]·m[3] − m[1]·m[2] (걸음 3)
 *
 * IR 함수는 배열을 만들지 못하니 버퍼 `yx` · `xy` (길이 4) 는 부르는 쪽이 만들어 넘긴다.
 * 정수만 돌고 `%` · 나눗셈이 없다. 중간값은 행렬 칸 |4| · 좌표 |8| 안이다.
 * phase 어휘는 algorithm 과 같다: jump-x · jump-y · product · jump-yx · jump-xy.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr | number): IRExpr => ({
  kind: 'index',
  arr: v(arr),
  idx: typeof idx === 'number' ? n(idx) : idx,
});
const add = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '+', l, r });
const sub = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '-', l, r });
const mul = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '*', l, r });
const eq = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '==', l, r });
const and = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '&&', l, r });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

const decl = (name: string, init: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'var', name, type: INT, init } : { kind: 'var', name, type: INT, init, phase };

/** m · (px[i], py[i]) 의 첫 성분 / 둘째 성분 */
const rowTimesPoint = (m: string, row: 0 | 1): IRExpr =>
  add(mul(at(m, row * 2), at('px', v('i'))), mul(at(m, row * 2 + 1), at('py', v('i'))));
/** m · (qx, qy) 의 첫 성분 / 둘째 성분 */
const rowTimes = (m: string, row: 0 | 1, qx: string, qy: string): IRExpr =>
  add(mul(at(m, row * 2), v(qx)), mul(at(m, row * 2 + 1), v(qy)));

const countIfSame = (ax: string, ay: string, bx: string, by: string, phase: string): IRStmt => ({
  kind: 'if',
  cond: and(eq(v(ax), v(bx)), eq(v(ay), v(by))),
  then: [{ kind: 'assign', target: v('count'), expr: add(v('count'), n(1)) }],
  phase,
});

const pointLoop = (body: IRStmt[]): IRStmt => ({
  kind: 'for-range',
  var: 'i',
  from: n(0),
  to: { kind: 'len', of: v('px') },
  inclusive: false,
  body,
});

const sameAsTwoJumps = {
  name: 'sameAsTwoJumps',
  params: [
    { name: 'x', type: LIST },
    { name: 'y', type: LIST },
    { name: 'px', type: LIST },
    { name: 'py', type: LIST },
    { name: 'yx', type: LIST },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'X first, then Y: the product is YX (the right one acts first)' },
    { kind: 'expr-stmt', expr: call('compose', v('y'), v('x'), v('yx')), phase: 'product' },
    decl('count', n(0)),
    pointLoop([
      { kind: 'comment', text: 'two jumps: X p, then Y (X p)' },
      decl('ax', rowTimesPoint('x', 0), 'jump-x'),
      decl('ay', rowTimesPoint('x', 1), 'jump-x'),
      decl('bx', rowTimes('y', 0, 'ax', 'ay'), 'jump-y'),
      decl('by', rowTimes('y', 1, 'ax', 'ay'), 'jump-y'),
      { kind: 'comment', text: 'one jump from home: (YX) p' },
      decl('cx', rowTimesPoint('yx', 0), 'jump-yx'),
      decl('cy', rowTimesPoint('yx', 1), 'jump-yx'),
      countIfSame('bx', 'by', 'cx', 'cy', 'jump-yx'),
    ]),
    { kind: 'return', expr: v('count'), phase: 'jump-yx' },
  ],
} satisfies IR['functions'][number];

const samePoints = {
  name: 'samePoints',
  params: [
    { name: 'x', type: LIST },
    { name: 'y', type: LIST },
    { name: 'px', type: LIST },
    { name: 'py', type: LIST },
    { name: 'yx', type: LIST },
    { name: 'xy', type: LIST },
  ],
  returnType: INT,
  body: [
    { kind: 'expr-stmt', expr: call('compose', v('y'), v('x'), v('yx')), phase: 'product' },
    { kind: 'comment', text: 'swap the order: XY' },
    { kind: 'expr-stmt', expr: call('compose', v('x'), v('y'), v('xy')), phase: 'jump-xy' },
    decl('count', n(0)),
    pointLoop([
      decl('cx', rowTimesPoint('yx', 0), 'jump-yx'),
      decl('cy', rowTimesPoint('yx', 1), 'jump-yx'),
      decl('gx', rowTimesPoint('xy', 0), 'jump-xy'),
      decl('gy', rowTimesPoint('xy', 1), 'jump-xy'),
      countIfSame('cx', 'cy', 'gx', 'gy', 'jump-xy'),
    ]),
    { kind: 'return', expr: v('count'), phase: 'jump-xy' },
  ],
} satisfies IR['functions'][number];

/** dst[r*2+c] = y 의 r 행 · x 의 c 열 */
const cell = (r: 0 | 1, c: 0 | 1): IRStmt => ({
  kind: 'assign',
  target: at('dst', r * 2 + c),
  expr: add(mul(at('y', r * 2), at('x', c)), mul(at('y', r * 2 + 1), at('x', 2 + c))),
});

const compose = {
  name: 'compose',
  params: [
    { name: 'y', type: LIST },
    { name: 'x', type: LIST },
    { name: 'dst', type: LIST },
  ],
  returnType: { kind: 'void' },
  body: [
    { kind: 'comment', text: 'each cell: a row of y meets a column of x' },
    cell(0, 0),
    cell(0, 1),
    cell(1, 0),
    cell(1, 1),
  ],
} satisfies IR['functions'][number];

const detFn = {
  name: 'det',
  params: [{ name: 'm', type: LIST }],
  returnType: INT,
  body: [{ kind: 'return', expr: sub(mul(at('m', 0), at('m', 3)), mul(at('m', 1), at('m', 2))), phase: 'product' }],
} satisfies IR['functions'][number];

export const matrixOpsImperativeIR: IR = {
  id: 'matrix-ops-imperative',
  algorithm: 'matrixOps',
  paradigm: 'imperative',
  functions: [sameAsTwoJumps, samePoints, compose, detFn],
};

export const matrixOpsIRs: IR[] = [matrixOpsImperativeIR];
