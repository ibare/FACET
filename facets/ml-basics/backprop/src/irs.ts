/**
 * backprop 의 IR — 두 길로 무게 모두의 기울기를 얻고 가장 큰 어긋남을 돌려준다.
 *
 * `algorithm.ts` 의 `gradientGap` · `backpropGrads` · `nudgeGrads` · `lossAt` 과 한 줄씩 같다.
 * 배열은 만들지 않는다 — 기울기 버퍼(ga gb g2 na nb n2, 길이 H)와 곱셈 세기 cnt(길이 2)는 부르는 쪽이 준다.
 * ReLU 는 `max` 대신 `if z > 0` (정수 0 과 실수가 섞이지 않게).
 *
 * phase: `forward` · `backward` · `nudge` · `compare` (algorithm.ts 와 같다).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DBL: IRType = { kind: 'double' };
const DLIST: IRType = { kind: 'list', of: DBL };
const ILIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '*' | '/' | '>', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const len = (arr: string): IRExpr => ({ kind: 'len', of: v(arr) });
const set = (target: IRExpr, expr: IRExpr, phase: string): IRStmt => ({ kind: 'assign', target, expr, phase });
const decl = (name: string, type: IRType, init: IRExpr, phase: string): IRStmt => ({ kind: 'var', name, type, init, phase });
const note = (text: string): IRStmt => ({ kind: 'comment', text });
const loopUnits = (body: IRStmt[], phase: string): IRStmt => ({
  kind: 'for-range', var: 'j', from: n(0), to: len('w2'), inclusive: false, body, phase,
});

const J = v('j');
/** z = wa[j] * x1 + wb[j] * x2 */
const zExpr = bin('+', bin('*', at('wa', J), v('x1')), bin('*', at('wb', J), v('x2')));
const bump = (slot: IRExpr, by: number, phase: string): IRStmt => set(at('cnt', slot), bin('+', at('cnt', slot), n(by)), phase);

const WEIGHTS = [
  { name: 'wa', type: DLIST },
  { name: 'wb', type: DLIST },
  { name: 'w2', type: DLIST },
  { name: 'x1', type: DBL },
  { name: 'x2', type: DBL },
  { name: 'y', type: DBL },
];
const weightArgs = (): IRExpr[] => ['wa', 'wb', 'w2', 'x1', 'x2', 'y'].map(v);

/** 무게 하나를 ε 만큼 밀어 앞 차분을 적고 되돌리는 반복 — 차례 w2 → wa → wb */
const nudgeLoop = (arr: string, out: string): IRStmt[] => [
  note(`nudge every ${arr} once, then put it back`),
  loopUnits([
    decl('old', DBL, at(arr, J), 'nudge'),
    set(at(arr, J), bin('+', v('old'), v('eps')), 'nudge'),
    set(at(out, J), bin('/', bin('-', call('lossAt', [...weightArgs(), v('cnt'), n(1)]), v('L0')), v('eps')), 'nudge'),
    set(at(arr, J), v('old'), 'nudge'),
  ], 'nudge'),
];

/** 가장 큰 어긋남 — 더 클 때만 바꾼다 */
const gapCheck = (nArr: string, gArr: string): IRStmt[] => [
  set(v('dd'), call('abs', [bin('-', at(nArr, J), at(gArr, J))]), 'compare'),
  { kind: 'if', cond: bin('>', v('dd'), v('gap')), then: [set(v('gap'), v('dd'), 'compare')], phase: 'compare' },
];

export const backpropImperativeIR: IR = {
  id: 'backprop-imperative',
  algorithm: 'backprop',
  paradigm: 'imperative',
  functions: [
    {
      name: 'gradientGap',
      params: [
        ...WEIGHTS,
        { name: 'eps', type: DBL },
        { name: 'ga', type: DLIST },
        { name: 'gb', type: DLIST },
        { name: 'g2', type: DLIST },
        { name: 'na', type: DLIST },
        { name: 'nb', type: DLIST },
        { name: 'n2', type: DLIST },
        { name: 'cnt', type: ILIST },
      ],
      returnType: DBL,
      body: [
        note('cnt[0] counts backprop multiplications, cnt[1] counts nudge multiplications'),
        { kind: 'assign', target: at('cnt', n(0)), expr: n(0) },
        { kind: 'assign', target: at('cnt', n(1)), expr: n(0) },
        { kind: 'expr-stmt', expr: call('backpropGrads', [...weightArgs(), v('ga'), v('gb'), v('g2'), v('cnt')]), phase: 'backward' },
        { kind: 'expr-stmt', expr: call('nudgeGrads', [...weightArgs(), v('eps'), v('na'), v('nb'), v('n2'), v('cnt')]), phase: 'nudge' },
        note('largest gap between the two gradients over every weight'),
        decl('gap', DBL, n(0.0), 'compare'),
        decl('dd', DBL, n(0.0), 'compare'),
        loopUnits([...gapCheck('n2', 'g2'), ...gapCheck('na', 'ga'), ...gapCheck('nb', 'gb')], 'compare'),
        { kind: 'return', expr: v('gap'), phase: 'compare' },
      ],
    },
    {
      name: 'backpropGrads',
      params: [
        ...WEIGHTS,
        { name: 'ga', type: DLIST },
        { name: 'gb', type: DLIST },
        { name: 'g2', type: DLIST },
        { name: 'cnt', type: ILIST },
      ],
      returnType: DBL,
      body: [
        note('forward pass: 3 multiplications per unit'),
        decl('yh', DBL, n(0.0), 'forward'),
        loopUnits([
          decl('z', DBL, zExpr, 'forward'),
          decl('h', DBL, n(0.0), 'forward'),
          { kind: 'if', cond: bin('>', v('z'), n(0)), then: [set(v('h'), v('z'), 'forward')], phase: 'forward' },
          set(v('yh'), bin('+', v('yh'), bin('*', at('w2', J), v('h'))), 'forward'),
          bump(n(0), 3, 'forward'),
        ], 'forward'),
        note('backward pass: 4 multiplications per unit, an off unit gets a plain zero'),
        decl('d', DBL, bin('-', v('yh'), v('y')), 'backward'),
        loopUnits([
          decl('z', DBL, zExpr, 'backward'),
          decl('delta', DBL, n(0.0), 'backward'),
          {
            kind: 'if',
            cond: bin('>', v('z'), n(0)),
            then: [
              set(at('g2', J), bin('*', v('d'), v('z')), 'backward'),
              set(v('delta'), bin('*', at('w2', J), v('d')), 'backward'),
            ],
            else: [
              set(at('g2', J), n(0.0), 'backward'),
              set(v('delta'), n(0.0), 'backward'),
            ],
            phase: 'backward',
          },
          set(at('ga', J), bin('*', v('delta'), v('x1')), 'backward'),
          set(at('gb', J), bin('*', v('delta'), v('x2')), 'backward'),
          bump(n(0), 4, 'backward'),
        ], 'backward'),
        { kind: 'return', expr: v('yh'), phase: 'backward' },
      ],
    },
    {
      name: 'nudgeGrads',
      params: [
        ...WEIGHTS,
        { name: 'eps', type: DBL },
        { name: 'na', type: DLIST },
        { name: 'nb', type: DLIST },
        { name: 'n2', type: DLIST },
        { name: 'cnt', type: ILIST },
      ],
      returnType: DBL,
      body: [
        note('one base forward pass, then one forward pass per nudged weight (forward difference)'),
        decl('L0', DBL, call('lossAt', [...weightArgs(), v('cnt'), n(1)]), 'nudge'),
        ...nudgeLoop('w2', 'n2'),
        ...nudgeLoop('wa', 'na'),
        ...nudgeLoop('wb', 'nb'),
        { kind: 'return', expr: v('L0'), phase: 'nudge' },
      ],
    },
    {
      name: 'lossAt',
      params: [...WEIGHTS, { name: 'cnt', type: ILIST }, { name: 'which', type: INT }],
      returnType: DBL,
      body: [
        note('one forward pass and its loss; multiplications go to cnt[which]'),
        decl('yh', DBL, n(0.0), 'forward'),
        loopUnits([
          decl('z', DBL, zExpr, 'forward'),
          decl('h', DBL, n(0.0), 'forward'),
          { kind: 'if', cond: bin('>', v('z'), n(0)), then: [set(v('h'), v('z'), 'forward')], phase: 'forward' },
          set(v('yh'), bin('+', v('yh'), bin('*', at('w2', J), v('h'))), 'forward'),
          bump(v('which'), 3, 'forward'),
        ], 'forward'),
        { kind: 'return', expr: bin('*', bin('*', n(0.5), bin('-', v('yh'), v('y'))), bin('-', v('yh'), v('y'))), phase: 'forward' },
      ],
    },
  ],
};

export const backpropIRs: IR[] = [backpropImperativeIR];
