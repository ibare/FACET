/**
 * diffusion IR — 알고리즘의 `denoiseStep` · `nearest` 와 같은 식, 같은 차례.
 *
 * - 첫 함수 `denoiseStep` 이 진입점. x0Hat · xPrev 는 부르는 쪽이 준 버퍼에 쓰고 w_P 를 돌려준다.
 * - 생성기(32 비트를 넘는 곱 · cos)는 IR 에 두지 않는다 — 뽑힌 z 를 `noise` 로 받는다.
 * - phase 어휘: `reverse` (denoiseStep 의 모든 문) · `settle` (nearest 의 모든 문). algorithm.ts 와 같다.
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const DLIST: IRType = { kind: 'list', of: DOUBLE };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const at = (arr: string, idx: string): IRExpr => ({ kind: 'index', arr: v(arr), idx: v(idx) });
const bin = (op: '+' | '-' | '*' | '/' | '>', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

function withPhase(phase: string, stmts: IRStmt[]): IRStmt[] {
  return stmts.map((s): IRStmt => {
    if (s.kind === 'comment') return s;
    if (s.kind === 'for-range') return { ...s, phase, body: withPhase(phase, s.body) };
    if (s.kind === 'if') {
      return s.else === undefined
        ? { ...s, phase, then: withPhase(phase, s.then) }
        : { ...s, phase, then: withPhase(phase, s.then), else: withPhase(phase, s.else) };
    }
    return { ...s, phase };
  });
}

const denoiseBody: IRStmt[] = [
  { kind: 'comment', text: 'one reverse pass t -> t-1 (DDPM ancestral sampling, ideal predictor knows P and Q)' },
  { kind: 'var', name: 'n', type: INT, init: { kind: 'len', of: v('xt') } },
  { kind: 'var', name: 'sa', type: DOUBLE, init: call('sqrt', v('alphaBar')) },
  { kind: 'var', name: 's1a', type: DOUBLE, init: call('sqrt', bin('-', lit(1), v('alphaBar'))) },
  { kind: 'var', name: 'lp', type: DOUBLE, init: lit(0.0) },
  { kind: 'var', name: 'lq', type: DOUBLE, init: lit(0.0) },
  {
    kind: 'for-range',
    var: 'i',
    from: lit(0),
    to: v('n'),
    inclusive: false,
    body: [
      { kind: 'var', name: 'dp', type: DOUBLE, init: bin('-', at('xt', 'i'), bin('*', v('sa'), at('dataP', 'i'))) },
      { kind: 'var', name: 'dq', type: DOUBLE, init: bin('-', at('xt', 'i'), bin('*', v('sa'), at('dataQ', 'i'))) },
      { kind: 'assign', target: v('lp'), expr: bin('+', v('lp'), bin('*', v('dp'), v('dp'))) },
      { kind: 'assign', target: v('lq'), expr: bin('+', v('lq'), bin('*', v('dq'), v('dq'))) },
    ],
  },
  { kind: 'comment', text: 'log weight of each datum given the noisy point' },
  {
    kind: 'assign',
    target: v('lp'),
    expr: bin('/', { kind: 'unop', op: '-', x: v('lp') }, bin('*', lit(2), bin('-', lit(1), v('alphaBar')))),
  },
  {
    kind: 'assign',
    target: v('lq'),
    expr: bin('/', { kind: 'unop', op: '-', x: v('lq') }, bin('*', lit(2), bin('-', lit(1), v('alphaBar')))),
  },
  { kind: 'var', name: 'm', type: DOUBLE, init: call('max', v('lp'), v('lq')) },
  { kind: 'var', name: 'eP', type: DOUBLE, init: call('exp', bin('-', v('lp'), v('m'))) },
  { kind: 'var', name: 'eQ', type: DOUBLE, init: call('exp', bin('-', v('lq'), v('m'))) },
  { kind: 'var', name: 'wP', type: DOUBLE, init: bin('/', v('eP'), bin('+', v('eP'), v('eQ'))) },
  { kind: 'var', name: 'wQ', type: DOUBLE, init: bin('/', v('eQ'), bin('+', v('eP'), v('eQ'))) },
  { kind: 'comment', text: 'predicted clean point: weighted mix of P and Q' },
  {
    kind: 'for-range',
    var: 'i',
    from: lit(0),
    to: v('n'),
    inclusive: false,
    body: [
      {
        kind: 'assign',
        target: at('x0Hat', 'i'),
        expr: bin('+', bin('*', v('wP'), at('dataP', 'i')), bin('*', v('wQ'), at('dataQ', 'i'))),
      },
    ],
  },
  { kind: 'comment', text: 'step down: remove predicted noise, add fresh noise unless t is 1' },
  {
    kind: 'for-range',
    var: 'i',
    from: lit(0),
    to: v('n'),
    inclusive: false,
    body: [
      {
        kind: 'var',
        name: 'epsHat',
        type: DOUBLE,
        init: bin('/', bin('-', at('xt', 'i'), bin('*', v('sa'), at('x0Hat', 'i'))), v('s1a')),
      },
      {
        kind: 'var',
        name: 'mean',
        type: DOUBLE,
        init: bin(
          '/',
          bin('-', at('xt', 'i'), bin('*', bin('/', v('beta'), v('s1a')), v('epsHat'))),
          call('sqrt', bin('-', lit(1), v('beta'))),
        ),
      },
      {
        kind: 'if',
        cond: bin('>', v('tIndex'), lit(1)),
        then: [
          {
            kind: 'assign',
            target: at('xPrev', 'i'),
            expr: bin('+', v('mean'), bin('*', call('sqrt', v('beta')), at('noise', 'i'))),
          },
        ],
        else: [{ kind: 'assign', target: at('xPrev', 'i'), expr: v('mean') }],
      },
    ],
  },
  { kind: 'return', expr: v('wP') },
];

const nearestBody: IRStmt[] = [
  { kind: 'comment', text: 'distance from the final point to the closer datum' },
  { kind: 'var', name: 'dP', type: DOUBLE, init: lit(0.0) },
  { kind: 'var', name: 'dQ', type: DOUBLE, init: lit(0.0) },
  {
    kind: 'for-range',
    var: 'i',
    from: lit(0),
    to: { kind: 'len', of: v('x') },
    inclusive: false,
    body: [
      {
        kind: 'assign',
        target: v('dP'),
        expr: bin('+', v('dP'), bin('*', bin('-', at('x', 'i'), at('dataP', 'i')), bin('-', at('x', 'i'), at('dataP', 'i')))),
      },
      {
        kind: 'assign',
        target: v('dQ'),
        expr: bin('+', v('dQ'), bin('*', bin('-', at('x', 'i'), at('dataQ', 'i')), bin('-', at('x', 'i'), at('dataQ', 'i')))),
      },
    ],
  },
  { kind: 'return', expr: call('sqrt', call('min', v('dP'), v('dQ'))) },
];

export const diffusionImperativeIR: IR = {
  id: 'diffusion-imperative',
  algorithm: 'diffusion',
  paradigm: 'imperative',
  functions: [
    {
      name: 'denoiseStep',
      params: [
        { name: 'xt', type: DLIST },
        { name: 'dataP', type: DLIST },
        { name: 'dataQ', type: DLIST },
        { name: 'alphaBar', type: DOUBLE },
        { name: 'beta', type: DOUBLE },
        { name: 'noise', type: DLIST },
        { name: 'tIndex', type: INT },
        { name: 'x0Hat', type: DLIST },
        { name: 'xPrev', type: DLIST },
      ],
      returnType: DOUBLE,
      body: withPhase('reverse', denoiseBody),
    },
    {
      name: 'nearest',
      params: [
        { name: 'x', type: DLIST },
        { name: 'dataP', type: DLIST },
        { name: 'dataQ', type: DLIST },
      ],
      returnType: DOUBLE,
      body: withPhase('settle', nearestBody),
    },
  ],
};

export const diffusionIRs: IR[] = [diffusionImperativeIR];
