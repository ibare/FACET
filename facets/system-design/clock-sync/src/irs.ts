/**
 * clock-sync IR — 메시지 열둘을 보낸 분 차례로 돌려 물리 도장 거꾸로 · 램포트 거꾸로 · 가장 큰 벌어짐을 셈한다.
 *
 * 화면과 같은 답: `result` = [물리 거꾸로, 램포트 거꾸로, 가장 큰 벌어짐] 이 계기 셋과 같다(20 조합).
 * 차례는 정렬하지 않고 **끝나지 않은 메시지 가운데 보낸 분이 가장 이른 것**을 훑어 고른다 —
 * 메시지 목록 차례를 섞어도 답이 같다. 같은 분이 둘이면 −1 (TS 는 던진다).
 * 남는 어긋남은 부르는 쪽이 (가는 − 오는)/2 로 셈해 `resid` 로 건넨다(음수 나눗셈을 IR 에 두지 않는다).
 * 배열은 부르는 쪽이 만든다 — `lamport`(프로세스 수) · `done`(메시지 수) · `result`(3).
 * 모두 정수 셈이고 중간값 최대는 17 × 60000 + 수백 (< 2^31).
 *
 * phase: send · receive · inverted (algorithm 과 같은 집합).
 * `lamport[b] <= sent` 줄은 한 번도 참이 되지 않아 phase 를 두지 않는다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '*' | '%' | '<' | '<=' | '>' | '>=' | '==' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const len = (name: string): IRExpr => ({ kind: 'len', of: v(name) });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const offsetOf = (p: IRExpr): IRExpr =>
  bin('+', bin('*', bin('*', at('rate', p), v('scale')), v('elapsed')), at('resid', p));

const body: IRStmt[] = [
  { kind: 'comment', text: 'reject a negative drift scale or resync period' },
  {
    kind: 'if',
    cond: bin('||', bin('<', v('scale'), n(0)), bin('<', v('period'), n(0))),
    then: [{ kind: 'return', expr: n(-1) }],
  },
  { kind: 'var', name: 'nProc', type: INT, init: len('rate') },
  { kind: 'var', name: 'nMsg', type: INT, init: len('sendMin') },
  {
    kind: 'for-range', var: 'i', from: n(0), to: v('nProc'), inclusive: false,
    body: [{ kind: 'assign', target: at('lamport', v('i')), expr: n(0) }],
  },
  {
    kind: 'for-range', var: 'i', from: n(0), to: v('nMsg'), inclusive: false,
    body: [{ kind: 'assign', target: at('done', v('i')), expr: n(0) }],
  },
  { kind: 'var', name: 'physical', type: INT, init: n(0) },
  { kind: 'var', name: 'lamportBack', type: INT, init: n(0) },
  { kind: 'var', name: 'widest', type: INT, init: n(0) },
  {
    kind: 'for-range', var: 'k', from: n(0), to: v('nMsg'), inclusive: false,
    body: [
      { kind: 'comment', text: 'pick the unfinished message with the earliest send minute' },
      { kind: 'var', name: 'pick', type: INT, init: n(-1) },
      { kind: 'var', name: 'tie', type: INT, init: n(0) },
      {
        kind: 'for-range', var: 'i', from: n(0), to: v('nMsg'), inclusive: false,
        body: [
          {
            kind: 'if',
            cond: bin('==', at('done', v('i')), n(0)),
            then: [
              {
                kind: 'if',
                cond: bin('==', v('pick'), n(-1)),
                then: [
                  { kind: 'assign', target: v('pick'), expr: v('i') },
                  { kind: 'assign', target: v('tie'), expr: n(0) },
                ],
                else: [
                  {
                    kind: 'if',
                    cond: bin('<', at('sendMin', v('i')), at('sendMin', v('pick'))),
                    then: [
                      { kind: 'assign', target: v('pick'), expr: v('i') },
                      { kind: 'assign', target: v('tie'), expr: n(0) },
                    ],
                    else: [
                      {
                        kind: 'if',
                        cond: bin('==', at('sendMin', v('i')), at('sendMin', v('pick'))),
                        then: [{ kind: 'assign', target: v('tie'), expr: n(1) }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      { kind: 'comment', text: 'two messages in the same minute have no order' },
      { kind: 'if', cond: bin('==', v('tie'), n(1)), then: [{ kind: 'return', expr: n(-1) }] },
      { kind: 'assign', target: at('done', v('pick')), expr: n(1) },
      { kind: 'var', name: 's', type: INT, init: at('sendMin', v('pick')) },
      { kind: 'var', name: 'a', type: INT, init: at('src', v('pick')) },
      { kind: 'var', name: 'b', type: INT, init: at('dst', v('pick')) },
      {
        kind: 'if',
        cond: bin('||', bin('||', bin('<', v('a'), n(0)), bin('>=', v('a'), v('nProc'))),
          bin('||', bin('<', v('b'), n(0)), bin('>=', v('b'), v('nProc')))),
        then: [{ kind: 'return', expr: n(-1) }],
      },
      { kind: 'comment', text: 'minutes since the last resync (period 0 = never again)' },
      { kind: 'var', name: 'elapsed', type: INT, init: v('s') },
      {
        kind: 'if',
        cond: bin('>', v('period'), n(0)),
        then: [{ kind: 'assign', target: v('elapsed'), expr: bin('%', v('s'), v('period')) }],
      },
      { kind: 'comment', text: 'widest spread of the clocks at this minute' },
      { kind: 'var', name: 'hi', type: INT, init: offsetOf(n(0)) },
      { kind: 'var', name: 'lo', type: INT, init: v('hi') },
      {
        kind: 'for-range', var: 'p', from: n(1), to: v('nProc'), inclusive: false,
        body: [
          { kind: 'var', name: 'off', type: INT, init: offsetOf(v('p')) },
          { kind: 'assign', target: v('hi'), expr: call('max', v('hi'), v('off')) },
          { kind: 'assign', target: v('lo'), expr: call('min', v('lo'), v('off')) },
        ],
      },
      {
        kind: 'if',
        cond: bin('>', bin('-', v('hi'), v('lo')), v('widest')),
        then: [{ kind: 'assign', target: v('widest'), expr: bin('-', v('hi'), v('lo')) }],
      },
      { kind: 'comment', text: 'send: stamp with the sender clock, Lamport +1' },
      { kind: 'var', name: 'sentStamp', type: INT, init: bin('+', bin('*', v('s'), n(60000)), offsetOf(v('a'))), phase: 'send' },
      { kind: 'assign', target: at('lamport', v('a')), expr: bin('+', at('lamport', v('a')), n(1)), phase: 'send' },
      { kind: 'var', name: 'sent', type: INT, init: at('lamport', v('a')), phase: 'send' },
      { kind: 'comment', text: 'receive: stamp with the receiver clock, Lamport max + 1' },
      {
        kind: 'var', name: 'recvStamp', type: INT,
        init: bin('+', bin('+', bin('*', v('s'), n(60000)), at('delay', v('pick'))), offsetOf(v('b'))),
        phase: 'receive',
      },
      {
        kind: 'assign', target: at('lamport', v('b')),
        expr: bin('+', call('max', at('lamport', v('b')), v('sent')), n(1)),
        phase: 'receive',
      },
      {
        kind: 'if',
        cond: bin('<=', at('lamport', v('b')), v('sent')),
        then: [{ kind: 'assign', target: v('lamportBack'), expr: bin('+', v('lamportBack'), n(1)) }],
      },
      { kind: 'comment', text: 'the receive stamp came before the send stamp' },
      {
        kind: 'if',
        cond: bin('<', v('recvStamp'), v('sentStamp')),
        then: [{ kind: 'assign', target: v('physical'), expr: bin('+', v('physical'), n(1)), phase: 'inverted' }],
        phase: 'inverted',
      },
    ],
  },
  { kind: 'assign', target: at('result', n(0)), expr: v('physical') },
  { kind: 'assign', target: at('result', n(1)), expr: v('lamportBack') },
  { kind: 'assign', target: at('result', n(2)), expr: v('widest') },
  { kind: 'return', expr: v('physical') },
];

export const clockSyncImperativeIR: IR = {
  id: 'clock-sync-imperative',
  algorithm: 'clockSync',
  paradigm: 'imperative',
  functions: [
    {
      name: 'clockRun',
      params: [
        { name: 'sendMin', type: INTS },
        { name: 'src', type: INTS },
        { name: 'dst', type: INTS },
        { name: 'delay', type: INTS },
        { name: 'rate', type: INTS },
        { name: 'resid', type: INTS },
        { name: 'scale', type: INT },
        { name: 'period', type: INT },
        { name: 'lamport', type: INTS },
        { name: 'done', type: INTS },
        { name: 'result', type: INTS },
      ],
      returnType: INT,
      body,
    },
  ],
};

export const clockSyncIRs: IR[] = [clockSyncImperativeIR];
