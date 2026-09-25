/**
 * allocate-and-free 의 코드 패널 — 할당기만 IR 로 둔다.
 *
 * 여섯 언어가 같은 뜻인 것은 할당기다. 화면의 프로그램(make · 반복 · 쓰기)은 IR 에 넣지 않는다 — 쓰기는
 * 할당기 셈 밖이고, 프로그램을 옮기면 `free` 가 없는 언어 넷에서 코드 패널이 거짓말을 한다.
 *
 * 버퍼는 부르는 쪽이 사다리 끝값의 길이로 만든다 — sizes 18 (힙 칸 최대, 안 함 · 4) · freeAddr · freeSize 5
 * (목록 최대, 두 번 · 4) · state [100, 0, 100]. 수는 모두 120 이하, 음수 나눗셈 · `&&` 없음.
 *
 * phase — `fresh` · `reuse` · `release`. algorithm.ts 와 정확히 같다.
 * 이름 — `free` · `new` · `next` 를 피해 `release` · `freeAddr` · `freeSize` 로 둔다 (C++ 의 `free` 와 부딪힌다).
 */
import type { IR, IRExpr, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST: IRType = { kind: 'list', of: INT };
const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '<' | '>=' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });

const PARAMS = [
  { name: 'state', type: LIST },
  { name: 'sizes', type: LIST },
  { name: 'freeAddr', type: LIST },
  { name: 'freeSize', type: LIST },
];

export const allocateAndFreeImperativeIR: IR = {
  id: 'allocate-and-free-imperative',
  algorithm: 'allocateAndFree',
  paradigm: 'imperative',
  functions: [
    {
      name: 'allocate',
      params: [...PARAMS, { name: 'size', type: INT }],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'state[0] = new-land end, state[1] = free-list length, state[2] = heap base' },
        { kind: 'comment', text: 'the front of the free list (most recent) is index state[1] - 1' },
        { kind: 'var', name: 'found', type: INT, init: n(-1) },
        { kind: 'var', name: 'addr', type: INT, init: n(0) },
        { kind: 'var', name: 'k', type: INT, init: bin('-', at('state', n(1)), n(1)) },
        {
          kind: 'while',
          cond: bin('>=', v('k'), n(0)),
          body: [
            {
              kind: 'if',
              cond: bin('==', at('freeSize', v('k')), v('size')),
              then: [{ kind: 'assign', target: v('found'), expr: v('k') }, { kind: 'break' }],
            },
            { kind: 'assign', target: v('k'), expr: bin('-', v('k'), n(1)) },
          ],
        },
        {
          kind: 'if',
          cond: bin('>=', v('found'), n(0)),
          then: [
            { kind: 'comment', text: 'take the first block of this size from the front of the list' },
            { kind: 'assign', target: v('addr'), expr: at('freeAddr', v('found')), phase: 'reuse' },
            { kind: 'var', name: 'j', type: INT, init: v('found') },
            {
              kind: 'while',
              cond: bin('<', v('j'), bin('-', at('state', n(1)), n(1))),
              body: [
                { kind: 'assign', target: at('freeAddr', v('j')), expr: at('freeAddr', bin('+', v('j'), n(1))) },
                { kind: 'assign', target: at('freeSize', v('j')), expr: at('freeSize', bin('+', v('j'), n(1))) },
                { kind: 'assign', target: v('j'), expr: bin('+', v('j'), n(1)) },
              ],
            },
            { kind: 'assign', target: at('state', n(1)), expr: bin('-', at('state', n(1)), n(1)) },
            { kind: 'return', expr: v('addr') },
          ],
        },
        { kind: 'comment', text: 'nothing on the list fits: cut size cells off the new land' },
        { kind: 'assign', target: v('addr'), expr: at('state', n(0)), phase: 'fresh' },
        { kind: 'assign', target: at('sizes', bin('-', v('addr'), at('state', n(2)))), expr: v('size') },
        { kind: 'assign', target: at('state', n(0)), expr: bin('+', at('state', n(0)), v('size')) },
        { kind: 'return', expr: v('addr') },
      ],
    },
    {
      name: 'release',
      params: [...PARAMS, { name: 'addr', type: INT }],
      returnType: { kind: 'void' },
      body: [
        { kind: 'comment', text: 'put the block at the front of the list' },
        { kind: 'assign', target: at('freeAddr', at('state', n(1))), expr: v('addr'), phase: 'release' },
        {
          kind: 'assign',
          target: at('freeSize', at('state', n(1))),
          expr: at('sizes', bin('-', v('addr'), at('state', n(2)))),
        },
        { kind: 'assign', target: at('state', n(1)), expr: bin('+', at('state', n(1)), n(1)) },
        { kind: 'comment', text: 'no check: a block already on the list goes on again' },
      ],
    },
  ],
};

export const allocateAndFreeIRs: IR[] = [allocateAndFreeImperativeIR];
