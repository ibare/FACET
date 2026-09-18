/**
 * 비순차 실행 — 코드 패널 IR.
 *
 * 진입 `countCycles(lat, dst, srcA, srcB, window, width, start, done): int`.
 * IR 은 배열을 만들 수 없으므로 `start` · `done` 버퍼(길이 n, 0 = 아직)는 부르는 쪽이 건넨다.
 * 레지스터는 번호, 원천이 없으면 -1.
 *
 * 준비 판정의 "생산자가 시작했고 그 끝 < 박자" 는 `if` 를 중첩한다 —
 * `ir-interpreter` 의 `&&` 는 짧은 회로가 아니라 -1 색인을 읽는다.
 *
 * phase 어휘: 'advance-cycle' | 'commit' | 'check-ready' | 'issue' | 'finish' (algorithm 과 같다)
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '*' | '//' | '<' | '>' | '>=' | '==', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const decl = (name: string, init: IRExpr, phase: string): IRStmt => ({ kind: 'var', name, type: INT, init, phase });
const set = (target: IRExpr, expr: IRExpr, phase: string): IRStmt => ({ kind: 'assign', target, expr, phase });

/** 원천 하나의 준비 판정 — 생산자가 없거나, 시작했고 이미 끝났으면 통과. */
function checkSource(producerVar: string, srcArr: string): IRStmt[] {
  return [
    decl(producerVar, { kind: 'call', fn: 'producerOf', args: [v('dst'), at(srcArr, v('i')), v('i')] }, 'check-ready'),
    {
      kind: 'if',
      cond: bin('>=', v(producerVar), lit(0)),
      then: [
        {
          kind: 'if',
          cond: bin('==', at('start', v(producerVar)), lit(0)),
          then: [set(v('ready'), lit(0), 'check-ready')],
          else: [
            {
              kind: 'if',
              cond: bin('>=', at('done', v(producerVar)), v('cycle')),
              then: [set(v('ready'), lit(0), 'check-ready')],
              phase: 'check-ready',
            },
          ],
          phase: 'check-ready',
        },
      ],
      phase: 'check-ready',
    },
  ];
}

export const outOfOrderExecutionImperativeIR: IR = {
  id: 'out-of-order-execution-imperative',
  algorithm: 'outOfOrderExecution',
  paradigm: 'imperative',
  functions: [
    {
      name: 'countCycles',
      params: [
        { name: 'lat', type: INTS },
        { name: 'dst', type: INTS },
        { name: 'srcA', type: INTS },
        { name: 'srcB', type: INTS },
        { name: 'window', type: INT },
        { name: 'width', type: INT },
        { name: 'start', type: INTS },
        { name: 'done', type: INTS },
      ],
      returnType: INT,
      body: [
        decl('n', { kind: 'len', of: v('lat') }, 'advance-cycle'),
        decl('oldest', lit(0), 'advance-cycle'),
        decl('cycle', lit(0), 'advance-cycle'),
        {
          kind: 'while',
          cond: bin('<', v('oldest'), v('n')),
          phase: 'advance-cycle',
          body: [
            set(v('cycle'), bin('+', v('cycle'), lit(1)), 'advance-cycle'),
            { kind: 'comment', text: '커밋 — 가장 오래된 것부터, 끝난 박자 다음 박자부터' },
            { kind: 'var', name: 'more', type: { kind: 'bool' }, init: { kind: 'lit', value: true }, phase: 'commit' },
            {
              kind: 'while',
              cond: v('more'),
              phase: 'commit',
              body: [
                set(v('more'), { kind: 'lit', value: false }, 'commit'),
                {
                  kind: 'if',
                  cond: bin('<', v('oldest'), v('n')),
                  phase: 'commit',
                  then: [
                    {
                      kind: 'if',
                      cond: bin('>', at('start', v('oldest')), lit(0)),
                      phase: 'commit',
                      then: [
                        {
                          kind: 'if',
                          cond: bin('<', at('done', v('oldest')), v('cycle')),
                          phase: 'commit',
                          then: [
                            set(v('oldest'), bin('+', v('oldest'), lit(1)), 'commit'),
                            set(v('more'), { kind: 'lit', value: true }, 'commit'),
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            { kind: 'comment', text: '시작 — 창 안을 오래된 것부터, 폭까지' },
            decl('issued', lit(0), 'check-ready'),
            decl('last', { kind: 'call', fn: 'min', args: [bin('+', v('oldest'), v('window')), v('n')] }, 'check-ready'),
            {
              kind: 'for-range',
              var: 'i',
              from: v('oldest'),
              to: v('last'),
              inclusive: false,
              phase: 'check-ready',
              body: [
                {
                  kind: 'if',
                  cond: bin('==', at('start', v('i')), lit(0)),
                  phase: 'check-ready',
                  then: [
                    {
                      kind: 'if',
                      cond: bin('<', v('issued'), v('width')),
                      phase: 'check-ready',
                      then: [
                        decl('ready', lit(1), 'check-ready'),
                        ...checkSource('pa', 'srcA'),
                        ...checkSource('pb', 'srcB'),
                        {
                          kind: 'if',
                          cond: bin('==', v('ready'), lit(1)),
                          phase: 'issue',
                          then: [
                            set(at('start', v('i')), v('cycle'), 'issue'),
                            set(
                              at('done', v('i')),
                              bin('-', bin('+', v('cycle'), at('lat', v('i'))), lit(1)),
                              'issue',
                            ),
                            set(v('issued'), bin('+', v('issued'), lit(1)), 'issue'),
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: v('cycle'), phase: 'finish' },
      ],
    },
    {
      name: 'producerOf',
      params: [
        { name: 'dst', type: INTS },
        { name: 'reg', type: INT },
        { name: 'before', type: INT },
      ],
      returnType: INT,
      body: [
        decl('p', lit(-1), 'check-ready'),
        {
          kind: 'for-range',
          var: 'j',
          from: lit(0),
          to: v('before'),
          inclusive: false,
          phase: 'check-ready',
          body: [
            {
              kind: 'if',
              cond: bin('==', at('dst', v('j')), v('reg')),
              then: [set(v('p'), v('j'), 'check-ready')],
              phase: 'check-ready',
            },
          ],
        },
        { kind: 'return', expr: v('p'), phase: 'check-ready' },
      ],
    },
    {
      name: 'ipcPercent',
      params: [
        { name: 'count', type: INT },
        { name: 'cycles', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'return',
          expr: bin('//', bin('+', bin('*', v('count'), lit(100)), bin('//', v('cycles'), lit(2))), v('cycles')),
          phase: 'finish',
        },
      ],
    },
    {
      name: 'countOvertakes',
      params: [{ name: 'start', type: INTS }],
      returnType: INT,
      body: [
        decl('total', lit(0), 'finish'),
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: { kind: 'len', of: v('start') },
          inclusive: false,
          phase: 'finish',
          body: [
            {
              kind: 'for-range',
              var: 'j',
              from: lit(0),
              to: v('i'),
              inclusive: false,
              phase: 'finish',
              body: [
                {
                  kind: 'if',
                  cond: bin('>', at('start', v('j')), at('start', v('i'))),
                  phase: 'finish',
                  then: [set(v('total'), bin('+', v('total'), lit(1)), 'finish'), { kind: 'break', phase: 'finish' }],
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: v('total'), phase: 'finish' },
      ],
    },
  ],
};

export const outOfOrderExecutionIRs: IR[] = [outOfOrderExecutionImperativeIR];
