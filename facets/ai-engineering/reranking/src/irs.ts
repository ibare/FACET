/**
 * reranking IR — 문턱 안만 도는 선택 정렬이 곧 "추린 것만 다시 본다" 다.
 *
 * 진입 `rerankTop(cross, relevant, order, shortlist)`:
 *   - `cross[d - 1]`    문서 d 의 재순위 점수 (예로 정한 값, 최대 91)
 *   - `relevant[d - 1]` 문서 d 가 정답이면 1, 아니면 0
 *   - `order`           첫 단계 차례의 문서 번호 배열 (부르는 쪽이 만든다 · 길이 12)
 *   - `shortlist`       재순위기에 넘기는 수
 * `order` 의 앞 `shortlist` 칸만 제자리에서 다시 세우고, 위 3 의 정답 수를 돌려준다.
 * 더 크거나 · 같으면 번호가 더 작을 때만 가장 좋은 자리를 바꾼다 (동률 규칙).
 *
 * phase 어휘는 algorithm.ts 와 같다: shortlist · score · swap · count.
 */

import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: IRExpr, idx: IRExpr): IRExpr => ({ kind: 'index', arr, idx });
const bin = (op: '+' | '-' | '>' | '<' | '==' | '&&' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const INT = { kind: 'int' } as const;
const INTS = { kind: 'list', of: { kind: 'int' } } as const;

/** 자리 k 에 선 문서의 재순위 점수 — cross[order[k] - 1]. */
const crossAt = (k: IRExpr): IRExpr => at(v('cross'), bin('-', at(v('order'), k), n(1)));

const body: IRStmt[] = [
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: v('shortlist'),
    inclusive: false,
    phase: 'shortlist',
    body: [
      { kind: 'var', name: 'best', type: INT, init: v('i'), phase: 'shortlist' },
      {
        kind: 'for-range',
        var: 'j',
        from: bin('+', v('i'), n(1)),
        to: v('shortlist'),
        inclusive: false,
        phase: 'score',
        body: [
          { kind: 'var', name: 'score', type: INT, init: crossAt(v('j')), phase: 'score' },
          { kind: 'var', name: 'bestScore', type: INT, init: crossAt(v('best')), phase: 'score' },
          {
            kind: 'if',
            cond: bin(
              '||',
              bin('>', v('score'), v('bestScore')),
              bin(
                '&&',
                bin('==', v('score'), v('bestScore')),
                bin('<', at(v('order'), v('j')), at(v('order'), v('best'))),
              ),
            ),
            then: [{ kind: 'assign', target: v('best'), expr: v('j'), phase: 'score' }],
            phase: 'score',
          },
        ],
      },
      { kind: 'swap', a: at(v('order'), v('i')), b: at(v('order'), v('best')), phase: 'swap' },
    ],
  },
  { kind: 'var', name: 'hits', type: INT, init: n(0), phase: 'count' },
  {
    kind: 'for-range',
    var: 'k',
    from: n(0),
    to: n(3),
    inclusive: false,
    phase: 'count',
    body: [
      {
        kind: 'assign',
        target: v('hits'),
        expr: bin('+', v('hits'), at(v('relevant'), bin('-', at(v('order'), v('k')), n(1)))),
        phase: 'count',
      },
    ],
  },
  { kind: 'return', expr: v('hits'), phase: 'count' },
];

export const rerankingImperativeIR: IR = {
  id: 'reranking-imperative',
  algorithm: 'reranking',
  paradigm: 'imperative',
  functions: [
    {
      name: 'rerankTop',
      params: [
        { name: 'cross', type: INTS },
        { name: 'relevant', type: INTS },
        { name: 'order', type: INTS },
        { name: 'shortlist', type: INT },
      ],
      returnType: INT,
      body,
    },
  ],
};

export const rerankingIRs: IR[] = [rerankingImperativeIR];
