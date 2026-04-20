/**
 * CountingSort 학습용 IR.
 *
 *   def countingsort(arr):
 *       n = len(arr)
 *       if n == 0: return
 *       max_v = arr[0]                                    # phase: find-max
 *       for i from 1 to n:
 *           if arr[i] > max_v: max_v = arr[i]
 *       count = [0] * (max_v + 1)
 *       for i from 0 to n:                                # phase: count
 *           count[arr[i]] = count[arr[i]] + 1
 *       k = 0
 *       for value from 0 to max_v+1:                      # phase: reconstruct
 *           while count[value] > 0:
 *               arr[k] = value
 *               k = k + 1
 *               count[value] = count[value] - 1
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
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

export const countingsortImperativeIR: IR = {
  id: 'countingsort-imperative',
  algorithm: 'countingsort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'countingsort',
      params: [{ name: 'arr', type: tIntList }],
      returnType: tVoid,
      body: [
        { kind: 'var', name: 'n', type: tInt, init: len(v('arr')) },
        {
          kind: 'if',
          cond: bin('==', v('n'), lit(0)),
          then: [{ kind: 'return' }],
        },
        { kind: 'var', name: 'maxV', type: tInt, init: idx(v('arr'), lit(0)), phase: 'find-max' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(1),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: bin('>', idx(v('arr'), v('i')), v('maxV')),
              then: [{ kind: 'assign', target: v('maxV'), expr: idx(v('arr'), v('i')) }],
            },
          ],
        },
        { kind: 'var', name: 'count', type: tIntList, init: call('zeros', bin('+', v('maxV'), lit(1))) },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          phase: 'count',
          body: [
            {
              kind: 'assign',
              target: idx(v('count'), idx(v('arr'), v('i'))),
              expr: bin('+', idx(v('count'), idx(v('arr'), v('i'))), lit(1)),
            },
          ],
        },
        { kind: 'var', name: 'k', type: tInt, init: lit(0) },
        {
          kind: 'for-range',
          var: 'value',
          from: lit(0),
          to: bin('+', v('maxV'), lit(1)),
          inclusive: false,
          phase: 'reconstruct',
          body: [
            {
              kind: 'while',
              cond: bin('>', idx(v('count'), v('value')), lit(0)),
              body: [
                { kind: 'assign', target: idx(v('arr'), v('k')), expr: v('value') },
                { kind: 'assign', target: v('k'), expr: bin('+', v('k'), lit(1)) },
                {
                  kind: 'assign',
                  target: idx(v('count'), v('value')),
                  expr: bin('-', idx(v('count'), v('value')), lit(1)),
                },
              ],
            },
          ],
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const countingsortIRs: IR[] = [countingsortImperativeIR];
