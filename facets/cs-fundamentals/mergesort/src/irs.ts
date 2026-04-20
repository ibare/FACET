/**
 * MergeSort 학습용 IR — top-down 재귀 + 병합.
 *
 * 학습용으로 IR 에서는 보조 배열 대신 하나의 함수 호출로 간결화.
 * (실제 emit 코드는 보조 배열을 사용; 학습용 의사코드)
 *
 *   def mergesort(arr, lo, hi):
 *       if lo >= hi: return
 *       mid = (lo + hi) / 2
 *       mergesort(arr, lo, mid)                      # phase: divide
 *       mergesort(arr, mid+1, hi)                    # phase: divide
 *       merge(arr, lo, mid, hi)                      # phase: merge-end
 *
 *   def merge(arr, lo, mid, hi):
 *       left = arr[lo..mid+1]
 *       right = arr[mid+1..hi+1]
 *       i = 0; j = 0; k = lo
 *       while i < len(left) and j < len(right):
 *           if left[i] <= right[j]:                  # phase: compare
 *               arr[k] = left[i]                     # phase: place
 *               i = i + 1
 *           else:
 *               arr[k] = right[j]                    # phase: place
 *               j = j + 1
 *           k = k + 1
 *       while i < len(left): arr[k] = left[i]; i+=1; k+=1   # phase: place
 *       while j < len(right): arr[k] = right[j]; j+=1; k+=1 # phase: place
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

export const mergesortImperativeIR: IR = {
  id: 'mergesort-imperative',
  algorithm: 'mergesort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'mergesort',
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
        { kind: 'var', name: 'mid', type: tInt, init: bin('/', bin('+', v('lo'), v('hi')), lit(2)) },
        { kind: 'expr-stmt', phase: 'divide', expr: call('mergesort', v('arr'), v('lo'), v('mid')) },
        { kind: 'expr-stmt', phase: 'divide', expr: call('mergesort', v('arr'), bin('+', v('mid'), lit(1)), v('hi')) },
        { kind: 'expr-stmt', phase: 'merge-end', expr: call('merge', v('arr'), v('lo'), v('mid'), v('hi')) },
      ] satisfies IRStmt[],
    },
    {
      name: 'merge',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'lo', type: tInt },
        { name: 'mid', type: tInt },
        { name: 'hi', type: tInt },
      ],
      returnType: tVoid,
      body: [
        { kind: 'var', name: 'left', type: tIntList, init: call('slice', v('arr'), v('lo'), bin('+', v('mid'), lit(1))) },
        { kind: 'var', name: 'right', type: tIntList, init: call('slice', v('arr'), bin('+', v('mid'), lit(1)), bin('+', v('hi'), lit(1))) },
        { kind: 'var', name: 'i', type: tInt, init: lit(0) },
        { kind: 'var', name: 'j', type: tInt, init: lit(0) },
        { kind: 'var', name: 'k', type: tInt, init: v('lo') },
        {
          kind: 'while',
          cond: bin('&&', bin('<', v('i'), len(v('left'))), bin('<', v('j'), len(v('right')))),
          body: [
            {
              kind: 'if',
              phase: 'compare',
              cond: bin('<=', idx(v('left'), v('i')), idx(v('right'), v('j'))),
              then: [
                { kind: 'assign', phase: 'place', target: idx(v('arr'), v('k')), expr: idx(v('left'), v('i')) },
                { kind: 'assign', target: v('i'), expr: bin('+', v('i'), lit(1)) },
              ],
              else: [
                { kind: 'assign', phase: 'place', target: idx(v('arr'), v('k')), expr: idx(v('right'), v('j')) },
                { kind: 'assign', target: v('j'), expr: bin('+', v('j'), lit(1)) },
              ],
            },
            { kind: 'assign', target: v('k'), expr: bin('+', v('k'), lit(1)) },
          ],
        },
        {
          kind: 'while',
          cond: bin('<', v('i'), len(v('left'))),
          body: [
            { kind: 'assign', phase: 'place', target: idx(v('arr'), v('k')), expr: idx(v('left'), v('i')) },
            { kind: 'assign', target: v('i'), expr: bin('+', v('i'), lit(1)) },
            { kind: 'assign', target: v('k'), expr: bin('+', v('k'), lit(1)) },
          ],
        },
        {
          kind: 'while',
          cond: bin('<', v('j'), len(v('right'))),
          body: [
            { kind: 'assign', phase: 'place', target: idx(v('arr'), v('k')), expr: idx(v('right'), v('j')) },
            { kind: 'assign', target: v('j'), expr: bin('+', v('j'), lit(1)) },
            { kind: 'assign', target: v('k'), expr: bin('+', v('k'), lit(1)) },
          ],
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const mergesortIRs: IR[] = [mergesortImperativeIR];
