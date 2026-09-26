/**
 * bitmap-index IR — 비트 줄을 포개 결과 줄을 만들고 1 의 수(읽을 줄 수)를 돌려준다.
 *
 * IR 에는 비트 연산이 없다. 비트 줄은 부르는 쪽이 표에서 0/1 배열로 만들어 조건 차례로 이어 편다
 * (조건 c 의 줄 r 은 `c * rowCount + r`). AND 는 곱 `result[r] * b`, OR 는 `max(result[r], b)`.
 * 결과 버퍼 `result` 도 부르는 쪽이 줄 수만큼 만든다 — IR 함수는 배열을 만들 수 없다.
 * (`out` 은 C# 예약어라 버퍼 이름을 `result` 로 둔다)
 *
 * phase 어휘: load-first · combine-and · combine-or · fetch-rows (algorithm.ts 와 같다).
 * AND · OR 두 대입 줄에 phase 를 따로 단다 — 같은 phase 면 돌지 않는 줄까지 켜진다.
 * 중간값 최대 — 색인 `c * rowCount + r` 의 35 (조건 셋 · 줄 열둘).
 */
import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const INT_LIST = { kind: 'list', of: INT } as const;

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const add = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '+', l, r });
const mul = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '*', l, r });

/** bits[c * rowCount + r] */
const bitAt: IRExpr = at('bits', add(mul(v('c'), v('rowCount')), v('r')));

const body: IRStmt[] = [
  { kind: 'comment', text: 'The first condition bit row becomes the result' },
  {
    kind: 'for-range',
    var: 'r',
    from: n(0),
    to: v('rowCount'),
    inclusive: false,
    body: [{ kind: 'assign', target: at('result', v('r')), expr: at('bits', v('r')), phase: 'load-first' }],
  },
  { kind: 'comment', text: 'Stack each next bit row onto the result: AND keeps, OR spreads' },
  {
    kind: 'for-range',
    var: 'c',
    from: n(1),
    to: v('condCount'),
    inclusive: false,
    body: [
      {
        kind: 'for-range',
        var: 'r',
        from: n(0),
        to: v('rowCount'),
        inclusive: false,
        body: [
          {
            kind: 'if',
            cond: { kind: 'binop', op: '==', l: v('useOr'), r: n(1) },
            then: [
              {
                kind: 'assign',
                target: at('result', v('r')),
                expr: { kind: 'call', fn: 'max', args: [at('result', v('r')), bitAt] },
                phase: 'combine-or',
              },
            ],
            else: [
              {
                kind: 'assign',
                target: at('result', v('r')),
                expr: mul(at('result', v('r')), bitAt),
                phase: 'combine-and',
              },
            ],
          },
        ],
      },
    ],
  },
  { kind: 'comment', text: 'Read only the table rows where the result has a 1' },
  { kind: 'var', name: 'rowsRead', type: INT, init: n(0), phase: 'fetch-rows' },
  {
    kind: 'for-range',
    var: 'r',
    from: n(0),
    to: v('rowCount'),
    inclusive: false,
    body: [
      {
        kind: 'assign',
        target: v('rowsRead'),
        expr: add(v('rowsRead'), at('result', v('r'))),
        phase: 'fetch-rows',
      },
    ],
  },
  { kind: 'return', expr: v('rowsRead'), phase: 'fetch-rows' },
];

export const bitmapIndexImperativeIR: IR = {
  id: 'bitmap-index-imperative',
  algorithm: 'bitmapIndex',
  paradigm: 'imperative',
  functions: [
    {
      name: 'combineBits',
      params: [
        { name: 'bits', type: INT_LIST },
        { name: 'rowCount', type: INT },
        { name: 'condCount', type: INT },
        { name: 'useOr', type: INT },
        { name: 'result', type: INT_LIST },
      ],
      returnType: INT,
      body,
    },
  ],
};

export const bitmapIndexIRs: IR[] = [bitmapIndexImperativeIR];
