/**
 * LFU 캐시 IR — 창 안 세기 · 가장 적은 것 고르기 · 칸 찾기가 배열 · 반복 · 비교로 펴진다.
 *
 * 경로 문자열은 IR 에 들지 않는다 — 부르는 쪽이 처음 나온 차례로 번호를 붙여 `reqs` 로 건넨다.
 * 배열(`cache` · `lastUsed`)은 부르는 쪽이 길이만큼 만들어 넘긴다 (IR 은 배열을 짓지 않는다).
 * 진입 `lateHits` 는 뒤 판(`front` 이후, 0 부터 센 색인) 적중 수 = 화면의 `late-hits` 를 돌려준다.
 * 창이 음수면 −1 (TS 는 던진다). 모든 셈은 정수이고 중간값은 요청 수(60)를 넘지 않는다.
 *
 * phase: `hit` · `fill` · `evict` (algorithm.ts 와 같다).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '<' | '>' | '==' | '!=' | '>=', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const assign = (name: string, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target: v(name), expr } : { kind: 'assign', target: v(name), expr, phase };
const ret = (expr: IRExpr): IRStmt => ({ kind: 'return', expr });

const countInWindow = {
  name: 'countInWindow',
  params: [
    { name: 'reqs', type: INTS },
    { name: 'i', type: INT },
    { name: 'window', type: INT },
    { name: 'key', type: INT },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'window 0 counts from the first request' },
    { kind: 'var', name: 'start', type: INT, init: n(0) },
    {
      kind: 'if',
      cond: bin('>', v('window'), n(0)),
      then: [assign('start', call('max', n(0), bin('+', bin('-', v('i'), v('window')), n(1))))],
    },
    { kind: 'var', name: 'c', type: INT, init: n(0) },
    {
      kind: 'for-range',
      var: 'j',
      from: v('start'),
      to: v('i'),
      inclusive: true,
      body: [{ kind: 'if', cond: bin('==', at('reqs', v('j')), v('key')), then: [assign('c', bin('+', v('c'), n(1)))] }],
    },
    ret(v('c')),
  ],
} satisfies IR['functions'][number];

const findSlot = {
  name: 'findSlot',
  params: [
    { name: 'cache', type: INTS },
    { name: 'cap', type: INT },
    { name: 'key', type: INT },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'key -1 finds an empty slot' },
    {
      kind: 'for-range',
      var: 's',
      from: n(0),
      to: v('cap'),
      inclusive: false,
      body: [{ kind: 'if', cond: bin('==', at('cache', v('s')), v('key')), then: [ret(v('s'))] }],
    },
    ret(n(-1)),
  ],
} satisfies IR['functions'][number];

const pickVictim = {
  name: 'pickVictim',
  params: [
    { name: 'cache', type: INTS },
    { name: 'cap', type: INT },
    { name: 'reqs', type: INTS },
    { name: 'i', type: INT },
    { name: 'window', type: INT },
    { name: 'lastUsed', type: INTS },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'fewest uses in the window; on a tie, the oldest last use' },
    { kind: 'var', name: 'best', type: INT, init: n(-1) },
    { kind: 'var', name: 'bestCount', type: INT, init: n(0) },
    { kind: 'var', name: 'bestLast', type: INT, init: n(0) },
    {
      kind: 'for-range',
      var: 's',
      from: n(0),
      to: v('cap'),
      inclusive: false,
      body: [
        {
          kind: 'var',
          name: 'c',
          type: INT,
          init: call('countInWindow', v('reqs'), v('i'), v('window'), at('cache', v('s'))),
        },
        { kind: 'var', name: 'lu', type: INT, init: at('lastUsed', at('cache', v('s'))) },
        {
          kind: 'if',
          cond: bin('==', v('best'), n(-1)),
          then: [assign('best', v('s')), assign('bestCount', v('c')), assign('bestLast', v('lu'))],
          else: [
            {
              kind: 'if',
              cond: bin('<', v('c'), v('bestCount')),
              then: [assign('best', v('s')), assign('bestCount', v('c')), assign('bestLast', v('lu'))],
              else: [
                {
                  kind: 'if',
                  cond: bin('==', v('c'), v('bestCount')),
                  then: [
                    {
                      kind: 'if',
                      cond: bin('<', v('lu'), v('bestLast')),
                      then: [assign('best', v('s')), assign('bestCount', v('c')), assign('bestLast', v('lu'))],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    ret(v('best')),
  ],
} satisfies IR['functions'][number];

const lateHits = {
  name: 'lateHits',
  params: [
    { name: 'reqs', type: INTS },
    { name: 'window', type: INT },
    { name: 'front', type: INT },
    { name: 'cap', type: INT },
    { name: 'cache', type: INTS },
    { name: 'lastUsed', type: INTS },
  ],
  returnType: INT,
  body: [
    { kind: 'if', cond: bin('<', v('window'), n(0)), then: [ret(n(-1))] },
    {
      kind: 'for-range',
      var: 's',
      from: n(0),
      to: v('cap'),
      inclusive: false,
      body: [{ kind: 'assign', target: at('cache', v('s')), expr: n(-1) }],
    },
    {
      kind: 'for-range',
      var: 'k',
      from: n(0),
      to: { kind: 'len', of: v('lastUsed') },
      inclusive: false,
      body: [{ kind: 'assign', target: at('lastUsed', v('k')), expr: n(-1) }],
    },
    { kind: 'var', name: 'hits', type: INT, init: n(0) },
    {
      kind: 'for-range',
      var: 'i',
      from: n(0),
      to: { kind: 'len', of: v('reqs') },
      inclusive: false,
      body: [
        { kind: 'var', name: 'key', type: INT, init: at('reqs', v('i')) },
        { kind: 'var', name: 'slot', type: INT, init: call('findSlot', v('cache'), v('cap'), v('key')) },
        {
          kind: 'if',
          cond: bin('!=', v('slot'), n(-1)),
          then: [
            {
              kind: 'if',
              cond: bin('>=', v('i'), v('front')),
              then: [assign('hits', bin('+', v('hits'), n(1)))],
              phase: 'hit',
            },
          ],
          else: [
            { kind: 'var', name: 'empty', type: INT, init: call('findSlot', v('cache'), v('cap'), n(-1)) },
            {
              kind: 'if',
              cond: bin('!=', v('empty'), n(-1)),
              then: [{ kind: 'assign', target: at('cache', v('empty')), expr: v('key'), phase: 'fill' }],
              else: [
                {
                  kind: 'var',
                  name: 'victim',
                  type: INT,
                  init: call('pickVictim', v('cache'), v('cap'), v('reqs'), v('i'), v('window'), v('lastUsed')),
                },
                { kind: 'assign', target: at('cache', v('victim')), expr: v('key'), phase: 'evict' },
              ],
            },
          ],
        },
        { kind: 'assign', target: at('lastUsed', v('key')), expr: v('i') },
      ],
    },
    ret(v('hits')),
  ],
} satisfies IR['functions'][number];

export const lfuCacheImperativeIR: IR = {
  id: 'lfu-cache-imperative',
  algorithm: 'lfuCache',
  paradigm: 'imperative',
  functions: [lateHits, findSlot, pickVictim, countInWindow],
};

export const lfuCacheIRs: IR[] = [lfuCacheImperativeIR];
