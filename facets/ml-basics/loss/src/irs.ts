/**
 * loss IR — 코드 패널에 띄우는 `lossRun`. algorithm.ts 의 `lossRun` 과 한 줄씩 같다.
 *
 * lossRun(kind, y, z0, eta, steps, ps, gs, ls) → 마지막 p (double)
 *   kind 0 제곱 · 1 교차 엔트로피. 그 밖이면 −1.0 (p 는 음수가 아니다 — TS 는 던진다)
 *   ps · gs · ls 는 부르는 쪽이 길이 steps + 1 로 만든다 (IR 은 배열을 만들 수 없다)
 *
 * phase: `measure` (p · L) · `slope` (∂L/∂z) · `update` (z 갱신). 주석은 영어 — 코드 패널은 어느 언어 화면에서든 그대로 뜬다.
 */

import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '/' | '<' | '!=' | '&&' | '==', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const assign = (name: string, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target: v(name), expr, phase } : { kind: 'assign', target: v(name), expr };
const setAt = (arr: string, idx: string, name: string): IRStmt => ({
  kind: 'assign',
  target: { kind: 'index', arr: v(arr), idx: v(idx) },
  expr: v(name),
});

const DOUBLE = { kind: 'double' } as const;
const INT = { kind: 'int' } as const;
const DLIST = { kind: 'list', of: { kind: 'double' } } as const;

const pMinusY = bin('-', v('p'), v('y'));

export const lossImperativeIR: IR = {
  id: 'loss-imperative',
  algorithm: 'loss',
  paradigm: 'imperative',
  functions: [
    {
      name: 'lossRun',
      params: [
        { name: 'kind', type: INT },
        { name: 'y', type: INT },
        { name: 'z0', type: DOUBLE },
        { name: 'eta', type: DOUBLE },
        { name: 'steps', type: INT },
        { name: 'ps', type: DLIST },
        { name: 'gs', type: DLIST },
        { name: 'ls', type: DLIST },
      ],
      returnType: DOUBLE,
      body: [
        { kind: 'comment', text: 'kind 0 = squared loss, 1 = cross-entropy; anything else is not a loss' },
        {
          kind: 'if',
          cond: bin('&&', bin('!=', v('kind'), n(0)), bin('!=', v('kind'), n(1))),
          then: [{ kind: 'return', expr: n(-1.0) }],
        },
        { kind: 'var', name: 'z', type: DOUBLE, init: v('z0') },
        { kind: 'var', name: 'p', type: DOUBLE, init: n(0.0) },
        {
          kind: 'for-range',
          var: 't',
          from: n(0),
          to: v('steps'),
          inclusive: true,
          body: [
            { kind: 'comment', text: 'output probability p = sigmoid(z)' },
            assign('p', bin('/', n(1.0), bin('+', n(1.0), call('exp', { kind: 'unop', op: '-', x: v('z') }))), 'measure'),
            { kind: 'var', name: 'L', type: DOUBLE, init: n(0.0) },
            { kind: 'var', name: 'g', type: DOUBLE, init: n(0.0) },
            {
              kind: 'if',
              cond: bin('==', v('kind'), n(0)),
              then: [
                { kind: 'comment', text: 'squared: L = (p - y)^2, dL/dz = 2(p - y) p (1 - p)' },
                assign('L', bin('*', pMinusY, pMinusY), 'measure'),
                assign(
                  'g',
                  bin('*', bin('*', bin('*', n(2.0), pMinusY), v('p')), bin('-', n(1.0), v('p'))),
                  'slope',
                ),
              ],
              else: [
                { kind: 'comment', text: 'cross-entropy: L = -(y ln p + (1 - y) ln(1 - p)), dL/dz = p - y' },
                assign(
                  'L',
                  {
                    kind: 'unop',
                    op: '-',
                    x: bin(
                      '+',
                      bin('*', v('y'), call('log', v('p'))),
                      bin('*', bin('-', n(1.0), v('y')), call('log', bin('-', n(1.0), v('p')))),
                    ),
                  },
                  'measure',
                ),
                assign('g', pMinusY, 'slope'),
              ],
            },
            setAt('ps', 't', 'p'),
            setAt('gs', 't', 'g'),
            setAt('ls', 't', 'L'),
            { kind: 'comment', text: 'step against the slope measured before the update' },
            {
              kind: 'if',
              cond: bin('<', v('t'), v('steps')),
              then: [assign('z', bin('-', v('z'), bin('*', v('eta'), v('g'))), 'update')],
            },
          ],
        },
        { kind: 'return', expr: v('p') },
      ],
    },
  ],
};

export const lossIRs: IR[] = [lossImperativeIR];
