/**
 * 백트래킹 (4-퀸 전수 탐색) 학습용 IR — 함수 둘.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def solve(cols, row, n):
 *       if row == n:                                    # phase: solution-found
 *           return 1                                    # phase: solution-found
 *       found = 0                                       # phase: choose-row
 *       for col in range(0, n):                         # phase: choose-row
 *           if is_safe(cols, row, col, n):              # phase: safety-check
 *               cols[row] = col                         # phase: place
 *               found = found + solve(cols, row + 1, n) # phase: descend
 *               cols[row] = -1                          # phase: undo
 *       return found                                    # phase: return-found
 *
 *   def is_safe(cols, row, col, n):
 *       for r in range(0, row):                         # phase: safety-check
 *           if cols[r] == col:                          # phase: safety-check
 *               return False                            # phase: safety-check
 *           if cols[r] - col == row - r or col - cols[r] == row - r:
 *               return False                            # phase: safety-check
 *       return True                                     # phase: safety-check
 *
 * **이름 붙인 호출이 하나도 없다.** `solve` 와 `is_safe` 는 둘 다 이 IR 이
 * 정의하는 함수이고, 그 밖에는 전부 배열 인덱스와 뺄셈으로 펼쳐 썼다.
 *
 * 특히 대각선 판정을 `abs` 로 감싸지 않았다. `abs` 는 여섯 언어에서 이름이
 * 갈리고(`Math.abs` · `Math.Abs` · `abs`), 무엇보다 그 한 이름 뒤로 **대각선이
 * 둘이라는 사실**이 숨는다. 위로 왼쪽 대각선(`cols[r] - col == row - r`)과
 * 위로 오른쪽 대각선(`col - cols[r] == row - r`)을 나란히 적으면 판이 왜
 * 막히는지가 코드에 그대로 남는다.
 *
 * 모든 해를 찾으므로 `solve` 는 bool 이 아니라 **찾은 해의 수**를 돌려준다.
 * 안전한 열을 만나도 `return` 으로 빠져나가지 않고 `found` 에 더해 루프를 끝까지
 * 돈다 — 그것이 "하나 찾고도 계속 물러난다" 의 코드상 근거다.
 *
 * 놓기(`cols[row] = col`)와 물리기(`cols[row] = -1`)가 재귀를 사이에 두고 짝을
 * 이룬다. 빈 자리는 `-1` 로 표시한다.
 *
 * `solve` 가 첫 함수 = entry point. `is_safe` 는 놓을 수 있는지만 보는 보조
 * 함수라 반환 타입이 `bool` 이다. `n` 은 두 함수가 같은 판을 본다는 것을
 * 드러내려고 시그니처를 맞춰 둔 것이다.
 *
 * phase 어휘는 `algorithm.ts` 의 `emit('phase', …)` 와 **글자 단위로** 같아야
 * 한다 (C3):
 *
 *   'solution-found' | 'choose-row' | 'safety-check' |
 *   'place' | 'descend' | 'undo' | 'return-found'
 */

import type { IR, IRBinOp, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tBool: IRType = { kind: 'bool' };
const tIntList: IRType = { kind: 'list', of: tInt };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | boolean): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });

export const nQueensBacktrackIR: IR = {
  id: 'nqueens-backtrack',
  algorithm: 'backtracking',
  paradigm: 'imperative',
  functions: [
    {
      name: 'solve',
      params: [
        { name: 'cols', type: tIntList },
        { name: 'row', type: tInt },
        { name: 'n', type: tInt },
      ],
      returnType: tInt,
      body: [
        {
          kind: 'if',
          phase: 'solution-found',
          cond: bin('==', v('row'), v('n')),
          then: [{ kind: 'return', phase: 'solution-found', expr: lit(1) }],
        },
        {
          kind: 'var',
          phase: 'choose-row',
          name: 'found',
          type: tInt,
          init: lit(0),
        },
        {
          kind: 'for-range',
          phase: 'choose-row',
          var: 'col',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              phase: 'safety-check',
              cond: call('is_safe', [v('cols'), v('row'), v('col'), v('n')]),
              then: [
                {
                  kind: 'assign',
                  phase: 'place',
                  target: idx(v('cols'), v('row')),
                  expr: v('col'),
                },
                {
                  kind: 'assign',
                  phase: 'descend',
                  target: v('found'),
                  expr: bin(
                    '+',
                    v('found'),
                    call('solve', [v('cols'), bin('+', v('row'), lit(1)), v('n')]),
                  ),
                },
                {
                  kind: 'assign',
                  phase: 'undo',
                  target: idx(v('cols'), v('row')),
                  expr: lit(-1),
                },
              ],
            },
          ],
        },
        { kind: 'return', phase: 'return-found', expr: v('found') },
      ] satisfies IRStmt[],
    },
    {
      name: 'is_safe',
      params: [
        { name: 'cols', type: tIntList },
        { name: 'row', type: tInt },
        { name: 'col', type: tInt },
        { name: 'n', type: tInt },
      ],
      returnType: tBool,
      body: [
        {
          kind: 'for-range',
          phase: 'safety-check',
          var: 'r',
          from: lit(0),
          to: v('row'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              phase: 'safety-check',
              cond: bin('==', idx(v('cols'), v('r')), v('col')),
              then: [{ kind: 'return', phase: 'safety-check', expr: lit(false) }],
            },
            {
              kind: 'if',
              phase: 'safety-check',
              cond: bin(
                '||',
                bin('==', bin('-', idx(v('cols'), v('r')), v('col')), bin('-', v('row'), v('r'))),
                bin('==', bin('-', v('col'), idx(v('cols'), v('r'))), bin('-', v('row'), v('r'))),
              ),
              then: [{ kind: 'return', phase: 'safety-check', expr: lit(false) }],
            },
          ],
        },
        { kind: 'return', phase: 'safety-check', expr: lit(true) },
      ] satisfies IRStmt[],
    },
  ],
};

export const backtrackingIRs: IR[] = [nQueensBacktrackIR];
