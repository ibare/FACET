/**
 * SubsetSum 학습용 IR — 백트래킹.
 *
 *   def dfs(arr, target, i, sum):
 *       if sum == target: return 1                     # phase: hit
 *       if i == len(arr): return 0
 *       if sum > target: return 0                      # phase: prune
 *       if dfs(arr, target, i+1, sum + arr[i]) == 1:   # phase: include
 *           return 1
 *       if dfs(arr, target, i+1, sum) == 1:            # phase: exclude
 *           return 1
 *       return 0
 *
 *   def subsetsum(arr, target):
 *       return dfs(arr, target, 0, 0)
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

export const subsetsumImperativeIR: IR = {
  id: 'subsetsum-imperative',
  algorithm: 'subsetsum',
  paradigm: 'imperative',
  functions: [
    {
      name: 'dfs',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'target', type: tInt },
        { name: 'i', type: tInt },
        { name: 'sum', type: tInt },
      ],
      returnType: tInt,
      body: [
        {
          kind: 'if',
          cond: bin('==', v('sum'), v('target')),
          then: [{ kind: 'return', phase: 'hit', expr: lit(1) }],
        },
        {
          kind: 'if',
          cond: bin('==', v('i'), len(v('arr'))),
          then: [{ kind: 'return', expr: lit(0) }],
        },
        {
          kind: 'if',
          cond: bin('>', v('sum'), v('target')),
          then: [{ kind: 'return', phase: 'prune', expr: lit(0) }],
        },
        {
          kind: 'if',
          phase: 'include',
          cond: bin(
            '==',
            call('dfs', [
              v('arr'),
              v('target'),
              bin('+', v('i'), lit(1)),
              bin('+', v('sum'), idx(v('arr'), v('i'))),
            ]),
            lit(1),
          ),
          then: [{ kind: 'return', expr: lit(1) }],
        },
        {
          kind: 'if',
          phase: 'exclude',
          cond: bin(
            '==',
            call('dfs', [v('arr'), v('target'), bin('+', v('i'), lit(1)), v('sum')]),
            lit(1),
          ),
          then: [{ kind: 'return', expr: lit(1) }],
        },
        { kind: 'return', expr: lit(0) },
      ] satisfies IRStmt[],
    },
    {
      name: 'subsetsum',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'target', type: tInt },
      ],
      returnType: tInt,
      body: [
        { kind: 'return', expr: call('dfs', [v('arr'), v('target'), lit(0), lit(0)]) },
      ] satisfies IRStmt[],
    },
  ],
};

export const subsetsumIRs: IR[] = [subsetsumImperativeIR];
