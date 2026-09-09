/**
 * merge-sort 학습용 IR — 재귀 함수 `merge_sort` 와 보조 함수 `merge` 둘.
 *
 * 표현 코드 (가짜코드 — 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def merge_sort(arr, lo, hi):
 *       if lo >= hi: return                        # phase: base
 *       mid = (lo + hi) // 2                       # phase: split
 *       merge_sort(arr, lo, mid)                   # phase: go-left
 *       merge_sort(arr, mid + 1, hi)               # phase: go-right
 *       merge(arr, lo, mid, hi)                    # phase: merge
 *
 *   def merge(arr, lo, mid, hi):
 *       left  = copy_range(arr, lo, mid + 1)       # phase: copy
 *       right = copy_range(arr, mid + 1, hi + 1)   # phase: copy
 *       i = 0; j = 0; k = lo                       # 커서 셋 — phase 없음
 *       while i < len(left) and j < len(right):    # phase: compare
 *           if left[i] <= right[j]:                # phase: compare
 *               arr[k] = left[i]                   # phase: take-left
 *               i = i + 1
 *           else:
 *               arr[k] = right[j]                  # phase: take-right
 *               j = j + 1
 *           k = k + 1
 *       while i < len(left):                       # phase: drain-left
 *           arr[k] = left[i]; i = i + 1; k = k + 1
 *       while j < len(right):                      # phase: drain-right
 *           arr[k] = right[j]; j = j + 1; k = k + 1
 *
 * phase 어휘는 `algorithm.ts` 의 `emit('phase', …)` 와 **글자 단위로** 같아야
 * 한다 (C3):
 *
 *   'base' | 'split' | 'go-left' | 'go-right' | 'merge' |
 *   'copy' | 'compare' | 'take-left' | 'take-right' |
 *   'drain-left' | 'drain-right'
 *
 * 병합은 배열 인덱스 셈으로 펼쳐 적었다. 세 while 이 이 알고리즘의 전부라
 * `merge_two(left, right)` 같은 이름 뒤로 감싸면 코드 패널이 할 말을 잃는다.
 * 이름 붙인 호출은 `copy_range` 하나뿐이다 — 버금 배열을 뜨는 일은 언어마다
 * 이름이 갈리고(`arr[lo:hi]` · `slice` · `Arrays.copyOfRange`) IR 에 그 어휘가
 * 없다. 반열린 구간 `[from, to)` 로 약속한다.
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

/** i + 1 — 오른쪽 반의 첫 자리이자 반열린 구간의 끝. */
const plus1 = (x: IRExpr): IRExpr => bin('+', x, lit(1));
/** x = x + 1 — 셋뿐인 커서(i · j · k)를 한 칸 옮긴다. */
const advance = (name: string, phase?: string): IRStmt => ({
  kind: 'assign',
  target: v(name),
  expr: plus1(v(name)),
  ...(phase === undefined ? {} : { phase }),
});

export const mergeSortRecursiveIR: IR = {
  id: 'mergesort-recursive',
  algorithm: 'mergeSort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'merge_sort',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'lo', type: tInt },
        { name: 'hi', type: tInt },
      ],
      returnType: tVoid,
      body: [
        {
          kind: 'if',
          phase: 'base',
          cond: bin('>=', v('lo'), v('hi')),
          then: [{ kind: 'return', phase: 'base' }],
        },
        {
          kind: 'var',
          name: 'mid',
          type: tInt,
          phase: 'split',
          init: bin('//', bin('+', v('lo'), v('hi')), lit(2)),
        },
        {
          kind: 'expr-stmt',
          phase: 'go-left',
          expr: call('merge_sort', [v('arr'), v('lo'), v('mid')]),
        },
        {
          kind: 'expr-stmt',
          phase: 'go-right',
          expr: call('merge_sort', [v('arr'), plus1(v('mid')), v('hi')]),
        },
        {
          kind: 'expr-stmt',
          phase: 'merge',
          expr: call('merge', [v('arr'), v('lo'), v('mid'), v('hi')]),
        },
      ] satisfies IRStmt[],
    },
    {
      name: 'merge',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'lo', type: tInt },
        { name: 'mid', type: tInt },
        { name: 'hi', type: tInt },
      ],
      returnType: tVoid,
      body: [
        { kind: 'comment', text: 'copy_range(a, from, to) — 반열린 구간 [from, to) 의 사본' },
        {
          kind: 'var',
          name: 'left',
          type: tIntList,
          phase: 'copy',
          init: call('copy_range', [v('arr'), v('lo'), plus1(v('mid'))]),
        },
        {
          kind: 'var',
          name: 'right',
          type: tIntList,
          phase: 'copy',
          init: call('copy_range', [v('arr'), plus1(v('mid')), plus1(v('hi'))]),
        },
        { kind: 'var', name: 'i', type: tInt, init: lit(0) },
        { kind: 'var', name: 'j', type: tInt, init: lit(0) },
        { kind: 'var', name: 'k', type: tInt, init: v('lo') },
        {
          kind: 'while',
          phase: 'compare',
          cond: bin(
            '&&',
            bin('<', v('i'), len(v('left'))),
            bin('<', v('j'), len(v('right'))),
          ),
          body: [
            {
              kind: 'if',
              phase: 'compare',
              cond: bin('<=', idx(v('left'), v('i')), idx(v('right'), v('j'))),
              then: [
                {
                  kind: 'assign',
                  phase: 'take-left',
                  target: idx(v('arr'), v('k')),
                  expr: idx(v('left'), v('i')),
                },
                advance('i', 'take-left'),
              ],
              else: [
                {
                  kind: 'assign',
                  phase: 'take-right',
                  target: idx(v('arr'), v('k')),
                  expr: idx(v('right'), v('j')),
                },
                advance('j', 'take-right'),
              ],
            },
            advance('k'),
          ],
        },
        {
          kind: 'while',
          phase: 'drain-left',
          cond: bin('<', v('i'), len(v('left'))),
          body: [
            {
              kind: 'assign',
              phase: 'drain-left',
              target: idx(v('arr'), v('k')),
              expr: idx(v('left'), v('i')),
            },
            advance('i', 'drain-left'),
            advance('k', 'drain-left'),
          ],
        },
        {
          kind: 'while',
          phase: 'drain-right',
          cond: bin('<', v('j'), len(v('right'))),
          body: [
            {
              kind: 'assign',
              phase: 'drain-right',
              target: idx(v('arr'), v('k')),
              expr: idx(v('right'), v('j')),
            },
            advance('j', 'drain-right'),
            advance('k', 'drain-right'),
          ],
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const mergeSortIRs: IR[] = [mergeSortRecursiveIR];
