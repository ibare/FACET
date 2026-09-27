/**
 * gradient IR — 방향 기울기를 가운데 차분으로 잰다.
 *
 *   dirSlope(terms, x, y, dx, dy, d) — 정수 쌍 (dx, dy) 를 sqrt 로 길이 1 로 만들고 (phase unit),
 *                                      (f(p + d·u) − f(p − d·u)) / (2d) 를 돌려준다 (phase diff)
 *   evalAt(terms, x, y)               — 평평한 항 목록 [계수, x 지수, y 지수, …] 의 함숫값 (반복 곱, pow 없음)
 *
 * algorithm.ts 의 `dirSlope` · `evalAt` 과 같은 차례로 셈한다 (계수를 double 로, x 먼저 y 다음).
 * 삼각 함수가 없어 각(°)은 IR 밖에서만 셈한다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '/' | '//', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const idx = (arr: string, i: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx: i });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

const evalAtBody: IRStmt[] = [
  { kind: 'var', name: 'total', type: DOUBLE, init: n(0.0), phase: 'diff' },
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: bin('//', { kind: 'len', of: v('terms') }, n(3)),
    inclusive: false,
    phase: 'diff',
    body: [
      { kind: 'var', name: 'term', type: DOUBLE, init: idx('terms', bin('*', n(3), v('i'))), phase: 'diff' },
      {
        kind: 'for-range',
        var: 'a',
        from: n(0),
        to: idx('terms', bin('+', bin('*', n(3), v('i')), n(1))),
        inclusive: false,
        phase: 'diff',
        body: [{ kind: 'assign', target: v('term'), expr: bin('*', v('term'), v('x')), phase: 'diff' }],
      },
      {
        kind: 'for-range',
        var: 'b',
        from: n(0),
        to: idx('terms', bin('+', bin('*', n(3), v('i')), n(2))),
        inclusive: false,
        phase: 'diff',
        body: [{ kind: 'assign', target: v('term'), expr: bin('*', v('term'), v('y')), phase: 'diff' }],
      },
      { kind: 'assign', target: v('total'), expr: bin('+', v('total'), v('term')), phase: 'diff' },
    ],
  },
  { kind: 'return', expr: v('total'), phase: 'diff' },
];

const dirSlopeBody: IRStmt[] = [
  { kind: 'comment', text: 'unit direction from the integer pair' },
  {
    kind: 'var',
    name: 'sq',
    type: DOUBLE,
    init: bin('+', bin('*', v('dx'), v('dx')), bin('*', v('dy'), v('dy'))),
    phase: 'unit',
  },
  { kind: 'var', name: 'norm', type: DOUBLE, init: call('sqrt', [v('sq')]), phase: 'unit' },
  { kind: 'var', name: 'ux', type: DOUBLE, init: bin('/', v('dx'), v('norm')), phase: 'unit' },
  { kind: 'var', name: 'uy', type: DOUBLE, init: bin('/', v('dy'), v('norm')), phase: 'unit' },
  { kind: 'comment', text: 'central difference along u' },
  {
    kind: 'return',
    expr: bin(
      '/',
      bin(
        '-',
        call('evalAt', [
          v('terms'),
          bin('+', v('x'), bin('*', v('d'), v('ux'))),
          bin('+', v('y'), bin('*', v('d'), v('uy'))),
        ]),
        call('evalAt', [
          v('terms'),
          bin('-', v('x'), bin('*', v('d'), v('ux'))),
          bin('-', v('y'), bin('*', v('d'), v('uy'))),
        ]),
      ),
      bin('*', n(2), v('d')),
    ),
    phase: 'diff',
  },
];

export const gradientImperativeIR: IR = {
  id: 'gradient-imperative',
  algorithm: 'gradient',
  paradigm: 'imperative',
  functions: [
    {
      name: 'dirSlope',
      params: [
        { name: 'terms', type: INT_LIST },
        { name: 'x', type: DOUBLE },
        { name: 'y', type: DOUBLE },
        { name: 'dx', type: INT },
        { name: 'dy', type: INT },
        { name: 'd', type: DOUBLE },
      ],
      returnType: DOUBLE,
      body: dirSlopeBody,
    },
    {
      name: 'evalAt',
      params: [
        { name: 'terms', type: INT_LIST },
        { name: 'x', type: DOUBLE },
        { name: 'y', type: DOUBLE },
      ],
      returnType: DOUBLE,
      body: evalAtBody,
    },
  ],
};

export const gradientIRs: IR[] = [gradientImperativeIR];
