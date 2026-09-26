/**
 * sharding IR — 새 줄을 샤드로 보내고, 범위 질의가 연 샤드를 세고, 가장 바쁜 샤드 몫을 셈한다.
 *
 * 함수 셋 (첫 함수가 진입점):
 *   routeAll(mode, shards, oldMax, count, recent, load, hit) → int
 *     새 줄(oldMax + 1 부터 count 개)마다 shardOf 로 load[s] += 1,
 *     범위 질의(가장 최근 recent 개)의 번호마다 hit[s] 가 0 이면 1 로 하고 연 수를 센다.
 *     돌려주는 값 = 범위 질의가 연 샤드 수. load · hit 는 부르는 쪽이 샤드 수만큼 0 으로 만든다
 *     (IR 함수는 배열을 만들 수 없다).
 *   shardOf(mode, shards, width, key) → int
 *     해시(mode 0): key % shards · 구간(mode 1): min(shards − 1, (key − 1) // width)
 *   busiestShare(load, count) → int
 *     가장 많은 쓰기를 max 로 찾고 반올림 백분율 (top * 100 + count // 2) // count
 *
 * phase 어휘 (algorithm.ts 와 정확히 같다): route · query · share
 *
 * `//` · `%` 의 피연산자는 모두 음수가 아니다 (key ≥ 1, shards ≥ 1, width ≥ 1).
 * 중간값 최대 top * 100 = 1200, key 최대 oldMax + count = 1012 — 32 비트와 멀다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '%' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

const shardOfCall = (key: IRExpr): IRExpr => call('shardOf', v('mode'), v('shards'), v('width'), key);

const routeAllBody: IRStmt[] = [
  { kind: 'comment', text: 'width of one range shard (the last range has no end)' },
  { kind: 'var', name: 'width', type: INT, init: bin('//', v('oldMax'), v('shards')), phase: 'route' },
  { kind: 'comment', text: 'each new row goes to its shard' },
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: v('count'),
    inclusive: false,
    phase: 'route',
    body: [
      { kind: 'var', name: 's', type: INT, init: shardOfCall(bin('+', bin('+', v('oldMax'), n(1)), v('i'))), phase: 'route' },
      { kind: 'assign', target: at('load', v('s')), expr: bin('+', at('load', v('s')), n(1)), phase: 'route' },
    ],
  },
  { kind: 'comment', text: 'range query: the most recent rows' },
  {
    kind: 'var',
    name: 'lo',
    type: INT,
    init: bin('+', bin('-', bin('+', v('oldMax'), v('count')), v('recent')), n(1)),
    phase: 'query',
  },
  { kind: 'var', name: 'touched', type: INT, init: n(0), phase: 'query' },
  {
    kind: 'for-range',
    var: 'k',
    from: v('lo'),
    to: bin('+', v('oldMax'), v('count')),
    inclusive: true,
    phase: 'query',
    body: [
      { kind: 'var', name: 's', type: INT, init: shardOfCall(v('k')), phase: 'query' },
      {
        kind: 'if',
        cond: bin('==', at('hit', v('s')), n(0)),
        phase: 'query',
        then: [
          { kind: 'assign', target: at('hit', v('s')), expr: n(1), phase: 'query' },
          { kind: 'assign', target: v('touched'), expr: bin('+', v('touched'), n(1)), phase: 'query' },
        ],
      },
    ],
  },
  { kind: 'return', expr: v('touched'), phase: 'query' },
];

const shardOfBody: IRStmt[] = [
  {
    kind: 'if',
    cond: bin('==', v('mode'), n(0)),
    phase: 'route',
    then: [
      { kind: 'comment', text: 'hash: key mod shard count' },
      { kind: 'return', expr: bin('%', v('key'), v('shards')), phase: 'route' },
    ],
  },
  { kind: 'comment', text: 'range: equal slices of the old keys, last one open-ended' },
  {
    kind: 'return',
    expr: call('min', bin('-', v('shards'), n(1)), bin('//', bin('-', v('key'), n(1)), v('width'))),
    phase: 'route',
  },
];

const busiestShareBody: IRStmt[] = [
  { kind: 'var', name: 'top', type: INT, init: n(0), phase: 'share' },
  {
    kind: 'for-range',
    var: 's',
    from: n(0),
    to: { kind: 'len', of: v('load') },
    inclusive: false,
    phase: 'share',
    body: [{ kind: 'assign', target: v('top'), expr: call('max', v('top'), at('load', v('s'))), phase: 'share' }],
  },
  { kind: 'comment', text: 'rounded percentage' },
  {
    kind: 'return',
    expr: bin('//', bin('+', bin('*', v('top'), n(100)), bin('//', v('count'), n(2))), v('count')),
    phase: 'share',
  },
];

export const shardingImperativeIR: IR = {
  id: 'sharding-imperative',
  algorithm: 'sharding',
  paradigm: 'imperative',
  functions: [
    {
      name: 'routeAll',
      params: [
        { name: 'mode', type: INT },
        { name: 'shards', type: INT },
        { name: 'oldMax', type: INT },
        { name: 'count', type: INT },
        { name: 'recent', type: INT },
        { name: 'load', type: INT_LIST },
        { name: 'hit', type: INT_LIST },
      ],
      returnType: INT,
      body: routeAllBody,
    },
    {
      name: 'shardOf',
      params: [
        { name: 'mode', type: INT },
        { name: 'shards', type: INT },
        { name: 'width', type: INT },
        { name: 'key', type: INT },
      ],
      returnType: INT,
      body: shardOfBody,
    },
    {
      name: 'busiestShare',
      params: [
        { name: 'load', type: INT_LIST },
        { name: 'count', type: INT },
      ],
      returnType: INT,
      body: busiestShareBody,
    },
  ],
};

export const shardingIRs: IR[] = [shardingImperativeIR];
