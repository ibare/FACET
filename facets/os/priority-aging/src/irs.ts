/**
 * priority-aging 의 코드 패널 IR — 비선점 우선순위 스케줄에 에이징을 더한 것.
 *
 * 틱 반복 하나 안에 틱 경계의 차례(끝 → 도착 → 고름 → 한 틱 돌기)를 그대로 적는다. 큐가 IR 에 없으니 줄은
 * `queued`(1/0) 와 `seq`(줄에 선 차례) 두 배열로 편다. 고름 = 줄에 있는 것 가운데 실효 순위가 가장 큰 것,
 * 동률이면 seq 가 작은 것. 실효 순위의 식은 `effective` 하나에 있다 (phase `age`).
 *
 * 배열은 모두 부르는 쪽이 길이 n 으로 만들어 넘긴다 (IR 함수는 배열을 만들 수 없다).
 *   remain = 길이 사본 · queued = 0 · seq = 0 · since = 0 · start = −1 · finish = −1
 * 반환은 색인 0 (월말 보고서) 이 기다린 틱이다. 돌린 뒤의 start · finish 도 알고리즘과 같다.
 *
 * `running` · `best` 가 −1 일 수 있는 자리의 색인은 `if` 를 중첩한다 — 인터프리터의 `&&` · `||` 는 짧은 회로가 아니다.
 * `//` 의 두 쪽은 음수가 아니다 (tick ≥ since, interval > 0). 중간값은 모두 100 아래다.
 */
import type { IR, IRBinOp, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST_INT: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const set = (target: IRExpr, expr: IRExpr, phase: string): IRStmt => ({ kind: 'assign', target, expr, phase });
const effCall = (who: IRExpr): IRExpr => ({
  kind: 'call',
  fn: 'effective',
  args: [who, v('tick'), v('interval'), v('prio'), v('since')],
});

const effectiveFn: IR['functions'][number] = {
  name: 'effective',
  params: [
    { name: 'i', type: INT },
    { name: 'tick', type: INT },
    { name: 'interval', type: INT },
    { name: 'prio', type: LIST_INT },
    { name: 'since', type: LIST_INT },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'effective priority rises by one every interval ticks spent in the queue' },
    {
      kind: 'if',
      cond: bin('>', v('interval'), n(0)),
      then: [
        {
          kind: 'return',
          expr: bin('+', at('prio', v('i')), bin('//', bin('-', v('tick'), at('since', v('i'))), v('interval'))),
          phase: 'age',
        },
      ],
      phase: 'age',
    },
    { kind: 'return', expr: at('prio', v('i')), phase: 'age' },
  ],
};

const scheduleFn: IR['functions'][number] = {
  name: 'agingSchedule',
  params: [
    { name: 'interval', type: INT },
    { name: 'arrive', type: LIST_INT },
    { name: 'burst', type: LIST_INT },
    { name: 'prio', type: LIST_INT },
    { name: 'remain', type: LIST_INT },
    { name: 'queued', type: LIST_INT },
    { name: 'seq', type: LIST_INT },
    { name: 'since', type: LIST_INT },
    { name: 'start', type: LIST_INT },
    { name: 'finish', type: LIST_INT },
    { name: 'n', type: INT },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'non-preemptive priority scheduling with aging; larger number = higher priority' },
    { kind: 'var', name: 'nextSeq', type: INT, init: n(0), phase: 'dispatch' },
    { kind: 'var', name: 'running', type: INT, init: n(-1), phase: 'dispatch' },
    { kind: 'var', name: 'done', type: INT, init: n(0), phase: 'dispatch' },
    { kind: 'var', name: 'tick', type: INT, init: n(0), phase: 'dispatch' },
    {
      kind: 'while',
      cond: bin('<', v('done'), v('n')),
      phase: 'dispatch',
      body: [
        { kind: 'comment', text: 'the running process finishes when nothing remains' },
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
                set(v('done'), bin('+', v('done'), n(1)), 'finish'),
                set(v('running'), n(-1), 'finish'),
              ],
            },
          ],
        },
        { kind: 'comment', text: 'arrivals join the end of the queue in list order' },
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
                set(v('nextSeq'), bin('+', v('nextSeq'), n(1)), 'arrive'),
                set(at('since', v('i')), v('tick'), 'arrive'),
              ],
            },
          ],
        },
        { kind: 'comment', text: 'pick the highest effective priority; on a tie the one queued first wins' },
        {
          kind: 'if',
          cond: bin('<', v('running'), n(0)),
          phase: 'dispatch',
          then: [
            { kind: 'var', name: 'best', type: INT, init: n(-1), phase: 'dispatch' },
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
                        { kind: 'var', name: 'ei', type: INT, init: effCall(v('i')), phase: 'dispatch' },
                        { kind: 'var', name: 'eb', type: INT, init: effCall(v('best')), phase: 'dispatch' },
                        {
                          kind: 'if',
                          cond: bin(
                            '||',
                            bin('>', v('ei'), v('eb')),
                            bin('&&', bin('==', v('ei'), v('eb')), bin('<', at('seq', v('i')), at('seq', v('best')))),
                          ),
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
                {
                  kind: 'if',
                  cond: bin('<', at('start', v('best')), n(0)),
                  phase: 'dispatch',
                  then: [set(at('start', v('best')), v('tick'), 'dispatch')],
                },
              ],
            },
          ],
        },
        { kind: 'comment', text: 'run one tick' },
        {
          kind: 'if',
          cond: bin('>=', v('running'), n(0)),
          phase: 'dispatch',
          then: [set(at('remain', v('running')), bin('-', at('remain', v('running')), n(1)), 'dispatch')],
        },
        set(v('tick'), bin('+', v('tick'), n(1)), 'dispatch'),
      ],
    },
    { kind: 'comment', text: 'how long the lowest-priority process (index 0) waited' },
    {
      kind: 'return',
      expr: bin('-', bin('-', at('finish', n(0)), at('arrive', n(0))), at('burst', n(0))),
      phase: 'finish',
    },
  ],
};

export const priorityAgingImperativeIR: IR = {
  id: 'priority-aging-imperative',
  algorithm: 'priorityAging',
  paradigm: 'imperative',
  functions: [scheduleFn, effectiveFn],
};

export const priorityAgingIRs: IR[] = [priorityAgingImperativeIR];
