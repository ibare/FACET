/**
 * frame-budget 의 IR — 화면과 같은 셈을 코드 패널에 보인다.
 *
 * IR 함수는 배열을 만들 수 없고 받은 인자로만 셈한다. "박자 전체의 자취를 한 번에
 * 돌려주는 대신, 이 박자에 무엇이 보이는가 를 그 박자마다 다시 셈하는 함수" 로 짠다
 * (algorithm.ts 와 정확히 같은 재계산 짜임). 정수 나눗셈 · 비교 · 사칙연산뿐이라
 * IR_MATH_BUILTINS 도 필요 없다.
 *
 * phase 어휘는 algorithm.ts 와 정확히 같다: cost, schedule, position.
 */
import type { IR, IRBinOp, IRExpr, IRFunc, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const vr = (name: string): IRExpr => ({ kind: 'var', name });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

/** frameCost(prop, n) -> int — 한 장의 몫(ms). prop == 1(left) 이면 2 + 2*n, 아니면 2. */
const frameCost: IRFunc = {
  name: 'frameCost',
  params: [
    { name: 'prop', type: INT },
    { name: 'n', type: INT },
  ],
  returnType: INT,
  body: [
    {
      kind: 'if',
      cond: bin('==', vr('prop'), lit(1)),
      then: [{ kind: 'return', expr: bin('+', lit(2), bin('*', lit(2), vr('n'))), phase: 'cost' }],
      else: [{ kind: 'return', expr: lit(2), phase: 'cost' }],
    },
  ],
};

/**
 * 한 박자 안의 공통 루프 — b(현재 장의 시작 박자)를 0 에서 시작해 j 를 1..beat 로
 * 훑으며, 이 장이 끝난 시각보다 뒤의 첫 박자 p 를 그때마다 다시 셈한다(schedule).
 * p == j 면 그 박자에 새 장이 나온 것이다(position) — b 를 p 로 옮기고 바디(body)를
 * 이어 붙인다. 세 함수(frameAtBeat · newFramesUpTo)가 이 뼈대를 공유한다.
 */
function scheduleLoop(onHit: IRStmt[]): IRStmt[] {
  return [
    { kind: 'var', name: 'b', type: INT, init: lit(0) },
    {
      kind: 'for-range',
      var: 'j',
      from: lit(1),
      to: vr('beat'),
      inclusive: true,
      body: [
        { kind: 'var', name: 'end60', type: INT, init: bin('+', bin('*', vr('b'), lit(1000)), bin('*', vr('cost'), lit(60))) },
        { kind: 'var', name: 'p', type: INT, init: bin('+', bin('//', vr('end60'), lit(1000)), lit(1)), phase: 'schedule' },
        {
          kind: 'if',
          cond: bin('==', vr('p'), vr('j')),
          then: [...onHit, { kind: 'assign', target: vr('b'), expr: vr('p'), phase: 'position' }],
        },
      ],
    },
  ];
}

/** frameAtBeat(beat, prop, n) -> int — 그 박자에 보이는 자리(px). */
const frameAtBeat: IRFunc = {
  name: 'frameAtBeat',
  params: [
    { name: 'beat', type: INT },
    { name: 'prop', type: INT },
    { name: 'n', type: INT },
  ],
  returnType: INT,
  body: [
    { kind: 'var', name: 'cost', type: INT, init: call('frameCost', [vr('prop'), vr('n')]), phase: 'cost' },
    { kind: 'var', name: 'position', type: INT, init: lit(0) },
    ...scheduleLoop([{ kind: 'assign', target: vr('position'), expr: bin('*', lit(20), vr('b')), phase: 'position' }]),
    { kind: 'return', expr: vr('position') },
  ],
};

/** newFramesUpTo(beat, prop, n) -> int — 1..beat 구간에 나온 새 장 수(누적). */
const newFramesUpTo: IRFunc = {
  name: 'newFramesUpTo',
  params: [
    { name: 'beat', type: INT },
    { name: 'prop', type: INT },
    { name: 'n', type: INT },
  ],
  returnType: INT,
  body: [
    { kind: 'var', name: 'cost', type: INT, init: call('frameCost', [vr('prop'), vr('n')]), phase: 'cost' },
    { kind: 'var', name: 'hits', type: INT, init: lit(0) },
    ...scheduleLoop([{ kind: 'assign', target: vr('hits'), expr: bin('+', vr('hits'), lit(1)), phase: 'position' }]),
    { kind: 'return', expr: vr('hits') },
  ],
};

/** fpsAtBeat(beat, prop, n) -> int — 지금까지 구간 기준 초당 장 수(반올림). beat == 0 이면 0. */
const fpsAtBeat: IRFunc = {
  name: 'fpsAtBeat',
  params: [
    { name: 'beat', type: INT },
    { name: 'prop', type: INT },
    { name: 'n', type: INT },
  ],
  returnType: INT,
  body: [
    {
      kind: 'if',
      cond: bin('==', vr('beat'), lit(0)),
      then: [{ kind: 'return', expr: lit(0) }],
    },
    { kind: 'var', name: 'hits', type: INT, init: call('newFramesUpTo', [vr('beat'), vr('prop'), vr('n')]) },
    { kind: 'var', name: 'numerator', type: INT, init: bin('*', vr('hits'), lit(60)) },
    {
      kind: 'return',
      expr: bin('//', bin('+', bin('*', vr('numerator'), lit(2)), vr('beat')), bin('*', lit(2), vr('beat'))),
    },
  ],
};

export const frameBudgetImperativeIR: IR = {
  id: 'frame-budget-imperative',
  algorithm: 'frameBudget',
  paradigm: 'imperative',
  functions: [frameAtBeat, frameCost, newFramesUpTo, fpsAtBeat],
};

export const frameBudgetIRs: IR[] = [frameBudgetImperativeIR];
