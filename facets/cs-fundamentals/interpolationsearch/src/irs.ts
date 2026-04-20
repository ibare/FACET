/**
 * InterpolationSearch 학습용 IR.
 *
 *   def interpolationsearch(arr, target):
 *       lo = 0
 *       hi = len(arr) - 1
 *       while lo <= hi and target >= arr[lo] and target <= arr[hi]:
 *           pos = lo + (target - arr[lo]) * (hi - lo) / (arr[hi] - arr[lo])  # phase: estimate
 *           if arr[pos] == target:
 *               return pos                                                    # phase: found
 *           if arr[pos] < target:
 *               lo = pos + 1                                                  # phase: narrow-right
 *           else:
 *               hi = pos - 1                                                  # phase: narrow-left
 *       return -1                                                             # phase: not-found
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

export const interpolationsearchImperativeIR: IR = {
  id: 'interpolationsearch-imperative',
  algorithm: 'interpolationsearch',
  paradigm: 'imperative',
  functions: [
    {
      name: 'interpolationsearch',
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
          cond: bin(
            '&&',
            bin('<=', v('lo'), v('hi')),
            bin(
              '&&',
              bin('>=', v('target'), idx(v('arr'), v('lo'))),
              bin('<=', v('target'), idx(v('arr'), v('hi'))),
            ),
          ),
          body: [
            {
              kind: 'var',
              name: 'pos',
              type: tInt,
              phase: 'estimate',
              init: bin(
                '+',
                v('lo'),
                bin(
                  '/',
                  bin(
                    '*',
                    bin('-', v('target'), idx(v('arr'), v('lo'))),
                    bin('-', v('hi'), v('lo')),
                  ),
                  bin('-', idx(v('arr'), v('hi')), idx(v('arr'), v('lo'))),
                ),
              ),
            },
            {
              kind: 'if',
              cond: bin('==', idx(v('arr'), v('pos')), v('target')),
              then: [{ kind: 'return', phase: 'found', expr: v('pos') }],
            },
            {
              kind: 'if',
              cond: bin('<', idx(v('arr'), v('pos')), v('target')),
              then: [
                {
                  kind: 'assign',
                  phase: 'narrow-right',
                  target: v('lo'),
                  expr: bin('+', v('pos'), lit(1)),
                },
              ],
              else: [
                {
                  kind: 'assign',
                  phase: 'narrow-left',
                  target: v('hi'),
                  expr: bin('-', v('pos'), lit(1)),
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

export const interpolationsearchIRs: IR[] = [interpolationsearchImperativeIR];
