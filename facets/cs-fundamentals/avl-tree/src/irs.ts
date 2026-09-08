/**
 * avl-tree 학습용 IR — 되돌아오며 재고 고치는 대목.
 *
 * phase 어휘는 `algorithm.ts` 와 글자 단위로 같아야 한다 (C3):
 *   'measure' | 'case-ll' | 'case-lr' | 'case-rr' | 'case-rl' | 'balanced'
 *
 * 네 경우가 여덟 줄에 다 들어간다 — 이것이 AVL 의 전부다. 기운 방향과 그
 * 자식이 기운 방향이 **같으면 한 번**, 어긋나면 안쪽을 먼저 돌린다.
 *
 * 자리 조작은 이름 붙인 call 로 둔다 (IR 에 노드 타입이 없다) — 다만 균형
 * 인수를 셈하는 `height(left) - height(right)` 는 숨기지 않는다. 그 뺄셈이
 * 이 자료구조의 판단 기준 자체라, call 뒤로 감추면 코드 패널이 할 말을 잃는다.
 */

import type { IR, IRExpr, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** height(left(n)) − height(right(n)) — 이 뺄셈이 판단 기준이다. */
const balanceOf = (n: IRExpr): IRExpr =>
  bin('-', call('height', [call('left', [n])]), call('height', [call('right', [n])]));

export const avlRebalanceIR: IR = {
  id: 'avl-rebalance',
  algorithm: 'avlTree',
  paradigm: 'imperative',
  functions: [
    {
      name: 'avl_rebalance',
      params: [{ name: 'n', type: tInt }],
      returnType: tInt,
      body: [
        { kind: 'expr-stmt', phase: 'measure', expr: call('refresh_height', [v('n')]) },
        { kind: 'var', name: 'bf', type: tInt, init: balanceOf(v('n')) },
        {
          kind: 'if',
          cond: bin('>', v('bf'), lit(1)),
          then: [
            {
              kind: 'if',
              phase: 'case-lr',
              cond: bin('<', balanceOf(call('left', [v('n')])), lit(0)),
              then: [
                {
                  kind: 'expr-stmt',
                  expr: call('set_left', [v('n'), call('rotate_left', [call('left', [v('n')])])]),
                },
              ],
            },
            { kind: 'return', phase: 'case-ll', expr: call('rotate_right', [v('n')]) },
          ],
        },
        {
          kind: 'if',
          cond: bin('<', v('bf'), lit(-1)),
          then: [
            {
              kind: 'if',
              phase: 'case-rl',
              cond: bin('>', balanceOf(call('right', [v('n')])), lit(0)),
              then: [
                {
                  kind: 'expr-stmt',
                  expr: call('set_right', [v('n'), call('rotate_right', [call('right', [v('n')])])]),
                },
              ],
            },
            { kind: 'return', phase: 'case-rr', expr: call('rotate_left', [v('n')]) },
          ],
        },
        { kind: 'return', phase: 'balanced', expr: v('n') },
      ],
    },
  ],
};

export const avlTreeIRs: IR[] = [avlRebalanceIR];
