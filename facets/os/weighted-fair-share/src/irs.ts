/**
 * weighted-fair-share IR — 틱마다 가상 시간이 가장 작은 것을 돌린다.
 *
 * 부르는 쪽이 배열을 만들어 넘긴다 (IR 은 배열을 만들 수 없다):
 *   weight  = [1, B 의 무게, 1] · vr = [0, 0, 0] · lastRan = [-1, -1, -1]
 *   present = [1, 1, 0] · ran = [0, 0, 0]
 * 답은 B 가 받은 틱. 돌린 뒤의 ran · vr 은 화면의 계기 · 판 끝 가상 시간과 같다.
 *
 * phase 어휘 (algorithm.ts 와 같다): arrive · share · tick
 * 짧은 회로가 없는 `||` · `&&` — `low < 0 || vr[i] < low` 는 색인이 i 뿐이라 안전하고,
 * 동률 비교는 best >= 0 인 else 가지 안에만 둔다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '-' | '//' | '<' | '==' | '&&' | '||', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: o, l, r });
const lenOf = (arr: string): IRExpr => ({ kind: 'len', of: v(arr) });

/** 와 있는 것 가운데 가장 작은 가상 시간 — 늦게 온 것의 출발점 (cStart 1). */
const findLow: IRStmt[] = [
  { kind: 'var', name: 'low', type: INT, init: n(-1), phase: 'arrive' },
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: lenOf('vr'),
    inclusive: false,
    phase: 'arrive',
    body: [
      {
        kind: 'if',
        cond: op('==', at('present', v('i')), n(1)),
        phase: 'arrive',
        then: [
          {
            kind: 'if',
            cond: op('||', op('<', v('low'), n(0)), op('<', at('vr', v('i')), v('low'))),
            phase: 'arrive',
            then: [{ kind: 'assign', target: v('low'), expr: at('vr', v('i')), phase: 'arrive' }],
          },
        ],
      },
    ],
  },
  { kind: 'assign', target: at('vr', v('late')), expr: v('low'), phase: 'arrive' },
];

const arrive: IRStmt = {
  kind: 'if',
  cond: op('==', v('tick'), v('arriveAt')),
  phase: 'arrive',
  then: [
    { kind: 'comment', text: 'the late one joins: at zero, or at the lowest virtual time present' },
    {
      kind: 'if',
      cond: op('==', v('fromMin'), n(1)),
      phase: 'arrive',
      then: findLow,
      else: [{ kind: 'assign', target: at('vr', v('late')), expr: n(0), phase: 'arrive' }],
    },
    { kind: 'assign', target: at('present', v('late')), expr: n(1), phase: 'arrive' },
  ],
};

const pick: IRStmt[] = [
  { kind: 'comment', text: 'pick the lowest virtual time; on a tie, the one that ran longest ago, then list order' },
  { kind: 'var', name: 'best', type: INT, init: n(-1), phase: 'tick' },
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: lenOf('vr'),
    inclusive: false,
    phase: 'tick',
    body: [
      {
        kind: 'if',
        cond: op('==', at('present', v('i')), n(1)),
        phase: 'tick',
        then: [
          {
            kind: 'if',
            cond: op('<', v('best'), n(0)),
            then: [{ kind: 'assign', target: v('best'), expr: v('i') }],
            else: [
              {
                kind: 'if',
                cond: op(
                  '||',
                  op('<', at('vr', v('i')), at('vr', v('best'))),
                  op(
                    '&&',
                    op('==', at('vr', v('i')), at('vr', v('best'))),
                    op('<', at('lastRan', v('i')), at('lastRan', v('best'))),
                  ),
                ),
                phase: 'tick',
                then: [{ kind: 'assign', target: v('best'), expr: v('i'), phase: 'tick' }],
              },
            ],
          },
        ],
      },
    ],
  },
  { kind: 'comment', text: 'run one tick: virtual time rises by unit / weight' },
  {
    kind: 'assign',
    target: at('vr', v('best')),
    expr: op('+', at('vr', v('best')), op('//', v('unit'), at('weight', v('best')))),
    phase: 'tick',
  },
  { kind: 'assign', target: at('lastRan', v('best')), expr: v('tick'), phase: 'tick' },
  { kind: 'assign', target: at('ran', v('best')), expr: op('+', at('ran', v('best')), n(1)), phase: 'tick' },
];

export const weightedFairShareImperativeIR: IR = {
  id: 'weighted-fair-share-imperative',
  algorithm: 'weightedFairShare',
  paradigm: 'imperative',
  functions: [
    {
      name: 'fairShare',
      params: [
        { name: 'fromMin', type: INT },
        { name: 'weight', type: INTS },
        { name: 'vr', type: INTS },
        { name: 'lastRan', type: INTS },
        { name: 'present', type: INTS },
        { name: 'ran', type: INTS },
        { name: 'ticks', type: INT },
        { name: 'arriveAt', type: INT },
        { name: 'unit', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'late', type: INT, init: op('-', lenOf('vr'), n(1)), phase: 'tick' },
        {
          kind: 'for-range',
          var: 'tick',
          from: n(0),
          to: v('ticks'),
          inclusive: false,
          phase: 'tick',
          body: [arrive, ...pick],
        },
        { kind: 'comment', text: 'ticks the second one (B) received' },
        { kind: 'return', expr: at('ran', n(1)), phase: 'share' },
      ],
    },
  ],
};

export const weightedFairShareIRs: IR[] = [weightedFairShareImperativeIR];
