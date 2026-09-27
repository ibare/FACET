/**
 * brdf IR — 봉우리와 반구 적분(총량)을 여섯 언어로.
 *
 * μ = cosθ 로 바꾸면 반구 적분이 삼각함수 없이 반복 · 사칙 · sqrt 로 펴지고(dω = dμ dφ, N·H 는 반각의 sqrt),
 * 지수는 곱 되풀이다. 코드 패널이 화면의 봉우리 · 총량을 그대로 낸다.
 * 반폭각 · 로브 표본은 IR 밖이다(acos · cos 가 IR 에 없다) — 둘 다 같은 reflectRadiance 식의 값에서 나온다.
 *
 * 함정 피하기: `2 / (nn + 2)` 는 nn 을 double 지역 변수로 먼저 받는다(정수끼리 나누지 않는다) · max 를 쓰지 않는다 ·
 * 모르는 모형은 표지 −1 (algorithm 은 던진다).
 *
 * phase: peak · lobe · integrate (algorithm 과 같은 집합)
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DBL: IRType = { kind: 'double' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '/' | '<' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const mul = (...xs: IRExpr[]): IRExpr => xs.reduce((a, b) => bin('*', a, b));
const sqrt = (x: IRExpr): IRExpr => ({ kind: 'call', fn: 'sqrt', args: [x] });
const dvar = (name: string, init: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'var', name, type: DBL, init, phase } : { kind: 'var', name, type: DBL, init };

const radianceArgs = (mu: IRExpr): IRExpr[] => [v('model'), mu, v('n'), v('ks'), v('f0')];

export const brdfImperativeIR: IR = {
  id: 'brdf-imperative',
  algorithm: 'brdf',
  paradigm: 'imperative',
  functions: [
    {
      name: 'reflectTotal',
      params: [
        { name: 'model', type: INT },
        { name: 'n', type: INT },
        { name: 'ks', type: DBL },
        { name: 'f0', type: DBL },
        { name: 'm', type: INT },
      ],
      returnType: DBL,
      body: [
        { kind: 'comment', text: 'light arrives along the normal with irradiance 1; mu = cos(theta) of the outgoing direction' },
        dvar('pi', lit(3.141592653589793)),
        { kind: 'comment', text: 'peak: intensity toward the mirror direction (theta = 0, mu = 1)' },
        dvar('peak', { kind: 'call', fn: 'reflectRadiance', args: radianceArgs(lit(1.0)) }, 'peak'),
        { kind: 'if', cond: bin('<', v('peak'), lit(0)), then: [{ kind: 'return', expr: lit(-1) }] },
        { kind: 'comment', text: 'hemisphere integral over mu with the midpoint rule: 2 pi * sum L(mu) mu / m' },
        dvar('s', lit(0)),
        {
          kind: 'for-range',
          var: 'k',
          from: lit(0),
          to: v('m'),
          inclusive: false,
          body: [
            dvar('mu', bin('/', bin('+', v('k'), lit(0.5)), v('m'))),
            {
              kind: 'assign',
              target: v('s'),
              expr: bin('+', v('s'), bin('*', { kind: 'call', fn: 'reflectRadiance', args: radianceArgs(v('mu')) }, v('mu'))),
              phase: 'integrate',
            },
          ],
        },
        { kind: 'return', expr: bin('/', mul(lit(2), v('pi'), v('s')), v('m')), phase: 'integrate' },
      ],
    },
    {
      name: 'reflectRadiance',
      params: [
        { name: 'model', type: INT },
        { name: 'mu', type: DBL },
        { name: 'n', type: INT },
        { name: 'ks', type: DBL },
        { name: 'f0', type: DBL },
      ],
      returnType: DBL,
      body: [
        dvar('pi', lit(3.141592653589793)),
        {
          kind: 'if',
          cond: bin('==', v('model'), lit(0)),
          then: [
            { kind: 'comment', text: 'Phong: ks * mu^n (R = N, so R.V = mu)' },
            dvar('p', lit(1)),
            {
              kind: 'for-range',
              var: 'j',
              from: lit(0),
              to: v('n'),
              inclusive: false,
              body: [{ kind: 'assign', target: v('p'), expr: bin('*', v('p'), v('mu')) }],
            },
            { kind: 'return', expr: bin('*', v('ks'), v('p')), phase: 'lobe' },
          ],
        },
        {
          kind: 'if',
          cond: bin('==', v('model'), lit(1)),
          then: [
            { kind: 'comment', text: 'PBR (Cook-Torrance): GGX D, Schlick F, Schlick-GGX G with k = alpha / 2' },
            dvar('nn', v('n')),
            dvar('alpha', sqrt(bin('/', lit(2), bin('+', v('nn'), lit(2))))),
            dvar('a2', bin('*', v('alpha'), v('alpha'))),
            { kind: 'comment', text: 'H is halfway between L = N and V, so N.H = V.H = sqrt((1 + mu) / 2)' },
            dvar('nh', sqrt(bin('/', bin('+', lit(1), v('mu')), lit(2)))),
            dvar('dd', bin('+', mul(v('nh'), v('nh'), bin('-', v('a2'), lit(1))), lit(1))),
            dvar('dist', bin('/', v('a2'), mul(v('pi'), v('dd'), v('dd')))),
            dvar('x', bin('-', lit(1), v('nh'))),
            dvar('fres', bin('+', v('f0'), mul(bin('-', lit(1), v('f0')), v('x'), v('x'), v('x'), v('x'), v('x')))),
            dvar('kk', bin('/', v('alpha'), lit(2))),
            dvar('nl', lit(1)),
            dvar(
              'geo',
              bin(
                '*',
                bin('/', v('nl'), bin('+', bin('*', v('nl'), bin('-', lit(1), v('kk'))), v('kk'))),
                bin('/', v('mu'), bin('+', bin('*', v('mu'), bin('-', lit(1), v('kk'))), v('kk'))),
              ),
            ),
            {
              kind: 'return',
              expr: bin('/', mul(v('dist'), v('fres'), v('geo')), mul(lit(4), v('nl'), v('mu'))),
              phase: 'lobe',
            },
          ],
        },
        { kind: 'comment', text: 'unknown model: marker -1' },
        { kind: 'return', expr: lit(-1) },
      ],
    },
  ],
};

export const brdfIRs: IR[] = [brdfImperativeIR];
