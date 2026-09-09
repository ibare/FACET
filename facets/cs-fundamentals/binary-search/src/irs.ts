/**
 * 이진 탐색 (반복형) 학습용 IR — 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def binary_search(arr, target):
 *       lo = 0
 *       hi = len(arr) - 1
 *       while lo <= hi:                       # phase: range-check
 *           mid = (lo + hi) // 2              # phase: pick-mid
 *           if arr[mid] == target:            # phase: compare
 *               return mid                    # phase: found
 *           if arr[mid] < target:             # phase: compare
 *               lo = mid + 1                  # phase: drop-left
 *           else:
 *               hi = mid - 1                  # phase: drop-right
 *       return -1                             # phase: not-found
 *
 * **이름 붙인 호출이 하나도 없다.** 이진 탐색이 끌고 다니는 것은 경계 둘
 * (`lo` · `hi`) 과 그 가운데 하나(`mid`) 뿐이라 `(lo + hi) // 2` 와 `mid + 1` /
 * `mid - 1` 로 전부 펼쳐 쓸 수 있다. 감싸면 코드 패널이 할 말을 잃는다.
 *
 * `//` 를 쓴다. 파이썬 3 에서 `(lo + hi) / 2` 는 실수라 `arr[mid]` 가 터진다.
 * 자바·C++·C# 은 정수끼리의 `/` 가 이미 정수 나눗셈이므로 각 transpiler 가
 * 자기 언어의 표기로 옮긴다.
 *
 * 세 갈래 판정을 중첩 `if` 가 아니라 **나란한 `if` 둘**로 적는다. 첫 `if` 가
 * 찾으면 그 자리에서 돌아가므로 두 번째에 닿는 것은 "같지 않다" 가 확정된
 * 뒤다. 들여쓰기가 한 단 얕아져 코드 패널에서 세 갈래가 한눈에 보인다.
 *
 * 못 찾으면 `-1` 을 돌려준다. 그 줄에 닿으려면 `while` 이 끝나야 하고,
 * `while` 이 끝나려면 `lo > hi` — 즉 **구간이 비어야** 한다. 「없다」는 답이
 * 어디서 나오는지가 이 IR 의 마지막 줄이다.
 *
 * phase 어휘는 `algorithm.ts` 의 `emit('phase', …)` 와 **글자 단위로** 같아야
 * 한다 (C3):
 *
 *   'range-check' | 'pick-mid' | 'compare' | 'found' |
 *   'drop-left' | 'drop-right' | 'not-found'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tIntList: IRType = { kind: 'list', of: tInt };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

export const binarySearchIterativeIR: IR = {
  id: 'binarysearch-iterative',
  algorithm: 'binarySearch',
  paradigm: 'imperative',
  functions: [
    {
      name: 'binary_search',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'target', type: tInt },
      ],
      returnType: tInt,
      body: [
        { kind: 'var', name: 'lo', type: tInt, init: lit(0) },
        { kind: 'var', name: 'hi', type: tInt, init: bin('-', len(v('arr')), lit(1)) },
        {
          kind: 'while',
          phase: 'range-check',
          cond: bin('<=', v('lo'), v('hi')),
          body: [
            {
              kind: 'var',
              phase: 'pick-mid',
              name: 'mid',
              type: tInt,
              init: bin('//', bin('+', v('lo'), v('hi')), lit(2)),
            },
            {
              kind: 'if',
              phase: 'compare',
              cond: bin('==', idx(v('arr'), v('mid')), v('target')),
              then: [{ kind: 'return', phase: 'found', expr: v('mid') }],
            },
            {
              kind: 'if',
              phase: 'compare',
              cond: bin('<', idx(v('arr'), v('mid')), v('target')),
              then: [
                {
                  kind: 'assign',
                  phase: 'drop-left',
                  target: v('lo'),
                  expr: bin('+', v('mid'), lit(1)),
                },
              ],
              else: [
                {
                  kind: 'assign',
                  phase: 'drop-right',
                  target: v('hi'),
                  expr: bin('-', v('mid'), lit(1)),
                },
              ],
            },
          ] satisfies IRStmt[],
        },
        { kind: 'return', phase: 'not-found', expr: lit(-1) },
      ] satisfies IRStmt[],
    },
  ],
};

export const binarySearchIRs: IR[] = [binarySearchIterativeIR];
