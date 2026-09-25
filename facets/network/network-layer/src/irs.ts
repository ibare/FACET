/**
 * networkLayer 의 IR — 끝 시각을 셈하는 코드.
 *
 * 진입 함수 `finishTime(at, ready, pieces, links, message, header)` → 끝 시각 (바이트 시간).
 * at · ready 는 부르는 쪽이 pieces 칸 0 으로 만들어 건넨다 (IR 은 배열을 만들 수 없다).
 * header 는 부르는 쪽이 층 목록에서 더한 머리 · 꼬리 합(58)이다.
 * 1000 틱 안에 끝나지 않으면 −1 (algorithm 은 같은 자리에서 던진다).
 *
 * phase 어휘: split · forward · finish (algorithm.ts 와 같다)
 * 중간값 최대: 끝 시각 6290 (L=5 · n=1). 32 비트 넘침 없음.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST_INT: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '<' | '==' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const idx = (arr: string, i: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx: i });

const hopTicksBody: IRStmt[] = [
  { kind: 'comment', text: 'one tick = one piece fully sent over one link' },
  { kind: 'var', name: 't', type: INT, init: n(0) },
  { kind: 'var', name: 'arrived', type: INT, init: n(0) },
  {
    kind: 'while',
    cond: bin('&&', bin('<', v('arrived'), v('pieces')), bin('<', v('t'), n(1000))),
    body: [
      { kind: 'assign', target: v('t'), expr: bin('+', v('t'), n(1)) },
      { kind: 'comment', text: 'each node sends the lowest-numbered piece it holds in full' },
      {
        kind: 'for-range',
        var: 'node',
        from: n(0),
        to: v('links'),
        inclusive: false,
        body: [
          { kind: 'var', name: 'best', type: INT, init: n(-1) },
          {
            kind: 'for-range',
            var: 'p',
            from: n(0),
            to: v('pieces'),
            inclusive: false,
            body: [
              {
                kind: 'if',
                cond: bin(
                  '&&',
                  bin('&&', bin('==', v('best'), n(-1)), bin('==', idx('at', v('p')), v('node'))),
                  bin('<', idx('ready', v('p')), v('t')),
                ),
                then: [{ kind: 'assign', target: v('best'), expr: v('p') }],
              },
            ],
          },
          {
            kind: 'if',
            cond: { kind: 'binop', op: '!=', l: v('best'), r: n(-1) },
            then: [
              {
                kind: 'assign',
                target: idx('at', v('best')),
                expr: bin('+', idx('at', v('best')), n(1)),
                phase: 'forward',
              },
              { kind: 'comment', text: 'received this tick, so it can move on from the next tick' },
              { kind: 'assign', target: idx('ready', v('best')), expr: v('t') },
              {
                kind: 'if',
                cond: bin('==', idx('at', v('best')), v('links')),
                then: [{ kind: 'assign', target: v('arrived'), expr: bin('+', v('arrived'), n(1)) }],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    kind: 'if',
    cond: bin('<', v('arrived'), v('pieces')),
    then: [{ kind: 'return', expr: n(-1) }],
  },
  { kind: 'return', expr: v('t') },
];

export const networkLayerImperativeIR: IR = {
  id: 'network-layer-imperative',
  algorithm: 'networkLayer',
  paradigm: 'imperative',
  functions: [
    {
      name: 'finishTime',
      params: [
        { name: 'at', type: LIST_INT },
        { name: 'ready', type: LIST_INT },
        { name: 'pieces', type: INT },
        { name: 'links', type: INT },
        { name: 'message', type: INT },
        { name: 'header', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'every piece carries its own headers and trailer' },
        {
          kind: 'var',
          name: 'size',
          type: INT,
          init: bin('+', bin('//', v('message'), v('pieces')), v('header')),
          phase: 'split',
        },
        {
          kind: 'var',
          name: 'ticks',
          type: INT,
          init: { kind: 'call', fn: 'hopTicks', args: [v('at'), v('ready'), v('pieces'), v('links')] },
        },
        {
          kind: 'if',
          cond: bin('<', v('ticks'), n(0)),
          then: [{ kind: 'return', expr: n(-1) }],
        },
        { kind: 'return', expr: bin('*', v('ticks'), v('size')), phase: 'finish' },
      ],
    },
    {
      name: 'hopTicks',
      params: [
        { name: 'at', type: LIST_INT },
        { name: 'ready', type: LIST_INT },
        { name: 'pieces', type: INT },
        { name: 'links', type: INT },
      ],
      returnType: INT,
      body: hopTicksBody,
    },
  ],
};

export const networkLayerIRs: IR[] = [networkLayerImperativeIR];
