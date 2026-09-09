/**
 * 기수 정렬 (LSD) 학습용 IR — 함수 둘.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def radix_sort(arr):
 *       max_value = max(arr)                          # phase: scan-max
 *       exp = 1                                       # phase: scan-max
 *       while exp <= max_value:                       # phase: pick-place
 *           counting_by_digit(arr, exp)
 *           exp = exp * 10                            # phase: round-end
 *
 *   def counting_by_digit(arr, exp):
 *       n = len(arr)
 *       output = zeros(n)
 *       count = zeros(10)
 *       for i in range(0, n):
 *           d = (arr[i] // exp) % 10                  # phase: read-digit
 *           count[d] = count[d] + 1                   # phase: count-digit
 *       for d in range(1, 10):
 *           count[d] = count[d] + count[d - 1]        # phase: prefix-sum
 *       i = n - 1
 *       while i >= 0:                                 # 뒤에서부터. 이 방향이 안정성의 근거다
 *           d = (arr[i] // exp) % 10                  # phase: read-digit
 *           count[d] = count[d] - 1                   # phase: place-back
 *           output[count[d]] = arr[i]                 # phase: place-back
 *           i = i - 1
 *       for k in range(0, n):
 *           arr[k] = output[k]                        # phase: round-end
 *
 * ── 왜 이렇게 적었나
 *
 * **자릿수 뽑기를 펼쳐 썼다.** `(arr[i] // exp) % 10` 이 이 알고리즘의 전부다.
 * `digit_at(x, exp)` 로 감싸면 코드 패널이 할 말을 잃는다 — 낮은 자리부터
 * 훑는다는 것도, 자리를 옮기는 것이 `exp` 를 열 배 하는 일이라는 것도 그 한
 * 줄에 들어 있다. `'//'` 는 IR 의 정수 나눗셈이라 파이썬은 `//`, 자바·C++·C# 은
 * 정수끼리의 `/`, 자바스크립트·타입스크립트는 `Math.floor(...)` 로 갈린다.
 *
 * **뒤에서부터 훑는 것은 `while` 로 적었다.** IR 의 `for-range` 는 증가 방향만
 * 있어 내림차순을 표현하지 못한다. 감싸거나 인덱스를 뒤집어 가리는 대신
 * `i = n - 1` → `while i >= 0` → `i = i - 1` 로 그대로 적는다. 이 방향이 곧
 * 안정성의 근거이므로 코드에서 보여야 한다.
 *
 * **이름 붙인 호출은 둘뿐이다** — `max` 와 `zeros`. 배열 만들기와 최댓값 찾기는
 * 언어마다 이름이 갈리고 IR 에 그 어휘가 없다. 나머지는 전부 배열 인덱스 셈이라
 * 펼쳐 썼다.
 *
 * `radix_sort` 가 첫 함수 = entry point. `counting_by_digit` 은 한 자리로 한 번
 * 줄 세우는 보조 함수다.
 *
 * phase 어휘는 `algorithm.ts` 의 `emit('phase', …)` 와 **글자 단위로** 같아야
 * 한다 (C3):
 *
 *   'scan-max' | 'pick-place' | 'read-digit' | 'count-digit' |
 *   'prefix-sum' | 'place-back' | 'round-end'
 */

import type { IR, IRBinOp, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tVoid: IRType = { kind: 'void' };
const tIntList: IRType = { kind: 'list', of: tInt };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });

/** `(arr[i] // exp) % 10` — 지금 보는 자리의 숫자 하나. 감싸지 않는다. */
const digitOf = (i: IRExpr): IRExpr =>
  bin('%', bin('//', idx(v('arr'), i), v('exp')), lit(10));

export const radixSortLsdIR: IR = {
  id: 'radixsort-lsd',
  algorithm: 'radixSort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'radix_sort',
      params: [{ name: 'arr', type: tIntList }],
      returnType: tVoid,
      body: [
        {
          kind: 'var',
          phase: 'scan-max',
          name: 'max_value',
          type: tInt,
          init: call('max', [v('arr')]),
        },
        { kind: 'var', phase: 'scan-max', name: 'exp', type: tInt, init: lit(1) },
        {
          kind: 'while',
          phase: 'pick-place',
          cond: bin('<=', v('exp'), v('max_value')),
          body: [
            {
              kind: 'expr-stmt',
              expr: call('counting_by_digit', [v('arr'), v('exp')]),
            },
            {
              kind: 'assign',
              phase: 'round-end',
              target: v('exp'),
              expr: bin('*', v('exp'), lit(10)),
            },
          ],
        },
      ] satisfies IRStmt[],
    },
    {
      name: 'counting_by_digit',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'exp', type: tInt },
      ],
      returnType: tVoid,
      body: [
        { kind: 'var', name: 'n', type: tInt, init: len(v('arr')) },
        { kind: 'var', name: 'output', type: tIntList, init: call('zeros', [v('n')]) },
        { kind: 'var', name: 'count', type: tIntList, init: call('zeros', [lit(10)]) },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'var',
              phase: 'read-digit',
              name: 'd',
              type: tInt,
              init: digitOf(v('i')),
            },
            {
              kind: 'assign',
              phase: 'count-digit',
              target: idx(v('count'), v('d')),
              expr: bin('+', idx(v('count'), v('d')), lit(1)),
            },
          ],
        },
        {
          kind: 'for-range',
          var: 'd',
          from: lit(1),
          to: lit(10),
          inclusive: false,
          body: [
            {
              kind: 'assign',
              phase: 'prefix-sum',
              target: idx(v('count'), v('d')),
              expr: bin(
                '+',
                idx(v('count'), v('d')),
                idx(v('count'), bin('-', v('d'), lit(1))),
              ),
            },
          ],
        },
        { kind: 'var', name: 'i', type: tInt, init: bin('-', v('n'), lit(1)) },
        {
          kind: 'while',
          cond: bin('>=', v('i'), lit(0)),
          body: [
            {
              kind: 'var',
              phase: 'read-digit',
              name: 'd',
              type: tInt,
              init: digitOf(v('i')),
            },
            {
              kind: 'assign',
              phase: 'place-back',
              target: idx(v('count'), v('d')),
              expr: bin('-', idx(v('count'), v('d')), lit(1)),
            },
            {
              kind: 'assign',
              phase: 'place-back',
              target: idx(v('output'), idx(v('count'), v('d'))),
              expr: idx(v('arr'), v('i')),
            },
            { kind: 'assign', target: v('i'), expr: bin('-', v('i'), lit(1)) },
          ],
        },
        {
          kind: 'for-range',
          var: 'k',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'assign',
              phase: 'round-end',
              target: idx(v('arr'), v('k')),
              expr: idx(v('output'), v('k')),
            },
          ],
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const radixSortIRs: IR[] = [radixSortLsdIR];
