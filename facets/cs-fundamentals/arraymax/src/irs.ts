/**
 * ArrayMax 학습용 IR — 분할 정복.
 *
 *   def maxrange(arr, lo, hi):
 *       if lo == hi:
 *           return arr[lo]                     # phase: base
 *       mid = (lo + hi) / 2                    # phase: split
 *       L = maxrange(arr, lo, mid)
 *       R = maxrange(arr, mid + 1, hi)
 *       if L >= R: return L                    # phase: combine
 *       return R
 *
 *   def arraymax(arr):
 *       return maxrange(arr, 0, len(arr) - 1)
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
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

export const arraymaxImperativeIR: IR = {
  id: 'arraymax-imperative',
  algorithm: 'arraymax',
  paradigm: 'imperative',
  functions: [
    {
      name: 'maxrange',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'lo', type: tInt },
        { name: 'hi', type: tInt },
      ],
      returnType: tInt,
      body: [
        {
          kind: 'if',
          cond: bin('==', v('lo'), v('hi')),
          then: [{ kind: 'return', phase: 'base', expr: idx(v('arr'), v('lo')) }],
        },
        {
          kind: 'var',
          name: 'mid',
          type: tInt,
          phase: 'split',
          init: bin('/', bin('+', v('lo'), v('hi')), lit(2)),
        },
        { kind: 'var', name: 'L', type: tInt, init: call('maxrange', [v('arr'), v('lo'), v('mid')]) },
        {
          kind: 'var',
          name: 'R',
          type: tInt,
          init: call('maxrange', [v('arr'), bin('+', v('mid'), lit(1)), v('hi')]),
        },
        {
          kind: 'if',
          phase: 'combine',
          cond: bin('>=', v('L'), v('R')),
          then: [{ kind: 'return', expr: v('L') }],
          else: [{ kind: 'return', expr: v('R') }],
        },
      ] satisfies IRStmt[],
    },
    {
      name: 'arraymax',
      params: [{ name: 'arr', type: tIntList }],
      returnType: tInt,
      body: [
        {
          kind: 'return',
          expr: call('maxrange', [v('arr'), lit(0), bin('-', len(v('arr')), lit(1))]),
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const arraymaxIRs: IR[] = [arraymaxImperativeIR];
