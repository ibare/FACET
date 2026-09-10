/**
 * 선형 SVM (소프트 마진) 의 훈련 한 걸음 IR — 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def svm_step(x, y, w, g, b, C, lr):
 *       n = len(x)                                              # phase: step-begin
 *       loss = 0.5 * (w[0]*w[0] + w[1]*w[1])                    # phase: step-begin
 *       g[0] = w[0]                                             # phase: regularize
 *       g[1] = w[1]                                             # phase: regularize
 *       gb = 0                                                  # phase: regularize
 *       for i in range(0, n):                                   # phase: scan-point
 *           m = y[i] * (w[0]*x[i][0] + w[1]*x[i][1] + b)        # phase: margin
 *           loss = loss + C * max(0, 1 - m)                     # phase: hinge
 *           if m < 1:                                           # phase: violated
 *               g[0] = g[0] + C * (-y[i] * x[i][0])             # phase: accumulate
 *               g[1] = g[1] + C * (-y[i] * x[i][1])             # phase: accumulate
 *               gb = gb + C * -y[i]                             # phase: accumulate
 *       w[0] = w[0] - lr * g[0] / n                             # phase: update
 *       w[1] = w[1] - lr * g[1] / n                             # phase: update
 *       b = b - lr * gb / n                                     # phase: update
 *       return b                                                # phase: update
 *
 * ── 왜 한 걸음이 진입점인가
 *
 * SVM 을 실제로 푸는 방법으로 SMO 가 널리 알려져 있으나, 그것을 펼치면 코드
 * 패널이 "SVM 이 무엇인가" 대신 "SMO 가 어떻게 도는가" 를 말하게 된다. 선형
 * SVM 은 힌지 손실 + 준경사하강으로 실제로 훈련하며, 그 한 걸음이 곧 이 모형의
 * 정의다 — `max(0, 1 - y(w·x+b))` 와 `if m < 1` 두 줄에 전부 들어 있다.
 *
 * ── 무엇을 펼치고 무엇을 감쌌는가
 *
 * 감싼 것은 `max` 하나뿐이고 그것은 `IR_MATH_BUILTINS` 의 예약 이름이라 여섯
 * 언어가 각자의 표기로 옮긴다 (`max` · `Math.max` · `std::max` · `Math.Max`).
 * 나머지는 전부 펼쳐 썼다.
 *
 * 특히 여백 `m = y[i] * (w[0]*x[i][0] + w[1]*x[i][1] + b)` 는 내적을 좌표
 * 하나하나로 편 것이다. `dot(w, x[i])` 로 감싸면 "이름표의 부호를 곱한다" 는
 * 이 모형의 유일한 장치가 코드에서 사라진다. 준기울기 갱신
 * `g[0] + C * (-y[i] * x[i][0])` 도 마찬가지다 — 밀리는 방향이 이름표의
 * 부호에서 온다는 것이 그 식의 전부다.
 *
 * ── 가장 중요한 줄은 `if m < 1` 이다
 *
 * 여백을 이미 지킨 점은 `g` 를 전혀 건드리지 않는다. 곧 **선을 조금도 밀지
 * 않는다.** 서포트 벡터가 무엇인지가 이 조건문 하나에 들어 있으므로, 이것을
 * `hinge_grad(...)` 로 감싸는 것은 이 IR 을 두는 까닭을 지우는 일이다.
 *
 * ── `zeros` 를 쓰지 않는다
 *
 * 준기울기를 담을 자리 `g` 는 인자로 받는다. 배열을 새로 만드는 이름은 어느
 * 언어에도 공통으로 없어서 (`IR_MATH_BUILTINS` 주석 참조) 여섯 언어 어디서도
 * 돌지 않기 때문이다. 호출부가 만들어 넘기고, 이 함수는 매 걸음 `g` 를 `w` 로
 * 덮어써 다시 쓴다.
 *
 * ── `loss` 는 셈하고 돌려주지 않는다
 *
 * `L = (1/2)|w|² + C·Σ max(0, 1 - m)` 이 최소화 대상이고, 그것을 코드에 두지
 * 않으면 `if m < 1` 이 어디서 온 조건인지 알 길이 없다. 반환값 자리는 `b` 가
 * 쓴다 — `w` 와 `g` 는 배열이라 제자리에서 갱신되지만 `b` 는 스칼라라 돌려주는
 * 수밖에 없다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'step-begin' | 'regularize' | 'scan-point' | 'margin' |
 *   'hinge' | 'violated' | 'accumulate' | 'update'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tDouble: IRType = { kind: 'double' };
const tInt: IRType = { kind: 'int' };
const tDoubleList: IRType = { kind: 'list', of: tDouble };
const tDoubleGrid: IRType = { kind: 'list', of: tDoubleList };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const neg = (x: IRExpr): IRExpr => ({ kind: 'unop', op: '-', x });
const bin = (
  op: '+' | '-' | '*' | '/' | '<',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** `y[i]` — 이름표. −1 또는 +1 이고 힌지 손실이 그 부호를 쓴다. */
const yi = idx(v('y'), v('i'));
/** `x[i][0]` · `x[i][1]` — i 번째 점의 두 좌표. */
const xi0 = idx(idx(v('x'), v('i')), lit(0));
const xi1 = idx(idx(v('x'), v('i')), lit(1));

/** `w[0]*x[i][0] + w[1]*x[i][1] + b` — 내적을 좌표로 펼친 것. */
const score: IRExpr = bin(
  '+',
  bin('+', bin('*', idx(v('w'), lit(0)), xi0), bin('*', idx(v('w'), lit(1)), xi1)),
  v('b'),
);

/** `w[j] - lr * g[j] / n` — 준기울기의 평균만큼 물러난다. */
const descend = (j: number): IRExpr =>
  bin(
    '-',
    idx(v('w'), lit(j)),
    bin('/', bin('*', v('lr'), idx(v('g'), lit(j))), v('n')),
  );

/** `g[j] = g[j] + C * (-y[i] * x[i][j])` — 여백을 못 지킨 점만 선을 민다. */
const accumulate = (j: number, coord: IRExpr): IRStmt => ({
  kind: 'assign',
  target: idx(v('g'), lit(j)),
  expr: bin('+', idx(v('g'), lit(j)), bin('*', v('C'), bin('*', neg(yi), coord))),
  phase: 'accumulate',
});

const body: IRStmt[] = [
  { kind: 'var', name: 'n', type: tInt, init: len(v('x')), phase: 'step-begin' },
  {
    kind: 'var',
    name: 'loss',
    type: tDouble,
    // L = (1/2)|w|² + C·Σ max(0, 1 - m). 정칙항에서 시작해 힌지를 더해 간다.
    init: bin(
      '*',
      lit(0.5),
      bin(
        '+',
        bin('*', idx(v('w'), lit(0)), idx(v('w'), lit(0))),
        bin('*', idx(v('w'), lit(1)), idx(v('w'), lit(1))),
      ),
    ),
    phase: 'step-begin',
  },
  // 정칙항의 기울기는 w 그 자체다 — g 를 w 에서 시작한다.
  { kind: 'assign', target: idx(v('g'), lit(0)), expr: idx(v('w'), lit(0)), phase: 'regularize' },
  { kind: 'assign', target: idx(v('g'), lit(1)), expr: idx(v('w'), lit(1)), phase: 'regularize' },
  // 절편에는 정칙항이 없다.
  { kind: 'var', name: 'gb', type: tDouble, init: lit(0), phase: 'regularize' },
  {
    kind: 'for-range',
    var: 'i',
    from: lit(0),
    to: v('n'),
    inclusive: false,
    phase: 'scan-point',
    body: [
      { kind: 'var', name: 'm', type: tDouble, init: bin('*', yi, score), phase: 'margin' },
      {
        kind: 'assign',
        target: v('loss'),
        expr: bin(
          '+',
          v('loss'),
          bin('*', v('C'), call('max', [lit(0), bin('-', lit(1), v('m'))])),
        ),
        phase: 'hinge',
      },
      {
        kind: 'if',
        cond: bin('<', v('m'), lit(1)),
        phase: 'violated',
        then: [
          accumulate(0, xi0),
          accumulate(1, xi1),
          {
            kind: 'assign',
            target: v('gb'),
            expr: bin('+', v('gb'), bin('*', v('C'), neg(yi))),
            phase: 'accumulate',
          },
        ],
      },
    ],
  },
  { kind: 'assign', target: idx(v('w'), lit(0)), expr: descend(0), phase: 'update' },
  { kind: 'assign', target: idx(v('w'), lit(1)), expr: descend(1), phase: 'update' },
  {
    kind: 'assign',
    target: v('b'),
    expr: bin('-', v('b'), bin('/', bin('*', v('lr'), v('gb')), v('n'))),
    phase: 'update',
  },
  { kind: 'return', expr: v('b'), phase: 'update' },
];

export const svmStepIR: IR = {
  id: 'svm',
  algorithm: 'svm',
  paradigm: 'imperative',
  functions: [
    {
      name: 'svm_step',
      params: [
        { name: 'x', type: tDoubleGrid },
        { name: 'y', type: tDoubleList },
        { name: 'w', type: tDoubleList },
        { name: 'g', type: tDoubleList },
        { name: 'b', type: tDouble },
        { name: 'C', type: tDouble },
        { name: 'lr', type: tDouble },
      ],
      returnType: tDouble,
      body,
    },
  ],
};

export const svmIRs: IR[] = [svmStepIR];
