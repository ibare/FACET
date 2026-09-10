/**
 * 숲의 예측만 담는 IR — 함수 하나.
 *
 * 나무를 **기르는** 셈은 여기 없다. 부트스트랩·축 뽑기·지니 는 algorithm.ts 가
 * 하고, 코드 패널은 다 자란 숲을 타고 내려가 표를 세는 일만 말한다. 기르기까지
 * 겹쳐 넣으면 한 패널이 두 이야기를 하고, 기르는 쪽은 이미 decisionTree 완제품이
 * 보이는 것이다.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def forestPredict(feature, threshold, left, right, label, q, n, tally):
 *       tally[0] = 0                                        # phase: reset-tally
 *       tally[1] = 0                                        # phase: reset-tally
 *       for t in range(0, n):                               # phase: pick-tree
 *           node = 0                                        # phase: enter-root
 *           while left[t][node] >= 0:                       # phase: walk-down
 *               if q[feature[t][node]] < threshold[t][node]: # phase: ask-split
 *                   node = left[t][node]                    # phase: go-left
 *               else:
 *                   node = right[t][node]                   # phase: go-right
 *           tally[label[t][node]] = tally[label[t][node]] + 1  # phase: cast-vote
 *       if tally[1] > tally[0]:                             # phase: majority
 *           return 1                                        # phase: majority
 *       return 0                                            # phase: majority
 *
 * ── 숲을 어떻게 펴는가
 *
 * 나무 하나는 노드를 **평평한 배열**로 담는다. 나무 색인 `t` 와 노드 색인
 * `node` 두 첨자로 숲 전체가 열린다 — `feature[t][node]` 는 `list of list of int`
 * 의 중첩 `index` 둘이다. 다섯 배열이 같은 (나무 × 노드) 자리를 나눠 갖는 꼴이라,
 * 한 노드를 보려면 다섯을 같은 첨자로 읽는다. 구조체가 없는 IR 에서 나무를
 * 펴는 방법은 이것뿐이고, 오히려 "나무란 다섯 수의 배열일 뿐" 이라는 사실이
 * 코드에 드러난다.
 *
 * `threshold` 만 `list of list of double` 이다. 자름 자리는 이웃한 두 값의
 * 한가운데라 정수가 아니다. `q` 도 물음점의 좌표라 `list of double`.
 *
 * 사양은 이 다섯을 "3차원 (`list of list of list of int`)" 이라 적었지만, 같은
 * 자리에서 첨자를 `[t][node]` 둘로 들고 있고 `left[t][node] >= 0` 으로 견준다.
 * 세 겹이면 그 비교가 배열과 수를 견주는 꼴이 되어 성립하지 않는다. 숲이라는
 * **자료**가 나무 × 노드 × 항목의 세 갈래인 것을 두고 한 말로 보고, 배열은
 * 두 겹으로 두었다. 항목이 셋째 첨자가 되려면 다섯을 한 배열로 합쳐야 하는데
 * `threshold` 가 실수라 `int` 로 묶이지 않는다.
 *
 * ── 잎 표시 규약 (여기에 적어 둔다)
 *
 *   내부 노드   `left[t][node] >= 0` 이고 `right[t][node] >= 0`.
 *               `label[t][node]` 는 `-1` (뜻 없음).
 *   잎          `left[t][node] == -1` 이고 `right[t][node] == -1`.
 *               `label[t][node]` 는 `0` (A) 또는 `1` (B).
 *
 * 잎임을 `left` 하나로 판정하는 것이 while 조건의 전부다. 그래서 `label` 에
 * `-1` 을 채워 두는 것이 낭비처럼 보여도 지운다면 잎 판정이 `label` 로 옮겨
 * 가고, 그러면 "표 세는 칸의 색인이 곧 잎 표시" 라는 마지막 줄이 무너진다.
 *
 * ── `tally` 를 인자로 받는 까닭
 *
 * `zeros(2)` 는 어느 언어에도 없는 이름이라 여섯 언어 어디서도 돌지 않는다.
 * 표 세는 칸도 호출부가 만들어 넘긴다. 그 덕에
 * `tally[label[t][node]] = tally[label[t][node]] + 1` 이 쓰이는데, 이 한 줄이
 * **잎 표시가 곧 표 칸의 자리 번호**라는 규약을 코드로 말한다. 스칼라 둘
 * (`votesA` / `votesB`) 로 두면 `if` 가 하나 더 붙고 그 말이 사라진다.
 *
 * ── 감싸지 않은 것
 *
 * 이름 붙인 호출이 **하나도 없다.** 한 나무를 타고 내려가는 일을
 * `leafOf(t, q)` 로 감싸면 이 알고리즘이 통째로 사라진다 — 숲의 예측이란
 * "같은 내려가기를 나무 수만큼 되풀이하고 표를 센다" 는 것이 전부이기 때문이다.
 * 갈래를 고르는 `q[feature[t][node]] < threshold[t][node]` 도 펴 두었다.
 * 물음점의 **어느 축**을 보는지가 노드마다 다르다는 것이 랜덤 포레스트에서
 * 나무들이 서로 달라지는 장치(mtry=1)의 결과이고, 감싸면 그것이 안 보인다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'reset-tally' | 'pick-tree' | 'enter-root' | 'walk-down' | 'ask-split' |
 *   'go-left' | 'go-right' | 'cast-vote' | 'majority'
 */

import type { IR, IRExpr, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tDouble: IRType = { kind: 'double' };
const tIntList: IRType = { kind: 'list', of: tInt };
const tDoubleList: IRType = { kind: 'list', of: tDouble };
const tIntGrid: IRType = { kind: 'list', of: tIntList };
const tDoubleGrid: IRType = { kind: 'list', of: tDoubleList };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const bin = (
  op: '+' | '-' | '<' | '>' | '>=',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** `feature[t][node]` — 이 노드가 보는 축 (0 = 가로, 1 = 세로). */
const nodeFeature = idx(idx(v('feature'), v('t')), v('node'));
/** `threshold[t][node]` — 그 축에서 자르는 자리. */
const nodeThreshold = idx(idx(v('threshold'), v('t')), v('node'));
/** `left[t][node]` — 작은 쪽 자식. 잎이면 -1. */
const nodeLeft = idx(idx(v('left'), v('t')), v('node'));
/** `right[t][node]` — 큰 쪽 자식. */
const nodeRight = idx(idx(v('right'), v('t')), v('node'));
/** `label[t][node]` — 잎이 내놓는 이름표. 그대로 표 칸의 자리 번호가 된다. */
const nodeLabel = idx(idx(v('label'), v('t')), v('node'));
/** `q[feature[t][node]]` — 물음점에서 이 노드가 보는 축의 값. */
const askedCoord = idx(v('q'), nodeFeature);
/** `tally[label[t][node]]` — 이 잎이 표를 넣는 칸. */
const voteBin = idx(v('tally'), nodeLabel);

export const randomForestVoteIR: IR = {
  id: 'random-forest',
  algorithm: 'randomForest',
  paradigm: 'imperative',
  functions: [
    {
      name: 'forestPredict',
      params: [
        { name: 'feature', type: tIntGrid },
        { name: 'threshold', type: tDoubleGrid },
        { name: 'left', type: tIntGrid },
        { name: 'right', type: tIntGrid },
        { name: 'label', type: tIntGrid },
        { name: 'q', type: tDoubleList },
        { name: 'n', type: tInt },
        { name: 'tally', type: tIntList },
      ],
      returnType: tInt,
      body: [
        {
          kind: 'assign',
          phase: 'reset-tally',
          target: idx(v('tally'), lit(0)),
          expr: lit(0),
        },
        {
          kind: 'assign',
          phase: 'reset-tally',
          target: idx(v('tally'), lit(1)),
          expr: lit(0),
        },
        {
          kind: 'for-range',
          phase: 'pick-tree',
          var: 't',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'var',
              phase: 'enter-root',
              name: 'node',
              type: tInt,
              init: lit(0),
            },
            {
              kind: 'while',
              phase: 'walk-down',
              cond: bin('>=', nodeLeft, lit(0)),
              body: [
                {
                  kind: 'if',
                  phase: 'ask-split',
                  cond: bin('<', askedCoord, nodeThreshold),
                  then: [
                    { kind: 'assign', phase: 'go-left', target: v('node'), expr: nodeLeft },
                  ],
                  else: [
                    { kind: 'assign', phase: 'go-right', target: v('node'), expr: nodeRight },
                  ],
                },
              ],
            },
            {
              kind: 'assign',
              phase: 'cast-vote',
              target: voteBin,
              expr: bin('+', voteBin, lit(1)),
            },
          ],
        },
        {
          kind: 'if',
          phase: 'majority',
          cond: bin('>', idx(v('tally'), lit(1)), idx(v('tally'), lit(0))),
          then: [{ kind: 'return', phase: 'majority', expr: lit(1) }],
        },
        { kind: 'return', phase: 'majority', expr: lit(0) },
      ],
    },
  ],
};

export const randomForestIRs: IR[] = [randomForestVoteIR];
