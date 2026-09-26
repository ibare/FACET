/**
 * normal-forms 의 IR — 화면의 두 수(고칠 줄 · 잃은 종속)를 **표를 짓지 않고** 센다.
 *
 * 떼어 내기(표 짓기)는 IR 밖이다 — IR 함수는 배열을 만들 수 없다. 그래서 부르는 쪽이 건넨다:
 *   rowsToFix(rows, nRow, nCol, keyCol, keyVal, mask)
 *     rows  = 1NF 줄을 열마다 값 번호(처음 나온 차례, 0..)로 바꿔 평평하게 (nRow × nCol)
 *     mask  = 사실을 담은 표의 목록 아닌 열이면 1
 *     줄 i 가 keyCol = keyVal 이면, 앞선 그런 줄 j 가운데 mask 열이 모두 같은 것이 없을 때만 센다
 *     (= 떼어 낸 표에서 사실이 적힌 줄 수. UNF 는 무리 수)
 *   lostDependencies(tabs, nTab, lhs, rhs, nFd, nCol)
 *     tabs = 표마다 열 소속 0/1 (nTab × nCol), lhs · rhs = 종속마다 왼쪽 · 오른쪽 열 0/1 (nFd × nCol)
 *     어느 한 표에도 왼쪽 · 오른쪽 열이 다 들지 않는 종속 수
 *
 * 찾은 줄(칸 글자 전체 견주기)은 IR 밖이다 — 글자 비교가 없어서. 화면의 걸음 2 는 코드 줄을 켜지 않는다.
 * `||` 는 두 색인이 모두 범위 안이라 짧은 회로가 아니어도 안전하다. 중간값 최대 = 색인 (nRow-1)·nCol + nCol-1 = 55.
 *
 * phase: fix-count (센다) · fd-check (다 드는 표가 있다) · fd-lost (잃은 종속을 센다) — algorithm 과 같다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const BOOL: IRType = { kind: 'bool' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const b = (value: boolean): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '*' | '==' | '!=' | '||', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
/** arr[row * nCol + col] */
const cellAt = (arr: string, row: string, col: IRExpr): IRExpr => ({
  kind: 'index',
  arr: v(arr),
  idx: bin('+', bin('*', v(row), v('nCol')), col),
});
const set = (name: string, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target: v(name), expr, phase } : { kind: 'assign', target: v(name), expr };

const rowsToFix: IRStmt[] = [
  { kind: 'var', name: 'count', type: INT, init: n(0) },
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: v('nRow'),
    inclusive: false,
    body: [
      {
        kind: 'if',
        cond: bin('==', cellAt('rows', 'i', v('keyCol')), v('keyVal')),
        then: [
          { kind: 'comment', text: 'row i states the fact; skip it if an earlier such row projects to the same row' },
          { kind: 'var', name: 'seen', type: BOOL, init: b(false) },
          {
            kind: 'for-range',
            var: 'j',
            from: n(0),
            to: v('i'),
            inclusive: false,
            body: [
              {
                kind: 'if',
                cond: bin('==', cellAt('rows', 'j', v('keyCol')), v('keyVal')),
                then: [
                  { kind: 'var', name: 'same', type: BOOL, init: b(true) },
                  {
                    kind: 'for-range',
                    var: 'c',
                    from: n(0),
                    to: v('nCol'),
                    inclusive: false,
                    body: [
                      {
                        kind: 'if',
                        cond: bin('==', { kind: 'index', arr: v('mask'), idx: v('c') }, n(1)),
                        then: [
                          {
                            kind: 'if',
                            cond: bin('!=', cellAt('rows', 'j', v('c')), cellAt('rows', 'i', v('c'))),
                            then: [set('same', b(false))],
                          },
                        ],
                      },
                    ],
                  },
                  { kind: 'if', cond: v('same'), then: [set('seen', b(true))] },
                ],
              },
            ],
          },
          {
            kind: 'if',
            cond: { kind: 'unop', op: '!', x: v('seen') },
            then: [set('count', bin('+', v('count'), n(1)), 'fix-count')],
          },
        ],
      },
    ],
  },
  { kind: 'return', expr: v('count') },
];

const lostDependencies: IRStmt[] = [
  { kind: 'var', name: 'lost', type: INT, init: n(0) },
  {
    kind: 'for-range',
    var: 'f',
    from: n(0),
    to: v('nFd'),
    inclusive: false,
    body: [
      { kind: 'var', name: 'home', type: BOOL, init: b(false) },
      {
        kind: 'for-range',
        var: 'tab',
        from: n(0),
        to: v('nTab'),
        inclusive: false,
        body: [
          { kind: 'var', name: 'fits', type: BOOL, init: b(true) },
          {
            kind: 'for-range',
            var: 'c',
            from: n(0),
            to: v('nCol'),
            inclusive: false,
            body: [
              {
                kind: 'if',
                cond: bin('||', bin('==', cellAt('lhs', 'f', v('c')), n(1)), bin('==', cellAt('rhs', 'f', v('c')), n(1))),
                then: [
                  {
                    kind: 'if',
                    cond: bin('==', cellAt('tabs', 'tab', v('c')), n(0)),
                    then: [set('fits', b(false))],
                  },
                ],
              },
            ],
          },
          { kind: 'comment', text: 'this table holds every column of the dependency' },
          { kind: 'if', cond: v('fits'), then: [set('home', b(true), 'fd-check')] },
        ],
      },
      {
        kind: 'if',
        cond: { kind: 'unop', op: '!', x: v('home') },
        then: [set('lost', bin('+', v('lost'), n(1)), 'fd-lost')],
      },
    ],
  },
  { kind: 'return', expr: v('lost') },
];

export const normalFormsImperativeIR: IR = {
  id: 'normal-forms-imperative',
  algorithm: 'normalForms',
  paradigm: 'imperative',
  functions: [
    {
      name: 'rowsToFix',
      params: [
        { name: 'rows', type: INT_LIST },
        { name: 'nRow', type: INT },
        { name: 'nCol', type: INT },
        { name: 'keyCol', type: INT },
        { name: 'keyVal', type: INT },
        { name: 'mask', type: INT_LIST },
      ],
      returnType: INT,
      body: rowsToFix,
    },
    {
      name: 'lostDependencies',
      params: [
        { name: 'tabs', type: INT_LIST },
        { name: 'nTab', type: INT },
        { name: 'lhs', type: INT_LIST },
        { name: 'rhs', type: INT_LIST },
        { name: 'nFd', type: INT },
        { name: 'nCol', type: INT },
      ],
      returnType: INT,
      body: lostDependencies,
    },
  ],
};

export const normalFormsIRs: IR[] = [normalFormsImperativeIR];
