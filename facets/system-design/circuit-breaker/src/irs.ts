/**
 * 서킷 브레이커 IR — `runBreaker(threshold, wait, back, health, tally) → int`.
 *
 * - health: 틱마다 0 up · 1 blip · 2 down (부르는 쪽이 구간에서 편다). back: 되살아나는 틱.
 * - state: 0 closed · 1 open · 2 half_open.
 * - tally[0..4] = 죽은 곳에 닿음 · 삐끗에 열림 · 살아난 뒤 닫힘까지 · 닿은 부름 · 막은 부름. 답 = 죽은 곳에 닿음.
 * - health 가 0..2 밖이면 −1, 판 안에 다시 닫히지 않으면 −1 (TS 는 둘 다 던진다).
 * - phase 집합은 algorithm 과 같다: reset · count · trip · block · probe-ok · probe-fail.
 *   반열림 전환 줄에는 phase 를 두지 않는다 — 같은 걸음의 시험 부름 줄이 덮는다.
 */
import type { IR } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const INT_LIST = { kind: 'list', of: { kind: 'int' } } as const;

const v = (name: string) => ({ kind: 'var', name }) as const;
const n = (value: number) => ({ kind: 'lit', value }) as const;

export const circuitBreakerImperativeIR: IR = {
  id: 'circuit-breaker-imperative',
  algorithm: 'circuitBreaker',
  paradigm: 'imperative',
  functions: [
    {
      name: 'runBreaker',
      params: [
        { name: 'threshold', type: INT },
        { name: 'wait', type: INT },
        { name: 'back', type: INT },
        { name: 'health', type: INT_LIST },
        { name: 'tally', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'health per tick: 0 up, 1 blip, 2 down; state: 0 closed, 1 open, 2 half-open' },
        { kind: 'var', name: 'state', type: INT, init: n(0) },
        { kind: 'var', name: 'fails', type: INT, init: n(0) },
        { kind: 'var', name: 'opened', type: INT, init: n(0) },
        { kind: 'var', name: 'deadHits', type: INT, init: n(0) },
        { kind: 'var', name: 'blipTrips', type: INT, init: n(0) },
        { kind: 'var', name: 'reached', type: INT, init: n(0) },
        { kind: 'var', name: 'blocked', type: INT, init: n(0) },
        { kind: 'var', name: 'lag', type: INT, init: n(-1) },
        {
          kind: 'for-range',
          var: 'tick',
          from: n(0),
          to: { kind: 'len', of: v('health') },
          inclusive: false,
          body: [
            { kind: 'var', name: 'h', type: INT, init: { kind: 'index', arr: v('health'), idx: v('tick') } },
            {
              kind: 'if',
              cond: { kind: 'binop', op: '||', l: { kind: 'binop', op: '<', l: v('h'), r: n(0) }, r: { kind: 'binop', op: '>', l: v('h'), r: n(2) } },
              then: [
                { kind: 'comment', text: 'unknown health' },
                { kind: 'return', expr: n(-1) },
              ],
            },
            { kind: 'comment', text: 'open long enough: let one trial call through' },
            {
              kind: 'if',
              cond: { kind: 'binop', op: '==', l: v('state'), r: n(1) },
              then: [
                {
                  kind: 'if',
                  cond: { kind: 'binop', op: '>=', l: { kind: 'binop', op: '-', l: v('tick'), r: v('opened') }, r: v('wait') },
                  then: [{ kind: 'assign', target: v('state'), expr: n(2) }],
                },
              ],
            },
            {
              kind: 'if',
              cond: { kind: 'binop', op: '==', l: v('state'), r: n(1) },
              then: [
                { kind: 'comment', text: 'open: the call stops at the breaker' },
                { kind: 'assign', target: v('blocked'), expr: { kind: 'binop', op: '+', l: v('blocked'), r: n(1) }, phase: 'block' },
              ],
              else: [
                { kind: 'assign', target: v('reached'), expr: { kind: 'binop', op: '+', l: v('reached'), r: n(1) } },
                {
                  kind: 'if',
                  cond: { kind: 'binop', op: '==', l: v('h'), r: n(2) },
                  then: [{ kind: 'assign', target: v('deadHits'), expr: { kind: 'binop', op: '+', l: v('deadHits'), r: n(1) } }],
                },
                {
                  kind: 'if',
                  cond: { kind: 'binop', op: '==', l: v('state'), r: n(2) },
                  then: [
                    { kind: 'comment', text: 'half-open: this call is the trial call' },
                    {
                      kind: 'if',
                      cond: { kind: 'binop', op: '==', l: v('h'), r: n(0) },
                      then: [
                        { kind: 'assign', target: v('state'), expr: n(0), phase: 'probe-ok' },
                        { kind: 'assign', target: v('fails'), expr: n(0) },
                      ],
                      else: [
                        { kind: 'assign', target: v('state'), expr: n(1), phase: 'probe-fail' },
                        { kind: 'assign', target: v('opened'), expr: v('tick') },
                      ],
                    },
                  ],
                  else: [
                    {
                      kind: 'if',
                      cond: { kind: 'binop', op: '==', l: v('h'), r: n(0) },
                      then: [{ kind: 'assign', target: v('fails'), expr: n(0), phase: 'reset' }],
                      else: [
                        { kind: 'comment', text: 'blip or down: counted as a timeout' },
                        { kind: 'assign', target: v('fails'), expr: { kind: 'binop', op: '+', l: v('fails'), r: n(1) }, phase: 'count' },
                        {
                          kind: 'if',
                          cond: { kind: 'binop', op: '>=', l: v('fails'), r: v('threshold') },
                          then: [
                            { kind: 'assign', target: v('state'), expr: n(1), phase: 'trip' },
                            { kind: 'assign', target: v('opened'), expr: v('tick') },
                            {
                              kind: 'if',
                              cond: { kind: 'binop', op: '==', l: v('h'), r: n(1) },
                              then: [{ kind: 'assign', target: v('blipTrips'), expr: { kind: 'binop', op: '+', l: v('blipTrips'), r: n(1) } }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            { kind: 'comment', text: 'first tick after recovery that ends closed' },
            {
              kind: 'if',
              cond: { kind: 'binop', op: '==', l: v('lag'), r: n(-1) },
              then: [
                {
                  kind: 'if',
                  cond: { kind: 'binop', op: '>=', l: v('tick'), r: v('back') },
                  then: [
                    {
                      kind: 'if',
                      cond: { kind: 'binop', op: '==', l: v('state'), r: n(0) },
                      then: [{ kind: 'assign', target: v('lag'), expr: { kind: 'binop', op: '-', l: v('tick'), r: v('back') } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          kind: 'if',
          cond: { kind: 'binop', op: '==', l: v('lag'), r: n(-1) },
          then: [
            { kind: 'comment', text: 'never closed again within the run' },
            { kind: 'return', expr: n(-1) },
          ],
        },
        { kind: 'assign', target: { kind: 'index', arr: v('tally'), idx: n(0) }, expr: v('deadHits') },
        { kind: 'assign', target: { kind: 'index', arr: v('tally'), idx: n(1) }, expr: v('blipTrips') },
        { kind: 'assign', target: { kind: 'index', arr: v('tally'), idx: n(2) }, expr: v('lag') },
        { kind: 'assign', target: { kind: 'index', arr: v('tally'), idx: n(3) }, expr: v('reached') },
        { kind: 'assign', target: { kind: 'index', arr: v('tally'), idx: n(4) }, expr: v('blocked') },
        { kind: 'return', expr: v('deadHits') },
      ],
    },
  ],
};

export const circuitBreakerIRs: IR[] = [circuitBreakerImperativeIR];
