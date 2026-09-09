/**
 * 선택 정렬 학습용 IR — 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def selection_sort(arr):
 *       n = len(arr)
 *       for i in range(0, n - 1):                 # phase: pick-seat
 *           min_idx = i                           # phase: pick-seat
 *           for j in range(i + 1, n):
 *               if arr[j] < arr[min_idx]:         # phase: compare
 *                   min_idx = j                   # phase: move-min
 *           if min_idx != i:                      # phase: settle
 *               swap arr[i], arr[min_idx]         # phase: swap
 *
 * **이름 붙인 호출이 하나도 없다.** 이 알고리즘이 끌고 다니는 것은 자리 번호
 * `i` · 훑는 자리 `j` · 최솟값 표식 `min_idx` 셋뿐이라 `arr[j] < arr[min_idx]`
 * 로 전부 펼쳐 쓸 수 있다. `swap` 과 `len` 은 IR 어휘에 이미 있다.
 *
 * 바깥 `for` 가 `n - 1` 에서 멈추는 것이 이 코드의 요점 하나다 — 앞의 여섯
 * 자리가 확정되면 마지막 하나는 저절로 제자리다.
 *
 * 맞바꿈을 `if min_idx != i` 로 감싼 것도 요점이다. 감싸지 않아도 결과는 같지만
 * 제자리 맞바꿈이 이동으로 세어져 "견줌은 많고 이동은 적다" 가 흐려진다.
 *
 * phase 어휘는 `algorithm.ts` 의 `emit('phase', …)` 와 **글자 단위로** 같아야
 * 한다 (C3):
 *
 *   'pick-seat' | 'compare' | 'move-min' | 'settle' | 'swap'
 */

import type { IR, IRBinOp, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tVoid: IRType = { kind: 'void' };
const tIntList: IRType = { kind: 'list', of: tInt };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });

export const selectionSortImperativeIR: IR = {
  id: 'selectionsort-imperative',
  algorithm: 'selectionSort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'selection_sort',
      params: [{ name: 'arr', type: tIntList }],
      returnType: tVoid,
      body: [
        { kind: 'var', name: 'n', type: tInt, init: len(v('arr')) },
        {
          kind: 'for-range',
          phase: 'pick-seat',
          var: 'i',
          from: lit(0),
          to: bin('-', v('n'), lit(1)),
          inclusive: false,
          body: [
            {
              kind: 'var',
              phase: 'pick-seat',
              name: 'min_idx',
              type: tInt,
              init: v('i'),
            },
            {
              kind: 'for-range',
              var: 'j',
              from: bin('+', v('i'), lit(1)),
              to: v('n'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  phase: 'compare',
                  cond: bin('<', idx(v('arr'), v('j')), idx(v('arr'), v('min_idx'))),
                  then: [
                    { kind: 'assign', phase: 'move-min', target: v('min_idx'), expr: v('j') },
                  ],
                },
              ],
            },
            {
              kind: 'if',
              phase: 'settle',
              cond: bin('!=', v('min_idx'), v('i')),
              then: [
                {
                  kind: 'swap',
                  phase: 'swap',
                  a: idx(v('arr'), v('i')),
                  b: idx(v('arr'), v('min_idx')),
                },
              ],
            },
          ],
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const selectionSortIRs: IR[] = [selectionSortImperativeIR];
