/**
 * mdp 의 IR — 가치 반복 한 바퀴(`sweep`)가 진입점이다. algorithm.ts 의 셈 함수와 한 벌이라
 * 곱 · 더하기의 차례(뜻한 방향 → 왼쪽으로 돈 → 오른쪽으로 돈)까지 같다.
 *
 * phase 어휘: init (resetValues) · backup (sweep · actionValue · outcome · moveTo) · path (followPolicy).
 * 버퍼(nextValues · policy · path)는 부르는 쪽이 만든다 — IR 은 배열을 만들 수 없다.
 * `//` · `%` 는 음이 아닌 정수(칸 번호, 방향)에만 쓴다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DBL: IRType = { kind: 'double' };
const VOID: IRType = { kind: 'void' };
const LIST_INT: IRType = { kind: 'list', of: INT };
const LIST_DBL: IRType = { kind: 'list', of: DBL };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '%' | '<' | '>=' | '>' | '==' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop', op, l, r,
});
const idx = (arr: string, i: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx: i });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const neg = (x: IRExpr): IRExpr => ({ kind: 'unop', op: '-', x });

function withPhase(phase: string, body: IRStmt[]): IRStmt[] {
  return body.map((s) => {
    if (s.kind === 'comment') return s;
    const out = { ...s, phase } as IRStmt;
    if (out.kind === 'if') {
      return { ...out, then: withPhase(phase, out.then), ...(out.else ? { else: withPhase(phase, out.else) } : {}) };
    }
    if (out.kind === 'for-range' || out.kind === 'while') return { ...out, body: withPhase(phase, out.body) };
    return out;
  });
}

const setVar = (name: string, expr: IRExpr): IRStmt => ({ kind: 'assign', target: v(name), expr });
const ifThen = (cond: IRExpr, then: IRStmt[], otherwise?: IRStmt[]): IRStmt =>
  otherwise ? { kind: 'if', cond, then, else: otherwise } : { kind: 'if', cond, then };

const moveArgs = (d: IRExpr): IRExpr[] => [v('r'), v('c'), d, v('rows'), v('cols')];
const outcomeCall = (d: IRExpr): IRExpr =>
  call('outcome', v('kinds'), v('rewards'), v('values'), v('r'), v('c'), d, v('rows'), v('cols'), v('gamma'));
const actionCall = (a: IRExpr): IRExpr =>
  call('actionValue', v('kinds'), v('rewards'), v('values'), v('r'), v('c'), a, v('rows'), v('cols'), v('gamma'), v('slip'));

export const mdpImperativeIR: IR = {
  id: 'mdp-imperative',
  algorithm: 'mdp',
  paradigm: 'imperative',
  functions: [
    {
      name: 'sweep',
      params: [
        { name: 'kinds', type: LIST_INT },
        { name: 'rewards', type: LIST_DBL },
        { name: 'values', type: LIST_DBL },
        { name: 'nextValues', type: LIST_DBL },
        { name: 'policy', type: LIST_INT },
        { name: 'rows', type: INT },
        { name: 'cols', type: INT },
        { name: 'gamma', type: DBL },
        { name: 'slip', type: DBL },
      ],
      returnType: DBL,
      body: withPhase('backup', [
        { kind: 'comment', text: 'one sweep of value iteration: read old values, write nextValues, then copy back' },
        { kind: 'var', name: 'change', type: DBL, init: n(0) },
        {
          kind: 'for-range', var: 'r', from: n(0), to: v('rows'), inclusive: false,
          body: [
            {
              kind: 'for-range', var: 'c', from: n(0), to: v('cols'), inclusive: false,
              body: [
                { kind: 'var', name: 'i', type: INT, init: bin('+', bin('*', v('r'), v('cols')), v('c')) },
                ifThen(
                  bin('!=', idx('kinds', v('i')), n(0)),
                  [
                    { kind: 'comment', text: 'terminal cell: no value after it, no arrow' },
                    { kind: 'assign', target: idx('nextValues', v('i')), expr: n(0) },
                    { kind: 'assign', target: idx('policy', v('i')), expr: n(-1) },
                  ],
                  [
                    { kind: 'var', name: 'best', type: DBL, init: actionCall(n(0)) },
                    { kind: 'var', name: 'worst', type: DBL, init: v('best') },
                    { kind: 'var', name: 'arg', type: INT, init: n(0) },
                    {
                      kind: 'for-range', var: 'a', from: n(1), to: n(4), inclusive: false,
                      body: [
                        { kind: 'var', name: 'q', type: DBL, init: actionCall(v('a')) },
                        { kind: 'comment', text: 'strict > keeps the earlier direction on a tie' },
                        ifThen(bin('>', v('q'), v('best')), [setVar('best', v('q')), setVar('arg', v('a'))]),
                        setVar('worst', call('min', v('worst'), v('q'))),
                      ],
                    },
                    { kind: 'assign', target: idx('nextValues', v('i')), expr: v('best') },
                    { kind: 'comment', text: 'all four q equal: no arrow' },
                    ifThen(
                      bin('>', v('best'), v('worst')),
                      [{ kind: 'assign', target: idx('policy', v('i')), expr: v('arg') }],
                      [{ kind: 'assign', target: idx('policy', v('i')), expr: n(-1) }],
                    ),
                    setVar('change', call('max', v('change'), call('abs', bin('-', v('best'), idx('values', v('i')))))),
                  ],
                ),
              ],
            },
          ],
        },
        {
          kind: 'for-range', var: 'j', from: n(0), to: { kind: 'len', of: v('values') }, inclusive: false,
          body: [{ kind: 'assign', target: idx('values', v('j')), expr: idx('nextValues', v('j')) }],
        },
        { kind: 'return', expr: v('change') },
      ]),
    },
    {
      name: 'actionValue',
      params: [
        { name: 'kinds', type: LIST_INT },
        { name: 'rewards', type: LIST_DBL },
        { name: 'values', type: LIST_DBL },
        { name: 'r', type: INT },
        { name: 'c', type: INT },
        { name: 'a', type: INT },
        { name: 'rows', type: INT },
        { name: 'cols', type: INT },
        { name: 'gamma', type: DBL },
        { name: 'slip', type: DBL },
      ],
      returnType: DBL,
      body: withPhase('backup', [
        { kind: 'comment', text: 'slip turns the move left or right, each with probability slip' },
        { kind: 'var', name: 'leftDir', type: INT, init: bin('%', bin('+', v('a'), n(3)), n(4)) },
        { kind: 'var', name: 'rightDir', type: INT, init: bin('%', bin('+', v('a'), n(1)), n(4)) },
        { kind: 'var', name: 'q', type: DBL, init: bin('*', bin('-', n(1), bin('*', n(2), v('slip'))), outcomeCall(v('a'))) },
        setVar('q', bin('+', v('q'), bin('*', v('slip'), outcomeCall(v('leftDir'))))),
        setVar('q', bin('+', v('q'), bin('*', v('slip'), outcomeCall(v('rightDir'))))),
        { kind: 'return', expr: v('q') },
      ]),
    },
    {
      name: 'outcome',
      params: [
        { name: 'kinds', type: LIST_INT },
        { name: 'rewards', type: LIST_DBL },
        { name: 'values', type: LIST_DBL },
        { name: 'r', type: INT },
        { name: 'c', type: INT },
        { name: 'd', type: INT },
        { name: 'rows', type: INT },
        { name: 'cols', type: INT },
        { name: 'gamma', type: DBL },
      ],
      returnType: DBL,
      body: withPhase('backup', [
        { kind: 'var', name: 'j', type: INT, init: call('moveTo', ...moveArgs(v('d'))) },
        { kind: 'var', name: 'k', type: INT, init: idx('kinds', v('j')) },
        ifThen(bin('==', v('k'), n(0)), [
          { kind: 'return', expr: bin('+', idx('rewards', v('k')), bin('*', v('gamma'), idx('values', v('j')))) },
        ]),
        { kind: 'comment', text: 'entering a terminal cell: only its reward' },
        { kind: 'return', expr: idx('rewards', v('k')) },
      ]),
    },
    {
      name: 'moveTo',
      params: [
        { name: 'r', type: INT },
        { name: 'c', type: INT },
        { name: 'd', type: INT },
        { name: 'rows', type: INT },
        { name: 'cols', type: INT },
      ],
      returnType: INT,
      body: withPhase('backup', [
        { kind: 'comment', text: 'direction 0 up, 1 right, 2 down, 3 left; off the grid stays put' },
        { kind: 'var', name: 'nr', type: INT, init: v('r') },
        { kind: 'var', name: 'nc', type: INT, init: v('c') },
        ifThen(bin('==', v('d'), n(0)), [setVar('nr', bin('-', v('r'), n(1)))]),
        ifThen(bin('==', v('d'), n(1)), [setVar('nc', bin('+', v('c'), n(1)))]),
        ifThen(bin('==', v('d'), n(2)), [setVar('nr', bin('+', v('r'), n(1)))]),
        ifThen(bin('==', v('d'), n(3)), [setVar('nc', bin('-', v('c'), n(1)))]),
        ifThen(bin('<', v('nr'), n(0)), [setVar('nr', v('r'))]),
        ifThen(bin('>=', v('nr'), v('rows')), [setVar('nr', v('r'))]),
        ifThen(bin('<', v('nc'), n(0)), [setVar('nc', v('c'))]),
        ifThen(bin('>=', v('nc'), v('cols')), [setVar('nc', v('c'))]),
        { kind: 'return', expr: bin('+', bin('*', v('nr'), v('cols')), v('nc')) },
      ]),
    },
    {
      name: 'resetValues',
      params: [{ name: 'values', type: LIST_DBL }],
      returnType: VOID,
      body: withPhase('init', [
        {
          kind: 'for-range', var: 'i', from: n(0), to: { kind: 'len', of: v('values') }, inclusive: false,
          body: [{ kind: 'assign', target: idx('values', v('i')), expr: n(0) }],
        },
      ]),
    },
    {
      name: 'followPolicy',
      params: [
        { name: 'policy', type: LIST_INT },
        { name: 'kinds', type: LIST_INT },
        { name: 'start', type: INT },
        { name: 'rows', type: INT },
        { name: 'cols', type: INT },
        { name: 'limit', type: INT },
        { name: 'path', type: LIST_INT },
      ],
      returnType: INT,
      body: withPhase('path', [
        { kind: 'comment', text: 'follow the arrows as intended (no slip) from the start cell' },
        { kind: 'var', name: 'i', type: INT, init: v('start') },
        { kind: 'assign', target: idx('path', n(0)), expr: v('i') },
        {
          kind: 'for-range', var: 'n', from: n(1), to: v('limit'), inclusive: true,
          body: [
            { kind: 'var', name: 'a', type: INT, init: idx('policy', v('i')) },
            ifThen(bin('<', v('a'), n(0)), [{ kind: 'return', expr: neg(n(2)) }]),
            setVar('i', call('moveTo', bin('//', v('i'), v('cols')), bin('%', v('i'), v('cols')), v('a'), v('rows'), v('cols'))),
            { kind: 'assign', target: idx('path', v('n')), expr: v('i') },
            ifThen(bin('!=', idx('kinds', v('i')), n(0)), [{ kind: 'return', expr: v('n') }]),
          ],
        },
        { kind: 'return', expr: neg(n(1)) },
      ]),
    },
  ],
};

export const mdpIRs: IR[] = [mdpImperativeIR];
