/**
 * Raft IR — `reachMajority(n, stopped, rtt)`: 과반에 닿은 시각 ms, 못 닿으면 −1.
 *
 * 표 모으기와 사본 모으기가 이 함수 하나를 쓴다. `rtt` 는 부르는 쪽이 앞의 n − 1 개로 건넨다.
 * 멈춤은 번호가 큰 노드부터라 살아 있는 팔로워는 `rtt` 의 앞 alive − 1 개다.
 * alive = 0 이면 반복 범위가 비어 −1 로 떨어진다 — 따로 가지를 두지 않는다.
 *
 * phase: `init` · `count` · `majority` · `no-majority` (algorithm.ts 와 같다).
 */
import type { IR } from '@ffacet/core';

const INT = { kind: 'int' } as const;

export const raftImperativeIR: IR = {
  id: 'raft-imperative',
  algorithm: 'raft',
  paradigm: 'imperative',
  functions: [
    {
      name: 'reachMajority',
      params: [
        { name: 'n', type: INT },
        { name: 'stopped', type: INT },
        { name: 'rtt', type: { kind: 'list', of: INT } },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'the majority counts every node, stopped ones included' },
        {
          kind: 'var',
          name: 'majority',
          type: INT,
          init: {
            kind: 'binop',
            op: '+',
            l: { kind: 'binop', op: '//', l: { kind: 'var', name: 'n' }, r: { kind: 'lit', value: 2 } },
            r: { kind: 'lit', value: 1 },
          },
          phase: 'init',
        },
        {
          kind: 'var',
          name: 'alive',
          type: INT,
          init: { kind: 'binop', op: '-', l: { kind: 'var', name: 'n' }, r: { kind: 'var', name: 'stopped' } },
          phase: 'init',
        },
        { kind: 'var', name: 'got', type: INT, init: { kind: 'lit', value: 0 }, phase: 'init' },
        {
          kind: 'if',
          cond: { kind: 'binop', op: '>', l: { kind: 'var', name: 'alive' }, r: { kind: 'lit', value: 0 } },
          then: [
            { kind: 'comment', text: 'the leader counts its own vote or copy first' },
            { kind: 'assign', target: { kind: 'var', name: 'got' }, expr: { kind: 'lit', value: 1 }, phase: 'init' },
          ],
          phase: 'init',
        },
        { kind: 'comment', text: 'replies arrive in rtt order; stopped nodes never reply' },
        {
          kind: 'for-range',
          var: 'i',
          from: { kind: 'lit', value: 0 },
          to: { kind: 'binop', op: '-', l: { kind: 'var', name: 'alive' }, r: { kind: 'lit', value: 1 } },
          inclusive: false,
          phase: 'count',
          body: [
            {
              kind: 'assign',
              target: { kind: 'var', name: 'got' },
              expr: { kind: 'binop', op: '+', l: { kind: 'var', name: 'got' }, r: { kind: 'lit', value: 1 } },
              phase: 'count',
            },
            {
              kind: 'if',
              cond: {
                kind: 'binop',
                op: '==',
                l: { kind: 'var', name: 'got' },
                r: { kind: 'var', name: 'majority' },
              },
              then: [
                {
                  kind: 'return',
                  expr: { kind: 'index', arr: { kind: 'var', name: 'rtt' }, idx: { kind: 'var', name: 'i' } },
                  phase: 'majority',
                },
              ],
              phase: 'count',
            },
          ],
        },
        {
          kind: 'return',
          expr: { kind: 'unop', op: '-', x: { kind: 'lit', value: 1 } },
          phase: 'no-majority',
        },
      ],
    },
  ],
};

export const raftIRs: IR[] = [raftImperativeIR];
