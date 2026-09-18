/**
 * data-hazard 코드 패널 IR.
 *
 * 레지스터는 번호(정수), 적재 여부는 0/1, 대처는 0 none · 1 wait · 2 forward 로 받는다.
 * IR 은 배열을 만들 수 없으므로 EX 박자를 담을 버퍼 `ex` 를 부르는 쪽이 길이 n 으로
 * 만들어 건넨다. 실행 순서(순서 바꿈)도 부르는 쪽이 배열을 재배치해 건넨다.
 *
 *   countCycles(dst, srcA, srcB, isLoad, rule, ex)  박자 = 마지막 EX + 2
 *   producerOf(dst, reg, before)                     앞선 것 중 가장 가까운 생산자 (없으면 −1)
 *   earliest(ex, isLoad, rule, p)                    생산자 p 가 거는 EX 하한
 *   countStaleReads(dst, srcA, srcB)                 none 일 때 옛 값을 읽은 원천 수
 *
 * srcB 가 없으면 −1 이다. ir-interpreter 의 `&&` 는 양쪽을 다 셈하므로 색인 읽기는
 * `if` 를 중첩해 막는다. 중간값 최대는 EX 13 (기다림의 마지막 명령어).
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const LIST_INT: IRType = { kind: 'list', of: INT };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '<' | '>' | '>=' | '==' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

/** 원천 하나(`src` 배열)의 생산자를 찾아 하한을 올린다. */
function raiseBy(src: string, p: string): IRStmt[] {
  return [
    { kind: 'var', name: p, type: INT, init: call('producerOf', v('dst'), at(src, v('i')), v('i')), phase: 'find-producer' },
    {
      kind: 'if',
      cond: bin('>=', v(p), lit(0)),
      then: [
        { kind: 'assign', target: v('e'), expr: call('max', v('e'), call('earliest', v('ex'), v('isLoad'), v('rule'), v(p))) },
      ],
    },
  ];
}

/** 원천 하나가 옛 값을 읽었는지 — none 에서 i 의 ID 는 i + 2, p 의 WB 는 p + 5. */
function staleBy(src: string, p: string): IRStmt[] {
  return [
    { kind: 'var', name: p, type: INT, init: call('producerOf', v('dst'), at(src, v('i')), v('i')), phase: 'find-producer' },
    {
      kind: 'if',
      cond: bin('>=', v(p), lit(0)),
      then: [
        {
          kind: 'if',
          cond: bin('<', bin('+', v('i'), lit(2)), bin('+', v(p), lit(5))),
          then: [{ kind: 'assign', target: v('stale'), expr: bin('+', v('stale'), lit(1)), phase: 'stale-read' }],
          phase: 'stale-read',
        },
      ],
    },
  ];
}

export const dataHazardImperativeIR: IR = {
  id: 'data-hazard-imperative',
  algorithm: 'dataHazard',
  paradigm: 'imperative',
  functions: [
    {
      name: 'countCycles',
      params: [
        { name: 'dst', type: LIST_INT },
        { name: 'srcA', type: LIST_INT },
        { name: 'srcB', type: LIST_INT },
        { name: 'isLoad', type: LIST_INT },
        { name: 'rule', type: INT },
        { name: 'ex', type: LIST_INT },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'n', type: INT, init: { kind: 'len', of: v('dst') } },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            { kind: 'comment', text: 'in order: one cycle after the previous EX' },
            { kind: 'var', name: 'e', type: INT, init: lit(3), phase: 'issue' },
            {
              kind: 'if',
              cond: bin('>', v('i'), lit(0)),
              then: [{ kind: 'assign', target: v('e'), expr: bin('+', at('ex', bin('-', v('i'), lit(1))), lit(1)), phase: 'issue' }],
            },
            {
              kind: 'if',
              cond: bin('!=', v('rule'), lit(0)),
              then: [
                ...raiseBy('srcA', 'pa'),
                {
                  kind: 'if',
                  cond: bin('>=', at('srcB', v('i')), lit(0)),
                  then: raiseBy('srcB', 'pb'),
                },
              ],
            },
            { kind: 'assign', target: at('ex', v('i')), expr: v('e'), phase: 'issue' },
          ],
        },
        { kind: 'return', expr: bin('+', at('ex', bin('-', v('n'), lit(1))), lit(2)), phase: 'finish' },
      ],
    },
    {
      name: 'producerOf',
      params: [
        { name: 'dst', type: LIST_INT },
        { name: 'reg', type: INT },
        { name: 'before', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'p', type: INT, init: lit(-1), phase: 'find-producer' },
        {
          kind: 'for-range',
          var: 'j',
          from: lit(0),
          to: v('before'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: bin('==', at('dst', v('j')), v('reg')),
              then: [{ kind: 'assign', target: v('p'), expr: v('j'), phase: 'find-producer' }],
            },
          ],
        },
        { kind: 'return', expr: v('p') },
      ],
    },
    {
      name: 'earliest',
      params: [
        { name: 'ex', type: LIST_INT },
        { name: 'isLoad', type: LIST_INT },
        { name: 'rule', type: INT },
        { name: 'p', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'wait: read the register file in the WB cycle, EX one later' },
        {
          kind: 'if',
          cond: bin('==', v('rule'), lit(1)),
          then: [{ kind: 'return', expr: bin('+', at('ex', v('p')), lit(3)), phase: 'wait' }],
        },
        { kind: 'comment', text: 'forward: a load has its value only after MEM' },
        {
          kind: 'if',
          cond: bin('==', at('isLoad', v('p')), lit(1)),
          then: [{ kind: 'return', expr: bin('+', at('ex', v('p')), lit(2)), phase: 'forward' }],
        },
        { kind: 'return', expr: bin('+', at('ex', v('p')), lit(1)), phase: 'forward' },
      ],
    },
    {
      name: 'countStaleReads',
      params: [
        { name: 'dst', type: LIST_INT },
        { name: 'srcA', type: LIST_INT },
        { name: 'srcB', type: LIST_INT },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'stale', type: INT, init: lit(0) },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: { kind: 'len', of: v('dst') },
          inclusive: false,
          body: [
            ...staleBy('srcA', 'pa'),
            {
              kind: 'if',
              cond: bin('>=', at('srcB', v('i')), lit(0)),
              then: staleBy('srcB', 'pb'),
            },
          ],
        },
        { kind: 'return', expr: v('stale'), phase: 'finish' },
      ],
    },
  ],
};

export const dataHazardIRs: IR[] = [dataHazardImperativeIR];
