/**
 * loop-optimization IR — 반복 몸을 번호 배열로 받아 두 변환의 비용을 셈하는 컴파일러 함수.
 *
 * 화면의 프로그램(`weigh`)은 입력 자료이고, 이 IR 은 그 몸 줄을 번호 배열로 받아 불변 판정을 판이 멎을 때까지
 * 되풀이하고, N · G · R 로 줄마다 몇 번 도는지 셈한다. 변환한 프로그램의 글자를 짓는 것은 IR 이 하지 않는다
 * (배열을 만들 수 없다 — 알고리즘 몫).
 *
 * 진입 loopCost(bodyOps, bodyIdx, bodyWrite, bodyReads, nBody, width, lo, hi, step, factor, hoist, inv, stats) → 실행 연산
 *   몸 줄 j = 0 … nBody − 1 (마지막이 올림 줄). bodyOps[j] op 마디 수 · bodyIdx[j] 반복 변수가 든 칸 읽기 수 ·
 *   bodyWrite[j] 넣는 이름 번호 · bodyReads[j * width + c] 읽는 이름 번호(없으면 −1).
 *   버퍼 inv[nBody] · stats[3] = 0 반복 관리 · 1 코드 줄 · 2 꺼낸 줄. 부르는 쪽이 길이만큼 만들어 넘긴다.
 *
 * phase 어휘 (algorithm.ts 와 같다): hoist-check · hoist-move · unroll-copy · unroll-bound · unroll-tail · count-ops
 */
import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const INTS = { kind: 'list', of: INT } as const;

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '%' | '<' | '>' | '>=' | '==' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({
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
const loop = (name: string, from: IRExpr, to: IRExpr, body: IRStmt[]): IRStmt => ({
  kind: 'for-range',
  var: name,
  from,
  to,
  inclusive: false,
  body,
});

/** 불변 판정 — 새 불변이 없을 때까지 판을 거듭한다. */
const judge: IRStmt[] = [
  { kind: 'comment', text: 'invariant check: repeat until no new invariant line' },
  loop('j', n(0), v('nBody'), [set(at('inv', v('j')), n(0))]),
  {
    kind: 'if',
    cond: bin('==', v('hoist'), n(1)),
    then: [
      decl('changed', n(1)),
      {
        kind: 'while',
        cond: bin('==', v('changed'), n(1)),
        body: [
          set(v('changed'), n(0)),
          loop('j', n(0), v('nBody'), [
            {
              kind: 'if',
              cond: bin('==', at('inv', v('j')), n(0)),
              then: [
                decl('ok', n(1)),
                decl('same', n(0)),
                { kind: 'comment', text: 'the line must write its name exactly once in the body' },
                loop('q', n(0), v('nBody'), [
                  {
                    kind: 'if',
                    cond: bin('==', at('bodyWrite', v('q')), at('bodyWrite', v('j'))),
                    then: [set(v('same'), bin('+', v('same'), n(1)))],
                  },
                ]),
                { kind: 'if', cond: bin('!=', v('same'), n(1)), then: [set(v('ok'), n(0))] },
                { kind: 'comment', text: 'every name it reads must not change inside the body' },
                loop('c', n(0), v('width'), [
                  decl('x', at('bodyReads', bin('+', bin('*', v('j'), v('width')), v('c')))),
                  {
                    kind: 'if',
                    cond: bin('>=', v('x'), n(0)),
                    then: [
                      loop('q', n(0), v('nBody'), [
                        {
                          kind: 'if',
                          cond: bin('==', at('bodyWrite', v('q')), v('x')),
                          then: [
                            { kind: 'if', cond: bin('==', at('inv', v('q')), n(0)), then: [set(v('ok'), n(0))] },
                          ],
                        },
                      ]),
                    ],
                  },
                ]),
                {
                  kind: 'if',
                  cond: bin('==', v('ok'), n(1)),
                  then: [set(at('inv', v('j')), n(1), 'hoist-check'), set(v('changed'), n(1))],
                },
              ],
            },
          ]),
        ],
      },
    ],
  },
];

/** 도는 바퀴 · 벌 · 나머지 · 줄마다 셈. */
const count: IRStmt[] = [
  { kind: 'comment', text: 'trip count N, full groups G and leftover copies R' },
  decl('cnt', n(0)),
  {
    kind: 'if',
    cond: bin('>', v('hi'), v('lo')),
    then: [set(v('cnt'), bin('//', bin('-', bin('+', bin('-', v('hi'), v('lo')), v('step')), n(1)), v('step')))],
  },
  decl('g', bin('//', v('cnt'), v('factor'))),
  decl('r', bin('%', v('cnt'), v('factor')), 'unroll-tail'),
  decl('last', bin('-', v('nBody'), n(1))),
  { kind: 'comment', text: 'loop overhead: condition runs g + 1 times, increment g times' },
  decl('overhead', bin('+', bin('*', bin('+', v('g'), n(1)), n(1)), bin('*', v('g'), at('bodyOps', v('last')))), 'unroll-bound'),
  decl('cost', v('overhead')),
  decl('moved', n(0)),
  loop('j', n(0), v('last'), [
    {
      kind: 'if',
      cond: bin('==', at('inv', v('j')), n(1)),
      then: [
        { kind: 'comment', text: 'hoisted line runs once' },
        set(v('cost'), bin('+', v('cost'), at('bodyOps', v('j'))), 'hoist-move'),
        set(v('moved'), bin('+', v('moved'), n(1))),
      ],
      else: [
        decl('extra', n(0)),
        { kind: 'if', cond: bin('>', v('r'), n(0)), then: [set(v('extra'), bin('-', v('r'), n(1)))] },
        { kind: 'comment', text: 'each copy k >= 1 adds one + inside every index read' },
        set(
          v('cost'),
          bin(
            '+',
            v('cost'),
            bin(
              '+',
              bin('*', at('bodyOps', v('j')), bin('+', bin('*', v('g'), v('factor')), v('r'))),
              bin(
                '*',
                at('bodyIdx', v('j')),
                bin('+', bin('*', v('g'), bin('-', v('factor'), n(1))), v('extra')),
              ),
            ),
          ),
          'unroll-copy',
        ),
      ],
    },
  ]),
  set(at('stats', n(0)), v('overhead'), 'count-ops'),
  set(
    at('stats', n(1)),
    bin(
      '+',
      bin(
        '+',
        bin(
          '+',
          bin('+', bin('+', bin('+', n(3), v('moved')), n(1)), bin('*', v('factor'), bin('-', v('last'), v('moved')))),
          n(1),
        ),
        bin('*', v('r'), bin('-', v('last'), v('moved'))),
      ),
      n(1),
    ),
    'count-ops',
  ),
  set(at('stats', n(2)), v('moved'), 'count-ops'),
  { kind: 'return', expr: v('cost'), phase: 'count-ops' },
];

export const loopOptimizationImperativeIR: IR = {
  id: 'loop-optimization-imperative',
  algorithm: 'loopOptimization',
  paradigm: 'imperative',
  functions: [
    {
      name: 'loopCost',
      params: [
        { name: 'bodyOps', type: INTS },
        { name: 'bodyIdx', type: INTS },
        { name: 'bodyWrite', type: INTS },
        { name: 'bodyReads', type: INTS },
        { name: 'nBody', type: INT },
        { name: 'width', type: INT },
        { name: 'lo', type: INT },
        { name: 'hi', type: INT },
        { name: 'step', type: INT },
        { name: 'factor', type: INT },
        { name: 'hoist', type: INT },
        { name: 'inv', type: INTS },
        { name: 'stats', type: INTS },
      ],
      returnType: INT,
      body: [...judge, ...count],
    },
  ],
};

export const loopOptimizationIRs: IR[] = [loopOptimizationImperativeIR];
