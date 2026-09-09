/**
 * 힙 정렬 (제자리) 학습용 IR — 함수 둘.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def heap_sort(arr):
 *       n = len(arr)
 *       i = n // 2 - 1
 *       while i >= 0:
 *           sift_down(arr, n, i)              # phase: build-heap
 *           i = i - 1
 *       size = n
 *       while size > 1:
 *           swap arr[0], arr[size - 1]        # phase: swap-top-end
 *           size = size - 1                   # phase: shrink-heap
 *           sift_down(arr, size, 0)           # phase: sift-root
 *
 *   def sift_down(arr, size, i):
 *       while 2 * i + 1 < size:
 *           big = 2 * i + 1
 *           r = 2 * i + 2
 *           if r < size and arr[r] > arr[big]:  # phase: compare-children
 *               big = r
 *           if arr[i] >= arr[big]:              # phase: compare-children
 *               break
 *           swap arr[i], arr[big]               # phase: move-down
 *           i = big
 *       return                                  # phase: settle-down
 *
 * **`2 * i + 1` 과 `2 * i + 2` 를 펼쳐 쓴다.** `left(i)` / `right(i)` 로 감싸면
 * 이 자료구조의 전부가 사라진다 — 배열 한 줄이 트리로 읽히는 근거가 그 셈이기
 * 때문이다. `heap-sift` IR 이 같은 기준을 주석에 적어 두었다.
 *
 * `n // 2 - 1` 도 마찬가지다. 자식을 가진 마지막 자리가 어디인지가 힙 만들기
 * 루프의 시작점이고, 그 셈이 보이지 않으면 "왜 뒤에서부터인가" 를 말할 수 없다.
 * `//` 는 정수 나눗셈이라 파이썬에서도 자리 번호가 실수가 되지 않는다.
 *
 * **이름 붙인 호출은 `sift_down` 하나뿐이고, 그것은 추상화가 아니라 이 IR 이
 * 실제로 정의하는 보조 함수다.** 배열 만들기 · 끝에 붙이기 같은 언어별 어휘가
 * 필요 없어 `call` 로 감쌀 것이 남지 않았다.
 *
 * `sift_down` 이 `ir:heap-sift` 의 `heap_extract` 안쪽과 겹치는데 그것이 맞다 —
 * 힙 정렬의 코드에 `sift_down` 이 없으면 불완전하다. 다만 이쪽은 `heap_sort` 가
 * entry point 이고 힙을 만드는 루프와 힙을 줄이는 루프를 함께 들고 있어 다른
 * 물건이다.
 *
 * phase 어휘는 `algorithm.ts` 의 `emit('phase', …)` 와 **글자 단위로** 같아야
 * 한다 (C3):
 *
 *   'build-heap' | 'compare-children' | 'move-down' | 'settle-down' |
 *   'swap-top-end' | 'shrink-heap' | 'sift-root'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tVoid: IRType = { kind: 'void' };
const tIntList: IRType = { kind: 'list', of: tInt };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** 2i + 1 — 왼쪽 자식 자리. 감싸지 않고 매번 펼쳐 쓴다. */
const leftOf = (i: IRExpr): IRExpr => bin('+', bin('*', lit(2), i), lit(1));
/** 2i + 2 — 오른쪽 자식 자리. */
const rightOf = (i: IRExpr): IRExpr => bin('+', bin('*', lit(2), i), lit(2));

export const heapSortInPlaceIR: IR = {
  id: 'heapsort-inplace',
  algorithm: 'heapSort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'heap_sort',
      params: [{ name: 'arr', type: tIntList }],
      returnType: tVoid,
      body: [
        { kind: 'var', name: 'n', type: tInt, init: len(v('arr')) },
        {
          kind: 'var',
          name: 'i',
          type: tInt,
          init: bin('-', bin('//', v('n'), lit(2)), lit(1)),
        },
        {
          kind: 'while',
          cond: bin('>=', v('i'), lit(0)),
          body: [
            {
              kind: 'expr-stmt',
              phase: 'build-heap',
              expr: call('sift_down', [v('arr'), v('n'), v('i')]),
            },
            { kind: 'assign', target: v('i'), expr: bin('-', v('i'), lit(1)) },
          ],
        },
        { kind: 'var', name: 'size', type: tInt, init: v('n') },
        {
          kind: 'while',
          cond: bin('>', v('size'), lit(1)),
          body: [
            {
              kind: 'swap',
              phase: 'swap-top-end',
              a: idx(v('arr'), lit(0)),
              b: idx(v('arr'), bin('-', v('size'), lit(1))),
            },
            {
              kind: 'assign',
              phase: 'shrink-heap',
              target: v('size'),
              expr: bin('-', v('size'), lit(1)),
            },
            {
              kind: 'expr-stmt',
              phase: 'sift-root',
              expr: call('sift_down', [v('arr'), v('size'), lit(0)]),
            },
          ],
        },
      ] satisfies IRStmt[],
    },
    {
      name: 'sift_down',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'size', type: tInt },
        { name: 'i', type: tInt },
      ],
      returnType: tVoid,
      body: [
        {
          kind: 'while',
          cond: bin('<', leftOf(v('i')), v('size')),
          body: [
            { kind: 'var', name: 'big', type: tInt, init: leftOf(v('i')) },
            { kind: 'var', name: 'r', type: tInt, init: rightOf(v('i')) },
            {
              kind: 'if',
              phase: 'compare-children',
              cond: bin(
                '&&',
                bin('<', v('r'), v('size')),
                bin('>', idx(v('arr'), v('r')), idx(v('arr'), v('big'))),
              ),
              then: [{ kind: 'assign', target: v('big'), expr: v('r') }],
            },
            {
              kind: 'if',
              phase: 'compare-children',
              cond: bin('>=', idx(v('arr'), v('i')), idx(v('arr'), v('big'))),
              then: [{ kind: 'break' }],
            },
            {
              kind: 'swap',
              phase: 'move-down',
              a: idx(v('arr'), v('i')),
              b: idx(v('arr'), v('big')),
            },
            { kind: 'assign', target: v('i'), expr: v('big') },
          ],
        },
        { kind: 'return', phase: 'settle-down' },
      ] satisfies IRStmt[],
    },
  ],
};

export const heapSortIRs: IR[] = [heapSortInPlaceIR];
