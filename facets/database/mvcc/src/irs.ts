/**
 * mvcc 의 IR — 판 버퍼 셋(values · starts · ends)을 받아 읽고 · 붙이고 · 걷는다.
 *
 * 함수 셋 (첫 함수가 진입점):
 *   readVersion(starts, ends, count, snap) -> int   보이는 판의 자리(0 부터), 하나가 아니면 -1
 *   commitVersion(values, starts, ends, count, value, tick) -> int   새 판 수
 *   vacuum(values, starts, ends, count, oldest) -> int   남은 판 수
 *
 * 끝 없음은 `0`, 쥔 스냅샷 없음도 `oldest = 0` (틱은 1 부터라 겹치지 않는다).
 * IR 은 배열을 만들 수 없어 버퍼는 부르는 쪽이 길이 5 로 만든다 (처음 판 + 쓰기 넷).
 * `ir-interpreter` 의 `&&` 는 짧은 회로가 아니지만 여기서는 색인이 늘 범위 안이라 이어도 된다.
 * 알고리즘(algorithm.ts)의 readVersion · commitVersion · vacuum 과 같은 셈이다.
 *
 * phase: `read` (readVersion 의 문 전부) · `commit` (commitVersion) · `vacuum` (vacuum).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '<' | '<=' | '==' | '!=' | '>' | '&&' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});

const readBody: IRStmt[] = [
  { kind: 'comment', text: 'visible: start <= snap < end (end 0 means no end yet)' },
  { kind: 'var', name: 'found', type: INT, init: n(-1), phase: 'read' },
  { kind: 'var', name: 'seen', type: INT, init: n(0), phase: 'read' },
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: v('count'),
    inclusive: false,
    phase: 'read',
    body: [
      {
        kind: 'if',
        cond: bin(
          '&&',
          bin('<=', at('starts', v('i')), v('snap')),
          bin('||', bin('==', at('ends', v('i')), n(0)), bin('<', v('snap'), at('ends', v('i')))),
        ),
        phase: 'read',
        then: [
          { kind: 'assign', target: v('found'), expr: v('i'), phase: 'read' },
          { kind: 'assign', target: v('seen'), expr: bin('+', v('seen'), n(1)), phase: 'read' },
        ],
      },
    ],
  },
  {
    kind: 'if',
    cond: bin('!=', v('seen'), n(1)),
    phase: 'read',
    then: [{ kind: 'return', expr: n(-1), phase: 'read' }],
  },
  { kind: 'return', expr: v('found'), phase: 'read' },
];

const commitBody: IRStmt[] = [
  { kind: 'comment', text: 'close the current version, append the new one' },
  { kind: 'assign', target: at('ends', bin('-', v('count'), n(1))), expr: v('tick'), phase: 'commit' },
  { kind: 'assign', target: at('values', v('count')), expr: v('value'), phase: 'commit' },
  { kind: 'assign', target: at('starts', v('count')), expr: v('tick'), phase: 'commit' },
  { kind: 'assign', target: at('ends', v('count')), expr: n(0), phase: 'commit' },
  { kind: 'return', expr: bin('+', v('count'), n(1)), phase: 'commit' },
];

const vacuumBody: IRStmt[] = [
  { kind: 'comment', text: 'keep the current version and every version the oldest snapshot can still see' },
  { kind: 'var', name: 'kept', type: INT, init: n(0), phase: 'vacuum' },
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: v('count'),
    inclusive: false,
    phase: 'vacuum',
    body: [
      {
        kind: 'if',
        cond: bin(
          '||',
          bin('==', at('ends', v('i')), n(0)),
          bin('&&', bin('>', v('oldest'), n(0)), bin('<', v('oldest'), at('ends', v('i')))),
        ),
        phase: 'vacuum',
        then: [
          { kind: 'comment', text: 'pull the kept version forward' },
          { kind: 'assign', target: at('values', v('kept')), expr: at('values', v('i')), phase: 'vacuum' },
          { kind: 'assign', target: at('starts', v('kept')), expr: at('starts', v('i')), phase: 'vacuum' },
          { kind: 'assign', target: at('ends', v('kept')), expr: at('ends', v('i')), phase: 'vacuum' },
          { kind: 'assign', target: v('kept'), expr: bin('+', v('kept'), n(1)), phase: 'vacuum' },
        ],
      },
    ],
  },
  { kind: 'return', expr: v('kept'), phase: 'vacuum' },
];

export const mvccImperativeIR: IR = {
  id: 'mvcc-imperative',
  algorithm: 'mvcc',
  paradigm: 'imperative',
  functions: [
    {
      name: 'readVersion',
      params: [
        { name: 'starts', type: INT_LIST },
        { name: 'ends', type: INT_LIST },
        { name: 'count', type: INT },
        { name: 'snap', type: INT },
      ],
      returnType: INT,
      body: readBody,
    },
    {
      name: 'commitVersion',
      params: [
        { name: 'values', type: INT_LIST },
        { name: 'starts', type: INT_LIST },
        { name: 'ends', type: INT_LIST },
        { name: 'count', type: INT },
        { name: 'value', type: INT },
        { name: 'tick', type: INT },
      ],
      returnType: INT,
      body: commitBody,
    },
    {
      name: 'vacuum',
      params: [
        { name: 'values', type: INT_LIST },
        { name: 'starts', type: INT_LIST },
        { name: 'ends', type: INT_LIST },
        { name: 'count', type: INT },
        { name: 'oldest', type: INT },
      ],
      returnType: INT,
      body: vacuumBody,
    },
  ],
};

export const mvccIRs: IR[] = [mvccImperativeIR];
