/**
 * 선형 탐색 학습용 IR — 함수 하나, 문 셋.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def linear_search(arr, target):
 *       for i in range(len(arr)):        # phase: advance
 *           if arr[i] == target:         # phase: compare
 *               return i                 # phase: found
 *       return -1                        # phase: not-found
 *
 * **이름 붙인 호출도 보조 변수도 없다.** 훑는 자리 `i` 하나가 전부이고,
 * 길이는 `len` 노드가 직접 말한다. 감쌀 것이 애초에 없다.
 *
 * 짧아서 오히려 언어 차이가 선명하다. 이 IR 하나에서 `len(arr)` 이
 * 여섯 갈래로 갈린다 —
 *
 *   python      `len(arr)`
 *   javascript  `arr.length`
 *   typescript  `arr.length`
 *   java        `arr.length`      (배열이라 필드. 문자열이면 `.length()`)
 *   cpp         `arr.size()`      (`std::vector<int>`)
 *   csharp      `arr.Length`
 *
 * 이 완제품이 보일 것이 그 갈림이다.
 *
 * phase 어휘는 `algorithm.ts` 의 `emit('phase', …)` 와 **글자 단위로** 같아야
 * 한다 (C3):
 *
 *   'advance' | 'compare' | 'found' | 'not-found'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tIntList: IRType = { kind: 'list', of: tInt };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });

export const linearSearchScanIR: IR = {
  id: 'linearsearch-scan',
  algorithm: 'linearSearch',
  paradigm: 'imperative',
  functions: [
    {
      name: 'linear_search',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'target', type: tInt },
      ],
      returnType: tInt,
      body: [
        {
          kind: 'for-range',
          phase: 'advance',
          var: 'i',
          from: lit(0),
          to: len(v('arr')),
          inclusive: false,
          body: [
            {
              kind: 'if',
              phase: 'compare',
              cond: { kind: 'binop', op: '==', l: idx(v('arr'), v('i')), r: v('target') },
              then: [{ kind: 'return', phase: 'found', expr: v('i') }],
            },
          ],
        },
        { kind: 'return', phase: 'not-found', expr: lit(-1) },
      ] satisfies IRStmt[],
    },
  ],
};

export const linearSearchIRs: IR[] = [linearSearchScanIR];
