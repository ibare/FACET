/**
 * 경사 하강 IR — `descend(path, eta, maxSteps, stopBelow, blowUp) → int`.
 *
 * path(double 목록, 길이 maxSteps + 1)의 [0] 에 출발이 들어 있고, 갱신 t 뒤 자리를 path[t] 에 쓰고,
 * 갱신 수 t 를 돌려준다. IR 은 배열을 만들 수 없어 부르는 쪽이 path 를 만든다.
 * algorithm.ts 의 `descend` 와 같은 길로 셈한다 (갱신 앞 자리에서 기울기 → 멈춤 → 갱신 → 곡선 밖).
 *
 * phase: gd-update · gd-stop · gd-blowup · gd-cap (algorithm.ts 와 같다)
 */
import type { IR, IRExpr } from '@ffacet/core';

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '<' | '>', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const abs = (x: IRExpr): IRExpr => ({ kind: 'call', fn: 'abs', args: [x] });
const DOUBLE = { kind: 'double' } as const;
const INT = { kind: 'int' } as const;

/** g = 4·w·w·w − 4·w + 0.5 */
const slope: IRExpr = bin(
  '+',
  bin('-', bin('*', bin('*', bin('*', n(4), v('w')), v('w')), v('w')), bin('*', n(4), v('w'))),
  n(0.5),
);

export const gradientDescentImperativeIR: IR = {
  id: 'gradient-descent-imperative',
  algorithm: 'gradientDescent',
  paradigm: 'imperative',
  functions: [
    {
      name: 'descend',
      params: [
        { name: 'path', type: { kind: 'list', of: DOUBLE } },
        { name: 'eta', type: DOUBLE },
        { name: 'maxSteps', type: INT },
        { name: 'stopBelow', type: DOUBLE },
        { name: 'blowUp', type: DOUBLE },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'Loss L(w) = w^4 - 2w^2 + 0.5w, slope g = 4w^3 - 4w + 0.5' },
        { kind: 'var', name: 'w', type: DOUBLE, init: { kind: 'index', arr: v('path'), idx: n(0) } },
        { kind: 'var', name: 't', type: INT, init: n(0) },
        {
          kind: 'while',
          cond: bin('<', v('t'), v('maxSteps')),
          body: [
            { kind: 'comment', text: 'slope at the spot before this update' },
            { kind: 'var', name: 'g', type: DOUBLE, init: slope, phase: 'gd-update' },
            {
              kind: 'if',
              cond: bin('<', abs(v('g')), v('stopBelow')),
              then: [{ kind: 'return', expr: v('t'), phase: 'gd-stop' }],
              phase: 'gd-stop',
            },
            { kind: 'comment', text: 'w <- w - eta * g' },
            {
              kind: 'assign',
              target: v('w'),
              expr: bin('-', v('w'), bin('*', v('eta'), v('g'))),
              phase: 'gd-update',
            },
            { kind: 'assign', target: v('t'), expr: bin('+', v('t'), n(1)), phase: 'gd-update' },
            {
              kind: 'assign',
              target: { kind: 'index', arr: v('path'), idx: v('t') },
              expr: v('w'),
              phase: 'gd-update',
            },
            {
              kind: 'if',
              cond: bin('>', abs(v('w')), v('blowUp')),
              then: [{ kind: 'return', expr: v('t'), phase: 'gd-blowup' }],
              phase: 'gd-blowup',
            },
          ],
        },
        { kind: 'comment', text: 'update cap reached without settling' },
        { kind: 'return', expr: v('t'), phase: 'gd-cap' },
      ],
    },
  ],
};

export const gradientDescentIRs: IR[] = [gradientDescentImperativeIR];
