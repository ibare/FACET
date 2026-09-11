/**
 * fastPower 의 IR — 두 방법이 치르는 곱셈을 센다.
 *
 * ── 무엇을 IR 로 셈할지: 값이 아니라 횟수다
 *
 * **IR 은 여섯 언어로 번역되고 그중 셋(C++ · 자바 · C#)은 정수 폭이 유한하다.**
 * 중간값이 2,147,483,647 을 넘으면 그 셋에서만 답이 달라지고, 그러면 코드 패널이
 * 화면과 다른 수를 말한다. 거듭제곱은 그 천장에 **손잡이 두 칸 만에 닿는다** —
 * 밑 3 에서 3¹³ = 1,594,323 까지는 안전하지만 3²⁰ = 3,486,784,401 이 이미 넘고,
 * 3¹⁰⁰⁰ 은 배정도 부동소수의 범위(약 1.8 × 10³⁰⁸)마저 넘어 어느 언어에서도 담기지
 * 않는다. `double` 로 피하려 해도 이번에는 파이썬이 갈린다 — 파이썬의 정수는 폭이
 * 무한이라 혼자 정확한 값을 내놓는다. **어느 쪽으로 가도 여섯이 한 답을 내지 못한다.**
 *
 * 그래서 **값을 셈하지 않는다.** 세는 것은 곱셈 횟수뿐이고, 그러면 모든 중간값이
 * 지수 이하(가장 큰 손잡이에서 1000)라 여섯 언어가 한 답을 낸다. 이 화면의 주
 * 수치가 절약 — 곱셈 횟수의 차이 — 이므로 **주장과도 결이 맞는다.**
 *
 * 손잡이 상한을 낮춰 값을 살리는 길도 있었다. 그러면 절약 3 → 984 라는 폭이
 * 사라져 손잡이가 약해진다. **폭을 지키고 값을 버렸다.**
 *
 * ── 화면과의 간극
 *
 * **없다.** 화면은 값을 수로 적지 않는다 — 답은 `3¹³` 처럼 어깨수로만 적히고 그것은
 * 셈한 수가 아니라 표기다. 화면에 뜨는 수는 곱셈 횟수 · 절약 · 이진 표기 · 자릿값
 * 넷뿐이고 전부 여기 세 함수가 내는 것과 같다. `test/fast-power.test.ts` 가 손잡이
 * 여섯 자리 전부에서 대조한다.
 *
 * ── 어휘
 *
 * **곱셈(`*`)이 한 번도 나오지 않는다.** 남은 것은 `+` 와 정수 나눗셈 `//` 와
 * 나머지 `%` 뿐이고 모든 값이 지수 이하라, 넘칠 자리가 **구조적으로** 없다. 그
 * 사실도 테스트가 잠근다 — 뒷사람이 값을 셈하는 줄을 더하면 거기서 걸린다.
 *
 * `&&` 는 `ir-interpreter` 에서 짧은 회로가 아니라 오른쪽이 늘 셈해지므로 아예 쓰지
 * 않는다. 반복 조건은 `n > 0` 하나뿐이고 나머지 판정은 `if` 로 포갰다.
 *
 * phase 어휘는 `algorithm.ts` 와 집합이 완전히 일치해야 한다 (C3) —
 * `naive` · `test` · `take` · `square`.
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });

/** `n % 2 == 1` — 이 자리의 이진수가 1 인가. */
const bitIsOne: IRExpr = {
  kind: 'binop',
  op: '==',
  l: { kind: 'binop', op: '%', l: v('n'), r: lit(2) },
  r: lit(1),
};

/** `n = n // 2` — 다음 자리로. 정수 나눗셈이라 파이썬에서도 실수가 되지 않는다. */
const halveN: IRStmt = {
  kind: 'assign',
  target: v('n'),
  expr: { kind: 'binop', op: '//', l: v('n'), r: lit(2) },
};

/** `mults = mults + 1` — 곱셈 하나를 센다. */
const countOne = (phase: string): IRStmt => ({
  kind: 'assign',
  target: v('mults'),
  expr: { kind: 'binop', op: '+', l: v('mults'), r: lit(1) },
  phase,
});

export const fastPowerImperativeIR: IR = {
  id: 'fast-power-imperative',
  algorithm: 'fastPower',
  paradigm: 'imperative',
  functions: [
    // ── 하나씩 곱는 쪽. 밑에서 시작해 밑을 지수−1 번 곱한다.
    //    반복을 펴 두는 것은 그 수가 어디서 나오는지가 이 함수의 전부이기 때문이다.
    {
      name: 'slowCost',
      params: [{ name: 'exp', type: INT }],
      returnType: INT,
      body: [
        { kind: 'var', name: 'mults', type: INT, init: lit(0) },
        { kind: 'comment', text: 'one multiplication per step, which is where exp - 1 comes from' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(1),
          to: v('exp'),
          inclusive: false,
          body: [countOne('naive')],
        },
        { kind: 'return', expr: v('mults') },
      ],
    },

    // ── 제곱을 쌓는 쪽. 이진수의 1 자리에서만 답에 곱하고, 자리를 옮길 때마다 제곱한다.
    {
      name: 'fastCost',
      params: [{ name: 'exp', type: INT }],
      returnType: INT,
      body: [
        { kind: 'var', name: 'mults', type: INT, init: lit(0) },
        { kind: 'var', name: 'n', type: INT, init: v('exp') },
        {
          kind: 'while',
          cond: { kind: 'binop', op: '>', l: v('n'), r: lit(0) },
          body: [
            {
              kind: 'comment',
              text: 'a 1 digit costs one multiplication into the answer',
            },
            {
              kind: 'if',
              cond: bitIsOne,
              then: [countOne('take')],
              phase: 'test',
            },
            halveN,
            {
              kind: 'comment',
              text: 'moving to the next digit costs one squaring, and doubles the reach',
            },
            {
              kind: 'if',
              cond: { kind: 'binop', op: '>', l: v('n'), r: lit(0) },
              then: [countOne('square')],
            },
          ],
        },
        { kind: 'comment', text: 'one per binary digit, plus one for every digit that is 1' },
        { kind: 'return', expr: v('mults') },
      ],
    },

    // ── 화면이 견주는 수. 손잡이를 밀 때 이것만 완전 단조로 커진다.
    {
      name: 'saved',
      params: [{ name: 'exp', type: INT }],
      returnType: INT,
      body: [
        {
          kind: 'return',
          expr: {
            kind: 'binop',
            op: '-',
            l: { kind: 'call', fn: 'slowCost', args: [v('exp')] },
            r: { kind: 'call', fn: 'fastCost', args: [v('exp')] },
          },
        },
      ],
    },
  ],
};

export const fastPowerIRs: IR[] = [fastPowerImperativeIR];
