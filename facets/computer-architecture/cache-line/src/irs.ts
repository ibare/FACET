/**
 * 캐시 라인의 IR — 줄 번호를 내고, 줄 수를 내고, 접근열을 돌며 미스를 세고,
 * 미스율을 낸다.
 *
 * ── 배열을 만들지 않는다
 *
 * `IRExpr` 에는 배열을 짓는 식이 없고 `IRStmt` 에도 그런 문이 없다 (`kind: 'list'`
 * 는 타입에만 있다). 그래서 캐시의 자리 상태는 `countMisses` 가 **매개변수로
 * 받는다** — 부르는 쪽이 `-1` 로 채운 길이 32 짜리 배열을 준다. 32 는 가장 작은
 * 라인(4 B)일 때의 줄 수이고, 라인이 커지면 앞쪽 `lines` 개만 쓴다.
 *
 * ── 32비트 천장
 *
 * 인터프리터는 배정도로 셈하지만 java · C++ · C# 의 `int` 는 감긴다. 여기 나오는
 * 수의 최대는 둘뿐이다.
 *
 *   주소   `(accessCount - 1) * stride * elementBytes` = 31 × 4 × 4 = 496
 *   백분율 `misses * 100 + accessCount // 2`           = 32 × 100 + 16 = 3216
 *
 * 둘 다 2^31 - 1 에 한참 못 미친다. 다만 그 사실은 1차 데이터(총 32 접근 · 보폭
 * 최대 4 · 원소 4 B)에 매여 있으므로, `test/cache-line.test.ts` 가 그 데이터에서
 * 상한을 **다시 계산해** 천장 아래인지 잰다. 데이터가 커지면 검사가 먼저 깨진다.
 *
 * ── 그 밖에 지킨 것
 *
 * - 나눗셈은 전부 정수 나눗셈 `//` 다. `floor`/`sqrt` 를 쓰지 않으므로 `double`
 *   이 `int` 슬롯에 담기는 자리가 없다 (S-transpiler).
 * - 비트 연산이 없어 `주소 // 라인크기` 로 줄 번호를 낸다. 라인 크기가 2의
 *   거듭제곱이라 시프트와 같은 값이지만 IR 어휘에는 시프트가 없다.
 * - `&&` 는 짧은 회로가 아니라 오른쪽이 늘 셈해진다. 조건을 이을 자리가 없도록
 *   `if` 하나로 끝냈다.
 * - 도우미를 먼저 정의하고 나중에 부른다 — 전방 선언이 없는 C++ emit 을 위해서다.
 * - 이름은 여섯 언어 어디서도 예약어가 아니다 (`slots` · `lines` · `line` ·
 *   `slot` · `stride` · `address` · `misses`).
 */

import type { IR, IRBinOp, IRExpr, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const at = (arr: IRExpr, idx: IRExpr): IRExpr => ({ kind: 'index', arr, idx });

export const cacheLineImperativeIR: IR = {
  id: 'cache-line-imperative',
  algorithm: 'cacheLine',
  paradigm: 'imperative',
  functions: [
    {
      name: 'lineOf',
      params: [
        { name: 'address', type: INT },
        { name: 'lineSize', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'return',
          expr: bin('//', v('address'), v('lineSize')),
          phase: 'line-no',
        },
      ],
    },
    {
      name: 'lineCount',
      params: [
        { name: 'totalBytes', type: INT },
        { name: 'lineSize', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'return',
          expr: bin('//', v('totalBytes'), v('lineSize')),
          phase: 'line-count',
        },
      ],
    },
    {
      name: 'countMisses',
      params: [
        { name: 'slots', type: { kind: 'list', of: INT } },
        { name: 'accessCount', type: INT },
        { name: 'elementBytes', type: INT },
        { name: 'stride', type: INT },
        { name: 'lineSize', type: INT },
        { name: 'totalBytes', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'var',
          name: 'lines',
          type: INT,
          init: call('lineCount', [v('totalBytes'), v('lineSize')]),
          phase: 'line-count',
        },
        { kind: 'var', name: 'misses', type: INT, init: lit(0) },
        {
          kind: 'for-range',
          var: 'j',
          from: lit(0),
          to: v('accessCount'),
          inclusive: false,
          body: [
            {
              kind: 'var',
              name: 'address',
              type: INT,
              init: bin('*', bin('*', v('j'), v('stride')), v('elementBytes')),
              phase: 'address',
            },
            {
              kind: 'var',
              name: 'line',
              type: INT,
              init: call('lineOf', [v('address'), v('lineSize')]),
              phase: 'line-no',
            },
            {
              kind: 'var',
              name: 'slot',
              type: INT,
              init: bin('%', v('line'), v('lines')),
              phase: 'probe',
            },
            {
              kind: 'if',
              cond: bin('!=', at(v('slots'), v('slot')), v('line')),
              phase: 'probe',
              then: [
                {
                  kind: 'assign',
                  target: v('misses'),
                  expr: bin('+', v('misses'), lit(1)),
                  phase: 'miss',
                },
                {
                  kind: 'assign',
                  target: at(v('slots'), v('slot')),
                  expr: v('line'),
                  phase: 'miss',
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: v('misses') },
      ],
    },
    {
      name: 'missPercent',
      params: [
        { name: 'misses', type: INT },
        { name: 'accessCount', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'return',
          // 실수 슬롯을 쓰지 않으려고 반올림을 정수로 편다.
          expr: bin(
            '//',
            bin(
              '+',
              bin('*', v('misses'), lit(100)),
              bin('//', v('accessCount'), lit(2)),
            ),
            v('accessCount'),
          ),
          phase: 'rate',
        },
      ],
    },
  ],
};

export const cacheLineIRs: IR[] = [cacheLineImperativeIR];
