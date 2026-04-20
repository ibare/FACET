/**
 * LinearSearch 학습용 IR.
 *
 *   def linearsearch(arr, target):
 *       n = len(arr)
 *       for i from 0 to n:
 *           if arr[i] == target:                    # phase: compare
 *               return i                            # phase: found
 *       return -1                                   # phase: end
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

export const linearsearchImperativeIR: IR = {
  id: 'linearsearch-imperative',
  algorithm: 'linearsearch',
  paradigm: 'imperative',
  functions: [
    {
      name: 'linearsearch',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'target', type: tInt },
      ],
      returnType: tInt,
      body: [
        { kind: 'var', name: 'n', type: tInt, init: len(v('arr')) },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              phase: 'compare',
              cond: bin('==', idx(v('arr'), v('i')), v('target')),
              then: [{ kind: 'return', phase: 'found', expr: v('i') }],
            },
          ],
        },
        { kind: 'return', phase: 'end', expr: un('-', lit(1)) },
      ] satisfies IRStmt[],
    },
  ],
};

export const linearsearchIRs: IR[] = [linearsearchImperativeIR];
