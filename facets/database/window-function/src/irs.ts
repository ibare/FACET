/**
 * window-function 의 IR — 화면의 두 질의(윈도 합 · GROUP BY 합)를 셈하는 반복.
 *
 * 진입 `frameSums(part, val, n, k, near, total) -> int` (near == total 인 줄 수)
 *   part  = 행마다 team 번호 (처음 나온 차례로 0 부터 — 부르는 쪽이 매긴다), id 차례
 *   val   = 행마다 km
 *   k     = 앞뒤 줄 수. UNBOUNDED 는 k = n (표의 줄 수) 으로 건넨다 — 어느 묶음이든 덮는 폭이라 같은 답이다.
 *           그래서 코드 패널은 SQL 의 `UNBOUNDED` 낱말 대신 수 하나로 틀을 받는다 (IR 에 "끝없음" 이 없다)
 *   near · total = 길이 n 버퍼. IR 이 쓴다
 *
 * 줄 i 마다 묶음 안 자리 posI (같은 묶음의 앞 줄 수) 를 세고, 같은 묶음 줄 j 를 차례로 훑어 자리 posJ 가
 * posI − k 이상 · posI + k 이하면 더한다. 자리 범위는 `if` 를 중첩해 견준다 (`&&` 는 짧은 회로가 아니다).
 * `posI - k` 는 음수가 될 수 있지만 견줌에만 쓴다. 중간값 최대는 total 19 — 32 비트 걱정이 없다.
 *
 * phase — frame-sum (틀 안 더하기) · fold-total (묶음 합 더하기) · same-total (같은 줄 세기). algorithm 과 같다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '==' | '>=' | '<=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const inc = (name: string, by: IRExpr, phase?: string): IRStmt => ({
  kind: 'assign',
  target: v(name),
  expr: bin('+', v(name), by),
  ...(phase ? { phase } : {}),
});
const samePart = (a: string, b: string): IRExpr => bin('==', at('part', v(a)), at('part', v(b)));

export const windowFunctionImperativeIR: IR = {
  id: 'window-function-imperative',
  algorithm: 'windowFunction',
  paradigm: 'imperative',
  functions: [
    {
      name: 'frameSums',
      params: [
        { name: 'part', type: INT_LIST },
        { name: 'val', type: INT_LIST },
        { name: 'n', type: INT },
        { name: 'k', type: INT },
        { name: 'near', type: INT_LIST },
        { name: 'total', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'same', type: INT, init: lit(0) },
        { kind: 'comment', text: 'window: sum km over rows of the same team within k before and after' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            { kind: 'var', name: 'posI', type: INT, init: lit(0) },
            {
              kind: 'for-range',
              var: 'j',
              from: lit(0),
              to: v('i'),
              inclusive: false,
              body: [{ kind: 'if', cond: samePart('j', 'i'), then: [inc('posI', lit(1))] }],
            },
            { kind: 'var', name: 's', type: INT, init: lit(0) },
            { kind: 'var', name: 'posJ', type: INT, init: lit(0) },
            {
              kind: 'for-range',
              var: 'j',
              from: lit(0),
              to: v('n'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: samePart('j', 'i'),
                  then: [
                    {
                      kind: 'if',
                      cond: bin('>=', v('posJ'), bin('-', v('posI'), v('k'))),
                      then: [
                        {
                          kind: 'if',
                          cond: bin('<=', v('posJ'), bin('+', v('posI'), v('k'))),
                          then: [inc('s', at('val', v('j')), 'frame-sum')],
                        },
                      ],
                    },
                    inc('posJ', lit(1)),
                  ],
                },
              ],
            },
            { kind: 'assign', target: at('near', v('i')), expr: v('s') },
          ],
        },
        { kind: 'comment', text: 'GROUP BY: sum km over all rows of the same team' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            { kind: 'var', name: 'g', type: INT, init: lit(0) },
            {
              kind: 'for-range',
              var: 'j',
              from: lit(0),
              to: v('n'),
              inclusive: false,
              body: [{ kind: 'if', cond: samePart('j', 'i'), then: [inc('g', at('val', v('j')), 'fold-total')] }],
            },
            { kind: 'assign', target: at('total', v('i')), expr: v('g') },
            {
              kind: 'if',
              cond: bin('==', at('near', v('i')), v('g')),
              then: [inc('same', lit(1), 'same-total')],
            },
          ],
        },
        { kind: 'return', expr: v('same') },
      ],
    },
  ],
};

export const windowFunctionIRs: IR[] = [windowFunctionImperativeIR];
