/**
 * HTTP 와 웹소켓 — 코드 패널의 IR.
 *
 * 함수 셋, 첫 함수가 진입점:
 * - `pollExchange` — 폴링 한 판. `tally = [요청, 빈 응답, 늦음 합]` 을 채우고 짐 아닌 바이트를 돌려준다
 * - `socketExchange` — 웹소켓 한 판. `tally[0]` 에 업그레이드 요청 하나, 짐 아닌 바이트를 돌려준다
 * - `digitCount` — 본문 길이의 자릿수 (Content-Length 값의 글자 수)
 *
 * IR 은 글자를 셀 수 없어 바이트 수는 알고리즘이 글자에서 세어 수로 건넨다.
 * `tally` 는 부르는 쪽이 길이 3 으로 0 을 채워 건넨다.
 *
 * phase 어휘 (algorithm.ts 와 정확히 같다): msg-queue · poll-empty · poll-deliver · ws-upgrade · ws-push
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '%' | '==' | '>=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });

const addTo = (target: IRExpr, amount: IRExpr, phase?: string): IRStmt =>
  phase === undefined
    ? { kind: 'assign', target, expr: bin('+', target, amount) }
    : { kind: 'assign', target, expr: bin('+', target, amount), phase };

export const httpImperativeIR: IR = {
  id: 'http-imperative',
  algorithm: 'http',
  paradigm: 'imperative',
  functions: [
    {
      name: 'pollExchange',
      params: [
        { name: 'births', type: INT_LIST },
        { name: 'period', type: INT },
        { name: 'horizon', type: INT },
        { name: 'reqBytes', type: INT },
        { name: 'emptyBytes', type: INT },
        { name: 'headBase', type: INT },
        { name: 'payload', type: INT },
        { name: 'tally', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'tally = [requests, empty responses, total delay seconds]' },
        { kind: 'var', name: 'pending', type: INT, init: n(0) },
        { kind: 'var', name: 'overhead', type: INT, init: n(0) },
        {
          kind: 'for-range',
          var: 't',
          from: n(1),
          to: v('horizon'),
          inclusive: true,
          body: [
            { kind: 'comment', text: 'every queued message waits one more second' },
            addTo(at('tally', n(2)), v('pending')),
            {
              kind: 'for-range',
              var: 'i',
              from: n(0),
              to: { kind: 'len', of: v('births') },
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: bin('==', at('births', v('i')), v('t')),
                  then: [addTo(v('pending'), n(1), 'msg-queue')],
                },
              ],
            },
            {
              kind: 'if',
              cond: bin('==', bin('%', v('t'), v('period')), n(0)),
              then: [
                addTo(at('tally', n(0)), n(1)),
                {
                  kind: 'if',
                  cond: bin('==', v('pending'), n(0)),
                  then: [
                    addTo(at('tally', n(1)), n(1)),
                    addTo(v('overhead'), bin('+', v('reqBytes'), v('emptyBytes')), 'poll-empty'),
                  ],
                  else: [
                    { kind: 'comment', text: 'body is one JSON array: brackets, payloads, commas' },
                    {
                      kind: 'var',
                      name: 'body',
                      type: INT,
                      init: bin('+', bin('+', n(2), bin('*', v('pending'), v('payload'))), bin('-', v('pending'), n(1))),
                    },
                    addTo(
                      v('overhead'),
                      bin(
                        '-',
                        bin(
                          '+',
                          bin('+', bin('+', v('reqBytes'), v('headBase')), { kind: 'call', fn: 'digitCount', args: [v('body')] }),
                          v('body'),
                        ),
                        bin('*', v('pending'), v('payload')),
                      ),
                      'poll-deliver',
                    ),
                    { kind: 'assign', target: v('pending'), expr: n(0) },
                  ],
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: v('overhead') },
      ],
    },
    {
      name: 'socketExchange',
      params: [
        { name: 'births', type: INT_LIST },
        { name: 'horizon', type: INT },
        { name: 'handshakeBytes', type: INT },
        { name: 'frameHead', type: INT },
        { name: 'tally', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'one upgrade GET, then the connection stays open' },
        addTo(at('tally', n(0)), n(1)),
        { kind: 'var', name: 'overhead', type: INT, init: v('handshakeBytes'), phase: 'ws-upgrade' },
        {
          kind: 'for-range',
          var: 't',
          from: n(1),
          to: v('horizon'),
          inclusive: true,
          body: [
            {
              kind: 'for-range',
              var: 'i',
              from: n(0),
              to: { kind: 'len', of: v('births') },
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: bin('==', at('births', v('i')), v('t')),
                  then: [
                    { kind: 'comment', text: 'server pushes a frame the second the message is born' },
                    addTo(v('overhead'), v('frameHead'), 'ws-push'),
                  ],
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: v('overhead') },
      ],
    },
    {
      name: 'digitCount',
      params: [{ name: 'x', type: INT }],
      returnType: INT,
      body: [
        { kind: 'var', name: 'd', type: INT, init: n(1) },
        {
          kind: 'while',
          cond: bin('>=', v('x'), n(10)),
          body: [
            { kind: 'assign', target: v('x'), expr: bin('//', v('x'), n(10)) },
            { kind: 'assign', target: v('d'), expr: bin('+', v('d'), n(1)) },
          ],
        },
        { kind: 'return', expr: v('d') },
      ],
    },
  ],
};

export const httpIRs: IR[] = [httpImperativeIR];
