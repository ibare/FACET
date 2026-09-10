/**
 * k-최근접 이웃의 판정 함수 IR — 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def classify(points, labels, query, k, dist, used):
 *       # squaring keeps the order, so the square root is never taken
 *       n = len(points)                                              # phase: measure
 *       for i in range(0, n):                                        # phase: measure
 *           dist[i] = (points[i][0] - query[0]) * (points[i][0] - query[0])
 *                   + (points[i][1] - query[1]) * (points[i][1] - query[1])
 *           used[i] = 0
 *       votesA = 0                                                   # phase: tally-init
 *       votesB = 0                                                   # phase: tally-init
 *       for t in range(0, k):                                        # phase: pick-nearest
 *           best = -1
 *           bestDist = 0
 *           for i in range(0, n):
 *               if used[i] == 0 and (best == -1 or dist[i] < bestDist):
 *                   best = i
 *                   bestDist = dist[i]
 *           used[best] = 1                                           # phase: take-neighbor
 *           if labels[best] == 0:                                    # phase: vote
 *               votesA = votesA + 1
 *           else:
 *               votesB = votesB + 1
 *       if votesA > votesB:                                          # phase: decide
 *           return 0
 *       return 1
 *
 * ── 학습이 없다는 것이 코드에 그대로 있다
 *
 * 진입점은 **물음점 하나**의 부류를 정하는 함수다. 모형도 없고 계수도 없고
 * 미리 셈해 둔 것도 없다 — 물을 때마다 `points` 열여덟을 처음부터 끝까지
 * 훑는다. 평면의 자리 576 곳을 물으면 이 함수가 576 번 불리고 그때마다 열여덟을
 * 다시 잰다. 그것이 "게으른 학습" 이라 불리는 것의 전부이고, 코드 패널이
 * 보이는 것도 그것이다.
 *
 * ── sqrt 를 부르지 않는 까닭
 *
 * `sqrt` 는 `IR_MATH_BUILTINS` 에 있으니 불러도 여섯 언어가 다 옮긴다. 그런데
 * 부르지 않았다. **제곱근은 단조 증가 함수라 씌워도 가까운 차례가 바뀌지
 * 않기 때문**이다. 여기서 거리로 하는 일은 견주는 것뿐이므로 제곱 그대로 견주면
 * 된다. 코드 안에 주석 한 줄로 남겨 두었다 — 그 한 줄이 이 알고리즘에서 거리가
 * "얼마나 먼가" 가 아니라 "누가 더 가까운가" 로만 쓰인다는 사실을 말한다.
 *
 * ── 무엇을 펼치고 무엇을 감쌌는가
 *
 * **감싼 것은 없다.** 이름 붙인 호출이 0 건이다.
 *
 *   - 거리식을 `d(i, q)` 로 감싸지 않았다. `(points[i][0] - query[0])` 의 제곱
 *     둘을 더하는 것이 이 알고리즘이 자료에 대해 아는 전부라, 감싸면 코드 패널이
 *     "가까움" 을 어떻게 정의했는지 말할 수 없게 된다. 유클리드가 아니라
 *     맨해튼을 쓰면 경계가 달라진다는 것도 이 식이 펼쳐져 있어야 보인다.
 *   - k 개 고르기를 `sort` 나 `nsmallest` 로 부르지 않았다. **선택 정렬처럼**
 *     k 번 돌며 매번 아직 안 뽑힌 것 중 가장 가까운 것을 찾는다. 정렬을 부르면
 *     "k 가 커질수록 더 많이 훑는다" 는 사실이 라이브러리 안으로 숨는다.
 *   - 다수결도 `count` 로 부르지 않고 `votesA` / `votesB` 두 칸에 세어 편다.
 *
 * ── `zeros` 대신 인자
 *
 * `dist` 와 `used` 는 작업용 배열이라 함수 안에서 만들어야 할 것 같지만,
 * 배열을 새로 만드는 표기는 언어마다 뜻이 갈려 한 이름으로 덮을 수 없다
 * (`zeros(n)` 은 어느 언어에도 없는 이름이다). **인자로 받는다.** 호출부가
 * 만들어 넘기고 함수는 첫 루프에서 `used[i] = 0` 으로 되돌려 놓으므로,
 * 576 번 부르는 동안 같은 두 배열을 되쓸 수 있다.
 *
 * ── 이름 고르기
 *
 * 여섯 언어를 한꺼번에 통과하는 것으로 골랐다. `class` 는 넷의 예약어라
 * 이름표를 `labels` 로, 값은 `0` (A) 과 `1` (B) 두 정수로 적었다. 물음점을
 * `p` 가 아니라 `query` 로 둔 것은 `points` 와 첫 글자로만 갈리는 이름이 코드
 * 패널에서 읽히지 않기 때문이다. `t` 는 몇 번째 이웃을 뽑는 차례인지의 셈이며
 * 자리 번호 `i` 와 갈라 둔다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'measure' | 'tally-init' | 'pick-nearest' | 'take-neighbor' | 'vote' | 'decide'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tDouble: IRType = { kind: 'double' };
const tIntList: IRType = { kind: 'list', of: tInt };
const tDoubleList: IRType = { kind: 'list', of: tDouble };
const tDoubleGrid: IRType = { kind: 'list', of: tDoubleList };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** `points[i][0] - query[0]` — 가로 차. */
const gapX = bin('-', idx(idx(v('points'), v('i')), lit(0)), idx(v('query'), lit(0)));
/** `points[i][1] - query[1]` — 세로 차. */
const gapY = bin('-', idx(idx(v('points'), v('i')), lit(1)), idx(v('query'), lit(1)));

/**
 * `(points[i][0]-query[0])*(points[i][0]-query[0]) + (points[i][1]-query[1])*(points[i][1]-query[1])`
 *
 * 제곱을 `pow` 로도 `sqrt` 로도 감싸지 않는다. 곱을 두 번 적는 것이 길지만,
 * 이 식이 곧 "가까움" 의 정의라 펼쳐 두어야 코드 패널이 그것을 말한다.
 */
const squaredGap: IRExpr = bin('+', bin('*', gapX, gapX), bin('*', gapY, gapY));

/** `used[i] == 0 && (best == -1 || dist[i] < bestDist)` — 아직 안 뽑혔고 지금까지 중 가장 가깝다. */
const isCloserUnused: IRExpr = bin(
  '&&',
  bin('==', idx(v('used'), v('i')), lit(0)),
  bin(
    '||',
    bin('==', v('best'), lit(-1)),
    bin('<', idx(v('dist'), v('i')), v('bestDist')),
  ),
);

/** 안쪽 훑기 — 아직 안 뽑힌 것 중 가장 가까운 자리를 찾는다. */
const scanForNearest: IRStmt = {
  kind: 'for-range',
  phase: 'pick-nearest',
  var: 'i',
  from: lit(0),
  to: v('n'),
  inclusive: false,
  body: [
    {
      kind: 'if',
      phase: 'pick-nearest',
      cond: isCloserUnused,
      then: [
        { kind: 'assign', phase: 'pick-nearest', target: v('best'), expr: v('i') },
        {
          kind: 'assign',
          phase: 'pick-nearest',
          target: v('bestDist'),
          expr: idx(v('dist'), v('i')),
        },
      ],
    },
  ],
};

export const knnClassifyIR: IR = {
  id: 'knn',
  algorithm: 'knn',
  paradigm: 'imperative',
  functions: [
    {
      name: 'classify',
      params: [
        { name: 'points', type: tDoubleGrid },
        { name: 'labels', type: tIntList },
        { name: 'query', type: tDoubleList },
        { name: 'k', type: tInt },
        { name: 'dist', type: tDoubleList },
        { name: 'used', type: tIntList },
      ],
      returnType: tInt,
      body: [
        {
          kind: 'comment',
          text: 'squaring keeps the order, so the square root is never taken',
        },
        { kind: 'var', phase: 'measure', name: 'n', type: tInt, init: len(v('points')) },
        {
          kind: 'for-range',
          phase: 'measure',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'assign',
              phase: 'measure',
              target: idx(v('dist'), v('i')),
              expr: squaredGap,
            },
            {
              kind: 'assign',
              phase: 'measure',
              target: idx(v('used'), v('i')),
              expr: lit(0),
            },
          ],
        },
        { kind: 'var', phase: 'tally-init', name: 'votesA', type: tInt, init: lit(0) },
        { kind: 'var', phase: 'tally-init', name: 'votesB', type: tInt, init: lit(0) },
        {
          kind: 'for-range',
          phase: 'pick-nearest',
          var: 't',
          from: lit(0),
          to: v('k'),
          inclusive: false,
          body: [
            { kind: 'var', phase: 'pick-nearest', name: 'best', type: tInt, init: lit(-1) },
            {
              kind: 'var',
              phase: 'pick-nearest',
              name: 'bestDist',
              type: tDouble,
              init: lit(0),
            },
            scanForNearest,
            {
              kind: 'assign',
              phase: 'take-neighbor',
              target: idx(v('used'), v('best')),
              expr: lit(1),
            },
            {
              kind: 'if',
              phase: 'vote',
              cond: bin('==', idx(v('labels'), v('best')), lit(0)),
              then: [
                {
                  kind: 'assign',
                  phase: 'vote',
                  target: v('votesA'),
                  expr: bin('+', v('votesA'), lit(1)),
                },
              ],
              else: [
                {
                  kind: 'assign',
                  phase: 'vote',
                  target: v('votesB'),
                  expr: bin('+', v('votesB'), lit(1)),
                },
              ],
            },
          ],
        },
        {
          kind: 'if',
          phase: 'decide',
          cond: bin('>', v('votesA'), v('votesB')),
          then: [{ kind: 'return', phase: 'decide', expr: lit(0) }],
        },
        { kind: 'return', phase: 'decide', expr: lit(1) },
      ],
    },
  ],
};

export const knnIRs: IR[] = [knnClassifyIR];
