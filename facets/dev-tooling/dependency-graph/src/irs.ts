/**
 * dependency-graph IR — 목록 스케줄링 한 판.
 *
 * 진입 함수 `schedule(n, dur, needs, workers, state, startAt, endAt): int`
 * - `needs` 는 n × n 을 편 배열. `needs[i * n + j] == 1` 이면 대상 i 가 대상 j 에 기댄다 (데이터 차례의 번호).
 * - `state` · `startAt` · `endAt` 은 부르는 쪽이 길이 n 의 0 으로 채워 건네는 버퍼 (IR 은 배열을 만들 수 없다).
 *   state 0 안 시작 · 1 일하는 중 · 2 끝남.
 * - 돌려주는 값은 끝 시각. 시작할 것이 없는데 남은 대상이 있으면 −1.
 * - 큐 없이 배열을 데이터 차례로 훑는다 — 준비된 것이 빈 일꾼보다 많으면 앞선 번호가 먼저 오른다 (algorithm 과 같은 동률 규칙).
 * - 일꾼 줄(화면 자리)은 IR 밖이다 — algorithm 이 셈해 payload 로 싣는다.
 *
 * phase: `start` · `finish` · `done` — algorithm.ts 와 같은 집합.
 * 중간값 최대: 시각 ≤ 일의 합(이 데이터 18), needs 색인 ≤ n² − 1 (35) — 32 비트 걱정 없음.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '-' | '*' | '<' | '==' | '!=' | '||', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: o, l, r });
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target, expr } : { kind: 'assign', target, expr, phase };
const each = (name: string, body: IRStmt[]): IRStmt => ({
  kind: 'for-range',
  var: name,
  from: n(0),
  to: v('n'),
  inclusive: false,
  body,
});
const when = (cond: IRExpr, then: IRStmt[]): IRStmt => ({ kind: 'if', cond, then });

export const dependencyGraphImperativeIR: IR = {
  id: 'dependency-graph-imperative',
  algorithm: 'dependencyGraph',
  paradigm: 'imperative',
  functions: [
    {
      name: 'schedule',
      params: [
        { name: 'n', type: INT },
        { name: 'dur', type: INT_LIST },
        { name: 'needs', type: INT_LIST },
        { name: 'workers', type: INT },
        { name: 'state', type: INT_LIST },
        { name: 'startAt', type: INT_LIST },
        { name: 'endAt', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 't', type: INT, init: n(0) },
        { kind: 'var', name: 'doneCount', type: INT, init: n(0) },
        { kind: 'var', name: 'running', type: INT, init: n(0) },
        {
          kind: 'while',
          cond: op('<', v('doneCount'), v('n')),
          body: [
            { kind: 'comment', text: 'first finish what ends at time t' },
            each('i', [
              when(op('==', at('state', v('i')), n(1)), [
                when(op('==', at('endAt', v('i')), v('t')), [
                  set(at('state', v('i')), n(2), 'finish'),
                  set(v('doneCount'), op('+', v('doneCount'), n(1))),
                  set(v('running'), op('-', v('running'), n(1))),
                ]),
              ]),
            ]),
            { kind: 'comment', text: 'then start ready targets in data order while a worker is free' },
            each('i', [
              when(op('==', at('state', v('i')), n(0)), [
                when(op('<', v('running'), v('workers')), [
                  { kind: 'var', name: 'ready', type: INT, init: n(1) },
                  each('j', [
                    when(op('==', at('needs', op('+', op('*', v('i'), v('n')), v('j'))), n(1)), [
                      when(op('!=', at('state', v('j')), n(2)), [set(v('ready'), n(0))]),
                    ]),
                  ]),
                  when(op('==', v('ready'), n(1)), [
                    set(at('state', v('i')), n(1), 'start'),
                    set(at('startAt', v('i')), v('t')),
                    set(at('endAt', v('i')), op('+', v('t'), at('dur', v('i')))),
                    set(v('running'), op('+', v('running'), n(1))),
                  ]),
                ]),
              ]),
            ]),
            when(op('<', v('doneCount'), v('n')), [
              when(op('==', v('running'), n(0)), [{ kind: 'return', expr: n(-1) }]),
              { kind: 'comment', text: 'jump to the earliest end among running targets' },
              { kind: 'var', name: 'soonest', type: INT, init: n(-1) },
              each('i', [
                when(op('==', at('state', v('i')), n(1)), [
                  when(op('||', op('<', v('soonest'), n(0)), op('<', at('endAt', v('i')), v('soonest'))), [
                    set(v('soonest'), at('endAt', v('i'))),
                  ]),
                ]),
              ]),
              set(v('t'), v('soonest')),
            ]),
          ],
        },
        { kind: 'return', expr: v('t'), phase: 'done' },
      ],
    },
  ],
};

export const dependencyGraphIRs: IR[] = [dependencyGraphImperativeIR];
