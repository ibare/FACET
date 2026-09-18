/**
 * 포화 카운터의 코드 패널 IR.
 *
 * 진입 `countMisses(outcomes, bits, lo, hi)` 는 결과 열을 처음부터 끝까지 걷되
 * `lo ≤ i < hi` 인 걸음의 틀림만 센다. 화면의 두 계기는 이 함수를 두 번 부른 값이다 —
 * 반복 구간 `(0, turnAt)`, 뒤집힌 뒤 `(turnAt, len)`. 합은 `(0, len)`.
 *
 * IR 에는 비트 연산과 `pow` 가 없다. 꼭대기는 1 에 2 를 `bits` 번 곱해 1 을 빼고,
 * 포화는 예약 수학 `min` · `max` 로 한다. `&&` 는 짧은 회로가 아니므로 구간 검사는
 * `if` 를 겹쳐 적는다. 중간값의 최대는 `top = 7` · `misses ≤ 16` 이다.
 *
 * phase 어휘는 algorithm.ts 와 같다 — init · guess · check · update (C3).
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '>=' | '<' | '!=' | '==', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: string, idx: string): IRExpr => ({ kind: 'index', arr: v(arr), idx: v(idx) });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

const decl = (name: string, init: IRExpr, phase: string): IRStmt => ({
  kind: 'var',
  name,
  type: INT,
  init,
  phase,
});
const put = (name: string, expr: IRExpr, phase: string): IRStmt => ({
  kind: 'assign',
  target: v(name),
  expr,
  phase,
});

export const saturatingCounterImperativeIR: IR = {
  id: 'saturating-counter-imperative',
  algorithm: 'saturatingCounter',
  paradigm: 'imperative',
  functions: [
    {
      name: 'countMisses',
      params: [
        { name: 'outcomes', type: INT_LIST },
        { name: 'bits', type: INT },
        { name: 'lo', type: INT },
        { name: 'hi', type: INT },
      ],
      returnType: INT,
      body: [
        decl('top', n(1), 'init'),
        {
          kind: 'for-range',
          var: 'k',
          from: n(0),
          to: v('bits'),
          inclusive: false,
          body: [put('top', bin('*', v('top'), n(2)), 'init')],
          phase: 'init',
        },
        put('top', bin('-', v('top'), n(1)), 'init'),
        decl('threshold', bin('//', bin('+', v('top'), n(1)), n(2)), 'init'),
        decl('state', v('top'), 'init'),
        decl('misses', n(0), 'init'),
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: { kind: 'len', of: v('outcomes') },
          inclusive: false,
          body: [
            decl('guess', n(0), 'guess'),
            {
              kind: 'if',
              cond: bin('>=', v('state'), v('threshold')),
              then: [put('guess', n(1), 'guess')],
              phase: 'guess',
            },
            {
              kind: 'if',
              cond: bin('!=', v('guess'), at('outcomes', 'i')),
              then: [
                {
                  kind: 'if',
                  cond: bin('>=', v('i'), v('lo')),
                  then: [
                    {
                      kind: 'if',
                      cond: bin('<', v('i'), v('hi')),
                      then: [put('misses', bin('+', v('misses'), n(1)), 'check')],
                      phase: 'check',
                    },
                  ],
                  phase: 'check',
                },
              ],
              phase: 'check',
            },
            {
              kind: 'if',
              cond: bin('==', at('outcomes', 'i'), n(1)),
              then: [put('state', call('min', v('top'), bin('+', v('state'), n(1))), 'update')],
              else: [put('state', call('max', n(0), bin('-', v('state'), n(1))), 'update')],
              phase: 'update',
            },
          ],
        },
        { kind: 'return', expr: v('misses') },
      ],
    },
  ],
};

export const saturatingCounterIRs: IR[] = [saturatingCounterImperativeIR];
