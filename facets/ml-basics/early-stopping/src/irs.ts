/**
 * early-stopping IR — 학습(SGD)까지 편다.
 *
 * 곱 · 합 · 비교뿐이라 여섯 언어가 algorithm.ts 와 같은 차례로 셈한다 (합은 j 차례, `eta * err * x` 는
 * (η·e)·x). 판정 여유(|검증 − 가장 좋던 값| ≥ 0.0027)가 끝자리 차이보다 훨씬 크다.
 *
 * 진입 `earlyStop(xtr, ytr, xva, yva, order, epochs, d, eta, patience, w, bestW, marks) → double`
 *   - xtr · xva 는 펼친 목록 (점 i 의 특징 j = x[i·d + j]), order 는 펼친 차례 (에폭 e 의 q 번째 = order[(e − 1)·n + q])
 *   - w · bestW 는 길이 d 의 버퍼, marks 는 길이 2 의 int 버퍼 → marks[0] 가장 좋던 에폭 · marks[1] 멈춘 에폭 (안 멈추면 −1)
 *   - 돌려주는 값 = 되돌린 검증 손실. 끝에서 w 에 bestW 를 복사한다
 *
 * phase: start · improve · wait · stop · restore (algorithm.ts 와 같다). SGD 와 valLoss 의 줄에는 달지 않는다.
 */
import type { IR } from '@ffacet/core';
import type { IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const DBL: IRType = { kind: 'double' };
const VOID: IRType = { kind: 'void' };
const DLIST: IRType = { kind: 'list', of: DBL };
const ILIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '/' | '<' | '>=' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const decl = (name: string, type: IRType, init: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'var', name, type, init } : { kind: 'var', name, type, init, phase };
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target, expr } : { kind: 'assign', target, expr, phase };
const loop = (name: string, from: IRExpr, to: IRExpr, body: IRStmt[], inclusive = false, phase?: string): IRStmt =>
  phase === undefined
    ? { kind: 'for-range', var: name, from, to, inclusive, body }
    : { kind: 'for-range', var: name, from, to, inclusive, body, phase };

/** x[i·d + j] */
const feat = (arr: string, i: IRExpr): IRExpr => at(arr, bin('+', bin('*', i, v('d')), v('j')));

/** p = 0 ; j 차례로 p = p + w[j]·x[i·d + j] */
const predict = (arr: string, i: IRExpr): IRStmt[] => [
  decl('p', DBL, n(0.0)),
  loop('j', n(0), v('d'), [set(v('p'), bin('+', v('p'), bin('*', at('w', v('j')), feat(arr, i))))]),
];

const sgdEpochFn = {
  name: 'sgdEpoch',
  params: [
    { name: 'xtr', type: DLIST },
    { name: 'ytr', type: DLIST },
    { name: 'order', type: ILIST },
    { name: 'e', type: INT },
    { name: 'd', type: INT },
    { name: 'eta', type: DBL },
    { name: 'w', type: DLIST },
  ],
  returnType: VOID,
  body: [
    { kind: 'comment', text: 'one pass over the training points, in the order of epoch e' },
    decl('n', INT, { kind: 'len', of: v('ytr') }),
    loop('q', n(0), v('n'), [
      decl('i', INT, at('order', bin('+', bin('*', bin('-', v('e'), n(1)), v('n')), v('q')))),
      ...predict('xtr', v('i')),
      decl('err', DBL, bin('-', v('p'), at('ytr', v('i')))),
      { kind: 'comment', text: 'gradient at the weights before this update' },
      loop('j', n(0), v('d'), [
        set(at('w', v('j')), bin('-', at('w', v('j')), bin('*', bin('*', v('eta'), v('err')), feat('xtr', v('i'))))),
      ]),
    ]),
  ],
} satisfies IR['functions'][number];

const valLossFn = {
  name: 'valLoss',
  params: [
    { name: 'xva', type: DLIST },
    { name: 'yva', type: DLIST },
    { name: 'w', type: DLIST },
    { name: 'd', type: INT },
  ],
  returnType: DBL,
  body: [
    { kind: 'comment', text: 'mean of (y_hat - y)^2 / 2' },
    decl('m', INT, { kind: 'len', of: v('yva') }),
    decl('s', DBL, n(0.0)),
    loop('i', n(0), v('m'), [
      ...predict('xva', v('i')),
      decl('err', DBL, bin('-', v('p'), at('yva', v('i')))),
      set(v('s'), bin('+', v('s'), bin('*', v('err'), v('err')))),
    ]),
    decl('denom', DBL, bin('*', n(2), v('m'))),
    { kind: 'return', expr: bin('/', v('s'), v('denom')) },
  ],
} satisfies IR['functions'][number];

const earlyStopFn = {
  name: 'earlyStop',
  params: [
    { name: 'xtr', type: DLIST },
    { name: 'ytr', type: DLIST },
    { name: 'xva', type: DLIST },
    { name: 'yva', type: DLIST },
    { name: 'order', type: ILIST },
    { name: 'epochs', type: INT },
    { name: 'd', type: INT },
    { name: 'eta', type: DBL },
    { name: 'patience', type: INT },
    { name: 'w', type: DLIST },
    { name: 'bestW', type: DLIST },
    { name: 'marks', type: ILIST },
  ],
  returnType: DBL,
  body: [
    { kind: 'comment', text: 'epoch 0: the starting weights are the first best' },
    decl('best', DBL, call('valLoss', [v('xva'), v('yva'), v('w'), v('d')]), 'start'),
    set(at('marks', n(0)), n(0), 'start'),
    set(at('marks', n(1)), { kind: 'unop', op: '-', x: n(1) }, 'start'),
    decl('waited', INT, n(0), 'start'),
    loop('e', n(1), v('epochs'), [
      { kind: 'expr-stmt', expr: call('sgdEpoch', [v('xtr'), v('ytr'), v('order'), v('e'), v('d'), v('eta'), v('w')]) },
      decl('val', DBL, call('valLoss', [v('xva'), v('yva'), v('w'), v('d')])),
      {
        kind: 'if',
        cond: bin('<', v('val'), v('best')),
        then: [
          { kind: 'comment', text: 'strictly smaller: move the best mark here' },
          set(v('best'), v('val'), 'improve'),
          set(at('marks', n(0)), v('e'), 'improve'),
          set(v('waited'), n(0), 'improve'),
          loop('j', n(0), v('d'), [set(at('bestW', v('j')), at('w', v('j')), 'improve')], false, 'improve'),
        ],
        else: [
          set(v('waited'), bin('+', v('waited'), n(1)), 'wait'),
          {
            kind: 'if',
            cond: bin('>=', v('waited'), v('patience')),
            then: [
              set(at('marks', n(1)), v('e'), 'stop'),
              { kind: 'break', phase: 'stop' },
            ],
            phase: 'stop',
          },
        ],
      },
    ], true),
    { kind: 'comment', text: 'restore: use the weights of the best epoch' },
    loop('j', n(0), v('d'), [set(at('w', v('j')), at('bestW', v('j')), 'restore')], false, 'restore'),
    { kind: 'return', expr: v('best'), phase: 'restore' },
  ],
} satisfies IR['functions'][number];

export const earlyStoppingImperativeIR: IR = {
  id: 'early-stopping-imperative',
  algorithm: 'earlyStopping',
  paradigm: 'imperative',
  functions: [earlyStopFn, sgdEpochFn, valLossFn],
};

export const earlyStoppingIRs: IR[] = [earlyStoppingImperativeIR];
