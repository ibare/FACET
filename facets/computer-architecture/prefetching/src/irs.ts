/**
 * 프리페치 IR — 배열을 앞에서부터 걸으며 몇 줄 앞을 미리 부르는 셈.
 *
 * IR 함수는 배열을 만들 수 없으므로 줄 상태 세 버퍼를 매개변수로 받는다 (길이 = 줄 수).
 *   arrive[k]  줄 k 가 도착하는 시각
 *   stamp[k]   줄 k 의 LRU 도장 (넣을 때와 쓸 때마다 +1 되는 시계)
 *   state[k]   0 없음 · 1 제 발로 들어옴 · 2 미리 불러 아직 안 씀 · 3 미리 불러 씀
 *
 * 값 하나만 돌려줄 수 있어 걷기가 둘이다 — `countCycles` 는 끝의 시각(박자)을,
 * `countWasted` 는 버린 선반입 수를 돌려준다. 둘 다 같은 `walk` 를 부르고 버퍼는
 * `walk` 가 첫머리에서 비운다. 멈춤 박자 = 박자 − n.
 *
 * `&&` 는 짧은 회로가 아니므로(인터프리터가 양쪽을 다 셈한다) 색인을 읽는 조건은
 * `if` 를 겹쳐 적는다. 음수가 `//` · `%` 에 닿는 자리는 없다.
 *
 * phase 어휘 (algorithm.ts 와 같은 집합 — C3):
 *   'miss' | 'evict' | 'stall' | 'touch' | 'prefetch' | 'done'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '-' | '//' | '%' | '<' | '>' | '==' | '!=' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op: o,
  l,
  r,
});
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

const BUFFER_PARAMS = [
  { name: 'arrive', type: INT_LIST },
  { name: 'stamp', type: INT_LIST },
  { name: 'state', type: INT_LIST },
];

const WALK_PARAMS = [
  { name: 'n', type: INT },
  { name: 'lineElems', type: INT },
  { name: 'latency', type: INT },
  { name: 'dist', type: INT },
  { name: 'capacity', type: INT },
  ...BUFFER_PARAMS,
];

const WALK_ARGS: IRExpr[] = WALK_PARAMS.map((p) => v(p.name));

/** 줄 하나를 캐시에 넣는다 — 미스와 미리 부르기가 같은 방법을 쓴다. */
function bring(line: IRExpr, kind: number, phase: string): IRStmt[] {
  return [
    {
      kind: 'assign',
      target: v('wasted'),
      expr: op('+', v('wasted'), call('makeRoom', [v('state'), v('stamp'), v('capacity')])),
      phase,
    },
    { kind: 'assign', target: at('state', line), expr: n(kind), phase },
    { kind: 'assign', target: at('arrive', line), expr: op('+', v('t'), v('latency')), phase },
    { kind: 'assign', target: v('clock'), expr: op('+', v('clock'), n(1)), phase },
    { kind: 'assign', target: at('stamp', line), expr: v('clock'), phase },
  ];
}

export const prefetchingImperativeIR: IR = {
  id: 'prefetching-imperative',
  algorithm: 'prefetching',
  paradigm: 'imperative',
  functions: [
    {
      name: 'countCycles',
      params: WALK_PARAMS,
      returnType: INT,
      body: [
        { kind: 'return', expr: call('walk', [...WALK_ARGS, n(0)]), phase: 'done' },
      ],
    },
    {
      name: 'countWasted',
      params: WALK_PARAMS,
      returnType: INT,
      body: [
        { kind: 'return', expr: call('walk', [...WALK_ARGS, n(1)]), phase: 'done' },
      ],
    },
    {
      name: 'walk',
      params: [...WALK_PARAMS, { name: 'report', type: INT }],
      returnType: INT,
      body: [
        { kind: 'var', name: 'lines', type: INT, init: op('//', v('n'), v('lineElems')) },
        {
          kind: 'for-range',
          var: 'k',
          from: n(0),
          to: v('lines'),
          inclusive: false,
          body: [
            { kind: 'assign', target: at('arrive', v('k')), expr: n(0) },
            { kind: 'assign', target: at('stamp', v('k')), expr: n(0) },
            { kind: 'assign', target: at('state', v('k')), expr: n(0) },
          ],
        },
        { kind: 'var', name: 't', type: INT, init: n(0) },
        { kind: 'var', name: 'clock', type: INT, init: n(0) },
        { kind: 'var', name: 'wasted', type: INT, init: n(0) },
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: v('n'),
          inclusive: false,
          body: [
            { kind: 'var', name: 'line', type: INT, init: op('//', v('i'), v('lineElems')), phase: 'touch' },
            { kind: 'comment', text: 'not in cache: a miss, bring it in' },
            {
              kind: 'if',
              cond: op('==', at('state', v('line')), n(0)),
              then: bring(v('line'), 1, 'miss'),
              phase: 'miss',
            },
            { kind: 'comment', text: 'still on its way: wait for it (not a miss)' },
            {
              kind: 'if',
              cond: op('>', at('arrive', v('line')), v('t')),
              then: [{ kind: 'assign', target: v('t'), expr: at('arrive', v('line')), phase: 'stall' }],
              phase: 'stall',
            },
            { kind: 'assign', target: v('clock'), expr: op('+', v('clock'), n(1)), phase: 'touch' },
            { kind: 'assign', target: at('stamp', v('line')), expr: v('clock'), phase: 'touch' },
            {
              kind: 'if',
              cond: op('==', at('state', v('line')), n(2)),
              then: [{ kind: 'assign', target: at('state', v('line')), expr: n(3), phase: 'touch' }],
              phase: 'touch',
            },
            { kind: 'comment', text: 'first element of a line: call the line dist ahead' },
            {
              kind: 'if',
              cond: op('&&', op('==', op('%', v('i'), v('lineElems')), n(0)), op('>', v('dist'), n(0))),
              then: [
                { kind: 'var', name: 'ahead', type: INT, init: op('+', v('line'), v('dist')), phase: 'prefetch' },
                {
                  kind: 'if',
                  cond: op('<', v('ahead'), v('lines')),
                  then: [
                    {
                      kind: 'if',
                      cond: op('==', at('state', v('ahead')), n(0)),
                      then: bring(v('ahead'), 2, 'prefetch'),
                      phase: 'prefetch',
                    },
                  ],
                  phase: 'prefetch',
                },
              ],
              phase: 'prefetch',
            },
            { kind: 'assign', target: v('t'), expr: op('+', v('t'), n(1)), phase: 'touch' },
          ],
        },
        {
          kind: 'if',
          cond: op('==', v('report'), n(1)),
          then: [{ kind: 'return', expr: v('wasted'), phase: 'done' }],
          phase: 'done',
        },
        { kind: 'return', expr: v('t'), phase: 'done' },
      ],
    },
    {
      name: 'makeRoom',
      params: [
        { name: 'state', type: INT_LIST },
        { name: 'stamp', type: INT_LIST },
        { name: 'capacity', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'used', type: INT, init: n(0), phase: 'evict' },
        {
          kind: 'for-range',
          var: 'k',
          from: n(0),
          to: { kind: 'len', of: v('state') },
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: op('!=', at('state', v('k')), n(0)),
              then: [{ kind: 'assign', target: v('used'), expr: op('+', v('used'), n(1)), phase: 'evict' }],
              phase: 'evict',
            },
          ],
          phase: 'evict',
        },
        { kind: 'comment', text: 'a free place (lines in flight hold one too)' },
        {
          kind: 'if',
          cond: op('<', v('used'), v('capacity')),
          then: [{ kind: 'return', expr: n(0), phase: 'evict' }],
          phase: 'evict',
        },
        { kind: 'comment', text: 'full: push out the least recently stamped line' },
        { kind: 'var', name: 'victim', type: INT, init: n(-1), phase: 'evict' },
        {
          kind: 'for-range',
          var: 'k',
          from: n(0),
          to: { kind: 'len', of: v('state') },
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: op('!=', at('state', v('k')), n(0)),
              then: [
                {
                  kind: 'if',
                  cond: op('<', v('victim'), n(0)),
                  then: [{ kind: 'assign', target: v('victim'), expr: v('k'), phase: 'evict' }],
                  else: [
                    {
                      kind: 'if',
                      cond: op('<', at('stamp', v('k')), at('stamp', v('victim'))),
                      then: [{ kind: 'assign', target: v('victim'), expr: v('k'), phase: 'evict' }],
                      phase: 'evict',
                    },
                  ],
                  phase: 'evict',
                },
              ],
              phase: 'evict',
            },
          ],
          phase: 'evict',
        },
        { kind: 'comment', text: 'called ahead but never used: a wasted prefetch' },
        { kind: 'var', name: 'lost', type: INT, init: n(0), phase: 'evict' },
        {
          kind: 'if',
          cond: op('==', at('state', v('victim')), n(2)),
          then: [{ kind: 'assign', target: v('lost'), expr: n(1), phase: 'evict' }],
          phase: 'evict',
        },
        { kind: 'assign', target: at('state', v('victim')), expr: n(0), phase: 'evict' },
        { kind: 'return', expr: v('lost'), phase: 'evict' },
      ],
    },
  ],
};

export const prefetchingIRs: IR[] = [prefetchingImperativeIR];
