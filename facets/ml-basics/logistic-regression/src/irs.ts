/**
 * 로지스틱 회귀의 학습 한 판을 담은 IR — 함수 둘.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def train_step(x, y, w, b, g, eta):
 *       n = len(x)                                      # phase: reset-gradient
 *       for j in range(0, len(w)):                      # phase: reset-gradient
 *           g[j] = 0                                    # phase: reset-gradient
 *       gb = 0                                          # phase: reset-gradient
 *       for i in range(0, n):                           # phase: forward
 *           z = w[0] * x[i][0] + w[1] * x[i][1] + b     # phase: forward
 *           p = sigmoid(z)                              # phase: squash
 *           d = p - y[i]                                # phase: accumulate
 *           for j in range(0, len(w)):                  # phase: accumulate
 *               g[j] = g[j] + d * x[i][j]               # phase: accumulate
 *           gb = gb + d                                 # phase: accumulate
 *       for j in range(0, len(w)):                      # phase: update
 *           w[j] = w[j] - eta * g[j] / n                # phase: update
 *       b = b - eta * gb / n                            # phase: update
 *       return b                                        # phase: update
 *
 *   def sigmoid(z):
 *       return 1 / (1 + exp(-z))                        # phase: squash
 *
 * ── 진입점이 학습 "한 판" 인 까닭
 *
 * 600 걸음을 IR 안에서 돌리면 코드 패널이 보이는 것은 바깥 루프 하나뿐이고,
 * 정작 이 알고리즘인 것 — 확률로 접고, 어긋난 만큼을 모으고, 그만큼 무게를
 * 미는 것 — 은 안쪽에 묻힌다. 그래서 진입점을 한 판으로 잘랐다. 몇 판을
 * 돌릴지는 호출부(재생)의 일이고, 한 판이 무엇을 하는지가 IR 의 일이다.
 *
 * ── 배열은 인자로 받는다
 *
 * `zeros(n)` 을 쓰지 않는다. 어느 언어에도 그런 이름이 없어 여섯 어디서도
 * 돌지 않는 이름을 지어내는 일이기 때문이다. 무게 `w` 와 기울기 누적통 `g` 는
 * **호출부가 만들어 넘긴다.** 배열은 여섯 언어 모두 참조 의미라 판이 끝나면
 * 호출부의 `w` 가 갱신되어 있다.
 *
 * 치우침 `b` 만은 수 하나라 참조로 돌려줄 길이 없어 **반환값**으로 낸다.
 * 배열은 밀어 넣고 수는 돌려받는 이 어긋남은 감추는 것보다 드러내는 편이
 * 낫다 — 여섯 언어가 값과 참조를 어떻게 가르는지가 바로 그 자리에 보인다.
 *
 * ── 무엇을 펼치고 무엇을 감쌌는가
 *
 * 감싼 것은 `sigmoid(z)` 하나뿐이고, 그것도 감춘 것이 아니다. IR 함수로
 * 정의했으므로 여섯 언어가 저마다 그 본문을 함께 낸다 — 본문에 나눗셈과
 * `exp` 가 펼쳐져 있으니 코드 패널이 "무한한 축이 0~1 로 접히는" 그 한 줄을
 * 그대로 보인다. 시그모이드는 이 알고리즘의 **이름 있는 부품**이라 이름을
 * 주는 편이 오히려 무엇이 무엇인지 말한다.
 *
 * `exp` 는 예약된 수학 이름 일곱 중 하나라(`IR_MATH_BUILTINS`) 그냥 부른다.
 * 인터프리터가 실제로 셈하고 transpiler 가 `math.exp` · `Math.exp` ·
 * `std::exp` · `Math.Exp` 로 옮긴다. 테일러로 펴면 코드 패널이 알고리즘 대신
 * 급수를 보이게 된다.
 *
 * 펼친 것:
 *   - `z = w[0] * x[i][0] + w[1] * x[i][1] + b` — 두 무게가 두 축에 각각
 *     붙는다는 것이 이 모형의 전부다. `dot(w, x[i])` 로 감싸면 코드 패널이
 *     할 말을 잃는다.
 *   - `g[j] = g[j] + d * x[i][j]` — 어긋난 만큼(`d`)에 그 축의 값을 곱해
 *     쌓는다. 기울기가 왜 저 모양인지가 이 한 줄에 있다.
 *   - `w[j] = w[j] - eta * g[j] / n` — 평균 기울기의 반대쪽으로 학습률만큼.
 *
 * ── 되풀이되는 축 훑기
 *
 * `z` 는 `w[0]`, `w[1]` 로 펼쳐 쓰고 기울기 쪽은 `j` 로 훑는다. 어긋나 보이나
 * 뜻이 다르다 — 앞은 "두 축의 선형 결합" 을 눈에 보이려는 것이고, 뒤는
 * "축마다 같은 규칙" 을 보이려는 것이다. 사양이 그렇게 적었고, 그 편이
 * 코드 패널에서 두 사실을 따로 읽게 한다.
 *
 * ── C++ 전방 선언
 *
 * 함수가 둘이라 C++ emitter 가 앞에 선언 둘을 낸다. `train_step` 이 먼저
 * 정의되면서 아직 보이지 않는 `sigmoid` 를 부르기 때문이다. 나머지 다섯은
 * 그 문제가 없다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'reset-gradient' | 'forward' | 'squash' | 'accumulate' | 'update'
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
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const neg = (x: IRExpr): IRExpr => ({ kind: 'unop', op: '-', x });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** `x[i][0]` — i 번째 점의 첫째 축. */
const xi0 = idx(idx(v('x'), v('i')), lit(0));
/** `x[i][1]` — i 번째 점의 둘째 축. */
const xi1 = idx(idx(v('x'), v('i')), lit(1));
/** `x[i][j]` — i 번째 점의 j 번째 축. */
const xij = idx(idx(v('x'), v('i')), v('j'));

/** 축마다 같은 일을 하는 루프. 본문만 갈아 끼운다. */
const forEachAxis = (phase: string, body: IRStmt[]): IRStmt => ({
  kind: 'for-range',
  phase,
  var: 'j',
  from: lit(0),
  to: len(v('w')),
  inclusive: false,
  body,
});

/** `1 / (1 + exp(-z))` — 무한한 축을 0~1 띠로 접는 그 한 줄. */
const squash = bin('/', lit(1), bin('+', lit(1), call('exp', [neg(v('z'))])));

export const logisticRegressionTrainStepIR: IR = {
  id: 'logistic-regression',
  algorithm: 'logisticRegression',
  paradigm: 'imperative',
  functions: [
    {
      name: 'train_step',
      params: [
        { name: 'x', type: tDoubleGrid },
        { name: 'y', type: tIntList },
        { name: 'w', type: tDoubleList },
        { name: 'b', type: tDouble },
        { name: 'g', type: tDoubleList },
        { name: 'eta', type: tDouble },
      ],
      returnType: tDouble,
      body: [
        { kind: 'var', phase: 'reset-gradient', name: 'n', type: tInt, init: len(v('x')) },
        forEachAxis('reset-gradient', [
          { kind: 'assign', phase: 'reset-gradient', target: idx(v('g'), v('j')), expr: lit(0) },
        ]),
        { kind: 'var', phase: 'reset-gradient', name: 'gb', type: tDouble, init: lit(0) },
        {
          kind: 'for-range',
          phase: 'forward',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'var',
              phase: 'forward',
              name: 'z',
              type: tDouble,
              init: bin(
                '+',
                bin('+', bin('*', idx(v('w'), lit(0)), xi0), bin('*', idx(v('w'), lit(1)), xi1)),
                v('b'),
              ),
            },
            {
              kind: 'var',
              phase: 'squash',
              name: 'p',
              type: tDouble,
              init: call('sigmoid', [v('z')]),
            },
            {
              kind: 'var',
              phase: 'accumulate',
              name: 'd',
              type: tDouble,
              init: bin('-', v('p'), idx(v('y'), v('i'))),
            },
            forEachAxis('accumulate', [
              {
                kind: 'assign',
                phase: 'accumulate',
                target: idx(v('g'), v('j')),
                expr: bin('+', idx(v('g'), v('j')), bin('*', v('d'), xij)),
              },
            ]),
            { kind: 'assign', phase: 'accumulate', target: v('gb'), expr: bin('+', v('gb'), v('d')) },
          ],
        },
        forEachAxis('update', [
          {
            kind: 'assign',
            phase: 'update',
            target: idx(v('w'), v('j')),
            expr: bin(
              '-',
              idx(v('w'), v('j')),
              bin('/', bin('*', v('eta'), idx(v('g'), v('j'))), v('n')),
            ),
          },
        ]),
        {
          kind: 'assign',
          phase: 'update',
          target: v('b'),
          expr: bin('-', v('b'), bin('/', bin('*', v('eta'), v('gb')), v('n'))),
        },
        { kind: 'return', phase: 'update', expr: v('b') },
      ],
    },
    {
      name: 'sigmoid',
      params: [{ name: 'z', type: tDouble }],
      returnType: tDouble,
      body: [{ kind: 'return', phase: 'squash', expr: squash }],
    },
  ],
};

export const logisticRegressionIRs: IR[] = [logisticRegressionTrainStepIR];
