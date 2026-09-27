/**
 * number-theory IR — 뜀 수와 gcd 를 두 함수로 따로 셈한다. 첫 함수가 진입점이다.
 *
 *   orbitLength(m, a) — 0 부터 a 씩 뛰어 0 에 돌아올 때까지 실제로 뛴 수
 *   gcdSub(x, y)      — 빼기꼴 최대공약수 (두 수가 같아지면 멈춘다)
 *
 * `%` 의 두 변은 늘 음이 아니다 (pos · a ≥ 0, m ≥ 6). 중간값 최대 pos + a = 11 + 9 = 20,
 * gcdSub 의 수 ≤ 12 — 32 비트와 멀다. `||` 의 두 변에 색인이 없어 짧은 회로 문제가 없다.
 *
 * phase 어휘 (algorithm.ts 와 정확히 같다): start · jump · back · gcd
 */
import type { IR, IRExpr } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });

export const numberTheoryImperativeIR: IR = {
  id: 'number-theory-imperative',
  algorithm: 'numberTheory',
  paradigm: 'imperative',
  functions: [
    {
      name: 'orbitLength',
      params: [
        { name: 'm', type: INT },
        { name: 'a', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'start at 0 and jump a cells forward until landing on 0 again' },
        { kind: 'var', name: 'pos', type: INT, init: lit(0), phase: 'start' },
        { kind: 'var', name: 'count', type: INT, init: lit(0), phase: 'start' },
        {
          kind: 'while',
          cond: {
            kind: 'binop',
            op: '||',
            l: { kind: 'binop', op: '==', l: v('count'), r: lit(0) },
            r: { kind: 'binop', op: '!=', l: v('pos'), r: lit(0) },
          },
          phase: 'jump',
          body: [
            {
              kind: 'assign',
              target: v('pos'),
              expr: { kind: 'binop', op: '%', l: { kind: 'binop', op: '+', l: v('pos'), r: v('a') }, r: v('m') },
              phase: 'jump',
            },
            {
              kind: 'assign',
              target: v('count'),
              expr: { kind: 'binop', op: '+', l: v('count'), r: lit(1) },
              phase: 'jump',
            },
          ],
        },
        { kind: 'return', expr: v('count'), phase: 'back' },
      ],
    },
    {
      name: 'gcdSub',
      params: [
        { name: 'x', type: INT },
        { name: 'y', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'subtract the smaller from the larger until both are equal' },
        {
          kind: 'while',
          cond: { kind: 'binop', op: '!=', l: v('x'), r: v('y') },
          phase: 'gcd',
          body: [
            {
              kind: 'if',
              cond: { kind: 'binop', op: '>', l: v('x'), r: v('y') },
              phase: 'gcd',
              then: [{ kind: 'assign', target: v('x'), expr: { kind: 'binop', op: '-', l: v('x'), r: v('y') }, phase: 'gcd' }],
              else: [{ kind: 'assign', target: v('y'), expr: { kind: 'binop', op: '-', l: v('y'), r: v('x') }, phase: 'gcd' }],
            },
          ],
        },
        { kind: 'return', expr: v('x'), phase: 'gcd' },
      ],
    },
  ],
};

export const numberTheoryIRs: IR[] = [numberTheoryImperativeIR];
