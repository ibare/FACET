/**
 * BinarySearch 학습용 IR.
 *
 *   def binarysearch(arr, target):
 *       lo = 0
 *       hi = len(arr) - 1
 *       while lo <= hi:
 *           mid = (lo + hi) / 2                       # phase: compare
 *           if arr[mid] == target:
 *               return mid                            # phase: found
 *           if arr[mid] < target:
 *               lo = mid + 1                          # phase: narrow-right
 *           else:
 *               hi = mid - 1                          # phase: narrow-left
 *       return -1                                     # phase: not-found
 */

import type { IR, IRExpr, IRStmt, IRType } from '@facet/core';

const tInt: IRType = { kind: 'int' };
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

export const binarysearchImperativeIR: IR = {
  id: 'binarysearch-imperative',
  algorithm: 'binarysearch',
  paradigm: 'imperative',
  functions: [
    {
      name: 'binarysearch',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'target', type: tInt },
      ],
      returnType: tInt,
      body: [
        { kind: 'var', name: 'lo', type: tInt, init: lit(0) },
        { kind: 'var', name: 'hi', type: tInt, init: bin('-', len(v('arr')), lit(1)) },
        {
          kind: 'while',
          cond: bin('<=', v('lo'), v('hi')),
          body: [
            {
              kind: 'var',
              name: 'mid',
              type: tInt,
              phase: 'compare',
              init: bin('/', bin('+', v('lo'), v('hi')), lit(2)),
            },
            {
              kind: 'if',
              cond: bin('==', idx(v('arr'), v('mid')), v('target')),
              then: [{ kind: 'return', phase: 'found', expr: v('mid') }],
            },
            {
              kind: 'if',
              cond: bin('<', idx(v('arr'), v('mid')), v('target')),
              then: [
                {
                  kind: 'assign',
                  phase: 'narrow-right',
                  target: v('lo'),
                  expr: bin('+', v('mid'), lit(1)),
                },
              ],
              else: [
                {
                  kind: 'assign',
                  phase: 'narrow-left',
                  target: v('hi'),
                  expr: bin('-', v('mid'), lit(1)),
                },
              ],
            },
          ],
        },
        { kind: 'return', phase: 'not-found', expr: un('-', lit(1)) },
      ] satisfies IRStmt[],
    },
  ],
};

export const binarysearchIRs: IR[] = [binarysearchImperativeIR];
