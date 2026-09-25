/**
 * processState 의 IR — 한 틱의 차례를 그대로 펴서 CPU 이용률을 셈한다.
 *
 * IR 은 배열을 만들 수 없으므로 `state` · `left` · `queuedAt` · `totals` 를 매개변수로 받는다(부르는 쪽이
 * 길이 n 이상으로 만든다). 상태는 정수 0 준비 · 1 실행 · 2 대기. 준비 줄은 큐 없이 줄 선 틱 배열로 편다 —
 * 맨 앞 = 준비된 것 가운데 queuedAt 이 가장 작은 것, 같으면 번호 작은 것.
 *
 * totals[0] = cpu-busy, totals[1] = ready-wait, totals[2] = 빈 틱. 돌려주는 값 = cpu-utilization.
 * phase 일곱: setup · block · wake · dispatch · run · idle · percent (algorithm.ts 와 같다).
 * pick 찾기 줄과 줄 틱 세기 줄은 틱마다 도는 줄이라 phase 를 달지 않는다.
 */
import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const INT_LIST = { kind: 'list', of: INT } as const;

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '*' | '//' | '<' | '>=' | '==', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target, expr } : { kind: 'assign', target, expr, phase };
const inc = (target: IRExpr, by: number, phase?: string): IRStmt => set(target, bin(by < 0 ? '-' : '+', target, n(Math.abs(by))), phase);

const MINUS_ONE: IRExpr = { kind: 'unop', op: '-', x: n(1) };

const body: IRStmt[] = [
  { kind: 'comment', text: 'one CPU; each process runs cpuBurst ticks then waits ioBurst ticks on its own device' },
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: v('n'),
    inclusive: false,
    phase: 'setup',
    body: [
      set(at('state', v('i')), n(0), 'setup'),
      set(at('left', v('i')), v('cpuBurst'), 'setup'),
      set(at('queuedAt', v('i')), n(0), 'setup'),
    ],
  },
  set(at('totals', n(0)), n(0), 'setup'),
  set(at('totals', n(1)), n(0), 'setup'),
  set(at('totals', n(2)), n(0), 'setup'),
  { kind: 'var', name: 'running', type: INT, init: MINUS_ONE, phase: 'setup' },
  {
    kind: 'for-range',
    var: 'tick',
    from: n(0),
    to: v('horizon'),
    inclusive: false,
    body: [
      { kind: 'comment', text: 'a process that used up its CPU burst starts I/O and sleeps' },
      {
        kind: 'if',
        cond: bin('>=', v('running'), n(0)),
        then: [
          {
            kind: 'if',
            cond: bin('==', at('left', v('running')), n(0)),
            phase: 'block',
            then: [
              set(at('state', v('running')), n(2), 'block'),
              set(at('left', v('running')), v('ioBurst'), 'block'),
              set(v('running'), MINUS_ONE, 'block'),
            ],
          },
        ],
      },
      { kind: 'comment', text: 'finished I/O wakes and joins the end of the ready queue' },
      {
        kind: 'for-range',
        var: 'i',
        from: n(0),
        to: v('n'),
        inclusive: false,
        body: [
          {
            kind: 'if',
            cond: bin('==', at('state', v('i')), n(2)),
            then: [
              {
                kind: 'if',
                cond: bin('==', at('left', v('i')), n(0)),
                phase: 'wake',
                then: [
                  set(at('state', v('i')), n(0), 'wake'),
                  set(at('left', v('i')), v('cpuBurst'), 'wake'),
                  set(at('queuedAt', v('i')), v('tick'), 'wake'),
                ],
              },
            ],
          },
        ],
      },
      { kind: 'comment', text: 'an idle CPU takes the front of the ready queue' },
      {
        kind: 'if',
        cond: bin('<', v('running'), n(0)),
        then: [
          { kind: 'var', name: 'pick', type: INT, init: MINUS_ONE },
          {
            kind: 'for-range',
            var: 'i',
            from: n(0),
            to: v('n'),
            inclusive: false,
            body: [
              {
                kind: 'if',
                cond: bin('==', at('state', v('i')), n(0)),
                then: [
                  {
                    kind: 'if',
                    cond: bin('<', v('pick'), n(0)),
                    then: [set(v('pick'), v('i'))],
                    else: [
                      {
                        kind: 'if',
                        cond: bin('<', at('queuedAt', v('i')), at('queuedAt', v('pick'))),
                        then: [set(v('pick'), v('i'))],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            kind: 'if',
            cond: bin('>=', v('pick'), n(0)),
            phase: 'dispatch',
            then: [set(v('running'), v('pick'), 'dispatch'), set(at('state', v('pick')), n(1), 'dispatch')],
          },
        ],
      },
      { kind: 'comment', text: 'one tick of CPU, or one idle tick' },
      {
        kind: 'if',
        cond: bin('>=', v('running'), n(0)),
        then: [inc(at('left', v('running')), -1, 'run'), inc(at('totals', n(0)), 1, 'run')],
        else: [inc(at('totals', n(2)), 1, 'idle')],
      },
      { kind: 'comment', text: 'ready processes wait one tick; sleeping ones count down their I/O' },
      {
        kind: 'for-range',
        var: 'i',
        from: n(0),
        to: v('n'),
        inclusive: false,
        body: [
          { kind: 'if', cond: bin('==', at('state', v('i')), n(0)), then: [inc(at('totals', n(1)), 1)] },
          { kind: 'if', cond: bin('==', at('state', v('i')), n(2)), then: [inc(at('left', v('i')), -1)] },
        ],
      },
    ],
  },
  {
    kind: 'return',
    expr: bin('//', bin('+', bin('*', at('totals', n(0)), n(100)), bin('//', v('horizon'), n(2))), v('horizon')),
    phase: 'percent',
  },
];

export const processStateImperativeIR: IR = {
  id: 'process-state-imperative',
  algorithm: 'processState',
  paradigm: 'imperative',
  functions: [
    {
      name: 'cpuUtilization',
      params: [
        { name: 'n', type: INT },
        { name: 'cpuBurst', type: INT },
        { name: 'ioBurst', type: INT },
        { name: 'horizon', type: INT },
        { name: 'state', type: INT_LIST },
        { name: 'left', type: INT_LIST },
        { name: 'queuedAt', type: INT_LIST },
        { name: 'totals', type: INT_LIST },
      ],
      returnType: INT,
      body,
    },
  ],
};

export const processStateIRs: IR[] = [processStateImperativeIR];
