/**
 * 재시도와 백오프의 IR — 화면과 같은 셈을 여섯 언어로 편다.
 *
 * 진입 `simulateRetries(policy, outageFrom, outageLen, cap, kMax, tickLimit, seed,
 *                       births, draws, due, tries, done, tally) → int`
 *   births — 손님마다 처음 온 틱 (부르는 쪽이 데이터에서 편다, 번호 차례)
 *   draws · due · tries · done — 부르는 쪽이 길이를 맞춰 건네는 버퍼 (IR 은 배열을 만들 수 없다)
 *   tally[0..3] = 몰림 · 뒤 실패 · 끝 · 찾아옴, 답 = 몰림. 모르는 방식이나 tickLimit 안에 끝나지 않으면 −1.
 *
 * phase 집합 = { serve, retry-now, retry-exp, retry-jitter } — algorithm.ts 가 보내는 집합과 같다.
 * 중간값 최대: 75·65536 + 74 = 4 915 274, x·창 ≤ 65536·32 = 2 097 152 (< 2^31). `//` · `%` 는 음수가 없다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '%' | '<' | '<=' | '>=' | '==', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const decl = (name: string, init: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'var', name, type: INT, init } : { kind: 'var', name, type: INT, init, phase };
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target, expr } : { kind: 'assign', target, expr, phase };
const inc = (target: IRExpr, by: number): IRStmt => set(target, bin('+', target, n(by)));

const retryBranch: IRStmt[] = [
  { kind: 'comment', text: 'failed: count it after revival, then pick the next visit tick' },
  {
    kind: 'if',
    cond: bin('>=', v('tick'), v('revive')),
    then: [inc(at('tally', n(1)), 1)],
  },
  inc(at('tries', v('c')), 1),
  decl('k', { kind: 'call', fn: 'min', args: [at('tries', v('c')), v('kMax')] }),
  decl('win', n(1)),
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: v('k'),
    inclusive: false,
    body: [set(v('win'), bin('*', v('win'), n(2)))],
  },
  decl('delay', n(0)),
  {
    kind: 'if',
    cond: bin('==', v('policy'), n(0)),
    then: [set(v('delay'), n(1), 'retry-now')],
    else: [
      {
        kind: 'if',
        cond: bin('==', v('policy'), n(1)),
        then: [set(v('delay'), v('win'), 'retry-exp')],
        else: [
          {
            kind: 'if',
            cond: bin('==', v('policy'), n(2)),
            then: [
              set(
                v('delay'),
                bin(
                  '+',
                  n(1),
                  bin(
                    '//',
                    bin('*', at('draws', bin('-', bin('+', bin('*', v('c'), v('kMax')), v('k')), n(1))), v('win')),
                    n(65537),
                  ),
                ),
                'retry-jitter',
              ),
            ],
            else: [{ kind: 'comment', text: 'unknown policy' }, { kind: 'return', expr: n(-1) }],
          },
        ],
      },
    ],
  },
  set(at('due', v('c')), bin('+', v('tick'), v('delay'))),
];

const visitBody: IRStmt[] = [
  inc(v('count'), 1),
  inc(at('tally', n(3)), 1),
  decl('admit', n(0)),
  {
    kind: 'if',
    cond: bin('==', v('up'), n(1)),
    then: [{ kind: 'if', cond: bin('<', v('taken'), v('cap')), then: [set(v('admit'), n(1))] }],
  },
  {
    kind: 'if',
    cond: bin('==', v('admit'), n(1)),
    then: [
      set(v('taken'), bin('+', v('taken'), n(1)), 'serve'),
      set(at('done', v('c')), n(1)),
      inc(v('remaining'), -1),
      set(at('tally', n(2)), v('tick')),
    ],
    else: retryBranch,
  },
];

export const retryAndBackoffImperativeIR: IR = {
  id: 'retry-and-backoff-imperative',
  algorithm: 'retryAndBackoff',
  paradigm: 'imperative',
  functions: [
    {
      name: 'simulateRetries',
      params: [
        { name: 'policy', type: INT },
        { name: 'outageFrom', type: INT },
        { name: 'outageLen', type: INT },
        { name: 'cap', type: INT },
        { name: 'kMax', type: INT },
        { name: 'tickLimit', type: INT },
        { name: 'seed', type: INT },
        { name: 'births', type: INTS },
        { name: 'draws', type: INTS },
        { name: 'due', type: INTS },
        { name: 'tries', type: INTS },
        { name: 'done', type: INTS },
        { name: 'tally', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'draw every customer\'s jitter up front: x = (75x + 74) mod 65537' },
        decl('x', v('seed')),
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: { kind: 'len', of: v('draws') },
          inclusive: false,
          body: [
            set(v('x'), bin('%', bin('+', bin('*', n(75), v('x')), n(74)), n(65537))),
            set(at('draws', v('i')), v('x')),
          ],
        },
        decl('total', { kind: 'len', of: v('births') }),
        {
          kind: 'for-range',
          var: 'c',
          from: n(0),
          to: v('total'),
          inclusive: false,
          body: [
            set(at('due', v('c')), at('births', v('c'))),
            set(at('tries', v('c')), n(0)),
            set(at('done', v('c')), n(0)),
          ],
        },
        {
          kind: 'for-range',
          var: 'j',
          from: n(0),
          to: n(4),
          inclusive: false,
          body: [set(at('tally', v('j')), n(0))],
        },
        decl('deadTo', bin('-', bin('+', v('outageFrom'), v('outageLen')), n(1))),
        decl('revive', bin('+', v('deadTo'), n(1))),
        decl('remaining', v('total')),
        {
          kind: 'for-range',
          var: 'tick',
          from: n(0),
          to: v('tickLimit'),
          inclusive: false,
          body: [
            { kind: 'comment', text: 'the server is down on [outageFrom, deadTo]' },
            decl('up', n(1)),
            {
              kind: 'if',
              cond: bin('>=', v('tick'), v('outageFrom')),
              then: [{ kind: 'if', cond: bin('<=', v('tick'), v('deadTo')), then: [set(v('up'), n(0))] }],
            },
            decl('taken', n(0)),
            decl('count', n(0)),
            { kind: 'comment', text: 'visitors in number order: the first cap are served' },
            {
              kind: 'for-range',
              var: 'c',
              from: n(0),
              to: v('total'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: bin('==', at('done', v('c')), n(0)),
                  then: [{ kind: 'if', cond: bin('==', at('due', v('c')), v('tick')), then: visitBody }],
                },
              ],
            },
            {
              kind: 'if',
              cond: bin('>=', v('tick'), v('revive')),
              then: [set(at('tally', n(0)), { kind: 'call', fn: 'max', args: [at('tally', n(0)), v('count')] })],
            },
            {
              kind: 'if',
              cond: bin('==', v('remaining'), n(0)),
              then: [{ kind: 'return', expr: at('tally', n(0)) }],
            },
          ],
        },
        { kind: 'comment', text: 'not everyone was served within tickLimit' },
        { kind: 'return', expr: n(-1) },
      ],
    },
  ],
};

export const retryAndBackoffIRs: IR[] = [retryAndBackoffImperativeIR];
