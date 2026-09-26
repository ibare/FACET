/**
 * acid 의 IR — 누가 다시 되고 누가 OK 를 잃는가를 셈한다.
 *
 * 진입 함수 `runCommits(mode, crashAfter, flushEvery, evTx, evKind, okAt, committed) -> int` (잃은 OK 수).
 * - evTx · evKind 는 사건 차례 (트랜잭션 번호 0.. · 0 쓰기 / 1 커밋). 틱 = 사건 번호 = LSN
 * - okAt · committed 는 트랜잭션 수 길이의 버퍼 — 부르는 쪽이 0 으로 채워 건넨다 (IR 은 배열을 만들 수 없다)
 * - 로그는 배열이 필요 없다 — logged(로그 버퍼까지 붙은 끝 LSN) · flushed(로그 파일까지 내린 끝 LSN) 두 정수
 * - 값(a..d)의 다시 하기는 IR 밖 — 알고리즘이 한다
 *
 * phase 어휘는 algorithm.ts 와 같다: append-write · append-commit · flush · send-ok · crash · redo · skip.
 * 잃은 OK 를 세는 끝 반복에는 phase 를 달지 않는다. 중간값 최대 12 — 32 비트와 멀다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '-' | '%' | '==' | '!=' | '>', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: o, l, r });
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target, expr } : { kind: 'assign', target, expr, phase };
const when = (cond: IRExpr, then: IRStmt[], otherwise?: IRStmt[]): IRStmt =>
  otherwise === undefined ? { kind: 'if', cond, then } : { kind: 'if', cond, then, else: otherwise };
const upTo = (name: string, to: IRExpr, body: IRStmt[]): IRStmt => ({
  kind: 'for-range',
  var: name,
  from: n(0),
  to,
  inclusive: false,
  body,
});

export const acidImperativeIR: IR = {
  id: 'acid-imperative',
  algorithm: 'acid',
  paradigm: 'imperative',
  functions: [
    {
      name: 'runCommits',
      params: [
        { name: 'mode', type: INT },
        { name: 'crashAfter', type: INT },
        { name: 'flushEvery', type: INT },
        { name: 'evTx', type: INT_LIST },
        { name: 'evKind', type: INT_LIST },
        { name: 'okAt', type: INT_LIST },
        { name: 'committed', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'mode 0 = flush then OK, 1 = group flush, 2 = OK first' },
        { kind: 'var', name: 'logged', type: INT, init: n(0) },
        { kind: 'var', name: 'flushed', type: INT, init: n(0) },
        {
          kind: 'for-range',
          var: 'tick',
          from: n(1),
          to: v('crashAfter'),
          inclusive: true,
          body: [
            { kind: 'var', name: 'e', type: INT, init: op('-', v('tick'), n(1)) },
            { kind: 'var', name: 'tx', type: INT, init: at('evTx', v('e')) },
            when(
              op('==', at('evKind', v('e')), n(0)),
              [set(v('logged'), op('+', v('logged'), n(1)), 'append-write')],
              [
                set(v('logged'), op('+', v('logged'), n(1)), 'append-commit'),
                when(op('==', v('mode'), n(0)), [
                  set(v('flushed'), v('logged'), 'flush'),
                  set(at('okAt', v('tx')), v('tick'), 'send-ok'),
                ]),
                when(op('==', v('mode'), n(2)), [set(at('okAt', v('tx')), v('tick'), 'send-ok')]),
              ],
            ),
            when(op('!=', v('mode'), n(0)), [
              when(op('==', op('%', v('tick'), v('flushEvery')), n(0)), [
                { kind: 'comment', text: 'periodic flush: the whole log buffer goes to the log file' },
                set(v('flushed'), v('logged'), 'flush'),
                when(op('==', v('mode'), n(1)), [
                  upTo('j', v('flushed'), [
                    when(op('==', at('evKind', v('j')), n(1)), [
                      when(op('==', at('okAt', at('evTx', v('j'))), n(0)), [
                        set(at('okAt', at('evTx', v('j'))), v('tick'), 'send-ok'),
                      ]),
                    ]),
                  ]),
                ]),
              ]),
            ]),
          ],
        },
        { kind: 'comment', text: 'crash: memory is gone, only the log file survives' },
        set(v('logged'), v('flushed'), 'crash'),
        upTo('j', v('flushed'), [
          when(op('==', at('evKind', v('j')), n(1)), [set(at('committed', at('evTx', v('j'))), n(1))]),
        ]),
        { kind: 'comment', text: 'restart: redo only transactions whose commit record reached the log file' },
        { kind: 'var', name: 'redone', type: INT, init: n(0) },
        { kind: 'var', name: 'skipped', type: INT, init: n(0) },
        upTo('j', v('flushed'), [
          when(
            op('==', at('committed', at('evTx', v('j'))), n(1)),
            [set(v('redone'), op('+', v('redone'), n(1)), 'redo')],
            [set(v('skipped'), op('+', v('skipped'), n(1)), 'skip')],
          ),
        ]),
        { kind: 'comment', text: 'lost OK: acknowledged, but no commit record in the log file' },
        { kind: 'var', name: 'lost', type: INT, init: n(0) },
        upTo('k', { kind: 'len', of: v('okAt') }, [
          when(op('>', at('okAt', v('k')), n(0)), [
            when(op('==', at('committed', v('k')), n(0)), [set(v('lost'), op('+', v('lost'), n(1)))]),
          ]),
        ]),
        { kind: 'return', expr: v('lost') },
      ],
    },
  ],
};

export const acidIRs: IR[] = [acidImperativeIR];
