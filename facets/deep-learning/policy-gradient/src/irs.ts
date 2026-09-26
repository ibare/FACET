/**
 * policy-gradient 의 IR — 알고리즘의 셈 함수 넷(`softmaxInto` · `sampleActionOf` · `baselineValueOf` ·
 * `reinforceInto`)과 같은 모양, 같은 차례.
 *
 * 난수 생성기는 IR 에 두지 않는다 — 곱이 32 비트를 넘는다. `sampleAction` 은 뽑힌 u 를 매개변수로 받는다.
 * 버퍼(π)는 부르는 쪽이 만들어 넘긴다 (IR 함수는 배열을 만들 수 없다).
 *
 * phase: `policy` (softmax · sampleAction) · `update` (baselineValue · reinforce)
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const VOID: IRType = { kind: 'void' };
const DOUBLES: IRType = { kind: 'list', of: DOUBLE };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const len = (arr: string): IRExpr => ({ kind: 'len', of: v(arr) });
const bin = (op: '+' | '-' | '*' | '/' | '<' | '>' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

function softmaxBody(): IRStmt[] {
  const P = 'policy';
  return [
    { kind: 'comment', text: 'pi = softmax(theta): subtract the max, exponentiate, normalise' },
    { kind: 'var', name: 'm', type: DOUBLE, init: at('theta', lit(0)), phase: P },
    {
      kind: 'for-range', var: 'i', from: lit(1), to: len('theta'), inclusive: false, phase: P,
      body: [{ kind: 'assign', target: v('m'), expr: call('max', v('m'), at('theta', v('i'))), phase: P }],
    },
    { kind: 'var', name: 'total', type: DOUBLE, init: lit(0), phase: P },
    {
      kind: 'for-range', var: 'i', from: lit(0), to: len('theta'), inclusive: false, phase: P,
      body: [
        { kind: 'assign', target: at('pi', v('i')), expr: call('exp', bin('-', at('theta', v('i')), v('m'))), phase: P },
        { kind: 'assign', target: v('total'), expr: bin('+', v('total'), at('pi', v('i'))), phase: P },
      ],
    },
    {
      kind: 'for-range', var: 'i', from: lit(0), to: len('theta'), inclusive: false, phase: P,
      body: [{ kind: 'assign', target: at('pi', v('i')), expr: bin('/', at('pi', v('i')), v('total')), phase: P }],
    },
  ];
}

function sampleActionBody(): IRStmt[] {
  const P = 'policy';
  return [
    { kind: 'comment', text: 'first action whose cumulative probability exceeds u; the last action takes the rest' },
    { kind: 'var', name: 'acc', type: DOUBLE, init: lit(0), phase: P },
    {
      kind: 'for-range', var: 'i', from: lit(0), to: bin('-', len('pi'), lit(1)), inclusive: false, phase: P,
      body: [
        { kind: 'assign', target: v('acc'), expr: bin('+', v('acc'), at('pi', v('i'))), phase: P },
        { kind: 'if', cond: bin('<', v('u'), v('acc')), then: [{ kind: 'return', expr: v('i'), phase: P }], phase: P },
      ],
    },
    { kind: 'return', expr: bin('-', len('pi'), lit(1)), phase: P },
  ];
}

function baselineValueBody(): IRStmt[] {
  const U = 'update';
  return [
    { kind: 'comment', text: 'mean return of the episodes before this one; 0 when unused or on the first episode' },
    {
      kind: 'if', cond: bin('==', v('useBaseline'), lit(1)), phase: U,
      then: [
        {
          kind: 'if', cond: bin('>', v('count'), lit(0)), phase: U,
          then: [{ kind: 'return', expr: bin('/', v('sumReward'), v('count')), phase: U }],
        },
      ],
    },
    { kind: 'return', expr: lit(0), phase: U },
  ];
}

function reinforceBody(): IRStmt[] {
  const U = 'update';
  return [
    { kind: 'comment', text: 'REINFORCE: theta_b += alpha * (G - baseline) * (1[b == a] - pi_b), pi before the update' },
    { kind: 'var', name: 'adv', type: DOUBLE, init: bin('-', v('reward'), v('baseline')), phase: U },
    {
      kind: 'for-range', var: 'i', from: lit(0), to: len('theta'), inclusive: false, phase: U,
      body: [
        { kind: 'var', name: 'ind', type: DOUBLE, init: lit(0), phase: U },
        { kind: 'if', cond: bin('==', v('i'), v('action')), then: [{ kind: 'assign', target: v('ind'), expr: lit(1), phase: U }], phase: U },
        {
          kind: 'assign',
          target: at('theta', v('i')),
          expr: bin('+', at('theta', v('i')), bin('*', bin('*', v('alpha'), v('adv')), bin('-', v('ind'), at('pi', v('i'))))),
          phase: U,
        },
      ],
    },
  ];
}

export const policyGradientImperativeIR: IR = {
  id: 'policy-gradient-imperative',
  algorithm: 'policyGradient',
  paradigm: 'imperative',
  functions: [
    {
      name: 'softmax',
      params: [{ name: 'theta', type: DOUBLES }, { name: 'pi', type: DOUBLES }],
      returnType: VOID,
      body: softmaxBody(),
    },
    {
      name: 'sampleAction',
      params: [{ name: 'pi', type: DOUBLES }, { name: 'u', type: DOUBLE }],
      returnType: INT,
      body: sampleActionBody(),
    },
    {
      name: 'baselineValue',
      params: [
        { name: 'sumReward', type: DOUBLE },
        { name: 'count', type: INT },
        { name: 'useBaseline', type: INT },
      ],
      returnType: DOUBLE,
      body: baselineValueBody(),
    },
    {
      name: 'reinforce',
      params: [
        { name: 'theta', type: DOUBLES },
        { name: 'pi', type: DOUBLES },
        { name: 'action', type: INT },
        { name: 'reward', type: DOUBLE },
        { name: 'baseline', type: DOUBLE },
        { name: 'alpha', type: DOUBLE },
      ],
      returnType: VOID,
      body: reinforceBody(),
    },
  ],
};

export const policyGradientIRs: IR[] = [policyGradientImperativeIR];
