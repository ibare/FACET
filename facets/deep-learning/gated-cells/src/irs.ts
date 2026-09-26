/**
 * gated-cells IR — 세 셀의 한 시각을 펴고, 시각 2 부터 곱한 몫을 곱해 남은 몫을 돌려준다.
 *
 * 진입 `keptShare(cell, xs, n, w)`:
 *   cell  0 RNN · 1 GRU · 2 LSTM
 *   xs    [쓰기 입력, 방해 입력 앞 gap 개] — 부르는 쪽이 잘라 건넨다 (n = gap + 1)
 *   w     평평한 무게 스물넷 — RNN.h · GRU.z · GRU.r · GRU.h · LSTM.f · LSTM.i · LSTM.g · LSTM.o 각각 (w_x, w_h, b)
 * algorithm 의 `cellStep` · `runCell` 과 같은 차례 · 같은 식이다.
 *
 * phase: `rnn-step` · `gru-step` · `lstm-step` (그 셀의 줄) · `kept-share` (곱해 쌓는 줄과 돌려주는 줄).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const D: IRType = { kind: 'double' };
const I: IRType = { kind: 'int' };
const LD: IRType = { kind: 'list', of: { kind: 'double' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const add = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '+', l, r });
const sub = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '-', l, r });
const mul = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '*', l, r });
const div = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '/', l, r });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const wAt = (k: number): IRExpr => ({ kind: 'index', arr: v('w'), idx: n(k) });
/** w_x·x + w_h·(hIn) + b — k 는 그 셋의 첫 자리 */
const affine = (k: number, hIn: IRExpr): IRExpr => add(add(mul(wAt(k), v('x')), mul(wAt(k + 1), hIn)), wAt(k + 2));
const decl = (name: string, init: IRExpr, phase: string): IRStmt => ({ kind: 'var', name, type: D, init, phase });
const set = (name: string, expr: IRExpr, phase: string): IRStmt => ({ kind: 'assign', target: v(name), expr, phase });

const RNN = 'rnn-step';
const GRU = 'gru-step';
const LSTM = 'lstm-step';
const KEPT = 'kept-share';

const rnnBody: IRStmt[] = [
  { kind: 'comment', text: 'RNN: the state is overwritten every time step' },
  set('h', call('tanhExp', affine(0, v('h'))), RNN),
  set('factor', mul(wAt(1), sub(n(1), mul(v('h'), v('h')))), RNN),
];

const gruBody: IRStmt[] = [
  { kind: 'comment', text: 'GRU: z is the share of the old state that is kept' },
  decl('z', call('sigmoid', affine(3, v('h'))), GRU),
  decl('r', call('sigmoid', affine(6, v('h'))), GRU),
  decl('ht', call('tanhExp', affine(9, mul(v('r'), v('h')))), GRU),
  set(
    'factor',
    add(v('z'), mul(mul(mul(sub(n(1), v('z')), sub(n(1), mul(v('ht'), v('ht')))), wAt(10)), v('r'))),
    GRU,
  ),
  set('h', add(mul(v('z'), v('h')), mul(sub(n(1), v('z')), v('ht'))), GRU),
];

const lstmBody: IRStmt[] = [
  { kind: 'comment', text: 'LSTM: the cell c is carried, f multiplies it' },
  decl('f', call('sigmoid', affine(12, v('h'))), LSTM),
  decl('i', call('sigmoid', affine(15, v('h'))), LSTM),
  decl('g', call('tanhExp', affine(18, v('h'))), LSTM),
  decl('o', call('sigmoid', affine(21, v('h'))), LSTM),
  set('c', add(mul(v('f'), v('c')), mul(v('i'), v('g'))), LSTM),
  set('h', mul(v('o'), call('tanhExp', v('c'))), LSTM),
  set('factor', v('f'), LSTM),
];

export const gatedCellsImperativeIR: IR = {
  id: 'gated-cells-imperative',
  algorithm: 'gatedCells',
  paradigm: 'imperative',
  functions: [
    {
      name: 'keptShare',
      params: [
        { name: 'cell', type: I },
        { name: 'xs', type: LD },
        { name: 'n', type: I },
        { name: 'w', type: LD },
      ],
      returnType: D,
      body: [
        { kind: 'var', name: 'h', type: D, init: n(0) },
        { kind: 'var', name: 'c', type: D, init: n(0) },
        { kind: 'var', name: 'kept', type: D, init: n(1) },
        {
          kind: 'for-range',
          var: 's',
          from: n(0),
          to: v('n'),
          inclusive: false,
          body: [
            { kind: 'var', name: 'x', type: D, init: { kind: 'index', arr: v('xs'), idx: v('s') } },
            { kind: 'var', name: 'factor', type: D, init: n(0) },
            {
              kind: 'if',
              cond: { kind: 'binop', op: '==', l: v('cell'), r: n(0) },
              then: rnnBody,
              else: [
                {
                  kind: 'if',
                  cond: { kind: 'binop', op: '==', l: v('cell'), r: n(1) },
                  then: gruBody,
                  else: lstmBody,
                },
              ],
            },
            { kind: 'comment', text: 'from the second time step on, multiply what the carried state keeps' },
            {
              kind: 'if',
              cond: { kind: 'binop', op: '>=', l: v('s'), r: n(1) },
              then: [set('kept', mul(v('kept'), v('factor')), KEPT)],
              phase: KEPT,
            },
          ],
        },
        { kind: 'return', expr: v('kept'), phase: KEPT },
      ],
    },
    {
      name: 'sigmoid',
      params: [{ name: 'z', type: D }],
      returnType: D,
      body: [{ kind: 'return', expr: div(n(1), add(n(1), call('exp', { kind: 'unop', op: '-', x: v('z') }))) }],
    },
    {
      name: 'tanhExp',
      params: [{ name: 'a', type: D }],
      returnType: D,
      body: [
        { kind: 'var', name: 'e', type: D, init: call('exp', mul(n(-2), call('abs', v('a')))) },
        { kind: 'var', name: 'th', type: D, init: div(sub(n(1), v('e')), add(n(1), v('e'))) },
        {
          kind: 'if',
          cond: { kind: 'binop', op: '<', l: v('a'), r: n(0) },
          then: [{ kind: 'return', expr: { kind: 'unop', op: '-', x: v('th') } }],
        },
        { kind: 'return', expr: v('th') },
      ],
    },
  ],
};

export const gatedCellsIRs: IR[] = [gatedCellsImperativeIR];
