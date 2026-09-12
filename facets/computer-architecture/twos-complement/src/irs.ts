/**
 * 비트열 하나를 두 가지 약속으로 읽는 셈.
 *
 * ── 어휘의 한계가 곧 이 완제품의 주장이다
 *
 * IR 에는 비트 연산이 없다 (`IRBinOp` 는 사칙·비교·논리뿐). 그래서 자리를 꺼낼 때
 * `// 2` 를 되풀이하고 자리를 이을 때 `* 2` 를 쓴다. **그 산술이 곧 2의 보수의
 * 정의라 우회가 아니다** — 비트 연산으로 적으면 오히려 "자리마다 무게가 있다" 는
 * 말이 기계 명령 뒤로 숨는다.
 *
 * 거듭제곱 함수도 쓰지 않는다. 예약된 수학 이름은 `exp` · `log` · `sqrt` · `abs` ·
 * `max` · `min` · `floor` 뿐이고 `pow` 는 거기 없다. 2의 거듭제곱이 필요한 자리는
 * 전부 **누적 곱셈**으로 편다.
 *
 * ── 32비트 천장과 그 경계 (S-transpiler)
 *
 * 인터프리터는 배정도라 넘쳐도 조용히 통과하지만 java · C++ · C# 의 `int` 는
 * 감긴다. **검사가 원리적으로 못 잡는 벽이라 값이 아니라 짜임으로 막는다.**
 * 여기 있는 네 함수는 폭 32 에서도 중간값이 `2^31 − 1` 을 넘지 않는다.
 *
 *   `bitAt`         `value` 를 반씩 줄이기만 한다. 중간값 ≤ 입력.
 *   `readUnsigned`  높은 자리부터 `acc = acc * 2 + bit` 로 접는다 (호너). 중간값은
 *                   그 자리까지의 값이라 **최종값을 넘지 않는다** — 앞이 0 으로
 *                   채워진 비트열이면 acc 는 한동안 0 에 머문다.
 *   `readTwos`      같은 접기인데 맨 윗자리만 `-bit` 로 시작한다. 중간값의 크기는
 *                   그 폭의 표현 범위 안이다.
 *   `highestValue`  `acc = acc * 2 + 1` 을 `width − 1` 번 돌려 `2^(width−1) − 1` 을
 *                   만든다. **마지막 곱셈 전에 멈추는 꼴**이라 폭 32 에서 딱
 *                   2,147,483,647 에 닿고 그 위로 올라가지 않는다. `2^31` 을
 *                   양수 중간값으로 만드는 순간 감기는데, 이 짜임에는 그 순간이 없다.
 *   `lowestValue`   `-highestValue(width) - 1`. 폭 32 에서 −2,147,483,648 이고
 *                   이 역시 `int` 안이다.
 *
 * **값의 개수(`2^width`)와 음수의 개수(`2^(width−1)`)는 여기서 셈하지 않는다.**
 * 폭 32 에서 각각 4,294,967,296 과 2,147,483,648 이라 `int` 를 넘는다. 그 둘은
 * 화면 쪽(`algorithm.ts`)에서만 셈한다.
 *
 * ── 나눗셈의 부호
 *
 * `//` 는 인터프리터가 내림이고 java · C++ · C# 은 0 방향 절단이라 음수에서 갈린다.
 * `bitAt` 이 받는 `value` 는 언제나 비음수(부호 없이 읽은 값)라 둘이 같은 답을 낸다.
 * 음수를 `//` 에 넣지 않는 것이 이 IR 의 전제다.
 *
 * ── 그 밖에
 *
 * `&&` 는 쓰지 않는다 — 인터프리터의 `&&` 는 짧은 회로가 아니라 오른쪽이 늘
 * 셈해진다. 이을 조건이 없도록 짰다.
 *
 * 이름은 여섯 언어의 예약어를 피했다. `value` 는 C# 의 문맥 키워드라 매개변수로
 * 쓸 수 있고, `place` · `rest` · `left` · `acc` · `width` 는 어느 언어에서도
 * 예약어가 아니다.
 *
 * phase 어휘는 `algorithm.ts` 와 집합이 정확히 같다 (C3):
 *   'unfold' | 'read-unsigned' | 'read-twos' | 'span'
 */

import type { IR } from '@ffacet/core/runtime';

export const twosComplementImperativeIR: IR = {
  id: 'twos-complement-imperative',
  algorithm: 'twosComplement',
  paradigm: 'imperative',
  functions: [
    {
      // 자리 하나를 꺼낸다. 비트 연산 대신 반씩 줄이고 나머지를 본다.
      name: 'bitAt',
      params: [
        { name: 'value', type: { kind: 'int' } },
        { name: 'place', type: { kind: 'int' } },
      ],
      returnType: { kind: 'int' },
      body: [
        {
          kind: 'var',
          name: 'rest',
          type: { kind: 'int' },
          init: { kind: 'var', name: 'value' },
          phase: 'unfold',
        },
        {
          kind: 'var',
          name: 'left',
          type: { kind: 'int' },
          init: { kind: 'var', name: 'place' },
          phase: 'unfold',
        },
        {
          kind: 'while',
          cond: {
            kind: 'binop',
            op: '>',
            l: { kind: 'var', name: 'left' },
            r: { kind: 'lit', value: 0 },
          },
          phase: 'unfold',
          body: [
            {
              kind: 'assign',
              target: { kind: 'var', name: 'rest' },
              expr: {
                kind: 'binop',
                op: '//',
                l: { kind: 'var', name: 'rest' },
                r: { kind: 'lit', value: 2 },
              },
              phase: 'unfold',
            },
            {
              kind: 'assign',
              target: { kind: 'var', name: 'left' },
              expr: {
                kind: 'binop',
                op: '-',
                l: { kind: 'var', name: 'left' },
                r: { kind: 'lit', value: 1 },
              },
              phase: 'unfold',
            },
          ],
        },
        {
          kind: 'return',
          expr: {
            kind: 'binop',
            op: '%',
            l: { kind: 'var', name: 'rest' },
            r: { kind: 'lit', value: 2 },
          },
          phase: 'unfold',
        },
      ],
    },
    {
      // 부호 없이 읽는다. 모든 자리의 무게가 양수다.
      name: 'readUnsigned',
      params: [
        { name: 'value', type: { kind: 'int' } },
        { name: 'width', type: { kind: 'int' } },
      ],
      returnType: { kind: 'int' },
      body: [
        {
          kind: 'var',
          name: 'acc',
          type: { kind: 'int' },
          init: { kind: 'lit', value: 0 },
          phase: 'read-unsigned',
        },
        {
          kind: 'var',
          name: 'place',
          type: { kind: 'int' },
          init: {
            kind: 'binop',
            op: '-',
            l: { kind: 'var', name: 'width' },
            r: { kind: 'lit', value: 1 },
          },
          phase: 'read-unsigned',
        },
        {
          kind: 'while',
          cond: {
            kind: 'binop',
            op: '>=',
            l: { kind: 'var', name: 'place' },
            r: { kind: 'lit', value: 0 },
          },
          phase: 'read-unsigned',
          body: [
            {
              kind: 'assign',
              target: { kind: 'var', name: 'acc' },
              expr: {
                kind: 'binop',
                op: '+',
                l: {
                  kind: 'binop',
                  op: '*',
                  l: { kind: 'var', name: 'acc' },
                  r: { kind: 'lit', value: 2 },
                },
                r: {
                  kind: 'call',
                  fn: 'bitAt',
                  args: [
                    { kind: 'var', name: 'value' },
                    { kind: 'var', name: 'place' },
                  ],
                },
              },
              phase: 'read-unsigned',
            },
            {
              kind: 'assign',
              target: { kind: 'var', name: 'place' },
              expr: {
                kind: 'binop',
                op: '-',
                l: { kind: 'var', name: 'place' },
                r: { kind: 'lit', value: 1 },
              },
              phase: 'read-unsigned',
            },
          ],
        },
        { kind: 'return', expr: { kind: 'var', name: 'acc' }, phase: 'read-unsigned' },
      ],
    },
    {
      // 2의 보수로 읽는다. 맨 윗자리의 무게만 음수다.
      name: 'readTwos',
      params: [
        { name: 'value', type: { kind: 'int' } },
        { name: 'width', type: { kind: 'int' } },
      ],
      returnType: { kind: 'int' },
      body: [
        {
          kind: 'var',
          name: 'acc',
          type: { kind: 'int' },
          init: {
            kind: 'unop',
            op: '-',
            x: {
              kind: 'call',
              fn: 'bitAt',
              args: [
                { kind: 'var', name: 'value' },
                {
                  kind: 'binop',
                  op: '-',
                  l: { kind: 'var', name: 'width' },
                  r: { kind: 'lit', value: 1 },
                },
              ],
            },
          },
          phase: 'read-twos',
        },
        {
          kind: 'var',
          name: 'place',
          type: { kind: 'int' },
          init: {
            kind: 'binop',
            op: '-',
            l: { kind: 'var', name: 'width' },
            r: { kind: 'lit', value: 2 },
          },
          phase: 'read-twos',
        },
        {
          kind: 'while',
          cond: {
            kind: 'binop',
            op: '>=',
            l: { kind: 'var', name: 'place' },
            r: { kind: 'lit', value: 0 },
          },
          phase: 'read-twos',
          body: [
            {
              kind: 'assign',
              target: { kind: 'var', name: 'acc' },
              expr: {
                kind: 'binop',
                op: '+',
                l: {
                  kind: 'binop',
                  op: '*',
                  l: { kind: 'var', name: 'acc' },
                  r: { kind: 'lit', value: 2 },
                },
                r: {
                  kind: 'call',
                  fn: 'bitAt',
                  args: [
                    { kind: 'var', name: 'value' },
                    { kind: 'var', name: 'place' },
                  ],
                },
              },
              phase: 'read-twos',
            },
            {
              kind: 'assign',
              target: { kind: 'var', name: 'place' },
              expr: {
                kind: 'binop',
                op: '-',
                l: { kind: 'var', name: 'place' },
                r: { kind: 'lit', value: 1 },
              },
              phase: 'read-twos',
            },
          ],
        },
        { kind: 'return', expr: { kind: 'var', name: 'acc' }, phase: 'read-twos' },
      ],
    },
    {
      // 이 폭이 담는 가장 큰 수. 마지막 곱셈 전에 멈추는 꼴이라 천장에 닿지 않는다.
      name: 'highestValue',
      params: [{ name: 'width', type: { kind: 'int' } }],
      returnType: { kind: 'int' },
      body: [
        {
          kind: 'var',
          name: 'acc',
          type: { kind: 'int' },
          init: { kind: 'lit', value: 0 },
          phase: 'span',
        },
        {
          kind: 'var',
          name: 'left',
          type: { kind: 'int' },
          init: {
            kind: 'binop',
            op: '-',
            l: { kind: 'var', name: 'width' },
            r: { kind: 'lit', value: 1 },
          },
          phase: 'span',
        },
        {
          kind: 'while',
          cond: {
            kind: 'binop',
            op: '>',
            l: { kind: 'var', name: 'left' },
            r: { kind: 'lit', value: 0 },
          },
          phase: 'span',
          body: [
            {
              kind: 'assign',
              target: { kind: 'var', name: 'acc' },
              expr: {
                kind: 'binop',
                op: '+',
                l: {
                  kind: 'binop',
                  op: '*',
                  l: { kind: 'var', name: 'acc' },
                  r: { kind: 'lit', value: 2 },
                },
                r: { kind: 'lit', value: 1 },
              },
              phase: 'span',
            },
            {
              kind: 'assign',
              target: { kind: 'var', name: 'left' },
              expr: {
                kind: 'binop',
                op: '-',
                l: { kind: 'var', name: 'left' },
                r: { kind: 'lit', value: 1 },
              },
              phase: 'span',
            },
          ],
        },
        { kind: 'return', expr: { kind: 'var', name: 'acc' }, phase: 'span' },
      ],
    },
    {
      // 이 폭이 담는 가장 작은 수. 가장 큰 수를 뒤집고 하나 더 내려간다.
      name: 'lowestValue',
      params: [{ name: 'width', type: { kind: 'int' } }],
      returnType: { kind: 'int' },
      body: [
        {
          kind: 'return',
          expr: {
            kind: 'binop',
            op: '-',
            l: {
              kind: 'unop',
              op: '-',
              x: {
                kind: 'call',
                fn: 'highestValue',
                args: [{ kind: 'var', name: 'width' }],
              },
            },
            r: { kind: 'lit', value: 1 },
          },
          phase: 'span',
        },
      ],
    },
  ],
};

export const twosComplementIRs: IR[] = [twosComplementImperativeIR];
