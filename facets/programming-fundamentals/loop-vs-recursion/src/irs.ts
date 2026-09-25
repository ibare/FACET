/**
 * loop-vs-recursion IR — 같은 셈 1² + … + n² 을 두 함수로. 첫 함수가 진입점이다.
 *
 * 여섯 언어가 같은 뜻이다(정수 · while · 재귀 부르기). 재귀 한도처럼 언어마다 다르게 행동하는 것은
 * IR 로 보이지 않는다 — 설명 글이 말한다. 중간값 최대 91 (n = 6) — 32 비트와 멀다.
 *
 * phase 어휘 (algorithm.ts 와 정확히 같다):
 *   loop-init · loop-check · loop-add · loop-return · rec-check · rec-base · rec-recurse
 */
import type { IR, IRExpr } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });

export const loopVsRecursionImperativeIR: IR = {
  id: 'loop-vs-recursion-imperative',
  algorithm: 'loopVsRecursion',
  paradigm: 'imperative',
  functions: [
    {
      name: 'sumSquaresLoop',
      params: [{ name: 'n', type: INT }],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'one frame: the body jumps back to the check' },
        { kind: 'var', name: 'acc', type: INT, init: lit(0), phase: 'loop-init' },
        { kind: 'var', name: 'k', type: INT, init: lit(1), phase: 'loop-init' },
        {
          kind: 'while',
          cond: { kind: 'binop', op: '<=', l: v('k'), r: v('n') },
          phase: 'loop-check',
          body: [
            {
              kind: 'assign',
              target: v('acc'),
              expr: { kind: 'binop', op: '+', l: v('acc'), r: { kind: 'binop', op: '*', l: v('k'), r: v('k') } },
              phase: 'loop-add',
            },
            {
              kind: 'assign',
              target: v('k'),
              expr: { kind: 'binop', op: '+', l: v('k'), r: lit(1) },
              phase: 'loop-add',
            },
          ],
        },
        { kind: 'return', expr: v('acc'), phase: 'loop-return' },
      ],
    },
    {
      name: 'sumSquaresRec',
      params: [{ name: 'n', type: INT }],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'one new frame per call, until n reaches 0' },
        {
          kind: 'if',
          cond: { kind: 'binop', op: '==', l: v('n'), r: lit(0) },
          phase: 'rec-check',
          then: [{ kind: 'return', expr: lit(0), phase: 'rec-base' }],
        },
        {
          kind: 'return',
          expr: {
            kind: 'binop',
            op: '+',
            l: { kind: 'binop', op: '*', l: v('n'), r: v('n') },
            r: { kind: 'call', fn: 'sumSquaresRec', args: [{ kind: 'binop', op: '-', l: v('n'), r: lit(1) }] },
          },
          phase: 'rec-recurse',
        },
      ],
    },
  ],
};

export const loopVsRecursionIRs: IR[] = [loopVsRecursionImperativeIR];
