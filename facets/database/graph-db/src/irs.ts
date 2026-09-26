/**
 * graph-db 의 IR — 함수 하나 `expand`. 돌려주는 값 = 읽은 이음 수.
 *
 * IR 은 배열을 만들 수 없어 부르는 쪽이 번호 배열을 짓는다:
 *   src · typ · dst  이음마다 나가는 노드 · 종류 번호 · 끝 노드 (노드 번호는 initialData.nodes 차례, 종류 번호는 edgeTypes 차례)
 *   first            노드 v 가 쥔 이음이 first[v] .. first[v+1] - 1 (길이 노드 수 + 1)
 *   seen · cur · nxt 노드 수만큼의 0 버퍼. 끝나면 seen 의 1 의 합 - 1 = 닿은 사람
 *
 * phase 어휘 (algorithm.ts 와 같다): look-held · look-table · cross · done
 * 조건은 `if` 를 중첩한다 — ir-interpreter 의 `&&` 는 짧은 회로가 아니다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const eq = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '==', l, r });
const plus = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '+', l, r });
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target, expr } : { kind: 'assign', target, expr, phase };

/** 끝 노드가 아직 닿지 않았으면 건넌다 — seen 과 다음 앞 줄에 올린다. */
const crossIfNew = (): IRStmt[] => [
  {
    kind: 'if',
    cond: eq(at('typ', v('e')), v('follow')),
    then: [
      {
        kind: 'if',
        cond: eq(at('seen', at('dst', v('e'))), n(0)),
        then: [
          set(at('seen', at('dst', v('e'))), n(1), 'cross'),
          set(at('nxt', at('dst', v('e'))), n(1), 'cross'),
        ],
      },
    ],
  },
];

export const graphDbImperativeIR: IR = {
  id: 'graph-db-imperative',
  algorithm: 'graphDb',
  paradigm: 'imperative',
  functions: [
    {
      name: 'expand',
      params: [
        { name: 'hops', type: INT },
        { name: 'held', type: INT },
        { name: 'start', type: INT },
        { name: 'follow', type: INT },
        { name: 'src', type: INTS },
        { name: 'typ', type: INTS },
        { name: 'dst', type: INTS },
        { name: 'first', type: INTS },
        { name: 'seen', type: INTS },
        { name: 'cur', type: INTS },
        { name: 'nxt', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'seen = reached nodes, cur = front row, nxt = next front row' },
        set(at('seen', v('start')), n(1)),
        set(at('cur', v('start')), n(1)),
        { kind: 'var', name: 'read', type: INT, init: n(0) },
        {
          kind: 'for-range',
          var: 'h',
          from: n(0),
          to: v('hops'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: eq(v('held'), n(1)),
              then: [
                { kind: 'comment', text: 'held edges: each front node reads only the edges it holds' },
                {
                  kind: 'for-range',
                  var: 'v',
                  from: n(0),
                  to: { kind: 'len', of: v('cur') },
                  inclusive: false,
                  body: [
                    {
                      kind: 'if',
                      cond: eq(at('cur', v('v')), n(1)),
                      then: [
                        {
                          kind: 'for-range',
                          var: 'e',
                          from: at('first', v('v')),
                          to: at('first', plus(v('v'), n(1))),
                          inclusive: false,
                          body: [set(v('read'), plus(v('read'), n(1)), 'look-held'), ...crossIfNew()],
                        },
                      ],
                    },
                  ],
                },
              ],
              else: [
                { kind: 'comment', text: 'edge table: every row is read, only rows leaving the front row are used' },
                {
                  kind: 'for-range',
                  var: 'e',
                  from: n(0),
                  to: { kind: 'len', of: v('src') },
                  inclusive: false,
                  body: [
                    set(v('read'), plus(v('read'), n(1)), 'look-table'),
                    {
                      kind: 'if',
                      cond: eq(at('cur', at('src', v('e'))), n(1)),
                      then: crossIfNew(),
                    },
                  ],
                },
              ],
            },
            {
              kind: 'for-range',
              var: 'v',
              from: n(0),
              to: { kind: 'len', of: v('cur') },
              inclusive: false,
              body: [set(at('cur', v('v')), at('nxt', v('v')), 'cross'), set(at('nxt', v('v')), n(0), 'cross')],
            },
          ],
        },
        { kind: 'return', expr: v('read'), phase: 'done' },
      ],
    },
  ],
};

export const graphDbIRs: IR[] = [graphDbImperativeIR];
