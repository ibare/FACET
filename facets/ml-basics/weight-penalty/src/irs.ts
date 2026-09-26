/**
 * weight-penalty 의 IR — `penalize(a, w, n, kind, lam, eta, steps) → int`.
 *
 * a · w 는 double 목록. w 는 부르는 쪽이 a 를 복사해 넘기는 버퍼다 (IR 은 배열을 만들 수 없다).
 * kind 0 = L1 · 1 = L2 · 그 밖은 −1 을 돌려준다 (표지 — TS `penaltyTrace` 는 던진다).
 * 돌려주는 값 = 끝에서 정확히 0 인 무게 수.
 *
 * 셈의 차례는 algorithm.ts `penaltyTrace` 와 같다 — ηλ 는 `eta * lam` 로 한 번, L2 는
 * `w - eta * (w - a) - eta * lam * w` (왼쪽부터 묶는다). 반복 · 조건 · 대입뿐, 수학 이름은 쓰지 않는다.
 *
 * phase 어휘 (algorithm.ts 와 정확히 같다): l1-update · l1-zero · l2-update · count
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const DOUBLES: IRType = { kind: 'list', of: DOUBLE };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: string): IRExpr => ({ kind: 'index', arr: v(arr), idx: v(idx) });
const bin = (op: '+' | '-' | '*' | '<' | '>' | '==' | '!=' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const neg = (x: IRExpr): IRExpr => ({ kind: 'unop', op: '-', x });

/** L1 한 무게의 두 마디 — 데이터 걸음 h, 그리고 soft-threshold (부호 없는 0). */
const l1Body: IRStmt[] = [
  { kind: 'comment', text: 'data step, then pull toward 0 by eta * lam' },
  {
    kind: 'var',
    name: 'h',
    type: DOUBLE,
    init: bin('-', at('w', 'i'), bin('*', v('eta'), bin('-', at('w', 'i'), at('a', 'i')))),
    phase: 'l1-update',
  },
  {
    kind: 'if',
    cond: bin('>', v('h'), v('el')),
    then: [{ kind: 'assign', target: at('w', 'i'), expr: bin('-', v('h'), v('el')), phase: 'l1-update' }],
    else: [
      {
        kind: 'if',
        cond: bin('<', v('h'), neg(v('el'))),
        then: [{ kind: 'assign', target: at('w', 'i'), expr: bin('+', v('h'), v('el')), phase: 'l1-update' }],
        else: [
          { kind: 'comment', text: 'inside the band: the weight sticks to 0' },
          { kind: 'assign', target: at('w', 'i'), expr: lit(0), phase: 'l1-zero' },
        ],
      },
    ],
  },
];

/** L2 한 무게 — 한 줄. L2 몫은 갱신 앞 w. */
const l2Body: IRStmt[] = [
  { kind: 'comment', text: 'data step and shrink, both from the old w' },
  {
    kind: 'assign',
    target: at('w', 'i'),
    expr: bin(
      '-',
      bin('-', at('w', 'i'), bin('*', v('eta'), bin('-', at('w', 'i'), at('a', 'i')))),
      bin('*', bin('*', v('eta'), v('lam')), at('w', 'i')),
    ),
    phase: 'l2-update',
  },
];

export const weightPenaltyImperativeIR: IR = {
  id: 'weight-penalty-imperative',
  algorithm: 'weightPenalty',
  paradigm: 'imperative',
  functions: [
    {
      name: 'penalize',
      params: [
        { name: 'a', type: DOUBLES },
        { name: 'w', type: DOUBLES },
        { name: 'n', type: INT },
        { name: 'kind', type: INT },
        { name: 'lam', type: DOUBLE },
        { name: 'eta', type: DOUBLE },
        { name: 'steps', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'kind 0 = L1, kind 1 = L2, anything else is a marker -1' },
        {
          kind: 'if',
          cond: bin('&&', bin('!=', v('kind'), lit(0)), bin('!=', v('kind'), lit(1))),
          then: [{ kind: 'return', expr: lit(-1) }],
        },
        { kind: 'var', name: 'el', type: DOUBLE, init: bin('*', v('eta'), v('lam')) },
        {
          kind: 'for-range',
          var: 's',
          from: lit(0),
          to: v('steps'),
          inclusive: false,
          body: [
            {
              kind: 'for-range',
              var: 'i',
              from: lit(0),
              to: v('n'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: bin('==', v('kind'), lit(0)),
                  then: l1Body,
                  else: [{ kind: 'if', cond: bin('==', v('kind'), lit(1)), then: l2Body }],
                },
              ],
            },
          ],
        },
        { kind: 'comment', text: 'count the weights that are exactly 0' },
        { kind: 'var', name: 'zeros', type: INT, init: lit(0), phase: 'count' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: bin('==', at('w', 'i'), lit(0)),
              then: [{ kind: 'assign', target: v('zeros'), expr: bin('+', v('zeros'), lit(1)), phase: 'count' }],
            },
          ],
        },
        { kind: 'return', expr: v('zeros'), phase: 'count' },
      ],
    },
  ],
};

export const weightPenaltyIRs: IR[] = [weightPenaltyImperativeIR];
