/**
 * BubbleSort 학습용 IR.
 *
 * 표현 코드 (Python-like 가짜코드 — 실제 emit 은 transpiler 가 언어별로 수행):
 *
 *   def bubblesort(arr):
 *       n = len(arr)
 *       for p from 0 to n-1:
 *           swapped = false
 *           for j from 0 to n-1-p:
 *               if arr[j] > arr[j+1]:                       # phase: compare
 *                   swap arr[j], arr[j+1]                   # phase: swap
 *                   swapped = true
 *           if !swapped: break                              # phase: pass-end
 *
 * phase 어휘는 algorithm.ts 의 emit('phase', ...) 와 동일해야 한다.
 */

import type { IR, IRExpr, IRStmt, IRType } from '@facet/core';

const tInt: IRType = { kind: 'int' };
const tBool: IRType = { kind: 'bool' };
const tVoid: IRType = { kind: 'void' };
const tIntList: IRType = { kind: 'list', of: tInt };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | string | boolean): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const bin = (op: '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const un = (op: '!' | '-', x: IRExpr): IRExpr => ({ kind: 'unop', op, x });

export const bubblesortImperativeIR: IR = {
  id: 'bubblesort-imperative',
  algorithm: 'bubblesort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'bubblesort',
      params: [{ name: 'arr', type: tIntList }],
      returnType: tVoid,
      body: [
        { kind: 'var', name: 'n', type: tInt, init: len(v('arr')) },
        {
          kind: 'for-range',
          var: 'p',
          from: lit(0),
          to: bin('-', v('n'), lit(1)),
          inclusive: false,
          body: [
            { kind: 'var', name: 'swapped', type: tBool, init: lit(false) },
            {
              kind: 'for-range',
              var: 'j',
              from: lit(0),
              to: bin('-', bin('-', v('n'), lit(1)), v('p')),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  phase: 'compare',
                  cond: bin('>', idx(v('arr'), v('j')), idx(v('arr'), bin('+', v('j'), lit(1)))),
                  then: [
                    {
                      kind: 'swap',
                      phase: 'swap',
                      a: idx(v('arr'), v('j')),
                      b: idx(v('arr'), bin('+', v('j'), lit(1))),
                    },
                    { kind: 'assign', target: v('swapped'), expr: lit(true) },
                  ],
                },
              ],
            },
            {
              kind: 'if',
              phase: 'pass-end',
              cond: un('!', v('swapped')),
              then: [{ kind: 'break' }],
            },
          ],
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const bubblesortIRs: IR[] = [bubblesortImperativeIR];
