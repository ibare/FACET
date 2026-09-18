/**
 * 배치와 패딩 — 코드 패널 IR.
 *
 * 진입 `runBatch(lengths, slots, policy, holder, left, finish): int` 는 걸음 수를 돌려준다.
 * IR 함수는 배열을 만들 수 없으므로 버퍼는 부르는 쪽이 만든다.
 *   holder  길이 slots — 자리의 요청 번호, 빈자리 -1
 *   left    길이 slots — 자리의 남은 토큰
 *   finish  길이 8     — 요청마다 끝난 걸음
 *
 * 빈칸 · 가동 % · 끝난 걸음 합은 부르는 쪽이 finish 와 걸음 수에서 셈한다.
 * 정수만 다룬다. 중간값 최대는 걸음 수 48 (합 222 는 부르는 쪽).
 *
 * "빈자리가 있고 대기열이 남았으면" 은 `if` 를 중첩한다 — ir-interpreter 의 `&&` 는 짧은 회로가
 * 아니라 `lengths[waiting]` 를 끝 너머로 읽는다.
 *
 * phase: 'setup' | 'form-batch' | 'decode' | 'return-batch' | 'refill' | 'release' (algorithm.ts 와 같다, C3)
 */

import type { IR, IRBinOp, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

const decl = (name: string, init: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'var', name, type: INT, init, phase } : { kind: 'var', name, type: INT, init };
const put = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const loop = (name: string, from: IRExpr, to: IRExpr, body: IRStmt[]): IRStmt => ({
  kind: 'for-range',
  var: name,
  from,
  to,
  inclusive: false,
  body,
});

/** 묶어서 기다림 — 도착 차례로 자리 수만큼 묶고, 묶음의 가장 긴 요청이 끝날 때까지 돈다. */
const waitForBatch: IRStmt[] = [
  decl('g', lit(0)),
  {
    kind: 'while',
    cond: bin('<', v('g'), v('n')),
    body: [
      decl('hi', call('min', bin('+', v('g'), v('slots')), v('n')), 'form-batch'),
      decl('longest', lit(0), 'form-batch'),
      loop('i', v('g'), v('hi'), [
        put(at('holder', bin('-', v('i'), v('g'))), v('i'), 'form-batch'),
        put(v('longest'), call('max', v('longest'), at('lengths', v('i'))), 'form-batch'),
      ]),
      loop('t', lit(0), v('longest'), [put(v('step'), bin('+', v('step'), lit(1)), 'decode')]),
      loop('i', v('g'), v('hi'), [put(at('finish', v('i')), v('step'), 'return-batch')]),
      put(v('g'), v('hi'), 'return-batch'),
    ],
  },
  { kind: 'return', expr: v('step') },
];

/** 빈자리 채움 — 걸음 처음에 빈자리를 번호 작은 것부터 채우고, 다 낸 요청은 걸음 끝에 나간다. */
const refillSlots: IRStmt[] = [
  loop('s', lit(0), v('slots'), [put(at('holder', v('s')), lit(-1)), put(at('left', v('s')), lit(0))]),
  decl('waiting', lit(0)),
  decl('busy', lit(0)),
  {
    kind: 'while',
    cond: bin('||', bin('<', v('waiting'), v('n')), bin('>', v('busy'), lit(0))),
    body: [
      loop('s', lit(0), v('slots'), [
        {
          kind: 'if',
          cond: bin('==', at('holder', v('s')), lit(-1)),
          then: [
            {
              kind: 'if',
              cond: bin('<', v('waiting'), v('n')),
              then: [
                put(at('holder', v('s')), v('waiting'), 'refill'),
                put(at('left', v('s')), at('lengths', v('waiting')), 'refill'),
                put(v('waiting'), bin('+', v('waiting'), lit(1)), 'refill'),
                put(v('busy'), bin('+', v('busy'), lit(1)), 'refill'),
              ],
            },
          ],
        },
      ]),
      put(v('step'), bin('+', v('step'), lit(1)), 'decode'),
      loop('s', lit(0), v('slots'), [
        {
          kind: 'if',
          cond: bin('!=', at('holder', v('s')), lit(-1)),
          then: [
            put(at('left', v('s')), bin('-', at('left', v('s')), lit(1)), 'decode'),
            {
              kind: 'if',
              cond: bin('==', at('left', v('s')), lit(0)),
              then: [
                put(at('finish', at('holder', v('s'))), v('step'), 'release'),
                put(at('holder', v('s')), lit(-1), 'release'),
                put(v('busy'), bin('-', v('busy'), lit(1)), 'release'),
              ],
            },
          ],
        },
      ]),
    ],
  },
  { kind: 'return', expr: v('step') },
];

export const batchingAndPaddingImperativeIR: IR = {
  id: 'batching-and-padding-imperative',
  algorithm: 'batchingAndPadding',
  paradigm: 'imperative',
  functions: [
    {
      name: 'runBatch',
      params: [
        { name: 'lengths', type: INT_LIST },
        { name: 'slots', type: INT },
        { name: 'policy', type: INT },
        { name: 'holder', type: INT_LIST },
        { name: 'left', type: INT_LIST },
        { name: 'finish', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        decl('n', { kind: 'len', of: v('lengths') }, 'setup'),
        decl('step', lit(0), 'setup'),
        { kind: 'if', cond: bin('==', v('policy'), lit(0)), then: waitForBatch },
        ...refillSlots,
      ],
    },
  ],
};

export const batchingAndPaddingIRs: IR[] = [batchingAndPaddingImperativeIR];
