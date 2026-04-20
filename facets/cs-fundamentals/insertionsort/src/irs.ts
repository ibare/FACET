/**
 * InsertionSort 학습용 IR.
 *
 *   def insertionsort(arr):
 *       n = len(arr)
 *       for i from 1 to n:
 *           key = arr[i]                           # phase: pick
 *           j = i - 1
 *           while j >= 0 and arr[j] > key:         # phase: compare
 *               arr[j+1] = arr[j]                  # phase: shift
 *               j = j - 1
 *           arr[j+1] = key                         # phase: insert
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

export const insertionsortImperativeIR: IR = {
  id: 'insertionsort-imperative',
  algorithm: 'insertionsort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'insertionsort',
      params: [{ name: 'arr', type: tIntList }],
      returnType: tVoid,
      body: [
        { kind: 'var', name: 'n', type: tInt, init: len(v('arr')) },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(1),
          to: v('n'),
          inclusive: false,
          body: [
            { kind: 'var', name: 'key', type: tInt, init: idx(v('arr'), v('i')), phase: 'pick' },
            { kind: 'var', name: 'j', type: tInt, init: bin('-', v('i'), lit(1)) },
            {
              kind: 'while',
              phase: 'compare',
              cond: bin('&&', bin('>=', v('j'), lit(0)), bin('>', idx(v('arr'), v('j')), v('key'))),
              body: [
                {
                  kind: 'assign',
                  phase: 'shift',
                  target: idx(v('arr'), bin('+', v('j'), lit(1))),
                  expr: idx(v('arr'), v('j')),
                },
                { kind: 'assign', target: v('j'), expr: bin('-', v('j'), lit(1)) },
              ],
            },
            {
              kind: 'assign',
              phase: 'insert',
              target: idx(v('arr'), bin('+', v('j'), lit(1))),
              expr: v('key'),
            },
          ],
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const insertionsortIRs: IR[] = [insertionsortImperativeIR];
