/**
 * lr-precedence IR — 표 운전기 `runLr`. algorithm.ts 의 `runLr` 와 같은 함수다.
 *
 * 손잡이가 바꾸는 것은 actKind · actArg 의 충돌 칸 넷뿐이고 이 IR 은 한 글자도 바뀌지 않는다.
 * 표 짓기(SLR)와 우선순위 풀이는 algorithm 이 하고 배열로 넘긴다. 시작 상태는 0.
 *
 * phase 어휘: `shift` · `reduce` · `accept` (algorithm.ts 와 같다). 오류 갈래에는 phase 를 달지 않는다 —
 * 이 데이터에서 닿지 않아 끝내 안 켜지는 줄이 된다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '*' | '==' | '<', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target, expr } : { kind: 'assign', target, expr, phase };

const cell: IRExpr = bin('+', bin('*', v('s'), v('nTerm')), v('a'));

const shiftBody: IRStmt[] = [
  set(v('top'), bin('+', v('top'), n(1)), 'shift'),
  set(at('stack', v('top')), v('arg'), 'shift'),
  set(at('vals', v('top')), at('inVal', v('i')), 'shift'),
  set(v('i'), bin('+', v('i'), n(1)), 'shift'),
  set(at('counts', n(0)), bin('+', at('counts', n(0)), n(1)), 'shift'),
  set(at('counts', n(2)), { kind: 'call', fn: 'max', args: [at('counts', n(2)), v('top')] }, 'shift'),
];

const reduceBody: IRStmt[] = [
  { kind: 'var', name: 'val', type: INT, init: at('vals', v('top')), phase: 'reduce' },
  {
    kind: 'if',
    cond: bin('==', at('ruleOp', v('arg')), n(1)),
    then: [set(v('val'), bin('+', at('vals', bin('-', v('top'), n(2))), at('vals', v('top'))), 'reduce')],
    phase: 'reduce',
  },
  {
    kind: 'if',
    cond: bin('==', at('ruleOp', v('arg')), n(2)),
    then: [set(v('val'), bin('*', at('vals', bin('-', v('top'), n(2))), at('vals', v('top'))), 'reduce')],
    phase: 'reduce',
  },
  set(v('top'), bin('-', v('top'), at('ruleLen', v('arg'))), 'reduce'),
  set(at('stack', bin('+', v('top'), n(1))), at('gotoTab', at('stack', v('top'))), 'reduce'),
  set(v('top'), bin('+', v('top'), n(1)), 'reduce'),
  set(at('vals', v('top')), v('val'), 'reduce'),
  set(at('counts', n(1)), bin('+', at('counts', n(1)), n(1)), 'reduce'),
  set(at('counts', n(2)), { kind: 'call', fn: 'max', args: [at('counts', n(2)), v('top')] }, 'reduce'),
];

export const lrPrecedenceImperativeIR: IR = {
  id: 'lr-precedence-imperative',
  algorithm: 'lrPrecedence',
  paradigm: 'imperative',
  functions: [
    {
      name: 'runLr',
      params: [
        { name: 'actKind', type: LIST },
        { name: 'actArg', type: LIST },
        { name: 'gotoTab', type: LIST },
        { name: 'ruleLen', type: LIST },
        { name: 'ruleOp', type: LIST },
        { name: 'nTerm', type: INT },
        { name: 'toks', type: LIST },
        { name: 'inVal', type: LIST },
        { name: 'stack', type: LIST },
        { name: 'vals', type: LIST },
        { name: 'counts', type: LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'Terminals: NUM 0, + 1, * 2, EOF 3. Rules: 0 Start -> E, 1 E -> E + E, 2 E -> E * E, 3 E -> NUM' },
        { kind: 'comment', text: 'actKind: 0 error, 1 shift, 2 reduce, 3 accept. actArg: target state or rule' },
        { kind: 'comment', text: 'ruleOp: 0 keep value, 1 add, 2 multiply. counts: shifts, reduces, max stack' },
        { kind: 'var', name: 'top', type: INT, init: n(0) },
        set(at('stack', n(0)), n(0)),
        set(at('vals', n(0)), n(0)),
        { kind: 'var', name: 'i', type: INT, init: n(0) },
        {
          kind: 'while',
          cond: bin('<', v('i'), { kind: 'len', of: v('toks') }),
          body: [
            { kind: 'var', name: 's', type: INT, init: at('stack', v('top')) },
            { kind: 'var', name: 'a', type: INT, init: at('toks', v('i')) },
            { kind: 'var', name: 'k', type: INT, init: at('actKind', cell) },
            { kind: 'var', name: 'arg', type: INT, init: at('actArg', cell) },
            {
              kind: 'if',
              cond: bin('==', v('k'), n(1)),
              then: [{ kind: 'comment', text: 'shift: push the next token' }, ...shiftBody],
              else: [
                {
                  kind: 'if',
                  cond: bin('==', v('k'), n(2)),
                  then: [{ kind: 'comment', text: 'reduce: pop the rule body, push E by the goto table' }, ...reduceBody],
                  else: [
                    {
                      kind: 'if',
                      cond: bin('==', v('k'), n(3)),
                      then: [{ kind: 'return', expr: at('vals', v('top')), phase: 'accept' }],
                      else: [{ kind: 'return', expr: n(-1) }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: n(-1) },
      ],
    },
  ],
};

export const lrPrecedenceIRs: IR[] = [lrPrecedenceImperativeIR];
