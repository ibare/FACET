/**
 * join-kinds IR — 화면의 SQL 을 셈하는 중첩 루프.
 *
 * 화면은 SQL 질의, 코드 패널은 그 질의를 셈하는 반복이다. 둘은 같은 글이 아니다.
 * 부르는 쪽이 건네는 것:
 *   kind      0 INNER · 1 LEFT · 2 RIGHT · 3 FULL · 4 CROSS
 *   leftKey   player.team_id (왼쪽 표 차례) · rightKey = team.id (오른쪽 표 차례)
 *   rightHit  길이 nR 의 짝 표시 버퍼
 *   outL/outR 길이 nL × nR + nL + nR 의 결과 버퍼 — 결과 k 번째의 왼쪽 · 오른쪽 줄 번호, 짝 없는 쪽은 -1
 *   stats     stats[0] = 열쇠 견줌 수
 * 돌려주는 값은 결과 줄 수. IR 은 배열을 만들 수 없어 버퍼를 받는다.
 *
 * phase — algorithm.ts 와 같은 여섯: pair-match · left-unmatched · keep-left · right-unmatched · keep-right · cross-pair
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '==' | '||' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const inc = (name: string): IRStmt => set(v(name), bin('+', v(name), n(1)));

/** 결과 k 번째 칸에 (a, b) 를 적고 m 을 하나 올린다. 첫 대입이 phase 를 진다. */
const emitRow = (a: IRExpr, b: IRExpr, phase: string): IRStmt[] => [
  set(at('outL', v('m')), a, phase),
  set(at('outR', v('m')), b),
  inc('m'),
];

export const joinKindsImperativeIR: IR = {
  id: 'join-kinds-imperative',
  algorithm: 'joinKinds',
  paradigm: 'imperative',
  functions: [
    {
      name: 'joinRows',
      params: [
        { name: 'kind', type: INT },
        { name: 'leftKey', type: INT_LIST },
        { name: 'nL', type: INT },
        { name: 'rightKey', type: INT_LIST },
        { name: 'nR', type: INT },
        { name: 'rightHit', type: INT_LIST },
        { name: 'outL', type: INT_LIST },
        { name: 'outR', type: INT_LIST },
        { name: 'stats', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'kind: 0 INNER, 1 LEFT, 2 RIGHT, 3 FULL, 4 CROSS' },
        { kind: 'var', name: 'm', type: INT, init: n(0) },
        { kind: 'var', name: 'compares', type: INT, init: n(0) },
        {
          kind: 'for-range',
          var: 'j',
          from: n(0),
          to: v('nR'),
          inclusive: false,
          body: [set(at('rightHit', v('j')), n(0))],
        },
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: v('nL'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: bin('==', v('kind'), n(4)),
              then: [
                { kind: 'comment', text: 'CROSS: no condition, every right row joins' },
                {
                  kind: 'for-range',
                  var: 'j',
                  from: n(0),
                  to: v('nR'),
                  inclusive: false,
                  body: emitRow(v('i'), v('j'), 'cross-pair'),
                },
              ],
              else: [
                { kind: 'var', name: 'hit', type: INT, init: n(0) },
                {
                  kind: 'for-range',
                  var: 'j',
                  from: n(0),
                  to: v('nR'),
                  inclusive: false,
                  body: [
                    inc('compares'),
                    {
                      kind: 'if',
                      cond: bin('==', at('leftKey', v('i')), at('rightKey', v('j'))),
                      then: [
                        ...emitRow(v('i'), v('j'), 'pair-match'),
                        set(v('hit'), n(1)),
                        set(at('rightHit', v('j')), n(1)),
                      ],
                    },
                  ],
                },
                {
                  kind: 'if',
                  cond: bin('==', v('hit'), n(0)),
                  phase: 'left-unmatched',
                  then: [
                    { kind: 'comment', text: 'LEFT and FULL keep it with NULL on the right' },
                    {
                      kind: 'if',
                      cond: bin('||', bin('==', v('kind'), n(1)), bin('==', v('kind'), n(3))),
                      then: emitRow(v('i'), n(-1), 'keep-left'),
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          kind: 'if',
          cond: bin('!=', v('kind'), n(4)),
          then: [
            {
              kind: 'for-range',
              var: 'j',
              from: n(0),
              to: v('nR'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: bin('==', at('rightHit', v('j')), n(0)),
                  phase: 'right-unmatched',
                  then: [
                    { kind: 'comment', text: 'RIGHT and FULL keep it with NULL on the left, at the end' },
                    {
                      kind: 'if',
                      cond: bin('||', bin('==', v('kind'), n(2)), bin('==', v('kind'), n(3))),
                      then: emitRow(n(-1), v('j'), 'keep-right'),
                    },
                  ],
                },
              ],
            },
          ],
        },
        set(at('stats', n(0)), v('compares')),
        { kind: 'return', expr: v('m') },
      ],
    },
  ],
};

export const joinKindsIRs: IR[] = [joinKindsImperativeIR];
