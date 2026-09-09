/**
 * 보간 탐색 학습용 IR — 함수 하나.
 *
 * 골격은 이진 탐색과 같다. 다른 것은 자리를 정하는 **한 줄** 이고, 그 한 줄이
 * 이 알고리즘의 전부다.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def interpolation_search(arr, target):
 *       lo = 0                                                  # phase: setup
 *       hi = len(arr) - 1                                       # phase: setup
 *       while lo <= hi and target >= arr[lo] and target <= arr[hi]:   # phase: range-check
 *           mid = lo + ((target - arr[lo]) * (hi - lo)) // (arr[hi] - arr[lo])
 *                                                               # phase: probe
 *           if arr[mid] == target:                              # phase: compare
 *               return mid                                      # phase: found
 *           if arr[mid] < target:                               # phase: compare
 *               lo = mid + 1                                    # phase: drop-left
 *           else:
 *               hi = mid - 1                                    # phase: drop-right
 *       return -1
 *
 * ## 겨누는 식을 펼쳐 쓴다
 *
 * `estimate(arr, lo, hi, target)` 로 감싸면 이 알고리즘의 전부가 사라진다.
 * 배열 인덱스 셈으로 쓸 수 있는 것은 펼쳐 쓴다 — 이름 붙인 호출이 하나도 없다.
 *
 * ## 괄호와 순서
 *
 * 곱셈이 나눗셈보다 **먼저** 와야 한다. `//` 는 정수 나눗셈이라
 * `(a * b) // c` 와 `(a // c) * b` 의 결과가 다르다. 이 자료에서 앞은
 * `(100 * 11) // 110 = 10`, 뒤는 `(100 // 110) * 11 = 0` 이다 — 뒤로 쓰면
 * 겨눔이 언제나 구간 왼쪽 끝에 떨어져 알고리즘이 죽는다.
 *
 * IR 트리가 그 순서를 정한다. `binop('//', binop('*', …), …)` 이므로 나눗셈의
 * 왼쪽 피연산자가 곱셈 전체다. 각 transpiler 는 중첩 binop 을 괄호로 싸므로
 * 여섯 언어에서 같은 순서가 보장된다.
 *
 * ## 나누는 수가 0 이 되지 않는가
 *
 * `arr[hi] - arr[lo]` 가 분모다. 값이 오름차순으로 **서로 다르면** 이것이 0 이
 * 되는 경우는 `lo == hi` 뿐인데, 그 상태로 루프에 들어올 수 없다.
 * `target == arr[lo]` 면 분자가 0 이라 `mid == lo` 로 그 자리에서 찾고,
 * `target == arr[hi]` 면 몫이 정확히 `hi - lo` 라 `mid == hi` 로 그 자리에서
 * 찾는다. 즉 끝 값과 같은 target 은 구간이 좁아지기 전에 이미 걸린다.
 * 그래서 방어를 코드에 더 두지 않았다 — while 조건의 두 부등식이 보이는
 * 방어의 전부다.
 *
 * ## while 조건의 두 부등식
 *
 * `target >= arr[lo] && target <= arr[hi]` 가 없으면 범위 밖 값에서 자리 셈이
 * 배열 밖을 가리킨다. 이진 탐색에는 없는 줄이고, 겨누기 때문에 필요해진 줄이다.
 *
 * phase 어휘는 `algorithm.ts` 의 `emit('phase', …)` 와 **글자 단위로** 같다 (C3):
 *
 *   'setup' | 'range-check' | 'probe' | 'compare' | 'found' |
 *   'drop-left' | 'drop-right'
 *
 * 마지막 `return -1` 은 phase 를 갖지 않는다. 이 자료에서는 언제나 찾으므로
 * 알고리즘이 그 phase 를 발신하지 않고, 발신되지 않는 phase 를 IR 에 두면
 * 죽은 어휘가 된다 (C3).
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

/** `arr[lo]` · `arr[hi]` · `arr[mid]` — 세 번 이상 나오는 것만 짧게 둔다. */
const aLo = idx(v('arr'), v('lo'));
const aHi = idx(v('arr'), v('hi'));
const aMid = idx(v('arr'), v('mid'));

/**
 * 겨누는 식.
 *
 *   lo + ((target - arr[lo]) * (hi - lo)) // (arr[hi] - arr[lo])
 *
 * 곱셈이 나눗셈의 왼쪽 피연산자 전체다.
 */
const probeExpr: IRExpr = bin(
  '+',
  v('lo'),
  bin(
    '//',
    bin('*', bin('-', v('target'), aLo), bin('-', v('hi'), v('lo'))),
    bin('-', aHi, aLo),
  ),
);

export const interpolationSearchProbeIR: IR = {
  id: 'interpolationsearch-probe',
  algorithm: 'interpolationSearch',
  paradigm: 'imperative',
  functions: [
    {
      name: 'interpolation_search',
      params: [
        { name: 'arr', type: tIntList },
        { name: 'target', type: tInt },
      ],
      returnType: tInt,
      body: [
        { kind: 'var', phase: 'setup', name: 'lo', type: tInt, init: lit(0) },
        {
          kind: 'var',
          phase: 'setup',
          name: 'hi',
          type: tInt,
          init: bin('-', len(v('arr')), lit(1)),
        },
        {
          kind: 'while',
          phase: 'range-check',
          cond: bin(
            '&&',
            bin('&&', bin('<=', v('lo'), v('hi')), bin('>=', v('target'), aLo)),
            bin('<=', v('target'), aHi),
          ),
          body: [
            { kind: 'var', phase: 'probe', name: 'mid', type: tInt, init: probeExpr },
            {
              kind: 'if',
              phase: 'compare',
              cond: bin('==', aMid, v('target')),
              then: [{ kind: 'return', phase: 'found', expr: v('mid') }],
            },
            {
              kind: 'if',
              phase: 'compare',
              cond: bin('<', aMid, v('target')),
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
          ],
        },
        { kind: 'return', expr: lit(-1) },
      ] satisfies IRStmt[],
    },
  ],
};

export const interpolationSearchIRs: IR[] = [interpolationSearchProbeIR];
