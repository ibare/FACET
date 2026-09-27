/**
 * clt 의 코드 패널 IR — 칸 매기기와 평균 · 폭을 편다.
 *
 * **펴지 않는 것은 뽑기다.** mulberry32 는 비트 연산(`>>>` · `^` · `Math.imul`)으로 셈하는데 IR 어휘에는
 * 비트 연산이 없다. 그래서 알고리즘이 뽑은 **합 배열**(정수 400 개)을 IR 에 넘기고, IR 은 그것을 칸에 세고
 * 평균 · 폭을 셈한다. 알고리즘(`algorithm.ts` 의 binOf · countInBin · meanOf · spreadOf)도 이 차례 그대로 셈한다.
 *
 * - 진입 `countInBin(sums, n, j)` — 칸 j 에 떨어진 평균 수
 * - `binOf(s, n)` — 칸 번호 (4s − 3n) // (2n). s < n 이나 칸 경계면 −1 표지 (TS 는 던진다)
 * - `meanOf(sums, n)` — 합들의 합 ÷ (평균 수 × n)
 * - `spreadOf(sums, n)` — 평균들의 표준편차 (분모 = 평균 수)
 *
 * phase 어휘: `bin` · `count` · `mean` · `spread` (algorithm.ts 와 같다).
 * 정수 최대는 합들의 합 72000 — 32 비트와 멀다. `//` · `%` 는 음이 아닌 정수에만 쓴다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const LIST_INT: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, idx: string): IRExpr => ({ kind: 'index', arr: v(arr), idx: v(idx) });
const len = (of: string): IRExpr => ({ kind: 'len', of: v(of) });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const minusOne: IRExpr = { kind: 'unop', op: '-', x: lit(1) };
const forEach = (body: IRStmt[]): IRStmt => ({
  kind: 'for-range',
  var: 'i',
  from: lit(0),
  to: len('sums'),
  inclusive: false,
  body,
});

export const cltImperativeIR: IR = {
  id: 'clt-imperative',
  algorithm: 'clt',
  paradigm: 'imperative',
  functions: [
    {
      name: 'countInBin',
      params: [
        { name: 'sums', type: LIST_INT },
        { name: 'n', type: INT },
        { name: 'j', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'how many of the means fall into bin j' },
        { kind: 'var', name: 'c', type: INT, init: lit(0) },
        forEach([
          {
            kind: 'if',
            cond: bin('==', call('binOf', at('sums', 'i'), v('n')), v('j')),
            then: [{ kind: 'assign', target: v('c'), expr: bin('+', v('c'), lit(1)), phase: 'count' }],
          },
        ]),
        { kind: 'return', expr: v('c') },
      ],
    },
    {
      name: 'binOf',
      params: [
        { name: 's', type: INT },
        { name: 'n', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'bin j has centre 1.0 + 0.5 * j and width 0.5' },
        { kind: 'if', cond: bin('<', v('s'), v('n')), then: [{ kind: 'return', expr: minusOne }] },
        { kind: 'var', name: 'num', type: INT, init: bin('-', bin('*', lit(4), v('s')), bin('*', lit(3), v('n'))) },
        { kind: 'comment', text: 'a mean exactly on a bin edge is marked, not guessed' },
        {
          kind: 'if',
          cond: bin('==', bin('%', v('num'), bin('*', lit(2), v('n'))), lit(0)),
          then: [{ kind: 'return', expr: minusOne }],
        },
        { kind: 'return', expr: bin('//', v('num'), bin('*', lit(2), v('n'))), phase: 'bin' },
      ],
    },
    {
      name: 'meanOf',
      params: [
        { name: 'sums', type: LIST_INT },
        { name: 'n', type: INT },
      ],
      returnType: DOUBLE,
      body: [
        { kind: 'comment', text: 'mean of the means = total of all values / (number of means * n)' },
        { kind: 'var', name: 'total', type: DOUBLE, init: lit(0) },
        forEach([{ kind: 'assign', target: v('total'), expr: bin('+', v('total'), at('sums', 'i')), phase: 'mean' }]),
        { kind: 'var', name: 'denom', type: DOUBLE, init: bin('*', len('sums'), v('n')), phase: 'mean' },
        { kind: 'return', expr: bin('/', v('total'), v('denom')), phase: 'mean' },
      ],
    },
    {
      name: 'spreadOf',
      params: [
        { name: 'sums', type: LIST_INT },
        { name: 'n', type: INT },
      ],
      returnType: DOUBLE,
      body: [
        { kind: 'comment', text: 'standard deviation of the means, divided by the number of means' },
        { kind: 'var', name: 'm', type: DOUBLE, init: call('meanOf', v('sums'), v('n')), phase: 'spread' },
        { kind: 'var', name: 'acc', type: DOUBLE, init: lit(0) },
        forEach([
          { kind: 'var', name: 'x', type: DOUBLE, init: at('sums', 'i') },
          { kind: 'assign', target: v('x'), expr: bin('/', v('x'), v('n')) },
          { kind: 'var', name: 'd', type: DOUBLE, init: bin('-', v('x'), v('m')) },
          { kind: 'assign', target: v('acc'), expr: bin('+', v('acc'), bin('*', v('d'), v('d'))), phase: 'spread' },
        ]),
        { kind: 'return', expr: call('sqrt', bin('/', v('acc'), len('sums'))), phase: 'spread' },
      ],
    },
  ],
};

export const cltIRs: IR[] = [cltImperativeIR];
