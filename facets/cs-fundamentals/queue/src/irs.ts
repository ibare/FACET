/**
 * Queue 학습용 IR.
 *
 * 표현 코드 (Python-like 가짜코드):
 *
 *   def run_queue(initial, capacity, scenario):
 *       q = []
 *       for v in initial:
 *           queue_push(v)                           # phase: enqueue
 *
 *       for step in scenario:                        # phase: scenario-loop
 *           if step.op == 'enqueue':
 *               if bounded && size(q) >= capacity:  # phase: overflow-check
 *                   signal_overflow(step.value)
 *               else:
 *                   queue_push(step.value)           # phase: enqueue
 *           elif step.op == 'dequeue':
 *               if is_empty(q):                      # phase: underflow-check
 *                   signal_underflow()
 *               else:
 *                   queue_pop()                      # phase: dequeue
 *           elif step.op == 'peek':
 *               if is_empty(q):                      # phase: underflow-check
 *                   signal_underflow()
 *               else:
 *                   queue_front()                    # phase: peek
 *
 *   # phase: done  (loop 종료)
 *
 * phase 어휘는 algorithm.ts 의 emit('phase', ...) 와 동일해야 한다 (C3).
 * 어휘 집합: enqueue / dequeue / peek / overflow-check / underflow-check /
 *           scenario-loop / done
 *
 * 'done' 은 함수 말미의 명시적 return 에 phase 로 부여한다 (coinchange/irs.ts
 * 와 동일 패턴). algorithm 의 `phase:'done'` silent emit 이 이 IRStmt 를
 * 하이라이트 타깃으로 삼는다.
 *
 * IR 는 복합 분기가 길어지면 가독성이 떨어지므로 각 branch 를 compact 한
 * if/elif 체인 대신 4 개의 수평 if 로 전개했다 (동일 의미, 언어별 emit 도
 * 단순).
 */

import type { IR, IRExpr, IRStmt, IRType } from '@facet/core';

const tInt: IRType = { kind: 'int' };
const tVoid: IRType = { kind: 'void' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | string | boolean): IRExpr => ({ kind: 'lit', value });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (
  op: '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

export const queueImperativeIR: IR = {
  id: 'queue-imperative',
  algorithm: 'queue',
  paradigm: 'imperative',
  functions: [
    {
      name: 'run_queue',
      params: [
        { name: 'n_initial', type: tInt },
        { name: 'n_scenario', type: tInt },
        { name: 'capacity', type: tInt },
      ],
      returnType: tVoid,
      body: [
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: v('n_initial'),
          inclusive: false,
          body: [
            {
              kind: 'expr-stmt',
              phase: 'enqueue',
              expr: call('queue_push', [call('initial_at', [v('i')])]),
            },
          ],
        },
        {
          kind: 'for-range',
          var: 's',
          from: lit(0),
          to: v('n_scenario'),
          inclusive: false,
          phase: 'scenario-loop',
          body: [
            {
              kind: 'if',
              phase: 'enqueue',
              cond: call('is_enqueue_op', [v('s')]),
              then: [
                {
                  kind: 'if',
                  phase: 'overflow-check',
                  cond: bin('>=', call('queue_size', []), v('capacity')),
                  then: [
                    {
                      kind: 'expr-stmt',
                      expr: call('signal_overflow', [call('scenario_value', [v('s')])]),
                    },
                  ],
                  else: [
                    {
                      kind: 'expr-stmt',
                      phase: 'enqueue',
                      expr: call('queue_push', [call('scenario_value', [v('s')])]),
                    },
                  ],
                },
              ],
            },
            {
              kind: 'if',
              phase: 'dequeue',
              cond: call('is_dequeue_op', [v('s')]),
              then: [
                {
                  kind: 'if',
                  phase: 'underflow-check',
                  cond: call('is_empty', []),
                  then: [
                    { kind: 'expr-stmt', expr: call('signal_underflow', []) },
                  ],
                  else: [
                    {
                      kind: 'expr-stmt',
                      phase: 'dequeue',
                      expr: call('queue_pop', []),
                    },
                  ],
                },
              ],
            },
            {
              kind: 'if',
              phase: 'peek',
              cond: call('is_peek_op', [v('s')]),
              then: [
                {
                  kind: 'if',
                  phase: 'underflow-check',
                  cond: call('is_empty', []),
                  then: [
                    { kind: 'expr-stmt', expr: call('signal_underflow', []) },
                  ],
                  else: [
                    {
                      kind: 'expr-stmt',
                      phase: 'peek',
                      expr: call('queue_front', []),
                    },
                  ],
                },
              ],
            },
          ],
        },
        { kind: 'return', phase: 'done' },
      ] satisfies IRStmt[],
    },
  ],
};

export const queueIRs: IR[] = [queueImperativeIR];
