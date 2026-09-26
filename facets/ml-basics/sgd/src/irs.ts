/**
 * sgd 의 코드 패널 IR — 두 함수 (첫 함수가 진입점).
 *
 *   sgdEpochs(xs, ys, order, B, eta, wb, tally) → void
 *     wb = [w, b] 를 고쳐 쓰고 tally[0] = 갱신 수 · tally[1] = 거꾸로 간 갱신 수 (전체 기울기와의 내적 < 0).
 *   fullLoss(xs, ys, wb) → double — 점 전체 평균 (ŷ − y)²
 *
 * 비낌 각(도)은 atan2 가 IR 수학 어휘에 없어 IR 이 셈하지 않는다 — 부호(내적 < 0 = 90° 넘음)만 센다.
 * 화면의 각은 algorithm 이 같은 두 기울기에서 셈한다. IR 과 화면이 같은 자리: 갱신 수 · 거꾸로 수 · (w, b) · 끝 손실.
 * 갱신마다 전체 기울기를 다시 세는 것은 받아들인다 (거꾸로 간 갱신을 코드가 센다).
 *
 * phase: sgd-epoch · sgd-update · sgd-back · sgd-loss (algorithm.ts 와 같다).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DBL: IRType = { kind: 'double' };
const VOID: IRType = { kind: 'void' };
const DLIST: IRType = { kind: 'list', of: DBL };
const ILIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const add = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '+', l, r });
const sub = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '-', l, r });
const mul = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '*', l, r });
const div = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '/', l, r });
const idiv = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '//', l, r });
const len = (name: string): IRExpr => ({ kind: 'len', of: v(name) });

const set = (name: string, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target: v(name), expr, phase } : { kind: 'assign', target: v(name), expr };
const setAt = (arr: string, idx: number, expr: IRExpr, phase: string): IRStmt =>
  ({ kind: 'assign', target: at(arr, lit(idx)), expr, phase });
const decl = (name: string, type: IRType, init: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'var', name, type, init, phase } : { kind: 'var', name, type, init };

/** r = wb[0]·xs[i] + wb[1] − ys[i] */
const residual = (phase: string): IRStmt =>
  decl('r', DBL, sub(add(mul(at('wb', lit(0)), at('xs', v('i'))), at('wb', lit(1))), at('ys', v('i'))), phase);

const UP = 'sgd-update';

const sgdEpochs: IR['functions'][number] = {
  name: 'sgdEpochs',
  params: [
    { name: 'xs', type: DLIST },
    { name: 'ys', type: DLIST },
    { name: 'order', type: ILIST },
    { name: 'B', type: INT },
    { name: 'eta', type: DBL },
    { name: 'wb', type: DLIST },
    { name: 'tally', type: ILIST },
  ],
  returnType: VOID,
  body: [
    decl('n', INT, len('xs')),
    decl('epochs', INT, idiv(len('order'), v('n'))),
    {
      kind: 'for-range', var: 'e', from: lit(0), to: v('epochs'), inclusive: false, phase: 'sgd-epoch',
      body: [
        {
          kind: 'for-range', var: 'k', from: lit(0), to: idiv(v('n'), v('B')), inclusive: false, phase: UP,
          body: [
            { kind: 'comment', text: 'gradient of this batch, at the point before the update' },
            decl('gw', DBL, lit(0), UP),
            decl('gb', DBL, lit(0), UP),
            {
              kind: 'for-range', var: 'j', from: lit(0), to: v('B'), inclusive: false, phase: UP,
              body: [
                decl('i', INT, at('order', add(add(mul(v('e'), v('n')), mul(v('k'), v('B'))), v('j'))), UP),
                residual(UP),
                set('gw', add(v('gw'), mul(mul(lit(2), v('r')), at('xs', v('i')))), UP),
                set('gb', add(v('gb'), mul(lit(2), v('r'))), UP),
              ],
            },
            set('gw', div(v('gw'), v('B')), UP),
            set('gb', div(v('gb'), v('B')), UP),
            { kind: 'comment', text: 'gradient over all points, at the same place' },
            decl('Gw', DBL, lit(0), UP),
            decl('Gb', DBL, lit(0), UP),
            {
              kind: 'for-range', var: 'i', from: lit(0), to: v('n'), inclusive: false, phase: UP,
              body: [
                residual(UP),
                set('Gw', add(v('Gw'), mul(mul(lit(2), v('r')), at('xs', v('i')))), UP),
                set('Gb', add(v('Gb'), mul(lit(2), v('r'))), UP),
              ],
            },
            set('Gw', div(v('Gw'), v('n')), UP),
            set('Gb', div(v('Gb'), v('n')), UP),
            { kind: 'comment', text: 'skew past 90 degrees: this batch pulled against the full downhill' },
            {
              kind: 'if',
              cond: { kind: 'binop', op: '<', l: add(mul(v('Gw'), v('gw')), mul(v('Gb'), v('gb'))), r: lit(0) },
              then: [setAt('tally', 1, add(at('tally', lit(1)), lit(1)), 'sgd-back')],
              phase: 'sgd-back',
            },
            setAt('wb', 0, sub(at('wb', lit(0)), mul(v('eta'), v('gw'))), UP),
            setAt('wb', 1, sub(at('wb', lit(1)), mul(v('eta'), v('gb'))), UP),
            setAt('tally', 0, add(at('tally', lit(0)), lit(1)), UP),
          ],
        },
      ],
    },
  ],
};

const fullLoss: IR['functions'][number] = {
  name: 'fullLoss',
  params: [
    { name: 'xs', type: DLIST },
    { name: 'ys', type: DLIST },
    { name: 'wb', type: DLIST },
  ],
  returnType: DBL,
  body: [
    decl('s', DBL, lit(0), 'sgd-loss'),
    {
      kind: 'for-range', var: 'i', from: lit(0), to: len('xs'), inclusive: false, phase: 'sgd-loss',
      body: [
        residual('sgd-loss'),
        set('s', add(v('s'), mul(v('r'), v('r'))), 'sgd-loss'),
      ],
    },
    { kind: 'return', expr: div(v('s'), len('xs')), phase: 'sgd-loss' },
  ],
};

export const sgdImperativeIR: IR = {
  id: 'sgd-imperative',
  algorithm: 'sgd',
  paradigm: 'imperative',
  functions: [sgdEpochs, fullLoss],
};

export const sgdIRs: IR[] = [sgdImperativeIR];
