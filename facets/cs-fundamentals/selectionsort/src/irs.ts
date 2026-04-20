/**
 * SelectionSort 학습용 IR.
 *
 *   def selectionsort(arr):
 *       n = len(arr)
 *       for i from 0 to n-1:
 *           min_idx = i
 *           for j from i+1 to n:
 *               if arr[j] < arr[min_idx]:           # phase: compare
 *                   min_idx = j                     # phase: update-min
 *           if min_idx != i:
 *               swap arr[i], arr[min_idx]           # phase: swap
 */

import type { IR, IRExpr, IRStmt, IRType } from '@facet/core';

const tInt: IRType = { kind: 'int' };
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

export const selectionsortImperativeIR: IR = {
  id: 'selectionsort-imperative',
  algorithm: 'selectionsort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'selectionsort',
      params: [{ name: 'arr', type: tIntList }],
      returnType: tVoid,
      body: [
        { kind: 'var', name: 'n', type: tInt, init: len(v('arr')) },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: bin('-', v('n'), lit(1)),
          inclusive: false,
          body: [
            { kind: 'var', name: 'minIdx', type: tInt, init: v('i'), phase: 'pass-start' },
            {
              kind: 'for-range',
              var: 'j',
              from: bin('+', v('i'), lit(1)),
              to: v('n'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  phase: 'compare',
                  cond: bin('<', idx(v('arr'), v('j')), idx(v('arr'), v('minIdx'))),
                  then: [
                    {
                      kind: 'assign',
                      phase: 'update-min',
                      target: v('minIdx'),
                      expr: v('j'),
                    },
                  ],
                },
              ],
            },
            {
              kind: 'if',
              cond: bin('!=', v('minIdx'), v('i')),
              then: [
                {
                  kind: 'swap',
                  phase: 'swap',
                  a: idx(v('arr'), v('i')),
                  b: idx(v('arr'), v('minIdx')),
                },
              ],
            },
          ],
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const selectionsortIRs: IR[] = [selectionsortImperativeIR];
