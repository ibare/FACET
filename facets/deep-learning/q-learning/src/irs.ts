/**
 * Q-러닝의 명령형 IR — 고르기 · 탐욕 · 갱신 셋.
 *
 * algorithm.ts 의 chooseAction · greedyAction · qUpdate 와 한 벌이다 (식의 차례까지 같다).
 * 생성기는 IR 에 두지 않는다 — 곱이 32 비트를 넘는다. 뽑힌 주사위 값을 매개변수로 받고,
 * 탐험이 아니어서 방향 주사위를 뽑지 않은 이동에는 부르는 쪽이 −1 을 넘긴다.
 * Q 는 여덟 칸 목록 (색인 2·s + a) 으로 받아 그 자리에서 고친다.
 *
 * phase: choose (chooseAction · greedyAction 의 모든 문) · update (qUpdate 의 모든 문)
 */
import type { IR, IRExpr, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const BOOL: IRType = { kind: 'bool' };
const LIST_DOUBLE: IRType = { kind: 'list', of: DOUBLE };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | boolean): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '<' | '>' | '>=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
/** 2·s + a 꼴의 색인 */
const slot = (s: string, a: IRExpr): IRExpr => bin('+', bin('*', lit(2), v(s)), a);

export const qLearningImperativeIR: IR = {
  id: 'q-learning-imperative',
  algorithm: 'qLearning',
  paradigm: 'imperative',
  functions: [
    {
      name: 'chooseAction',
      params: [
        { name: 'q', type: LIST_DOUBLE },
        { name: 's', type: INT },
        { name: 'uExplore', type: DOUBLE },
        { name: 'uDir', type: DOUBLE },
        { name: 'epsilon', type: DOUBLE },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'explore with probability epsilon: a random direction' },
        {
          kind: 'if',
          cond: bin('<', v('uExplore'), v('epsilon')),
          then: [
            { kind: 'if', cond: bin('<', v('uDir'), lit(0.5)), then: [{ kind: 'return', expr: lit(0), phase: 'choose' }], phase: 'choose' },
            { kind: 'return', expr: lit(1), phase: 'choose' },
          ],
          phase: 'choose',
        },
        { kind: 'comment', text: 'otherwise exploit what the table already says' },
        { kind: 'return', expr: { kind: 'call', fn: 'greedyAction', args: [v('q'), v('s')] }, phase: 'choose' },
      ],
    },
    {
      name: 'greedyAction',
      params: [
        { name: 'q', type: LIST_DOUBLE },
        { name: 's', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'a tie goes left (action 0)' },
        {
          kind: 'if',
          cond: bin('>=', at('q', slot('s', lit(0))), at('q', slot('s', lit(1)))),
          then: [{ kind: 'return', expr: lit(0), phase: 'choose' }],
          phase: 'choose',
        },
        { kind: 'return', expr: lit(1), phase: 'choose' },
      ],
    },
    {
      name: 'qUpdate',
      params: [
        { name: 'q', type: LIST_DOUBLE },
        { name: 's', type: INT },
        { name: 'a', type: INT },
        { name: 'reward', type: DOUBLE },
        { name: 's2', type: INT },
        { name: 'terminal', type: BOOL },
        { name: 'alpha', type: DOUBLE },
        { name: 'gamma', type: DOUBLE },
      ],
      returnType: DOUBLE,
      body: [
        { kind: 'comment', text: 'target = r, plus the discounted best of the next cell unless it ends the episode' },
        { kind: 'var', name: 'target', type: DOUBLE, init: v('reward'), phase: 'update' },
        {
          kind: 'if',
          cond: { kind: 'unop', op: '!', x: v('terminal') },
          then: [
            { kind: 'var', name: 'best', type: DOUBLE, init: at('q', slot('s2', lit(0))), phase: 'update' },
            {
              kind: 'if',
              cond: bin('>', at('q', slot('s2', lit(1))), v('best')),
              then: [{ kind: 'assign', target: v('best'), expr: at('q', slot('s2', lit(1))), phase: 'update' }],
              phase: 'update',
            },
            { kind: 'assign', target: v('target'), expr: bin('+', v('reward'), bin('*', v('gamma'), v('best'))), phase: 'update' },
          ],
          phase: 'update',
        },
        { kind: 'comment', text: 'move Q(s, a) a step of alpha toward the target' },
        { kind: 'var', name: 'i', type: INT, init: slot('s', v('a')), phase: 'update' },
        {
          kind: 'assign',
          target: at('q', v('i')),
          expr: bin('+', at('q', v('i')), bin('*', v('alpha'), bin('-', v('target'), at('q', v('i'))))),
          phase: 'update',
        },
        { kind: 'return', expr: at('q', v('i')), phase: 'update' },
      ],
    },
  ],
};

export const qLearningIRs: IR[] = [qLearningImperativeIR];
