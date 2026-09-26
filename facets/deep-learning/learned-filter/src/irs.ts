/**
 * learned-filter 의 IR — 함수 둘, 첫 함수가 진입점.
 *
 *   trainEpoch(xs, ys, count, w, bias, ps, lr): void — 한 판. 알고리즘의 `trainEpoch` 와 더하는 차례까지 같다
 *   strongest(w, bias, tmpls, count): int            — 깨끗한 무늬마다 응답을 셈해 가장 큰 번호
 *
 * xs(144) · ys(16) · ps(16) · w(9) · bias(1) · tmpls(36) 는 부르는 쪽이 만든다 (IR 은 배열을 만들 수 없다).
 * 생성기는 IR 에 두지 않는다 — 곱 48271·x 가 32 비트를 넘는다. IR 은 뽑힌 자료 xs 를 받는다.
 * 닮음 · 부호 맞는 칸은 재는 계기라 IR 밖이다 (알고리즘만 셈한다).
 *
 * phase 어휘 (algorithm.ts 와 정확히 같다):
 *   update    — w[i] 고침 줄과 bias 고침 줄
 *   strongest — strongest 의 비교 if
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const VOID: IRType = { kind: 'void' };
const listOf = (of: IRType): IRType => ({ kind: 'list', of });

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | boolean): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '/' | '>' | '==' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
/** xs[d * 9 + i] 꼴의 평평한 색인 */
const flat = (row: string, col: string): IRExpr => bin('+', bin('*', v(row), lit(9)), v(col));
const forRange = (name: string, to: IRExpr, body: IRStmt[]): IRStmt => ({
  kind: 'for-range',
  var: name,
  from: lit(0),
  to,
  inclusive: false,
  body,
});

const trainEpoch: IRStmt[] = [
  { kind: 'comment', text: 'forward: probability for every piece, using the weights before this epoch' },
  forRange('d', v('count'), [
    { kind: 'var', name: 'z', type: DOUBLE, init: lit(0) },
    forRange('i', lit(9), [
      { kind: 'assign', target: v('z'), expr: bin('+', v('z'), bin('*', at('w', v('i')), at('xs', flat('d', 'i')))) },
    ]),
    { kind: 'assign', target: v('z'), expr: bin('+', v('z'), at('bias', lit(0))) },
    {
      kind: 'assign',
      target: at('ps', v('d')),
      expr: bin('/', lit(1), bin('+', lit(1), { kind: 'call', fn: 'exp', args: [{ kind: 'unop', op: '-', x: v('z') }] })),
    },
  ]),
  { kind: 'comment', text: 'update: average gradient over all pieces, then one step' },
  forRange('i', lit(9), [
    { kind: 'var', name: 'g', type: DOUBLE, init: lit(0) },
    forRange('d', v('count'), [
      {
        kind: 'assign',
        target: v('g'),
        expr: bin('+', v('g'), bin('*', bin('-', at('ps', v('d')), at('ys', v('d'))), at('xs', flat('d', 'i')))),
      },
    ]),
    {
      kind: 'assign',
      target: at('w', v('i')),
      expr: bin('-', at('w', v('i')), bin('/', bin('*', v('lr'), v('g')), v('count'))),
      phase: 'update',
    },
  ]),
  { kind: 'var', name: 'gb', type: DOUBLE, init: lit(0) },
  forRange('d', v('count'), [
    { kind: 'assign', target: v('gb'), expr: bin('+', v('gb'), bin('-', at('ps', v('d')), at('ys', v('d')))) },
  ]),
  {
    kind: 'assign',
    target: at('bias', lit(0)),
    expr: bin('-', at('bias', lit(0)), bin('/', bin('*', v('lr'), v('gb')), v('count'))),
    phase: 'update',
  },
];

const strongest: IRStmt[] = [
  { kind: 'var', name: 'best', type: INT, init: lit(0) },
  { kind: 'var', name: 'bestZ', type: DOUBLE, init: lit(0) },
  forRange('j', v('count'), [
    { kind: 'var', name: 'z', type: DOUBLE, init: lit(0) },
    forRange('i', lit(9), [
      { kind: 'assign', target: v('z'), expr: bin('+', v('z'), bin('*', at('w', v('i')), at('tmpls', flat('j', 'i')))) },
    ]),
    { kind: 'assign', target: v('z'), expr: bin('+', v('z'), at('bias', lit(0))) },
    {
      kind: 'if',
      cond: bin('||', bin('==', v('j'), lit(0)), bin('>', v('z'), v('bestZ'))),
      then: [
        { kind: 'assign', target: v('best'), expr: v('j') },
        { kind: 'assign', target: v('bestZ'), expr: v('z') },
      ],
      phase: 'strongest',
    },
  ]),
  { kind: 'return', expr: v('best') },
];

export const learnedFilterImperativeIR: IR = {
  id: 'learned-filter-imperative',
  algorithm: 'learnedFilter',
  paradigm: 'imperative',
  functions: [
    {
      name: 'trainEpoch',
      params: [
        { name: 'xs', type: listOf(DOUBLE) },
        { name: 'ys', type: listOf(DOUBLE) },
        { name: 'count', type: INT },
        { name: 'w', type: listOf(DOUBLE) },
        { name: 'bias', type: listOf(DOUBLE) },
        { name: 'ps', type: listOf(DOUBLE) },
        { name: 'lr', type: DOUBLE },
      ],
      returnType: VOID,
      body: trainEpoch,
    },
    {
      name: 'strongest',
      params: [
        { name: 'w', type: listOf(DOUBLE) },
        { name: 'bias', type: listOf(DOUBLE) },
        { name: 'tmpls', type: listOf(INT) },
        { name: 'count', type: INT },
      ],
      returnType: INT,
      body: strongest,
    },
  ],
};

export const learnedFilterIRs: IR[] = [learnedFilterImperativeIR];
