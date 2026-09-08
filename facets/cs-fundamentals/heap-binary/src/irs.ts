/**
 * heap-binary 학습용 IR — 넣기(sift-up)와 빼기(sift-down) 두 함수.
 *
 * phase 어휘는 `algorithm.ts` 의 `emit('phase', …)` 와 **글자 단위로** 같아야
 * 한다 (C3):
 *
 *   'append' | 'compare-parent' | 'swap-up' | 'settle-up' |
 *   'take-top' | 'compare-children' | 'swap-down' | 'settle-down'
 *
 * 힙을 배열 그대로 다룬다 — `heap[i]` 와 `len(heap)`. 이름 붙인 call 뒤로
 * 숨기지 않는 것이 요점이다. `(i - 1) / 2` 와 `2 * i + 1` 이 이 자료구조의
 * 전부라, 그것을 `parent(i)` 로 감싸면 코드 패널이 할 말을 잃는다.
 *
 * 끝자리 붙이기·떼기만 call 로 둔다 (`list_push` · `list_pop`) — 언어마다
 * 이름이 다르고(append/push_back/add) IR 에 그 어휘가 없다.
 */

import type { IR, IRExpr, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tIntList: IRType = { kind: 'list', of: tInt };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** ⌊(i − 1) / 2⌋ — 부모 자리. */
const parentOf = (i: IRExpr): IRExpr => bin('//', bin('-', i, lit(1)), lit(2));
/** 2i + 1 — 왼쪽 자식 자리. */
const leftOf = (i: IRExpr): IRExpr => bin('+', bin('*', lit(2), i), lit(1));
/** 2i + 2 — 오른쪽 자식 자리. */
const rightOf = (i: IRExpr): IRExpr => bin('+', bin('*', lit(2), i), lit(2));

export const heapSiftIR: IR = {
  id: 'heap-sift',
  algorithm: 'heapBinary',
  paradigm: 'imperative',
  functions: [
    {
      name: 'heap_insert',
      params: [
        { name: 'heap', type: tIntList },
        { name: 'value', type: tInt },
      ],
      returnType: { kind: 'void' },
      body: [
        {
          kind: 'expr-stmt',
          phase: 'append',
          expr: call('list_push', [v('heap'), v('value')]),
        },
        { kind: 'var', name: 'i', type: tInt, init: bin('-', len(v('heap')), lit(1)) },
        {
          kind: 'while',
          cond: bin('>', v('i'), lit(0)),
          body: [
            { kind: 'var', name: 'p', type: tInt, init: parentOf(v('i')) },
            {
              kind: 'if',
              phase: 'compare-parent',
              cond: bin('>=', idx(v('heap'), v('i')), idx(v('heap'), v('p'))),
              then: [{ kind: 'break' }],
            },
            {
              kind: 'swap',
              phase: 'swap-up',
              a: idx(v('heap'), v('i')),
              b: idx(v('heap'), v('p')),
            },
            { kind: 'assign', target: v('i'), expr: v('p') },
          ],
        },
        { kind: 'return', phase: 'settle-up' },
      ],
    },
    {
      name: 'heap_extract',
      params: [{ name: 'heap', type: tIntList }],
      returnType: tInt,
      body: [
        { kind: 'var', name: 'top', type: tInt, init: idx(v('heap'), lit(0)) },
        { kind: 'var', name: 'last', type: tInt, init: call('list_pop', [v('heap')]) },
        {
          kind: 'if',
          phase: 'take-top',
          cond: bin('==', len(v('heap')), lit(0)),
          then: [{ kind: 'return', expr: v('top') }],
        },
        { kind: 'assign', target: idx(v('heap'), lit(0)), expr: v('last') },
        { kind: 'var', name: 'i', type: tInt, init: lit(0) },
        {
          kind: 'while',
          cond: bin('<', leftOf(v('i')), len(v('heap'))),
          body: [
            { kind: 'var', name: 'ahead', type: tInt, init: leftOf(v('i')) },
            { kind: 'var', name: 'r', type: tInt, init: rightOf(v('i')) },
            {
              kind: 'if',
              phase: 'compare-children',
              cond: bin(
                '&&',
                bin('<', v('r'), len(v('heap'))),
                bin('<', idx(v('heap'), v('r')), idx(v('heap'), v('ahead'))),
              ),
              then: [{ kind: 'assign', target: v('ahead'), expr: v('r') }],
            },
            {
              kind: 'if',
              phase: 'compare-children',
              cond: bin('<=', idx(v('heap'), v('i')), idx(v('heap'), v('ahead'))),
              then: [{ kind: 'break' }],
            },
            {
              kind: 'swap',
              phase: 'swap-down',
              a: idx(v('heap'), v('i')),
              b: idx(v('heap'), v('ahead')),
            },
            { kind: 'assign', target: v('i'), expr: v('ahead') },
          ],
        },
        { kind: 'return', phase: 'settle-down', expr: v('top') },
      ],
    },
  ],
};

export const heapBinaryIRs: IR[] = [heapSiftIR];
