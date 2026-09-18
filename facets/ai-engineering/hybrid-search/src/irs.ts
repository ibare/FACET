/**
 * hybrid-search 코드 패널 IR — **섞기만** 편다.
 *
 * BM25 는 algorithm 이 셈하고 코드 패널은 두 등수를 섞는 자리만 편다. BM25 는 문자열을
 * 맞추는 셈이다 — 토큰을 가르고 같은 토큰을 세야 하는데, IR 에는 문자열 비교가 없다
 * (자바의 `==` 는 문자열의 내용이 아니라 참조를 견준다). 그래서 부르는 쪽이 두 등수와
 * 정답 표시를 **정수 배열**로 건네고, 여기서는 그것을 몫대로 섞어 **전체 차례를** 고른다 —
 * 화면이 여덟 문서를 모두 한 줄에 세우므로 코드도 끝까지 고른다. 고른 자리는 `taken` 에
 * 1 부터 적고(0 은 아직 안 고름), 정답은 앞 `top` 자리에서만 센다.
 *
 * 견주기는 통분한 정수로 한다 — num = w·(60+rv) + (4−w)·(60+rl), den = (60+rl)(60+rv).
 * 실수를 쓰지 않는다. 정수 중간값의 상한은 272 × 4,624 = 1,257,728 (int32 안).
 * 동률이면 앞 번호가 남는다 (엄격히 클 때만 바꾼다).
 *
 * phase 어휘 (algorithm.ts 와 같다): 'weigh' | 'seat' | 'count' | 'done'
 */

import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const add = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '+', l, r });
const sub = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '-', l, r });
const mul = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '*', l, r });
const eq = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '==', l, r });
const INT = { kind: 'int' } as const;
const INTS = { kind: 'list', of: { kind: 'int' } } as const;

/** 60 + 등수 */
const shifted = (arr: string, idx: IRExpr): IRExpr => add(n(60), at(arr, idx));
/** w·(60+rv) + (4−w)·(60+rl) */
const numer = (idx: IRExpr): IRExpr =>
  add(mul(v('weight'), shifted('rankVec', idx)), mul(sub(n(4), v('weight')), shifted('rankLex', idx)));
/** (60+rl)·(60+rv) */
const denom = (idx: IRExpr): IRExpr => mul(shifted('rankLex', idx), shifted('rankVec', idx));

const scanBody: IRStmt[] = [
  {
    kind: 'if',
    cond: eq(at('taken', v('i')), n(0)),
    then: [
      {
        kind: 'if',
        cond: eq(v('best'), { kind: 'unop', op: '-', x: n(1) }),
        then: [{ kind: 'assign', target: v('best'), expr: v('i') }],
        else: [
          { kind: 'comment', text: 'score = w/(60+rl) + (4-w)/(60+rv), compared as exact fractions' },
          { kind: 'var', name: 'num', type: INT, init: numer(v('i')), phase: 'weigh' },
          { kind: 'var', name: 'den', type: INT, init: denom(v('i')), phase: 'weigh' },
          { kind: 'var', name: 'bestNum', type: INT, init: numer(v('best')), phase: 'weigh' },
          { kind: 'var', name: 'bestDen', type: INT, init: denom(v('best')), phase: 'weigh' },
          {
            kind: 'if',
            cond: { kind: 'binop', op: '>', l: mul(v('num'), v('bestDen')), r: mul(v('bestNum'), v('den')) },
            then: [{ kind: 'assign', target: v('best'), expr: v('i'), phase: 'weigh' }],
            phase: 'weigh',
          },
        ],
      },
    ],
  },
];

export const hybridSearchImperativeIR: IR = {
  id: 'hybrid-search-imperative',
  algorithm: 'hybridSearch',
  paradigm: 'imperative',
  functions: [
    {
      name: 'fuseTop',
      params: [
        { name: 'rankLex', type: INTS },
        { name: 'rankVec', type: INTS },
        { name: 'relevant', type: INTS },
        { name: 'weight', type: INT },
        { name: 'top', type: INT },
        { name: 'taken', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'BM25 is scored outside; only the two ranks are fused here' },
        { kind: 'var', name: 'hits', type: INT, init: n(0) },
        {
          kind: 'for-range',
          var: 'k',
          from: n(0),
          to: { kind: 'len', of: v('rankLex') },
          inclusive: false,
          body: [
            { kind: 'var', name: 'best', type: INT, init: { kind: 'unop', op: '-', x: n(1) } },
            {
              kind: 'for-range',
              var: 'i',
              from: n(0),
              to: { kind: 'len', of: v('rankLex') },
              inclusive: false,
              body: scanBody,
            },
            { kind: 'assign', target: at('taken', v('best')), expr: add(v('k'), n(1)), phase: 'seat' },
            {
              kind: 'if',
              cond: { kind: 'binop', op: '<', l: v('k'), r: v('top') },
              then: [
                {
                  kind: 'if',
                  cond: eq(at('relevant', v('best')), n(1)),
                  then: [{ kind: 'assign', target: v('hits'), expr: add(v('hits'), n(1)), phase: 'count' }],
                  phase: 'count',
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: v('hits'), phase: 'done' },
      ],
    },
  ],
};

export const hybridSearchIRs: IR[] = [hybridSearchImperativeIR];
