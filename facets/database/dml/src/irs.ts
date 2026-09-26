/**
 * dml 의 코드 패널 IR — 화면의 SQL 문 셋을 손잡이의 차례로 셈하는 반복.
 *
 * 화면의 SQL 과 같은 글이 아니다. 표를 버퍼 둘(water · alive)로 들고, 문 번호(0 INSERT · 1 UPDATE ·
 * 2 DELETE — 문이 처음 나온 차례)를 order 차례로 건다. 넣을 줄의 자리(끝 칸 n-1)는 부르는 쪽이
 * water 0 · alive 0 으로 비워 둔다. affected 에 문 차례대로 영향 수를 쓰고 끝 줄 수를 돌려준다.
 * algorithm 이 화면에 싣는 영향 수 · 끝 줄 수와 모든 차례에서 같다 (test 가 잠근다).
 * 중간값 최대 water 10 — 32 비트 넘침과 멀다. `add` 는 C# 예약어라 `addAmount`.
 */
import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const LIST_INT = { kind: 'list', of: INT } as const;
const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '<' | '>' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const lastSlot = bin('-', v('n'), lit(1));

/** 살아 있는 줄마다 조건에 걸리면 body 를 하고 hit 를 하나 올린다 */
function scan(phase: string, test: IRExpr, body: IRStmt[]): IRStmt {
  return {
    kind: 'for-range',
    var: 'i',
    from: lit(0),
    to: v('n'),
    inclusive: false,
    phase,
    body: [
      {
        kind: 'if',
        cond: bin('==', at('alive', v('i')), lit(1)),
        phase,
        then: [
          {
            kind: 'if',
            cond: test,
            phase,
            then: [...body, { kind: 'assign', target: v('hit'), expr: bin('+', v('hit'), lit(1)), phase }],
          },
        ],
      },
    ],
  };
}

export const dmlImperativeIR: IR = {
  id: 'dml-imperative',
  algorithm: 'dml',
  paradigm: 'imperative',
  functions: [
    {
      name: 'applyInOrder',
      params: [
        { name: 'order', type: LIST_INT },
        { name: 'water', type: LIST_INT },
        { name: 'alive', type: LIST_INT },
        { name: 'n', type: INT },
        { name: 'affected', type: LIST_INT },
        { name: 'insertWater', type: INT },
        { name: 'below', type: INT },
        { name: 'addAmount', type: INT },
        { name: 'above', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'statements: 0 INSERT, 1 UPDATE, 2 DELETE; each WHERE sees the table as it is now' },
        {
          kind: 'for-range',
          var: 's',
          from: lit(0),
          to: { kind: 'len', of: v('order') },
          inclusive: false,
          body: [
            { kind: 'var', name: 'kind', type: INT, init: at('order', v('s')) },
            { kind: 'var', name: 'hit', type: INT, init: lit(0) },
            {
              kind: 'if',
              cond: bin('==', v('kind'), lit(0)),
              phase: 'insert-row',
              then: [
                { kind: 'comment', text: 'INSERT puts the new row into the last slot' },
                { kind: 'assign', target: at('water', lastSlot), expr: v('insertWater'), phase: 'insert-row' },
                { kind: 'assign', target: at('alive', lastSlot), expr: lit(1), phase: 'insert-row' },
                { kind: 'assign', target: v('hit'), expr: lit(1), phase: 'insert-row' },
              ],
            },
            {
              kind: 'if',
              cond: bin('==', v('kind'), lit(1)),
              phase: 'update-row',
              then: [
                { kind: 'comment', text: 'UPDATE: water = water + addAmount WHERE water < below' },
                scan('update-row', bin('<', at('water', v('i')), v('below')), [
                  {
                    kind: 'assign',
                    target: at('water', v('i')),
                    expr: bin('+', at('water', v('i')), v('addAmount')),
                    phase: 'update-row',
                  },
                ]),
              ],
            },
            {
              kind: 'if',
              cond: bin('==', v('kind'), lit(2)),
              phase: 'delete-row',
              then: [
                { kind: 'comment', text: 'DELETE WHERE water > above' },
                scan('delete-row', bin('>', at('water', v('i')), v('above')), [
                  { kind: 'assign', target: at('alive', v('i')), expr: lit(0), phase: 'delete-row' },
                ]),
              ],
            },
            { kind: 'assign', target: at('affected', v('s')), expr: v('hit') },
          ],
        },
        { kind: 'comment', text: 'count the rows left in the table' },
        { kind: 'var', name: 'rows', type: INT, init: lit(0) },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: bin('==', at('alive', v('i')), lit(1)),
              then: [{ kind: 'assign', target: v('rows'), expr: bin('+', v('rows'), lit(1)) }],
            },
          ],
        },
        { kind: 'return', expr: v('rows') },
      ],
    },
  ],
};

export const dmlIRs: IR[] = [dmlImperativeIR];
