/**
 * 5단계 파이프라인 — 코드 패널 IR.
 *
 * 진입 `countPipelinedCycles(n, stages)` 가 마지막 명령어의 WB 박자를 셈한다.
 * 보조 `countSerialCycles` 는 직렬 박자, `speedupPercent` 는 반올림 백분율.
 * 셋 다 algorithm.ts 의 같은 이름 함수와 같은 식이고, 검사가 전 손잡이 값에서
 * 계기(`cycle-count` · `serial-cycle-count` · `speedup-percent`)와 견준다.
 *
 * 중간값 최대는 `serial * 100` = 8,000 (N=16). 여섯 언어 모두 32비트 안이다.
 *
 * phase 어휘는 algorithm.ts 와 같다: 'setup' | 'serial' | 'flow' | 'retire' | 'speedup'.
 */

import type { IR, IRExpr } from '@ffacet/core/runtime';

const INT = { kind: 'int' } as const;

const v = (name: string): IRExpr => ({ kind: 'var', name });
const num = (value: number): IRExpr => ({ kind: 'lit', value });

export const fiveStagePipelineImperativeIR: IR = {
  id: 'five-stage-pipeline-imperative',
  algorithm: 'fiveStagePipeline',
  paradigm: 'imperative',
  functions: [
    {
      name: 'countPipelinedCycles',
      params: [
        { name: 'n', type: INT },
        { name: 'stages', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'i 번째 명령어는 박자 i+1 에 IF, 박자 i+stages 에 WB' },
        { kind: 'var', name: 'last', type: INT, init: num(0), phase: 'setup' },
        {
          kind: 'for-range',
          var: 'i',
          from: num(0),
          to: v('n'),
          inclusive: false,
          phase: 'flow',
          body: [
            {
              kind: 'var',
              name: 'finish',
              type: INT,
              init: { kind: 'binop', op: '+', l: v('i'), r: v('stages') },
              phase: 'flow',
            },
            {
              kind: 'if',
              cond: { kind: 'binop', op: '>', l: v('finish'), r: v('last') },
              phase: 'retire',
              then: [{ kind: 'assign', target: v('last'), expr: v('finish'), phase: 'retire' }],
            },
          ],
        },
        { kind: 'return', expr: v('last'), phase: 'retire' },
      ],
    },
    {
      name: 'countSerialCycles',
      params: [
        { name: 'n', type: INT },
        { name: 'stages', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: '앞 명령어가 WB 를 마쳐야 다음 명령어가 IF 에 든다' },
        { kind: 'var', name: 'total', type: INT, init: num(0), phase: 'serial' },
        {
          kind: 'for-range',
          var: 'i',
          from: num(0),
          to: v('n'),
          inclusive: false,
          phase: 'serial',
          body: [
            {
              kind: 'assign',
              target: v('total'),
              expr: { kind: 'binop', op: '+', l: v('total'), r: v('stages') },
              phase: 'serial',
            },
          ],
        },
        { kind: 'return', expr: v('total'), phase: 'serial' },
      ],
    },
    {
      name: 'speedupPercent',
      params: [
        { name: 'serial', type: INT },
        { name: 'piped', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: '반올림 백분율 — 실수를 거치지 않는다' },
        {
          kind: 'return',
          phase: 'speedup',
          expr: {
            kind: 'binop',
            op: '//',
            l: {
              kind: 'binop',
              op: '+',
              l: { kind: 'binop', op: '*', l: v('serial'), r: num(100) },
              r: { kind: 'binop', op: '//', l: v('piped'), r: num(2) },
            },
            r: v('piped'),
          },
        },
      ],
    },
  ],
};

export const fiveStagePipelineIRs: IR[] = [fiveStagePipelineImperativeIR];
