/**
 * 복제와 CAP — 코드 패널의 IR.
 *
 * 함수 셋 (첫 함수가 진입점):
 *   - answerAt(delays, reach, n, k) -> int — 닿는 수 < k 면 -1 (거절), k == 0 이면 0, 아니면 k 번째로 빠른 닿는 팔로워의 지연.
 *     k 번째 = 닿는 팔로워 가운데 자기보다 빠른 닿는 팔로워가 정확히 k−1 인 것 (정렬 없이 — IR 은 배열을 만들 수 없다)
 *   - freshAt(delays, reach, n, t) -> int — 시각 t 에 새 값을 가진 팔로워 수 (닿고 지연 ≤ t)
 *   - staleAt(delays, reach, n, t, accepted) -> int — accepted 가 0 이면 0, 아니면 n − freshAt(…)
 *
 * phase 어휘 (algorithm.ts 와 같다): count-reachable · refuse · ok-now · pick-kth · count-fresh · count-stale.
 * answerAt 끝의 도달하지 않는 `return -1` 에는 phase 를 달지 않는다 — 알고리즘은 닿는 수 ≥ k 인데 -1 이 오면 던진다.
 * 모든 값은 작은 정수 (지연 ≤ 300, 수 ≤ 4) — 32 비트 넘침이 없다.
 */
import type { IR, IRExpr, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: { kind: 'int' } };
const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: string): IRExpr => ({ kind: 'index', arr: v(arr), idx: v(idx) });
const bin = (op: '+' | '-' | '<' | '<=' | '==' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });

export const replicationImperativeIR: IR = {
  id: 'replication-imperative',
  algorithm: 'replication',
  paradigm: 'imperative',
  functions: [
    {
      name: 'answerAt',
      params: [
        { name: 'delays', type: INT_LIST },
        { name: 'reach', type: INT_LIST },
        { name: 'n', type: INT },
        { name: 'k', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'count followers the leader can still reach' },
        { kind: 'var', name: 'reachable', type: INT, init: lit(0), phase: 'count-reachable' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          phase: 'count-reachable',
          body: [
            {
              kind: 'if',
              cond: bin('==', at('reach', 'i'), lit(1)),
              phase: 'count-reachable',
              then: [{ kind: 'assign', target: v('reachable'), expr: bin('+', v('reachable'), lit(1)), phase: 'count-reachable' }],
            },
          ],
        },
        { kind: 'comment', text: 'fewer than k reachable: refuse before writing' },
        {
          kind: 'if',
          cond: bin('<', v('reachable'), v('k')),
          phase: 'refuse',
          then: [{ kind: 'return', expr: lit(-1), phase: 'refuse' }],
        },
        {
          kind: 'if',
          cond: bin('==', v('k'), lit(0)),
          phase: 'ok-now',
          then: [{ kind: 'return', expr: lit(0), phase: 'ok-now' }],
        },
        { kind: 'comment', text: 'OK waits for the k-th fastest reachable follower' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          phase: 'pick-kth',
          body: [
            {
              kind: 'if',
              cond: bin('==', at('reach', 'i'), lit(1)),
              phase: 'pick-kth',
              then: [
                { kind: 'var', name: 'faster', type: INT, init: lit(0), phase: 'pick-kth' },
                {
                  kind: 'for-range',
                  var: 'j',
                  from: lit(0),
                  to: v('n'),
                  inclusive: false,
                  phase: 'pick-kth',
                  body: [
                    {
                      kind: 'if',
                      cond: bin('&&', bin('==', at('reach', 'j'), lit(1)), bin('<', at('delays', 'j'), at('delays', 'i'))),
                      phase: 'pick-kth',
                      then: [{ kind: 'assign', target: v('faster'), expr: bin('+', v('faster'), lit(1)), phase: 'pick-kth' }],
                    },
                  ],
                },
                {
                  kind: 'if',
                  cond: bin('==', v('faster'), bin('-', v('k'), lit(1))),
                  phase: 'pick-kth',
                  then: [{ kind: 'return', expr: at('delays', 'i'), phase: 'pick-kth' }],
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: lit(-1) },
      ],
    },
    {
      name: 'freshAt',
      params: [
        { name: 'delays', type: INT_LIST },
        { name: 'reach', type: INT_LIST },
        { name: 'n', type: INT },
        { name: 't', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'a write lands before a read at the same ms' },
        { kind: 'var', name: 'fresh', type: INT, init: lit(0), phase: 'count-fresh' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          phase: 'count-fresh',
          body: [
            {
              kind: 'if',
              cond: bin('&&', bin('==', at('reach', 'i'), lit(1)), bin('<=', at('delays', 'i'), v('t'))),
              phase: 'count-fresh',
              then: [{ kind: 'assign', target: v('fresh'), expr: bin('+', v('fresh'), lit(1)), phase: 'count-fresh' }],
            },
          ],
        },
        { kind: 'return', expr: v('fresh'), phase: 'count-fresh' },
      ],
    },
    {
      name: 'staleAt',
      params: [
        { name: 'delays', type: INT_LIST },
        { name: 'reach', type: INT_LIST },
        { name: 'n', type: INT },
        { name: 't', type: INT },
        { name: 'accepted', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'refused write: the confirmed value is unchanged' },
        {
          kind: 'if',
          cond: bin('==', v('accepted'), lit(0)),
          phase: 'count-stale',
          then: [{ kind: 'return', expr: lit(0), phase: 'count-stale' }],
        },
        {
          kind: 'return',
          expr: bin('-', v('n'), { kind: 'call', fn: 'freshAt', args: [v('delays'), v('reach'), v('n'), v('t')] }),
          phase: 'count-stale',
        },
      ],
    },
  ],
};

export const replicationIRs: IR[] = [replicationImperativeIR];
