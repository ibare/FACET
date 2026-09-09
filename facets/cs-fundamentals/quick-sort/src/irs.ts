/**
 * 퀵 정렬 (Lomuto) 학습용 IR — 함수 둘.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def quick_sort(arr, lo, hi):
 *       if lo >= hi: return                       # phase: range-check
 *       p = partition(arr, lo, hi)                # phase: partition-call
 *       quick_sort(arr, lo, p - 1)                # phase: recurse-left
 *       quick_sort(arr, p + 1, hi)                # phase: recurse-right
 *
 *   def partition(arr, lo, hi):
 *       pivot = arr[hi]                           # phase: pick-pivot
 *       i = lo - 1                                # phase: pick-pivot
 *       for j in range(lo, hi):
 *           if arr[j] <= pivot:                   # phase: compare
 *               i = i + 1                         # phase: send-left
 *               swap arr[i], arr[j]               # phase: send-left
 *       swap arr[i + 1], arr[hi]                  # phase: place-pivot
 *       return i + 1                              # phase: place-pivot
 *
 * **이름 붙인 호출이 하나도 없다.** Lomuto 는 경계 인덱스 하나(`i`)와 훑는
 * 인덱스 하나(`j`)만 끌고 다니므로, `arr[i]` · `arr[j]` · `i + 1` 로 전부 펼쳐
 * 쓸 수 있다. 감싸면 코드 패널이 할 말을 잃는다.
 *
 * `quick_sort` 가 첫 함수 = entry point. `partition` 은 자리 번호를 돌려주는
 * 보조 함수라 반환 타입이 `int` 다.
 *
 * phase 어휘는 `algorithm.ts` 의 `emit('phase', …)` 와 **글자 단위로** 같아야
 * 한다 (C3):
 *
 *   'range-check' | 'partition-call' | 'pick-pivot' | 'compare' |
 *   'send-left' | 'place-pivot' | 'recurse-left' | 'recurse-right'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tVoid: IRType = { kind: 'void' };
const tIntList: IRType = { kind: 'list', of: tInt };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

export const quickSortLomutoIR: IR = {
  id: 'quicksort-lomuto',
  algorithm: 'quickSort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'quick_sort',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'lo', type: tInt },
        { name: 'hi', type: tInt },
      ],
      returnType: tVoid,
      body: [
        {
          kind: 'if',
          phase: 'range-check',
          cond: bin('>=', v('lo'), v('hi')),
          then: [{ kind: 'return' }],
        },
        {
          kind: 'var',
          phase: 'partition-call',
          name: 'p',
          type: tInt,
          init: call('partition', [v('arr'), v('lo'), v('hi')]),
        },
        {
          kind: 'expr-stmt',
          phase: 'recurse-left',
          expr: call('quick_sort', [v('arr'), v('lo'), bin('-', v('p'), lit(1))]),
        },
        {
          kind: 'expr-stmt',
          phase: 'recurse-right',
          expr: call('quick_sort', [v('arr'), bin('+', v('p'), lit(1)), v('hi')]),
        },
      ] satisfies IRStmt[],
    },
    {
      name: 'partition',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'lo', type: tInt },
        { name: 'hi', type: tInt },
      ],
      returnType: tInt,
      body: [
        {
          kind: 'var',
          phase: 'pick-pivot',
          name: 'pivot',
          type: tInt,
          init: idx(v('arr'), v('hi')),
        },
        {
          kind: 'var',
          phase: 'pick-pivot',
          name: 'i',
          type: tInt,
          init: bin('-', v('lo'), lit(1)),
        },
        {
          kind: 'for-range',
          var: 'j',
          from: v('lo'),
          to: v('hi'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              phase: 'compare',
              cond: bin('<=', idx(v('arr'), v('j')), v('pivot')),
              then: [
                {
                  kind: 'assign',
                  phase: 'send-left',
                  target: v('i'),
                  expr: bin('+', v('i'), lit(1)),
                },
                {
                  kind: 'swap',
                  phase: 'send-left',
                  a: idx(v('arr'), v('i')),
                  b: idx(v('arr'), v('j')),
                },
              ],
            },
          ],
        },
        {
          kind: 'swap',
          phase: 'place-pivot',
          a: idx(v('arr'), bin('+', v('i'), lit(1))),
          b: idx(v('arr'), v('hi')),
        },
        { kind: 'return', phase: 'place-pivot', expr: bin('+', v('i'), lit(1)) },
      ] satisfies IRStmt[],
    },
  ],
};

export const quickSortIRs: IR[] = [quickSortLomutoIR];
