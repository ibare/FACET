/**
 * 0/1 배낭의 표 채우기 학습용 IR — 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def knapsack(weight, value, capacity):
 *       n = len(weight)                                            # phase: build-table
 *       table = zeros2(n + 1, capacity + 1)                        # phase: build-table
 *       for i in range(1, n + 1):                                  # phase: pick-cell
 *           for w in range(0, capacity + 1):                       # phase: pick-cell
 *               if weight[i - 1] > w:                              # phase: weight-check
 *                   table[i][w] = table[i - 1][w]                  # phase: skip-item
 *               else:
 *                   skip = table[i - 1][w]                         # phase: compare
 *                   take = table[i - 1][w - weight[i - 1]] + value[i - 1]   # phase: compare
 *                   table[i][w] = max(skip, take)                  # phase: fill-cell
 *       return table[n][capacity]                                  # phase: read-answer
 *
 * ── 2차원 배열
 *
 * 이 저장소에서 `list of list` 를 쓰는 첫 IR 이다. `table` 의 타입은
 * `{ kind: 'list', of: { kind: 'list', of: int } }` 이고, `table[i][w]` 는
 * `index` 노드 둘의 중첩이다 (`arr` 자리에 다시 `index` 가 온다). 여섯 언어가
 * 각자의 표기로 옮긴다 — `int[][]` (Java · C#) · `std::vector<std::vector<int>>`
 * (C++) · `number[][]` (TypeScript) · 표기 없음 (Python · JavaScript).
 *
 * ── 이름 붙인 호출은 둘뿐이다
 *
 * `zeros2(rows, cols)` 와 `max(a, b)`. 배열을 새로 만드는 일과 둘 중 큰 값을
 * 고르는 일만 언어마다 이름이 갈린다 (`[[0]*cols for _ in range(rows)]` ·
 * `new int[rows][cols]` · `Math.max` · `std::max` · `Math.Max`). 나머지는
 * 전부 펼쳐 썼다.
 *
 * 특히 `table[i - 1][w - weight[i - 1]] + value[i - 1]` 은 **인덱스 안에 셈이
 * 들어가는** 식이고 그것이 이 알고리즘의 전부다. `best_with(i, w)` 로 감싸면
 * "한도에서 이 물건의 무게를 뺀 자리를 윗줄에서 읽는다" 는 사실이 코드에서
 * 사라진다.
 *
 * ── 이름 고르기
 *
 * 여섯 언어를 한꺼번에 통과하는 것으로 골랐다. `with` 는 파이썬과 JavaScript 의
 * 예약어라 "넣는 쪽" 을 `take` 로, "안 넣는 쪽" 을 `skip` 으로 적었다. 한도를
 * `W` 가 아니라 `capacity` 로 둔 것은 훑는 자리 `w` 와 대문자 하나로만 갈리는
 * 이름이 코드 패널에서 읽히지 않기 때문이다.
 *
 * ── 1 씩 밀린 첨자
 *
 * 표의 행 `i` 는 "물건 i 까지 썼을 때" 이고 물건 배열의 자리는 0 부터라
 * `weight[i - 1]` 이 된다. 0 행은 "아무 물건도 안 썼을 때" 라 전부 0 이며
 * `zeros2` 가 만들어 둔 그대로 쓰인다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'build-table' | 'pick-cell' | 'weight-check' | 'skip-item' |
 *   'compare' | 'fill-cell' | 'read-answer'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tIntList: IRType = { kind: 'list', of: tInt };
const tIntGrid: IRType = { kind: 'list', of: tIntList };

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

/** `weight[i - 1]` — 물건 배열은 0 부터라 행 번호에서 하나를 뺀다. */
const itemWeight = idx(v('weight'), bin('-', v('i'), lit(1)));
/** `value[i - 1]` */
const itemValue = idx(v('value'), bin('-', v('i'), lit(1)));
/** `table[i][w]` — 지금 채우는 칸. */
const here = idx(idx(v('table'), v('i')), v('w'));
/** `table[i - 1][w]` — 바로 윗줄의 같은 자리. 이 물건을 안 넣었을 때. */
const aboveSame = idx(idx(v('table'), bin('-', v('i'), lit(1))), v('w'));
/** `table[i - 1][w - weight[i - 1]]` — 무게만큼 왼쪽. 이 물건을 넣을 자리를 비운 뒤. */
const aboveLeft = idx(
  idx(v('table'), bin('-', v('i'), lit(1))),
  bin('-', v('w'), itemWeight),
);

export const knapsackTableIR: IR = {
  id: 'knapsack-table',
  algorithm: 'dynamicProgramming',
  paradigm: 'imperative',
  functions: [
    {
      name: 'knapsack',
      params: [
        { name: 'weight', type: tIntList },
        { name: 'value', type: tIntList },
        { name: 'capacity', type: tInt },
      ],
      returnType: tInt,
      body: [
        {
          kind: 'var',
          phase: 'build-table',
          name: 'n',
          type: tInt,
          init: len(v('weight')),
        },
        {
          kind: 'var',
          phase: 'build-table',
          name: 'table',
          type: tIntGrid,
          init: call('zeros2', [bin('+', v('n'), lit(1)), bin('+', v('capacity'), lit(1))]),
        },
        {
          kind: 'for-range',
          phase: 'pick-cell',
          var: 'i',
          from: lit(1),
          to: v('n'),
          inclusive: true,
          body: [
            {
              kind: 'for-range',
              phase: 'pick-cell',
              var: 'w',
              from: lit(0),
              to: v('capacity'),
              inclusive: true,
              body: [
                {
                  kind: 'if',
                  phase: 'weight-check',
                  cond: bin('>', itemWeight, v('w')),
                  then: [
                    { kind: 'assign', phase: 'skip-item', target: here, expr: aboveSame },
                  ],
                  else: [
                    {
                      kind: 'var',
                      phase: 'compare',
                      name: 'skip',
                      type: tInt,
                      init: aboveSame,
                    },
                    {
                      kind: 'var',
                      phase: 'compare',
                      name: 'take',
                      type: tInt,
                      init: bin('+', aboveLeft, itemValue),
                    },
                    {
                      kind: 'assign',
                      phase: 'fill-cell',
                      target: here,
                      expr: call('max', [v('skip'), v('take')]),
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          kind: 'return',
          phase: 'read-answer',
          expr: idx(idx(v('table'), v('n')), v('capacity')),
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const dynamicProgrammingIRs: IR[] = [knapsackTableIR];
