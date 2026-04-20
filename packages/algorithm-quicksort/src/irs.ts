/**
 * QuickSort 학습용 IR (Lomuto partition).
 *
 * 표현 코드:
 *
 *   def quicksort(arr, lo, hi):
 *       if lo >= hi: return
 *       pivot = arr[hi]                                # phase: pivot-select
 *       i = lo - 1
 *       for j from lo to hi:
 *           if arr[j] < pivot:                         # phase: compare
 *               i = i + 1
 *               swap arr[i], arr[j]                    # phase: swap
 *       swap arr[i+1], arr[hi]                         # phase: partition
 *       quicksort(arr, lo, i)                          # phase: recurse
 *       quicksort(arr, i+2, hi)                        # phase: recurse
 *
 * phase 어휘는 algorithm.ts 의 emit('phase', ...) 와 동일해야 한다.
 */

import type { IR, IRExpr, IRStmt, IRType } from '@facet/core';

const tInt: IRType = { kind: 'int' };
const tVoid: IRType = { kind: 'void' };
const tIntList: IRType = { kind: 'list', of: tInt };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | string | boolean): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const bin = (op: '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

export const quicksortImperativeIR: IR = {
  id: 'quicksort-imperative',
  algorithm: 'quicksort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'quicksort',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'lo', type: tInt },
        { name: 'hi', type: tInt },
      ],
      returnType: tVoid,
      body: [
        {
          kind: 'if',
          cond: bin('>=', v('lo'), v('hi')),
          then: [{ kind: 'return' }],
        },
        {
          kind: 'var',
          name: 'pivot',
          type: tInt,
          init: idx(v('arr'), v('hi')),
          phase: 'pivot-select',
        },
        {
          kind: 'var',
          name: 'i',
          type: tInt,
          init: bin('-', v('lo'), lit(1)),
        },
        {
          kind: 'for-range',
          var: 'j',
          from: v('lo'),
          to: v('hi'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              phase: 'compare',
              cond: bin('<', idx(v('arr'), v('j')), v('pivot')),
              then: [
                { kind: 'assign', target: v('i'), expr: bin('+', v('i'), lit(1)) },
                {
                  kind: 'swap',
                  phase: 'swap',
                  a: idx(v('arr'), v('i')),
                  b: idx(v('arr'), v('j')),
                },
              ],
            },
          ],
        },
        {
          kind: 'swap',
          phase: 'partition',
          a: idx(v('arr'), bin('+', v('i'), lit(1))),
          b: idx(v('arr'), v('hi')),
        },
        {
          kind: 'expr-stmt',
          phase: 'recurse',
          expr: call('quicksort', v('arr'), v('lo'), v('i')),
        },
        {
          kind: 'expr-stmt',
          phase: 'recurse',
          expr: call('quicksort', v('arr'), bin('+', v('i'), lit(2)), v('hi')),
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const quicksortIRs: IR[] = [quicksortImperativeIR];
