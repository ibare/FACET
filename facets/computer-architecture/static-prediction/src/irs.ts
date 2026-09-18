/**
 * 정적 예측의 IR — 결과 열을 따로 받지 않고 값 열에서 걷는다.
 *
 * 진입 `countMisses(values, policy)` 는 원소 k 마다 앞 분기(방향 0, 탄다 = 값이 0)와
 * 뒤 분기(방향 1, 탄다 = k < n − 1)를 `guess` 로 짐작해 견주고 틀린 수를 돌려준다.
 * `lostCycles` · `hitPercent` 가 나머지 두 계기를 같은 식으로 셈한다.
 *
 * 중간값 최대는 20 (분기 수), 백분율 셈의 곱이 2000 — 32비트 안이다.
 *
 * phase 어휘 (algorithm.ts 와 같다): forward-branch · backward-branch · guess · miss · tally
 */

import type { IR, IRExpr, IRStmt } from '@ffacet/core/runtime';

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const INT = { kind: 'int' } as const;

const bump = (name: string, phase: string): IRStmt => ({
  kind: 'assign',
  target: v(name),
  expr: { kind: 'binop', op: '+', l: v(name), r: lit(1) },
  phase,
});

export const staticPredictionImperativeIR: IR = {
  id: 'static-prediction-imperative',
  algorithm: 'staticPrediction',
  paradigm: 'imperative',
  functions: [
    {
      name: 'countMisses',
      params: [
        { name: 'values', type: { kind: 'list', of: INT } },
        { name: 'policy', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'n', type: INT, init: { kind: 'len', of: v('values') } },
        { kind: 'var', name: 'misses', type: INT, init: lit(0) },
        {
          kind: 'for-range',
          var: 'k',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            { kind: 'var', name: 'fwdTaken', type: INT, init: lit(0), phase: 'forward-branch' },
            {
              kind: 'if',
              cond: {
                kind: 'binop',
                op: '==',
                l: { kind: 'index', arr: v('values'), idx: v('k') },
                r: lit(0),
              },
              then: [{ kind: 'assign', target: v('fwdTaken'), expr: lit(1), phase: 'forward-branch' }],
              phase: 'forward-branch',
            },
            {
              kind: 'if',
              cond: {
                kind: 'binop',
                op: '!=',
                l: { kind: 'call', fn: 'guess', args: [v('policy'), lit(0)] },
                r: v('fwdTaken'),
              },
              then: [bump('misses', 'miss')],
              phase: 'guess',
            },
            { kind: 'var', name: 'backTaken', type: INT, init: lit(0), phase: 'backward-branch' },
            {
              kind: 'if',
              cond: {
                kind: 'binop',
                op: '<',
                l: v('k'),
                r: { kind: 'binop', op: '-', l: v('n'), r: lit(1) },
              },
              then: [{ kind: 'assign', target: v('backTaken'), expr: lit(1), phase: 'backward-branch' }],
              phase: 'backward-branch',
            },
            {
              kind: 'if',
              cond: {
                kind: 'binop',
                op: '!=',
                l: { kind: 'call', fn: 'guess', args: [v('policy'), lit(1)] },
                r: v('backTaken'),
              },
              then: [bump('misses', 'miss')],
              phase: 'guess',
            },
          ],
        },
        { kind: 'return', expr: v('misses'), phase: 'tally' },
      ],
    },
    {
      name: 'guess',
      params: [
        { name: 'policy', type: INT },
        { name: 'backward', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'if',
          cond: { kind: 'binop', op: '==', l: v('policy'), r: lit(1) },
          then: [{ kind: 'return', expr: lit(1), phase: 'guess' }],
          phase: 'guess',
        },
        {
          kind: 'if',
          cond: { kind: 'binop', op: '==', l: v('policy'), r: lit(2) },
          then: [{ kind: 'return', expr: v('backward'), phase: 'guess' }],
          phase: 'guess',
        },
        { kind: 'return', expr: lit(0), phase: 'guess' },
      ],
    },
    {
      name: 'lostCycles',
      params: [
        { name: 'misses', type: INT },
        { name: 'penalty', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'return',
          expr: { kind: 'binop', op: '*', l: v('misses'), r: v('penalty') },
          phase: 'tally',
        },
      ],
    },
    {
      name: 'hitPercent',
      params: [
        { name: 'misses', type: INT },
        { name: 'total', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'return',
          expr: {
            kind: 'binop',
            op: '//',
            l: {
              kind: 'binop',
              op: '+',
              l: {
                kind: 'binop',
                op: '*',
                l: { kind: 'binop', op: '-', l: v('total'), r: v('misses') },
                r: lit(100),
              },
              r: { kind: 'binop', op: '//', l: v('total'), r: lit(2) },
            },
            r: v('total'),
          },
          phase: 'tally',
        },
      ],
    },
  ],
};

export const staticPredictionIRs: IR[] = [staticPredictionImperativeIR];
