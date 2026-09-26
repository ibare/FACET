/**
 * optimizer 의 코드 패널 IR — 두 조인 차례의 "만든 줄" (중간 + 끝) 을 셈하고 적은 쪽을 돌려준다.
 *
 * 알고리즘은 계획 트리를 실행하지만 IR 은 두 차례를 함수 둘로 편다 — IR 에는 트리 · 문자열 견줌이 없다.
 * 부르는 쪽이 넘기는 값:
 *   custIds   customers 의 id, 넣은 차례
 *   orderCust orders 의 cust_id, orders 차례
 *   orderItem orders 의 item 을 사전순 번호로 (bag 0 · cup 1 · ink 2 · mug 3 · pad 4 · pen 5)
 *   saleItem  sale_items 의 item 을 같은 번호로
 *   k         `WHERE c.id <= k` 의 k — 거르는 줄 수를 손잡이로 바꾸려고 둔 꼴 (설명 글이 밝힌다)
 *   buf       길이 = orders 줄 수. 첫 조인이 중간 줄(orders 의 색인)을 적고 둘째 조인이 읽는다 (IR 은 배열을 짓지 못한다)
 * 동률: 만든 줄이 같으면 먼저 적힌 차례(고객 먼저) — `a <= b`. 이 자료에서는 걸리지 않는다.
 * 중간값 최대 33 (k = 6, 고객 먼저) — 32 비트 넘침 없음.
 *
 * phase 어휘 (algorithm.ts 와 같다): cf-join-orders · cf-join-sales · sf-join-sales · sf-join-customers · compare-orders
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const len = (arr: string): IRExpr => ({ kind: 'len', of: v(arr) });
const bin = (op: '+' | '<=' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });

const PARAMS = [
  { name: 'custIds', type: INTS },
  { name: 'orderCust', type: INTS },
  { name: 'orderItem', type: INTS },
  { name: 'saleItem', type: INTS },
  { name: 'k', type: INT },
  { name: 'buf', type: INTS },
];
const ARGS: IRExpr[] = PARAMS.map((p) => v(p.name));

const forRange = (name: string, to: IRExpr, body: IRStmt[], phase: string): IRStmt => ({
  kind: 'for-range',
  var: name,
  from: n(0),
  to,
  inclusive: false,
  body,
  phase,
});
const iff = (cond: IRExpr, then: IRStmt[], phase: string): IRStmt => ({ kind: 'if', cond, then, phase });
const inc = (name: string, phase: string): IRStmt => ({
  kind: 'assign',
  target: v(name),
  expr: bin('+', v(name), n(1)),
  phase,
});

/** 고객 먼저: (Filter customers) ⋈ orders → 중간, 중간 ⋈ sale_items → 끝. */
function customersFirstBody(): IRStmt[] {
  const A = 'cf-join-orders';
  const B = 'cf-join-sales';
  return [
    { kind: 'comment', text: 'first join: kept customers x orders (outer = customers)' },
    { kind: 'var', name: 'middle', type: INT, init: n(0), phase: A },
    forRange(
      'c',
      len('custIds'),
      [
        iff(
          bin('<=', at('custIds', v('c')), v('k')),
          [
            forRange(
              'o',
              len('orderCust'),
              [
                iff(
                  bin('==', at('orderCust', v('o')), at('custIds', v('c'))),
                  [{ kind: 'assign', target: at('buf', v('middle')), expr: v('o'), phase: A }, inc('middle', A)],
                  A,
                ),
              ],
              A,
            ),
          ],
          A,
        ),
      ],
      A,
    ),
    { kind: 'comment', text: 'second join: middle rows x sale_items' },
    { kind: 'var', name: 'finalCount', type: INT, init: n(0), phase: B },
    forRange(
      'm',
      v('middle'),
      [
        forRange(
          's',
          len('saleItem'),
          [iff(bin('==', at('orderItem', at('buf', v('m'))), at('saleItem', v('s'))), [inc('finalCount', B)], B)],
          B,
        ),
      ],
      B,
    ),
    { kind: 'return', expr: bin('+', v('middle'), v('finalCount')), phase: B },
  ];
}

/** 할인 먼저: orders ⋈ sale_items → 중간, 중간 ⋈ (Filter customers) → 끝. */
function salesFirstBody(): IRStmt[] {
  const A = 'sf-join-sales';
  const B = 'sf-join-customers';
  return [
    { kind: 'comment', text: 'first join: orders x sale_items (outer = orders)' },
    { kind: 'var', name: 'middle', type: INT, init: n(0), phase: A },
    forRange(
      'o',
      len('orderItem'),
      [
        forRange(
          's',
          len('saleItem'),
          [
            iff(
              bin('==', at('orderItem', v('o')), at('saleItem', v('s'))),
              [{ kind: 'assign', target: at('buf', v('middle')), expr: v('o'), phase: A }, inc('middle', A)],
              A,
            ),
          ],
          A,
        ),
      ],
      A,
    ),
    { kind: 'comment', text: 'second join: middle rows x kept customers' },
    { kind: 'var', name: 'finalCount', type: INT, init: n(0), phase: B },
    forRange(
      'm',
      v('middle'),
      [
        forRange(
          'c',
          len('custIds'),
          [
            iff(
              bin('<=', at('custIds', v('c')), v('k')),
              [iff(bin('==', at('orderCust', at('buf', v('m'))), at('custIds', v('c'))), [inc('finalCount', B)], B)],
              B,
            ),
          ],
          B,
        ),
      ],
      B,
    ),
    { kind: 'return', expr: bin('+', v('middle'), v('finalCount')), phase: B },
  ];
}

export const optimizerImperativeIR: IR = {
  id: 'optimizer-imperative',
  algorithm: 'optimizer',
  paradigm: 'imperative',
  functions: [
    {
      name: 'cheaperMadeRows',
      params: PARAMS,
      returnType: INT,
      body: [
        { kind: 'comment', text: 'made rows = rows produced by both joins (middle + final); keep the smaller plan' },
        { kind: 'var', name: 'a', type: INT, init: { kind: 'call', fn: 'customersFirstRows', args: ARGS }, phase: 'compare-orders' },
        { kind: 'var', name: 'b', type: INT, init: { kind: 'call', fn: 'salesFirstRows', args: ARGS }, phase: 'compare-orders' },
        { kind: 'if', cond: bin('<=', v('a'), v('b')), then: [{ kind: 'return', expr: v('a'), phase: 'compare-orders' }], phase: 'compare-orders' },
        { kind: 'return', expr: v('b'), phase: 'compare-orders' },
      ],
    },
    { name: 'customersFirstRows', params: PARAMS, returnType: INT, body: customersFirstBody() },
    { name: 'salesFirstRows', params: PARAMS, returnType: INT, body: salesFirstBody() },
  ],
};

export const optimizerIRs: IR[] = [optimizerImperativeIR];
