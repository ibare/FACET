/**
 * 이름 해석기의 IR — 손잡이가 바꾸는 것은 "선언이 드는 스코프" 한 함수(`scopeFor`)다.
 *
 * - `resolveAll` (진입) — ① 선언마다 드는 표 ② 같은 표 · 같은 이름 · 더 위 줄의 선언이 있으면
 *   두 번 선언(걸림) ③ 쓰임마다 `findDecl`. 걸림 수를 돌려준다
 * - `scopeFor` — 하나뿐 → 0, 블록마다 → home, 함수마다 → 종류가 block(2)인 동안 parent 로
 * - `findDecl` — 표 있는 스코프로 옮겨 놓고, 받아들여진 · 같은 이름 · 같은 스코프 · 더 위 줄의
 *   선언을 찾는다. 없으면 parent 로 나가 다시 `scopeFor`, 맨 바깥 밖이면 -1
 *
 * 이름 · 스코프는 번호로 건넨다 (IR 에 문자열 비교가 없다). 버퍼 `declScope` · `accepted` ·
 * `target` 은 부르는 쪽이 길이만큼 만든다 (`resolveArgs`).
 * 두 번 선언은 배열 차례가 아니라 **줄**로 견준다 — 선언 차례를 섞어도 같은 답이다.
 *
 * phase 어휘 (algorithm.ts 와 같다): place · reject · found · missing
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '<' | '>=' | '==' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const len = (arr: string): IRExpr => ({ kind: 'len', of: v(arr) });
const call = (fn: string, args: string[]): IRExpr => ({ kind: 'call', fn, args: args.map(v) });

const scopeForFn: IRStmt[] = [
  { kind: 'comment', text: 'single table: every declaration goes to the outermost scope' },
  { kind: 'if', cond: bin('==', v('rule'), n(2)), then: [{ kind: 'return', expr: n(0), phase: 'place' }] },
  { kind: 'var', name: 's', type: INT, init: v('home') },
  { kind: 'comment', text: 'per function: if / for bodies hand their names to the enclosing function or top' },
  {
    kind: 'if',
    cond: bin('==', v('rule'), n(1)),
    then: [
      {
        kind: 'while',
        cond: bin('==', at('scopeKind', v('s')), n(2)),
        body: [{ kind: 'assign', target: v('s'), expr: at('parent', v('s')), phase: 'place' }],
      },
    ],
  },
  { kind: 'return', expr: v('s'), phase: 'place' },
];

const findDeclFn: IRStmt[] = [
  { kind: 'var', name: 's', type: INT, init: call('scopeFor', ['scope', 'rule', 'parent', 'scopeKind']) },
  { kind: 'comment', text: 'search the innermost table first, then walk outward' },
  {
    kind: 'while',
    cond: bin('>=', v('s'), n(0)),
    body: [
      {
        kind: 'for-range',
        var: 'd',
        from: n(0),
        to: len('declName'),
        inclusive: false,
        body: [
          {
            kind: 'if',
            cond: bin(
              '&&',
              bin('&&', bin('==', at('accepted', v('d')), n(1)), bin('==', at('declName', v('d')), v('name'))),
              bin('&&', bin('==', at('declScope', v('d')), v('s')), bin('<', at('declLine', v('d')), v('line'))),
            ),
            then: [{ kind: 'return', expr: v('d'), phase: 'found' }],
          },
        ],
      },
      { kind: 'assign', target: v('s'), expr: at('parent', v('s')) },
      {
        kind: 'if',
        cond: bin('>=', v('s'), n(0)),
        then: [{ kind: 'assign', target: v('s'), expr: call('scopeFor', ['s', 'rule', 'parent', 'scopeKind']) }],
      },
    ],
  },
  { kind: 'comment', text: 'fell off the outermost table: no declaration' },
  { kind: 'return', expr: n(-1), phase: 'missing' },
];

const resolveAllFn: IRStmt[] = [
  { kind: 'var', name: 'errors', type: INT, init: n(0) },
  { kind: 'comment', text: 'each declaration goes to the table the rule picks' },
  {
    kind: 'for-range',
    var: 'd',
    from: n(0),
    to: len('declName'),
    inclusive: false,
    body: [
      {
        kind: 'assign',
        target: at('declScope', v('d')),
        expr: { kind: 'call', fn: 'scopeFor', args: [at('declHome', v('d')), v('rule'), v('parent'), v('scopeKind')] },
      },
    ],
  },
  { kind: 'comment', text: 'same name, same table, an earlier line: declared twice, the earlier one stays' },
  {
    kind: 'for-range',
    var: 'd',
    from: n(0),
    to: len('declName'),
    inclusive: false,
    body: [
      { kind: 'assign', target: at('accepted', v('d')), expr: n(1) },
      {
        kind: 'for-range',
        var: 'e',
        from: n(0),
        to: len('declName'),
        inclusive: false,
        body: [
          {
            kind: 'if',
            cond: bin(
              '&&',
              bin('==', at('declName', v('e')), at('declName', v('d'))),
              bin('&&', bin('==', at('declScope', v('e')), at('declScope', v('d'))), bin('<', at('declLine', v('e')), at('declLine', v('d')))),
            ),
            then: [{ kind: 'assign', target: at('accepted', v('d')), expr: n(0), phase: 'reject' }],
          },
        ],
      },
      {
        kind: 'if',
        cond: bin('==', at('accepted', v('d')), n(0)),
        then: [{ kind: 'assign', target: v('errors'), expr: bin('+', v('errors'), n(1)), phase: 'reject' }],
      },
    ],
  },
  { kind: 'comment', text: 'each use points at the first declaration found' },
  {
    kind: 'for-range',
    var: 'u',
    from: n(0),
    to: len('useName'),
    inclusive: false,
    body: [
      {
        kind: 'assign',
        target: at('target', v('u')),
        expr: {
          kind: 'call',
          fn: 'findDecl',
          args: [
            at('useName', v('u')),
            at('useScope', v('u')),
            at('useLine', v('u')),
            v('rule'),
            v('declName'),
            v('declScope'),
            v('declLine'),
            v('accepted'),
            v('parent'),
            v('scopeKind'),
          ],
        },
        phase: 'found',
      },
      {
        kind: 'if',
        cond: bin('==', at('target', v('u')), n(-1)),
        then: [{ kind: 'assign', target: v('errors'), expr: bin('+', v('errors'), n(1)), phase: 'missing' }],
      },
    ],
  },
  { kind: 'return', expr: v('errors') },
];

const p = (name: string, type: IRType) => ({ name, type });

export const scopeAndSymbolsImperativeIR: IR = {
  id: 'scope-and-symbols-imperative',
  algorithm: 'scopeAndSymbols',
  paradigm: 'imperative',
  functions: [
    {
      name: 'resolveAll',
      params: [
        p('rule', INT),
        p('declName', INTS),
        p('declHome', INTS),
        p('declLine', INTS),
        p('useName', INTS),
        p('useScope', INTS),
        p('useLine', INTS),
        p('parent', INTS),
        p('scopeKind', INTS),
        p('declScope', INTS),
        p('accepted', INTS),
        p('target', INTS),
      ],
      returnType: INT,
      body: resolveAllFn,
    },
    {
      name: 'scopeFor',
      params: [p('home', INT), p('rule', INT), p('parent', INTS), p('scopeKind', INTS)],
      returnType: INT,
      body: scopeForFn,
    },
    {
      name: 'findDecl',
      params: [
        p('name', INT),
        p('scope', INT),
        p('line', INT),
        p('rule', INT),
        p('declName', INTS),
        p('declScope', INTS),
        p('declLine', INTS),
        p('accepted', INTS),
        p('parent', INTS),
        p('scopeKind', INTS),
      ],
      returnType: INT,
      body: findDeclFn,
    },
  ],
};

export const scopeAndSymbolsIRs: IR[] = [scopeAndSymbolsImperativeIR];
