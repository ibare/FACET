/**
 * recursive-descent — 코드 패널의 IR. 규칙마다 함수 하나, 첫 함수가 진입점.
 *
 * algorithm.ts 의 parseProgram · parseStmt · parseExpr · parseAtom 과 같은 모양이다 (갈고리만 빠졌다).
 *   kind  = 단말 번호 배열 (끝에 EOF 6 — 부르는 쪽이 붙인다)
 *   stats = [calls, max-depth, eaten] — 부르는 쪽이 길이 3 으로 만든다
 *   돌려줌 = 다 먹은 자리(= 토큰 수) 또는 −1
 *
 * phase: stmt · expr · atom · limit · done (algorithm.ts 와 같다)
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '<' | '>' | '==' | '!=' | '||', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const ret = (expr: IRExpr, phase?: string): IRStmt => (phase ? { kind: 'return', expr, phase } : { kind: 'return', expr });
const bump = (slot: number, phase?: string): IRStmt => {
  const s: IRStmt = { kind: 'assign', target: at('stats', n(slot)), expr: bin('+', at('stats', n(slot)), n(1)) };
  return phase ? { ...s, phase } : s;
};
const deepest = (depth: IRExpr): IRStmt => ({
  kind: 'assign',
  target: at('stats', n(1)),
  expr: call('max', [at('stats', n(1)), depth]),
});
const fail = (cond: IRExpr): IRStmt => ({ kind: 'if', cond, then: [ret(n(-1))] });
const plus1 = (e: IRExpr): IRExpr => bin('+', e, n(1));
const rest = (pos: IRExpr, depth: IRExpr): IRExpr[] => [v('kind'), pos, depth, v('leftRec'), v('limit'), v('stats')];

export const recursiveDescentImperativeIR: IR = {
  id: 'recursive-descent-imperative',
  algorithm: 'recursiveDescent',
  paradigm: 'imperative',
  functions: [
    {
      name: 'parseProgram',
      params: [
        { name: 'kind', type: INTS },
        { name: 'leftRec', type: INT },
        { name: 'limit', type: INT },
        { name: 'stats', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'terminals: 0 = show, 1 = NAME, 2 = NUM, 3 = "+", 4 = "(", 5 = ")", 6 = EOF' },
        { kind: 'comment', text: 'stats: [0] calls, [1] max depth, [2] tokens eaten' },
        { kind: 'assign', target: at('stats', n(0)), expr: n(0) },
        { kind: 'assign', target: at('stats', n(1)), expr: n(0) },
        { kind: 'assign', target: at('stats', n(2)), expr: n(0) },
        {
          kind: 'var',
          name: 'p',
          type: INT,
          init: call('parseStmt', [v('kind'), n(0), v('leftRec'), v('limit'), v('stats')]),
        },
        fail(bin('<', v('p'), n(0))),
        { kind: 'comment', text: 'the whole input must be eaten: next must be EOF (6)' },
        fail(bin('!=', at('kind', v('p')), n(6))),
        ret(v('p'), 'done'),
      ],
    },
    {
      name: 'parseStmt',
      params: [
        { name: 'kind', type: INTS },
        { name: 'pos', type: INT },
        { name: 'leftRec', type: INT },
        { name: 'limit', type: INT },
        { name: 'stats', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'R1  Stmt -> show Expr   (depth 1)' },
        bump(0, 'stmt'),
        deepest(n(1)),
        fail(bin('!=', at('kind', v('pos')), n(0))),
        bump(2),
        ret(call('parseExpr', rest(plus1(v('pos')), n(2)))),
      ],
    },
    {
      name: 'parseExpr',
      params: [
        { name: 'kind', type: INTS },
        { name: 'pos', type: INT },
        { name: 'depth', type: INT },
        { name: 'leftRec', type: INT },
        { name: 'limit', type: INT },
        { name: 'stats', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'call limit: refuse the call, it is not counted' },
        { kind: 'if', cond: bin('>', v('depth'), v('limit')), then: [ret(n(-1))], phase: 'limit' },
        bump(0, 'expr'),
        deepest(v('depth')),
        { kind: 'var', name: 'p', type: INT, init: n(-1) },
        {
          kind: 'if',
          cond: bin('==', v('leftRec'), n(1)),
          then: [
            { kind: 'comment', text: 'R2  Expr -> Expr + Atom   (first job: call itself)' },
            { kind: 'assign', target: v('p'), expr: call('parseExpr', rest(v('pos'), plus1(v('depth')))) },
          ],
          else: [
            { kind: 'comment', text: 'R2  Expr -> Atom + Atom' },
            { kind: 'assign', target: v('p'), expr: call('parseAtom', rest(v('pos'), plus1(v('depth')))) },
          ],
        },
        fail(bin('<', v('p'), n(0))),
        fail(bin('!=', at('kind', v('p')), n(3))),
        bump(2),
        ret(call('parseAtom', rest(plus1(v('p')), plus1(v('depth'))))),
      ],
    },
    {
      name: 'parseAtom',
      params: [
        { name: 'kind', type: INTS },
        { name: 'pos', type: INT },
        { name: 'depth', type: INT },
        { name: 'leftRec', type: INT },
        { name: 'limit', type: INT },
        { name: 'stats', type: INTS },
      ],
      returnType: INT,
      body: [
        bump(0, 'atom'),
        deepest(v('depth')),
        { kind: 'comment', text: 'peek at the next token, do not eat it yet' },
        {
          kind: 'if',
          cond: bin('==', at('kind', v('pos')), n(4)),
          then: [
            { kind: 'comment', text: 'Atom -> ( Expr )' },
            bump(2),
            { kind: 'var', name: 'p', type: INT, init: call('parseExpr', rest(plus1(v('pos')), plus1(v('depth')))) },
            fail(bin('<', v('p'), n(0))),
            fail(bin('!=', at('kind', v('p')), n(5))),
            bump(2),
            ret(plus1(v('p'))),
          ],
        },
        {
          kind: 'if',
          cond: bin('||', bin('==', at('kind', v('pos')), n(1)), bin('==', at('kind', v('pos')), n(2))),
          then: [
            { kind: 'comment', text: 'Atom -> NAME | NUM' },
            bump(2),
            ret(plus1(v('pos'))),
          ],
        },
        ret(n(-1)),
      ],
    },
  ],
};

export const recursiveDescentIRs: IR[] = [recursiveDescentImperativeIR];
