/**
 * 카운팅 정렬 (앞에서부터 훑는 안정 구현) 학습용 IR — 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def counting_sort(arr, k):
 *       count = zeros(k)                                  # phase: alloc
 *       start = zeros(k)                                  # phase: alloc
 *       output = zeros(len(arr))                          # phase: alloc
 *       total = 0                                         # phase: alloc
 *
 *       for i in range(0, len(arr)):
 *           count[arr[i]] = count[arr[i]] + 1             # phase: count
 *
 *       for val in range(0, k):
 *           start[val] = total                            # phase: prefix-sum
 *           total = total + count[val]                    # phase: prefix-sum
 *
 *       for i in range(0, len(arr)):
 *           output[start[arr[i]]] = arr[i]                # phase: place
 *           start[arr[i]] = start[arr[i]] + 1             # phase: advance
 *
 *       return output                                     # phase: finish
 *
 * ── 이름 붙인 호출은 `zeros` 하나뿐이다
 *
 * 배열을 새로 만드는 일만 언어마다 표기가 갈린다 (`[0]*k` · `new int[k]` ·
 * `std::vector<int>(k, 0)` · `new int[k]`). 그 셋만 `zeros(...)` 로 두고 나머지는
 * 전부 펼쳐 썼다.
 *
 * 배열 이름은 여섯 언어를 한꺼번에 통과하는 것으로 골랐다 — `out` 은 C# 의 예약어고
 * `sorted` 는 파이썬의 내장 함수라 둘 다 쓸 수 없다. 그래서 `output` 이다.
 *
 * 특히 `count[arr[i]]` 와 `output[start[arr[i]]]` 는 **인덱스 안에 인덱스**가 오는
 * 식이고, 그것이 이 알고리즘의 전부다. `bump(count, arr[i])` 로 감싸면 견줌 없이
 * 자리를 셈으로만 얻는다는 사실이 코드에서 사라진다.
 *
 * ── 왜 `start` 를 따로 두는가
 *
 * `count` 를 제자리에서 누적합으로 덮어쓰는 구현도 있다. 그러면 화면에서 "몇
 * 개였는가" 가 지워진다. 값 1 과 4 가 하나도 없다는 사실은 개수 줄이 남아 있어야
 * 보이므로 두 줄을 따로 끌고 간다.
 *
 * ── `total` 을 왜 위에 두는가
 *
 * phase 는 줄 단위로 짚힌다. `total = 0` 을 누적합 루프 바로 앞에 두면
 * `prefix-sum` 이 그 초기화 줄까지 함께 짚게 되어, 값마다 한 번씩 도는 걸음과
 * 한 번만 하는 준비가 한 덩이로 보인다. 마련하는 일은 마련하는 자리에 모은다.
 *
 * phase 어휘는 `algorithm.ts` 의 `emit('phase', …)` 와 **글자 단위로** 같아야
 * 한다 (C3):
 *
 *   'alloc' | 'count' | 'prefix-sum' | 'place' | 'advance' | 'finish'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
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

/** `arr[i]` — 훑고 있는 입력값. 세기와 놓기 양쪽에서 인덱스로 쓰인다. */
const arrAtI: IRExpr = idx(v('arr'), v('i'));

export const countingSortStableIR: IR = {
  id: 'countingsort-stable',
  algorithm: 'countingSort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'counting_sort',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'k', type: tInt },
      ],
      returnType: tIntList,
      body: [
        {
          kind: 'var',
          phase: 'alloc',
          name: 'count',
          type: tIntList,
          init: call('zeros', [v('k')]),
        },
        {
          kind: 'var',
          phase: 'alloc',
          name: 'start',
          type: tIntList,
          init: call('zeros', [v('k')]),
        },
        {
          kind: 'var',
          phase: 'alloc',
          name: 'output',
          type: tIntList,
          init: call('zeros', [len(v('arr'))]),
        },
        { kind: 'var', phase: 'alloc', name: 'total', type: tInt, init: lit(0) },

        { kind: 'comment', text: 'count each value' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: len(v('arr')),
          inclusive: false,
          body: [
            {
              kind: 'assign',
              phase: 'count',
              target: idx(v('count'), arrAtI),
              expr: bin('+', idx(v('count'), arrAtI), lit(1)),
            },
          ],
        },

        { kind: 'comment', text: 'turn counts into starting seats' },
        {
          kind: 'for-range',
          var: 'val',
          from: lit(0),
          to: v('k'),
          inclusive: false,
          body: [
            {
              kind: 'assign',
              phase: 'prefix-sum',
              target: idx(v('start'), v('val')),
              expr: v('total'),
            },
            {
              kind: 'assign',
              phase: 'prefix-sum',
              target: v('total'),
              expr: bin('+', v('total'), idx(v('count'), v('val'))),
            },
          ],
        },

        { kind: 'comment', text: 'place each value at its seat, front to back' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: len(v('arr')),
          inclusive: false,
          body: [
            {
              kind: 'assign',
              phase: 'place',
              target: idx(v('output'), idx(v('start'), arrAtI)),
              expr: arrAtI,
            },
            {
              kind: 'assign',
              phase: 'advance',
              target: idx(v('start'), arrAtI),
              expr: bin('+', idx(v('start'), arrAtI), lit(1)),
            },
          ],
        },

        { kind: 'return', phase: 'finish', expr: v('output') },
      ] satisfies IRStmt[],
    },
  ],
};

export const countingSortIRs: IR[] = [countingSortStableIR];
