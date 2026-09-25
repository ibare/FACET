/**
 * congestion-control IR — 왕복 반복 전체.
 *
 * runRounds(rounds, readRate, capacity, buffer, cwnd0, ssthresh0, sent, kind) → 전달 합.
 * sent · kind 는 부르는 쪽이 rounds 길이로 0 을 채워 건넨다. 함수가 왕복마다 보냄과
 * 종류(0 슬로 스타트 · 1 혼잡 회피 · 2 받는 창이 조임 · 3 잃음)를 적는다.
 * 정수만 쓰고 `min` 만 부른다. 음수가 없고 중간값은 버퍼(16) 남짓이다.
 *
 * phase 어휘 (algorithm.ts 와 같다):
 *   slow-start-grow · avoid-grow · receiver-clamp · halve-on-loss
 */

import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const INT_LIST = { kind: 'list', of: INT } as const;

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '//' | '<' | '>' | '>=', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: string, idx: string): IRExpr => ({ kind: 'index', arr: v(arr), idx: v(idx) });
const set = (name: string, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target: v(name), expr, phase } : { kind: 'assign', target: v(name), expr };

const growBody: IRStmt[] = [
  {
    kind: 'if',
    cond: bin('<', v('cwnd'), v('ssthresh')),
    then: [set('cwnd', bin('+', v('cwnd'), n(1)), 'slow-start-grow')],
    else: [
      set('acked', bin('+', v('acked'), n(1))),
      {
        kind: 'if',
        cond: bin('>=', v('acked'), v('cwnd')),
        then: [
          set('acked', bin('-', v('acked'), v('cwnd'))),
          set('cwnd', bin('+', v('cwnd'), n(1)), 'avoid-grow'),
        ],
      },
    ],
  },
];

const roundBody: IRStmt[] = [
  { kind: 'comment', text: 'receive window = free buffer space; send the smaller window' },
  { kind: 'var', name: 'window', type: INT, init: bin('-', v('buffer'), v('unread')) },
  {
    kind: 'var',
    name: 'send',
    type: INT,
    init: { kind: 'call', fn: 'min', args: [v('cwnd'), v('window')] },
  },
  { kind: 'assign', target: at('sent', 'rd'), expr: v('send') },
  { kind: 'var', name: 'got', type: INT, init: v('send') },
  {
    kind: 'if',
    cond: bin('>', v('send'), v('capacity')),
    then: [
      { kind: 'comment', text: 'more than the link carries: this round is lost' },
      { kind: 'assign', target: at('kind', 'rd'), expr: n(3) },
      set('got', v('capacity')),
      set('ssthresh', bin('//', v('send'), n(2)), 'halve-on-loss'),
      set('cwnd', v('ssthresh')),
      set('acked', n(0)),
    ],
    else: [
      {
        kind: 'if',
        cond: bin('<', v('window'), v('cwnd')),
        then: [
          { kind: 'comment', text: 'receive window is smaller: cwnd does not grow' },
          { kind: 'assign', target: at('kind', 'rd'), expr: n(2), phase: 'receiver-clamp' },
        ],
        else: [
          {
            kind: 'if',
            cond: bin('<', v('cwnd'), v('ssthresh')),
            then: [{ kind: 'assign', target: at('kind', 'rd'), expr: n(0) }],
            else: [{ kind: 'assign', target: at('kind', 'rd'), expr: n(1) }],
          },
          { kind: 'comment', text: 'full window used: grow once per ack' },
          { kind: 'for-range', var: 'k', from: n(0), to: v('send'), inclusive: false, body: growBody },
        ],
      },
    ],
  },
  { kind: 'comment', text: 'deliver into the buffer, then the app reads' },
  set('unread', bin('+', v('unread'), v('got'))),
  {
    kind: 'var',
    name: 'taken',
    type: INT,
    init: { kind: 'call', fn: 'min', args: [v('unread'), v('readRate')] },
  },
  set('unread', bin('-', v('unread'), v('taken'))),
  set('total', bin('+', v('total'), v('got'))),
];

export const congestionControlImperativeIR: IR = {
  id: 'congestion-control-imperative',
  algorithm: 'congestionControl',
  paradigm: 'imperative',
  functions: [
    {
      name: 'runRounds',
      params: [
        { name: 'rounds', type: INT },
        { name: 'readRate', type: INT },
        { name: 'capacity', type: INT },
        { name: 'buffer', type: INT },
        { name: 'cwnd0', type: INT },
        { name: 'ssthresh0', type: INT },
        { name: 'sent', type: INT_LIST },
        { name: 'kind', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'cwnd', type: INT, init: v('cwnd0') },
        { kind: 'var', name: 'ssthresh', type: INT, init: v('ssthresh0') },
        { kind: 'var', name: 'acked', type: INT, init: n(0) },
        { kind: 'var', name: 'unread', type: INT, init: n(0) },
        { kind: 'var', name: 'total', type: INT, init: n(0) },
        { kind: 'for-range', var: 'rd', from: n(0), to: v('rounds'), inclusive: false, body: roundBody },
        { kind: 'return', expr: v('total') },
      ],
    },
  ],
};

export const congestionControlIRs: IR[] = [congestionControlImperativeIR];
