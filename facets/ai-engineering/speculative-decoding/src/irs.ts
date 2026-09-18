/**
 * 사색적 디코딩 IR — 코드 패널에 여섯 언어로 뜬다.
 *
 * 낱말 비교는 부르는 쪽이 **맞음 배열**(자리마다 1/0)로 바꿔 건넨다 — IR 에 문자열 비교가 없다.
 * IR 함수는 배열을 만들 수 없어 결과 버퍼 `tally`(길이 2)를 부르는 쪽이 만든다.
 *   tally[0] = 찍은 초안, tally[1] = 버린 초안. 돌려주는 값 = 큰 모형 검사 수.
 *
 * 안쪽 루프의 "받은 수 < k 이고 그 자리가 맞으면" 은 `if` 중첩 + 깃발이다. `&&` 로 이으면
 * 인터프리터가 짧은 회로를 하지 않아 `match[pos + k]` 를 넘겨 읽는다.
 *
 * 정수 중간값의 최대는 찍은 초안 30 (γ = 8) · 비용 80 (γ = 0) 이다.
 *
 * phase: 'start' | 'draft' | 'verify' | 'cost' (algorithm.ts 와 같다)
 */

import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const BOOL = { kind: 'bool' } as const;
const INT_LIST = { kind: 'list', of: INT } as const;

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const b = (op: '+' | '-' | '*' | '<' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const set = (target: IRExpr, expr: IRExpr, phase: string): IRStmt => ({ kind: 'assign', target, expr, phase });

const speculateBody: IRStmt[] = [
  { kind: 'comment', text: 'match[i] = 1 if the small model guessed word i right' },
  { kind: 'var', name: 'total', type: INT, init: { kind: 'len', of: v('match') }, phase: 'start' },
  { kind: 'var', name: 'pos', type: INT, init: n(0), phase: 'start' },
  { kind: 'var', name: 'checks', type: INT, init: n(0), phase: 'start' },
  set(at('tally', n(0)), n(0), 'start'),
  set(at('tally', n(1)), n(0), 'start'),
  {
    kind: 'while',
    cond: b('<', v('pos'), v('total')),
    body: [
      { kind: 'comment', text: 'the big model always writes the last word itself' },
      {
        kind: 'var',
        name: 'k',
        type: INT,
        init: { kind: 'call', fn: 'min', args: [v('draftLen'), b('-', b('-', v('total'), v('pos')), n(1))] },
        phase: 'draft',
      },
      set(at('tally', n(0)), b('+', at('tally', n(0)), v('k')), 'draft'),
      { kind: 'comment', text: 'one big-model pass checks all k drafted words' },
      { kind: 'var', name: 'accepted', type: INT, init: n(0), phase: 'verify' },
      { kind: 'var', name: 'going', type: BOOL, init: { kind: 'lit', value: true }, phase: 'verify' },
      {
        kind: 'while',
        cond: v('going'),
        phase: 'verify',
        body: [
          set(v('going'), { kind: 'lit', value: false }, 'verify'),
          {
            kind: 'if',
            cond: b('<', v('accepted'), v('k')),
            phase: 'verify',
            then: [
              {
                kind: 'if',
                cond: b('==', at('match', b('+', v('pos'), v('accepted'))), n(1)),
                phase: 'verify',
                then: [
                  set(v('accepted'), b('+', v('accepted'), n(1)), 'verify'),
                  set(v('going'), { kind: 'lit', value: true }, 'verify'),
                ],
              },
            ],
          },
        ],
      },
      { kind: 'comment', text: 'after the first miss the rest of the draft is thrown away' },
      set(at('tally', n(1)), b('+', at('tally', n(1)), b('-', v('k'), v('accepted'))), 'verify'),
      set(v('checks'), b('+', v('checks'), n(1)), 'verify'),
      { kind: 'comment', text: 'accepted words + one word from the big model' },
      set(v('pos'), b('+', b('+', v('pos'), v('accepted')), n(1)), 'verify'),
    ],
  },
  { kind: 'return', expr: v('checks'), phase: 'cost' },
];

const costOfBody: IRStmt[] = [
  {
    kind: 'return',
    expr: b('+', b('*', v('drafted'), v('draftCost')), b('*', v('checks'), v('checkCost'))),
    phase: 'cost',
  },
];

export const speculativeDecodingImperativeIR: IR = {
  id: 'speculative-decoding-imperative',
  algorithm: 'speculativeDecoding',
  paradigm: 'imperative',
  functions: [
    {
      name: 'speculate',
      params: [
        { name: 'match', type: INT_LIST },
        { name: 'draftLen', type: INT },
        { name: 'tally', type: INT_LIST },
      ],
      returnType: INT,
      body: speculateBody,
    },
    {
      name: 'costOf',
      params: [
        { name: 'drafted', type: INT },
        { name: 'checks', type: INT },
        { name: 'draftCost', type: INT },
        { name: 'checkCost', type: INT },
      ],
      returnType: INT,
      body: costOfBody,
    },
  ],
};

export const speculativeDecodingIRs: IR[] = [speculativeDecodingImperativeIR];
