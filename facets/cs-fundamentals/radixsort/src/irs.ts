/**
 * RadixSort 학습용 IR — LSD 10진.
 *
 *   def radixsort(arr):
 *       n = len(arr)
 *       if n == 0: return
 *       max_v = arr[0]
 *       for i from 1 to n: if arr[i] > max_v: max_v = arr[i]   # phase: find-max
 *       exp = 1
 *       while max_v / exp > 0:                                 # phase: digit-pass
 *           counting_by_digit(arr, exp)
 *           exp = exp * 10
 *
 *   def counting_by_digit(arr, exp):
 *       n = len(arr)
 *       output = zeros(n)
 *       count = zeros(10)
 *       for i from 0 to n:                                     # phase: count
 *           count[(arr[i] / exp) % 10] += 1
 *       for d from 1 to 10: count[d] += count[d-1]
 *       i = n - 1
 *       while i >= 0:
 *           d = (arr[i] / exp) % 10
 *           output[count[d] - 1] = arr[i]
 *           count[d] -= 1
 *           i -= 1
 *       for i from 0 to n: arr[i] = output[i]                  # phase: place
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

export const radixsortImperativeIR: IR = {
  id: 'radixsort-imperative',
  algorithm: 'radixsort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'radixsort',
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
        { kind: 'var', name: 'exp', type: tInt, init: lit(1) },
        {
          kind: 'while',
          phase: 'digit-pass',
          cond: bin('>', bin('/', v('maxV'), v('exp')), lit(0)),
          body: [
            { kind: 'expr-stmt', expr: call('countingByDigit', v('arr'), v('exp')) },
            { kind: 'assign', target: v('exp'), expr: bin('*', v('exp'), lit(10)) },
          ],
        },
      ] satisfies IRStmt[],
    },
    {
      name: 'countingByDigit',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'exp', type: tInt },
      ],
      returnType: tVoid,
      body: [
        { kind: 'var', name: 'n', type: tInt, init: len(v('arr')) },
        { kind: 'var', name: 'output', type: tIntList, init: call('zeros', v('n')) },
        { kind: 'var', name: 'count', type: tIntList, init: call('zeros', lit(10)) },
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
              target: idx(v('count'), bin('%', bin('/', idx(v('arr'), v('i')), v('exp')), lit(10))),
              expr: bin('+', idx(v('count'), bin('%', bin('/', idx(v('arr'), v('i')), v('exp')), lit(10))), lit(1)),
            },
          ],
        },
        {
          kind: 'for-range',
          var: 'd',
          from: lit(1),
          to: lit(10),
          inclusive: false,
          body: [
            {
              kind: 'assign',
              target: idx(v('count'), v('d')),
              expr: bin('+', idx(v('count'), v('d')), idx(v('count'), bin('-', v('d'), lit(1)))),
            },
          ],
        },
        { kind: 'var', name: 'i', type: tInt, init: bin('-', v('n'), lit(1)) },
        {
          kind: 'while',
          cond: bin('>=', v('i'), lit(0)),
          body: [
            { kind: 'var', name: 'd', type: tInt, init: bin('%', bin('/', idx(v('arr'), v('i')), v('exp')), lit(10)) },
            {
              kind: 'assign',
              target: idx(v('output'), bin('-', idx(v('count'), v('d')), lit(1))),
              expr: idx(v('arr'), v('i')),
            },
            { kind: 'assign', target: idx(v('count'), v('d')), expr: bin('-', idx(v('count'), v('d')), lit(1)) },
            { kind: 'assign', target: v('i'), expr: bin('-', v('i'), lit(1)) },
          ],
        },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          phase: 'place',
          body: [
            { kind: 'assign', target: idx(v('arr'), v('i')), expr: idx(v('output'), v('i')) },
          ],
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const radixsortIRs: IR[] = [radixsortImperativeIR];
