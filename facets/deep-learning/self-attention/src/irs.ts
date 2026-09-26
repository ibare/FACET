/**
 * self-attention IR — `multiHeadAttention` 이 화면과 같은 답(선 줄 수 · 무게 · 결과)을 낸다.
 *
 * IR 은 배열을 만들 수 없다 — 행렬과 x 는 행 차례로 편 목록으로 받고, q · k · v · raw · weights ·
 * result 는 부르는 쪽이 길이만큼 만들어 건넨다. 무게의 식 순서는 algorithm 과 같다:
 * exp((raw_j − rawMax) / √d_k) 를 j 차례로 더한 합으로 나눈다.
 *
 * phase 어휘 (algorithm.ts 와 같다): project · score · softmax · pick · mix
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const VOID: IRType = { kind: 'void' };
const INTS: IRType = { kind: 'list', of: INT };
const DOUBLES: IRType = { kind: 'list', of: DOUBLE };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const add = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '+', l, r });
const sub = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '-', l, r });
const mul = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '*', l, r });
const div = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '/', l, r });
const idx = (arr: string, i: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx: i });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const loop = (name: string, to: IRExpr, body: IRStmt[], phase?: string): IRStmt =>
  phase === undefined
    ? { kind: 'for-range', var: name, from: lit(0), to, inclusive: false, body }
    : { kind: 'for-range', var: name, from: lit(0), to, inclusive: false, body, phase };

/** 머리 h 의 줄 i 가 raw · weights 에서 시작하는 자리: (h·n + i)·n */
const rowBase = (): IRExpr => mul(add(mul(v('h'), v('n')), v('i')), v('n'));
/** 토큰 t 의 머리 h 칸 c: t·dm + h·dk + c */
const headCell = (t: string, c: string): IRExpr => add(add(mul(v(t), v('dm')), mul(v('h'), v('dk'))), v(c));

const project: IRStmt[] = [
  { kind: 'comment', text: 'dst = x * w, one row per token' },
  loop('i', v('n'), [
    loop('col', v('dm'), [
      { kind: 'var', name: 'total', type: INT, init: lit(0) },
      loop('r', v('dm'), [
        {
          kind: 'assign',
          target: v('total'),
          expr: add(v('total'), mul(idx('x', add(mul(v('i'), v('dm')), v('r'))), idx('w', add(mul(v('r'), v('dm')), v('col'))))),
        },
      ]),
      { kind: 'assign', target: idx('dst', add(mul(v('i'), v('dm')), v('col'))), expr: v('total') },
    ]),
  ]),
];

const softmaxRow: IRStmt[] = [
  { kind: 'comment', text: 'subtract the row max before exp, then divide by the sum' },
  { kind: 'var', name: 'm', type: INT, init: idx('raw', v('start')) },
  loop('j', v('n'), [{ kind: 'assign', target: v('m'), expr: call('max', [v('m'), idx('raw', add(v('start'), v('j')))]) }]),
  { kind: 'var', name: 'total', type: DOUBLE, init: lit(0) },
  loop('j', v('n'), [
    { kind: 'var', name: 'e', type: DOUBLE, init: call('exp', [div(sub(idx('raw', add(v('start'), v('j'))), v('m')), v('scale'))]) },
    { kind: 'assign', target: idx('weights', add(v('start'), v('j'))), expr: v('e') },
    { kind: 'assign', target: v('total'), expr: add(v('total'), v('e')) },
  ]),
  loop('j', v('n'), [
    {
      kind: 'assign',
      target: idx('weights', add(v('start'), v('j'))),
      expr: div(idx('weights', add(v('start'), v('j'))), v('total')),
    },
  ]),
];

const main: IRStmt[] = [
  { kind: 'comment', text: 'each head reads its own dk projection columns' },
  { kind: 'var', name: 'dk', type: INT, init: { kind: 'binop', op: '//', l: v('dm'), r: v('heads') } },
  { kind: 'expr-stmt', expr: call('project', [v('x'), v('wq'), v('q'), v('n'), v('dm')]), phase: 'project' },
  { kind: 'expr-stmt', expr: call('project', [v('x'), v('wk'), v('k'), v('n'), v('dm')]), phase: 'project' },
  { kind: 'expr-stmt', expr: call('project', [v('x'), v('wv'), v('v'), v('n'), v('dm')]), phase: 'project' },
  { kind: 'comment', text: 'integer q.k for every head, query and key' },
  loop('h', v('heads'), [
    loop('i', v('n'), [
      loop('j', v('n'), [
        { kind: 'var', name: 'dot', type: INT, init: lit(0), phase: 'score' },
        loop('c', v('dk'), [
          { kind: 'assign', target: v('dot'), expr: add(v('dot'), mul(idx('q', headCell('i', 'c')), idx('k', headCell('j', 'c')))), phase: 'score' },
        ], 'score'),
        { kind: 'assign', target: idx('raw', add(rowBase(), v('j'))), expr: v('dot'), phase: 'score' },
      ], 'score'),
    ], 'score'),
  ], 'score'),
  { kind: 'var', name: 'scale', type: DOUBLE, init: call('sqrt', [v('dk')]), phase: 'softmax' },
  loop('h', v('heads'), [
    loop('i', v('n'), [
      { kind: 'expr-stmt', expr: call('softmaxRow', [v('raw'), v('weights'), rowBase(), v('n'), v('scale')]), phase: 'softmax' },
    ], 'softmax'),
  ], 'softmax'),
  { kind: 'comment', text: 'a row stands alone when exactly one key holds the largest integer q.k' },
  { kind: 'var', name: 'clear', type: INT, init: lit(0), phase: 'pick' },
  loop('h', v('heads'), [
    loop('i', v('n'), [
      { kind: 'var', name: 'top', type: INT, init: idx('raw', rowBase()), phase: 'pick' },
      loop('j', v('n'), [
        { kind: 'assign', target: v('top'), expr: call('max', [v('top'), idx('raw', add(rowBase(), v('j')))]), phase: 'pick' },
      ], 'pick'),
      { kind: 'var', name: 'count', type: INT, init: lit(0), phase: 'pick' },
      loop('j', v('n'), [
        {
          kind: 'if',
          cond: { kind: 'binop', op: '==', l: idx('raw', add(rowBase(), v('j'))), r: v('top') },
          then: [{ kind: 'assign', target: v('count'), expr: add(v('count'), lit(1)), phase: 'pick' }],
          phase: 'pick',
        },
      ], 'pick'),
      {
        kind: 'if',
        cond: { kind: 'binop', op: '==', l: v('count'), r: lit(1) },
        then: [{ kind: 'assign', target: v('clear'), expr: add(v('clear'), lit(1)), phase: 'pick' }],
        phase: 'pick',
      },
    ], 'pick'),
  ], 'pick'),
  { kind: 'comment', text: 'result = weights * v per head, head results joined per token' },
  loop('h', v('heads'), [
    loop('i', v('n'), [
      loop('c', v('dk'), [
        { kind: 'var', name: 'acc', type: DOUBLE, init: lit(0), phase: 'mix' },
        loop('j', v('n'), [
          {
            kind: 'assign',
            target: v('acc'),
            expr: add(v('acc'), mul(idx('weights', add(rowBase(), v('j'))), idx('v', headCell('j', 'c')))),
            phase: 'mix',
          },
        ], 'mix'),
        { kind: 'assign', target: idx('result', headCell('i', 'c')), expr: v('acc'), phase: 'mix' },
      ], 'mix'),
    ], 'mix'),
  ], 'mix'),
  { kind: 'return', expr: v('clear'), phase: 'mix' },
];

export const selfAttentionImperativeIR: IR = {
  id: 'self-attention-imperative',
  algorithm: 'selfAttention',
  paradigm: 'imperative',
  functions: [
    {
      name: 'multiHeadAttention',
      params: [
        { name: 'x', type: INTS },
        { name: 'wq', type: INTS },
        { name: 'wk', type: INTS },
        { name: 'wv', type: INTS },
        { name: 'n', type: INT },
        { name: 'dm', type: INT },
        { name: 'heads', type: INT },
        { name: 'q', type: INTS },
        { name: 'k', type: INTS },
        { name: 'v', type: INTS },
        { name: 'raw', type: INTS },
        { name: 'weights', type: DOUBLES },
        { name: 'result', type: DOUBLES },
      ],
      returnType: INT,
      body: main,
    },
    {
      name: 'project',
      params: [
        { name: 'x', type: INTS },
        { name: 'w', type: INTS },
        { name: 'dst', type: INTS },
        { name: 'n', type: INT },
        { name: 'dm', type: INT },
      ],
      returnType: VOID,
      body: project,
    },
    {
      name: 'softmaxRow',
      params: [
        { name: 'raw', type: INTS },
        { name: 'weights', type: DOUBLES },
        { name: 'start', type: INT },
        { name: 'n', type: INT },
        { name: 'scale', type: DOUBLE },
      ],
      returnType: VOID,
      body: softmaxRow,
    },
  ],
};

export const selfAttentionIRs: IR[] = [selfAttentionImperativeIR];
