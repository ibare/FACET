/**
 * ecc 의 IR — 두 배-더하기(scalarMul) · 하나씩 더해 되찾기(recover) · 교환(shared).
 *
 * 알고리즘과 같은 길로 센다: 높은 비트부터 top 을 // 2 로 내리며 (k // top) % 2 로 읽고(비트 연산 없음),
 * 되찾기는 G 부터 G 를 하나씩 더한다. 군은 부호로 건넨다 — 곡선 점 (x, y) 는 x·p + y, O 는 p·p,
 * 곱셈군 원소는 값 그대로. `//` · `%` 는 음이 아닌 값에만 쓴다 — 곡선의 빼기 앞에 늘 p 를 더한다.
 * 역원은 페르마(modPow(den, p − 2, p), p 소수). 모르는 군 · O 입력에는 −1 을 돌려준다(TS 는 던진다).
 * 중간값 최대 3·16·16 + 2 = 770 (곡선) · 22·22 = 484 (곱셈) — 32 비트와 멀다.
 *
 * phase: double · add · recover · shared (algorithm.ts 와 같다)
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '%' | '<' | '<=' | '>' | '==' | '!=' | '&&' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const neg1: IRExpr = { kind: 'unop', op: '-', x: n(1) };
const ret = (expr: IRExpr, phase?: string): IRStmt => (phase ? { kind: 'return', expr, phase } : { kind: 'return', expr });
const cost0: IRExpr = { kind: 'index', arr: v('cost'), idx: n(0) };
const unknownGroup: IRStmt = {
  kind: 'if',
  cond: bin('&&', bin('!=', v('group'), n(0)), bin('!=', v('group'), n(1))),
  then: [ret(neg1)],
};
const opArgs = (u: IRExpr, w: IRExpr): IRExpr => call('groupOp', v('group'), u, w, v('p'), v('a'));

export const eccImperativeIR: IR = {
  id: 'ecc-imperative',
  algorithm: 'ecc',
  paradigm: 'imperative',
  functions: [
    {
      name: 'scalarMul',
      params: [
        { name: 'group', type: INT },
        { name: 'k', type: INT },
        { name: 'g', type: INT },
        { name: 'p', type: INT },
        { name: 'a', type: INT },
        { name: 'cost', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'double-and-add from the highest bit; cost[0] counts group operations' },
        unknownGroup,
        { kind: 'var', name: 'top', type: INT, init: n(1) },
        { kind: 'while', cond: bin('<=', bin('*', v('top'), n(2)), v('k')), body: [{ kind: 'assign', target: v('top'), expr: bin('*', v('top'), n(2)) }] },
        { kind: 'var', name: 'r', type: INT, init: v('g') },
        { kind: 'assign', target: v('top'), expr: bin('//', v('top'), n(2)) },
        {
          kind: 'while',
          cond: bin('>', v('top'), n(0)),
          body: [
            { kind: 'assign', target: v('r'), expr: opArgs(v('r'), v('r')), phase: 'double' },
            { kind: 'assign', target: cost0, expr: bin('+', cost0, n(1)), phase: 'double' },
            {
              kind: 'if',
              cond: bin('==', bin('%', bin('//', v('k'), v('top')), n(2)), n(1)),
              then: [
                { kind: 'assign', target: v('r'), expr: opArgs(v('r'), v('g')), phase: 'add' },
                { kind: 'assign', target: cost0, expr: bin('+', cost0, n(1)), phase: 'add' },
              ],
            },
            { kind: 'if', cond: bin('<', v('r'), n(0)), then: [ret(neg1)] },
            { kind: 'assign', target: v('top'), expr: bin('//', v('top'), n(2)) },
          ],
        },
        ret(v('r')),
      ],
    },
    {
      name: 'recover',
      params: [
        { name: 'group', type: INT },
        { name: 'target', type: INT },
        { name: 'g', type: INT },
        { name: 'p', type: INT },
        { name: 'a', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'only kG is public: add g one at a time until we meet it' },
        unknownGroup,
        { kind: 'var', name: 'cur', type: INT, init: v('g') },
        { kind: 'var', name: 'added', type: INT, init: n(0) },
        {
          kind: 'while',
          cond: bin('!=', v('cur'), v('target')),
          body: [
            { kind: 'if', cond: bin('>', v('added'), bin('*', v('p'), v('p'))), then: [ret(neg1)] },
            { kind: 'assign', target: v('cur'), expr: opArgs(v('cur'), v('g')), phase: 'recover' },
            { kind: 'assign', target: v('added'), expr: bin('+', v('added'), n(1)), phase: 'recover' },
            { kind: 'if', cond: bin('<', v('cur'), n(0)), then: [ret(neg1)] },
          ],
        },
        ret(v('added')),
      ],
    },
    {
      name: 'shared',
      params: [
        { name: 'group', type: INT },
        { name: 'k', type: INT },
        { name: 'b', type: INT },
        { name: 'g', type: INT },
        { name: 'p', type: INT },
        { name: 'a', type: INT },
        { name: 'cost', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'each side multiplies the other public value by its own secret' },
        unknownGroup,
        { kind: 'var', name: 'pubA', type: INT, init: call('scalarMul', v('group'), v('k'), v('g'), v('p'), v('a'), v('cost')) },
        { kind: 'var', name: 'pubB', type: INT, init: call('scalarMul', v('group'), v('b'), v('g'), v('p'), v('a'), v('cost')) },
        { kind: 'var', name: 'fromAlice', type: INT, init: call('scalarMul', v('group'), v('k'), v('pubB'), v('p'), v('a'), v('cost')) },
        { kind: 'var', name: 'fromBob', type: INT, init: call('scalarMul', v('group'), v('b'), v('pubA'), v('p'), v('a'), v('cost')) },
        { kind: 'if', cond: bin('!=', v('fromAlice'), v('fromBob')), then: [ret(neg1)] },
        ret(v('fromAlice'), 'shared'),
      ],
    },
    {
      name: 'groupOp',
      params: [
        { name: 'group', type: INT },
        { name: 'u', type: INT },
        { name: 'v', type: INT },
        { name: 'p', type: INT },
        { name: 'a', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'group 0: multiply mod p; group 1: point add/double on the curve (point = x * p + y, O = p * p)' },
        { kind: 'if', cond: bin('==', v('group'), n(0)), then: [ret(bin('%', bin('*', v('u'), v('v')), v('p')))] },
        { kind: 'if', cond: bin('!=', v('group'), n(1)), then: [ret(neg1)] },
        { kind: 'var', name: 'inf', type: INT, init: bin('*', v('p'), v('p')) },
        { kind: 'if', cond: bin('||', bin('==', v('u'), v('inf')), bin('==', v('v'), v('inf'))), then: [ret(neg1)] },
        { kind: 'var', name: 'x1', type: INT, init: bin('//', v('u'), v('p')) },
        { kind: 'var', name: 'y1', type: INT, init: bin('%', v('u'), v('p')) },
        { kind: 'var', name: 'x2', type: INT, init: bin('//', v('v'), v('p')) },
        { kind: 'var', name: 'y2', type: INT, init: bin('%', v('v'), v('p')) },
        {
          kind: 'if',
          cond: bin('&&', bin('==', v('x1'), v('x2')), bin('==', bin('%', bin('+', v('y1'), v('y2')), v('p')), n(0))),
          then: [ret(v('inf'))],
        },
        { kind: 'var', name: 'num', type: INT, init: n(0) },
        { kind: 'var', name: 'den', type: INT, init: n(0) },
        {
          kind: 'if',
          cond: bin('==', v('u'), v('v')),
          then: [
            { kind: 'comment', text: 'doubling: slope (3x^2 + a) / (2y)' },
            { kind: 'assign', target: v('num'), expr: bin('%', bin('+', bin('*', bin('*', n(3), v('x1')), v('x1')), v('a')), v('p')) },
            { kind: 'assign', target: v('den'), expr: bin('%', bin('*', n(2), v('y1')), v('p')) },
          ],
          else: [
            { kind: 'comment', text: 'adding: slope (y2 - y1) / (x2 - x1), add p before subtracting' },
            { kind: 'assign', target: v('num'), expr: bin('%', bin('+', bin('-', v('y2'), v('y1')), v('p')), v('p')) },
            { kind: 'assign', target: v('den'), expr: bin('%', bin('+', bin('-', v('x2'), v('x1')), v('p')), v('p')) },
          ],
        },
        { kind: 'var', name: 'lam', type: INT, init: bin('%', bin('*', v('num'), call('modPow', v('den'), bin('-', v('p'), n(2)), v('p'))), v('p')) },
        {
          kind: 'var',
          name: 'x3',
          type: INT,
          init: bin('%', bin('-', bin('-', bin('+', bin('*', v('lam'), v('lam')), bin('*', n(2), v('p'))), v('x1')), v('x2')), v('p')),
        },
        {
          kind: 'var',
          name: 'y3',
          type: INT,
          init: bin(
            '%',
            bin('-', bin('+', bin('*', v('lam'), bin('%', bin('+', bin('-', v('x1'), v('x3')), v('p')), v('p'))), v('p')), v('y1')),
            v('p'),
          ),
        },
        ret(bin('+', bin('*', v('x3'), v('p')), v('y3'))),
      ],
    },
    {
      name: 'modPow',
      params: [
        { name: 'b', type: INT },
        { name: 'e', type: INT },
        { name: 'm', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'square-and-multiply, reducing after every product' },
        { kind: 'var', name: 'result', type: INT, init: n(1) },
        { kind: 'var', name: 'sq', type: INT, init: bin('%', v('b'), v('m')) },
        { kind: 'var', name: 'rest', type: INT, init: v('e') },
        {
          kind: 'while',
          cond: bin('>', v('rest'), n(0)),
          body: [
            { kind: 'if', cond: bin('==', bin('%', v('rest'), n(2)), n(1)), then: [{ kind: 'assign', target: v('result'), expr: bin('%', bin('*', v('result'), v('sq')), v('m')) }] },
            { kind: 'assign', target: v('sq'), expr: bin('%', bin('*', v('sq'), v('sq')), v('m')) },
            { kind: 'assign', target: v('rest'), expr: bin('//', v('rest'), n(2)) },
          ],
        },
        ret(v('result')),
      ],
    },
  ],
};

export const eccIRs: IR[] = [eccImperativeIR];
