/**
 * bitwise-ops IR — 비트 연산을 자리별 산술로 편 것.
 *
 * ── 펴는 것이 곧 주장이다
 *
 * IR 에는 비트 연산이 없다. `IRBinOp` 는 `+ - * / // %` 와 비교, `&& ||` 뿐이고
 * `&` · `|` · `^` · `~` · `<<` · `>>` 는 어휘에 아예 들어 있지 않다. 그래서 이
 * 코드 패널은 `% 2` 로 맨 아랫자리를 뽑고 `// 2` 로 한 자리 내리는 산술만으로
 * 여섯 연산을 셈한다.
 *
 * **이 우회는 우회가 아니다.** 비트 연산이 없어서 어쩔 수 없이 편 것이 아니라,
 * 펴는 것이 이 화면이 말하려는 바 그 자체다. 주장은 "비트 연산은 자리마다
 * 독립적으로, 그러나 한꺼번에 일어난다" 이고, 자리별 산술로 펴면 코드가 그것을
 * 그대로 말하게 된다 — `applyRule` 은 자리 하나에만 관여하는 한 줄짜리 규칙이고
 * 이웃을 인자로 받지도 않는다. `bitwiseOp` 의 루프는 그 한 줄을 여덟 자리에
 * 각자 적용해 무게를 곱해 되모을 뿐이다.
 *
 * 만약 IR 에 `&` 가 있었다면 코드 패널은 `a & b` 한 줄을 보였을 것이고, 그것은
 * 답을 보여 주되 **왜 그 답인지는 감춘다.** 여기서는 감출 것이 없다.
 *
 * 자리 옮기기도 같은 틀에 들어온다. `sourceWeight` 하나만 갈아 끼우면 된다 —
 * 규칙(`applyRule`)은 "값을 그대로 둔다" 이고 달라지는 것은 **어느 자리에서
 * 읽어 오는가** 뿐이다. 자리끼리 영향을 주고받는 것이 shift 뿐이라는 말이
 * 코드에서는 이 한 함수로 나타난다.
 *
 * ── 32비트 천장 (S-transpiler)
 *
 * IR 은 여섯 언어로 옮겨지고 그중 java · C++ · C# 의 `int` 는 2^31 에서 감긴다.
 * 이 IR 의 중간값 상한은 **256** 이라 천장에서 스물세 자리 아래다. 근거:
 *
 *   width = 8, a < 256, b < 256 (선언이 정한 1차 데이터)
 *   top    = 2^(width-1)                       = 128
 *   weight ≤ top                               = 128
 *   weight * 2   (sourceWeight 의 ≫1 갈래)      = 256  ← 최대
 *   value // weight ≤ 255
 *   x, y, z ∈ {0, 1};  x + y - x*y ≤ 1;  z * weight ≤ 128
 *   result = Σ z*weight ≤ 255
 *
 * 가장 큰 값이 `weight * 2` 이고 그것이 256 이다. 이 논증은 **width 가 8 이고
 * 피연산자가 한 바이트라는 것**에 기대고 있으므로, `test/bitwise-ops.test.ts` 가
 * 그 전제(자리 폭 · 피연산자 상한)와 실제 중간값 전수를 함께 잠근다. 폭을 넓히면
 * 검사가 먼저 깨진다.
 *
 * ── IR 어휘의 한계를 지킨 자리
 *
 * - **`pow` 가 없다** (`IR_MATH_BUILTINS` 는 exp · log · sqrt · abs · max · min ·
 *   floor 뿐). 2 의 거듭제곱은 `top` 을 1 에서 시작해 루프로 곱해 쌓는다.
 * - **`floor` 를 부르지 않는다.** `floor` 는 `double` 을 돌려주므로 `int` 슬롯에
 *   담으면 java · C# 이 컴파일되지 않는다. 여기서는 `//` 로 충분해 부를 일이 없다.
 * - **`&&` 를 쓰지 않는다.** `ir-interpreter` 의 `&&` 는 짧은 회로가 아니라
 *   오른쪽이 늘 셈해진다. 조건을 이을 자리가 아예 생기지 않도록 규칙을 산술로
 *   폈고, 남은 분기는 전부 단일 조건 `if` 다.
 * - **이름은 여섯 언어의 예약어를 피했다.** `and` · `or` · `not` · `xor` 는
 *   파이썬 예약어라 함수 이름으로 쓰지 않고 `applyRule` 에 코드 번호로 넘긴다.
 *   `src` · `code` · `top` · `weight` · `result` · `width` 도 여섯 언어 어디서도
 *   예약어가 아니다 (C# 의 `base` · `out` · `ref` · `params` · `object` · `string`,
 *   자바의 `final` · `native`, 파이썬의 `from` · `pass` · `lambda` 를 모두 피했다).
 *
 * phase 어휘는 `algorithm.ts` 와 집합이 정확히 일치한다 (C3):
 *   setup · digit · rule · place · done
 */

import type { IR, IRBinOp, IRExpr, IRFunc, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const num = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

/**
 * 연산 코드. `initialData.ops` 의 차례와 같다.
 *
 * IR 안에서는 리터럴 수로 나타난다 — 이름 붙인 상수를 IR 어휘가 갖고 있지 않다.
 * 코드 패널을 읽는 사람에게는 `applyRule` 의 다섯 갈래가 곧 그 표다.
 */
const AND = 0;
const OR = 1;
const XOR = 2;
const NOT = 3;
const SHL = 4;
const SHR = 5;

/**
 * 한 자리를 뽑는다 — `(value // weight) % 2`.
 *
 * 자리 무게가 여덟 자리 밖이면 그 자리에는 아무것도 없으므로 0 이다. 왼쪽 밖은
 * `value // weight` 가 저절로 0 이 되어 따로 막지 않아도 되지만, 오른쪽 밖은
 * 무게가 0 이라 나눗셈 자체가 서지 않아 한 줄로 막는다.
 */
const digitAtFn: IRFunc = {
  name: 'digitAt',
  params: [
    { name: 'value', type: INT },
    { name: 'weight', type: INT },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: '자리가 여덟 자리 밖이면 읽을 것이 없다.' },
    {
      kind: 'if',
      cond: bin('<', v('weight'), num(1)),
      phase: 'digit',
      then: [{ kind: 'return', expr: num(0), phase: 'digit' }],
    },
    {
      kind: 'return',
      expr: bin('%', bin('//', v('value'), v('weight')), num(2)),
      phase: 'digit',
    },
  ],
};

/**
 * 어느 자리에서 읽어 올 것인가.
 *
 * **자리끼리 영향을 주고받는 것은 여기뿐이다.** 나머지 넷은 제자리를 읽고,
 * 자리 옮기기만 이웃을 읽는다.
 */
const sourceWeightFn: IRFunc = {
  name: 'sourceWeight',
  params: [
    { name: 'weight', type: INT },
    { name: 'code', type: INT },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: '왼쪽으로 한 칸 — 이 자리는 오른쪽 이웃을 읽는다.' },
    {
      kind: 'if',
      cond: bin('==', v('code'), num(SHL)),
      phase: 'digit',
      then: [{ kind: 'return', expr: bin('//', v('weight'), num(2)), phase: 'digit' }],
    },
    { kind: 'comment', text: '오른쪽으로 한 칸 — 이 자리는 왼쪽 이웃을 읽는다.' },
    {
      kind: 'if',
      cond: bin('==', v('code'), num(SHR)),
      phase: 'digit',
      then: [{ kind: 'return', expr: bin('*', v('weight'), num(2)), phase: 'digit' }],
    },
    { kind: 'comment', text: '나머지 넷은 제자리를 읽는다.' },
    { kind: 'return', expr: v('weight'), phase: 'digit' },
  ],
};

/**
 * 자리 하나에 규칙을 적용한다 — 이 함수가 이 화면의 주장이다.
 *
 * 이웃을 인자로 받지 않는다. 받는 것은 **이 자리의 두 비트**뿐이고, 그래서
 * 여덟 자리가 서로를 모른 채 같은 규칙을 각자 적용할 수 있다.
 *
 * 네 규칙이 전부 산술 한 줄로 선다:
 *   AND  x * y            둘 다 1 일 때만 1
 *   OR   x + y - x*y      하나라도 1 이면 1
 *   XOR  (x + y) % 2      둘이 다를 때만 1
 *   NOT  1 - x            뒤집는다 (y 를 쓰지 않는다)
 * 자리 옮기기는 값을 건드리지 않으므로 읽어 온 것을 그대로 돌려준다.
 */
const applyRuleFn: IRFunc = {
  name: 'applyRule',
  params: [
    { name: 'x', type: INT },
    { name: 'y', type: INT },
    { name: 'code', type: INT },
  ],
  returnType: INT,
  body: [
    {
      kind: 'if',
      cond: bin('==', v('code'), num(AND)),
      phase: 'rule',
      then: [{ kind: 'return', expr: bin('*', v('x'), v('y')), phase: 'rule' }],
    },
    {
      kind: 'if',
      cond: bin('==', v('code'), num(OR)),
      phase: 'rule',
      then: [
        {
          kind: 'return',
          expr: bin('-', bin('+', v('x'), v('y')), bin('*', v('x'), v('y'))),
          phase: 'rule',
        },
      ],
    },
    {
      kind: 'if',
      cond: bin('==', v('code'), num(XOR)),
      phase: 'rule',
      then: [
        { kind: 'return', expr: bin('%', bin('+', v('x'), v('y')), num(2)), phase: 'rule' },
      ],
    },
    {
      kind: 'if',
      cond: bin('==', v('code'), num(NOT)),
      phase: 'rule',
      then: [{ kind: 'return', expr: bin('-', num(1), v('x')), phase: 'rule' }],
    },
    { kind: 'comment', text: '자리 옮기기 — 값은 그대로다. 달라진 것은 읽어 온 자리뿐.' },
    { kind: 'return', expr: v('x'), phase: 'rule' },
  ],
};

/** 여덟 자리를 각자 셈해 하나의 수로 되모은다. */
const entryBody: IRStmt[] = [
  { kind: 'comment', text: '자리 무게의 꼭대기 — 2^(width-1). IR 에 pow 가 없어 곱으로 쌓는다.' },
  { kind: 'var', name: 'top', type: INT, init: num(1), phase: 'setup' },
  { kind: 'var', name: 'i', type: INT, init: num(1), phase: 'setup' },
  {
    kind: 'while',
    cond: bin('<', v('i'), v('width')),
    phase: 'setup',
    body: [
      { kind: 'assign', target: v('top'), expr: bin('*', v('top'), num(2)), phase: 'setup' },
      { kind: 'assign', target: v('i'), expr: bin('+', v('i'), num(1)), phase: 'setup' },
    ],
  },
  { kind: 'var', name: 'result', type: INT, init: num(0), phase: 'setup' },
  { kind: 'var', name: 'weight', type: INT, init: v('top'), phase: 'setup' },
  {
    kind: 'comment',
    text: '왼쪽 자리부터 훑는다. 자리끼리 서로를 모르므로 순서를 뒤집어도 답은 같다.',
  },
  {
    kind: 'while',
    cond: bin('>=', v('weight'), num(1)),
    phase: 'digit',
    body: [
      {
        kind: 'var',
        name: 'src',
        type: INT,
        init: call('sourceWeight', [v('weight'), v('code')]),
        phase: 'digit',
      },
      { kind: 'var', name: 'x', type: INT, init: call('digitAt', [v('a'), v('src')]), phase: 'digit' },
      {
        kind: 'var',
        name: 'y',
        type: INT,
        init: call('digitAt', [v('b'), v('weight')]),
        phase: 'digit',
      },
      {
        kind: 'var',
        name: 'z',
        type: INT,
        init: call('applyRule', [v('x'), v('y'), v('code')]),
        phase: 'rule',
      },
      {
        kind: 'assign',
        target: v('result'),
        expr: bin('+', v('result'), bin('*', v('z'), v('weight'))),
        phase: 'place',
      },
      { kind: 'assign', target: v('weight'), expr: bin('//', v('weight'), num(2)), phase: 'place' },
    ],
  },
  { kind: 'return', expr: v('result'), phase: 'done' },
];

const bitwiseOpFn: IRFunc = {
  name: 'bitwiseOp',
  params: [
    { name: 'a', type: INT },
    { name: 'b', type: INT },
    { name: 'code', type: INT },
    { name: 'width', type: INT },
  ],
  returnType: INT,
  body: entryBody,
};

export const bitwiseOpsImperativeIR: IR = {
  id: 'bitwise-ops-imperative',
  algorithm: 'bitwiseOps',
  paradigm: 'imperative',
  // 첫 함수가 entry point 다.
  functions: [bitwiseOpFn, digitAtFn, sourceWeightFn, applyRuleFn],
};

export const bitwiseOpsIRs: IR[] = [bitwiseOpsImperativeIR];
