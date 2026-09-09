/**
 * 분기 한정 배낭 학습용 IR — 함수 둘.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def knapsack(values, weights, cap, i, w, v, best):
 *       n = len(values)                            # phase: enter
 *       if w > cap:                                # phase: overflow
 *           return best                            # phase: overflow
 *       if v > best:                               # phase: new-best
 *           best = v                               # phase: new-best
 *       if i >= n:                                 # phase: all-used
 *           return best                            # phase: all-used
 *       b = bound(values, weights, cap, i, w, v)   # phase: measure-bound
 *       if b <= best:                              # phase: cut
 *           return best                            # phase: cut
 *       best = knapsack(values, weights, cap, i + 1,
 *                       w + weights[i], v + values[i], best)   # phase: branch-take
 *       best = knapsack(values, weights, cap, i + 1, w, v, best) # phase: branch-skip
 *       return best                                # phase: return-best
 *
 *   def bound(values, weights, cap, i, w, v):
 *       total = v                                  # phase: bound-init
 *       room = cap - w                             # phase: bound-init
 *       k = i                                      # phase: bound-init
 *       while k < len(values):
 *           if weights[k] <= room:
 *               total = total + values[k]          # phase: bound-fit
 *               room = room - weights[k]           # phase: bound-fit
 *               k = k + 1                          # phase: bound-fit
 *           else:
 *               total = total + values[k] * room / weights[k]   # phase: bound-split
 *               break                                          # phase: bound-split
 *       return total                               # phase: bound-return
 *
 * **`bound` 를 펼쳐 썼다.** 남은 물건을 값/무게가 큰 순서로 담되 마지막 하나는
 * 쪼개서라도 한도를 채웠을 때의 값 — 그 루프가 이 알고리즘의 절반이다. 감싸면
 * "재고 나서 자른다" 의 '재는' 쪽이 코드에서 통째로 사라진다.
 *
 * **쪼개는 자리는 실수 나눗셈 `/` 다.** `//` (정수 나눗셈) 를 쓰면 3/6 이 0 이
 * 되어 한계가 낮게 나오고, 낮은 한계는 살아 있어야 할 갈래를 자른다 — 문법은
 * 성한 채 답만 틀리는 종류의 잘못이다. 언어마다 `/` 가 정수 나눗셈으로 떨어지지
 * 않도록 `total` 과 `room` 을 `double` 로 잡았다 (자바·C++·C# 은 int 끼리의
 * `/` 가 정수 나눗셈이다).
 *
 * **이름 붙인 호출은 `bound` 하나뿐이다.** 그것마저 IR 안에 함수로 펼쳐져 있어
 * 코드 패널이 본문을 보여 준다. 배열 만들기 · 끝에 붙이기 같은 언어마다 이름이
 * 갈리는 것을 쓰지 않으므로 `@ffacet/ir-interpreter` 로 그대로 실행된다.
 *
 * `knapsack` 이 첫 함수 = entry point. `best` 를 인자로 받아 갱신된 값을 돌려주는
 * 꼴이라 전역 상태가 없다.
 *
 * phase 어휘는 `algorithm.ts` 의 `emit('phase', …)` 와 **글자 단위로** 같아야
 * 한다 (C3):
 *
 *   'enter' | 'overflow' | 'new-best' | 'all-used' | 'measure-bound' | 'cut' |
 *   'branch-take' | 'branch-skip' | 'return-best' |
 *   'bound-init' | 'bound-fit' | 'bound-split' | 'bound-return'
 */

import type { IR, IRBinOp, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tDouble: IRType = { kind: 'double' };
const tIntList: IRType = { kind: 'list', of: tInt };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });

export const knapsackBoundIR: IR = {
  id: 'knapsack-bound',
  algorithm: 'branchAndBound',
  paradigm: 'imperative',
  functions: [
    {
      name: 'knapsack',
      params: [
        { name: 'values', type: tIntList },
        { name: 'weights', type: tIntList },
        { name: 'cap', type: tInt },
        { name: 'i', type: tInt },
        { name: 'w', type: tInt },
        { name: 'v', type: tInt },
        { name: 'best', type: tInt },
      ],
      returnType: tInt,
      body: [
        { kind: 'var', phase: 'enter', name: 'n', type: tInt, init: len(v('values')) },
        {
          kind: 'if',
          phase: 'overflow',
          cond: bin('>', v('w'), v('cap')),
          then: [{ kind: 'return', phase: 'overflow', expr: v('best') }],
        },
        {
          kind: 'if',
          phase: 'new-best',
          cond: bin('>', v('v'), v('best')),
          then: [{ kind: 'assign', phase: 'new-best', target: v('best'), expr: v('v') }],
        },
        {
          kind: 'if',
          phase: 'all-used',
          cond: bin('>=', v('i'), v('n')),
          then: [{ kind: 'return', phase: 'all-used', expr: v('best') }],
        },
        {
          kind: 'var',
          phase: 'measure-bound',
          name: 'b',
          type: tDouble,
          init: call('bound', [v('values'), v('weights'), v('cap'), v('i'), v('w'), v('v')]),
        },
        {
          kind: 'if',
          phase: 'cut',
          cond: bin('<=', v('b'), v('best')),
          then: [{ kind: 'return', phase: 'cut', expr: v('best') }],
        },
        {
          kind: 'assign',
          phase: 'branch-take',
          target: v('best'),
          expr: call('knapsack', [
            v('values'),
            v('weights'),
            v('cap'),
            bin('+', v('i'), lit(1)),
            bin('+', v('w'), idx(v('weights'), v('i'))),
            bin('+', v('v'), idx(v('values'), v('i'))),
            v('best'),
          ]),
        },
        {
          kind: 'assign',
          phase: 'branch-skip',
          target: v('best'),
          expr: call('knapsack', [
            v('values'),
            v('weights'),
            v('cap'),
            bin('+', v('i'), lit(1)),
            v('w'),
            v('v'),
            v('best'),
          ]),
        },
        { kind: 'return', phase: 'return-best', expr: v('best') },
      ] satisfies IRStmt[],
    },
    {
      name: 'bound',
      params: [
        { name: 'values', type: tIntList },
        { name: 'weights', type: tIntList },
        { name: 'cap', type: tInt },
        { name: 'i', type: tInt },
        { name: 'w', type: tInt },
        { name: 'v', type: tInt },
      ],
      returnType: tDouble,
      body: [
        { kind: 'var', phase: 'bound-init', name: 'total', type: tDouble, init: v('v') },
        {
          kind: 'var',
          phase: 'bound-init',
          name: 'room',
          type: tDouble,
          init: bin('-', v('cap'), v('w')),
        },
        { kind: 'var', phase: 'bound-init', name: 'k', type: tInt, init: v('i') },
        {
          kind: 'while',
          cond: bin('<', v('k'), len(v('values'))),
          body: [
            {
              kind: 'if',
              cond: bin('<=', idx(v('weights'), v('k')), v('room')),
              then: [
                {
                  kind: 'assign',
                  phase: 'bound-fit',
                  target: v('total'),
                  expr: bin('+', v('total'), idx(v('values'), v('k'))),
                },
                {
                  kind: 'assign',
                  phase: 'bound-fit',
                  target: v('room'),
                  expr: bin('-', v('room'), idx(v('weights'), v('k'))),
                },
                {
                  kind: 'assign',
                  phase: 'bound-fit',
                  target: v('k'),
                  expr: bin('+', v('k'), lit(1)),
                },
              ],
              else: [
                {
                  // 쪼개 담는 자리. `/` 는 실수 나눗셈이고, room 이 double 이라
                  // 여섯 언어 어디서도 정수 나눗셈으로 떨어지지 않는다.
                  kind: 'assign',
                  phase: 'bound-split',
                  target: v('total'),
                  expr: bin(
                    '+',
                    v('total'),
                    bin(
                      '/',
                      bin('*', idx(v('values'), v('k')), v('room')),
                      idx(v('weights'), v('k')),
                    ),
                  ),
                },
                { kind: 'break', phase: 'bound-split' },
              ],
            },
          ],
        },
        { kind: 'return', phase: 'bound-return', expr: v('total') },
      ] satisfies IRStmt[],
    },
  ],
};

export const branchAndBoundIRs: IR[] = [knapsackBoundIR];
