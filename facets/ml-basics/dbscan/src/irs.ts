/**
 * DBSCAN 전체를 담는 학습용 IR — 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def dbscan(x, eps2, minPts, label, stack):
 *       n = len(x)                                        # phase: begin
 *       for i in range(0, n):                             # phase: begin
 *           label[i] = 0                                  # phase: begin
 *       clusters = 0                                      # phase: begin
 *       for i in range(0, n):                             # phase: pick-seed
 *           if label[i] != 0:                             # phase: pick-seed
 *               continue                                  # phase: pick-seed
 *           count = 0                                     # phase: count-neighbors
 *           for j in range(0, n):                         # phase: count-neighbors
 *               dx = x[i][0] - x[j][0]                    # phase: count-neighbors
 *               dy = x[i][1] - x[j][1]                    # phase: count-neighbors
 *               if dx * dx + dy * dy <= eps2:             # phase: count-neighbors
 *                   count = count + 1                     # phase: count-neighbors
 *           if count < minPts:                            # phase: mark-noise
 *               label[i] = -1                             # phase: mark-noise
 *               continue                                  # phase: mark-noise
 *           clusters = clusters + 1                       # phase: open-cluster
 *           label[i] = clusters                           # phase: open-cluster
 *           top = 0                                       # phase: open-cluster
 *           stack[top] = i                                # phase: push
 *           top = top + 1                                 # phase: push
 *           while top > 0:                                # phase: pop
 *               top = top - 1                             # phase: pop
 *               q = stack[top]                            # phase: pop
 *               reach = 0                                 # phase: count-neighbors
 *               for j in range(0, n):                     # phase: count-neighbors
 *                   dx = x[q][0] - x[j][0]                # phase: count-neighbors
 *                   dy = x[q][1] - x[j][1]                # phase: count-neighbors
 *                   if dx * dx + dy * dy <= eps2:         # phase: count-neighbors
 *                       reach = reach + 1                 # phase: count-neighbors
 *               if reach >= minPts:                       # phase: core-check
 *                   for j in range(0, n):                 # phase: spread
 *                       dx = x[q][0] - x[j][0]            # phase: spread
 *                       dy = x[q][1] - x[j][1]            # phase: spread
 *                       if dx * dx + dy * dy <= eps2:     # phase: spread
 *                           if label[j] == -1:            # phase: reclaim-border
 *                               label[j] = clusters       # phase: reclaim-border
 *                           else:
 *                               if label[j] == 0:         # phase: spread
 *                                   label[j] = clusters   # phase: spread
 *                                   stack[top] = j        # phase: push
 *                                   top = top + 1         # phase: push
 *       return clusters                                   # phase: done
 *
 * ── 무엇을 펼치고 무엇을 감쌌는가
 *
 * **감싼 것이 하나도 없다.** 이름 붙인 호출은 `len` 하나뿐이고 그것은 IR 의
 * 노드(`kind: 'len'`)이지 호출이 아니다. 예약된 수학 이름 일곱(`sqrt` 포함)도
 * 부르지 않는다 — 부를 까닭이 없기 때문이다. 아래 셋이 그 까닭이다.
 *
 * 1. **거리는 제곱 그대로 견준다.** `dx*dx + dy*dy <= eps2` 다. `sqrt` 를 부르면
 *    한 줄이 늘고 셈이 느려지는 것 말고 얻는 것이 없다. eps 를 손잡이로 주는
 *    완제품이라 호출부가 `eps * eps` 를 한 번 셈해 넘기면 그만이다. 그래서
 *    진입점이 받는 것은 `eps` 가 아니라 `eps2` 다 — 인자 이름이 그 사실을 말한다.
 *
 * 2. **이웃 세기를 안쪽 루프로 폈다.** `neighbors(i)` 로 감싸면 "이 점 둘레
 *    eps 안에 몇이 있는가" 가 이름 뒤로 숨는다. DBSCAN 에서 그 셈이 곧 밀도이고
 *    밀도가 곧 이 알고리즘의 전부다. 세는 루프가 **두 번** 나오는 것도 그대로
 *    두었다 — 한 번은 씨앗이 속인지 보려고, 한 번은 꺼낸 점이 속인지 보려고
 *    센다. 그 되풀이가 "이웃 질의를 점마다 한다" 는 DBSCAN 의 값(O(n²))이다.
 *
 * 3. **스택을 배열과 꼭대기 색인으로 폈다.** `push` / `pop` 을 이름으로 부르면
 *    자료구조 이름만 남고 동작이 사라진다. `stack[top] = j; top = top + 1` 과
 *    `top = top - 1; q = stack[top]` 로 적으면 **꺼낸 것의 이웃을 다시 밀어
 *    넣는다** 는 것이 눈에 보이고, 그것이 "이웃의 이웃으로 옮아붙는다" 의 정확한
 *    뜻이다. `zeros` 를 쓸 수 없으므로 `label` 과 `stack` 은 인자로 받는다.
 *
 * ── 이름표 세 가지
 *
 * `label[i]` 는 정수 하나로 세 가지를 말한다. `0` 은 아직 보지 않은 것, `-1` 은
 * 잡음, `1` 이상은 그 번호의 무리다. 열거형을 따로 두지 않은 것은 여섯 언어가
 * 열거형 표기를 다 달리 쓰기 때문이고, 세 값이면 정수로도 읽힌다.
 *
 * ── 잡음이 가장자리가 되는 갈래
 *
 * `if label[j] == -1: label[j] = clusters` 가 그 갈래다. 이미 "잡음" 이라 적어
 * 둔 점이 나중에 어떤 속점의 eps 안에 들면 그 무리의 **가장자리**가 된다.
 * 스택에는 밀어 넣지 않는다 — 잡음으로 적혔다는 것은 이웃이 minPts 에 못 미친다는
 * 것이고, 속이 아닌 점에서는 번짐이 이어지지 않기 때문이다. 이 한 갈래가 없으면
 * 무리의 테두리가 통째로 잡음이 되어 대조표의 잡음 수가 어긋난다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'begin' | 'pick-seed' | 'count-neighbors' | 'mark-noise' | 'open-cluster' |
 *   'push' | 'pop' | 'core-check' | 'spread' | 'reclaim-border' | 'done'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tDouble: IRType = { kind: 'double' };
const tIntList: IRType = { kind: 'list', of: tInt };
const tPointList: IRType = { kind: 'list', of: { kind: 'list', of: tDouble } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** `x[i][0]` — 점 i 의 가로. 좌표를 꺼내는 데 이름을 붙이지 않는다. */
const coord = (point: IRExpr, axis: 0 | 1): IRExpr => idx(point, lit(axis));

/** `dx = x[<from>][0] - x[j][0]` 과 `dy = ...` 그리고 제곱합 견줌. 세 문장을 함께 낸다. */
function neighborTest(from: string, phase: string, then: IRStmt[]): IRStmt[] {
  return [
    {
      kind: 'var',
      phase,
      name: 'dx',
      type: tDouble,
      init: bin('-', coord(idx(v('x'), v(from)), 0), coord(idx(v('x'), v('j')), 0)),
    },
    {
      kind: 'var',
      phase,
      name: 'dy',
      type: tDouble,
      init: bin('-', coord(idx(v('x'), v(from)), 1), coord(idx(v('x'), v('j')), 1)),
    },
    {
      kind: 'if',
      phase,
      cond: bin(
        '<=',
        bin('+', bin('*', v('dx'), v('dx')), bin('*', v('dy'), v('dy'))),
        v('eps2'),
      ),
      then,
    },
  ];
}

export const dbscanIR: IR = {
  id: 'dbscan',
  algorithm: 'dbscan',
  paradigm: 'imperative',
  functions: [
    {
      name: 'dbscan',
      params: [
        { name: 'x', type: tPointList },
        { name: 'eps2', type: tDouble },
        { name: 'minPts', type: tInt },
        { name: 'label', type: tIntList },
        { name: 'stack', type: tIntList },
      ],
      returnType: tInt,
      body: [
        { kind: 'var', phase: 'begin', name: 'n', type: tInt, init: len(v('x')) },
        {
          kind: 'for-range',
          phase: 'begin',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [{ kind: 'assign', phase: 'begin', target: idx(v('label'), v('i')), expr: lit(0) }],
        },
        { kind: 'var', phase: 'begin', name: 'clusters', type: tInt, init: lit(0) },
        {
          kind: 'for-range',
          phase: 'pick-seed',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              phase: 'pick-seed',
              cond: bin('!=', idx(v('label'), v('i')), lit(0)),
              then: [{ kind: 'continue', phase: 'pick-seed' }],
            },
            { kind: 'var', phase: 'count-neighbors', name: 'count', type: tInt, init: lit(0) },
            {
              kind: 'for-range',
              phase: 'count-neighbors',
              var: 'j',
              from: lit(0),
              to: v('n'),
              inclusive: false,
              body: neighborTest('i', 'count-neighbors', [
                {
                  kind: 'assign',
                  phase: 'count-neighbors',
                  target: v('count'),
                  expr: bin('+', v('count'), lit(1)),
                },
              ]),
            },
            {
              kind: 'if',
              phase: 'mark-noise',
              cond: bin('<', v('count'), v('minPts')),
              then: [
                {
                  kind: 'assign',
                  phase: 'mark-noise',
                  target: idx(v('label'), v('i')),
                  expr: lit(-1),
                },
                { kind: 'continue', phase: 'mark-noise' },
              ],
            },
            {
              kind: 'assign',
              phase: 'open-cluster',
              target: v('clusters'),
              expr: bin('+', v('clusters'), lit(1)),
            },
            {
              kind: 'assign',
              phase: 'open-cluster',
              target: idx(v('label'), v('i')),
              expr: v('clusters'),
            },
            { kind: 'var', phase: 'open-cluster', name: 'top', type: tInt, init: lit(0) },
            {
              kind: 'assign',
              phase: 'push',
              target: idx(v('stack'), v('top')),
              expr: v('i'),
            },
            { kind: 'assign', phase: 'push', target: v('top'), expr: bin('+', v('top'), lit(1)) },
            {
              kind: 'while',
              phase: 'pop',
              cond: bin('>', v('top'), lit(0)),
              body: [
                { kind: 'assign', phase: 'pop', target: v('top'), expr: bin('-', v('top'), lit(1)) },
                { kind: 'var', phase: 'pop', name: 'q', type: tInt, init: idx(v('stack'), v('top')) },
                { kind: 'var', phase: 'count-neighbors', name: 'reach', type: tInt, init: lit(0) },
                {
                  kind: 'for-range',
                  phase: 'count-neighbors',
                  var: 'j',
                  from: lit(0),
                  to: v('n'),
                  inclusive: false,
                  body: neighborTest('q', 'count-neighbors', [
                    {
                      kind: 'assign',
                      phase: 'count-neighbors',
                      target: v('reach'),
                      expr: bin('+', v('reach'), lit(1)),
                    },
                  ]),
                },
                {
                  kind: 'if',
                  phase: 'core-check',
                  cond: bin('>=', v('reach'), v('minPts')),
                  then: [
                    {
                      kind: 'for-range',
                      phase: 'spread',
                      var: 'j',
                      from: lit(0),
                      to: v('n'),
                      inclusive: false,
                      body: neighborTest('q', 'spread', [
                        {
                          kind: 'if',
                          phase: 'reclaim-border',
                          cond: bin('==', idx(v('label'), v('j')), lit(-1)),
                          then: [
                            {
                              kind: 'assign',
                              phase: 'reclaim-border',
                              target: idx(v('label'), v('j')),
                              expr: v('clusters'),
                            },
                          ],
                          else: [
                            {
                              kind: 'if',
                              phase: 'spread',
                              cond: bin('==', idx(v('label'), v('j')), lit(0)),
                              then: [
                                {
                                  kind: 'assign',
                                  phase: 'spread',
                                  target: idx(v('label'), v('j')),
                                  expr: v('clusters'),
                                },
                                {
                                  kind: 'assign',
                                  phase: 'push',
                                  target: idx(v('stack'), v('top')),
                                  expr: v('j'),
                                },
                                {
                                  kind: 'assign',
                                  phase: 'push',
                                  target: v('top'),
                                  expr: bin('+', v('top'), lit(1)),
                                },
                              ],
                            },
                          ],
                        },
                      ]),
                    },
                  ],
                },
              ],
            },
          ],
        },
        { kind: 'return', phase: 'done', expr: v('clusters') },
      ] satisfies IRStmt[],
    },
  ],
};

export const dbscanIRs: IR[] = [dbscanIR];
