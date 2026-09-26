/**
 * 펼친 RNN 과 시간 역전파의 IR — 코드 패널이 여섯 언어로 옮긴다.
 *
 * 진입 함수 `farShare(xs, wx, wh, b, hs, trace, contrib)` 가 `forward` · `backward` 를 부르고
 * 먼 절반의 몫을 돌려준다. 버퍼 hs · trace · contrib 는 길이 T + 1 로 **부르는 쪽이 만든다**
 * (IR 은 배열을 만들 수 없다). hs[0] 에는 부르는 쪽이 h0 를 넣어 둔다.
 *
 * algorithm.ts 의 unrolledForward · unrolledBackward · farShareOf 와 같은 식 · 같은 차례다.
 * phase 어휘: forward · backward · far-share (algorithm 과 같다).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const DOUBLE: IRType = { kind: 'double' };
const INT: IRType = { kind: 'int' };
const VOID: IRType = { kind: 'void' };
const LIST: IRType = { kind: 'list', of: DOUBLE };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '-' | '*' | '/' | '<' | '<=' | '==', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op: o,
  l,
  r,
});
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
/** 1 − h·h */
const oneMinusSq = (h: string): IRExpr => op('-', n(1), op('*', v(h), v(h)));

const forwardBody: IRStmt[] = [
  { kind: 'var', name: 'steps', type: INT, init: { kind: 'len', of: v('xs') } },
  {
    kind: 'for-range',
    var: 'step',
    from: n(1),
    to: v('steps'),
    inclusive: true,
    phase: 'forward',
    body: [
      {
        kind: 'var',
        name: 'a',
        type: DOUBLE,
        init: op(
          '+',
          op(
            '+',
            op('*', v('wx'), at('xs', op('-', v('step'), n(1)))),
            op('*', v('wh'), at('hs', op('-', v('step'), n(1)))),
          ),
          v('b'),
        ),
        phase: 'forward',
      },
      { kind: 'var', name: 'h', type: DOUBLE, init: call('tanhExp', [v('a')]), phase: 'forward' },
      { kind: 'assign', target: at('hs', v('step')), expr: v('h'), phase: 'forward' },
      { kind: 'comment', text: 'trace of the first input: s_t = s_(t-1) * wh * (1 - h_t^2)' },
      {
        kind: 'if',
        cond: op('==', v('step'), n(1)),
        phase: 'forward',
        then: [
          {
            kind: 'assign',
            target: at('trace', v('step')),
            expr: op('*', v('wx'), oneMinusSq('h')),
            phase: 'forward',
          },
        ],
        else: [
          {
            kind: 'assign',
            target: at('trace', v('step')),
            expr: op('*', op('*', at('trace', op('-', v('step'), n(1))), v('wh')), oneMinusSq('h')),
            phase: 'forward',
          },
        ],
      },
    ],
  },
];

const backwardBody: IRStmt[] = [
  { kind: 'var', name: 'steps', type: INT, init: { kind: 'len', of: v('xs') } },
  { kind: 'comment', text: 'gradient of the last output itself: dh_T/dh_T = 1 (no loss)' },
  { kind: 'var', name: 'g', type: DOUBLE, init: n(1) },
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: v('steps'),
    inclusive: false,
    phase: 'backward',
    body: [
      { kind: 'var', name: 'k', type: INT, init: op('-', v('steps'), v('i')), phase: 'backward' },
      { kind: 'var', name: 'h', type: DOUBLE, init: at('hs', v('k')), phase: 'backward' },
      { kind: 'var', name: 'd', type: DOUBLE, init: op('*', v('g'), oneMinusSq('h')), phase: 'backward' },
      {
        kind: 'assign',
        target: at('contrib', v('k')),
        expr: op('*', v('d'), at('xs', op('-', v('k'), n(1)))),
        phase: 'backward',
      },
      { kind: 'comment', text: 'the same wh carries the gradient one cell further back' },
      { kind: 'assign', target: v('g'), expr: op('*', v('d'), v('wh')), phase: 'backward' },
    ],
  },
];

const absAt = (k: string): IRExpr => call('abs', [at('contrib', v(k))]);

const farShareBody: IRStmt[] = [
  { kind: 'comment', text: 'hs[0] holds h0, set by the caller' },
  {
    kind: 'expr-stmt',
    expr: call('forward', [v('xs'), v('wx'), v('wh'), v('b'), v('hs'), v('trace')]),
  },
  { kind: 'expr-stmt', expr: call('backward', [v('xs'), v('hs'), v('wh'), v('contrib')]) },
  { kind: 'var', name: 'steps', type: INT, init: { kind: 'len', of: v('xs') }, phase: 'far-share' },
  { kind: 'var', name: 'far', type: DOUBLE, init: n(0), phase: 'far-share' },
  { kind: 'var', name: 'total', type: DOUBLE, init: n(0), phase: 'far-share' },
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: v('steps'),
    inclusive: false,
    phase: 'far-share',
    body: [
      { kind: 'var', name: 'k', type: INT, init: op('-', v('steps'), v('i')), phase: 'far-share' },
      { kind: 'assign', target: v('total'), expr: op('+', v('total'), absAt('k')), phase: 'far-share' },
      { kind: 'comment', text: 'far half: cells k with 2k <= T' },
      {
        kind: 'if',
        cond: op('<=', op('*', v('k'), n(2)), v('steps')),
        phase: 'far-share',
        then: [
          { kind: 'assign', target: v('far'), expr: op('+', v('far'), absAt('k')), phase: 'far-share' },
        ],
      },
    ],
  },
  { kind: 'return', expr: op('/', v('far'), v('total')), phase: 'far-share' },
];

const tanhBody: IRStmt[] = [
  {
    kind: 'var',
    name: 'e',
    type: DOUBLE,
    init: call('exp', [op('*', n(-2), call('abs', [v('a')]))]),
  },
  { kind: 'var', name: 'r', type: DOUBLE, init: op('/', op('-', n(1), v('e')), op('+', n(1), v('e'))) },
  { kind: 'if', cond: op('<', v('a'), n(0)), then: [{ kind: 'return', expr: { kind: 'unop', op: '-', x: v('r') } }] },
  { kind: 'return', expr: v('r') },
];

export const unrolledRnnImperativeIR: IR = {
  id: 'unrolled-rnn-imperative',
  algorithm: 'unrolledRnn',
  paradigm: 'imperative',
  functions: [
    {
      name: 'farShare',
      params: [
        { name: 'xs', type: LIST },
        { name: 'wx', type: DOUBLE },
        { name: 'wh', type: DOUBLE },
        { name: 'b', type: DOUBLE },
        { name: 'hs', type: LIST },
        { name: 'trace', type: LIST },
        { name: 'contrib', type: LIST },
      ],
      returnType: DOUBLE,
      body: farShareBody,
    },
    {
      name: 'forward',
      params: [
        { name: 'xs', type: LIST },
        { name: 'wx', type: DOUBLE },
        { name: 'wh', type: DOUBLE },
        { name: 'b', type: DOUBLE },
        { name: 'hs', type: LIST },
        { name: 'trace', type: LIST },
      ],
      returnType: VOID,
      body: forwardBody,
    },
    {
      name: 'backward',
      params: [
        { name: 'xs', type: LIST },
        { name: 'hs', type: LIST },
        { name: 'wh', type: DOUBLE },
        { name: 'contrib', type: LIST },
      ],
      returnType: VOID,
      body: backwardBody,
    },
    {
      name: 'tanhExp',
      params: [{ name: 'a', type: DOUBLE }],
      returnType: DOUBLE,
      body: tanhBody,
    },
  ],
};

export const unrolledRnnIRs: IR[] = [unrolledRnnImperativeIR];
