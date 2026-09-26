/**
 * vae 의 IR — 한 판의 학습 (부호화 → 뽑기 → 되돌림 → 기울기 → 갱신).
 *
 * algorithm.ts 의 `vaeEpoch` 과 한 줄씩 같은 차례다. 생성기(ε)는 IR 에 두지 않는다 —
 * 32 비트 정수 폭을 넘는 곱과 cos 가 IR 어휘에 없어서, 부르는 쪽이 뽑은 ε 를 목록으로 건넨다.
 *
 * phase
 *   encode   μ · lv · σ 를 셈하는 줄
 *   kl-pull  β 가 닿는 dμ · dlv 두 줄
 * 뽑기 · 되돌림 · 갱신 줄에는 phase 를 달지 않는다 (걸음 경계에서 켜질 자리가 없다).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const D: IRType = { kind: 'double' };
const LD: IRType = { kind: 'list', of: { kind: 'double' } };
const V: IRType = { kind: 'void' };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const bin = (op: '+' | '-' | '*' | '/', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const len = (name: string): IRExpr => ({ kind: 'len', of: v(name) });
const plus = (off: number, e: IRExpr): IRExpr => bin('+', lit(off), e);
/** xs[4·i + k] */
const xik: IRExpr = at('xs', bin('+', bin('*', lit(4), v('i')), v('k')));

const decl = (name: string, type: IRType, init: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'var', name, type, init } : { kind: 'var', name, type, init, phase };
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target, expr } : { kind: 'assign', target, expr, phase };
const loop = (name: string, to: IRExpr, body: IRStmt[], phase?: string): IRStmt =>
  phase === undefined
    ? { kind: 'for-range', var: name, from: lit(0), to, inclusive: false, body }
    : { kind: 'for-range', var: name, from: lit(0), to, inclusive: false, body, phase };
const comment = (text: string): IRStmt => ({ kind: 'comment', text });
/** arr[idx] = arr[idx] + add */
const accum = (arr: string, idx: IRExpr, add: IRExpr): IRStmt => set(at(arr, idx), bin('+', at(arr, idx), add));

const trainEpoch = {
  name: 'trainEpoch',
  params: [
    { name: 'xs', type: LD },
    { name: 'eps', type: LD },
    { name: 'p', type: LD },
    { name: 'g', type: LD },
    { name: 'beta', type: D },
    { name: 'lr', type: D },
  ],
  returnType: V,
  body: [
    comment('weights p: w[0..3] muBias[4] v[5..8] lvBias[9] W[10..13] d[14..17]'),
    loop('j', len('p'), [set(at('g', v('j')), lit(0.0))]),
    decl('nIn', D, len('eps')),
    loop('i', len('eps'), [
      comment('encode: the input becomes a spread, mean mu and log-variance lv'),
      decl('mu', D, at('p', lit(4)), 'encode'),
      decl('lv', D, at('p', lit(9)), 'encode'),
      loop(
        'k',
        lit(4),
        [
          set(v('mu'), bin('+', v('mu'), bin('*', at('p', v('k')), xik)), 'encode'),
          set(v('lv'), bin('+', v('lv'), bin('*', at('p', plus(5, v('k'))), xik)), 'encode'),
        ],
        'encode',
      ),
      decl('sg', D, call('exp', bin('*', lit(0.5), v('lv'))), 'encode'),
      comment('sample: z = mu + sg * eps'),
      decl('z', D, bin('+', v('mu'), bin('*', v('sg'), at('eps', v('i'))))),
      comment('decode each cell and collect the reconstruction gradient'),
      decl('dz', D, lit(0.0)),
      loop('k', lit(4), [
        decl('q', D, call('sigmoid', bin('+', bin('*', at('p', plus(10, v('k'))), v('z')), at('p', plus(14, v('k')))))),
        decl('err', D, bin('-', v('q'), xik)),
        set(v('dz'), bin('+', v('dz'), bin('*', v('err'), at('p', plus(10, v('k')))))),
        accum('g', plus(10, v('k')), bin('*', v('err'), v('z'))),
        accum('g', plus(14, v('k')), v('err')),
      ]),
      comment('the KL term pulls mu toward 0 and sigma toward 1, weighted by beta'),
      decl('dmu', D, bin('+', v('dz'), bin('*', v('beta'), v('mu'))), 'kl-pull'),
      decl(
        'dlv',
        D,
        bin(
          '+',
          bin('*', bin('*', bin('*', v('dz'), at('eps', v('i'))), lit(0.5)), v('sg')),
          bin('*', bin('*', v('beta'), lit(0.5)), bin('-', call('exp', v('lv')), lit(1.0))),
        ),
        'kl-pull',
      ),
      loop('k', lit(4), [
        accum('g', v('k'), bin('*', v('dmu'), xik)),
        accum('g', plus(5, v('k')), bin('*', v('dlv'), xik)),
      ]),
      accum('g', lit(4), v('dmu')),
      accum('g', lit(9), v('dlv')),
    ]),
    comment('update: step against the gradient averaged over the inputs'),
    loop('j', len('p'), [
      set(at('p', v('j')), bin('-', at('p', v('j')), bin('/', bin('*', v('lr'), at('g', v('j'))), v('nIn')))),
    ]),
  ] as IRStmt[],
};

const sigmoidFn = {
  name: 'sigmoid',
  params: [{ name: 'z', type: D }],
  returnType: D,
  body: [
    { kind: 'return', expr: bin('/', lit(1.0), bin('+', lit(1.0), call('exp', { kind: 'unop', op: '-', x: v('z') }))) },
  ] as IRStmt[],
};

export const vaeImperativeIR: IR = {
  id: 'vae-imperative',
  algorithm: 'vae',
  paradigm: 'imperative',
  functions: [trainEpoch, sigmoidFn],
};

export const vaeIRs: IR[] = [vaeImperativeIR];
