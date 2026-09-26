/**
 * subquery 의 IR — 화면의 질의를 셈하는 반복.
 *
 * 코드 패널은 SQL 이 아니다. 화면의 SQL 이 "무엇을 묻는가" 라면, 이 IR 은 그 물음을 엔진이
 * 어떻게 도는가를 적는다 — 비상관이면 안쪽 훑기가 바깥 반복 앞에서 한 번, 상관이면 바깥 반복
 * 안에서 줄마다 한 번. 결과 줄 수를 돌려주고, 안쪽이 돈 수와 읽은 줄 수를 `stats` 에 적는다.
 *
 * 부르는 쪽이 건네는 것 (algorithm 과 test 가 같은 규약으로 만든다):
 *   correlated  0 = 비상관 · 1 = 상관
 *   dept        부서 번호 — 처음 나온 차례로 0 부터 (lab 0 · desk 1)
 *   pay         pay 열
 *   n           표의 앞 n 줄만 본다
 *   stats       길이 2 — [0] 안쪽이 돈 수 · [1] 읽은 줄 수
 *
 * `pay > AVG(pay)` 는 `pay * cnt > total` 로 견준다 — 정수만 거친다. 중간값 최대 99 × 8 = 792.
 *
 * phase — algorithm 과 정확히 같은 집합:
 *   inner-scan     안쪽 훑기 반복 (비상관 · 상관 두 자리 모두)
 *   outer-compare  바깥 줄의 견줌
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: string): IRExpr => ({ kind: 'index', arr: v(arr), idx: v(idx) });
const add = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '+', l, r });
const inc = (name: string, by: IRExpr = n(1)): IRStmt => ({ kind: 'assign', target: v(name), expr: add(v(name), by) });

/** 안쪽 훑기 몸 — 줄 j 를 읽고, 고를 줄이면 합과 수에 쌓는다. */
function scanBody(filterByDept: boolean): IRStmt[] {
  const take: IRStmt[] = [inc('total', at('pay', 'j')), inc('cnt')];
  if (!filterByDept) return [inc('reads'), ...take];
  return [
    inc('reads'),
    {
      kind: 'if',
      cond: { kind: 'binop', op: '==', l: at('dept', 'j'), r: at('dept', 'i') },
      then: take,
    },
  ];
}

export const subqueryImperativeIR: IR = {
  id: 'subquery-imperative',
  algorithm: 'subquery',
  paradigm: 'imperative',
  functions: [
    {
      name: 'subqueryCount',
      params: [
        { name: 'correlated', type: INT },
        { name: 'dept', type: INT_LIST },
        { name: 'pay', type: INT_LIST },
        { name: 'n', type: INT },
        { name: 'stats', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'runs', type: INT, init: n(0) },
        { kind: 'var', name: 'reads', type: INT, init: n(0) },
        { kind: 'var', name: 'total', type: INT, init: n(0) },
        { kind: 'var', name: 'cnt', type: INT, init: n(0) },
        { kind: 'var', name: 'kept', type: INT, init: n(0) },
        { kind: 'comment', text: 'uncorrelated: the inner query runs once, before the outer loop' },
        {
          kind: 'if',
          cond: { kind: 'binop', op: '==', l: v('correlated'), r: n(0) },
          then: [
            inc('runs'),
            {
              kind: 'for-range',
              var: 'j',
              from: n(0),
              to: v('n'),
              inclusive: false,
              phase: 'inner-scan',
              body: scanBody(false),
            },
          ],
        },
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: v('n'),
          inclusive: false,
          body: [
            inc('reads'),
            { kind: 'comment', text: 'correlated: the inner query runs again for every outer row' },
            {
              kind: 'if',
              cond: { kind: 'binop', op: '==', l: v('correlated'), r: n(1) },
              then: [
                inc('runs'),
                { kind: 'assign', target: v('total'), expr: n(0) },
                { kind: 'assign', target: v('cnt'), expr: n(0) },
                {
                  kind: 'for-range',
                  var: 'j',
                  from: n(0),
                  to: v('n'),
                  inclusive: false,
                  phase: 'inner-scan',
                  body: scanBody(true),
                },
              ],
            },
            { kind: 'comment', text: 'pay > AVG(pay), compared as integers: pay * cnt > total' },
            {
              kind: 'if',
              cond: {
                kind: 'binop',
                op: '>',
                l: { kind: 'binop', op: '*', l: at('pay', 'i'), r: v('cnt') },
                r: v('total'),
              },
              then: [inc('kept')],
              phase: 'outer-compare',
            },
          ],
        },
        { kind: 'assign', target: { kind: 'index', arr: v('stats'), idx: n(0) }, expr: v('runs') },
        { kind: 'assign', target: { kind: 'index', arr: v('stats'), idx: n(1) }, expr: v('reads') },
        { kind: 'return', expr: v('kept') },
      ],
    },
  ],
};

export const subqueryIRs: IR[] = [subqueryImperativeIR];
