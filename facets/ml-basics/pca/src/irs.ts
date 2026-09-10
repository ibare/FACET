/**
 * 주성분 분석의 학습용 IR — 함수 둘. 진입점은 **거듭제곱 반복 한 걸음**이다.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def power_step(sxx, sxy, syy, v):
 *       ox = v[0]                                  # phase: multiply
 *       oy = v[1]                                  # phase: multiply
 *       wx = sxx * v[0] + sxy * v[1]               # phase: multiply
 *       wy = sxy * v[0] + syy * v[1]               # phase: multiply
 *       m = sqrt(wx * wx + wy * wy)                # phase: normalize
 *       v[0] = wx / m                              # phase: normalize
 *       v[1] = wy / m                              # phase: normalize
 *       dx = v[0] - ox                             # phase: measure-turn
 *       dy = v[1] - oy                             # phase: measure-turn
 *       return sqrt(dx * dx + dy * dy)             # phase: measure-turn
 *
 *   def covariance(xs, ys, out):
 *       n = len(xs)                                # phase: center
 *       mx = 0.0                                   # phase: center
 *       my = 0.0                                   # phase: center
 *       for i in range(0, n):                      # phase: center
 *           mx = mx + xs[i]
 *           my = my + ys[i]
 *       mx = mx / n
 *       my = my / n
 *       sxx = 0.0                                  # phase: covariance
 *       sxy = 0.0
 *       syy = 0.0
 *       for i in range(0, n):                      # phase: covariance
 *           dx = xs[i] - mx
 *           dy = ys[i] - my
 *           sxx = sxx + dx * dx
 *           sxy = sxy + dx * dy
 *           syy = syy + dy * dy
 *       out[0] = sxx / n
 *       out[1] = sxy / n
 *       out[2] = syy / n
 *
 * ── 왜 거듭제곱 반복인가
 *
 * 2차원 PCA 의 답은 `atan2(2*sxy, sxx - syy) / 2` 한 줄로도 나온다. 그런데
 * `atan2` 는 예약 이름 일곱(`IR_MATH_BUILTINS`)에 없고, 있다 해도 그 한 줄은
 * **PCA 를 어떻게 푸는지 말하지 않는다** — 2×2 에서만 도는 공식이라 코드 패널이
 * "PCA 는 이렇게 푼다" 고 말하면 거짓이 된다. 각도를 0°부터 180°까지 훑어
 * 가장 넓은 자리를 고르는 것도 마찬가지다. 그것은 조각이 한 장면을 보이려고
 * 쓰는 편법이지 푸는 방법이 아니다.
 *
 * 거듭제곱 반복은 열 줄이고, 차원이 몇이든 그대로 돌며, 실제로 큰 행렬에서
 * 쓰는 방법이다. 게다가 **몇 걸음에 멎는가가 그 자체로 답의 일부**다 — 고윳값
 * 둘의 비가 클수록 한 걸음에 끝난다. 닫힌 형태에는 그 정보가 없다.
 *
 * ── 무엇을 펼치고 무엇을 감쌌는가
 *
 * `w = S·v` 를 행렬 곱 호출로 감싸지 않고 두 줄로 폈다. 이 IR 이 말하려는
 * 것이 바로 **무엇을 곱하고 있는가** 이므로, `matvec(S, v)` 로 감싸면 코드
 * 패널이 할 말을 잃는다 (heap-binary IR 의 `parent(i)` 와 같은 자리다).
 * 정규화도 마찬가지로 `m` 을 눈에 보이게 두고 두 번 나눈다.
 *
 * 이름 붙인 호출은 `sqrt` 뿐이고 그것은 예약 이름이라 여섯 언어가 각자
 * 표기로 옮긴다 (`math.sqrt` · `Math.sqrt` · `std::sqrt` · `Math.Sqrt`).
 *
 * `zeros` 는 쓰지 않는다 — 어느 언어에도 그 이름이 없다. `v` (길이 2) 와
 * `out` (길이 3) 은 **인자로 받는다.** 호출부가 만들어 넘기고, 함수는 그
 * 자리에 답을 적는다.
 *
 * ── 돌려주는 것
 *
 * `power_step` 이 돌려주는 것은 새 벡터가 아니라 **이번 걸음에 벡터가 돌아간
 * 정도**다. 새 벡터는 `v` 에 그대로 적히므로 돌려줄 것이 없고, 부르는 쪽이
 * 정말 알고 싶은 것은 "아직 움직이는가" 이기 때문이다. 둘 다 단위 벡터라
 * 두 끝 사이의 거리가 곧 돌아간 각(라디안)에 가깝다 — 0 에 가까워지면 멎은
 * 것이다.
 *
 * ── 공분산을 왜 함께 두는가
 *
 * 진입점만 두면 코드 패널이 `sxx`·`sxy`·`syy` 를 하늘에서 떨어진 수로 보인다.
 * 이 완제품의 주장이 "**축의 단위를 바꾸면 그 수들이 바뀌고, 그래서 답이
 * 바뀐다**" 이므로 그 수가 어디서 오는지가 화면에 있어야 한다. `n` 으로
 * 나눈다 (표본 보정 `n-1` 을 쓰지 않는다 — 주축의 방향은 어느 쪽이든 같고,
 * 나누는 수가 둘로 갈리면 화면의 수와 견줄 수 없다).
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'center' | 'covariance' | 'multiply' | 'normalize' | 'measure-turn'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tDouble: IRType = { kind: 'double' };
const tDoubleList: IRType = { kind: 'list', of: tDouble };
const tVoid: IRType = { kind: 'void' };

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

/** `sqrt(a * a + b * b)` — 길이. 곱셈 둘을 펴 두어야 무엇의 길이인지 보인다. */
const hypot = (a: IRExpr, b: IRExpr): IRExpr =>
  call('sqrt', [bin('+', bin('*', a, a), bin('*', b, b))]);

/** 지금 벡터의 두 성분. `v[0]` · `v[1]` 로 그대로 읽는다. */
const v0 = idx(v('v'), lit(0));
const v1 = idx(v('v'), lit(1));

/**
 * 거듭제곱 반복 한 걸음.
 *
 * 인자: 공분산 셋 + 지금 벡터 `v`. `v` 가 곧 답을 적을 자리다.
 * 반환: 이번 걸음에 벡터가 돌아간 정도.
 */
const powerStepBody: IRStmt[] = [
  { kind: 'var', name: 'ox', type: tDouble, init: v0, phase: 'multiply' },
  { kind: 'var', name: 'oy', type: tDouble, init: v1, phase: 'multiply' },
  {
    kind: 'var',
    name: 'wx',
    type: tDouble,
    init: bin('+', bin('*', v('sxx'), v0), bin('*', v('sxy'), v1)),
    phase: 'multiply',
  },
  {
    kind: 'var',
    name: 'wy',
    type: tDouble,
    init: bin('+', bin('*', v('sxy'), v0), bin('*', v('syy'), v1)),
    phase: 'multiply',
  },
  {
    kind: 'var',
    name: 'm',
    type: tDouble,
    init: hypot(v('wx'), v('wy')),
    phase: 'normalize',
  },
  { kind: 'assign', target: v0, expr: bin('/', v('wx'), v('m')), phase: 'normalize' },
  { kind: 'assign', target: v1, expr: bin('/', v('wy'), v('m')), phase: 'normalize' },
  {
    kind: 'var',
    name: 'dx',
    type: tDouble,
    init: bin('-', v0, v('ox')),
    phase: 'measure-turn',
  },
  {
    kind: 'var',
    name: 'dy',
    type: tDouble,
    init: bin('-', v1, v('oy')),
    phase: 'measure-turn',
  },
  { kind: 'return', expr: hypot(v('dx'), v('dy')), phase: 'measure-turn' },
];

/**
 * 공분산 셋을 `out` 에 적는다 (`out[0]=sxx` · `out[1]=sxy` · `out[2]=syy`).
 *
 * 가운데를 먼저 셈하는 것이 'center' 이고, 그 가운데에서 잰 어긋남의 곱을
 * 모으는 것이 'covariance' 다. 두 고리를 하나로 합칠 수도 있으나 (한 번 훑고
 * 제곱합에서 평균을 빼는 꼴) 그러면 "가운데로 옮긴 뒤에 잰다" 는 뜻이 식에서
 * 사라진다.
 */
const covarianceBody: IRStmt[] = [
  { kind: 'var', name: 'n', type: tInt, init: len(v('xs')), phase: 'center' },
  { kind: 'var', name: 'mx', type: tDouble, init: lit(0), phase: 'center' },
  { kind: 'var', name: 'my', type: tDouble, init: lit(0), phase: 'center' },
  {
    kind: 'for-range',
    var: 'i',
    from: lit(0),
    to: v('n'),
    inclusive: false,
    phase: 'center',
    body: [
      {
        kind: 'assign',
        target: v('mx'),
        expr: bin('+', v('mx'), idx(v('xs'), v('i'))),
        phase: 'center',
      },
      {
        kind: 'assign',
        target: v('my'),
        expr: bin('+', v('my'), idx(v('ys'), v('i'))),
        phase: 'center',
      },
    ],
  },
  { kind: 'assign', target: v('mx'), expr: bin('/', v('mx'), v('n')), phase: 'center' },
  { kind: 'assign', target: v('my'), expr: bin('/', v('my'), v('n')), phase: 'center' },
  { kind: 'var', name: 'sxx', type: tDouble, init: lit(0), phase: 'covariance' },
  { kind: 'var', name: 'sxy', type: tDouble, init: lit(0), phase: 'covariance' },
  { kind: 'var', name: 'syy', type: tDouble, init: lit(0), phase: 'covariance' },
  {
    kind: 'for-range',
    var: 'i',
    from: lit(0),
    to: v('n'),
    inclusive: false,
    phase: 'covariance',
    body: [
      {
        kind: 'var',
        name: 'dx',
        type: tDouble,
        init: bin('-', idx(v('xs'), v('i')), v('mx')),
        phase: 'covariance',
      },
      {
        kind: 'var',
        name: 'dy',
        type: tDouble,
        init: bin('-', idx(v('ys'), v('i')), v('my')),
        phase: 'covariance',
      },
      {
        kind: 'assign',
        target: v('sxx'),
        expr: bin('+', v('sxx'), bin('*', v('dx'), v('dx'))),
        phase: 'covariance',
      },
      {
        kind: 'assign',
        target: v('sxy'),
        expr: bin('+', v('sxy'), bin('*', v('dx'), v('dy'))),
        phase: 'covariance',
      },
      {
        kind: 'assign',
        target: v('syy'),
        expr: bin('+', v('syy'), bin('*', v('dy'), v('dy'))),
        phase: 'covariance',
      },
    ],
  },
  {
    kind: 'assign',
    target: idx(v('out'), lit(0)),
    expr: bin('/', v('sxx'), v('n')),
    phase: 'covariance',
  },
  {
    kind: 'assign',
    target: idx(v('out'), lit(1)),
    expr: bin('/', v('sxy'), v('n')),
    phase: 'covariance',
  },
  {
    kind: 'assign',
    target: idx(v('out'), lit(2)),
    expr: bin('/', v('syy'), v('n')),
    phase: 'covariance',
  },
];

export const pcaPowerIterationIR: IR = {
  id: 'pca',
  algorithm: 'pca',
  paradigm: 'imperative',
  functions: [
    {
      name: 'power_step',
      params: [
        { name: 'sxx', type: tDouble },
        { name: 'sxy', type: tDouble },
        { name: 'syy', type: tDouble },
        { name: 'v', type: tDoubleList },
      ],
      returnType: tDouble,
      body: powerStepBody,
    },
    {
      name: 'covariance',
      params: [
        { name: 'xs', type: tDoubleList },
        { name: 'ys', type: tDoubleList },
        { name: 'out', type: tDoubleList },
      ],
      returnType: tVoid,
      body: covarianceBody,
    },
  ],
};

export const pcaIRs: IR[] = [pcaPowerIterationIR];
