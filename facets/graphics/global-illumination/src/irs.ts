/**
 * global-illumination 의 IR — 평면 래디오시티를 멈출 때까지 되풀이한다.
 *
 * 진입 `radiosity` 는 첫 함수다. 버퍼는 모두 부르는 쪽이 만든다 (IR 은 배열을 만들 수 없다):
 *   ax, ay, bx, by   패치 끝점 (count)
 *   reflect          반사율 ρ × tint — 채널 순 (c · count + i, 3 · count)
 *   emission         방출 E — 채널 순 (3 · count)
 *   factors          형태 계수 (count · count, 행 = 받는 패치) — 여기서 채운다
 *   prevB, nextB     야코비 버퍼 둘 (3 · count) — 끝나면 prevB 에 끝 B 가 남는다
 * 반환: 멈춘 튐 K. maxBounces 안에 모이지 않으면 −1 (TS 는 던진다).
 *
 * 셈의 차례와 더한 빛을 모으는 길은 algorithm.ts 와 같다 — 화면의 막대 · 바닥 평균 · R − B · 멈춘 튐이
 * prevB 와 반환값에서 바로 나온다. 모두 실수 사칙 + sqrt · abs 뿐이고, 정수끼리 나누는 자리가 없다.
 *
 * phase: bounce (튐 한 번과 버퍼 넘김) · converged (멈춤 판정). F 채우기 · formFactor · dist 는 phase 가
 * 없다 — 걸음 경계가 없는 판 머리(silent init)의 셈이다.
 */
import type { IR, IRExpr, IRFunc, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const DLIST: IRType = { kind: 'list', of: { kind: 'double' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '/' | '<=' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
/** c · count + i */
const chan = (c: IRExpr, i: IRExpr): IRExpr => bin('+', bin('*', c, v('count')), i);

const forRange = (name: string, from: IRExpr, to: IRExpr, body: IRStmt[], phase?: string): IRStmt =>
  phase === undefined
    ? { kind: 'for-range', var: name, from, to, inclusive: false, body }
    : { kind: 'for-range', var: name, from, to, inclusive: false, body, phase };

const radiosity: IRFunc = {
  name: 'radiosity',
  params: [
    { name: 'ax', type: DLIST },
    { name: 'ay', type: DLIST },
    { name: 'bx', type: DLIST },
    { name: 'by', type: DLIST },
    { name: 'count', type: INT },
    { name: 'reflect', type: DLIST },
    { name: 'emission', type: DLIST },
    { name: 'factors', type: DLIST },
    { name: 'prevB', type: DLIST },
    { name: 'nextB', type: DLIST },
    { name: 'tolerance', type: DOUBLE },
    { name: 'maxBounces', type: INT },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'form factors by crossed strings (convex room, no occlusion)' },
    forRange('i', n(0), v('count'), [
      forRange('j', n(0), v('count'), [
        {
          kind: 'if',
          cond: bin('==', v('i'), v('j')),
          then: [{ kind: 'assign', target: at('factors', bin('+', bin('*', v('i'), v('count')), v('j'))), expr: n(0.0) }],
          else: [
            {
              kind: 'assign',
              target: at('factors', bin('+', bin('*', v('i'), v('count')), v('j'))),
              expr: call(
                'formFactor',
                at('ax', v('i')), at('ay', v('i')), at('bx', v('i')), at('by', v('i')),
                at('ax', v('j')), at('ay', v('j')), at('bx', v('j')), at('by', v('j')),
              ),
            },
          ],
        },
      ]),
    ]),
    { kind: 'comment', text: 'B0 = E, emitted light = sum of channel means' },
    { kind: 'var', name: 'emitted', type: DOUBLE, init: n(0.0) },
    forRange('m', n(0), bin('*', n(3), v('count')), [
      { kind: 'assign', target: at('prevB', v('m')), expr: at('emission', v('m')) },
      { kind: 'assign', target: v('emitted'), expr: bin('+', v('emitted'), at('emission', v('m'))) },
    ]),
    { kind: 'assign', target: v('emitted'), expr: bin('/', v('emitted'), n(3.0)) },
    { kind: 'var', name: 'total', type: DOUBLE, init: v('emitted') },
    forRange('k', n(1), bin('+', v('maxBounces'), n(1)), [
      { kind: 'comment', text: 'one bounce: every patch gathers from the previous bounce at once' },
      {
        kind: 'var',
        name: 'added',
        type: DOUBLE,
        init: call('bounce', v('factors'), v('count'), v('reflect'), v('emission'), v('prevB'), v('nextB')),
        phase: 'bounce',
      },
      forRange('m', n(0), bin('*', n(3), v('count')), [
        { kind: 'assign', target: at('prevB', v('m')), expr: at('nextB', v('m')) },
      ], 'bounce'),
      { kind: 'assign', target: v('total'), expr: bin('+', v('total'), v('added')), phase: 'bounce' },
      { kind: 'comment', text: 'stop when this bounce adds at most tolerance of the reflected light so far' },
      {
        kind: 'if',
        cond: bin('<=', v('added'), bin('*', v('tolerance'), bin('-', v('total'), v('emitted')))),
        then: [{ kind: 'return', expr: v('k') }],
        phase: 'converged',
      },
    ]),
    { kind: 'return', expr: n(-1) },
  ],
};

const bounce: IRFunc = {
  name: 'bounce',
  params: [
    { name: 'factors', type: DLIST },
    { name: 'count', type: INT },
    { name: 'reflect', type: DLIST },
    { name: 'emission', type: DLIST },
    { name: 'prevB', type: DLIST },
    { name: 'nextB', type: DLIST },
  ],
  returnType: DOUBLE,
  body: [
    { kind: 'var', name: 'added', type: DOUBLE, init: n(0.0) },
    forRange('c', n(0), n(3), [
      forRange('i', n(0), v('count'), [
        { kind: 'var', name: 'gathered', type: DOUBLE, init: n(0.0) },
        forRange('j', n(0), v('count'), [
          {
            kind: 'assign',
            target: v('gathered'),
            expr: bin(
              '+',
              v('gathered'),
              bin('*', at('factors', bin('+', bin('*', v('i'), v('count')), v('j'))), at('prevB', chan(v('c'), v('j')))),
            ),
          },
        ]),
        {
          kind: 'assign',
          target: at('nextB', chan(v('c'), v('i'))),
          expr: bin('+', at('emission', chan(v('c'), v('i'))), bin('*', at('reflect', chan(v('c'), v('i'))), v('gathered'))),
        },
        {
          kind: 'assign',
          target: v('added'),
          expr: bin('+', v('added'), bin('-', at('nextB', chan(v('c'), v('i'))), at('prevB', chan(v('c'), v('i'))))),
        },
      ]),
    ]),
    { kind: 'comment', text: 'light added by this bounce = sum of channel means' },
    { kind: 'return', expr: bin('/', v('added'), n(3.0)) },
  ],
};

const formFactor: IRFunc = {
  name: 'formFactor',
  params: ['ax', 'ay', 'bx', 'by', 'cx', 'cy', 'dx', 'dy'].map((name) => ({ name, type: DOUBLE })),
  returnType: DOUBLE,
  body: [
    { kind: 'var', name: 'crossed', type: DOUBLE, init: bin('+', call('dist', v('ax'), v('ay'), v('dx'), v('dy')), call('dist', v('bx'), v('by'), v('cx'), v('cy'))) },
    { kind: 'var', name: 'uncrossed', type: DOUBLE, init: bin('+', call('dist', v('ax'), v('ay'), v('cx'), v('cy')), call('dist', v('bx'), v('by'), v('dx'), v('dy'))) },
    {
      kind: 'return',
      expr: bin('/', bin('*', call('abs', bin('-', v('crossed'), v('uncrossed'))), n(0.5)), call('dist', v('ax'), v('ay'), v('bx'), v('by'))),
    },
  ],
};

const dist: IRFunc = {
  name: 'dist',
  params: ['ax', 'ay', 'bx', 'by'].map((name) => ({ name, type: DOUBLE })),
  returnType: DOUBLE,
  body: [
    { kind: 'var', name: 'ddx', type: DOUBLE, init: bin('-', v('ax'), v('bx')) },
    { kind: 'var', name: 'ddy', type: DOUBLE, init: bin('-', v('ay'), v('by')) },
    { kind: 'return', expr: call('sqrt', bin('+', bin('*', v('ddx'), v('ddx')), bin('*', v('ddy'), v('ddy')))) },
  ],
};

export const globalIlluminationImperativeIR: IR = {
  id: 'global-illumination-imperative',
  algorithm: 'globalIllumination',
  paradigm: 'imperative',
  functions: [radiosity, bounce, formFactor, dist],
};

export const globalIlluminationIRs: IR[] = [globalIlluminationImperativeIR];
