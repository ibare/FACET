/**
 * boyerMoore 의 IR — 표를 짓는 함수 하나와 훑는 함수 하나.
 *
 * 핵심 셈이 IR 어휘로 온전히 펴진다. **이름 붙인 호출 뒤로 감춘 것이 하나도 없다.**
 * 예약 이름 `max` 하나만 쓰는데 그것은 "뒤로 밀지 않는다" 는 규칙 그 자체다.
 *
 * ── 글과 패턴을 왜 int 배열로 받는가
 *
 * 나쁜 문자 표는 **글자로 색인하는 표**다. `IRExpr` 에 맵이 없으므로 글자 코드를
 * 색인으로 쓰는 배열로 편다 (`last[code]`). 그러면 글과 패턴도 코드 배열이어야
 * 색인이 맞는다. 글자를 코드로 바꾸는 일은 언어마다 표기가 갈리고(자바는
 * `charAt`, 파이썬은 `ord`) 이 알고리즘의 셈도 아니므로 호출부가 맡는다.
 *
 * 그 대신 얻는 것이 크다 — **표가 배열이 되면 "패턴에 없는 글자" 가 `-1` 이라는
 * 한 칸으로 보이고**, 미는 거리 `max(j - last[bad], 1)` 이 표를 한 번 짚는
 * 산술이 된다. 감출 것이 없어진다.
 *
 * ── 배열은 인자로 받는다
 *
 * `IRExpr` 에 배열 리터럴이 없고(`lit` 은 수·글·참거짓뿐) `zeros` 같은 이름은
 * 예약할 수 없으므로(어느 언어에도 그 이름이 없다), IR 안에서 배열을 만들 길이
 * 아예 없다. `last` · `seen` · `stats` 셋을 호출부가 만들어 넘긴다.
 *
 *   `seen[i]`   글의 i 번째 글자를 한 번이라도 읽었으면 1. 안 본 글자를 세는 자리.
 *   `stats[0]`  견준 횟수 · `stats[1]` 점프 횟수 · `stats[2]` 뛴 칸의 합.
 *
 * ── 중간값
 *
 * 32비트를 넘길 자리가 없다. 글자 코드는 128 미만이고 자리 번호는 글 길이
 * 미만이라, 어느 언어에서도 정수 폭이 문제 되지 않는다.
 *
 * ── phase 어휘 (C3 — algorithm.ts 와 집합이 완전히 일치해야 한다)
 *
 * `table` · `compare` · `found` · `bad-char` · `shift`
 */

import type { IR, IRBinOp, IRExpr, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const ix = (arr: IRExpr, idx: IRExpr): IRExpr => ({ kind: 'index', arr, idx });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });

/** `at + j` — 패턴의 j 번 칸이 지금 덮고 있는 글의 자리. */
const textSpot: IRExpr = bin('+', v('at'), v('j'));

export const boyerMooreImperativeIR: IR = {
  id: 'boyer-moore-imperative',
  algorithm: 'boyerMoore',
  paradigm: 'imperative',
  functions: [
    // ── 나쁜 문자 표 — 글자마다 "패턴 안에서 마지막으로 선 자리".
    {
      name: 'build_last',
      params: [
        { name: 'pat', type: INT_LIST },
        { name: 'last', type: INT_LIST },
      ],
      returnType: { kind: 'void' },
      body: [
        { kind: 'comment', text: 'every letter starts as "not in the pattern"' },
        {
          kind: 'for-range',
          var: 'c',
          from: lit(0),
          to: len(v('last')),
          inclusive: false,
          body: [{ kind: 'assign', target: ix(v('last'), v('c')), expr: lit(-1), phase: 'table' }],
        },
        { kind: 'comment', text: 'a later letter overwrites an earlier one, so this keeps the last' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: len(v('pat')),
          inclusive: false,
          body: [
            {
              kind: 'assign',
              target: ix(v('last'), ix(v('pat'), v('i'))),
              expr: v('i'),
              phase: 'table',
            },
          ],
        },
      ],
    },

    // ── 훑기 — 뒤에서 견주고, 어긋난 글자가 정한 만큼 민다.
    {
      name: 'find_pattern',
      params: [
        { name: 'text', type: INT_LIST },
        { name: 'pat', type: INT_LIST },
        { name: 'last', type: INT_LIST },
        { name: 'seen', type: INT_LIST },
        { name: 'stats', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'n', type: INT, init: len(v('text')) },
        { kind: 'var', name: 'm', type: INT, init: len(v('pat')) },
        { kind: 'var', name: 'at', type: INT, init: lit(0) },
        {
          kind: 'while',
          cond: bin('<=', bin('+', v('at'), v('m')), v('n')),
          body: [
            { kind: 'var', name: 'j', type: INT, init: bin('-', v('m'), lit(1)) },
            { kind: 'var', name: 'broke', type: INT, init: lit(0) },
            { kind: 'comment', text: 'walk the pattern from its last letter back to its first' },
            {
              kind: 'while',
              cond: bin('>=', v('j'), lit(0)),
              body: [
                { kind: 'assign', target: ix(v('seen'), textSpot), expr: lit(1), phase: 'compare' },
                {
                  kind: 'assign',
                  target: ix(v('stats'), lit(0)),
                  expr: bin('+', ix(v('stats'), lit(0)), lit(1)),
                  phase: 'compare',
                },
                {
                  kind: 'if',
                  cond: bin('!=', ix(v('pat'), v('j')), ix(v('text'), textSpot)),
                  then: [
                    { kind: 'assign', target: v('broke'), expr: lit(1) },
                    { kind: 'break' },
                  ],
                  phase: 'compare',
                },
                { kind: 'assign', target: v('j'), expr: bin('-', v('j'), lit(1)), phase: 'compare' },
              ],
            },
            {
              kind: 'if',
              cond: bin('==', v('broke'), lit(0)),
              then: [{ kind: 'return', expr: v('at'), phase: 'found' }],
            },
            {
              kind: 'var',
              name: 'bad',
              type: INT,
              init: ix(v('text'), textSpot),
              phase: 'bad-char',
            },
            { kind: 'var', name: 'lp', type: INT, init: ix(v('last'), v('bad')), phase: 'bad-char' },
            {
              kind: 'comment',
              text: 'a letter absent from the pattern has lp = -1, so the pattern clears it whole',
            },
            {
              kind: 'var',
              name: 'shift',
              type: INT,
              init: { kind: 'call', fn: 'max', args: [bin('-', v('j'), v('lp')), lit(1)] },
              phase: 'shift',
            },
            {
              kind: 'assign',
              target: ix(v('stats'), lit(1)),
              expr: bin('+', ix(v('stats'), lit(1)), lit(1)),
              phase: 'shift',
            },
            {
              kind: 'assign',
              target: ix(v('stats'), lit(2)),
              expr: bin('+', ix(v('stats'), lit(2)), v('shift')),
              phase: 'shift',
            },
            {
              kind: 'assign',
              target: v('at'),
              expr: bin('+', v('at'), v('shift')),
              phase: 'shift',
            },
          ],
        },
        { kind: 'comment', text: 'the pattern is nowhere in the text' },
        { kind: 'return', expr: lit(-1) },
      ],
    },
  ],
};

export const boyerMooreIRs: IR[] = [boyerMooreImperativeIR];
