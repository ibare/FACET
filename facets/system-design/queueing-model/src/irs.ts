/**
 * queueing-model 의 IR — Lindley 점화식으로 요청마다 기다림과 줄을 센다.
 *
 * 진입 함수 settle(gap, service, wait, line) → 기다린 요청 수.
 *   gap · service  double 배열 (읽기) — 뽑기(−ln 포함)는 algorithm 이 IR 밖에서 한다
 *   wait           double 버퍼 — 요청마다 기다림
 *   line           int 버퍼 — 요청마다 도착한 때 줄에 선 수 (처리 중인 하나는 세지 않는다)
 *
 * max(0, w + s − g) 는 `w < 0` 이면 0 으로 자르는 꼴로 적는다. 정수 리터럴 0 이 C++ 에서 `std::max(0, double)`
 * 로 옮겨져 인자 타입이 갈리기 때문이다. 값은 같다.
 *
 * phase: serve-now (else 가지의 wait[i] = 0.0) · wait-in-line (then 가지의 waited += 1) · sum-up (return waited).
 */
import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const DOUBLE = { kind: 'double' } as const;
const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '>' | '<', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });

const body: IRStmt[] = [
  { kind: 'comment', text: 'samples are drawn outside: gap[i] and service[i] arrive as numbers' },
  { kind: 'var', name: 'w', type: DOUBLE, init: n(0) },
  { kind: 'var', name: 'arrive', type: DOUBLE, init: n(0) },
  { kind: 'var', name: 'waited', type: INT, init: n(0) },
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: { kind: 'len', of: v('gap') },
    inclusive: false,
    body: [
      { kind: 'assign', target: v('arrive'), expr: bin('+', v('arrive'), at('gap', v('i'))) },
      { kind: 'comment', text: 'Lindley: w = max(0, previous wait + previous service - gap)' },
      {
        kind: 'if',
        cond: bin('>', v('i'), n(0)),
        then: [
          {
            kind: 'assign',
            target: v('w'),
            expr: bin('-', bin('+', v('w'), at('service', bin('-', v('i'), n(1)))), at('gap', v('i'))),
          },
          {
            kind: 'if',
            cond: bin('<', v('w'), n(0)),
            then: [{ kind: 'assign', target: v('w'), expr: n(0) }],
          },
        ],
      },
      {
        kind: 'if',
        cond: bin('>', v('w'), n(0)),
        then: [
          { kind: 'assign', target: at('wait', v('i')), expr: v('w') },
          { kind: 'assign', target: v('waited'), expr: bin('+', v('waited'), n(1)), phase: 'wait-in-line' },
        ],
        else: [{ kind: 'assign', target: at('wait', v('i')), expr: n(0), phase: 'serve-now' }],
      },
      { kind: 'comment', text: 'line: earlier requests that have not started when request i arrives' },
      { kind: 'var', name: 'count', type: INT, init: n(0) },
      { kind: 'var', name: 'earlier', type: DOUBLE, init: n(0) },
      {
        kind: 'for-range',
        var: 'j',
        from: n(0),
        to: v('i'),
        inclusive: false,
        body: [
          { kind: 'assign', target: v('earlier'), expr: bin('+', v('earlier'), at('gap', v('j'))) },
          {
            kind: 'if',
            cond: bin('>', bin('+', v('earlier'), at('wait', v('j'))), v('arrive')),
            then: [{ kind: 'assign', target: v('count'), expr: bin('+', v('count'), n(1)) }],
          },
        ],
      },
      { kind: 'assign', target: at('line', v('i')), expr: v('count') },
    ],
  },
  { kind: 'return', expr: v('waited'), phase: 'sum-up' },
];

export const queueingModelImperativeIR: IR = {
  id: 'queueing-model-imperative',
  algorithm: 'queueingModel',
  paradigm: 'imperative',
  functions: [
    {
      name: 'settle',
      params: [
        { name: 'gap', type: { kind: 'list', of: DOUBLE } },
        { name: 'service', type: { kind: 'list', of: DOUBLE } },
        { name: 'wait', type: { kind: 'list', of: DOUBLE } },
        { name: 'line', type: { kind: 'list', of: INT } },
      ],
      returnType: INT,
      body,
    },
  ],
};

export const queueingModelIRs: IR[] = [queueingModelImperativeIR];
