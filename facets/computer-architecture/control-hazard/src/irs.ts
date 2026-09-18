/**
 * 제어 해저드 — 코드 패널 IR.
 *
 * 박자를 한 칸씩 흉내 내지 않고, 같은 규약을 셈으로 걷는다. 명령어 하나를 가져올
 * 때마다 한 박자, 탄 분기마다 판정 전에 가져온 (resolveStage − 1) 개를 버린다.
 * 처음 4 는 마지막 명령어가 IF 에서 WB 까지 가는 동안 더 드는 박자다.
 *
 * IR 은 값 하나만 돌려주므로 박자와 버린 수를 두 함수가 따로 걷는다.
 *
 * **가정 — 탄 분기 뒤에는 명령어가 (사다리 끝 − 1) 개 이상 있다.** IR 은 탈 때마다
 * resolveStage − 1 을 무조건 더하고, algorithm 은 판정 전에 실제로 들어온(비지 않은)
 * 칸만 센다. 분기 뒤 명령어가 모자라면 프로그램 끝을 넘어 가져올 것이 없어 칸이 비고,
 * 두 셈이 갈린다. 지금 데이터는 분기(자리 3) 뒤에 셋이 있고 사다리 끝은 4 라 정확히
 * 맞는다. 캡션의 "{taken} × {penalty} = {flushed}" 등식도 같은 가정 위에 선다.
 * 검사가 이 가정을 잠근다 (test 의 "분기 뒤 명령어 수").
 *
 * 배열은 부르는 쪽이 건넨다 — isBranch 는 1/0, target 은 목표 자리(분기가 아니면 -1).
 * 중간값의 최대는 사다리 끝(4)에서의 박자 32 다.
 *
 * phase 어휘는 algorithm.ts 와 같다 — 'fetch' | 'resolve' | 'flush' | 'jump' | 'done'.
 */

import type { IR, IRExpr, IRStmt } from '@ffacet/core/runtime';

const INT = { kind: 'int' } as const;
const INT_LIST = { kind: 'list', of: { kind: 'int' } } as const;

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '<' | '>' | '==', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });

const PARAMS = [
  { name: 'isBranch', type: INT_LIST },
  { name: 'target', type: INT_LIST },
  { name: 'trips', type: INT },
  { name: 'resolveStage', type: INT },
];

/**
 * 두 함수가 함께 쓰는 걸음. `tally` 는 탄 분기마다 더할 것을 받는 변수 이름이고,
 * `perFetch` 는 가져올 때마다 한 박자를 셀지 여부다.
 */
function walk(tally: string, perFetch: boolean): IRStmt[] {
  const fetchCount: IRStmt[] = perFetch
    ? [{ kind: 'assign', target: v(tally), expr: bin('+', v(tally), n(1)), phase: 'fetch' }]
    : [];
  return [
    {
      kind: 'while',
      cond: bin('<', v('pc'), v('n')),
      body: [
        ...fetchCount,
        {
          kind: 'if',
          cond: bin('==', at('isBranch', v('pc')), n(1)),
          phase: 'resolve',
          then: [
            {
              kind: 'if',
              cond: bin('>', v('left'), n(0)),
              phase: 'resolve',
              then: [
                {
                  kind: 'assign',
                  target: v('left'),
                  expr: bin('-', v('left'), n(1)),
                  phase: 'resolve',
                },
                {
                  kind: 'assign',
                  target: v(tally),
                  expr: bin('+', v(tally), bin('-', v('resolveStage'), n(1))),
                  phase: 'flush',
                },
                {
                  kind: 'assign',
                  target: v('pc'),
                  expr: at('target', v('pc')),
                  phase: 'jump',
                },
              ],
              else: [
                { kind: 'assign', target: v('pc'), expr: bin('+', v('pc'), n(1)), phase: 'fetch' },
              ],
            },
          ],
          else: [
            { kind: 'assign', target: v('pc'), expr: bin('+', v('pc'), n(1)), phase: 'fetch' },
          ],
        },
      ],
    },
    { kind: 'return', expr: v(tally), phase: 'done' },
  ];
}

function prelude(tally: string, init: number): IRStmt[] {
  return [
    { kind: 'var', name: 'n', type: INT, init: { kind: 'len', of: v('isBranch') } },
    { kind: 'var', name: 'pc', type: INT, init: n(0) },
    { kind: 'var', name: 'left', type: INT, init: bin('-', v('trips'), n(1)) },
    { kind: 'var', name: tally, type: INT, init: n(init) },
  ];
}

export const controlHazardImperativeIR: IR = {
  id: 'control-hazard-imperative',
  algorithm: 'controlHazard',
  paradigm: 'imperative',
  functions: [
    {
      name: 'countCycles',
      params: PARAMS,
      returnType: INT,
      body: [
        ...prelude('cycles', 4),
        ...walk('cycles', true),
      ],
    },
    {
      name: 'countFlushed',
      params: PARAMS,
      returnType: INT,
      body: [...prelude('flushed', 0), ...walk('flushed', false)],
    },
  ],
};

export const controlHazardIRs: IR[] = [controlHazardImperativeIR];
