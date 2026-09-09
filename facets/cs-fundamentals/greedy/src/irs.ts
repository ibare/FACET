/**
 * 활동 선택 (activity selection) 학습용 IR — 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def select_activities(start, end):
 *       sort_by_end(start, end)                   # phase: sort
 *       last_end = -1                             # phase: init
 *       count = 0                                 # phase: init
 *       for i in range(0, len(start)):            # phase: visit
 *           if start[i] >= last_end:              # phase: compare
 *               last_end = end[i]                 # phase: pick
 *               count = count + 1                 # phase: pick
 *           else:
 *               continue                          # phase: skip
 *       return count                              # phase: done
 *
 * ── 무엇을 펼치고 무엇을 감쌌나
 *
 * 이름 붙인 호출은 **`sort_by_end` 하나뿐**이다. 끝나는 시간으로 줄 세우는 일은
 * 이 알고리즘의 주장이 아니고 (다른 완제품 여덟이 이미 정렬을 다룬다), 언어마다
 * 이름이 갈리는 축에 속한다 — 파이썬은 `sorted(key=…)`, 자바는 `Arrays.sort`,
 * C++ 은 `std::sort` 다. 그래서 여기서는 원시 연산 하나로 둔다.
 *
 * 반대로 **고르는 판단과 갱신은 전부 펼쳐 썼다.** `start[i] >= last_end` 와
 * `last_end = end[i]` 두 줄이 그리디의 전부라, 감싸면 코드 패널이 할 말을 잃는다.
 * 끌고 다니는 상태도 `last_end` 하나뿐이라 감쌀 것이 애초에 없다.
 *
 * `else: continue` 를 둔 것은 **건너뛴다는 판단에도 제 줄이 있어야** 하기
 * 때문이다. 빈 else 로 두면 phase 'skip' 이 짚을 줄이 없어져, 여덟 번 중 다섯 번
 * 일어나는 일이 코드에서 사라진다.
 *
 * `last_end` 의 시작값 `-1` 은 "아직 아무 회의도 없다" 는 뜻이다. 회의 시작
 * 시각이 모두 0 이상이므로 첫 회의는 반드시 통과한다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(…)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'sort' | 'init' | 'visit' | 'compare' | 'pick' | 'skip' | 'done'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tIntList: IRType = { kind: 'list', of: tInt };

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

export const activitySelectionIR: IR = {
  id: 'activity-selection',
  algorithm: 'greedy',
  paradigm: 'imperative',
  functions: [
    {
      name: 'select_activities',
      params: [
        { name: 'start', type: tIntList },
        { name: 'end', type: tIntList },
      ],
      returnType: tInt,
      body: [
        {
          kind: 'expr-stmt',
          phase: 'sort',
          expr: call('sort_by_end', [v('start'), v('end')]),
        },
        { kind: 'var', phase: 'init', name: 'last_end', type: tInt, init: lit(-1) },
        { kind: 'var', phase: 'init', name: 'count', type: tInt, init: lit(0) },
        {
          kind: 'for-range',
          phase: 'visit',
          var: 'i',
          from: lit(0),
          to: len(v('start')),
          inclusive: false,
          body: [
            {
              kind: 'if',
              phase: 'compare',
              cond: bin('>=', idx(v('start'), v('i')), v('last_end')),
              then: [
                {
                  kind: 'assign',
                  phase: 'pick',
                  target: v('last_end'),
                  expr: idx(v('end'), v('i')),
                },
                {
                  kind: 'assign',
                  phase: 'pick',
                  target: v('count'),
                  expr: bin('+', v('count'), lit(1)),
                },
              ],
              else: [{ kind: 'continue', phase: 'skip' }],
            },
          ],
        },
        { kind: 'return', phase: 'done', expr: v('count') },
      ] satisfies IRStmt[],
    },
  ],
};

export const greedyIRs: IR[] = [activitySelectionIR];
