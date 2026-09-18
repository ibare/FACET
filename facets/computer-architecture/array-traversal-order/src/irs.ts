/**
 * 배열 순회 순서 IR.
 *
 * 코드 패널에 두 프로그램이 함께 선다 — **측정되는 프로그램**(`walkSum`, 원소를 더한다)과
 * **측정하는 셈**(`countMisses`, 같은 걸음에서 캐시 미스를 센다). 순서는 바깥/안 루프의
 * 상한을 맞바꾸는 꼴로 가른다.
 *
 * IR 은 배열을 만들 수 없으므로 캐시 상태(`tags` · `stamps`, 길이 = 캐시 줄 수)와
 * 원소 배열(`cells`, 길이 = 행 × 열)은 부르는 쪽이 만들어 건넨다.
 *
 * 캐시: 완전 연관 · LRU. `tags[k]` 는 칸 k 에 든 줄 번호(-1 = 빔), `stamps[k]` 는 그 칸을
 * 마지막으로 쓴 시각(0 = 빔). 빈 칸은 시각이 0 이라 가장 오래된 칸으로 먼저 골라진다.
 *
 * 32 비트 — 중간값 최대는 `missPercent` 의 분자 12,864 (미스 128 · 접근 128) 와 합 8,256.
 *
 * phase 어휘 (algorithm.ts 와 같다):
 *   clear-cache · accumulate · lookup · hit · miss · report
 *   걸음 하나에 phase 하나 — walkSum 의 걸음 머리와 본문은 accumulate, countMisses 의 걸음 머리 ·
 *   주소 셈 · 찾기는 lookup 이다. 두 함수가 같은 걸음 머리를 가지므로 phase 로 갈라 둔다.
 */

import type { IR, IRExpr, IRStmt } from '@ffacet/core/runtime';

const INT = { kind: 'int' } as const;
const INT_LIST = { kind: 'list', of: INT } as const;

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '<' | '==' | '>=', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const decl = (name: string, init: IRExpr, phase: string): IRStmt => ({
  kind: 'var',
  name,
  type: INT,
  init,
  phase,
});
const put = (target: IRExpr, expr: IRExpr, phase: string): IRStmt => ({ kind: 'assign', target, expr, phase });

/**
 * 순서에 따라 바깥/안 상한을 고르고, 두 겹 루프 안에서 (r, c) 를 되살리는 머리.
 * `body` 는 r · c 가 정해진 뒤 할 일이다.
 */
function walkLoops(phase: string, body: IRStmt[]): IRStmt[] {
  return [
    decl('outerN', v('rows'), phase),
    decl('innerN', v('cols'), phase),
    {
      kind: 'if',
      cond: bin('==', v('order'), n(1)),
      then: [put(v('outerN'), v('cols'), phase), put(v('innerN'), v('rows'), phase)],
      phase,
    },
    {
      kind: 'for-range',
      var: 'a',
      from: n(0),
      to: v('outerN'),
      inclusive: false,
      phase,
      body: [
        {
          kind: 'for-range',
          var: 'b',
          from: n(0),
          to: v('innerN'),
          inclusive: false,
          phase,
          body: [
            decl('r', v('a'), phase),
            decl('c', v('b'), phase),
            {
              kind: 'if',
              cond: bin('==', v('order'), n(1)),
              then: [put(v('r'), v('b'), phase), put(v('c'), v('a'), phase)],
              phase,
            },
            ...body,
          ],
        },
      ],
    },
  ];
}

export const arrayTraversalOrderImperativeIR: IR = {
  id: 'array-traversal-order-imperative',
  algorithm: 'arrayTraversalOrder',
  paradigm: 'imperative',
  functions: [
    {
      name: 'countMisses',
      params: [
        { name: 'rows', type: INT },
        { name: 'cols', type: INT },
        { name: 'order', type: INT },
        { name: 'lineElems', type: INT },
        { name: 'tags', type: INT_LIST },
        { name: 'stamps', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'order 0: row-major (r outer), order 1: column-major (c outer)' },
        {
          kind: 'for-range',
          var: 'k',
          from: n(0),
          to: { kind: 'len', of: v('tags') },
          inclusive: false,
          phase: 'clear-cache',
          body: [put(at('tags', v('k')), n(-1), 'clear-cache'), put(at('stamps', v('k')), n(0), 'clear-cache')],
        },
        decl('misses', n(0), 'clear-cache'),
        decl('clock', n(0), 'clear-cache'),
        ...walkLoops('lookup', [
          decl('elem', bin('+', bin('*', v('r'), v('cols')), v('c')), 'lookup'),
          decl('line', bin('//', v('elem'), v('lineElems')), 'lookup'),
          put(v('clock'), bin('+', v('clock'), n(1)), 'lookup'),
          decl('slot', n(-1), 'lookup'),
          {
            kind: 'for-range',
            var: 'k',
            from: n(0),
            to: { kind: 'len', of: v('tags') },
            inclusive: false,
            phase: 'lookup',
            body: [
              {
                kind: 'if',
                cond: bin('==', at('tags', v('k')), v('line')),
                then: [put(v('slot'), v('k'), 'lookup')],
                phase: 'lookup',
              },
            ],
          },
          {
            kind: 'if',
            cond: bin('>=', v('slot'), n(0)),
            phase: 'hit',
            then: [put(at('stamps', v('slot')), v('clock'), 'hit')],
            else: [
              put(v('misses'), bin('+', v('misses'), n(1)), 'miss'),
              decl('victim', n(0), 'miss'),
              {
                kind: 'for-range',
                var: 'k',
                from: n(1),
                to: { kind: 'len', of: v('stamps') },
                inclusive: false,
                phase: 'miss',
                body: [
                  {
                    kind: 'if',
                    cond: bin('<', at('stamps', v('k')), at('stamps', v('victim'))),
                    then: [put(v('victim'), v('k'), 'miss')],
                    phase: 'miss',
                  },
                ],
              },
              put(at('tags', v('victim')), v('line'), 'miss'),
              put(at('stamps', v('victim')), v('clock'), 'miss'),
            ],
          },
        ]),
        { kind: 'return', expr: v('misses'), phase: 'report' },
      ],
    },
    {
      name: 'walkSum',
      params: [
        { name: 'cells', type: INT_LIST },
        { name: 'rows', type: INT },
        { name: 'cols', type: INT },
        { name: 'order', type: INT },
      ],
      returnType: INT,
      body: [
        decl('total', n(0), 'accumulate'),
        ...walkLoops('accumulate', [
          put(
            v('total'),
            bin('+', v('total'), at('cells', bin('+', bin('*', v('r'), v('cols')), v('c')))),
            'accumulate',
          ),
        ]),
        { kind: 'return', expr: v('total'), phase: 'report' },
      ],
    },
    {
      name: 'missPercent',
      params: [
        { name: 'misses', type: INT },
        { name: 'accesses', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'return',
          expr: bin('//', bin('+', bin('*', v('misses'), n(100)), bin('//', v('accesses'), n(2))), v('accesses')),
          phase: 'report',
        },
      ],
    },
  ],
};

export const arrayTraversalOrderIRs: IR[] = [arrayTraversalOrderImperativeIR];
