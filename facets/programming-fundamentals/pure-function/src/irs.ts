/**
 * 순수와 차례의 IR — 같은 셈 `change` 의 두 벌(고치기 `changeInPlace` · 사본에 쓰기 `changeCopy`)과
 * 차례를 도는 `runCalls`.
 *
 * - 부르기 셋은 한 함수의 **인자 셋**(slots · muls · adds 의 같은 색인)이다. 부르기 번호로 가르는 `if` 사슬을
 *   두지 않는다. 갈래는 손잡이 `copyMode` 하나뿐이다.
 * - IR 은 목록을 짓지 못한다 — "새로 만들기" 의 사본은 부르는 쪽이 만든 버퍼 `fresh` 에 베낀다. 부를 때마다
 *   통째로 덮어써서 앞 부르기의 흔적이 남지 않는다.
 * - 지역 목록 대입을 쓰지 않는다 (cpp 에서만 복사가 되어 뜻이 갈린다). 목록은 늘 매개변수로.
 * - `out` 은 C# 예약어라 버퍼 이름이 `fresh`.
 *
 * phase 어휘 (algorithm.ts 와 같다): call · copy · write-in-place · write-copy · sum · result
 */
import type { IR } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const BOOL = { kind: 'bool' } as const;
const LIST = { kind: 'list', of: { kind: 'int' } } as const;

const v = (name: string) => ({ kind: 'var', name }) as const;
const lit = (value: number) => ({ kind: 'lit', value }) as const;
const at = (arr: string, idx: ReturnType<typeof v> | ReturnType<typeof lit>) =>
  ({ kind: 'index', arr: v(arr), idx }) as const;

export const pureFunctionImperativeIR: IR = {
  id: 'pure-function-imperative',
  algorithm: 'pureFunction',
  paradigm: 'imperative',
  functions: [
    {
      name: 'runCalls',
      params: [
        { name: 'xs', type: LIST },
        { name: 'fresh', type: LIST },
        { name: 'order', type: LIST },
        { name: 'slots', type: LIST },
        { name: 'muls', type: LIST },
        { name: 'adds', type: LIST },
        { name: 'copyMode', type: BOOL },
        { name: 'results', type: LIST },
      ],
      returnType: INT,
      body: [
        {
          kind: 'for-range',
          var: 'k',
          from: lit(0),
          to: { kind: 'len', of: v('order') },
          inclusive: false,
          body: [
            { kind: 'var', name: 'op', type: INT, init: at('order', v('k')), phase: 'call' },
            {
              kind: 'if',
              cond: v('copyMode'),
              then: [
                {
                  kind: 'assign',
                  target: at('results', v('op')),
                  expr: {
                    kind: 'call',
                    fn: 'changeCopy',
                    args: [
                      v('xs'),
                      v('fresh'),
                      at('slots', v('op')),
                      at('muls', v('op')),
                      at('adds', v('op')),
                    ],
                  },
                },
              ],
              else: [
                {
                  kind: 'assign',
                  target: at('results', v('op')),
                  expr: {
                    kind: 'call',
                    fn: 'changeInPlace',
                    args: [v('xs'), at('slots', v('op')), at('muls', v('op')), at('adds', v('op'))],
                  },
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: { kind: 'call', fn: 'total', args: [v('xs')] }, phase: 'result' },
      ],
    },
    {
      name: 'changeInPlace',
      params: [
        { name: 'xs', type: LIST },
        { name: 'slot', type: INT },
        { name: 'mul', type: INT },
        { name: 'add', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'assign',
          target: at('xs', v('slot')),
          expr: {
            kind: 'binop',
            op: '+',
            l: { kind: 'binop', op: '*', l: at('xs', v('slot')), r: v('mul') },
            r: v('add'),
          },
          phase: 'write-in-place',
        },
        { kind: 'return', expr: { kind: 'call', fn: 'total', args: [v('xs')] } },
      ],
    },
    {
      name: 'changeCopy',
      params: [
        { name: 'xs', type: LIST },
        { name: 'fresh', type: LIST },
        { name: 'slot', type: INT },
        { name: 'mul', type: INT },
        { name: 'add', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: { kind: 'len', of: v('xs') },
          inclusive: false,
          body: [
            { kind: 'assign', target: at('fresh', v('i')), expr: at('xs', v('i')), phase: 'copy' },
          ],
        },
        {
          kind: 'assign',
          target: at('fresh', v('slot')),
          expr: {
            kind: 'binop',
            op: '+',
            l: { kind: 'binop', op: '*', l: at('fresh', v('slot')), r: v('mul') },
            r: v('add'),
          },
          phase: 'write-copy',
        },
        { kind: 'return', expr: { kind: 'call', fn: 'total', args: [v('fresh')] } },
      ],
    },
    {
      name: 'total',
      params: [{ name: 'xs', type: LIST }],
      returnType: INT,
      body: [
        { kind: 'var', name: 'acc', type: INT, init: lit(0) },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: { kind: 'len', of: v('xs') },
          inclusive: false,
          body: [
            {
              kind: 'assign',
              target: v('acc'),
              expr: { kind: 'binop', op: '+', l: v('acc'), r: at('xs', v('i')) },
              phase: 'sum',
            },
          ],
        },
        { kind: 'return', expr: v('acc') },
      ],
    },
  ],
};

export const pureFunctionIRs: IR[] = [pureFunctionImperativeIR];
