/**
 * index-choice 의 IR — 코드 패널이 보이는 셈.
 *
 * IR 은 트리 페이지를 걷지 않는다. 부르는 쪽이 잎 열쇠를 잎 차례로 편 배열 `keys` 와 그 열쇠의 잎 번호
 * `leafOf` 를 건네고, IR 은 그 편 배열로 같은 셈을 한다 — "내려가기가 닿는 잎 = lo 이하 마지막 열쇠의 잎".
 * 가름 열쇠가 오른쪽 가지 맨 왼쪽 잎의 첫 열쇠라서 알고리즘이 페이지를 실제로 걷는 셈과 같은 답을 낸다
 * (test 가 모든 손잡이 조합에서 잠근다).
 *
 * 함수 넷 — 첫 함수가 진입점:
 *   cheapestPages(keys, leafOf, innerPages, bucketCount, tablePages, lo, hi, hasBtree, hasHash) → 고른 길의 읽은 페이지
 *   btreePages(keys, leafOf, innerPages, lo, hi) → 안쪽 + 읽은 잎 + 맞은 줄
 *   hashPages(keys, bucketCount, lo, hi)         → 연 버킷 + 맞은 줄
 *   insertWrites(hasBtree, hasHash)             → 표 1 + 걸린 인덱스마다 1
 *
 * phase 어휘 (algorithm.ts 와 정확히 같다): cost-seq · cost-btree · cost-hash · pick-cheapest · insert-write
 * `&&` 는 짧은 회로가 아니므로 두 조건 읽기를 `if` 로 겹친다. 중간값 최대 13 — 32 비트와 멀다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '<' | '<=' | '>' | '>=' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const set = (name: string, expr: IRExpr, phase: string): IRStmt => ({ kind: 'assign', target: v(name), expr, phase });
const decl = (name: string, init: IRExpr, phase: string): IRStmt => ({ kind: 'var', name, type: INT, init, phase });

const btreeBody: IRStmt[] = [
  { kind: 'comment', text: 'the descent lands on the leaf of the last key <= lo' },
  decl('n', { kind: 'len', of: v('keys') }, 'cost-btree'),
  decl('start', n(0), 'cost-btree'),
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: v('n'),
    inclusive: false,
    phase: 'cost-btree',
    body: [
      {
        kind: 'if',
        cond: bin('<=', at('keys', v('i')), v('lo')),
        then: [set('start', at('leafOf', v('i')), 'cost-btree')],
        phase: 'cost-btree',
      },
    ],
  },
  { kind: 'comment', text: 'walk the leaf chain; stop at the first leaf holding a key > hi' },
  decl('stop', at('leafOf', bin('-', v('n'), n(1))), 'cost-btree'),
  decl('found', n(0), 'cost-btree'),
  decl('matched', n(0), 'cost-btree'),
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: v('n'),
    inclusive: false,
    phase: 'cost-btree',
    body: [
      {
        kind: 'if',
        cond: bin('>=', at('keys', v('i')), v('lo')),
        phase: 'cost-btree',
        then: [
          {
            kind: 'if',
            cond: bin('<=', at('keys', v('i')), v('hi')),
            then: [set('matched', bin('+', v('matched'), n(1)), 'cost-btree')],
            phase: 'cost-btree',
          },
        ],
      },
      {
        kind: 'if',
        cond: bin('==', v('found'), n(0)),
        phase: 'cost-btree',
        then: [
          {
            kind: 'if',
            cond: bin('>', at('keys', v('i')), v('hi')),
            phase: 'cost-btree',
            then: [set('stop', at('leafOf', v('i')), 'cost-btree'), set('found', n(1), 'cost-btree')],
          },
        ],
      },
    ],
  },
  { kind: 'comment', text: 'inner pages + leaves read + one table page per matching row' },
  {
    kind: 'return',
    expr: bin('+', bin('+', v('innerPages'), bin('+', bin('-', v('stop'), v('start')), n(1))), v('matched')),
    phase: 'cost-btree',
  },
];

const hashBody: IRStmt[] = [
  decl('matched', n(0), 'cost-hash'),
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: { kind: 'len', of: v('keys') },
    inclusive: false,
    phase: 'cost-hash',
    body: [
      {
        kind: 'if',
        cond: bin('>=', at('keys', v('i')), v('lo')),
        phase: 'cost-hash',
        then: [
          {
            kind: 'if',
            cond: bin('<=', at('keys', v('i')), v('hi')),
            then: [set('matched', bin('+', v('matched'), n(1)), 'cost-hash')],
            phase: 'cost-hash',
          },
        ],
      },
    ],
  },
  { kind: 'comment', text: 'an equality opens one bucket, a range opens every bucket' },
  {
    kind: 'if',
    cond: bin('==', v('lo'), v('hi')),
    then: [{ kind: 'return', expr: bin('+', n(1), v('matched')), phase: 'cost-hash' }],
    phase: 'cost-hash',
  },
  { kind: 'return', expr: bin('+', v('bucketCount'), v('matched')), phase: 'cost-hash' },
];

const cheapestBody: IRStmt[] = [
  { kind: 'comment', text: 'a table scan reads every table page' },
  decl('best', v('tablePages'), 'cost-seq'),
  {
    kind: 'if',
    cond: bin('==', v('hasBtree'), n(1)),
    phase: 'cost-btree',
    then: [
      decl('b', call('btreePages', [v('keys'), v('leafOf'), v('innerPages'), v('lo'), v('hi')]), 'cost-btree'),
      { kind: 'if', cond: bin('<', v('b'), v('best')), then: [set('best', v('b'), 'cost-btree')], phase: 'cost-btree' },
    ],
  },
  {
    kind: 'if',
    cond: bin('==', v('hasHash'), n(1)),
    phase: 'cost-hash',
    then: [
      decl('h', call('hashPages', [v('keys'), v('bucketCount'), v('lo'), v('hi')]), 'cost-hash'),
      { kind: 'if', cond: bin('<', v('h'), v('best')), then: [set('best', v('h'), 'cost-hash')], phase: 'cost-hash' },
    ],
  },
  { kind: 'comment', text: 'ties keep the path written first: table scan, B+ tree, hash' },
  { kind: 'return', expr: v('best'), phase: 'pick-cheapest' },
];

const insertBody: IRStmt[] = [
  { kind: 'comment', text: 'one table page, plus one page per index on the table' },
  { kind: 'return', expr: bin('+', bin('+', n(1), v('hasBtree')), v('hasHash')), phase: 'insert-write' },
];

const p = (name: string, type: IRType = INT) => ({ name, type });

export const indexChoiceImperativeIR: IR = {
  id: 'index-choice-imperative',
  algorithm: 'indexChoice',
  paradigm: 'imperative',
  functions: [
    {
      name: 'cheapestPages',
      params: [
        p('keys', INTS),
        p('leafOf', INTS),
        p('innerPages'),
        p('bucketCount'),
        p('tablePages'),
        p('lo'),
        p('hi'),
        p('hasBtree'),
        p('hasHash'),
      ],
      returnType: INT,
      body: cheapestBody,
    },
    {
      name: 'btreePages',
      params: [p('keys', INTS), p('leafOf', INTS), p('innerPages'), p('lo'), p('hi')],
      returnType: INT,
      body: btreeBody,
    },
    {
      name: 'hashPages',
      params: [p('keys', INTS), p('bucketCount'), p('lo'), p('hi')],
      returnType: INT,
      body: hashBody,
    },
    {
      name: 'insertWrites',
      params: [p('hasBtree'), p('hasHash')],
      returnType: INT,
      body: insertBody,
    },
  ],
};

export const indexChoiceIRs: IR[] = [indexChoiceImperativeIR];
