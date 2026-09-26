/**
 * 벌크헤드 IR — 자리 배열 · 칸 범위 · 앞 번호 빈 자리 찾기.
 *
 * 진입 `runBulkhead(aSlots, pool, ticks, aRate, aHold, bRate, bHold, ends, owner, tally) → int`
 *   owner: −1 빔 · 0 a · 1 b (길이 pool 버퍼) · ends: 끝 틱 (길이 pool 버퍼)
 *   tally[0..3] = a 받음 · a 거절 · b 받음 · b 거절 (길이 4 버퍼)
 *   답 = b 거절 수. aSlots 가 0..pool−1 밖이면 −1 (TS 쪽 bulkheadRanges 는 던진다)
 * 곁 함수 `admit(lo, hi, who, now, hold, ends, owner) → int` — [lo, hi) 의 앞 번호 빈 자리를 잡고
 *   그 색인을 돌려주거나, 없으면 −1.
 *
 * phase 집합 = { free, take, refuse } — algorithm.ts 와 같다.
 * IR 안의 주석은 영어 (코드 패널은 어느 언어 화면에서든 그대로 뜬다).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '<' | '<=' | '>=' | '==' | '!=' | '>' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target, expr } : { kind: 'assign', target, expr, phase };
const bump = (k: number): IRStmt => set(at('tally', lit(k)), bin('+', at('tally', lit(k)), lit(1)));

const admitCall = (lo: string, hi: string, who: number, hold: string): IRExpr => ({
  kind: 'call',
  fn: 'admit',
  args: [v(lo), v(hi), lit(who), v('now'), v(hold), v('ends'), v('owner')],
});

/** 한 서비스의 도착 — rate 번 admit 하고 받음 · 거절을 센다 */
const arrivals = (rate: string, lo: string, hi: string, who: number, hold: string, takenAt: number): IRStmt => ({
  kind: 'for-range',
  var: 'r',
  from: lit(0),
  to: v(rate),
  inclusive: false,
  body: [
    { kind: 'var', name: 'got', type: INT, init: admitCall(lo, hi, who, hold) },
    { kind: 'if', cond: bin('>=', v('got'), lit(0)), then: [bump(takenAt)], else: [bump(takenAt + 1)] },
  ],
});

export const bulkheadImperativeIR: IR = {
  id: 'bulkhead-imperative',
  algorithm: 'bulkhead',
  paradigm: 'imperative',
  functions: [
    {
      name: 'runBulkhead',
      params: [
        { name: 'aSlots', type: INT },
        { name: 'pool', type: INT },
        { name: 'ticks', type: INT },
        { name: 'aRate', type: INT },
        { name: 'aHold', type: INT },
        { name: 'bRate', type: INT },
        { name: 'bHold', type: INT },
        { name: 'ends', type: INTS },
        { name: 'owner', type: INTS },
        { name: 'tally', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'aSlots = seats given to compartment a; 0 means one shared pool' },
        {
          kind: 'if',
          cond: bin('||', bin('<', v('aSlots'), lit(0)), bin('>=', v('aSlots'), v('pool'))),
          then: [{ kind: 'return', expr: lit(-1) }],
        },
        { kind: 'var', name: 'aLo', type: INT, init: lit(0) },
        { kind: 'var', name: 'aHi', type: INT, init: v('pool') },
        { kind: 'var', name: 'bLo', type: INT, init: lit(0) },
        { kind: 'var', name: 'bHi', type: INT, init: v('pool') },
        {
          kind: 'if',
          cond: bin('>', v('aSlots'), lit(0)),
          then: [set(v('aHi'), v('aSlots')), set(v('bLo'), v('aSlots'))],
        },
        {
          kind: 'for-range',
          var: 's',
          from: lit(0),
          to: v('pool'),
          inclusive: false,
          body: [set(at('owner', v('s')), lit(-1)), set(at('ends', v('s')), lit(0))],
        },
        {
          kind: 'for-range',
          var: 'k',
          from: lit(0),
          to: lit(4),
          inclusive: false,
          body: [set(at('tally', v('k')), lit(0))],
        },
        {
          kind: 'for-range',
          var: 'now',
          from: lit(0),
          to: v('ticks'),
          inclusive: false,
          body: [
            { kind: 'comment', text: 'a call whose hold is over gives its seat back' },
            {
              kind: 'for-range',
              var: 's',
              from: lit(0),
              to: v('pool'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: bin('!=', at('owner', v('s')), lit(-1)),
                  then: [
                    {
                      kind: 'if',
                      cond: bin('<=', at('ends', v('s')), v('now')),
                      then: [set(at('owner', v('s')), lit(-1), 'free')],
                    },
                  ],
                },
              ],
            },
            { kind: 'comment', text: 'a arrives first, then b; each looks only inside its own compartment' },
            arrivals('aRate', 'aLo', 'aHi', 0, 'aHold', 0),
            arrivals('bRate', 'bLo', 'bHi', 1, 'bHold', 2),
          ],
        },
        { kind: 'return', expr: at('tally', lit(3)) },
      ],
    },
    {
      name: 'admit',
      params: [
        { name: 'lo', type: INT },
        { name: 'hi', type: INT },
        { name: 'who', type: INT },
        { name: 'now', type: INT },
        { name: 'hold', type: INT },
        { name: 'ends', type: INTS },
        { name: 'owner', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'take the lowest-numbered free seat in [lo, hi)' },
        {
          kind: 'for-range',
          var: 's',
          from: v('lo'),
          to: v('hi'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: bin('==', at('owner', v('s')), lit(-1)),
              then: [
                set(at('owner', v('s')), v('who'), 'take'),
                set(at('ends', v('s')), bin('+', v('now'), v('hold'))),
                { kind: 'return', expr: v('s') },
              ],
            },
          ],
        },
        { kind: 'comment', text: 'no free seat in this compartment: refuse at once, no waiting line' },
        { kind: 'return', expr: lit(-1), phase: 'refuse' },
      ],
    },
  ],
};

export const bulkheadIRs: IR[] = [bulkheadImperativeIR];
