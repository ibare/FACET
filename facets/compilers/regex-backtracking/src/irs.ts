/**
 * regex-backtracking 의 IR — 역추적 기계가 곧 주장이다.
 *
 * `matchAll(op, arg1, arg2, text, counts, hits)` (진입, 첫 함수) → `matchFrom` 재귀 (1 = 맞음 · 0 = 실패 ·
 * −1 = 모르는 명령 종류 — 지어내지 않고 그대로 위로 올린다. TS 쪽은 같은 자리에서 던진다).
 * 번호표: 명령 종류 CHAR 0 · SPLIT 1 · JMP 2 · MATCH 3, 글자 a 0 · b 1.
 * 버퍼 counts(길이 2) · hits(길이 = 글줄 길이 + 1) 는 부르는 쪽이 만든다.
 * `&&` 는 짧은 회로가 아니므로 `sp < len(text)` 와 `text[sp]` 를 중첩 if 로 가른다.
 *
 * phase 어휘 (algorithm.ts 와 같다): try-char · back-off · accept · verdict
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '<' | '==' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const recur = (pc: IRExpr, sp: IRExpr): IRExpr => ({
  kind: 'call',
  fn: 'matchFrom',
  args: [v('op'), v('arg1'), v('arg2'), v('text'), pc, sp, v('counts'), v('hits')],
});
const bump = (arr: string, idx: IRExpr, phase: string): IRStmt => ({
  kind: 'assign',
  target: at(arr, idx),
  expr: bin('+', at(arr, idx), n(1)),
  phase,
});

const matchAllFn = {
  name: 'matchAll',
  params: [
    { name: 'op', type: INTS },
    { name: 'arg1', type: INTS },
    { name: 'arg2', type: INTS },
    { name: 'text', type: INTS },
    { name: 'counts', type: INTS },
    { name: 'hits', type: INTS },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'counts[0] = letters tried, counts[1] = branches re-chosen, hits[sp] = tries at each position' },
    { kind: 'assign', target: at('counts', n(0)), expr: n(0) },
    { kind: 'assign', target: at('counts', n(1)), expr: n(0) },
    {
      kind: 'for-range',
      var: 'i',
      from: n(0),
      to: { kind: 'len', of: v('hits') },
      inclusive: false,
      body: [{ kind: 'assign', target: at('hits', v('i')), expr: n(0) }],
    },
    { kind: 'comment', text: 'the whole text must match: start at instruction 0, position 0' },
    { kind: 'return', expr: recur(n(0), n(0)), phase: 'verdict' },
  ],
} satisfies IR['functions'][number];

const matchFromFn = {
  name: 'matchFrom',
  params: [
    { name: 'op', type: INTS },
    { name: 'arg1', type: INTS },
    { name: 'arg2', type: INTS },
    { name: 'text', type: INTS },
    { name: 'pc', type: INT },
    { name: 'sp', type: INT },
    { name: 'counts', type: INTS },
    { name: 'hits', type: INTS },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'kinds: CHAR 0, SPLIT 1, JMP 2, MATCH 3 — returns 1 on match, 0 on failure' },
    { kind: 'var', name: 'kind', type: INT, init: at('op', v('pc')) },
    {
      kind: 'if',
      cond: bin('==', v('kind'), n(0)),
      then: [
        { kind: 'comment', text: 'CHAR: one letter tried here, even at the end of the text' },
        bump('counts', n(0), 'try-char'),
        bump('hits', v('sp'), 'try-char'),
        {
          kind: 'if',
          cond: bin('<', v('sp'), { kind: 'len', of: v('text') }),
          then: [
            {
              kind: 'if',
              cond: bin('==', at('text', v('sp')), at('arg1', v('pc'))),
              then: [{ kind: 'return', expr: recur(at('arg2', v('pc')), bin('+', v('sp'), n(1))) }],
            },
          ],
        },
        { kind: 'return', expr: n(0) },
      ],
    },
    {
      kind: 'if',
      cond: bin('==', v('kind'), n(1)),
      then: [
        { kind: 'comment', text: 'SPLIT: first way first; on failure back off to the second way' },
        { kind: 'var', name: 'first', type: INT, init: recur(at('arg1', v('pc')), v('sp')) },
        { kind: 'comment', text: 'a match (1) or a broken program (-1) goes straight up' },
        {
          kind: 'if',
          cond: bin('!=', v('first'), n(0)),
          then: [{ kind: 'return', expr: v('first') }],
        },
        bump('counts', n(1), 'back-off'),
        { kind: 'return', expr: recur(at('arg2', v('pc')), v('sp')), phase: 'back-off' },
      ],
    },
    {
      kind: 'if',
      cond: bin('==', v('kind'), n(2)),
      then: [{ kind: 'return', expr: recur(at('arg1', v('pc')), v('sp')) }],
    },
    {
      kind: 'if',
      cond: bin('==', v('kind'), n(3)),
      then: [
        { kind: 'comment', text: 'MATCH: only when every letter is used' },
        {
          kind: 'if',
          cond: bin('==', v('sp'), { kind: 'len', of: v('text') }),
          then: [{ kind: 'return', expr: n(1), phase: 'accept' }],
        },
        { kind: 'return', expr: n(0) },
      ],
    },
    { kind: 'comment', text: 'unknown instruction kind: the program is broken' },
    { kind: 'return', expr: { kind: 'unop', op: '-', x: n(1) } },
  ],
} satisfies IR['functions'][number];

export const regexBacktrackingImperativeIR: IR = {
  id: 'regex-backtracking-imperative',
  algorithm: 'regexBacktracking',
  paradigm: 'imperative',
  functions: [matchAllFn, matchFromFn],
};

export const regexBacktrackingIRs: IR[] = [regexBacktrackingImperativeIR];
