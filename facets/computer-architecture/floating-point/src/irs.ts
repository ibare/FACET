/**
 * 부동소수점 IR — 8비트 형식의 셈법을 명령형으로.
 *
 * ── IR 어휘의 한계를 어떻게 지났나
 *
 * **`pow` 가 없다.** 2의 거듭제곱은 `powTwo` 가 곱셈 루프로 만든다. 음의 지수는
 * 나눗셈 루프다 (`unitOf` · `minNormalOf`).
 *
 * **`1 / powTwo(n)` 을 쓰지 않는다.** 인터프리터는 배정도라 0.00006103… 을 내지만
 * java · C# · C++ 은 `int / int` 를 **정수 나눗셈**으로 옮겨 `0` 을 낸다. 같은 IR 이
 * 언어마다 다른 답을 내는 자리라, 대신 `double` 누산기를 2 로 거듭 나눈다. 같은
 * 이유로 `//`(정수 나눗셈)는 이 IR 에 한 번도 나오지 않는다 — 여기서 다루는 수는
 * 대부분 실수다.
 *
 * **`floor` 는 `double` 을 돌려주므로 그 결과는 반드시 `double` 슬롯에 담는다**
 * (`storedValueOf` 의 `k`). `int` 슬롯에 담으면 java 가 `int k = Math.floor(…)`,
 * C# 이 `int k = Math.Floor(…)` 를 내는데 둘 다 컴파일되지 않는다 (S-transpiler).
 *
 * **`&&` 는 짧은 회로가 아니다.** 조건을 이을 자리가 생기는 `storedValueOf` 의
 * 구간 찾기는 `while` 안에 `if` 를 겹쳐 풀었다.
 *
 * ── 32비트 천장과 곱셈 순서
 *
 * 가장 큰 중간값은 `maxValueOf` 의 `scale = powTwo(topExp)` 로, e=5 일 때
 * 2^15 = 32,768 이다. 마지막 곱 `(2 − unit) * scale` 은 2 를 넘지 않는 수와의
 * 곱이라 결과가 65,536 을 넘지 않는다. **곱셈 순서를 이렇게 잡은 까닭이 이것이다** —
 * `2 * scale − unit * scale` 로 펴면 중간값이 같은 크기로 커질 뿐 얻을 것이 없고,
 * 지수를 먼저 키우는 어떤 형태도 2^31 에 닿지 않는다. java · C++ · C# 의 `int` 가
 * 감기는 자리는 이 IR 에 없다. `scale` 만 `int` 이고 그 위의 셈은 전부 `double` 이다.
 *
 * ── 예약어
 *
 * 식별자는 여섯 언어 어디서도 예약어가 아니다. `exp` 는 IR 의 예약 수학 이름이라
 * 변수명으로 쓰지 않고 `topExp` · `curExp` 로 적었다.
 *
 * ── phase 어휘 (C3)
 *
 *   'bias' | 'range' | 'min-normal' | 'gap' | 'ticks' | 'store'
 *   `algorithm.ts` 가 발신하는 집합과 정확히 같다. `powTwo` 는 셈의 바닥이라
 *   어느 phase 에도 속하지 않는다 (phase 없는 문은 하이라이트되지 않을 뿐이다).
 */

import type { IR, IRBinOp, IRExpr, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const DBL: IRType = { kind: 'double' };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const vr = (name: string): IRExpr => ({ kind: 'var', name });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

export const floatingPointImperativeIR: IR = {
  id: 'floating-point-imperative',
  algorithm: 'floatingPoint',
  paradigm: 'imperative',
  functions: [
    // ── 2의 거듭제곱. IR 에 pow 가 없으므로 곱셈 루프로 만든다.
    {
      name: 'powTwo',
      params: [{ name: 'n', type: INT }],
      returnType: INT,
      body: [
        { kind: 'var', name: 'p', type: INT, init: lit(1) },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: vr('n'),
          inclusive: false,
          body: [{ kind: 'assign', target: vr('p'), expr: bin('*', vr('p'), lit(2)) }],
        },
        { kind: 'return', expr: vr('p') },
      ],
    },

    // ── 치우침 = 2^(e-1) - 1
    {
      name: 'biasOf',
      params: [{ name: 'expBits', type: INT }],
      returnType: INT,
      body: [
        {
          kind: 'var',
          name: 'half',
          type: INT,
          init: call('powTwo', [bin('-', vr('expBits'), lit(1))]),
          phase: 'bias',
        },
        { kind: 'return', expr: bin('-', vr('half'), lit(1)), phase: 'bias' },
      ],
    },

    // ── 1.0 바로 옆 수까지의 간격 = 2^(-m)
    {
      name: 'unitOf',
      params: [{ name: 'manBits', type: INT }],
      returnType: DBL,
      body: [
        {
          kind: 'comment',
          text: '나눗셈 루프다. 1 / powTwo(manBits) 는 정적 언어에서 정수 나눗셈이 되어 0 이 된다.',
        },
        { kind: 'var', name: 'u', type: DBL, init: lit(1), phase: 'gap' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: vr('manBits'),
          inclusive: false,
          phase: 'gap',
          body: [
            { kind: 'assign', target: vr('u'), expr: bin('/', vr('u'), lit(2)), phase: 'gap' },
          ],
        },
        { kind: 'return', expr: vr('u'), phase: 'gap' },
      ],
    },

    // ── 1 과 2 사이에 놓이는 값의 개수 = 2^m
    {
      name: 'tickCountOf',
      params: [{ name: 'manBits', type: INT }],
      returnType: INT,
      body: [{ kind: 'return', expr: call('powTwo', [vr('manBits')]), phase: 'ticks' }],
    },

    // ── 가장 작은 정규값 = 2^(1 - 치우침)
    {
      name: 'minNormalOf',
      params: [{ name: 'expBits', type: INT }],
      returnType: DBL,
      body: [
        {
          kind: 'var',
          name: 'bias',
          type: INT,
          init: call('biasOf', [vr('expBits')]),
          phase: 'min-normal',
        },
        { kind: 'var', name: 'small', type: DBL, init: lit(1), phase: 'min-normal' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: bin('-', vr('bias'), lit(1)),
          inclusive: false,
          phase: 'min-normal',
          body: [
            {
              kind: 'assign',
              target: vr('small'),
              expr: bin('/', vr('small'), lit(2)),
              phase: 'min-normal',
            },
          ],
        },
        { kind: 'return', expr: vr('small'), phase: 'min-normal' },
      ],
    },

    // ── 담는 최대값 = (2 - 2^(-m)) * 2^(가장 큰 지수)
    {
      name: 'maxValueOf',
      params: [
        { name: 'expBits', type: INT },
        { name: 'manBits', type: INT },
      ],
      returnType: DBL,
      body: [
        {
          kind: 'var',
          name: 'bias',
          type: INT,
          init: call('biasOf', [vr('expBits')]),
          phase: 'range',
        },
        {
          kind: 'comment',
          text: '지수 비트가 전부 1 인 것은 무한대·NaN 자리로 빼 둔다.',
        },
        {
          kind: 'var',
          name: 'topField',
          type: INT,
          init: bin('-', call('powTwo', [vr('expBits')]), lit(2)),
          phase: 'range',
        },
        {
          kind: 'var',
          name: 'topExp',
          type: INT,
          init: bin('-', vr('topField'), vr('bias')),
          phase: 'range',
        },
        {
          kind: 'var',
          name: 'scale',
          type: INT,
          init: call('powTwo', [vr('topExp')]),
          phase: 'range',
        },
        {
          kind: 'var',
          name: 'unit',
          type: DBL,
          init: call('unitOf', [vr('manBits')]),
          phase: 'range',
        },
        {
          kind: 'return',
          expr: bin('*', bin('-', lit(2), vr('unit')), vr('scale')),
          phase: 'range',
        },
      ],
    },

    // ── 어떤 실수를 이 형식에 담았을 때 실제로 저장되는 값
    {
      name: 'storedValueOf',
      params: [
        { name: 'x', type: DBL },
        { name: 'expBits', type: INT },
        { name: 'manBits', type: INT },
      ],
      returnType: DBL,
      body: [
        { kind: 'comment', text: 'x > 0 전제. 가장 가까운 표현 가능값으로 맞춘다.' },
        {
          kind: 'var',
          name: 'bias',
          type: INT,
          init: call('biasOf', [vr('expBits')]),
          phase: 'store',
        },
        {
          kind: 'var',
          name: 'topField',
          type: INT,
          init: bin('-', call('powTwo', [vr('expBits')]), lit(2)),
          phase: 'store',
        },
        {
          kind: 'var',
          name: 'topExp',
          type: INT,
          init: bin('-', vr('topField'), vr('bias')),
          phase: 'store',
        },
        {
          kind: 'var',
          name: 'unit',
          type: DBL,
          init: call('unitOf', [vr('manBits')]),
          phase: 'store',
        },
        {
          kind: 'var',
          name: 'topValue',
          type: DBL,
          init: call('maxValueOf', [vr('expBits'), vr('manBits')]),
          phase: 'store',
        },
        {
          kind: 'if',
          cond: bin('>', vr('x'), vr('topValue')),
          then: [{ kind: 'return', expr: vr('topValue'), phase: 'store' }],
          phase: 'store',
        },
        {
          kind: 'var',
          name: 'lo',
          type: DBL,
          init: call('minNormalOf', [vr('expBits')]),
          phase: 'store',
        },
        {
          kind: 'comment',
          text: '가장 작은 정규값 아래는 이 화면의 주장 밖이라 0 으로 본다.',
        },
        {
          kind: 'if',
          cond: bin('<', vr('x'), vr('lo')),
          then: [{ kind: 'return', expr: lit(0), phase: 'store' }],
          phase: 'store',
        },
        {
          kind: 'comment',
          text: 'x 가 놓이는 이진 구간을 찾는다. && 는 짧은 회로가 아니라 if 를 겹친다.',
        },
        {
          kind: 'var',
          name: 'curExp',
          type: INT,
          init: bin('-', lit(1), vr('bias')),
          phase: 'store',
        },
        {
          kind: 'while',
          cond: bin('<', vr('curExp'), vr('topExp')),
          phase: 'store',
          body: [
            {
              kind: 'if',
              cond: bin('<', vr('x'), bin('*', vr('lo'), lit(2))),
              then: [{ kind: 'break', phase: 'store' }],
              phase: 'store',
            },
            { kind: 'assign', target: vr('lo'), expr: bin('*', vr('lo'), lit(2)), phase: 'store' },
            {
              kind: 'assign',
              target: vr('curExp'),
              expr: bin('+', vr('curExp'), lit(1)),
              phase: 'store',
            },
          ],
        },
        {
          kind: 'var',
          name: 'step',
          type: DBL,
          init: bin('*', vr('lo'), vr('unit')),
          phase: 'store',
        },
        {
          kind: 'comment',
          text: 'floor 는 double 을 돌려준다. int 슬롯에 담으면 java 와 C# 이 컴파일되지 않는다.',
        },
        {
          kind: 'var',
          name: 'k',
          type: DBL,
          init: call('floor', [bin('+', bin('/', vr('x'), vr('step')), lit(0.5))]),
          phase: 'store',
        },
        {
          kind: 'var',
          name: 'stored',
          type: DBL,
          init: bin('*', vr('k'), vr('step')),
          phase: 'store',
        },
        {
          kind: 'if',
          cond: bin('>', vr('stored'), vr('topValue')),
          then: [{ kind: 'return', expr: vr('topValue'), phase: 'store' }],
          phase: 'store',
        },
        { kind: 'return', expr: vr('stored'), phase: 'store' },
      ],
    },
  ],
};

export const floatingPointIRs: IR[] = [floatingPointImperativeIR];
