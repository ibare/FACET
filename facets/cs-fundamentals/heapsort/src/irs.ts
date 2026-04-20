/**
 * HeapSort 학습용 IR — 배열 기반 max-heap.
 *
 *   def heapsort(arr):
 *       n = len(arr)
 *       for i from n/2-1 downto 0: siftdown(arr, i, n)   # phase: build-heap
 *       for end from n-1 downto 1:
 *           swap arr[0], arr[end]                        # phase: extract
 *           siftdown(arr, 0, end)
 *
 *   def siftdown(arr, start, end):
 *       root = start
 *       while 2*root+1 < end:
 *           left = 2*root + 1
 *           right = 2*root + 2
 *           larger = left
 *           if right < end and arr[right] > arr[left]:
 *               larger = right
 *           if arr[root] >= arr[larger]: break           # phase: compare-children
 *           swap arr[root], arr[larger]                  # phase: sift-down
 *           root = larger
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

export const heapsortImperativeIR: IR = {
  id: 'heapsort-imperative',
  algorithm: 'heapsort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'heapsort',
      params: [{ name: 'arr', type: tIntList }],
      returnType: tVoid,
      body: [
        { kind: 'var', name: 'n', type: tInt, init: len(v('arr')) },
        { kind: 'var', name: 'i', type: tInt, init: bin('-', bin('/', v('n'), lit(2)), lit(1)) },
        {
          kind: 'while',
          phase: 'build-heap',
          cond: bin('>=', v('i'), lit(0)),
          body: [
            { kind: 'expr-stmt', expr: call('siftdown', v('arr'), v('i'), v('n')) },
            { kind: 'assign', target: v('i'), expr: bin('-', v('i'), lit(1)) },
          ],
        },
        { kind: 'var', name: 'end', type: tInt, init: bin('-', v('n'), lit(1)) },
        {
          kind: 'while',
          cond: bin('>', v('end'), lit(0)),
          body: [
            { kind: 'swap', phase: 'extract', a: idx(v('arr'), lit(0)), b: idx(v('arr'), v('end')) },
            { kind: 'expr-stmt', expr: call('siftdown', v('arr'), lit(0), v('end')) },
            { kind: 'assign', target: v('end'), expr: bin('-', v('end'), lit(1)) },
          ],
        },
      ] satisfies IRStmt[],
    },
    {
      name: 'siftdown',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'start', type: tInt },
        { name: 'end', type: tInt },
      ],
      returnType: tVoid,
      body: [
        { kind: 'var', name: 'root', type: tInt, init: v('start') },
        {
          kind: 'while',
          cond: bin('<', bin('+', bin('*', lit(2), v('root')), lit(1)), v('end')),
          body: [
            { kind: 'var', name: 'left', type: tInt, init: bin('+', bin('*', lit(2), v('root')), lit(1)) },
            { kind: 'var', name: 'right', type: tInt, init: bin('+', bin('*', lit(2), v('root')), lit(2)) },
            { kind: 'var', name: 'larger', type: tInt, init: v('left') },
            {
              kind: 'if',
              phase: 'compare-children',
              cond: bin('&&', bin('<', v('right'), v('end')), bin('>', idx(v('arr'), v('right')), idx(v('arr'), v('left')))),
              then: [{ kind: 'assign', target: v('larger'), expr: v('right') }],
            },
            {
              kind: 'if',
              cond: bin('>=', idx(v('arr'), v('root')), idx(v('arr'), v('larger'))),
              then: [{ kind: 'break' }],
            },
            { kind: 'swap', phase: 'sift-down', a: idx(v('arr'), v('root')), b: idx(v('arr'), v('larger')) },
            { kind: 'assign', target: v('root'), expr: v('larger') },
          ],
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const heapsortIRs: IR[] = [heapsortImperativeIR];
