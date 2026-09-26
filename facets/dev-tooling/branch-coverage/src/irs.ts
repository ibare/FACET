/**
 * branchCoverage IR — 대상 함수 `fee` 그 자체.
 *
 * 코드 패널이 곧 실행 자리다: 알고리즘은 줄을 밟는 걸음마다 그 줄의 phase 를 켠다
 * (`init-fee` · `decide` · `discount` · `return-fee`). 시험 넷의 답(5 · 10 · 10 · 5)과 밟은 phase 차례가
 * 알고리즘과 같다 — 검사가 잠근다.
 *
 * IR 밖에 두는 것: 조건 가름(짝 찾기)은 시험 모음 위의 셈이고 변이는 다른 코드라, 대상 함수가 아니다.
 * `&&` 는 두 쪽 모두 부작용 없는 값이라 짧은 회로가 아니어도 답이 같다 — 조건값을 입력이 정한다는 규약과도 맞는다.
 */
import type { IR } from '@ffacet/core';

export const branchCoverageImperativeIR: IR = {
  id: 'branch-coverage-imperative',
  algorithm: 'branchCoverage',
  paradigm: 'imperative',
  functions: [
    {
      name: 'fee',
      params: [
        { name: 'age', type: { kind: 'int' } },
        { name: 'member', type: { kind: 'bool' } },
      ],
      returnType: { kind: 'int' },
      body: [
        { kind: 'comment', text: 'base fee' },
        { kind: 'var', name: 'f', type: { kind: 'int' }, init: { kind: 'lit', value: 10 }, phase: 'init-fee' },
        {
          kind: 'if',
          phase: 'decide',
          cond: {
            kind: 'binop',
            op: '&&',
            l: { kind: 'binop', op: '>=', l: { kind: 'var', name: 'age' }, r: { kind: 'lit', value: 65 } },
            r: { kind: 'var', name: 'member' },
          },
          then: [
            {
              kind: 'assign',
              phase: 'discount',
              target: { kind: 'var', name: 'f' },
              expr: { kind: 'binop', op: '-', l: { kind: 'var', name: 'f' }, r: { kind: 'lit', value: 5 } },
            },
          ],
        },
        { kind: 'return', expr: { kind: 'var', name: 'f' }, phase: 'return-fee' },
      ],
    },
  ],
};

export const branchCoverageIRs: IR[] = [branchCoverageImperativeIR];
