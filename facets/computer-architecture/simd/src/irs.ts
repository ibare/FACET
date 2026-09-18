/**
 * SIMD 의 코드 패널 IR.
 *
 * 진입 `addLanes(a, b, c, lanes)` 는 c = a + b 를 채우고 **덧셈 명령 수**를 돌려준다.
 * `c` 는 부르는 쪽이 a 와 같은 길이로 만들어 건넨다 — IR 은 배열을 지을 수 없다.
 *
 * ── 이 IR 이 약한 자리
 *
 * 묶음 루프 안의 차선 `for` 는 **스칼라 코드로 보인다.** 여섯 언어 어디에도 "이 k 반복
 * 전체가 한 번에 일어난다" 를 적을 공통 표기가 없다 — 실제 SIMD 는 intrinsic(`_mm_add_epi32`)
 * 이나 벡터 타입으로 쓰고, 그것은 언어마다 전혀 다르다. 그래서 차선 루프 위에 주석으로
 * "이 k 반복 전체가 명령어 하나다" 를 박고, 명령 수(`ops`)를 차선 루프 **바깥**에서 한 번만
 * 올린다. 코드가 세는 명령 수는 화면의 계기와 같지만, 코드의 모양은 w 번 도는 것처럼 읽힌다.
 * 그 간극은 화면(한꺼번에 미는 띠)이 메운다.
 *
 * 메모리 대역폭(적재 · 저장)은 다루지 않는다 — 덧셈 명령만 센다.
 *
 * ── 32 비트
 *
 * 중간값 최대는 `speedupPercent` 의 `n * 100 + ops // 2` = 1809 (n = 18, ops = 18).
 * c 의 값은 최대 198. 검사가 배열 길이 18 과 사다리 끝값 8 을 잠근다.
 *
 * phase: `'plan' | 'bundle-add' | 'tail-add' | 'speedup'` — algorithm 과 같다 (C3).
 */

import type { IR, IRExpr, IRStmt } from '@ffacet/core/runtime';

const INT = { kind: 'int' } as const;
const INT_LIST = { kind: 'list', of: INT } as const;

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const add = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '+', l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });

/** c[idx] = a[idx] + b[idx] */
function sumInto(idx: IRExpr, phase: string): IRStmt {
  return { kind: 'assign', target: at('c', idx), expr: add(at('a', idx), at('b', idx)), phase };
}

export const simdImperativeIR: IR = {
  id: 'simd-imperative',
  algorithm: 'simd',
  paradigm: 'imperative',
  functions: [
    {
      name: 'addLanes',
      params: [
        { name: 'a', type: INT_LIST },
        { name: 'b', type: INT_LIST },
        { name: 'c', type: INT_LIST },
        { name: 'lanes', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'n', type: INT, init: { kind: 'len', of: v('a') }, phase: 'plan' },
        { kind: 'var', name: 'ops', type: INT, init: lit(0), phase: 'plan' },
        { kind: 'var', name: 'i', type: INT, init: lit(0), phase: 'plan' },
        { kind: 'comment', text: '묶음: 차선 수만큼 한꺼번에' },
        {
          kind: 'while',
          cond: { kind: 'binop', op: '<=', l: add(v('i'), v('lanes')), r: v('n') },
          phase: 'bundle-add',
          body: [
            { kind: 'comment', text: '이 k 반복 전체가 명령어 하나다' },
            {
              kind: 'for-range',
              var: 'k',
              from: lit(0),
              to: v('lanes'),
              inclusive: false,
              phase: 'bundle-add',
              body: [sumInto(add(v('i'), v('k')), 'bundle-add')],
            },
            { kind: 'assign', target: v('ops'), expr: add(v('ops'), lit(1)), phase: 'bundle-add' },
            { kind: 'assign', target: v('i'), expr: add(v('i'), v('lanes')), phase: 'bundle-add' },
          ],
        },
        { kind: 'comment', text: '꼬리: 남은 원소를 하나씩' },
        {
          kind: 'while',
          cond: { kind: 'binop', op: '<', l: v('i'), r: v('n') },
          phase: 'tail-add',
          body: [
            sumInto(v('i'), 'tail-add'),
            { kind: 'assign', target: v('ops'), expr: add(v('ops'), lit(1)), phase: 'tail-add' },
            { kind: 'assign', target: v('i'), expr: add(v('i'), lit(1)), phase: 'tail-add' },
          ],
        },
        { kind: 'return', expr: v('ops') },
      ],
    },
    {
      name: 'countTail',
      params: [
        { name: 'n', type: INT },
        { name: 'lanes', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'return', expr: { kind: 'binop', op: '%', l: v('n'), r: v('lanes') }, phase: 'plan' },
      ],
    },
    {
      name: 'speedupPercent',
      params: [
        { name: 'n', type: INT },
        { name: 'ops', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: '차선 하나 대비 빨라짐 % (반올림)' },
        {
          kind: 'return',
          expr: {
            kind: 'binop',
            op: '//',
            l: add({ kind: 'binop', op: '*', l: v('n'), r: lit(100) }, { kind: 'binop', op: '//', l: v('ops'), r: lit(2) }),
            r: v('ops'),
          },
          phase: 'speedup',
        },
      ],
    },
  ],
};

export const simdIRs: IR[] = [simdImperativeIR];
