/**
 * integral IR — 기울기(할선) · 넓이(리만 합) · 함숫값.
 *
 * 첫 함수 `slope` 가 진입점이다. algorithm.ts 의 `slope` · `area` · `fAt` 와 같은 차례로 셈한다
 * (계수를 double 로 두고 x 를 지수 번 곱한다 · `w = (hi − lo) / n` · `lo + (k + off) * w`).
 * 잡는 자리는 0 · 1 · 2 를 하나씩 명시하고, 그 밖은 표지 −1 을 돌려준다 (TS 는 던진다).
 * 정상 답은 모두 양수라 (가장 작은 추정 1.0000) 표지와 겹치지 않는다.
 *
 * phase 어휘 (algorithm.ts 와 같다): slope-left · slope-right · slope-mid · area-left · area-right · area-mid · area-add.
 * fAt 의 문에는 phase 를 달지 않는다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '/' | '//' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const ret = (expr: IRExpr, phase?: string): IRStmt => (phase ? { kind: 'return', expr, phase } : { kind: 'return', expr });

const f = (x: IRExpr): IRExpr => call('fAt', v('terms'), x);

export const integralImperativeIR: IR = {
  id: 'integral-imperative',
  algorithm: 'integral',
  paradigm: 'imperative',
  functions: [
    {
      name: 'slope',
      params: [
        { name: 'terms', type: INT_LIST },
        { name: 'rule', type: INT },
        { name: 'a', type: DOUBLE },
        { name: 'h', type: DOUBLE },
      ],
      returnType: DOUBLE,
      body: [
        { kind: 'comment', text: 'rule 0: backward difference, 1: forward difference, 2: central difference' },
        {
          kind: 'if',
          cond: bin('==', v('rule'), n(0)),
          then: [ret(bin('/', bin('-', f(v('a')), f(bin('-', v('a'), v('h')))), v('h')), 'slope-left')],
        },
        {
          kind: 'if',
          cond: bin('==', v('rule'), n(1)),
          then: [ret(bin('/', bin('-', f(bin('+', v('a'), v('h'))), f(v('a'))), v('h')), 'slope-right')],
        },
        {
          kind: 'if',
          cond: bin('==', v('rule'), n(2)),
          then: [
            ret(
              bin('/', bin('-', f(bin('+', v('a'), v('h'))), f(bin('-', v('a'), v('h')))), bin('*', n(2), v('h'))),
              'slope-mid',
            ),
          ],
        },
        { kind: 'comment', text: 'unknown rule: marker -1 (every real estimate is positive)' },
        ret(n(-1)),
      ],
    },
    {
      name: 'area',
      params: [
        { name: 'terms', type: INT_LIST },
        { name: 'rule', type: INT },
        { name: 'lo', type: DOUBLE },
        { name: 'hi', type: DOUBLE },
        { name: 'n', type: INT },
      ],
      returnType: DOUBLE,
      body: [
        { kind: 'var', name: 'w', type: DOUBLE, init: bin('/', bin('-', v('hi'), v('lo')), v('n')) },
        { kind: 'var', name: 'off', type: DOUBLE, init: n(0.0) },
        { kind: 'comment', text: 'where each strip is measured: left end, right end or midpoint' },
        {
          kind: 'if',
          cond: bin('==', v('rule'), n(0)),
          then: [{ kind: 'assign', target: v('off'), expr: n(0.0), phase: 'area-left' }],
          else: [
            {
              kind: 'if',
              cond: bin('==', v('rule'), n(1)),
              then: [{ kind: 'assign', target: v('off'), expr: n(1.0), phase: 'area-right' }],
              else: [
                {
                  kind: 'if',
                  cond: bin('==', v('rule'), n(2)),
                  then: [{ kind: 'assign', target: v('off'), expr: n(0.5), phase: 'area-mid' }],
                  else: [ret(n(-1))],
                },
              ],
            },
          ],
        },
        { kind: 'var', name: 'total', type: DOUBLE, init: n(0.0) },
        {
          kind: 'for-range',
          var: 'k',
          from: n(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'assign',
              target: v('total'),
              expr: bin('+', v('total'), bin('*', f(bin('+', v('lo'), bin('*', bin('+', v('k'), v('off')), v('w')))), v('w'))),
              phase: 'area-add',
            },
          ],
        },
        ret(v('total')),
      ],
    },
    {
      name: 'fAt',
      params: [
        { name: 'terms', type: INT_LIST },
        { name: 'x', type: DOUBLE },
      ],
      returnType: DOUBLE,
      body: [
        { kind: 'comment', text: 'terms is flat: [coef, power, coef, power, ...]' },
        { kind: 'var', name: 'total', type: DOUBLE, init: n(0.0) },
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: bin('//', { kind: 'len', of: v('terms') }, n(2)),
          inclusive: false,
          body: [
            { kind: 'var', name: 'term', type: DOUBLE, init: { kind: 'index', arr: v('terms'), idx: bin('*', n(2), v('i')) } },
            {
              kind: 'for-range',
              var: 'j',
              from: n(0),
              to: { kind: 'index', arr: v('terms'), idx: bin('+', bin('*', n(2), v('i')), n(1)) },
              inclusive: false,
              body: [{ kind: 'assign', target: v('term'), expr: bin('*', v('term'), v('x')) }],
            },
            { kind: 'assign', target: v('total'), expr: bin('+', v('total'), v('term')) },
          ],
        },
        ret(v('total')),
      ],
    },
  ],
};

export const integralIRs: IR[] = [integralImperativeIR];
