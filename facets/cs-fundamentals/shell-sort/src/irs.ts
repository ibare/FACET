/**
 * 셸 정렬 학습용 IR — 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def shell_sort(arr):
 *       gap = len(arr) // 2                            # phase: set-gap
 *       while gap > 0:                                 # phase: set-gap
 *           for i in range(gap, len(arr)):
 *               temp = arr[i]                          # phase: pick-value
 *               j = i                                  # phase: pick-value
 *               while j >= gap and arr[j - gap] > temp: # phase: compare
 *                   arr[j] = arr[j - gap]              # phase: shift
 *                   j = j - gap                        # phase: shift
 *               arr[j] = temp                          # phase: place
 *           gap = gap // 2                             # phase: gap-end
 *
 * **삽입 정렬과 같은 골격이고 `1` 이 `gap` 으로 바뀐 것뿐이다.** 안쪽 while 의
 * `arr[j - gap]` 과 `j = j - gap` 이 그 자리다. `gap` 을 `1` 로 바꿔 읽으면
 * 그대로 보통의 삽입 정렬이 된다 — 코드 패널이 그것을 보이라고 이 골격을 골랐다.
 *
 * **이름 붙인 호출이 하나도 없다.** 간격 정렬이 쓰는 것은 배열 인덱스 셈
 * (`j - gap`) 과 정수 반감 (`gap // 2`) 뿐이라 전부 펼쳐 쓸 수 있다. 감싸면
 * 코드 패널이 할 말을 잃는다.
 *
 * `//` 는 정수 나눗셈이다 (`ir.ts` 의 `IRBinOp` 주석). 파이썬에서 `/` 로 적으면
 * `gap` 이 실수가 되어 `arr[j - gap]` 이 터진다. 이 알고리즘은 자리 번호를
 * 반으로 접는 것이 골자라 그 구분이 반드시 필요하다.
 *
 * `gap` 의 첫 값이 `len(arr) // 2` 이므로 값 일곱에서는 3 → 1 로 내려온다.
 * facet 이 쓰는 간격 수열이 코드에서 그대로 나오는 것이지 따로 박아 둔 것이
 * 아니다.
 *
 * phase 어휘 (C3) — `algorithm.ts` 의 `emit('phase', …)` 와 **글자 단위로** 같다:
 *
 *   'set-gap' | 'pick-value' | 'compare' | 'shift' | 'place' | 'gap-end'
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

/** `j - gap` — 이 알고리즘에서 가장 자주 나오는 식. 간격 정렬의 전부다. */
const jMinusGap: IRExpr = bin('-', v('j'), v('gap'));

export const shellSortGapIR: IR = {
  id: 'shellsort-gap',
  algorithm: 'shellSort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'shell_sort',
      params: [{ name: 'arr', type: tIntList }],
      returnType: tVoid,
      body: [
        {
          kind: 'var',
          phase: 'set-gap',
          name: 'gap',
          type: tInt,
          init: bin('//', len(v('arr')), lit(2)),
        },
        {
          kind: 'while',
          phase: 'set-gap',
          cond: bin('>', v('gap'), lit(0)),
          body: [
            {
              kind: 'for-range',
              var: 'i',
              from: v('gap'),
              to: len(v('arr')),
              inclusive: false,
              body: [
                {
                  kind: 'var',
                  phase: 'pick-value',
                  name: 'temp',
                  type: tInt,
                  init: idx(v('arr'), v('i')),
                },
                { kind: 'var', phase: 'pick-value', name: 'j', type: tInt, init: v('i') },
                {
                  kind: 'while',
                  phase: 'compare',
                  cond: bin(
                    '&&',
                    bin('>=', v('j'), v('gap')),
                    bin('>', idx(v('arr'), jMinusGap), v('temp')),
                  ),
                  body: [
                    {
                      kind: 'assign',
                      phase: 'shift',
                      target: idx(v('arr'), v('j')),
                      expr: idx(v('arr'), jMinusGap),
                    },
                    { kind: 'assign', phase: 'shift', target: v('j'), expr: jMinusGap },
                  ],
                },
                {
                  kind: 'assign',
                  phase: 'place',
                  target: idx(v('arr'), v('j')),
                  expr: v('temp'),
                },
              ],
            },
            {
              kind: 'assign',
              phase: 'gap-end',
              target: v('gap'),
              expr: bin('//', v('gap'), lit(2)),
            },
          ],
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const shellSortIRs: IR[] = [shellSortGapIR];
