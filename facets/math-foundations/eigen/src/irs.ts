/**
 * eigen IR — 1° 안에 처음 든 곱의 번호를 셈한다 (stepsToAlign).
 *
 * 알고리즘(`algorithm.ts` 의 computeBoard)과 식 · 차례가 같다 — 배정도 끝자리까지 같아야
 * 문턱 판정이 갈리지 않는다. 각(°)의 셈(틈 · atan2)은 IR 밖, 알고리즘에서만 한다 (IR 에 삼각 함수가 없다).
 * 문턱 tol 은 알고리즘이 sin 1° 로 셈해 인자로 넘긴다.
 *
 * 알고리즘이 한 판을 끝까지 곱하므로 IR 도 일찍 돌아오지 않는다 — 1° 안에 든 뒤에도 곱을 이어 가며
 * first 만 한 번 적는다.
 *
 * phase: start · aligned · iterate · done (algorithm.ts 와 같다)
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '/' | '<' | '==' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const at = (i: number): IRExpr => ({ kind: 'index', arr: v('a'), idx: lit(i) });
const dbl = (name: string, init: IRExpr, phase: string): IRStmt => ({
  kind: 'var',
  name,
  type: DOUBLE,
  init,
  phase,
});
const set = (name: string, expr: IRExpr, phase: string): IRStmt => ({
  kind: 'assign',
  target: v(name),
  expr,
  phase,
});

const body: IRStmt[] = [
  { kind: 'comment', text: 'unit vector along the big eigen direction' },
  dbl('n', call('sqrt', bin('+', bin('*', v('dx'), v('dx')), bin('*', v('dy'), v('dy')))), 'start'),
  dbl('ex', bin('/', v('dx'), v('n')), 'start'),
  dbl('ey', bin('/', v('dy'), v('n')), 'start'),
  { kind: 'comment', text: 'start direction scaled to length 1' },
  dbl('sn', call('sqrt', bin('+', bin('*', v('sx'), v('sx')), bin('*', v('sy'), v('sy')))), 'start'),
  dbl('vx', bin('/', v('sx'), v('sn')), 'start'),
  dbl('vy', bin('/', v('sy'), v('sn')), 'start'),
  { kind: 'var', name: 'first', type: INT, init: { kind: 'unop', op: '-', x: lit(1) }, phase: 'start' },
  {
    kind: 'for-range',
    var: 'k',
    from: lit(0),
    to: v('maxSteps'),
    inclusive: true,
    phase: 'iterate',
    body: [
      { kind: 'comment', text: 'sin of the gap to the big eigen line (|v| = 1)' },
      dbl('cross', bin('-', bin('*', v('ex'), v('vy')), bin('*', v('ey'), v('vx'))), 'iterate'),
      {
        kind: 'if',
        cond: bin(
          '&&',
          bin('==', v('first'), { kind: 'unop', op: '-', x: lit(1) }),
          bin('<', call('abs', v('cross')), v('tol')),
        ),
        then: [set('first', v('k'), 'aligned')],
        phase: 'aligned',
      },
      {
        kind: 'if',
        cond: bin('<', v('k'), v('maxSteps')),
        phase: 'iterate',
        then: [
          { kind: 'comment', text: 'multiply by A, then scale back to length 1' },
          dbl('wx', bin('+', bin('*', at(0), v('vx')), bin('*', at(1), v('vy'))), 'iterate'),
          dbl('wy', bin('+', bin('*', at(2), v('vx')), bin('*', at(3), v('vy'))), 'iterate'),
          dbl('norm', call('sqrt', bin('+', bin('*', v('wx'), v('wx')), bin('*', v('wy'), v('wy')))), 'iterate'),
          set('vx', bin('/', v('wx'), v('norm')), 'iterate'),
          set('vy', bin('/', v('wy'), v('norm')), 'iterate'),
        ],
      },
    ],
  },
  { kind: 'return', expr: v('first'), phase: 'done' },
];

export const eigenImperativeIR: IR = {
  id: 'eigen-imperative',
  algorithm: 'eigen',
  paradigm: 'imperative',
  functions: [
    {
      name: 'stepsToAlign',
      params: [
        { name: 'a', type: INT_LIST },
        { name: 'sx', type: INT },
        { name: 'sy', type: INT },
        { name: 'dx', type: INT },
        { name: 'dy', type: INT },
        { name: 'maxSteps', type: INT },
        { name: 'tol', type: DOUBLE },
      ],
      returnType: INT,
      body,
    },
  ],
};

export const eigenIRs: IR[] = [eigenImperativeIR];
