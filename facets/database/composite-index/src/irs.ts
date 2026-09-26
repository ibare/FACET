/**
 * 복합 인덱스 — 코드 패널의 IR.
 *
 * 화면과 같은 답(훑은 항목 수)을 낸다. IR 에는 문자열 견줌이 없어 부르는 쪽이 문자열 열을
 * **바이트 사전순 번호**로 바꿔 넘긴다 (genre: action 0 · comedy 1 · drama 2 · horror 3). 정수 열은 그대로.
 *
 *   scanComposite(first, second, rows, qFirst, qSecond, useFirst, useSecond) → int   (훑은 항목, 진입)
 *   sortEntries(first, second, rows) → void    (삽입 정렬 — 넘겨받은 세 배열을 제자리에서 swap)
 *   prefixMatches(first, second, i, qFirst, qSecond, useSecond) → bool
 *   less(first, second, i, j) → bool
 *
 * first · second = 표 차례(r1 부터)의 앞 열 · 뒤 열 값 (열 차례에 따라 부르는 쪽이 고른다), rows = 줄 번호 1..n.
 * useFirst = 앞 열이 조건에 있는가 (1/0), useSecond = 앞 열이 있고 뒤 열도 조건에 있는가 (1/0).
 * 동률이면 삽입 정렬이 자리를 바꾸지 않으므로 먼저 넣은 줄이 앞에 남는다 — 알고리즘의 동률 규칙과 같다.
 *
 * 접두에 맞는 항목이 없으면 0 을 돌려준다 — 알고리즘은 이 경우 던진다 (IR 에는 throw 가 없다). 이 자료에서는 일어나지 않는다.
 *
 * `ir-interpreter` 의 `&&` 는 짧은 회로가 아니라 `while j > 0 && less(j, j - 1)` 로 잇지 않는다 (j = 0 에서 색인 −1 을 읽는다).
 * 훑기의 `i < n && …` 도 같은 까닭으로 `while` 안의 `if` 로 가른다.
 *
 * phase 어휘 (algorithm.ts 와 같다): sort-entries · seek-first · scan-prefix · scan-all
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const BOOL: IRType = { kind: 'bool' };
const VOID: IRType = { kind: 'void' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const b = (value: boolean): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '-' | '<' | '==' | '!=' | '&&' | '||' | '>', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op: o,
  l,
  r,
});
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

const swapBoth = (arr: string, phase: string): IRStmt => ({
  kind: 'swap',
  a: at(arr, v('j')),
  b: at(arr, op('-', v('j'), n(1))),
  phase,
});

export const compositeIndexImperativeIR: IR = {
  id: 'composite-index-imperative',
  algorithm: 'compositeIndex',
  paradigm: 'imperative',
  functions: [
    {
      name: 'scanComposite',
      params: [
        { name: 'first', type: INTS },
        { name: 'second', type: INTS },
        { name: 'rows', type: INTS },
        { name: 'qFirst', type: INT },
        { name: 'qSecond', type: INT },
        { name: 'useFirst', type: INT },
        { name: 'useSecond', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'line the entries up in column order' },
        {
          kind: 'expr-stmt',
          expr: call('sortEntries', v('first'), v('second'), v('rows')),
          phase: 'sort-entries',
        },
        { kind: 'var', name: 'n', type: INT, init: { kind: 'len', of: v('first') } },
        { kind: 'comment', text: 'leading column not in the query: read every entry' },
        {
          kind: 'if',
          cond: op('==', v('useFirst'), n(0)),
          then: [{ kind: 'return', expr: v('n'), phase: 'scan-all' }],
          phase: 'scan-all',
        },
        { kind: 'comment', text: 'seek the first entry matching the prefix (seeking is not counted)' },
        { kind: 'var', name: 'i', type: INT, init: n(0), phase: 'seek-first' },
        {
          kind: 'while',
          cond: op('<', v('i'), v('n')),
          body: [
            {
              kind: 'if',
              cond: call('prefixMatches', v('first'), v('second'), v('i'), v('qFirst'), v('qSecond'), v('useSecond')),
              then: [{ kind: 'break', phase: 'seek-first' }],
              phase: 'seek-first',
            },
            { kind: 'assign', target: v('i'), expr: op('+', v('i'), n(1)), phase: 'seek-first' },
          ],
          phase: 'seek-first',
        },
        { kind: 'comment', text: 'scan until the first entry that breaks the prefix, counting it too' },
        { kind: 'var', name: 'scanned', type: INT, init: n(0), phase: 'scan-prefix' },
        {
          kind: 'while',
          cond: op('<', v('i'), v('n')),
          body: [
            { kind: 'assign', target: v('scanned'), expr: op('+', v('scanned'), n(1)), phase: 'scan-prefix' },
            {
              kind: 'if',
              cond: {
                kind: 'unop',
                op: '!',
                x: call('prefixMatches', v('first'), v('second'), v('i'), v('qFirst'), v('qSecond'), v('useSecond')),
              },
              then: [{ kind: 'break', phase: 'scan-prefix' }],
              phase: 'scan-prefix',
            },
            { kind: 'assign', target: v('i'), expr: op('+', v('i'), n(1)), phase: 'scan-prefix' },
          ],
          phase: 'scan-prefix',
        },
        { kind: 'return', expr: v('scanned'), phase: 'scan-prefix' },
      ],
    },
    {
      name: 'sortEntries',
      params: [
        { name: 'first', type: INTS },
        { name: 'second', type: INTS },
        { name: 'rows', type: INTS },
      ],
      returnType: VOID,
      body: [
        { kind: 'comment', text: 'insertion sort; equal keys keep insertion order' },
        {
          kind: 'for-range',
          var: 'i',
          from: n(1),
          to: { kind: 'len', of: v('first') },
          inclusive: false,
          body: [
            { kind: 'var', name: 'j', type: INT, init: v('i'), phase: 'sort-entries' },
            {
              kind: 'while',
              cond: op('>', v('j'), n(0)),
              body: [
                {
                  kind: 'if',
                  cond: call('less', v('first'), v('second'), v('j'), op('-', v('j'), n(1))),
                  then: [
                    swapBoth('first', 'sort-entries'),
                    swapBoth('second', 'sort-entries'),
                    swapBoth('rows', 'sort-entries'),
                    { kind: 'assign', target: v('j'), expr: op('-', v('j'), n(1)), phase: 'sort-entries' },
                  ],
                  else: [{ kind: 'break', phase: 'sort-entries' }],
                  phase: 'sort-entries',
                },
              ],
              phase: 'sort-entries',
            },
          ],
          phase: 'sort-entries',
        },
      ],
    },
    {
      name: 'prefixMatches',
      params: [
        { name: 'first', type: INTS },
        { name: 'second', type: INTS },
        { name: 'i', type: INT },
        { name: 'qFirst', type: INT },
        { name: 'qSecond', type: INT },
        { name: 'useSecond', type: INT },
      ],
      returnType: BOOL,
      body: [
        {
          kind: 'if',
          cond: op('!=', at('first', v('i')), v('qFirst')),
          then: [{ kind: 'return', expr: b(false) }],
        },
        {
          kind: 'if',
          cond: op('==', v('useSecond'), n(1)),
          then: [{ kind: 'return', expr: op('==', at('second', v('i')), v('qSecond')) }],
        },
        { kind: 'return', expr: b(true) },
      ],
    },
    {
      name: 'less',
      params: [
        { name: 'first', type: INTS },
        { name: 'second', type: INTS },
        { name: 'i', type: INT },
        { name: 'j', type: INT },
      ],
      returnType: BOOL,
      body: [
        { kind: 'comment', text: 'both indexes are in range, so a non-short-circuit && is safe here' },
        {
          kind: 'return',
          expr: op(
            '||',
            op('<', at('first', v('i')), at('first', v('j'))),
            op(
              '&&',
              op('==', at('first', v('i')), at('first', v('j'))),
              op('<', at('second', v('i')), at('second', v('j'))),
            ),
          ),
        },
      ],
    },
  ],
};

export const compositeIndexIRs: IR[] = [compositeIndexImperativeIR];
