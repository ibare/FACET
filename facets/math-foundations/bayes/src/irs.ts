/**
 * bayes IR — 양성 k 번 뒤의 병일 몫(‰) 과 절반을 넘는 첫 양성 수.
 *
 * 알고리즘(`ppvPermille` · `firstOverHalf`)과 같은 정수 길을 걷는다. 실수를 거치지 않는다.
 * 표지: 기저율이 1..999 밖이거나 sens 가 fpr 로 나누어떨어지지 않으면 −1 (TS 쪽은 던진다).
 * 정수 중간값 최대 num × 1000 + total // 2 = 364 682 500 (< 2³¹) — 양성 3 까지.
 *
 * phase: multiply · normalize · cross (algorithm.ts 와 정확히 같다)
 */

import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const INT = { kind: 'int' } as const;

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '%' | '<=' | '>=' | '>' | '!=' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});

/** 두 함수가 함께 쓰는 표지 둘과 처음 승산. */
const guards: IRStmt[] = [
  {
    kind: 'if',
    cond: bin('||', bin('<=', v('p'), n(0)), bin('>=', v('p'), n(1000))),
    then: [
      { kind: 'comment', text: 'marker: base rate outside 1..999 permille' },
      { kind: 'return', expr: n(-1) },
    ],
  },
  {
    kind: 'if',
    cond: bin('!=', bin('%', v('sens'), v('fpr')), n(0)),
    then: [
      { kind: 'comment', text: 'marker: likelihood ratio is not a whole number' },
      { kind: 'return', expr: n(-1) },
    ],
  },
  { kind: 'var', name: 'ratio', type: INT, init: bin('//', v('sens'), v('fpr')) },
  { kind: 'comment', text: 'odds sick : not sick among 1000 people' },
  { kind: 'var', name: 'num', type: INT, init: v('p') },
  { kind: 'var', name: 'den', type: INT, init: bin('-', n(1000), v('p')) },
];

export const bayesImperativeIR: IR = {
  id: 'bayes-imperative',
  algorithm: 'bayes',
  paradigm: 'imperative',
  functions: [
    {
      name: 'ppvPermille',
      params: [
        { name: 'p', type: INT },
        { name: 'k', type: INT },
        { name: 'sens', type: INT },
        { name: 'fpr', type: INT },
      ],
      returnType: INT,
      body: [
        ...guards,
        { kind: 'comment', text: 'each positive multiplies only the sick side by the likelihood ratio' },
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: v('k'),
          inclusive: false,
          body: [{ kind: 'assign', target: v('num'), expr: bin('*', v('num'), v('ratio')), phase: 'multiply' }],
        },
        { kind: 'comment', text: 'divide so the two shares add up to 1, rounded to permille' },
        { kind: 'var', name: 'total', type: INT, init: bin('+', v('num'), v('den')), phase: 'normalize' },
        {
          kind: 'return',
          expr: bin('//', bin('+', bin('*', v('num'), n(1000)), bin('//', v('total'), n(2))), v('total')),
          phase: 'normalize',
        },
      ],
    },
    {
      name: 'firstOverHalf',
      params: [
        { name: 'p', type: INT },
        { name: 'sens', type: INT },
        { name: 'fpr', type: INT },
        { name: 'maxK', type: INT },
      ],
      returnType: INT,
      body: [
        ...guards,
        { kind: 'comment', text: 'first number of positives where sick outweighs not sick (strictly)' },
        {
          kind: 'for-range',
          var: 'k',
          from: n(0),
          to: v('maxK'),
          inclusive: true,
          body: [
            {
              kind: 'if',
              cond: bin('>', v('num'), v('den')),
              then: [{ kind: 'return', expr: v('k'), phase: 'cross' }],
              phase: 'cross',
            },
            { kind: 'assign', target: v('num'), expr: bin('*', v('num'), v('ratio')) },
          ],
        },
        { kind: 'return', expr: n(-1), phase: 'cross' },
      ],
    },
  ],
};

export const bayesIRs: IR[] = [bayesImperativeIR];
