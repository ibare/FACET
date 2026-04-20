/**
 * Fibonacci Memo IR.
 *
 *   def fib(k, memo):
 *       if k <= 1:
 *           memo[k] = k
 *           return k                          # phase: base
 *       if memo[k] != -1:
 *           return memo[k]                    # phase: hit
 *       a = fib(k - 1, memo)                  # phase: compute
 *       b = fib(k - 2, memo)
 *       memo[k] = a + b
 *       return memo[k]
 */

import type { IR, IRExpr, IRStmt, IRType } from '@facet/core';

const tInt: IRType = { kind: 'int' };
const tIntList: IRType = { kind: 'list', of: tInt };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | string | boolean): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const bin = (op: '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const un = (op: '!' | '-', x: IRExpr): IRExpr => ({ kind: 'unop', op, x });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

export const fibonaccimemoImperativeIR: IR = {
  id: 'fibonaccimemo-imperative',
  algorithm: 'fibonaccimemo',
  paradigm: 'imperative',
  functions: [
    {
      name: 'fib',
      params: [
        { name: 'k', type: tInt },
        { name: 'memo', type: tIntList },
      ],
      returnType: tInt,
      body: [
        {
          kind: 'if',
          cond: bin('<=', v('k'), lit(1)),
          then: [
            { kind: 'assign', target: idx(v('memo'), v('k')), expr: v('k') },
            { kind: 'return', phase: 'base', expr: v('k') },
          ],
        },
        {
          kind: 'if',
          cond: bin('!=', idx(v('memo'), v('k')), un('-', lit(1))),
          then: [{ kind: 'return', phase: 'hit', expr: idx(v('memo'), v('k')) }],
        },
        {
          kind: 'var',
          name: 'a',
          type: tInt,
          phase: 'compute',
          init: call('fib', [bin('-', v('k'), lit(1)), v('memo')]),
        },
        { kind: 'var', name: 'b', type: tInt, init: call('fib', [bin('-', v('k'), lit(2)), v('memo')]) },
        { kind: 'assign', target: idx(v('memo'), v('k')), expr: bin('+', v('a'), v('b')) },
        { kind: 'return', expr: idx(v('memo'), v('k')) },
      ] satisfies IRStmt[],
    },
  ],
};

export const fibonaccimemoIRs: IR[] = [fibonaccimemoImperativeIR];
