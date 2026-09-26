/**
 * batchnorm 의 IR — `bnValue(xs, order, b, track) → double`.
 *
 * algorithm.ts 의 `bnParts` 와 같은 길로 셈한다: 섞은 차례에서 지켜보는 번호의 자리를 찾고, 그 자리가 든
 * 묶음(자리 // b 번째)의 평균 · 모집단 분산으로 xs[track] 을 맞춘다. ε 는 식 안의 리터럴 0.00001 (algorithm 의
 * `eps` 와 같은 값). 지켜보는 번호가 차례에 없으면 −1000.0 표지를 돌려준다 (algorithm 은 던진다 —
 * 맞춘 값은 늘 |x| < 4 라 겹치지 않는다).
 *
 * phase: bn-gather (자리 찾기 · 묶음 평균) · bn-scale (모집단 분산 · 맞춤)
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '/' | '//' | '<' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: IRExpr, idx: IRExpr): IRExpr => ({ kind: 'index', arr, idx });

/** xs[order[start + j]] */
const peerValue: IRExpr = at(v('xs'), at(v('order'), bin('+', v('start'), v('j'))));

const body: IRStmt[] = [
  { kind: 'comment', text: 'find where the tracked value sits in this shuffle' },
  { kind: 'var', name: 'pos', type: INT, init: lit(-1), phase: 'bn-gather' },
  {
    kind: 'for-range',
    var: 'i',
    from: lit(0),
    to: { kind: 'len', of: v('order') },
    inclusive: false,
    phase: 'bn-gather',
    body: [
      {
        kind: 'if',
        cond: bin('==', at(v('order'), v('i')), v('track')),
        then: [{ kind: 'assign', target: v('pos'), expr: v('i'), phase: 'bn-gather' }],
        phase: 'bn-gather',
      },
    ],
  },
  {
    kind: 'if',
    cond: bin('<', v('pos'), lit(0)),
    then: [{ kind: 'return', expr: lit(-1000.0), phase: 'bn-gather' }],
    phase: 'bn-gather',
  },
  { kind: 'comment', text: 'the batch holding it, and that batch mean' },
  { kind: 'var', name: 'start', type: INT, init: bin('*', bin('//', v('pos'), v('b')), v('b')), phase: 'bn-gather' },
  { kind: 'var', name: 'total', type: DOUBLE, init: lit(0.0), phase: 'bn-gather' },
  {
    kind: 'for-range',
    var: 'j',
    from: lit(0),
    to: v('b'),
    inclusive: false,
    phase: 'bn-gather',
    body: [{ kind: 'assign', target: v('total'), expr: bin('+', v('total'), peerValue), phase: 'bn-gather' }],
  },
  { kind: 'var', name: 'mu', type: DOUBLE, init: bin('/', v('total'), v('b')), phase: 'bn-gather' },
  { kind: 'comment', text: 'population variance of the batch, then rescale' },
  { kind: 'var', name: 'sq', type: DOUBLE, init: lit(0.0), phase: 'bn-scale' },
  {
    kind: 'for-range',
    var: 'j',
    from: lit(0),
    to: v('b'),
    inclusive: false,
    phase: 'bn-scale',
    body: [
      { kind: 'var', name: 'd', type: DOUBLE, init: bin('-', peerValue, v('mu')), phase: 'bn-scale' },
      { kind: 'assign', target: v('sq'), expr: bin('+', v('sq'), bin('*', v('d'), v('d'))), phase: 'bn-scale' },
    ],
  },
  { kind: 'var', name: 'variance', type: DOUBLE, init: bin('/', v('sq'), v('b')), phase: 'bn-scale' },
  {
    kind: 'return',
    expr: bin(
      '/',
      bin('-', at(v('xs'), v('track')), v('mu')),
      { kind: 'call', fn: 'sqrt', args: [bin('+', v('variance'), lit(0.00001))] },
    ),
    phase: 'bn-scale',
  },
];

export const batchnormImperativeIR: IR = {
  id: 'batchnorm-imperative',
  algorithm: 'batchnorm',
  paradigm: 'imperative',
  functions: [
    {
      name: 'bnValue',
      params: [
        { name: 'xs', type: { kind: 'list', of: DOUBLE } },
        { name: 'order', type: { kind: 'list', of: INT } },
        { name: 'b', type: INT },
        { name: 'track', type: INT },
      ],
      returnType: DOUBLE,
      body,
    },
  ],
};

export const batchnormIRs: IR[] = [batchnormImperativeIR];
