/**
 * 레이트 리미팅 IR — 코드 패널이 여섯 언어로 옮기는 제한기.
 *
 * `limitRequests(method, burst, arriveTick, lastTick, passTick, accepted, bucket) → int`
 * - arriveTick: 요청마다 도착 틱(오름차순, 읽기) · passTick: 결과 버퍼(지나간 틱, 거절 −1) ·
 *   accepted: 창 둘이 받은 틱을 적는 버퍼 · bucket: 누출 통(요청 번호, 머리 · 꼬리 색인)
 * - 돌려주는 것: 지나간 수. 모르는 방식은 −1 (TS 는 던진다)
 * - IR 은 배열을 만들 수 없어 버퍼는 부르는 쪽이 요청 수만큼 만든다. `&&` 가 짧은 회로가 아니라
 *   색인 확인과 읽기를 `if` 로 겹친다. `//` 는 음수 아닌 틱에만 쓴다.
 *
 * phase 는 algorithm.ts 와 같다: fixed-window · sliding-window · take-token · leak-out · reject · next-tick.
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST_INT: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '//' | '<' | '>' | '==' | '!=' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const set = (name: string, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined
    ? { kind: 'assign', target: v(name), expr }
    : { kind: 'assign', target: v(name), expr, phase };
const setAt = (arr: string, idx: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined
    ? { kind: 'assign', target: at(arr, idx), expr }
    : { kind: 'assign', target: at(arr, idx), expr, phase };
const decl = (name: string, init: IRExpr): IRStmt => ({ kind: 'var', name, type: INT, init });
const inc = (name: string): IRStmt => set(name, bin('+', v(name), n(1)));

/** 창 둘: 받은 틱을 처음부터 훑어 창 안에 든 수를 센다. */
const countWindow = (inWindow: IRExpr): IRStmt[] => [
  set('used', n(0)),
  {
    kind: 'for-range',
    var: 'k',
    from: n(0),
    to: v('acc'),
    inclusive: false,
    body: [{ kind: 'if', cond: inWindow, then: [inc('used')] }],
  },
];

const judge: IRStmt[] = [
  set('ok', n(0)),
  { kind: 'comment', text: 'fixed window: slot = tick // burst, burst per slot' },
  {
    kind: 'if',
    cond: bin('==', v('method'), n(0)),
    then: [
      ...countWindow(bin('==', bin('//', at('accepted', v('k')), v('burst')), bin('//', v('tick'), v('burst')))),
      { kind: 'if', cond: bin('<', v('used'), v('burst')), then: [set('ok', n(1), 'fixed-window')] },
    ],
  },
  { kind: 'comment', text: 'sliding window (log): accepted in (tick - burst, tick]' },
  {
    kind: 'if',
    cond: bin('==', v('method'), n(1)),
    then: [
      ...countWindow(bin('>', at('accepted', v('k')), bin('-', v('tick'), v('burst')))),
      { kind: 'if', cond: bin('<', v('used'), v('burst')), then: [set('ok', n(1), 'sliding-window')] },
    ],
  },
  { kind: 'comment', text: 'token bucket: one token per request, no waiting' },
  {
    kind: 'if',
    cond: bin('==', v('method'), n(2)),
    then: [
      {
        kind: 'if',
        cond: bin('>', v('tokens'), n(0)),
        then: [set('tokens', bin('-', v('tokens'), n(1)), 'take-token'), set('ok', n(1))],
      },
    ],
  },
  { kind: 'comment', text: 'leaky bucket (queue): join the line if it holds fewer than burst' },
  {
    kind: 'if',
    cond: bin('==', v('method'), n(3)),
    then: [
      {
        kind: 'if',
        cond: bin('<', bin('-', v('tail'), v('head')), v('burst')),
        then: [setAt('bucket', v('tail'), v('i')), inc('tail'), set('ok', n(1))],
      },
    ],
  },
  { kind: 'comment', text: 'accept or reject in one place' },
  {
    kind: 'if',
    cond: bin('==', v('ok'), n(1)),
    then: [
      {
        kind: 'if',
        cond: bin('||', bin('==', v('method'), n(0)), bin('==', v('method'), n(1))),
        then: [setAt('accepted', v('acc'), v('tick')), inc('acc')],
      },
      {
        kind: 'if',
        cond: bin('!=', v('method'), n(3)),
        then: [setAt('passTick', v('i'), v('tick')), inc('passed')],
      },
    ],
    else: [setAt('passTick', v('i'), n(-1), 'reject')],
  },
  inc('i'),
];

const tickBody: IRStmt[] = [
  { kind: 'comment', text: 'refill one token per tick, up to burst' },
  {
    kind: 'if',
    cond: bin('>', v('tick'), n(0)),
    then: [{ kind: 'if', cond: bin('<', v('tokens'), v('burst')), then: [inc('tokens')] }],
  },
  { kind: 'comment', text: 'judge this tick arrivals in order' },
  {
    kind: 'while',
    cond: bin('<', v('i'), v('count')),
    body: [
      {
        kind: 'if',
        cond: bin('==', at('arriveTick', v('i')), v('tick')),
        then: judge,
        else: [{ kind: 'break' }],
      },
    ],
  },
  { kind: 'comment', text: 'leaky bucket: the head of the line leaks out' },
  {
    kind: 'if',
    cond: bin('==', v('method'), n(3)),
    then: [
      {
        kind: 'if',
        cond: bin('<', v('head'), v('tail')),
        then: [setAt('passTick', at('bucket', v('head')), v('tick'), 'leak-out'), inc('head'), inc('passed')],
      },
    ],
  },
];

export const rateLimitingImperativeIR: IR = {
  id: 'rate-limiting-imperative',
  algorithm: 'rateLimiting',
  paradigm: 'imperative',
  functions: [
    {
      name: 'limitRequests',
      params: [
        { name: 'method', type: INT },
        { name: 'burst', type: INT },
        { name: 'arriveTick', type: LIST_INT },
        { name: 'lastTick', type: INT },
        { name: 'passTick', type: LIST_INT },
        { name: 'accepted', type: LIST_INT },
        { name: 'bucket', type: LIST_INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'method: 0 fixed window, 1 sliding window, 2 token bucket, 3 leaky bucket' },
        { kind: 'if', cond: bin('<', v('method'), n(0)), then: [{ kind: 'return', expr: n(-1) }] },
        { kind: 'if', cond: bin('>', v('method'), n(3)), then: [{ kind: 'return', expr: n(-1) }] },
        decl('count', { kind: 'len', of: v('arriveTick') }),
        decl('passed', n(0)),
        decl('tokens', v('burst')),
        decl('acc', n(0)),
        decl('head', n(0)),
        decl('tail', n(0)),
        decl('i', n(0)),
        decl('ok', n(0)),
        decl('used', n(0)),
        {
          kind: 'for-range',
          var: 'tick',
          from: n(0),
          to: v('lastTick'),
          inclusive: true,
          body: tickBody,
          phase: 'next-tick',
        },
        { kind: 'return', expr: v('passed') },
      ],
    },
  ],
};

export const rateLimitingIRs: IR[] = [rateLimitingImperativeIR];
