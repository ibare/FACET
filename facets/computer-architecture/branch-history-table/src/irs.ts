/**
 * branch-history-table 의 코드 패널 IR.
 *
 * 진입 `countMisses(outcomes, historyBits, table)` 는 한 판의 틀림 수를 돌려준다.
 * IR 은 배열을 만들 수 없으므로 표 칸은 부르는 쪽이 `table`(길이 = 2^사다리 끝)로 건네고,
 * 함수가 앞 `size` 칸을 2 로 채운다. 비트 연산이 없어 칸 수는 곱셈 반복으로, 이력은
 * `(hist * 2 + taken) % size` 로 민다.
 *
 * `hitPercent(misses, total)` 은 계기 `hit-percent` 와 같은 반올림 식이다.
 *
 * phase 어휘 (algorithm.ts 와 같다 — C3): fill · lookup · update · shift · score
 */

import type { IR, IRExpr, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '-' | '*' | '//' | '%' | '>=' | '<' | '>' | '==' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op: o,
  l,
  r,
});

export const branchHistoryTableImperativeIR: IR = {
  id: 'branch-history-table-imperative',
  algorithm: 'branchHistoryTable',
  paradigm: 'imperative',
  functions: [
    {
      name: 'countMisses',
      params: [
        { name: 'outcomes', type: INT_LIST },
        { name: 'historyBits', type: INT },
        { name: 'table', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'size', type: INT, init: n(1), phase: 'fill' },
        {
          kind: 'for-range',
          var: 'b',
          from: n(0),
          to: v('historyBits'),
          inclusive: false,
          phase: 'fill',
          body: [{ kind: 'assign', target: v('size'), expr: op('*', v('size'), n(2)), phase: 'fill' }],
        },
        {
          kind: 'for-range',
          var: 'c',
          from: n(0),
          to: v('size'),
          inclusive: false,
          phase: 'fill',
          body: [{ kind: 'assign', target: at('table', v('c')), expr: n(2), phase: 'fill' }],
        },
        { kind: 'var', name: 'hist', type: INT, init: n(0), phase: 'fill' },
        { kind: 'var', name: 'misses', type: INT, init: n(0), phase: 'fill' },
        {
          kind: 'for-range',
          var: 'step',
          from: n(0),
          to: { kind: 'len', of: v('outcomes') },
          inclusive: false,
          phase: 'lookup',
          body: [
            { kind: 'var', name: 'taken', type: INT, init: at('outcomes', v('step')), phase: 'lookup' },
            { kind: 'var', name: 'guess', type: INT, init: n(0), phase: 'lookup' },
            {
              kind: 'if',
              cond: op('>=', at('table', v('hist')), n(2)),
              phase: 'lookup',
              then: [{ kind: 'assign', target: v('guess'), expr: n(1), phase: 'lookup' }],
            },
            {
              kind: 'if',
              cond: op('!=', v('guess'), v('taken')),
              phase: 'update',
              then: [{ kind: 'assign', target: v('misses'), expr: op('+', v('misses'), n(1)), phase: 'update' }],
            },
            {
              kind: 'if',
              cond: op('==', v('taken'), n(1)),
              phase: 'update',
              then: [
                {
                  kind: 'if',
                  cond: op('<', at('table', v('hist')), n(3)),
                  phase: 'update',
                  then: [
                    {
                      kind: 'assign',
                      target: at('table', v('hist')),
                      expr: op('+', at('table', v('hist')), n(1)),
                      phase: 'update',
                    },
                  ],
                },
              ],
              else: [
                {
                  kind: 'if',
                  cond: op('>', at('table', v('hist')), n(0)),
                  phase: 'update',
                  then: [
                    {
                      kind: 'assign',
                      target: at('table', v('hist')),
                      expr: op('-', at('table', v('hist')), n(1)),
                      phase: 'update',
                    },
                  ],
                },
              ],
            },
            {
              kind: 'assign',
              target: v('hist'),
              expr: op('%', op('+', op('*', v('hist'), n(2)), v('taken')), v('size')),
              phase: 'shift',
            },
          ],
        },
        { kind: 'return', expr: v('misses'), phase: 'score' },
      ],
    },
    {
      name: 'hitPercent',
      params: [
        { name: 'misses', type: INT },
        { name: 'total', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'return',
          expr: op('//', op('+', op('*', op('-', v('total'), v('misses')), n(100)), op('//', v('total'), n(2))), v('total')),
          phase: 'score',
        },
      ],
    },
  ],
};

export const branchHistoryTableIRs: IR[] = [branchHistoryTableImperativeIR];
