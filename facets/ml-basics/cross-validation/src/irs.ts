/**
 * cross-validation 의 IR — 코드 패널이 여섯 언어로 옮긴다.
 *
 * 함수 둘:
 *   scorePercent(xs, ys, order, k, used) → int   섞은 차례 하나 · 나누기 하나의 반올림 정수 % (동률 · 모르는 부류면 −1)
 *   scoreSpread(pcts, count) → int               pcts 앞 count 개의 가장 높음 − 가장 낮음
 *
 * algorithm.ts 의 foldScore · scoreSpread 와 같은 셈을 같은 차례로 한다 — 부류 합은 자리 p 차례로,
 * 가름점은 (합0 / 수0 + 합1 / 수1) / 2.0, 백분율은 (ok · 100 + n // 2) // n.
 * `//` 는 음이 아닌 정수에만 쓴다 (p · size · ok · tested).
 *
 * phase 어휘 (algorithm 과 같다): split · fit · judge · spread
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const INTS: IRType = { kind: 'list', of: INT };
const DOUBLES: IRType = { kind: 'list', of: DOUBLE };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '-' | '*' | '/' | '//' | '==' | '!=' | '>' , l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op: o,
  l,
  r,
});

/** 자리 p 가 폴드 f 에 드는가 (`same`) · 들지 않는가 */
const seatTest = (same: boolean): IRExpr => op(same ? '==' : '!=', op('//', v('p'), v('size')), v('f'));

const scorePercentBody: IRStmt[] = [
  { kind: 'comment', text: 'seat p of the shuffled order belongs to fold p // size' },
  { kind: 'var', name: 'n', type: INT, init: { kind: 'len', of: v('xs') } },
  { kind: 'var', name: 'size', type: INT, init: op('//', v('n'), v('k')) },
  { kind: 'var', name: 'ok', type: INT, init: n(0) },
  {
    kind: 'for-range',
    var: 'f',
    from: n(0),
    to: v('used'),
    inclusive: false,
    body: [
      { kind: 'comment', text: 'test fold = f, learn from the rest' },
      { kind: 'var', name: 's0', type: DOUBLE, init: n(0) },
      { kind: 'var', name: 's1', type: DOUBLE, init: n(0) },
      { kind: 'var', name: 'n0', type: INT, init: n(0) },
      { kind: 'var', name: 'n1', type: INT, init: n(0) },
      {
        kind: 'for-range',
        var: 'p',
        from: n(0),
        to: v('n'),
        inclusive: false,
        body: [
          {
            kind: 'if',
            cond: seatTest(false),
            phase: 'split',
            then: [
              { kind: 'var', name: 'i', type: INT, init: at('order', v('p')) },
              {
                kind: 'if',
                cond: op('==', at('ys', v('i')), n(0)),
                phase: 'fit',
                then: [
                  { kind: 'assign', target: v('s0'), expr: op('+', v('s0'), at('xs', v('i'))), phase: 'fit' },
                  { kind: 'assign', target: v('n0'), expr: op('+', v('n0'), n(1)), phase: 'fit' },
                ],
                else: [
                  {
                    kind: 'if',
                    cond: op('==', at('ys', v('i')), n(1)),
                    phase: 'fit',
                    then: [
                      { kind: 'assign', target: v('s1'), expr: op('+', v('s1'), at('xs', v('i'))), phase: 'fit' },
                      { kind: 'assign', target: v('n1'), expr: op('+', v('n1'), n(1)), phase: 'fit' },
                    ],
                    else: [{ kind: 'return', expr: n(-1) }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        kind: 'if',
        cond: { kind: 'binop', op: '||', l: op('==', v('n0'), n(0)), r: op('==', v('n1'), n(0)) },
        then: [{ kind: 'return', expr: n(-1) }],
      },
      {
        kind: 'var',
        name: 'cut',
        type: DOUBLE,
        init: op('/', op('+', op('/', v('s0'), v('n0')), op('/', v('s1'), v('n1'))), n(2.0)),
        phase: 'fit',
      },
      {
        kind: 'for-range',
        var: 'p',
        from: n(0),
        to: v('n'),
        inclusive: false,
        body: [
          {
            kind: 'if',
            cond: seatTest(true),
            phase: 'split',
            then: [
              { kind: 'var', name: 'i', type: INT, init: at('order', v('p')) },
              { kind: 'comment', text: 'a tie with the cut is not decided' },
              { kind: 'if', cond: op('==', at('xs', v('i')), v('cut')), phase: 'judge', then: [{ kind: 'return', expr: n(-1) }] },
              { kind: 'var', name: 'guess', type: INT, init: n(0), phase: 'judge' },
              {
                kind: 'if',
                cond: op('>', at('xs', v('i')), v('cut')),
                phase: 'judge',
                then: [{ kind: 'assign', target: v('guess'), expr: n(1), phase: 'judge' }],
              },
              {
                kind: 'if',
                cond: op('==', v('guess'), at('ys', v('i'))),
                phase: 'judge',
                then: [{ kind: 'assign', target: v('ok'), expr: op('+', v('ok'), n(1)), phase: 'judge' }],
              },
            ],
          },
        ],
      },
    ],
  },
  { kind: 'comment', text: 'rounded whole percent of the test items called right' },
  { kind: 'var', name: 'tested', type: INT, init: op('*', v('used'), v('size')) },
  {
    kind: 'return',
    expr: op('//', op('+', op('*', v('ok'), n(100)), op('//', v('tested'), n(2))), v('tested')),
    phase: 'judge',
  },
];

const scoreSpreadBody: IRStmt[] = [
  { kind: 'var', name: 'lo', type: INT, init: at('pcts', n(0)), phase: 'spread' },
  { kind: 'var', name: 'hi', type: INT, init: at('pcts', n(0)), phase: 'spread' },
  {
    kind: 'for-range',
    var: 'j',
    from: n(1),
    to: v('count'),
    inclusive: false,
    phase: 'spread',
    body: [
      { kind: 'assign', target: v('lo'), expr: { kind: 'call', fn: 'min', args: [v('lo'), at('pcts', v('j'))] }, phase: 'spread' },
      { kind: 'assign', target: v('hi'), expr: { kind: 'call', fn: 'max', args: [v('hi'), at('pcts', v('j'))] }, phase: 'spread' },
    ],
  },
  { kind: 'return', expr: op('-', v('hi'), v('lo')), phase: 'spread' },
];

export const crossValidationImperativeIR: IR = {
  id: 'cross-validation-imperative',
  algorithm: 'crossValidation',
  paradigm: 'imperative',
  functions: [
    {
      name: 'scorePercent',
      params: [
        { name: 'xs', type: DOUBLES },
        { name: 'ys', type: INTS },
        { name: 'order', type: INTS },
        { name: 'k', type: INT },
        { name: 'used', type: INT },
      ],
      returnType: INT,
      body: scorePercentBody,
    },
    {
      name: 'scoreSpread',
      params: [
        { name: 'pcts', type: INTS },
        { name: 'count', type: INT },
      ],
      returnType: INT,
      body: scoreSpreadBody,
    },
  ],
};

export const crossValidationIRs: IR[] = [crossValidationImperativeIR];
