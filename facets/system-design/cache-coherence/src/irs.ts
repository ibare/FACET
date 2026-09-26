/**
 * 캐시 일관성 IR — 코드 패널이 여섯 언어로 옮긴다.
 *
 * coherence(policy, run, rounds, start, writer, readers, cache, result) -> 통
 *   policy 0 알림 없음 · 1 무효화 · 2 갱신. 0..2 밖이거나 run < 1 이면 −1 (TS 는 던진다).
 *   cache 는 부르는 쪽이 서버 수만큼 만든 버퍼, 빈 칸 표지 −1.
 *   result = [옛값 읽기, 통, DB 읽기] — 화면의 계기 셋(stale-reads · messages · db-reads)과 같다.
 *
 * phase 어휘는 algorithm.ts 와 같다: write · invalidate · update · refill · read.
 * 셈은 모두 정수 — 중간값의 가장 큰 것은 통 72 · DB 처음 값 50 이다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '==' | '!=' | '<' | '>' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const inc = (name: string, phase?: string): IRStmt =>
  phase === undefined
    ? { kind: 'assign', target: v(name), expr: bin('+', v(name), n(1)) }
    : { kind: 'assign', target: v(name), expr: bin('+', v(name), n(1)), phase };

export const cacheCoherenceImperativeIR: IR = {
  id: 'cache-coherence-imperative',
  algorithm: 'cacheCoherence',
  paradigm: 'imperative',
  functions: [
    {
      name: 'coherence',
      params: [
        { name: 'policy', type: INT },
        { name: 'run', type: INT },
        { name: 'rounds', type: INT },
        { name: 'start', type: INT },
        { name: 'writer', type: INT },
        { name: 'readers', type: INT_LIST },
        { name: 'cache', type: INT_LIST },
        { name: 'result', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'policy: 0 = no notice, 1 = invalidate, 2 = update' },
        {
          kind: 'if',
          cond: bin('||', bin('<', v('policy'), n(0)), bin('>', v('policy'), n(2))),
          then: [{ kind: 'return', expr: n(-1) }],
        },
        {
          kind: 'if',
          cond: bin('<', v('run'), n(1)),
          then: [{ kind: 'return', expr: n(-1) }],
        },
        { kind: 'comment', text: 'every server starts with the same copy; -1 marks an empty slot' },
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: { kind: 'len', of: v('cache') },
          inclusive: false,
          body: [{ kind: 'assign', target: at('cache', v('i')), expr: v('start') }],
        },
        { kind: 'var', name: 'db', type: INT, init: v('start') },
        { kind: 'var', name: 'messages', type: INT, init: n(0) },
        { kind: 'var', name: 'dbReads', type: INT, init: n(0) },
        { kind: 'var', name: 'stale', type: INT, init: n(0) },
        {
          kind: 'for-range',
          var: 'k',
          from: n(0),
          to: v('rounds'),
          inclusive: false,
          body: [
            {
              kind: 'for-range',
              var: 'w',
              from: n(0),
              to: v('run'),
              inclusive: false,
              body: [
                { kind: 'comment', text: 'write through: the database and the writer copy change together' },
                { kind: 'assign', target: v('db'), expr: bin('-', v('db'), n(1)), phase: 'write' },
                { kind: 'assign', target: at('cache', v('writer')), expr: v('db'), phase: 'write' },
                {
                  kind: 'for-range',
                  var: 'i',
                  from: n(0),
                  to: { kind: 'len', of: v('cache') },
                  inclusive: false,
                  body: [
                    {
                      kind: 'if',
                      cond: bin('!=', v('i'), v('writer')),
                      then: [
                        {
                          kind: 'if',
                          cond: bin('!=', at('cache', v('i')), n(-1)),
                          then: [
                            {
                              kind: 'if',
                              cond: bin('==', v('policy'), n(1)),
                              phase: 'invalidate',
                              then: [
                                { kind: 'comment', text: 'invalidate: a message with no value, the slot empties' },
                                {
                                  kind: 'assign',
                                  target: at('cache', v('i')),
                                  expr: n(-1),
                                  phase: 'invalidate',
                                },
                                inc('messages', 'invalidate'),
                              ],
                            },
                            {
                              kind: 'if',
                              cond: bin('==', v('policy'), n(2)),
                              phase: 'update',
                              then: [
                                { kind: 'comment', text: 'update: the message carries the new value' },
                                {
                                  kind: 'assign',
                                  target: at('cache', v('i')),
                                  expr: v('db'),
                                  phase: 'update',
                                },
                                inc('messages', 'update'),
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              kind: 'for-range',
              var: 'r',
              from: n(0),
              to: { kind: 'len', of: v('readers') },
              inclusive: false,
              body: [
                { kind: 'var', name: 's', type: INT, init: at('readers', v('r')) },
                {
                  kind: 'if',
                  cond: bin('==', at('cache', v('s')), n(-1)),
                  phase: 'refill',
                  then: [
                    { kind: 'comment', text: 'empty slot: fetch from the database' },
                    { kind: 'assign', target: at('cache', v('s')), expr: v('db'), phase: 'refill' },
                    inc('dbReads', 'refill'),
                  ],
                },
                {
                  kind: 'if',
                  cond: bin('!=', at('cache', v('s')), v('db')),
                  phase: 'read',
                  then: [inc('stale', 'read')],
                },
              ],
            },
          ],
        },
        { kind: 'assign', target: at('result', n(0)), expr: v('stale') },
        { kind: 'assign', target: at('result', n(1)), expr: v('messages') },
        { kind: 'assign', target: at('result', n(2)), expr: v('dbReads') },
        { kind: 'return', expr: v('messages') },
      ],
    },
  ],
};

export const cacheCoherenceIRs: IR[] = [cacheCoherenceImperativeIR];
