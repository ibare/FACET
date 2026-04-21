/**
 * 0/1 Knapsack 학습용 IR — 분기 한정.
 * (실제 코드는 더 길지만, 학습용으로 핵심 로직만 IR로 표현)
 *
 *   def dfs(values, weights, cap, i, value, weight, best):
 *       ub = value                                 # phase: bound   (상계 계산 단순화)
 *       if ub <= best: return best                 # phase: prune
 *       if i == len(values):
 *           if value > best: return value          # phase: update
 *           return best
 *       item = values[i]                           # phase: visit
 *       if weight + weights[i] <= cap:
 *           best = dfs(values, weights, cap, i+1, value + values[i], weight + weights[i], best)  # phase: include
 *       best = dfs(values, weights, cap, i+1, value, weight, best)                               # phase: exclude
 *       return best
 *
 *   def knapsack(values, weights, cap):
 *       return dfs(values, weights, cap, 0, 0, 0, 0)
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

export const knapsackImperativeIR: IR = {
  id: 'knapsack-imperative',
  algorithm: 'knapsack',
  paradigm: 'imperative',
  functions: [
    {
      name: 'dfs',
      params: [
        { name: 'values', type: tIntList },
        { name: 'weights', type: tIntList },
        { name: 'cap', type: tInt },
        { name: 'i', type: tInt },
        { name: 'value', type: tInt },
        { name: 'weight', type: tInt },
        { name: 'best', type: tInt },
      ],
      returnType: tInt,
      body: [
        {
          kind: 'var',
          name: 'ub',
          type: tInt,
          phase: 'bound',
          init: v('value'),
        },
        {
          kind: 'if',
          phase: 'prune',
          cond: bin('<=', v('ub'), v('best')),
          then: [{ kind: 'return', expr: v('best') }],
        },
        {
          kind: 'if',
          cond: bin('==', v('i'), len(v('values'))),
          then: [
            {
              kind: 'if',
              cond: bin('>', v('value'), v('best')),
              then: [{ kind: 'return', phase: 'update', expr: v('value') }],
            },
            { kind: 'return', expr: v('best') },
          ],
        },
        {
          kind: 'var',
          name: 'item',
          type: tInt,
          phase: 'visit',
          init: idx(v('values'), v('i')),
        },
        {
          kind: 'if',
          phase: 'include',
          cond: bin('<=', bin('+', v('weight'), idx(v('weights'), v('i'))), v('cap')),
          then: [
            {
              kind: 'assign',
              target: v('best'),
              expr: call('dfs', [
                v('values'),
                v('weights'),
                v('cap'),
                bin('+', v('i'), lit(1)),
                bin('+', v('value'), idx(v('values'), v('i'))),
                bin('+', v('weight'), idx(v('weights'), v('i'))),
                v('best'),
              ]),
            },
          ],
        },
        {
          kind: 'assign',
          phase: 'exclude',
          target: v('best'),
          expr: call('dfs', [
            v('values'),
            v('weights'),
            v('cap'),
            bin('+', v('i'), lit(1)),
            v('value'),
            v('weight'),
            v('best'),
          ]),
        },
        { kind: 'return', expr: v('best') },
      ] satisfies IRStmt[],
    },
    {
      name: 'knapsack',
      params: [
        { name: 'values', type: tIntList },
        { name: 'weights', type: tIntList },
        { name: 'cap', type: tInt },
      ],
      returnType: tInt,
      body: [
        {
          kind: 'return',
          expr: call('dfs', [
            v('values'),
            v('weights'),
            v('cap'),
            lit(0),
            lit(0),
            lit(0),
            lit(0),
          ]),
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const knapsackIRs: IR[] = [knapsackImperativeIR];
