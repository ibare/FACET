/**
 * gan 의 IR — 한 라운드(가려내는 쪽 한 번 → 만드는 쪽 한 번)를 펼친다.
 *
 * 진입점 `ganRound(real, noise, m, dpar, gpar, grad, lrD, lrG)` — `discriminatorStep` 다음 `generatorStep`.
 * dpar = [v0, v1, v2, c] · gpar = [a, b] · grad 넷은 부르는 쪽이 만든다 (IR 은 배열을 만들 수 없다).
 * 차례는 algorithm.ts 의 같은 이름 함수와 같다 — 검사가 모든 손잡이 값 · 모든 라운드에서 견준다.
 *
 * phase — `d-step` 은 v · c 를 고치는 줄, `g-step` 은 a · b 를 고치는 줄.
 * 표본 수는 `len(...)` 을 double 지역 변수에 담아 나눈다 (정수 나눗셈을 피한다).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const D: IRType = { kind: 'double' };
const LD: IRType = { kind: 'list', of: { kind: 'double' } };
const VOID: IRType = { kind: 'void' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const len = (arr: string): IRExpr => ({ kind: 'len', of: v(arr) });
const bin = (op: '+' | '-' | '*' | '/' | '<', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const neg = (x: IRExpr): IRExpr => ({ kind: 'unop', op: '-', x });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const decl = (name: string, type: IRType, init: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'var', name, type, init, phase } : { kind: 'var', name, type, init };
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const loop = (name: string, to: IRExpr, body: IRStmt[], phase?: string): IRStmt =>
  phase
    ? { kind: 'for-range', var: name, from: n(0), to, inclusive: false, body, phase }
    : { kind: 'for-range', var: name, from: n(0), to, inclusive: false, body };
const note = (text: string): IRStmt => ({ kind: 'comment', text });

/** exp(-(x - m[k]) * (x - m[k]) / 2) — the bell-shaped feature around centre k. */
const bell = (x: IRExpr): IRExpr =>
  call('exp', bin('/', bin('*', neg(bin('-', x, at('m', v('k')))), bin('-', x, at('m', v('k')))), n(2)));

const dOf = (x: IRExpr): IRExpr => call('sigmoid', call('score', x, v('dpar'), v('m')));

const sigmoidFn = {
  name: 'sigmoid',
  params: [{ name: 'z', type: D }],
  returnType: D,
  body: [{ kind: 'return', expr: bin('/', n(1), bin('+', n(1), call('exp', neg(v('z'))))) }] as IRStmt[],
};

const scoreFn = {
  name: 'score',
  params: [
    { name: 'x', type: D },
    { name: 'dpar', type: LD },
    { name: 'm', type: LD },
  ],
  returnType: D,
  body: [
    note('s(x) = c + sum of v[k] * bell_k(x)'),
    decl('s', D, at('dpar', n(3))),
    loop('k', n(3), [set(v('s'), bin('+', v('s'), bin('*', at('dpar', v('k')), bell(v('x')))))]),
    { kind: 'return', expr: v('s') },
  ] as IRStmt[],
};

const discriminatorStepFn = {
  name: 'discriminatorStep',
  params: [
    { name: 'real', type: LD },
    { name: 'noise', type: LD },
    { name: 'm', type: LD },
    { name: 'dpar', type: LD },
    { name: 'gpar', type: LD },
    { name: 'grad', type: LD },
    { name: 'lrD', type: D },
  ],
  returnType: VOID,
  body: [
    note('discriminator: gradient ascent on mean log D(real) + mean log(1 - D(fake))'),
    decl('a', D, at('gpar', n(0))),
    decl('b', D, at('gpar', n(1))),
    loop('j', n(4), [set(at('grad', v('j')), n(0))]),
    decl('nr', D, len('real')),
    decl('nf', D, len('noise')),
    note('real samples push D up'),
    loop('i', len('real'), [
      decl('x', D, at('real', v('i'))),
      decl('d', D, dOf(v('x'))),
      loop('k', n(3), [
        set(
          at('grad', v('k')),
          bin('+', at('grad', v('k')), bin('/', bin('*', bin('-', n(1), v('d')), bell(v('x'))), v('nr'))),
        ),
      ]),
      set(at('grad', n(3)), bin('+', at('grad', n(3)), bin('/', bin('-', n(1), v('d')), v('nr')))),
    ]),
    note('fake samples x = a * z + b push D down'),
    loop('i', len('noise'), [
      decl('x', D, bin('+', bin('*', v('a'), at('noise', v('i'))), v('b'))),
      decl('d', D, dOf(v('x'))),
      loop('k', n(3), [
        set(at('grad', v('k')), bin('-', at('grad', v('k')), bin('/', bin('*', v('d'), bell(v('x'))), v('nf')))),
      ]),
      set(at('grad', n(3)), bin('-', at('grad', n(3)), bin('/', v('d'), v('nf')))),
    ]),
    note('update v[0], v[1], v[2] and c'),
    loop(
      'j',
      n(4),
      [set(at('dpar', v('j')), bin('+', at('dpar', v('j')), bin('*', v('lrD'), at('grad', v('j')))), 'd-step')],
      'd-step',
    ),
  ] as IRStmt[],
};

const generatorStepFn = {
  name: 'generatorStep',
  params: [
    { name: 'noise', type: LD },
    { name: 'm', type: LD },
    { name: 'dpar', type: LD },
    { name: 'gpar', type: LD },
    { name: 'lrG', type: D },
  ],
  returnType: VOID,
  body: [
    note('generator: gradient ascent on mean log D(a * z + b), using the D just updated'),
    decl('a', D, at('gpar', n(0))),
    decl('b', D, at('gpar', n(1))),
    decl('nf', D, len('noise')),
    decl('ga', D, n(0)),
    decl('gb', D, n(0)),
    loop('i', len('noise'), [
      decl('z', D, at('noise', v('i'))),
      decl('x', D, bin('+', bin('*', v('a'), v('z')), v('b'))),
      decl('d', D, dOf(v('x'))),
      note('slope of the score at x'),
      decl('sp', D, n(0)),
      loop('k', n(3), [
        set(
          v('sp'),
          bin('+', v('sp'), bin('*', bin('*', at('dpar', v('k')), bell(v('x'))), neg(bin('-', v('x'), at('m', v('k')))))),
        ),
      ]),
      set(v('ga'), bin('+', v('ga'), bin('/', bin('*', bin('*', bin('-', n(1), v('d')), v('sp')), v('z')), v('nf')))),
      set(v('gb'), bin('+', v('gb'), bin('/', bin('*', bin('-', n(1), v('d')), v('sp')), v('nf')))),
    ]),
    note('move a and b'),
    set(at('gpar', n(0)), bin('+', v('a'), bin('*', v('lrG'), v('ga'))), 'g-step'),
    set(at('gpar', n(1)), bin('+', v('b'), bin('*', v('lrG'), v('gb'))), 'g-step'),
  ] as IRStmt[],
};

const ganRoundFn = {
  name: 'ganRound',
  params: [
    { name: 'real', type: LD },
    { name: 'noise', type: LD },
    { name: 'm', type: LD },
    { name: 'dpar', type: LD },
    { name: 'gpar', type: LD },
    { name: 'grad', type: LD },
    { name: 'lrD', type: D },
    { name: 'lrG', type: D },
  ],
  returnType: VOID,
  body: [
    note('one round: the discriminator learns once, then the generator learns once'),
    {
      kind: 'expr-stmt',
      expr: call('discriminatorStep', v('real'), v('noise'), v('m'), v('dpar'), v('gpar'), v('grad'), v('lrD')),
    },
    { kind: 'expr-stmt', expr: call('generatorStep', v('noise'), v('m'), v('dpar'), v('gpar'), v('lrG')) },
  ] as IRStmt[],
};


export const ganImperativeIR: IR = {
  id: 'gan-imperative',
  algorithm: 'gan',
  paradigm: 'imperative',
  functions: [ganRoundFn, discriminatorStepFn, generatorStepFn, scoreFn, sigmoidFn],
};

export const ganIRs: IR[] = [ganImperativeIR];
