/**
 * 맥락 조립 — 코드 패널 IR.
 *
 * 진입 `answerDepth(lengths, budget, order, answer, slot)` 이 담을 수를 `fitCount` 로 셈하고,
 * `slot` 버퍼(부르는 쪽이 길이 8 로 만든다)에 등수 → 자리(0 기준)를 적고, 답 조각에서 가까운
 * 끝까지의 거리를 돌려준다. 답이 안 담기면 −1 (사다리에서는 일어나지 않지만 코드 길은 둔다).
 *
 * - 담기의 `while` 은 색인 범위만 보고, 예산 견줌은 안쪽 `if` 로 둔다 — `ir-interpreter` 의
 *   `&&` 는 짧은 회로가 아니라 `lengths[n]` 을 끝 너머에서 읽는다.
 * - 정수 중간값 최대는 85 (예산 끝값 · 낱말 합 83). 32 비트에 넉넉하다.
 * - `%` 의 피연산자는 음수가 아니다 (k ≥ 0).
 *
 * phase 어휘: 'fill' | 'overflow' | 'place' | 'depth' (algorithm.ts 와 같다)
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const int: IRType = { kind: 'int' };
const intList: IRType = { kind: 'list', of: int };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n_ = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '%' | '<' | '>' | '>=' | '==' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const decl = (name: string, init: IRExpr, phase: string): IRStmt => ({ kind: 'var', name, type: int, init, phase });
const put = (target: IRExpr, expr: IRExpr, phase: string): IRStmt => ({ kind: 'assign', target, expr, phase });

export const contextAssemblyImperativeIR: IR = {
  id: 'context-assembly-imperative',
  algorithm: 'contextAssembly',
  paradigm: 'imperative',
  functions: [
    {
      name: 'answerDepth',
      params: [
        { name: 'lengths', type: intList },
        { name: 'budget', type: int },
        { name: 'order', type: int },
        { name: 'answer', type: int },
        { name: 'slot', type: intList },
      ],
      returnType: int,
      body: [
        decl('n', { kind: 'call', fn: 'fitCount', args: [v('lengths'), v('budget')] }, 'fill'),
        decl('front', n_(0), 'place'),
        decl('back', bin('-', v('n'), n_(1)), 'place'),
        {
          kind: 'for-range',
          var: 'k',
          from: n_(0),
          to: v('n'),
          inclusive: false,
          phase: 'place',
          body: [
            {
              kind: 'if',
              cond: bin('&&', bin('==', v('order'), n_(1)), bin('==', bin('%', v('k'), n_(2)), n_(1))),
              phase: 'place',
              then: [
                put(at('slot', v('k')), v('back'), 'place'),
                put(v('back'), bin('-', v('back'), n_(1)), 'place'),
              ],
              else: [
                put(at('slot', v('k')), v('front'), 'place'),
                put(v('front'), bin('+', v('front'), n_(1)), 'place'),
              ],
            },
          ],
        },
        {
          kind: 'if',
          cond: bin('>=', v('answer'), v('n')),
          phase: 'depth',
          then: [{ kind: 'return', expr: n_(-1), phase: 'depth' }],
        },
        decl('p', at('slot', v('answer')), 'depth'),
        {
          kind: 'return',
          expr: {
            kind: 'call',
            fn: 'min',
            args: [v('p'), bin('-', bin('-', v('n'), n_(1)), v('p'))],
          },
          phase: 'depth',
        },
      ],
    },
    {
      name: 'fitCount',
      params: [
        { name: 'lengths', type: intList },
        { name: 'budget', type: int },
      ],
      returnType: int,
      body: [
        decl('n', n_(0), 'fill'),
        decl('used', n_(0), 'fill'),
        {
          kind: 'while',
          cond: bin('<', v('n'), { kind: 'len', of: v('lengths') }),
          phase: 'fill',
          body: [
            {
              kind: 'if',
              cond: bin('>', bin('+', v('used'), at('lengths', v('n'))), v('budget')),
              phase: 'fill',
              then: [{ kind: 'break', phase: 'overflow' }],
            },
            put(v('used'), bin('+', v('used'), at('lengths', v('n'))), 'fill'),
            put(v('n'), bin('+', v('n'), n_(1)), 'fill'),
          ],
        },
        { kind: 'return', expr: v('n'), phase: 'fill' },
      ],
    },
  ],
};

export const contextAssemblyIRs: IR[] = [contextAssemblyImperativeIR];
