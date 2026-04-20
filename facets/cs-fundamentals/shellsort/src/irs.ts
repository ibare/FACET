/**
 * ShellSort 학습용 IR — gap 시퀀스 = n/2, n/4, ..., 1.
 *
 *   def shellsort(arr):
 *       n = len(arr)
 *       gap = n / 2
 *       while gap > 0:                                     # phase: gap
 *           for i from gap to n:
 *               temp = arr[i]
 *               j = i
 *               while j >= gap and arr[j-gap] > temp:      # phase: compare
 *                   arr[j] = arr[j-gap]                    # phase: shift
 *                   j = j - gap
 *               arr[j] = temp                              # phase: insert
 *           gap = gap / 2
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

export const shellsortImperativeIR: IR = {
  id: 'shellsort-imperative',
  algorithm: 'shellsort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'shellsort',
      params: [{ name: 'arr', type: tIntList }],
      returnType: tVoid,
      body: [
        { kind: 'var', name: 'n', type: tInt, init: len(v('arr')) },
        { kind: 'var', name: 'gap', type: tInt, init: bin('/', v('n'), lit(2)) },
        {
          kind: 'while',
          phase: 'gap',
          cond: bin('>', v('gap'), lit(0)),
          body: [
            {
              kind: 'for-range',
              var: 'i',
              from: v('gap'),
              to: v('n'),
              inclusive: false,
              body: [
                { kind: 'var', name: 'temp', type: tInt, init: idx(v('arr'), v('i')) },
                { kind: 'var', name: 'j', type: tInt, init: v('i') },
                {
                  kind: 'while',
                  phase: 'compare',
                  cond: bin('&&', bin('>=', v('j'), v('gap')), bin('>', idx(v('arr'), bin('-', v('j'), v('gap'))), v('temp'))),
                  body: [
                    {
                      kind: 'assign',
                      phase: 'shift',
                      target: idx(v('arr'), v('j')),
                      expr: idx(v('arr'), bin('-', v('j'), v('gap'))),
                    },
                    { kind: 'assign', target: v('j'), expr: bin('-', v('j'), v('gap')) },
                  ],
                },
                {
                  kind: 'assign',
                  phase: 'insert',
                  target: idx(v('arr'), v('j')),
                  expr: v('temp'),
                },
              ],
            },
            { kind: 'assign', target: v('gap'), expr: bin('/', v('gap'), lit(2)) },
          ],
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const shellsortIRs: IR[] = [shellsortImperativeIR];
