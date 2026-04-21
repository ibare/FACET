/**
 * Factorial 학습용 IR — 재귀.
 *
 *   def factorial(n):
 *       if n <= 1:
 *           return 1                # phase: base
 *       sub = factorial(n - 1)      # phase: call
 *       return n * sub              # phase: return
 */

import type { IR, IRExpr, IRStmt, IRType } from '@facet/core';

const tInt: IRType = { kind: 'int' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | string | boolean): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

export const factorialImperativeIR: IR = {
  id: 'factorial-imperative',
  algorithm: 'factorial',
  paradigm: 'imperative',
  functions: [
    {
      name: 'factorial',
      params: [{ name: 'n', type: tInt }],
      returnType: tInt,
      body: [
        {
          kind: 'if',
          cond: bin('<=', v('n'), lit(1)),
          then: [{ kind: 'return', phase: 'base', expr: lit(1) }],
        },
        {
          kind: 'var',
          name: 'sub',
          type: tInt,
          phase: 'call',
          init: call('factorial', [bin('-', v('n'), lit(1))]),
        },
        {
          kind: 'return',
          phase: 'return',
          expr: bin('*', v('n'), v('sub')),
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const factorialIRs: IR[] = [factorialImperativeIR];
