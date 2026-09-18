/**
 * 코드 패널 IR — 벌점 · 온도 · 소프트맥스 · 선형 합동 난수 · 뽑기.
 *
 * algorithm.ts 와 **같은 차례 · 같은 식**으로 셈한다. 그래야 마지막 자리까지 같다.
 *
 *   sampleCounts(logits, used, temperature, penalty, seed, draws, counts, weights): int
 *     logits · weights 는 double 배열, used · counts 는 int 배열 (부르는 쪽이 길이 7 로 만든다).
 *     counts 에 후보별 뽑힌 수를 채우고 가짓수를 돌려준다.
 *   nextState(state): int
 *     (state * 75 + 74) % 65537. 곱은 지역 변수에 담는다.
 *
 * 여섯 언어의 벽:
 *   - 정수를 정수로 나누지 않는다 — u 는 double 지역 변수에 상태를 먼저 담고 65537 로 나눈다.
 *   - exp 의 결과는 double 슬롯에만. 1 등 % 의 반올림은 IR 에 두지 않는다.
 *   - 정수 중간값 최대는 난수 곱 61482 × 75 + 74 = 4,611,224 (이 데이터). 상태가 65536 이어도
 *     4,915,274 — int32 안.
 *
 * phase 어휘 (algorithm.ts 와 같은 집합): penalize · scale · softmax · draw · tally
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

type IRFunc = IR['functions'][number];

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const INT_LIST: IRType = { kind: 'list', of: INT };
const DOUBLE_LIST: IRType = { kind: 'list', of: DOUBLE };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const len = (arr: string): IRExpr => ({ kind: 'len', of: v(arr) });
const bin = (op: '+' | '-' | '*' | '/' | '%' | '<' | '>' | '==', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

const decl = (name: string, type: IRType, init: IRExpr, phase: string): IRStmt => ({
  kind: 'var',
  name,
  type,
  init,
  phase,
});
const put = (target: IRExpr, expr: IRExpr, phase: string): IRStmt => ({
  kind: 'assign',
  target,
  expr,
  phase,
});
const each = (name: string, from: IRExpr, to: IRExpr, body: IRStmt[], phase: string): IRStmt => ({
  kind: 'for-range',
  var: name,
  from,
  to,
  inclusive: false,
  body,
  phase,
});

const nextStateFn: IRFunc = {
  name: 'nextState',
  params: [{ name: 'state', type: INT }],
  returnType: INT,
  body: [
    decl('grown', INT, bin('*', v('state'), lit(75)), 'draw'),
    { kind: 'return', expr: bin('%', bin('+', v('grown'), lit(74)), lit(65537)), phase: 'draw' },
  ],
};

const sampleCountsFn: IRFunc = {
  name: 'sampleCounts',
  params: [
    { name: 'logits', type: DOUBLE_LIST },
    { name: 'used', type: INT_LIST },
    { name: 'temperature', type: DOUBLE },
    { name: 'penalty', type: DOUBLE },
    { name: 'seed', type: INT },
    { name: 'draws', type: INT },
    { name: 'counts', type: INT_LIST },
    { name: 'weights', type: DOUBLE_LIST },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'Penalty first: cut the words already used (divide if positive, multiply otherwise)' },
    each(
      'i',
      lit(0),
      len('logits'),
      [
        decl('z', DOUBLE, at('logits', v('i')), 'penalize'),
        {
          kind: 'if',
          cond: bin('==', at('used', v('i')), lit(1)),
          then: [
            {
              kind: 'if',
              cond: bin('>', v('z'), lit(0)),
              then: [put(v('z'), bin('/', v('z'), v('penalty')), 'penalize')],
              else: [put(v('z'), bin('*', v('z'), v('penalty')), 'penalize')],
              phase: 'penalize',
            },
          ],
          phase: 'penalize',
        },
        put(at('weights', v('i')), v('z'), 'penalize'),
      ],
      'penalize',
    ),
    { kind: 'comment', text: 'Temperature second: divide every value by T' },
    each(
      'i',
      lit(0),
      len('weights'),
      [put(at('weights', v('i')), bin('/', at('weights', v('i')), v('temperature')), 'scale')],
      'scale',
    ),
    { kind: 'comment', text: 'Softmax: subtract the largest, take exp, divide by the sum' },
    decl('top', DOUBLE, at('weights', lit(0)), 'softmax'),
    each('i', lit(1), len('weights'), [put(v('top'), call('max', v('top'), at('weights', v('i'))), 'softmax')], 'softmax'),
    decl('total', DOUBLE, lit(0), 'softmax'),
    each(
      'i',
      lit(0),
      len('weights'),
      [
        put(at('weights', v('i')), call('exp', bin('-', at('weights', v('i')), v('top'))), 'softmax'),
        put(v('total'), bin('+', v('total'), at('weights', v('i'))), 'softmax'),
      ],
      'softmax',
    ),
    each(
      'i',
      lit(0),
      len('weights'),
      [put(at('weights', v('i')), bin('/', at('weights', v('i')), v('total')), 'softmax')],
      'softmax',
    ),
    { kind: 'comment', text: 'Draw draws times with the same seed: the first candidate whose running sum exceeds u' },
    each('i', lit(0), len('counts'), [put(at('counts', v('i')), lit(0), 'draw')], 'draw'),
    decl('state', INT, v('seed'), 'draw'),
    each(
      'n',
      lit(0),
      v('draws'),
      [
        put(v('state'), call('nextState', v('state')), 'draw'),
        decl('s', DOUBLE, v('state'), 'draw'),
        decl('u', DOUBLE, bin('/', v('s'), lit(65537)), 'draw'),
        decl('pick', INT, bin('-', len('weights'), lit(1)), 'draw'),
        decl('acc', DOUBLE, lit(0), 'draw'),
        each(
          'i',
          lit(0),
          len('weights'),
          [
            put(v('acc'), bin('+', v('acc'), at('weights', v('i'))), 'draw'),
            {
              kind: 'if',
              cond: bin('<', v('u'), v('acc')),
              then: [put(v('pick'), v('i'), 'draw'), { kind: 'break', phase: 'draw' }],
              phase: 'draw',
            },
          ],
          'draw',
        ),
        put(at('counts', v('pick')), bin('+', at('counts', v('pick')), lit(1)), 'draw'),
      ],
      'draw',
    ),
    { kind: 'comment', text: 'Distinct: how many candidates were drawn at least once' },
    decl('distinct', INT, lit(0), 'tally'),
    each(
      'i',
      lit(0),
      len('counts'),
      [
        {
          kind: 'if',
          cond: bin('>', at('counts', v('i')), lit(0)),
          then: [put(v('distinct'), bin('+', v('distinct'), lit(1)), 'tally')],
          phase: 'tally',
        },
      ],
      'tally',
    ),
    { kind: 'return', expr: v('distinct'), phase: 'tally' },
  ],
};

export const temperatureSamplingImperativeIR: IR = {
  id: 'temperature-sampling-imperative',
  algorithm: 'temperatureSampling',
  paradigm: 'imperative',
  functions: [sampleCountsFn, nextStateFn],
};

export const temperatureSamplingIRs: IR[] = [temperatureSamplingImperativeIR];
