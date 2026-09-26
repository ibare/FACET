/**
 * 배압 IR — 코드 패널이 여섯 언어로 옮기는 한 판의 셈.
 *
 * 진입 함수 `overload(mode, rate, ticks, capacity, workUnits, deadline, limit, born, done, waiting, tally)`
 *   - 버퍼는 부르는 쪽이 만든다 (IR 은 배열을 만들 수 없다). 길이 m = rate × ticks + 1.
 *     born[·] · done[·] : 받는 쪽이 든 일 — 들어온 차례로 앞에서부터, 끝난 것은 뒤를 당겨 메운다(차례 유지)
 *     waiting[·]        : 보내는 쪽 줄 — 태어난 틱, 머리 · 꼬리 색인
 *     tally[4]          : 제때 · 헛일 · 503 · 보내는 쪽 버림
 *   - 돌려주는 것: 제때 끝난 수 (= tally[0]). 모르는 방식은 −1 (TS 쪽은 던진다).
 *   - 받는 쪽에 들이는 문은 `admit` 한 곳 — 다 받음 · 버림의 직접 들임과 배압의 줄 머리 보내기가 함께 지난다.
 *   - 모든 값은 음이 아닌 정수다 (`//` · `%` 가 여섯 언어에서 같다). 중간값 최대: capacity 24 · 버퍼 색인 80.
 *   - `&&` 는 짧은 회로가 아니다 — 줄 머리 읽기는 `while (tail > head)` 안쪽 `if` 로 둔다.
 *
 * phase: share-work · accept · reject · hold-back · drop-stale (algorithm.ts 와 같다)
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '-' | '*' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '||' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop', op: o, l, r,
});
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target, expr } : { kind: 'assign', target, expr, phase };
const bump = (name: string, phase?: string): IRStmt => set(v(name), op('+', v(name), n(1)), phase);
const tallyUp = (slot: number, phase?: string): IRStmt => set(at('tally', n(slot)), op('+', at('tally', n(slot)), n(1)), phase);

export const backpressureImperativeIR: IR = {
  id: 'backpressure-imperative',
  algorithm: 'backpressure',
  paradigm: 'imperative',
  functions: [
    {
      name: 'overload',
      params: [
        { name: 'mode', type: INT },
        { name: 'rate', type: INT },
        { name: 'ticks', type: INT },
        { name: 'capacity', type: INT },
        { name: 'workUnits', type: INT },
        { name: 'deadline', type: INT },
        { name: 'limit', type: INT },
        { name: 'born', type: INTS },
        { name: 'done', type: INTS },
        { name: 'waiting', type: INTS },
        { name: 'tally', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'mode: 0 accept all, 1 reject with 503, 2 backpressure' },
        {
          kind: 'if',
          cond: op('||', op('<', v('mode'), n(0)), op('>', v('mode'), n(2))),
          then: [{ kind: 'return', expr: { kind: 'unop', op: '-', x: n(1) } }],
        },
        { kind: 'var', name: 'held', type: INT, init: n(0) },
        { kind: 'var', name: 'head', type: INT, init: n(0) },
        { kind: 'var', name: 'tail', type: INT, init: n(0) },
        { kind: 'comment', text: 'ticks a request would take in a full receiver' },
        { kind: 'var', name: 'ahead', type: INT, init: op('//', op('*', v('limit'), v('workUnits')), v('capacity')) },
        {
          kind: 'for-range', var: 'tick', from: n(0), to: v('ticks'), inclusive: false,
          body: [
            { kind: 'comment', text: '1) work: split capacity evenly, earlier arrivals take the remainder' },
            {
              kind: 'if',
              cond: op('>', v('held'), n(0)),
              then: [
                { kind: 'var', name: 'share', type: INT, init: op('//', v('capacity'), v('held')), phase: 'share-work' },
                { kind: 'var', name: 'extra', type: INT, init: op('%', v('capacity'), v('held')), phase: 'share-work' },
                { kind: 'var', name: 'kept', type: INT, init: n(0) },
                {
                  kind: 'for-range', var: 'k', from: n(0), to: v('held'), inclusive: false,
                  body: [
                    { kind: 'var', name: 'give', type: INT, init: v('share') },
                    { kind: 'if', cond: op('<', v('k'), v('extra')), then: [bump('give')] },
                    set(
                      at('done', v('k')),
                      { kind: 'call', fn: 'min', args: [v('workUnits'), op('+', at('done', v('k')), v('give'))] },
                      'share-work',
                    ),
                    {
                      kind: 'if',
                      cond: op('>=', at('done', v('k')), v('workUnits')),
                      then: [
                        { kind: 'comment', text: '2) judge: finished within the deadline or wasted work' },
                        {
                          kind: 'if',
                          cond: op('<=', op('-', v('tick'), at('born', v('k'))), v('deadline')),
                          then: [tallyUp(0)],
                          else: [tallyUp(1)],
                        },
                      ],
                      else: [
                        set(at('born', v('kept')), at('born', v('k'))),
                        set(at('done', v('kept')), at('done', v('k'))),
                        bump('kept'),
                      ],
                    },
                  ],
                },
                set(v('held'), v('kept')),
              ],
            },
            { kind: 'comment', text: '3) arrivals: the sender makes rate requests this tick' },
            {
              kind: 'for-range', var: 'j', from: n(0), to: v('rate'), inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: op('==', v('mode'), n(2)),
                  then: [
                    set(at('waiting', v('tail')), v('tick'), 'hold-back'),
                    bump('tail', 'hold-back'),
                  ],
                  else: [
                    {
                      kind: 'if',
                      cond: op('&&', op('==', v('mode'), n(1)), op('>=', v('held'), v('limit'))),
                      then: [tallyUp(2, 'reject')],
                      else: [
                        set(v('held'), { kind: 'call', fn: 'admit', args: [v('born'), v('done'), v('held'), v('tick')] }),
                      ],
                    },
                  ],
                },
              ],
            },
            {
              kind: 'if',
              cond: op('==', v('mode'), n(2)),
              then: [
                { kind: 'comment', text: 'the sender drops a head that would miss the deadline even if sent now' },
                {
                  kind: 'while',
                  cond: op('>', v('tail'), v('head')),
                  body: [
                    {
                      kind: 'if',
                      cond: op('>', op('+', op('-', v('tick'), at('waiting', v('head'))), v('ahead')), v('deadline')),
                      then: [bump('head', 'drop-stale'), tallyUp(3, 'drop-stale')],
                      else: [{ kind: 'break' }],
                    },
                  ],
                },
                { kind: 'comment', text: '4) send from the head while the receiver is under its limit' },
                {
                  kind: 'while',
                  cond: op('&&', op('>', v('tail'), v('head')), op('<', v('held'), v('limit'))),
                  body: [
                    set(v('held'), { kind: 'call', fn: 'admit', args: [v('born'), v('done'), v('held'), at('waiting', v('head'))] }),
                    bump('head'),
                  ],
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: at('tally', n(0)) },
      ],
    },
    {
      name: 'admit',
      params: [
        { name: 'born', type: INTS },
        { name: 'done', type: INTS },
        { name: 'held', type: INT },
        { name: 'bornTick', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'the one door into the receiver' },
        set(at('born', v('held')), v('bornTick'), 'accept'),
        set(at('done', v('held')), n(0), 'accept'),
        { kind: 'return', expr: op('+', v('held'), n(1)), phase: 'accept' },
      ],
    },
  ],
};

export const backpressureIRs: IR[] = [backpressureImperativeIR];
