/**
 * overfitting IR — 맞춤(정규 방정식 · 부분 피벗 가우스 소거)과 두 오차.
 *
 * algorithm.ts 의 `trainAndVal` 과 같은 차례로 셈한다 (합의 차례 · 반복 곱 · 엄격 비교). 그래서 두 답은
 * 표시 자리가 아니라 전 정밀도로 같다 — facet test 가 스물한 조합 모두에서 잠근다.
 *
 * 함수 넷 (첫 함수가 진입점):
 *   trainAndVal(xs, ys, vx, vy, d, M, c, errs) → double   errs[0] = 훈련 MSE · errs[1] = 검증 MSE, 검증 MSE 를 돌려준다
 *   fitPoly(xs, ys, d, M, c) → void
 *   polyMse(xs, ys, c, d) → double
 *   powi(x, k) → double
 * IR 은 배열을 만들 수 없다 — M(길이 (d+1)(d+2)) · c(d+1) · errs(2) 는 부르는 쪽이 만든다.
 * xs · ys 는 부르는 쪽이 이 n 의 점만 골라 x 차례로 넘긴다.
 *
 * TS 쪽은 피벗 후보의 동률 · 0 피벗에서 던진다. IR 은 사양의 서명(fitPoly → void)을 지키느라 표지를 두지 않는다 —
 * 이 데이터의 스물한 조합에서는 둘 다 걸리지 않는다 (facet test 가 TS 쪽으로 센다).
 *
 * phase: `fit` (fitPoly 의 짓기 · 소거 · 되짚기 줄과 진입 함수의 부름 줄) · `train-err` · `val-err`.
 * polyMse 안의 줄에는 phase 를 달지 않는다 (두 오차가 같은 함수를 쓴다).
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DBL: IRType = { kind: 'double' };
const VOID: IRType = { kind: 'void' };
const DLIST: IRType = { kind: 'list', of: DBL };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '/' | '>' | '>=' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
/** M[row * w + k] */
const cell = (row: IRExpr, k: IRExpr): IRExpr => at('M', bin('+', bin('*', row, v('w')), k));
const loop = (name: string, from: IRExpr, to: IRExpr, inclusive: boolean, body: IRStmt[], phase?: string): IRStmt => ({
  kind: 'for-range',
  var: name,
  from,
  to,
  inclusive,
  body,
  ...(phase ? { phase } : {}),
});

const powiFn = {
  name: 'powi',
  params: [
    { name: 'x', type: DBL },
    { name: 'k', type: INT },
  ],
  returnType: DBL,
  body: [
    { kind: 'comment', text: 'x^k by repeated multiplication' },
    { kind: 'var', name: 'p', type: DBL, init: n(1.0) },
    loop('i', n(0), v('k'), false, [{ kind: 'assign', target: v('p'), expr: bin('*', v('p'), v('x')) }]),
    { kind: 'return', expr: v('p') },
  ] as IRStmt[],
};

const polyMseFn = {
  name: 'polyMse',
  params: [
    { name: 'xs', type: DLIST },
    { name: 'ys', type: DLIST },
    { name: 'c', type: DLIST },
    { name: 'd', type: INT },
  ],
  returnType: DBL,
  body: [
    { kind: 'comment', text: 'MSE = sum((yhat - y)^2) / n' },
    { kind: 'var', name: 's', type: DBL, init: n(0.0) },
    loop('p', n(0), { kind: 'len', of: v('xs') }, false, [
      { kind: 'var', name: 'yhat', type: DBL, init: n(0.0) },
      { kind: 'var', name: 'q', type: DBL, init: n(1.0) },
      loop('i', n(0), v('d'), true, [
        { kind: 'assign', target: v('yhat'), expr: bin('+', v('yhat'), bin('*', at('c', v('i')), v('q'))) },
        { kind: 'assign', target: v('q'), expr: bin('*', v('q'), at('xs', v('p'))) },
      ]),
      { kind: 'var', name: 'e', type: DBL, init: bin('-', v('yhat'), at('ys', v('p'))) },
      { kind: 'assign', target: v('s'), expr: bin('+', v('s'), bin('*', v('e'), v('e'))) },
    ]),
    { kind: 'return', expr: bin('/', v('s'), { kind: 'len', of: v('xs') }) },
  ] as IRStmt[],
};

const fitPolyFn = {
  name: 'fitPoly',
  params: [
    { name: 'xs', type: DLIST },
    { name: 'ys', type: DLIST },
    { name: 'd', type: INT },
    { name: 'M', type: DLIST },
    { name: 'c', type: DLIST },
  ],
  returnType: VOID,
  body: [
    { kind: 'comment', text: 'normal equations (X^T X) c = X^T y, M is (d+1) x (d+2), last column = X^T y' },
    { kind: 'var', name: 'w', type: INT, init: bin('+', v('d'), n(2)), phase: 'fit' },
    loop(
      'r',
      n(0),
      v('d'),
      true,
      [
        loop('k', n(0), v('d'), true, [
          { kind: 'var', name: 's', type: DBL, init: n(0.0) },
          loop('p', n(0), { kind: 'len', of: v('xs') }, false, [
            {
              kind: 'assign',
              target: v('s'),
              expr: bin('+', v('s'), call('powi', at('xs', v('p')), bin('+', v('r'), v('k')))),
            },
          ]),
          { kind: 'assign', target: cell(v('r'), v('k')), expr: v('s'), phase: 'fit' },
        ]),
        { kind: 'var', name: 's2', type: DBL, init: n(0.0) },
        loop('p', n(0), { kind: 'len', of: v('xs') }, false, [
          {
            kind: 'assign',
            target: v('s2'),
            expr: bin('+', v('s2'), bin('*', at('ys', v('p')), call('powi', at('xs', v('p')), v('r')))),
          },
        ]),
        { kind: 'assign', target: cell(v('r'), bin('+', v('d'), n(1))), expr: v('s2'), phase: 'fit' },
      ],
      'fit',
    ),
    { kind: 'comment', text: 'Gaussian elimination with partial pivoting' },
    loop(
      'col',
      n(0),
      v('d'),
      true,
      [
        { kind: 'var', name: 'piv', type: INT, init: v('col') },
        loop('r', bin('+', v('col'), n(1)), v('d'), true, [
          {
            kind: 'if',
            cond: bin('>', call('abs', cell(v('r'), v('col'))), call('abs', cell(v('piv'), v('col')))),
            then: [{ kind: 'assign', target: v('piv'), expr: v('r') }],
          },
        ]),
        {
          kind: 'if',
          cond: bin('!=', v('piv'), v('col')),
          then: [
            loop('k', n(0), v('w'), false, [
              { kind: 'swap', a: cell(v('col'), v('k')), b: cell(v('piv'), v('k')), phase: 'fit' },
            ]),
          ],
        },
        loop('r', bin('+', v('col'), n(1)), v('d'), true, [
          { kind: 'var', name: 'f', type: DBL, init: bin('/', cell(v('r'), v('col')), cell(v('col'), v('col'))) },
          loop('k', v('col'), v('w'), false, [
            {
              kind: 'assign',
              target: cell(v('r'), v('k')),
              expr: bin('-', cell(v('r'), v('k')), bin('*', v('f'), cell(v('col'), v('k')))),
              phase: 'fit',
            },
          ]),
        ]),
      ],
      'fit',
    ),
    { kind: 'comment', text: 'back substitution, row = d down to 0' },
    { kind: 'var', name: 'row', type: INT, init: v('d') },
    {
      kind: 'while',
      cond: bin('>=', v('row'), n(0)),
      phase: 'fit',
      body: [
        { kind: 'var', name: 's', type: DBL, init: n(0.0) },
        loop('k', bin('+', v('row'), n(1)), v('d'), true, [
          { kind: 'assign', target: v('s'), expr: bin('+', v('s'), bin('*', cell(v('row'), v('k')), at('c', v('k')))) },
        ]),
        {
          kind: 'assign',
          target: at('c', v('row')),
          expr: bin('/', bin('-', cell(v('row'), bin('+', v('d'), n(1))), v('s')), cell(v('row'), v('row'))),
          phase: 'fit',
        },
        { kind: 'assign', target: v('row'), expr: bin('-', v('row'), n(1)) },
      ],
    },
  ] as IRStmt[],
};

const trainAndValFn = {
  name: 'trainAndVal',
  params: [
    { name: 'xs', type: DLIST },
    { name: 'ys', type: DLIST },
    { name: 'vx', type: DLIST },
    { name: 'vy', type: DLIST },
    { name: 'd', type: INT },
    { name: 'M', type: DLIST },
    { name: 'c', type: DLIST },
    { name: 'errs', type: DLIST },
  ],
  returnType: DBL,
  body: [
    { kind: 'comment', text: 'fit on the training points only, then measure both errors' },
    { kind: 'expr-stmt', expr: call('fitPoly', v('xs'), v('ys'), v('d'), v('M'), v('c')), phase: 'fit' },
    { kind: 'assign', target: at('errs', n(0)), expr: call('polyMse', v('xs'), v('ys'), v('c'), v('d')), phase: 'train-err' },
    { kind: 'assign', target: at('errs', n(1)), expr: call('polyMse', v('vx'), v('vy'), v('c'), v('d')), phase: 'val-err' },
    { kind: 'return', expr: at('errs', n(1)) },
  ] as IRStmt[],
};

export const overfittingImperativeIR: IR = {
  id: 'overfitting-imperative',
  algorithm: 'overfitting',
  paradigm: 'imperative',
  functions: [trainAndValFn, fitPolyFn, polyMseFn, powiFn],
};

export const overfittingIRs: IR[] = [overfittingImperativeIR];
