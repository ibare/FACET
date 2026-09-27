/**
 * combinatorics IR — 크기 k 부분집합의 수를 "뺀 쪽 + 넣은 쪽" 갱신으로 센다. 진입 함수 하나.
 *
 * row 는 부르는 쪽이 길이 7(= elements.length + 1)로 만든다. k > n 칸은 비운 0 이 그대로 남아 0 을 돌려준다 —
 * 분기를 두지 않는다. 중간값 최대 20 (n 6 · k 3) — 32 비트와 멀다. `%` · 나눗셈 없음.
 * for-range 는 오름차순뿐이라 큰 쪽부터 도는 안쪽 루프는 while 로 편다.
 *
 * phase 어휘 (algorithm.ts 와 정확히 같다): start · split · pick
 */
import type { IR, IRExpr } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });

export const combinatoricsImperativeIR: IR = {
  id: 'combinatorics-imperative',
  algorithm: 'combinatorics',
  paradigm: 'imperative',
  functions: [
    {
      name: 'countSize',
      params: [
        { name: 'n', type: INT },
        { name: 'k', type: INT },
        { name: 'row', type: { kind: 'list', of: INT } },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'row[i] = number of subsets of size i; start from the empty set alone' },
        {
          kind: 'for-range',
          var: 'c',
          from: lit(0),
          to: { kind: 'len', of: v('row') },
          inclusive: false,
          phase: 'start',
          body: [{ kind: 'assign', target: at('row', v('c')), expr: lit(0), phase: 'start' }],
        },
        { kind: 'assign', target: at('row', lit(0)), expr: lit(1), phase: 'start' },
        {
          kind: 'for-range',
          var: 'j',
          from: lit(1),
          to: v('n'),
          inclusive: true,
          phase: 'split',
          body: [
            { kind: 'comment', text: 'keep = subsets without the new element (row[i]); move = with it, one size up (row[i-1])' },
            { kind: 'comment', text: 'go from the top down so row[i-1] is still the old count when it is read' },
            { kind: 'var', name: 'i', type: INT, init: v('j'), phase: 'split' },
            {
              kind: 'while',
              cond: { kind: 'binop', op: '>=', l: v('i'), r: lit(1) },
              phase: 'split',
              body: [
                {
                  kind: 'assign',
                  target: at('row', v('i')),
                  expr: {
                    kind: 'binop',
                    op: '+',
                    l: at('row', v('i')),
                    r: at('row', { kind: 'binop', op: '-', l: v('i'), r: lit(1) }),
                  },
                  phase: 'split',
                },
                { kind: 'assign', target: v('i'), expr: { kind: 'binop', op: '-', l: v('i'), r: lit(1) }, phase: 'split' },
              ],
            },
          ],
        },
        { kind: 'return', expr: at('row', v('k')), phase: 'pick' },
      ],
    },
  ],
};

export const combinatoricsIRs: IR[] = [combinatoricsImperativeIR];
