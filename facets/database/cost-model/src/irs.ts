/**
 * cost-model 의 IR — 코드 패널이 보이는 셈. 화면과 같은 답(고른 길의 실제 페이지)을 낸다.
 *
 * 진입 chosenPathPages(decades, bins, binCount, span, lo, hi, tablePages, descend) → int
 *   부르는 쪽이 넘기는 값: decades = 참 분포 열, bins = 길이 10 버퍼(IR 은 배열을 만들 수 없다),
 *   span 100, tablePages 50, descend 3.
 * 문 차례를 걸음과 맞춘다: 통 짓기(build-bins) → 추정(cut-bins) → 고르기(pick-path) → 실제 줄(actual-rows) → 비용(actual-cost).
 * estimateRows 는 통의 줄 × 겹친 폭을 double 지역 변수에 먼저 담고 통 폭으로 나눈다 — 정수 ÷ 정수로 실수를 얻지 않는다.
 * countRows 의 두 경계 조건은 `&&` 로 잇지 않고 if 를 겹친다.
 * 버퍼 매개변수 이름은 사양의 `out` 이 C# 예약어라 `binsOut` 으로 둔다.
 * 중간값 최대 8000 (통의 줄 × 겹친 폭) — 32 비트 안.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const BOOL: IRType = { kind: 'bool' };
const VOID: IRType = { kind: 'void' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '/' | '//' | '<' | '>=' | '<=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

const buildBinsBody: IRStmt[] = [
  { kind: 'comment', text: 'group the true decades into binCount equal-width bins' },
  { kind: 'var', name: 'per', type: INT, init: bin('//', { kind: 'len', of: v('decades') }, v('binCount')) },
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: v('binCount'),
    inclusive: false,
    body: [
      { kind: 'assign', target: at('binsOut', v('i')), expr: n(0) },
      {
        kind: 'for-range',
        var: 'd',
        from: n(0),
        to: v('per'),
        inclusive: false,
        body: [
          {
            kind: 'assign',
            target: at('binsOut', v('i')),
            expr: bin('+', at('binsOut', v('i')), at('decades', bin('+', bin('*', v('i'), v('per')), v('d')))),
          },
        ],
      },
    ],
  },
];

const estimateRowsBody: IRStmt[] = [
  { kind: 'comment', text: 'rows inside a bin are assumed to be spread evenly' },
  { kind: 'var', name: 'width', type: INT, init: bin('//', v('span'), v('binCount')) },
  { kind: 'var', name: 'est', type: DOUBLE, init: n(0) },
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: v('binCount'),
    inclusive: false,
    body: [
      { kind: 'var', name: 'a', type: INT, init: bin('*', v('i'), v('width')) },
      { kind: 'var', name: 'b', type: INT, init: bin('+', v('a'), v('width')) },
      {
        kind: 'var',
        name: 'overlap',
        type: INT,
        init: call('max', n(0), bin('-', call('min', v('b'), v('hi')), call('max', v('a'), v('lo')))),
      },
      { kind: 'comment', text: 'bin rows times overlap, held as a double before dividing' },
      { kind: 'var', name: 'share', type: DOUBLE, init: bin('*', at('bins', v('i')), v('overlap')) },
      { kind: 'assign', target: v('est'), expr: bin('+', v('est'), bin('/', v('share'), v('width'))) },
    ],
  },
  { kind: 'return', expr: v('est') },
];

const countRowsBody: IRStmt[] = [
  { kind: 'comment', text: 'true rows: decades fully inside [lo, hi)' },
  { kind: 'var', name: 'total', type: INT, init: n(0) },
  {
    kind: 'for-range',
    var: 'd',
    from: n(0),
    to: { kind: 'len', of: v('decades') },
    inclusive: false,
    body: [
      {
        kind: 'if',
        cond: bin('>=', bin('*', v('d'), n(10)), v('lo')),
        then: [
          {
            kind: 'if',
            cond: bin('<=', bin('*', bin('+', v('d'), n(1)), n(10)), v('hi')),
            then: [{ kind: 'assign', target: v('total'), expr: bin('+', v('total'), at('decades', v('d'))) }],
          },
        ],
      },
    ],
  },
  { kind: 'return', expr: v('total') },
];

const chosenPathPagesBody: IRStmt[] = [
  { kind: 'expr-stmt', expr: call('buildBins', v('decades'), v('binCount'), v('bins')), phase: 'build-bins' },
  {
    kind: 'var',
    name: 'est',
    type: DOUBLE,
    init: call('estimateRows', v('bins'), v('binCount'), v('span'), v('lo'), v('hi')),
    phase: 'cut-bins',
  },
  { kind: 'comment', text: 'pick by the estimate: Index Scan costs descend + one table page per row' },
  {
    kind: 'var',
    name: 'useIndex',
    type: BOOL,
    init: bin('<', bin('+', v('descend'), v('est')), v('tablePages')),
    phase: 'pick-path',
  },
  { kind: 'var', name: 'actual', type: INT, init: call('countRows', v('decades'), v('lo'), v('hi')), phase: 'actual-rows' },
  { kind: 'comment', text: 'pay with the actual rows on the path already chosen' },
  {
    kind: 'if',
    cond: v('useIndex'),
    then: [{ kind: 'return', expr: bin('+', v('descend'), v('actual')), phase: 'actual-cost' }],
    phase: 'actual-cost',
  },
  { kind: 'return', expr: v('tablePages'), phase: 'actual-cost' },
];

export const costModelImperativeIR: IR = {
  id: 'cost-model-imperative',
  algorithm: 'costModel',
  paradigm: 'imperative',
  functions: [
    {
      name: 'chosenPathPages',
      params: [
        { name: 'decades', type: INTS },
        { name: 'bins', type: INTS },
        { name: 'binCount', type: INT },
        { name: 'span', type: INT },
        { name: 'lo', type: INT },
        { name: 'hi', type: INT },
        { name: 'tablePages', type: INT },
        { name: 'descend', type: INT },
      ],
      returnType: INT,
      body: chosenPathPagesBody,
    },
    {
      name: 'buildBins',
      params: [
        { name: 'decades', type: INTS },
        { name: 'binCount', type: INT },
        { name: 'binsOut', type: INTS },
      ],
      returnType: VOID,
      body: buildBinsBody,
    },
    {
      name: 'estimateRows',
      params: [
        { name: 'bins', type: INTS },
        { name: 'binCount', type: INT },
        { name: 'span', type: INT },
        { name: 'lo', type: INT },
        { name: 'hi', type: INT },
      ],
      returnType: DOUBLE,
      body: estimateRowsBody,
    },
    {
      name: 'countRows',
      params: [
        { name: 'decades', type: INTS },
        { name: 'lo', type: INT },
        { name: 'hi', type: INT },
      ],
      returnType: INT,
      body: countRowsBody,
    },
  ],
};

export const costModelIRs: IR[] = [costModelImperativeIR];
