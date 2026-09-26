/**
 * 컬럼 패밀리 — 코드 패널 IR.
 *
 * 화면이 보이는 두 수(읽은 쪽 · 딸려 온 칸)를 같은 규약으로 셈한다.
 * - `pagesRead` (진입) — 묻는 칸이 하나라도 든 묶음은 그 쪽을 전부 읽는다.
 *   묶음의 쪽 수 = (줄 × 묶음의 칸 수 + 쪽의 칸 수 - 1) ÷ 쪽의 칸 수 의 몫.
 * - `cellsFetched` — 읽은 묶음들의 찬 칸 수 = 줄 × 묶음의 칸 수의 합.
 *
 * 넘기는 값: familyOf = 칸 차례의 묶음 번호, asked = 칸 차례의 0/1 (부르는 쪽이 칸 이름을 1/0 으로 바꾼다),
 * familyCount = 묶음 수, rowCount = 줄 수, cellsPerPage = 쪽 하나의 칸 수.
 * 중간값 최대 40 (칸 마흔) — 32 비트 넘침과 멀다. `//` 는 음수가 아닌 정수에만 쓴다.
 *
 * phase — `store-family` (묶음마다 칸 수를 세는 줄) · `lift-pages` (`pages += …` 줄) ·
 *         `count-cells` (`cellsFetched` 의 셈 줄). algorithm.ts 의 phase 집합과 같다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };
const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '==' | '<', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });

/** 묶음 f 의 칸 수(cols)와 묻는 칸이 들었는지(hit)를 세는 안쪽 고리 — 두 함수가 같다. 칸 수는 phase, 들었는지는 hitPhase. */
function familyScan(phase: string, hitPhase: string): IRStmt[] {
  return [
    { kind: 'var', name: 'cols', type: INT, init: n(0), phase },
    { kind: 'var', name: 'hit', type: INT, init: n(0), phase: hitPhase },
    {
      kind: 'for-range',
      var: 'c',
      from: n(0),
      to: { kind: 'len', of: v('familyOf') },
      inclusive: false,
      phase,
      body: [
        {
          kind: 'if',
          cond: bin('==', { kind: 'index', arr: v('familyOf'), idx: v('c') }, v('f')),
          phase,
          then: [
            { kind: 'assign', target: v('cols'), expr: bin('+', v('cols'), n(1)), phase },
            {
              kind: 'if',
              cond: bin('==', { kind: 'index', arr: v('asked'), idx: v('c') }, n(1)),
              phase: hitPhase,
              then: [{ kind: 'assign', target: v('hit'), expr: n(1), phase: hitPhase }],
            },
          ],
        },
      ],
    },
  ];
}

export const columnFamilyImperativeIR: IR = {
  id: 'column-family-imperative',
  algorithm: 'columnFamily',
  paradigm: 'imperative',
  functions: [
    {
      name: 'pagesRead',
      params: [
        { name: 'familyOf', type: INT_LIST },
        { name: 'asked', type: INT_LIST },
        { name: 'familyCount', type: INT },
        { name: 'rowCount', type: INT },
        { name: 'cellsPerPage', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'A family is read whole if it holds any asked column' },
        { kind: 'var', name: 'pages', type: INT, init: n(0), phase: 'lift-pages' },
        {
          kind: 'for-range',
          var: 'f',
          from: n(0),
          to: v('familyCount'),
          inclusive: false,
          phase: 'store-family',
          body: [
            ...familyScan('store-family', 'lift-pages'),
            {
              kind: 'if',
              cond: bin('==', v('hit'), n(1)),
              phase: 'lift-pages',
              then: [
                { kind: 'comment', text: 'Each family opens its own pages, eight cells per page' },
                {
                  kind: 'assign',
                  target: v('pages'),
                  expr: bin(
                    '+',
                    v('pages'),
                    bin('//', bin('-', bin('+', bin('*', v('rowCount'), v('cols')), v('cellsPerPage')), n(1)), v('cellsPerPage')),
                  ),
                  phase: 'lift-pages',
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: v('pages'), phase: 'lift-pages' },
      ],
    },
    {
      name: 'cellsFetched',
      params: [
        { name: 'familyOf', type: INT_LIST },
        { name: 'asked', type: INT_LIST },
        { name: 'familyCount', type: INT },
        { name: 'rowCount', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'Every filled cell on a read page comes along' },
        { kind: 'var', name: 'cells', type: INT, init: n(0), phase: 'count-cells' },
        {
          kind: 'for-range',
          var: 'f',
          from: n(0),
          to: v('familyCount'),
          inclusive: false,
          phase: 'count-cells',
          body: [
            ...familyScan('count-cells', 'count-cells'),
            {
              kind: 'if',
              cond: bin('==', v('hit'), n(1)),
              phase: 'count-cells',
              then: [
                {
                  kind: 'assign',
                  target: v('cells'),
                  expr: bin('+', v('cells'), bin('*', v('rowCount'), v('cols'))),
                  phase: 'count-cells',
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: v('cells'), phase: 'count-cells' },
      ],
    },
  ],
};

export const columnFamilyIRs: IR[] = [columnFamilyImperativeIR];
