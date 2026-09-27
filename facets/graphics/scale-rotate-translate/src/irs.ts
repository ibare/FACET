/**
 * 변환의 합성 IR — 인수 행렬을 걸리는 차례로 왼쪽에 곱해 합성 행렬을 만들고(compose),
 * 그 한 행렬을 처음 도형의 꼭짓점마다 곱한다(apply).
 *
 * 회전을 90° 로 묶어 3×3 이 모두 정수라 IR 을 둔다 — 삼각함수가 없다. 배열은 IR 이 만들 수
 * 없으니 버퍼(m 9 · tmp 9 · res 3 · arrX/arrY 꼭짓점 수)는 부르는 쪽이 짓는다. `factors` 는
 * 인수 행렬을 걸리는 차례로 9 칸씩 이어 붙인 것이다. 셋째 칸이 1 이 아니면 −1 을 돌려준다
 * (TS 쪽은 던진다). `//` 는 음이 아닌 정수끼리만 쓴다.
 *
 * phase 어휘: compose · apply (algorithm.ts 와 정확히 같다)
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST_INT: IRType = { kind: 'list', of: INT };
const VOID: IRType = { kind: 'void' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const add = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '+', l, r });
const mul = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '*', l, r });
const cell = (row: IRExpr, col: IRExpr): IRExpr => add(mul(row, n(3)), col);

const identity: IRStmt[] = [
  { kind: 'comment', text: 'm starts as the identity matrix (row-major, 9 cells)' },
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: n(9),
    inclusive: false,
    body: [{ kind: 'assign', target: at('m', v('i')), expr: n(0) }],
  },
  { kind: 'assign', target: at('m', n(0)), expr: n(1) },
  { kind: 'assign', target: at('m', n(4)), expr: n(1) },
  { kind: 'assign', target: at('m', n(8)), expr: n(1) },
];

export const scaleRotateTranslateImperativeIR: IR = {
  id: 'scale-rotate-translate-imperative',
  algorithm: 'scaleRotateTranslate',
  paradigm: 'imperative',
  functions: [
    {
      name: 'arrive',
      params: [
        { name: 'factors', type: LIST_INT },
        { name: 'xs', type: LIST_INT },
        { name: 'ys', type: LIST_INT },
        { name: 'm', type: LIST_INT },
        { name: 'tmp', type: LIST_INT },
        { name: 'res', type: LIST_INT },
        { name: 'arrX', type: LIST_INT },
        { name: 'arrY', type: LIST_INT },
      ],
      returnType: INT,
      body: [
        ...identity,
        {
          kind: 'var',
          name: 'factorCount',
          type: INT,
          init: { kind: 'binop', op: '//', l: { kind: 'len', of: v('factors') }, r: n(9) },
        },
        { kind: 'comment', text: 'the later factor multiplies on the left: m = F * m' },
        {
          kind: 'for-range',
          var: 'k',
          from: n(0),
          to: v('factorCount'),
          inclusive: false,
          phase: 'compose',
          body: [
            {
              kind: 'expr-stmt',
              phase: 'compose',
              expr: { kind: 'call', fn: 'compose', args: [v('factors'), mul(v('k'), n(9)), v('m'), v('tmp')] },
            },
          ],
        },
        { kind: 'comment', text: 'one product of the composite matrix per vertex' },
        {
          kind: 'for-range',
          var: 'p',
          from: n(0),
          to: { kind: 'len', of: v('xs') },
          inclusive: false,
          phase: 'apply',
          body: [
            {
              kind: 'expr-stmt',
              phase: 'apply',
              expr: {
                kind: 'call',
                fn: 'applyPoint',
                args: [v('m'), at('xs', v('p')), at('ys', v('p')), v('res')],
              },
            },
            {
              kind: 'if',
              phase: 'apply',
              cond: { kind: 'binop', op: '!=', l: at('res', n(2)), r: n(1) },
              then: [{ kind: 'return', expr: { kind: 'unop', op: '-', x: n(1) } }],
            },
            { kind: 'assign', phase: 'apply', target: at('arrX', v('p')), expr: at('res', n(0)) },
            { kind: 'assign', phase: 'apply', target: at('arrY', v('p')), expr: at('res', n(1)) },
          ],
        },
        { kind: 'return', expr: { kind: 'len', of: v('xs') } },
      ],
    },
    {
      name: 'compose',
      params: [
        { name: 'factors', type: LIST_INT },
        { name: 'start', type: INT },
        { name: 'm', type: LIST_INT },
        { name: 'tmp', type: LIST_INT },
      ],
      returnType: VOID,
      body: [
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: n(3),
          inclusive: false,
          phase: 'compose',
          body: [
            {
              kind: 'for-range',
              var: 'j',
              from: n(0),
              to: n(3),
              inclusive: false,
              phase: 'compose',
              body: [
                { kind: 'var', name: 'acc', type: INT, init: n(0), phase: 'compose' },
                {
                  kind: 'for-range',
                  var: 'k',
                  from: n(0),
                  to: n(3),
                  inclusive: false,
                  phase: 'compose',
                  body: [
                    {
                      kind: 'assign',
                      phase: 'compose',
                      target: v('acc'),
                      expr: add(
                        v('acc'),
                        mul(
                          at('factors', add(v('start'), cell(v('i'), v('k')))),
                          at('m', cell(v('k'), v('j'))),
                        ),
                      ),
                    },
                  ],
                },
                { kind: 'assign', phase: 'compose', target: at('tmp', cell(v('i'), v('j'))), expr: v('acc') },
              ],
            },
          ],
        },
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: n(9),
          inclusive: false,
          phase: 'compose',
          body: [{ kind: 'assign', phase: 'compose', target: at('m', v('i')), expr: at('tmp', v('i')) }],
        },
      ],
    },
    {
      name: 'applyPoint',
      params: [
        { name: 'm', type: LIST_INT },
        { name: 'x', type: INT },
        { name: 'y', type: INT },
        { name: 'res', type: LIST_INT },
      ],
      returnType: VOID,
      body: [
        {
          kind: 'for-range',
          var: 'r',
          from: n(0),
          to: n(3),
          inclusive: false,
          phase: 'apply',
          body: [
            {
              kind: 'assign',
              phase: 'apply',
              target: at('res', v('r')),
              expr: add(
                add(mul(at('m', cell(v('r'), n(0))), v('x')), mul(at('m', cell(v('r'), n(1))), v('y'))),
                at('m', cell(v('r'), n(2))),
              ),
            },
          ],
        },
      ],
    },
  ],
};

export const scaleRotateTranslateIRs: IR[] = [scaleRotateTranslateImperativeIR];
