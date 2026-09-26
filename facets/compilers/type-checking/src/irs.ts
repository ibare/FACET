/**
 * type-checking 의 IR — 규칙표를 배열로 받아 표만 읽는 타입 검사기.
 *
 * 손잡이가 바꾸는 것은 opRule · fits 두 배열뿐이다 — 검사기의 몸은 세 언어에서 같다.
 * 식 나무는 색인 배열(kind · arg · left · right)로, 줄은 root · declName · want 로 받는다.
 * 버퍼 nameType(이름 수, 부르는 쪽이 -1 로 채움) · lineMark(줄 수) · counts(두 칸)는 부르는 쪽이 만든다.
 *
 * phase 어휘 (algorithm.ts 와 같다):
 *   typeOf        unknown · op-miss · rise
 *   checkProgram  bind · decl-take · decl-fit · decl-miss · verdict
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '*' | '<' | '>=' | '==' | '!=' | '||', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const put = (arr: string, idx: IRExpr, expr: IRExpr, phase: string): IRStmt => ({
  kind: 'assign',
  target: at(arr, idx),
  expr,
  phase,
});

const TYPE_OF_ARGS = ['kind', 'arg', 'left', 'right', 'opRule', 'nameType', 'counts'];
const typeOfCall = (node: IRExpr): IRExpr => ({
  kind: 'call',
  fn: 'typeOf',
  args: [node, ...TYPE_OF_ARGS.map(v)],
});

const typeOf = {
  name: 'typeOf',
  params: [
    { name: 'node', type: INT },
    { name: 'kind', type: INTS },
    { name: 'arg', type: INTS },
    { name: 'left', type: INTS },
    { name: 'right', type: INTS },
    { name: 'opRule', type: INTS },
    { name: 'nameType', type: INTS },
    { name: 'counts', type: INTS },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'a literal has its own type, a name has the type bound on an earlier line' },
    {
      kind: 'if',
      cond: bin('==', at('kind', v('node')), n(0)),
      then: [{ kind: 'return', expr: at('arg', v('node')), phase: 'rise' }],
      phase: 'rise',
    },
    {
      kind: 'if',
      cond: bin('==', at('kind', v('node')), n(1)),
      then: [{ kind: 'return', expr: at('nameType', at('arg', v('node'))), phase: 'rise' }],
      phase: 'rise',
    },
    { kind: 'comment', text: 'an unknown node kind has no type' },
    {
      kind: 'if',
      cond: bin('!=', at('kind', v('node')), n(2)),
      then: [{ kind: 'return', expr: n(-1), phase: 'unknown' }],
      phase: 'unknown',
    },
    { kind: 'comment', text: 'post-order: left, right, then this operator' },
    { kind: 'var', name: 'lt', type: INT, init: typeOfCall(at('left', v('node'))), phase: 'rise' },
    { kind: 'var', name: 'rt', type: INT, init: typeOfCall(at('right', v('node'))), phase: 'rise' },
    { kind: 'comment', text: 'an operand without a type is not counted again' },
    {
      kind: 'if',
      cond: bin('||', bin('<', v('lt'), n(0)), bin('<', v('rt'), n(0))),
      then: [{ kind: 'return', expr: n(-1), phase: 'unknown' }],
      phase: 'unknown',
    },
    {
      kind: 'var',
      name: 'res',
      type: INT,
      init: at('opRule', bin('+', bin('*', bin('+', bin('*', at('arg', v('node')), n(4)), v('lt')), n(4)), v('rt'))),
      phase: 'rise',
    },
    { kind: 'comment', text: 'no rule for this pair: the climb stops here' },
    {
      kind: 'if',
      cond: bin('<', v('res'), n(0)),
      then: [
        put('counts', n(0), bin('+', at('counts', n(0)), n(1)), 'op-miss'),
        put('counts', n(1), n(1), 'op-miss'),
        { kind: 'return', expr: n(-1), phase: 'op-miss' },
      ],
      phase: 'op-miss',
    },
    { kind: 'return', expr: v('res'), phase: 'rise' },
  ],
} satisfies IR['functions'][number];

const checkProgram = {
  name: 'checkProgram',
  params: [
    { name: 'root', type: INTS },
    { name: 'declName', type: INTS },
    { name: 'want', type: INTS },
    { name: 'kind', type: INTS },
    { name: 'arg', type: INTS },
    { name: 'left', type: INTS },
    { name: 'right', type: INTS },
    { name: 'opRule', type: INTS },
    { name: 'fits', type: INTS },
    { name: 'nameType', type: INTS },
    { name: 'lineMark', type: INTS },
    { name: 'counts', type: INTS },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'read the program once, top to bottom; values are never computed' },
    {
      kind: 'for-range',
      var: 'i',
      from: n(0),
      to: { kind: 'len', of: v('root') },
      inclusive: false,
      phase: 'bind',
      body: [
        put('counts', n(1), n(0), 'bind'),
        { kind: 'var', name: 'ty', type: INT, init: typeOfCall(at('root', v('i'))), phase: 'bind' },
        { kind: 'var', name: 'w', type: INT, init: at('want', v('i')), phase: 'bind' },
        {
          kind: 'if',
          cond: bin('<', v('w'), n(0)),
          phase: 'bind',
          then: [
            { kind: 'comment', text: 'no declared type: the name takes the type of its expression' },
            put('nameType', at('declName', v('i')), v('ty'), 'bind'),
            {
              kind: 'if',
              cond: bin('>=', v('ty'), n(0)),
              phase: 'bind',
              then: [put('lineMark', v('i'), n(0), 'bind')],
              else: [
                {
                  kind: 'if',
                  cond: bin('==', at('counts', n(1)), n(1)),
                  phase: 'bind',
                  then: [put('lineMark', v('i'), n(1), 'bind')],
                  else: [put('lineMark', v('i'), n(3), 'bind')],
                },
              ],
            },
          ],
          else: [
            { kind: 'comment', text: 'declared type goes in first, so later lines do not fail with it' },
            put('nameType', at('declName', v('i')), v('w'), 'decl-take'),
            {
              kind: 'if',
              cond: bin('<', v('ty'), n(0)),
              phase: 'decl-take',
              then: [
                {
                  kind: 'if',
                  cond: bin('==', at('counts', n(1)), n(1)),
                  phase: 'decl-take',
                  then: [put('lineMark', v('i'), n(1), 'decl-take')],
                  else: [put('lineMark', v('i'), n(3), 'decl-take')],
                },
              ],
              else: [
                {
                  kind: 'if',
                  cond: bin('==', at('fits', bin('+', bin('*', v('ty'), n(4)), v('w'))), n(1)),
                  phase: 'decl-fit',
                  then: [put('lineMark', v('i'), n(0), 'decl-fit')],
                  else: [
                    put('counts', n(0), bin('+', at('counts', n(0)), n(1)), 'decl-miss'),
                    put('lineMark', v('i'), n(2), 'decl-miss'),
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    { kind: 'return', expr: at('counts', n(0)), phase: 'verdict' },
  ],
} satisfies IR['functions'][number];

export const typeCheckingImperativeIR: IR = {
  id: 'type-checking-imperative',
  algorithm: 'typeChecking',
  paradigm: 'imperative',
  functions: [checkProgram, typeOf],
};

export const typeCheckingIRs: IR[] = [typeCheckingImperativeIR];
