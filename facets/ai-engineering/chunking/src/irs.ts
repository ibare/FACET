/**
 * 청킹 IR — 코드 패널이 여섯 언어로 옮기는 알고리즘.
 *
 * 셈이 전부 정수다. 글과 문장은 부르는 쪽이 셈해 **정수 배열**로 건넨다 — IR 에는 문자열이 없다.
 * IR 함수는 배열을 만들 수 없으므로 덩이 버퍼 `chunkStart` · `chunkEnd` 는 부르는 쪽이 길이 40 으로
 * 만들어 건넨다 (가장 많은 덩이는 반 겹침 · 창 16 의 15).
 *
 * - 진입 `countBroken(sentStart, sentEnd, chunkStart, chunkEnd, count)` — 잘린 문장 수
 * - 보조 `cutByWords(total, size, overlap, chunkStart, chunkEnd)` — 덩이 수 (겹침 0 이면 낱말 수)
 * - 보조 `cutBySentences(sentStart, sentEnd, size, chunkStart, chunkEnd)` — 덩이 수
 *
 * phase 어휘는 algorithm.ts 와 같다: `'cut' | 'check' | 'done'`.
 *
 * 코드 패널의 주석은 두지 않는다 — IR 주석은 한 언어 글자라 열 언어 화면에 그대로 박힌다.
 *
 * `&&` 는 인터프리터에서 짧은 회로가 아니므로 쓰지 않는다 — 두 조건은 `if` 를 중첩한다.
 * 정수 중간값 최대는 144 안팎 (k·보폭 + S 등). 32비트 넘침과 멀다.
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '<' | '<=' | '>' | '>=' | '==', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const decl = (name: string, init: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'var', name, type: INT, init, phase } : { kind: 'var', name, type: INT, init };
const put = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };

/** 덩이 하나를 버퍼에 적고 수를 하나 올린다. */
const record = (from: IRExpr, to: IRExpr): IRStmt[] => [
  put(at('chunkStart', v('count')), from, 'cut'),
  put(at('chunkEnd', v('count')), to, 'cut'),
  put(v('count'), bin('+', v('count'), n(1)), 'cut'),
];

export const chunkingImperativeIR: IR = {
  id: 'chunking-imperative',
  algorithm: 'chunking',
  paradigm: 'imperative',
  functions: [
    {
      name: 'countBroken',
      params: [
        { name: 'sentStart', type: INT_LIST },
        { name: 'sentEnd', type: INT_LIST },
        { name: 'chunkStart', type: INT_LIST },
        { name: 'chunkEnd', type: INT_LIST },
        { name: 'count', type: INT },
      ],
      returnType: INT,
      body: [
        decl('broken', n(0)),
        {
          kind: 'for-range',
          var: 'j',
          from: n(0),
          to: { kind: 'len', of: v('sentStart') },
          inclusive: false,
          body: [
            decl('whole', n(0)),
            {
              kind: 'for-range',
              var: 'k',
              from: n(0),
              to: v('count'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: bin('<=', at('chunkStart', v('k')), at('sentStart', v('j'))),
                  then: [
                    {
                      kind: 'if',
                      cond: bin('<=', at('sentEnd', v('j')), at('chunkEnd', v('k'))),
                      then: [put(v('whole'), n(1), 'check')],
                      phase: 'check',
                    },
                  ],
                  phase: 'check',
                },
              ],
            },
            {
              kind: 'if',
              cond: bin('==', v('whole'), n(0)),
              then: [put(v('broken'), bin('+', v('broken'), n(1)), 'check')],
              phase: 'check',
            },
          ],
        },
        { kind: 'return', expr: v('broken'), phase: 'done' },
      ],
    },
    {
      name: 'cutByWords',
      params: [
        { name: 'total', type: INT },
        { name: 'size', type: INT },
        { name: 'overlap', type: INT },
        { name: 'chunkStart', type: INT_LIST },
        { name: 'chunkEnd', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        decl('stride', bin('-', v('size'), v('overlap'))),
        decl('count', n(0)),
        decl('start', n(0)),
        decl('stop', n(0)),
        {
          kind: 'while',
          cond: bin('<', v('stop'), v('total')),
          body: [
            put(v('stop'), { kind: 'call', fn: 'min', args: [bin('+', v('start'), v('size')), v('total')] }),
            ...record(v('start'), v('stop')),
            put(v('start'), bin('+', v('start'), v('stride'))),
          ],
        },
        { kind: 'return', expr: v('count') },
      ],
    },
    {
      name: 'cutBySentences',
      params: [
        { name: 'sentStart', type: INT_LIST },
        { name: 'sentEnd', type: INT_LIST },
        { name: 'size', type: INT },
        { name: 'chunkStart', type: INT_LIST },
        { name: 'chunkEnd', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        decl('count', n(0)),
        decl('holdStart', n(-1)),
        decl('holdEnd', n(-1)),
        {
          kind: 'for-range',
          var: 'j',
          from: n(0),
          to: { kind: 'len', of: v('sentStart') },
          inclusive: false,
          body: [
            decl('span', bin('-', at('sentEnd', v('j')), at('sentStart', v('j')))),
            {
              kind: 'if',
              cond: bin('>=', v('holdStart'), n(0)),
              then: [
                {
                  kind: 'if',
                  cond: bin('>', bin('+', bin('-', v('holdEnd'), v('holdStart')), v('span')), v('size')),
                  then: [...record(v('holdStart'), v('holdEnd')), put(v('holdStart'), n(-1))],
                },
              ],
            },
            {
              kind: 'if',
              cond: bin('>', v('span'), v('size')),
              then: [
                decl('piece', at('sentStart', v('j'))),
                {
                  kind: 'while',
                  cond: bin('>', bin('-', at('sentEnd', v('j')), v('piece')), v('size')),
                  body: [
                    ...record(v('piece'), bin('+', v('piece'), v('size'))),
                    put(v('piece'), bin('+', v('piece'), v('size'))),
                  ],
                },
                put(v('holdStart'), v('piece')),
                put(v('holdEnd'), at('sentEnd', v('j'))),
              ],
              else: [
                {
                  kind: 'if',
                  cond: bin('<', v('holdStart'), n(0)),
                  then: [put(v('holdStart'), at('sentStart', v('j')))],
                },
                put(v('holdEnd'), at('sentEnd', v('j'))),
              ],
            },
          ],
        },
        {
          kind: 'if',
          cond: bin('>=', v('holdStart'), n(0)),
          then: record(v('holdStart'), v('holdEnd')),
        },
        { kind: 'return', expr: v('count') },
      ],
    },
  ],
};

export const chunkingIRs: IR[] = [chunkingImperativeIR];
