/**
 * CoinChange (Greedy) IR.
 *
 *   def coinchange(amount, coins):
 *       remaining = amount
 *       total = 0
 *       for i from 0 to len(coins):
 *           while remaining >= coins[i]:
 *               remaining = remaining - coins[i]   # phase: use
 *               total = total + 1
 *           if remaining == 0: return total        # phase: done
 *       return total
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

export const coinchangeImperativeIR: IR = {
  id: 'coinchange-imperative',
  algorithm: 'coinchange',
  paradigm: 'imperative',
  functions: [
    {
      name: 'coinchange',
      params: [
        { name: 'amount', type: tInt },
        { name: 'coins', type: tIntList },
      ],
      returnType: tInt,
      body: [
        { kind: 'var', name: 'remaining', type: tInt, init: v('amount') },
        { kind: 'var', name: 'total', type: tInt, init: lit(0) },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: len(v('coins')),
          inclusive: false,
          phase: 'try',
          body: [
            {
              kind: 'while',
              cond: bin('>=', v('remaining'), idx(v('coins'), v('i'))),
              body: [
                {
                  kind: 'assign',
                  phase: 'use',
                  target: v('remaining'),
                  expr: bin('-', v('remaining'), idx(v('coins'), v('i'))),
                },
                { kind: 'assign', target: v('total'), expr: bin('+', v('total'), lit(1)) },
              ],
            },
            {
              kind: 'if',
              phase: 'done',
              cond: bin('==', v('remaining'), lit(0)),
              then: [{ kind: 'return', expr: v('total') }],
            },
          ],
        },
        { kind: 'return', expr: v('total') },
      ] satisfies IRStmt[],
    },
  ],
};

export const coinchangeIRs: IR[] = [coinchangeImperativeIR];
