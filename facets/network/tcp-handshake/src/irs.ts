/**
 * tcp-handshake 의 IR — 받는 쪽 셈 `receiveInOrder(arrive, hold, held, handTick)`.
 *
 * arrive   조각마다 (마지막으로) 받는 쪽에 닿은 틱, 닿지 않으면 -1 (알고리즘이 틱 흉내에서 셈해 건넨다)
 * hold     0 = UDP (쥐지 않음) · 1 = TCP — 두 방식이 같은 함수의 매개변수 하나로 갈린다
 * held     부르는 쪽이 조각 수만큼 0 으로 채워 건넨다 (IR 은 배열을 만들 수 없다)
 * handTick 부르는 쪽이 -1 로 채워 건넨다. 함수가 넘긴 틱을 적는다
 * 돌려주는 것: 앱에 넘긴 수
 *
 * phase 어휘 (algorithm.ts 와 같다): hand-over · hold-back · release-run
 * 확인 번호(expected + 1)는 셈하되 phase 를 달지 않는다 — 같은 틱의 앞 phase 를 덮지 않게.
 * 음수는 `==` · 비교에만 쓴다 (`//` · `%` 없음). 색인 읽기를 `&&` 로 잇지 않고 if 를 중첩한다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST_INT: IRType = { kind: 'list', of: INT };
const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '-' | '<' | '>' | '==' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: o, l, r });
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const inc = (name: string, phase?: string): IRStmt => set(v(name), op('+', v(name), n(1)), phase);
const dec = (name: string, phase?: string): IRStmt => set(v(name), op('-', v(name), n(1)), phase);

export const tcpHandshakeImperativeIR: IR = {
  id: 'tcp-handshake-imperative',
  algorithm: 'tcpHandshake',
  paradigm: 'imperative',
  functions: [
    {
      name: 'receiveInOrder',
      params: [
        { name: 'arrive', type: LIST_INT },
        { name: 'hold', type: INT },
        { name: 'held', type: LIST_INT },
        { name: 'handTick', type: LIST_INT },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'n', type: INT, init: { kind: 'len', of: v('arrive') } },
        { kind: 'comment', text: 'latest arrival tick bounds the clock' },
        { kind: 'var', name: 'last', type: INT, init: n(-1) },
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: op('>', at('arrive', v('i')), v('last')),
              then: [set(v('last'), at('arrive', v('i')))],
            },
          ],
        },
        { kind: 'var', name: 'expected', type: INT, init: n(0) },
        { kind: 'var', name: 'delivered', type: INT, init: n(0) },
        { kind: 'var', name: 'heldCount', type: INT, init: n(0) },
        { kind: 'var', name: 'ackNumber', type: INT, init: n(1) },
        {
          kind: 'for-range',
          var: 'tick',
          from: n(0),
          to: v('last'),
          inclusive: true,
          body: [
            {
              kind: 'for-range',
              var: 'i',
              from: n(0),
              to: v('n'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: op('==', at('arrive', v('i')), v('tick')),
                  then: [
                    {
                      kind: 'if',
                      cond: op('==', v('hold'), n(0)),
                      then: [
                        { kind: 'comment', text: 'no ordering: hand it to the app at once' },
                        set(at('handTick', v('i')), v('tick'), 'hand-over'),
                        inc('delivered', 'hand-over'),
                      ],
                      else: [
                        set(at('held', v('i')), n(1)),
                        {
                          kind: 'if',
                          cond: op('!=', v('i'), v('expected')),
                          then: [
                            { kind: 'comment', text: 'a gap is ahead of it: keep it waiting' },
                            inc('heldCount', 'hold-back'),
                          ],
                        },
                        { kind: 'comment', text: 'hand over the run that starts at the expected segment' },
                        {
                          kind: 'while',
                          cond: op('<', v('expected'), v('n')),
                          body: [
                            {
                              kind: 'if',
                              cond: op('==', at('held', v('expected')), n(0)),
                              then: [{ kind: 'break' }],
                            },
                            set(at('handTick', v('expected')), v('tick'), 'release-run'),
                            set(at('held', v('expected')), n(0), 'release-run'),
                            {
                              kind: 'if',
                              cond: op('!=', v('expected'), v('i')),
                              then: [dec('heldCount', 'release-run')],
                            },
                            inc('expected', 'release-run'),
                            inc('delivered', 'release-run'),
                          ],
                        },
                        { kind: 'comment', text: 'cumulative ack: the next segment number expected' },
                        set(v('ackNumber'), op('+', v('expected'), n(1))),
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: v('delivered') },
      ],
    },
  ],
};

export const tcpHandshakeIRs: IR[] = [tcpHandshakeImperativeIR];
