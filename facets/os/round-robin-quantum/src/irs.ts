/**
 * round-robin-quantum IR — 틱 반복 하나 안에 틱 경계의 차례를 그대로 적는다.
 *
 * 큐가 IR 에 없으므로 줄은 queued[i] (1/0) 와 seq[i] (줄에 선 차례 번호) 두 배열로 편다. 고름은 줄에 있는 것
 * 가운데 seq 가 가장 작은 것 (FIFO). 이 IR 이 말하는 것은 "몫 다 씀 → 줄 끝" 과 "바꾸는 틱" 두 곳이다.
 *
 * 배열은 부르는 쪽이 길이 n 으로 만들어 넘긴다 (IR 은 배열을 만들 수 없다). 첫 반복이 remain · queued ·
 * start · finish 를 채우므로 넘기는 배열의 처음 값은 무엇이어도 된다. 돌린 뒤 start · finish 에 처음 돈 틱과
 * 끝난 틱이 남고 답은 바뀜 수다.
 *
 * running 이 -1 일 수 있는 자리의 색인은 if 를 중첩한다 (ir-interpreter 의 && · || 는 짧은 회로가 아니다).
 * 중간값 최대는 끝 틱 23 — 32 비트 걱정은 없다. // · % 는 쓰지 않는다.
 *
 * phase 어휘 (algorithm.ts 와 정확히 같다): arrive · dispatch · finish · requeue · switch
 */

import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const LIST = { kind: 'list', of: INT } as const;

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '<' | '>=' | '==' | '!=' | '>', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const set = (target: IRExpr, expr: IRExpr, phase: string): IRStmt => ({ kind: 'assign', target, expr, phase });
const inc = (name: string, phase: string): IRStmt => set(v(name), bin('+', v(name), n(1)), phase);
const decl = (name: string, init: IRExpr, phase: string): IRStmt => ({ kind: 'var', name, type: INT, init, phase });

export const roundRobinQuantumImperativeIR: IR = {
  id: 'round-robin-quantum-imperative',
  algorithm: 'roundRobinQuantum',
  paradigm: 'imperative',
  functions: [
    {
      name: 'roundRobin',
      params: [
        { name: 'quantum', type: INT },
        { name: 'cost', type: INT },
        { name: 'arrive', type: LIST },
        { name: 'burst', type: LIST },
        { name: 'remain', type: LIST },
        { name: 'queued', type: LIST },
        { name: 'seq', type: LIST },
        { name: 'start', type: LIST },
        { name: 'finish', type: LIST },
        { name: 'n', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: v('n'),
          inclusive: false,
          phase: 'dispatch',
          body: [
            set(at('remain', v('i')), at('burst', v('i')), 'dispatch'),
            set(at('queued', v('i')), n(0), 'dispatch'),
            set(at('start', v('i')), n(-1), 'dispatch'),
            set(at('finish', v('i')), n(-1), 'dispatch'),
          ],
        },
        decl('nextSeq', n(0), 'dispatch'),
        decl('running', n(-1), 'dispatch'),
        decl('used', n(0), 'dispatch'),
        decl('lastRan', n(-1), 'dispatch'),
        decl('switchLeft', n(0), 'dispatch'),
        decl('switches', n(0), 'dispatch'),
        decl('done', n(0), 'dispatch'),
        decl('tick', n(0), 'dispatch'),
        {
          kind: 'while',
          cond: bin('<', v('done'), v('n')),
          phase: 'dispatch',
          body: [
            { kind: 'comment', text: '1. the running one with nothing left finishes at this tick' },
            {
              kind: 'if',
              cond: bin('>=', v('running'), n(0)),
              phase: 'finish',
              then: [
                {
                  kind: 'if',
                  cond: bin('==', at('remain', v('running')), n(0)),
                  phase: 'finish',
                  then: [
                    set(at('finish', v('running')), v('tick'), 'finish'),
                    inc('done', 'finish'),
                    set(v('running'), n(-1), 'finish'),
                  ],
                },
              ],
            },
            { kind: 'comment', text: '2. slice used up: step down, but do not queue yet' },
            decl('down', n(-1), 'requeue'),
            {
              kind: 'if',
              cond: bin('>=', v('running'), n(0)),
              phase: 'requeue',
              then: [
                {
                  kind: 'if',
                  cond: bin('>=', v('used'), v('quantum')),
                  phase: 'requeue',
                  then: [set(v('down'), v('running'), 'requeue'), set(v('running'), n(-1), 'requeue')],
                },
              ],
            },
            { kind: 'comment', text: '3. arrivals join the back of the line' },
            {
              kind: 'for-range',
              var: 'i',
              from: n(0),
              to: v('n'),
              inclusive: false,
              phase: 'arrive',
              body: [
                {
                  kind: 'if',
                  cond: bin('==', at('arrive', v('i')), v('tick')),
                  phase: 'arrive',
                  then: [
                    set(at('queued', v('i')), n(1), 'arrive'),
                    set(at('seq', v('i')), v('nextSeq'), 'arrive'),
                    inc('nextSeq', 'arrive'),
                  ],
                },
              ],
            },
            { kind: 'comment', text: '4. the one that stepped down queues behind them' },
            {
              kind: 'if',
              cond: bin('>=', v('down'), n(0)),
              phase: 'requeue',
              then: [
                set(at('queued', v('down')), n(1), 'requeue'),
                set(at('seq', v('down')), v('nextSeq'), 'requeue'),
                inc('nextSeq', 'requeue'),
              ],
            },
            { kind: 'comment', text: '6. CPU free: take the front of the line (smallest seq)' },
            {
              kind: 'if',
              cond: bin('<', v('running'), n(0)),
              phase: 'dispatch',
              then: [
                decl('best', n(-1), 'dispatch'),
                {
                  kind: 'for-range',
                  var: 'i',
                  from: n(0),
                  to: v('n'),
                  inclusive: false,
                  phase: 'dispatch',
                  body: [
                    {
                      kind: 'if',
                      cond: bin('==', at('queued', v('i')), n(1)),
                      phase: 'dispatch',
                      then: [
                        {
                          kind: 'if',
                          cond: bin('<', v('best'), n(0)),
                          phase: 'dispatch',
                          then: [set(v('best'), v('i'), 'dispatch')],
                          else: [
                            {
                              kind: 'if',
                              cond: bin('<', at('seq', v('i')), at('seq', v('best'))),
                              phase: 'dispatch',
                              then: [set(v('best'), v('i'), 'dispatch')],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  kind: 'if',
                  cond: bin('>=', v('best'), n(0)),
                  phase: 'dispatch',
                  then: [
                    set(at('queued', v('best')), n(0), 'dispatch'),
                    set(v('running'), v('best'), 'dispatch'),
                    set(v('used'), n(0), 'dispatch'),
                    {
                      kind: 'if',
                      cond: bin('>=', v('lastRan'), n(0)),
                      phase: 'switch',
                      then: [
                        {
                          kind: 'if',
                          cond: bin('!=', v('lastRan'), v('best')),
                          phase: 'switch',
                          then: [inc('switches', 'switch'), set(v('switchLeft'), v('cost'), 'switch')],
                        },
                      ],
                    },
                    set(v('lastRan'), v('best'), 'dispatch'),
                  ],
                },
              ],
            },
            { kind: 'comment', text: '7. one tick: switching work only, or one tick of the running one' },
            {
              kind: 'if',
              cond: bin('>=', v('running'), n(0)),
              phase: 'dispatch',
              then: [
                {
                  kind: 'if',
                  cond: bin('>', v('switchLeft'), n(0)),
                  phase: 'switch',
                  then: [set(v('switchLeft'), bin('-', v('switchLeft'), n(1)), 'switch')],
                  else: [
                    {
                      kind: 'if',
                      cond: bin('<', at('start', v('running')), n(0)),
                      phase: 'dispatch',
                      then: [set(at('start', v('running')), v('tick'), 'dispatch')],
                    },
                    set(at('remain', v('running')), bin('-', at('remain', v('running')), n(1)), 'dispatch'),
                    inc('used', 'dispatch'),
                  ],
                },
              ],
            },
            inc('tick', 'dispatch'),
          ],
        },
        { kind: 'return', expr: v('switches'), phase: 'finish' },
      ],
    },
  ],
};

export const roundRobinQuantumIRs: IR[] = [roundRobinQuantumImperativeIR];
