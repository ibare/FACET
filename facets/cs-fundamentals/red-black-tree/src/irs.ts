/**
 * red-black-tree 학습용 IR — 넣은 뒤의 수선.
 *
 * phase 어휘는 `algorithm.ts` 와 글자 단위로 같아야 한다 (C3):
 *   'check' | 'uncle-red' | 'triangle' | 'line' | 'root-black'
 *
 * 세 경우가 열 줄쯤에 다 들어간다. 요점은 **while** 이다 — `uncle-red` 만
 * `z` 를 위로 옮기고 루프를 돈다. 색칠은 문제를 위로 밀고 회전은 끝낸다는
 * 짜임이 그 한 줄에 있다.
 *
 * 자리 조작은 이름 붙인 call 로 둔다 (IR 에 노드 타입이 없다).
 */

import type { IR, IRExpr, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | string): IRExpr => ({ kind: 'lit', value });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

const isRed = (n: IRExpr): IRExpr => bin('==', call('color', [n]), lit('red'));

export const rbInsertFixupIR: IR = {
  id: 'rb-insert-fixup',
  algorithm: 'redBlackTree',
  paradigm: 'imperative',
  functions: [
    {
      name: 'rb_insert_fixup',
      params: [{ name: 'z', type: tInt }],
      returnType: { kind: 'void' },
      body: [
        {
          kind: 'while',
          phase: 'check',
          cond: isRed(call('parent', [v('z')])),
          body: [
            { kind: 'var', name: 'p', type: tInt, init: call('parent', [v('z')]) },
            { kind: 'var', name: 'g', type: tInt, init: call('parent', [v('p')]) },
            { kind: 'var', name: 'u', type: tInt, init: call('sibling', [v('p')]) },
            {
              kind: 'if',
              phase: 'uncle-red',
              cond: isRed(v('u')),
              then: [
                { kind: 'expr-stmt', expr: call('set_color', [v('p'), lit('black')]) },
                { kind: 'expr-stmt', expr: call('set_color', [v('u'), lit('black')]) },
                { kind: 'expr-stmt', expr: call('set_color', [v('g'), lit('red')]) },
                // 고친 것이 아니라 위로 민 것이다. 그래서 루프를 다시 돈다.
                { kind: 'assign', target: v('z'), expr: v('g') },
                { kind: 'continue' },
              ],
            },
            {
              kind: 'if',
              phase: 'triangle',
              cond: bin('!=', call('side', [v('z')]), call('side', [v('p')])),
              then: [
                { kind: 'expr-stmt', expr: call('rotate_toward', [v('p'), call('side', [v('p')])]) },
                { kind: 'assign', target: v('z'), expr: v('p') },
              ],
            },
            { kind: 'expr-stmt', phase: 'line', expr: call('set_color', [call('parent', [v('z')]), lit('black')]) },
            { kind: 'expr-stmt', expr: call('set_color', [v('g'), lit('red')]) },
            { kind: 'expr-stmt', expr: call('rotate_away', [v('g'), call('side', [v('z')])]) },
            { kind: 'break' },
          ],
        },
        { kind: 'expr-stmt', phase: 'root-black', expr: call('set_color', [call('root', []), lit('black')]) },
      ],
    },
  ],
};

export const redBlackTreeIRs: IR[] = [rbInsertFixupIR];
