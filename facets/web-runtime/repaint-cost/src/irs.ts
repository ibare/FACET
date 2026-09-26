/**
 * repaint-cost 의 IR — "다시 칠할 집합을 정하는 겹침 판정"만 담는다.
 *
 * 파이프라인의 어느 단계가 도는지(style/layout/composite)는 셈이 아니라 있음/없음 표시라 IR 로
 * 옮길 거리가 없다. 이 facet 의 코드 패널이 보여야 할 것은 "더러워진 사각형과 각 요소의 사각형이
 * 겹치는가" 하나뿐이다 — `computeRepaint` 가 진입 함수이고, 사각형 겹침 판정 `overlap` 을 부른다.
 *
 * IR 은 배열을 짓지 않는다 — `elemX/Y/W/H` 와 결과 `flags` 는 모두 매개변수로 받아 읽고 쓸 뿐이다.
 * `overlap` 의 비교 넷은 `&&` 로 잇지 않고 if 를 중첩한다(ir-interpreter 의 `&&` 는 짧은 회로가
 * 아니다 — 사양에 그대로 따른다).
 */
import type { IR } from '@ffacet/core';

export const repaintCostImperativeIR: IR = {
  id: 'repaint-cost-imperative',
  algorithm: 'repaintCost',
  paradigm: 'imperative',
  functions: [
    {
      name: 'computeRepaint',
      params: [
        { name: 'elemX', type: { kind: 'list', of: { kind: 'int' } } },
        { name: 'elemY', type: { kind: 'list', of: { kind: 'int' } } },
        { name: 'elemW', type: { kind: 'list', of: { kind: 'int' } } },
        { name: 'elemH', type: { kind: 'list', of: { kind: 'int' } } },
        { name: 'n', type: { kind: 'int' } },
        { name: 'dx', type: { kind: 'int' } },
        { name: 'dy', type: { kind: 'int' } },
        { name: 'dw', type: { kind: 'int' } },
        { name: 'dh', type: { kind: 'int' } },
        { name: 'flags', type: { kind: 'list', of: { kind: 'int' } } },
      ],
      returnType: { kind: 'int' },
      body: [
        { kind: 'var', name: 'count', type: { kind: 'int' }, init: { kind: 'lit', value: 0 } },
        {
          kind: 'for-range',
          var: 'i',
          from: { kind: 'lit', value: 0 },
          to: { kind: 'var', name: 'n' },
          inclusive: false,
          phase: 'paint',
          body: [
            {
              kind: 'if',
              phase: 'paint',
              cond: {
                kind: 'call',
                fn: 'overlap',
                args: [
                  { kind: 'index', arr: { kind: 'var', name: 'elemX' }, idx: { kind: 'var', name: 'i' } },
                  { kind: 'index', arr: { kind: 'var', name: 'elemY' }, idx: { kind: 'var', name: 'i' } },
                  { kind: 'index', arr: { kind: 'var', name: 'elemW' }, idx: { kind: 'var', name: 'i' } },
                  { kind: 'index', arr: { kind: 'var', name: 'elemH' }, idx: { kind: 'var', name: 'i' } },
                  { kind: 'var', name: 'dx' },
                  { kind: 'var', name: 'dy' },
                  { kind: 'var', name: 'dw' },
                  { kind: 'var', name: 'dh' },
                ],
              },
              then: [
                {
                  kind: 'assign',
                  phase: 'paint',
                  target: { kind: 'index', arr: { kind: 'var', name: 'flags' }, idx: { kind: 'var', name: 'i' } },
                  expr: { kind: 'lit', value: 1 },
                },
                {
                  kind: 'assign',
                  phase: 'paint',
                  target: { kind: 'var', name: 'count' },
                  expr: { kind: 'binop', op: '+', l: { kind: 'var', name: 'count' }, r: { kind: 'lit', value: 1 } },
                },
              ],
              else: [
                {
                  kind: 'assign',
                  phase: 'paint',
                  target: { kind: 'index', arr: { kind: 'var', name: 'flags' }, idx: { kind: 'var', name: 'i' } },
                  expr: { kind: 'lit', value: 0 },
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: { kind: 'var', name: 'count' } },
      ],
    },
    {
      name: 'overlap',
      params: [
        { name: 'ax', type: { kind: 'int' } },
        { name: 'ay', type: { kind: 'int' } },
        { name: 'aw', type: { kind: 'int' } },
        { name: 'ah', type: { kind: 'int' } },
        { name: 'bx', type: { kind: 'int' } },
        { name: 'by', type: { kind: 'int' } },
        { name: 'bw', type: { kind: 'int' } },
        { name: 'bh', type: { kind: 'int' } },
      ],
      returnType: { kind: 'bool' },
      body: [
        {
          kind: 'if',
          cond: { kind: 'binop', op: '<', l: { kind: 'var', name: 'ax' }, r: { kind: 'binop', op: '+', l: { kind: 'var', name: 'bx' }, r: { kind: 'var', name: 'bw' } } },
          then: [
            {
              kind: 'if',
              cond: { kind: 'binop', op: '<', l: { kind: 'var', name: 'bx' }, r: { kind: 'binop', op: '+', l: { kind: 'var', name: 'ax' }, r: { kind: 'var', name: 'aw' } } },
              then: [
                {
                  kind: 'if',
                  cond: { kind: 'binop', op: '<', l: { kind: 'var', name: 'ay' }, r: { kind: 'binop', op: '+', l: { kind: 'var', name: 'by' }, r: { kind: 'var', name: 'bh' } } },
                  then: [
                    {
                      kind: 'if',
                      cond: { kind: 'binop', op: '<', l: { kind: 'var', name: 'by' }, r: { kind: 'binop', op: '+', l: { kind: 'var', name: 'ay' }, r: { kind: 'var', name: 'ah' } } },
                      then: [{ kind: 'return', expr: { kind: 'lit', value: true } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: { kind: 'lit', value: false } },
      ],
    },
  ],
};

export const repaintCostIRs: IR[] = [repaintCostImperativeIR];
