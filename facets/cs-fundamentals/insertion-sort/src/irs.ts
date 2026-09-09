/**
 * 삽입 정렬 학습용 IR — 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def insertion_sort(arr):
 *       for i in range(1, len(arr)):          # phase: settle
 *           key = arr[i]                      # phase: pick-key
 *           j = i - 1                         # phase: pick-key
 *           while j >= 0:
 *               if arr[j] <= key:             # phase: compare
 *                   break
 *               arr[j + 1] = arr[j]           # phase: shift
 *               j = j - 1                     # phase: shift
 *           arr[j + 1] = key                  # phase: place
 *
 * **이름 붙인 호출이 하나도 없다.** 삽입 정렬이 끌고 다니는 것은 잠깐 값을
 * 들고 있는 변수 `key` 와 뒤로 물러나는 인덱스 `j` 뿐이라, `arr[j]` ·
 * `arr[j + 1]` · `i - 1` 로 전부 펼쳐 쓸 수 있다. 감싸면 코드 패널이 할 말을
 * 잃는다.
 *
 * ## 왜 `swap` 이 아니라 대입 두 줄인가
 *
 * 이 알고리즘은 맞바꿈이 아니라 **한 칸씩 밀기** 다. `arr[j + 1] = arr[j]` 는
 * 오른쪽 칸을 덮어쓸 뿐 왼쪽 칸에서 값을 가져오지 않는다 — 그 자리는 아직
 * 낡은 값을 그대로 들고 있고, 다음 밀기가 다시 덮는다. 마지막에 `key` 가
 * 내려앉으면서 비로소 메워진다. 선택 정렬이 `swap` 으로 자리를 맞바꾸는
 * 것과 갈리는 자리가 여기다. IR 의 `swap` 노드를 쓰면 그 차이가 지워진다.
 *
 * ## 왜 `while j >= 0 and arr[j] > key` 가 아닌가
 *
 * 두 조건을 `&&` 로 묶으면 한 줄이 되어 좋아 보이지만, 그러면 **견줌이 몇 번
 * 일어났는지** 를 코드가 말하지 못한다. `j >= 0` 은 자리 범위를 지키는 검사고
 * `arr[j] > key` 는 실제로 두 값을 견주는 일이라 성격이 다르다. 안쪽을
 * `if arr[j] <= key: break` 로 펼쳐 두면 견줌 한 번이 코드 한 줄과 정확히
 * 대응하고, 화면의 `compare-count` 가 그 줄이 실행된 횟수와 같아진다.
 *
 * ## phase 'settle' 이 왜 `for` 머리에 붙는가
 *
 * `for` 머리는 다음 `i` 로 넘어가는 줄이다. 그 줄로 돌아온 순간 방금 넣은 값이
 * 자리를 잡았고 왼쪽 구간이 한 칸 자라 있다 — 자리 확정을 짚을 줄은 이것뿐이다.
 *
 * phase 어휘는 `algorithm.ts` 의 `emit('phase', …)` 와 **글자 단위로** 같아야
 * 한다 (C3):
 *
 *   'pick-key' | 'compare' | 'shift' | 'place' | 'settle'
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

/** `arr[j + 1]` — 밀기와 내려앉음이 모두 이 자리를 쓴다. */
const slot = (): IRExpr => idx(v('arr'), bin('+', v('j'), lit(1)));

export const insertionSortImperativeIR: IR = {
  id: 'insertionsort-imperative',
  algorithm: 'insertionSort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'insertion_sort',
      params: [{ name: 'arr', type: tIntList }],
      returnType: tVoid,
      body: [
        {
          kind: 'for-range',
          phase: 'settle',
          var: 'i',
          from: lit(1),
          to: len(v('arr')),
          inclusive: false,
          body: [
            {
              kind: 'var',
              phase: 'pick-key',
              name: 'key',
              type: tInt,
              init: idx(v('arr'), v('i')),
            },
            {
              kind: 'var',
              phase: 'pick-key',
              name: 'j',
              type: tInt,
              init: bin('-', v('i'), lit(1)),
            },
            {
              kind: 'while',
              cond: bin('>=', v('j'), lit(0)),
              body: [
                {
                  kind: 'if',
                  phase: 'compare',
                  cond: bin('<=', idx(v('arr'), v('j')), v('key')),
                  then: [{ kind: 'break', phase: 'compare' }],
                },
                {
                  kind: 'assign',
                  phase: 'shift',
                  target: slot(),
                  expr: idx(v('arr'), v('j')),
                },
                {
                  kind: 'assign',
                  phase: 'shift',
                  target: v('j'),
                  expr: bin('-', v('j'), lit(1)),
                },
              ],
            },
            {
              kind: 'assign',
              phase: 'place',
              target: slot(),
              expr: v('key'),
            },
          ],
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const insertionSortIRs: IR[] = [insertionSortImperativeIR];
