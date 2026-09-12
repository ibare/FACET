/**
 * `integer-overflow-imperative` — 넘침을 **재현하지 않고 미리 판정하는** IR.
 *
 * ── 왜 재현하면 안 되는가 (이 파일의 가장 위험한 자리)
 *
 * 코드 패널의 IR 하나가 여섯 언어로 갈린다. 그런데 `ir-interpreter` 는 배정도로
 * 셈하므로 `13! = 6,227,020,800` 을 그대로 통과시킨다. 같은 코드를 java · C++ ·
 * C# 로 옮기면 그 자리의 `int` 는 감겨 다른 값이 되고, python · javascript ·
 * typescript 는 인터프리터와 같은 답을 낸다. **여섯 중 셋에서만 다른 답이 나오고,
 * 대조하는 수단(인터프리터)에 그 벽이 없으므로 검사는 그것을 원리적으로 잡지
 * 못한다.** 저장소에서 실제로 겪은 일이다 — 어떤 IR 이 `3^20 = 3,486,784,401` 을
 * 돌려주고 있었고 테스트가 그 틀린 값을 통과로 확인하고 있었다.
 *
 * 그래서 값이 아니라 **구조**로 막는다. 곱하기 전에 나눗셈으로, 더하기 전에
 * 뺄셈으로 넘칠지를 먼저 판정한다.
 *
 *     if (acc > limit // n) { 여기서 넘친다 }
 *     else                  { acc = acc * n }
 *
 * 이러면 **중간값이 `limit` 을 절대 넘지 않는다.** 판정을 지난 곱셈은 정의상
 * `acc * n <= limit` 이고, 판정에 걸린 곱셈은 아예 셈해지지 않는다. 덧셈도 같다 —
 * `prev > limit - acc` 면 더하지 않는다. 폭 32 에서 중간값의 최대치는 `limit`
 * 자신인 2,147,483,647 이며 이것은 int 안이다.
 *
 * ── `limit` 을 만드는 방법
 *
 * `limit = 2^(width-1) - 1` 인데 **2^(width-1) 을 거치면 안 된다** — 폭 32 에서
 * 그것은 2,147,483,648 이라 이미 int 를 넘는다. 2^(width-2) 까지만 만들고
 * `(half - 1) + half` 로 접는다. 폭 32 에서 `half = 2^30 = 1,073,741,824` 이고
 * `1,073,741,823 + 1,073,741,824 = 2,147,483,647` 이다.
 *
 * ── IR 어휘의 한계를 지킨 자리
 *
 *  - 비트 연산이 없으므로 폭에서 최대값을 **곱셈 루프**로 만든다.
 *  - `pow` 가 예약 이름에 없으므로 거듭제곱을 부르지 않는다.
 *  - `&&` 는 짧은 회로가 아니므로 조건을 잇지 않고 `if` 를 중첩한다.
 *  - 나눗셈은 정수 나눗셈 `//` 다. `/` 를 쓰면 실수가 되어 int 슬롯에 담을 수
 *    없고, java · C# 이 컴파일되지 않는다 (S-transpiler).
 *  - 이름은 여섯 언어 어디서도 예약어가 아니다 (`base` · `out` · `params` ·
 *    `object` 따위를 피했다).
 *
 * ── phase 어휘는 `algorithm.ts` 와 집합이 정확히 같다 (C3)
 *
 *   'init' | 'check' | 'grow' | 'overflow'
 *
 * 마지막 `return kept` 에는 phase 를 달지 않는다. 걸음 상한을 다 쓰도록 넘치지
 * 않는 손잡이 조합이 없어, phase 를 달면 알고리즘이 영영 발신하지 않는 죽은
 * 어휘가 된다 (C3 MUST NOT).
 */

import type { IR } from '@ffacet/core/runtime';

/**
 * `survive(width, steps, mode)` — 그릇에 담긴 항의 수를 돌려준다.
 *
 * `mode` 는 0 이면 팩토리얼, 그 밖이면 피보나치다. IR 에 문자열 비교를 들이지
 * 않으려고 수로 둔다.
 */
export const integerOverflowImperativeIR: IR = {
  id: 'integer-overflow-imperative',
  algorithm: 'integerOverflow',
  paradigm: 'imperative',
  functions: [
    {
      name: 'survive',
      params: [
        { name: 'width', type: { kind: 'int' } },
        { name: 'steps', type: { kind: 'int' } },
        { name: 'mode', type: { kind: 'int' } },
      ],
      returnType: { kind: 'int' },
      body: [
        {
          kind: 'comment',
          text: '그릇의 최대값을 만든다. 2^(width-1) 을 거치지 않는다.',
        },
        { kind: 'var', name: 'half', type: { kind: 'int' }, init: { kind: 'lit', value: 1 }, phase: 'init' },
        {
          kind: 'for-range',
          var: 'i',
          from: { kind: 'lit', value: 1 },
          to: { kind: 'binop', op: '-', l: { kind: 'var', name: 'width' }, r: { kind: 'lit', value: 2 } },
          inclusive: true,
          phase: 'init',
          body: [
            {
              kind: 'assign',
              target: { kind: 'var', name: 'half' },
              expr: { kind: 'binop', op: '*', l: { kind: 'var', name: 'half' }, r: { kind: 'lit', value: 2 } },
              phase: 'init',
            },
          ],
        },
        {
          kind: 'var',
          name: 'limit',
          type: { kind: 'int' },
          init: {
            kind: 'binop',
            op: '+',
            l: { kind: 'binop', op: '-', l: { kind: 'var', name: 'half' }, r: { kind: 'lit', value: 1 } },
            r: { kind: 'var', name: 'half' },
          },
          phase: 'init',
        },
        { kind: 'comment', text: '첫 항은 어느 폭에서도 담긴다.' },
        { kind: 'var', name: 'acc', type: { kind: 'int' }, init: { kind: 'lit', value: 1 }, phase: 'init' },
        { kind: 'var', name: 'prev', type: { kind: 'int' }, init: { kind: 'lit', value: 0 }, phase: 'init' },
        { kind: 'var', name: 'kept', type: { kind: 'int' }, init: { kind: 'lit', value: 1 }, phase: 'init' },
        {
          kind: 'for-range',
          var: 'i',
          from: { kind: 'lit', value: 1 },
          to: { kind: 'var', name: 'steps' },
          inclusive: true,
          body: [
            {
              kind: 'if',
              cond: { kind: 'binop', op: '==', l: { kind: 'var', name: 'mode' }, r: { kind: 'lit', value: 0 } },
              then: [
                {
                  kind: 'comment',
                  text: '팩토리얼 — 곱하기 전에 나눗셈으로 판정한다.',
                },
                {
                  kind: 'if',
                  cond: {
                    kind: 'binop',
                    op: '>',
                    l: { kind: 'var', name: 'acc' },
                    r: {
                      kind: 'binop',
                      op: '//',
                      l: { kind: 'var', name: 'limit' },
                      r: { kind: 'binop', op: '+', l: { kind: 'var', name: 'i' }, r: { kind: 'lit', value: 1 } },
                    },
                  },
                  phase: 'check',
                  then: [{ kind: 'return', expr: { kind: 'var', name: 'kept' }, phase: 'overflow' }],
                  else: [
                    {
                      kind: 'assign',
                      target: { kind: 'var', name: 'acc' },
                      expr: {
                        kind: 'binop',
                        op: '*',
                        l: { kind: 'var', name: 'acc' },
                        r: { kind: 'binop', op: '+', l: { kind: 'var', name: 'i' }, r: { kind: 'lit', value: 1 } },
                      },
                      phase: 'grow',
                    },
                    {
                      kind: 'assign',
                      target: { kind: 'var', name: 'kept' },
                      expr: { kind: 'binop', op: '+', l: { kind: 'var', name: 'kept' }, r: { kind: 'lit', value: 1 } },
                      phase: 'grow',
                    },
                  ],
                },
              ],
              else: [
                {
                  kind: 'comment',
                  text: '피보나치 — 더하기 전에 뺄셈으로 판정한다.',
                },
                {
                  kind: 'if',
                  cond: {
                    kind: 'binop',
                    op: '>',
                    l: { kind: 'var', name: 'prev' },
                    r: {
                      kind: 'binop',
                      op: '-',
                      l: { kind: 'var', name: 'limit' },
                      r: { kind: 'var', name: 'acc' },
                    },
                  },
                  phase: 'check',
                  then: [{ kind: 'return', expr: { kind: 'var', name: 'kept' }, phase: 'overflow' }],
                  else: [
                    {
                      kind: 'var',
                      name: 'sum',
                      type: { kind: 'int' },
                      init: {
                        kind: 'binop',
                        op: '+',
                        l: { kind: 'var', name: 'prev' },
                        r: { kind: 'var', name: 'acc' },
                      },
                      phase: 'grow',
                    },
                    {
                      kind: 'assign',
                      target: { kind: 'var', name: 'prev' },
                      expr: { kind: 'var', name: 'acc' },
                      phase: 'grow',
                    },
                    {
                      kind: 'assign',
                      target: { kind: 'var', name: 'acc' },
                      expr: { kind: 'var', name: 'sum' },
                      phase: 'grow',
                    },
                    {
                      kind: 'assign',
                      target: { kind: 'var', name: 'kept' },
                      expr: { kind: 'binop', op: '+', l: { kind: 'var', name: 'kept' }, r: { kind: 'lit', value: 1 } },
                      phase: 'grow',
                    },
                  ],
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: { kind: 'var', name: 'kept' } },
      ],
    },
  ],
};

export const integerOverflowIRs: IR[] = [integerOverflowImperativeIR];
