/**
 * Paxos IR — 코드 패널이 보이는 셈. 화면과 같은 답(정해진 값)을 낸다.
 *
 * 수락자 상태는 세 버퍼 `promised` · `accN` · `accV` — 부르는 쪽이 수락자 수만큼 0 으로 만들어 건넨다
 * (`accN` 0 = 받아들인 것 없음). 진입 함수 `runPaxos(early, qa, qb, …)` 는 정해진 값을, 없으면 -1 을 돌려준다.
 * 닿는 차례는 algorithm.ts 와 같다 — P1 prepare 둘 · P1 accept 둘 사이 `early` 자리에 P2 prepare 둘 · P2 accept 둘.
 *
 * phase — promise · pick · accept · reject · chosen (algorithm.ts 와 같은 집합)
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '//' | '>' | '>=' | '==' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const STATE = ['promised', 'accN', 'accV'];
const stateArgs = (): IRExpr[] => STATE.map(v);
const stateParams = STATE.map((name) => ({ name, type: INTS }));

/** prepare(n) 가 x 에 닿는다 — 늘 약속을 받는 자료라 else 가 없다 */
const promiseAt = (x: string): IRStmt => ({
  kind: 'if',
  cond: bin('>', v('n'), at('promised', v(x))),
  then: [set(at('promised', v(x)), v('n'), 'promise')],
  phase: 'promise',
});

/** 실려 온 받아들인 것 중 번호가 가장 큰 것의 값을 고른다 */
const pickFrom = (x: string): IRStmt => ({
  kind: 'if',
  cond: bin('>', at('accN', v(x)), v('best')),
  then: [set(v('best'), at('accN', v(x)), 'pick'), set(v('val'), at('accV', v(x)), 'pick')],
  phase: 'pick',
});

const acceptCall = (n: number, value: IRExpr, target: IRExpr): IRStmt => ({
  kind: 'expr-stmt',
  expr: call('accept', [lit(n), value, target, ...stateArgs()]),
});

const prepareCall = (): IRStmt =>
  set(v('v2'), call('preparePair', [lit(2), lit(9), v('qa'), v('qb'), ...stateArgs()]));

export const paxosImperativeIR: IR = {
  id: 'paxos-imperative',
  algorithm: 'paxos',
  paradigm: 'imperative',
  functions: [
    {
      name: 'runPaxos',
      params: [
        { name: 'early', type: INT },
        { name: 'qa', type: INT },
        { name: 'qb', type: INT },
        ...stateParams,
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'P1 (number 1, value 7) asks A1 and A2' },
        { kind: 'var', name: 'v1', type: INT, init: call('preparePair', [lit(1), lit(7), lit(0), lit(1), ...stateArgs()]) },
        { kind: 'var', name: 'v2', type: INT, init: lit(9) },
        { kind: 'comment', text: "P2's prepares arrive after `early` of P1's accepts" },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: lit(2),
          inclusive: false,
          body: [
            { kind: 'if', cond: bin('==', v('i'), v('early')), then: [prepareCall()] },
            acceptCall(1, v('v1'), v('i')),
          ],
        },
        { kind: 'if', cond: bin('==', v('early'), lit(2)), then: [prepareCall()] },
        acceptCall(2, v('v2'), v('qa')),
        acceptCall(2, v('v2'), v('qb')),
        { kind: 'return', expr: call('chosen', [v('accN'), v('accV')]) },
      ],
    },
    {
      name: 'preparePair',
      params: [
        { name: 'n', type: INT },
        { name: 'own', type: INT },
        { name: 'a', type: INT },
        { name: 'b', type: INT },
        ...stateParams,
      ],
      returnType: INT,
      body: [
        promiseAt('a'),
        promiseAt('b'),
        { kind: 'comment', text: 'send the highest-numbered accepted value, else our own' },
        { kind: 'var', name: 'best', type: INT, init: lit(0), phase: 'pick' },
        { kind: 'var', name: 'val', type: INT, init: v('own'), phase: 'pick' },
        pickFrom('a'),
        pickFrom('b'),
        { kind: 'return', expr: v('val'), phase: 'pick' },
      ],
    },
    {
      name: 'accept',
      params: [
        { name: 'n', type: INT },
        { name: 'v', type: INT },
        { name: 'a', type: INT },
        ...stateParams,
      ],
      returnType: INT,
      body: [
        {
          kind: 'if',
          cond: bin('>=', v('n'), at('promised', v('a'))),
          then: [
            set(at('promised', v('a')), v('n'), 'accept'),
            set(at('accN', v('a')), v('n'), 'accept'),
            set(at('accV', v('a')), v('v'), 'accept'),
            { kind: 'return', expr: lit(1), phase: 'accept' },
          ],
          phase: 'accept',
        },
        { kind: 'return', expr: lit(0), phase: 'reject' },
      ],
    },
    {
      name: 'chosen',
      params: [
        { name: 'accN', type: INTS },
        { name: 'accV', type: INTS },
      ],
      returnType: INT,
      body: [
        {
          kind: 'var',
          name: 'majority',
          type: INT,
          init: bin('+', bin('//', { kind: 'len', of: v('accN') }, lit(2)), lit(1)),
          phase: 'chosen',
        },
        {
          kind: 'for-range',
          var: 'a',
          from: lit(0),
          to: { kind: 'len', of: v('accN') },
          inclusive: false,
          phase: 'chosen',
          body: [
            { kind: 'var', name: 'same', type: INT, init: lit(0) },
            {
              kind: 'for-range',
              var: 'b',
              from: lit(0),
              to: { kind: 'len', of: v('accN') },
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: bin(
                    '&&',
                    bin('&&', bin('>', at('accN', v('a')), lit(0)), bin('==', at('accN', v('b')), at('accN', v('a')))),
                    bin('==', at('accV', v('b')), at('accV', v('a'))),
                  ),
                  then: [set(v('same'), bin('+', v('same'), lit(1)))],
                },
              ],
            },
            {
              kind: 'if',
              cond: bin('>=', v('same'), v('majority')),
              then: [{ kind: 'return', expr: at('accV', v('a')), phase: 'chosen' }],
            },
          ],
        },
        { kind: 'return', expr: { kind: 'unop', op: '-', x: lit(1) }, phase: 'chosen' },
      ],
    },
  ],
};

export const paxosIRs: IR[] = [paxosImperativeIR];
