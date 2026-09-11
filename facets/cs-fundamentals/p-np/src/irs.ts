/**
 * p-np 의 IR — 확인하기와 후보 세기, 함수 둘.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def check(nums, pick, n):
 *       sum = 0
 *       i = 0
 *       while i < n:                   # phase: check
 *           if pick[i] == 1:
 *               sum = sum + nums[i]    # phase: check
 *           i = i + 1
 *       return sum                     # phase: verdict
 *
 *   def candidates(n):
 *       total = 1
 *       i = 0
 *       while i < n:                   # phase: count
 *           total = total + total      # phase: count
 *           i = i + 1
 *       return total                   # phase: gap
 *
 * ── 두 함수가 곧 화면의 두 줄이다
 *
 * `check` 는 확인 쪽이 하는 일 전부다 — 건네받은 후보를 훑으며 고른 수를 더한다.
 * 배열 · 반복 · 조건 · 대입이 그대로 펴지고, 도는 횟수가 `n` 이라 **값이 크기를
 * 따라 선형으로만 자란다.** 그것이 이 쪽이 싼 까닭이다.
 *
 * `candidates` 는 찾기 쪽이 들여다봐야 할 후보의 수를 센다. 수 하나가 늘 때마다
 * 후보가 두 배가 되므로 루프는 역시 `n` 번 도는데, **돌려주는 수는 2^n 이다.**
 * 같은 길이의 루프 둘이 하나는 `n` 을, 하나는 `2^n` 을 낸다는 것이 코드 패널에서
 * 나란히 보인다.
 *
 * ── 찾기를 낱낱이 펴지 않은 까닭
 *
 * 후보를 실제로 훑는 루프(계수기를 돌리며 2^n 개를 전수로 더하는 것)를 IR 로 펼
 * 수는 있다. 그러나 손잡이 끝인 n=20 에서 그 루프는 **백만 바퀴를 돌고 그 안에서
 * 다시 스무 번씩 더한다.** 코드 패널의 대조가 그것을 돌 수 없다.
 *
 * **그리고 그 사실 자체가 이 화면의 주장이다.** 찾기는 코드로 펴는 것조차 이
 * 크기에서 무리이고, 그래서 세는 것으로 갈음한다 — 세기만 해도 폭발이 보인다.
 * IR 을 통째로 버리지 않고 펼 수 있는 쪽(`check`)을 펴 둔 것은 `matrix-mul` 이
 * 사분면 쪼개기 하나만 빼고 패널을 살린 것과 같은 판단이다.
 *
 * ── `&&` 를 한 번도 쓰지 않는다
 *
 * `ir-interpreter` 의 `&&` 는 짧은 회로가 아니다. 양쪽을 먼저 셈하므로
 * `i < n && pick[i] == 1` 꼴을 쓰면 오른쪽 색인이 범위 밖에서도 실제로 읽힌다.
 * 여섯 언어의 `&&` 는 짧은 회로라 **인터프리터에서만 다른 답이 나온다.**
 *
 * 여기서는 그런 식이 애초에 없다. 루프의 조건은 `i < n` 하나이고 "골랐는가" 는
 * `if` 로 한 겹 포갰다 (`sieve` 가 그렇게 했다).
 *
 * ── 32비트 — 값이 아니라 구조로 막는다
 *
 * **곱셈(`*`)이 이 IR 에 한 번도 나오지 않는다.** 후보의 수를 `total * 2` 가 아니라
 * `total + total` 로 세고, 찾기의 값(후보 수 × 덧셈)은 **아예 셈하지 않는다** —
 * 화면이 두 수를 따로 보이고 곱은 글이 말한다.
 *
 * 그래서 가장 큰 중간값이 `candidates(20)` = 1,048,576 이고 2³¹ 근처에도 가지
 * 않는다. `check` 쪽의 최대는 수 스물의 합이라 네 자리다. **넘칠 자리가 구조적으로
 * 없고, `"op":"*"` 가 트리에 없음을 검사가 잠근다** — 뒷사람이 값을 곱하는 줄을
 * 더하면 거기서 걸린다 (`fast-power` 가 이 벽에 빠진 뒤 세운 본).
 *
 * ── 예약 수학 이름을 하나도 쓰지 않는다
 *
 * `exp` · `log` · `sqrt` · `abs` · `max` · `min` · `floor` 일곱이 예약돼 있으나 여기서는
 * 하나도 부르지 않는다. 셈하는 것이 전부 **횟수**라 실수가 끼어들 자리가 없어서다.
 *
 * 그것이 다행인 까닭이 있다. `log` 나 `floor` 의 결과는 실수이고, 그 값을 `int` 슬롯에
 * 담으면 **자바와 C# 은 아예 컴파일되지 않는다** — 실수에서 정수로 좁히는 데 명시적
 * 캐스트를 요구하기 때문이다. C++ 은 좁히기 경고로 지나가고 파이썬 · JS · TS 는 멀쩡해서,
 * 여섯 중 둘에서만 깨진다. 같은 까닭으로 `//`(정수 나눗셈)도 쓰지 않는다 — 피연산자가
 * 실수면 그 셋이 `/` 로 옮겨 인터프리터의 내림과 갈린다.
 *
 * **`ir-interpreter` 는 이 셋을 다 통과시킨다.** 32비트와 같은 종류의 구멍이다 —
 * 대조하는 수단에 그 벽이 없어 검사가 원리적으로 못 잡는다. 그래서 여기서도 값이 아니라
 * 구조로 막는다: 이 IR 의 슬롯은 전부 `int`(또는 int 배열)이고 연산은 `+` · `<` · `==`
 * 셋뿐이며 `call` 노드가 0 개다. **그 세 가지를 검사가 잠근다.**
 *
 * 화면의 축척(격자를 접는 나눗셈과 나머지)은 stage 가 하는 셈이다. 축척은 저작 결정이지
 * 알고리즘이 아니므로 IR 로 내려오지 않는다.
 *
 * ── 이름
 *
 * `out` · `base` · `ref` · `params` · `value` 는 C# 의 예약어이거나 문맥 예약어라
 * 쓰지 않는다 (transpiler 는 이름을 고쳐 주지 않는다 — S-transpiler). 그래서 수
 * 배열은 `nums` 다.
 *
 * phase 어휘는 algorithm.ts 와 집합이 완전히 일치한다 (C3):
 *   'check' | 'verdict' | 'count' | 'gap'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: { kind: 'int' } };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '<' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: o, l, r });

// ─────────────────────────────────────────────────────────────────────────────
// 1. 확인 — 건네받은 후보 하나를 더해 본다. 도는 횟수도 값도 n 을 따라간다.
// ─────────────────────────────────────────────────────────────────────────────

const checkBody: IRStmt[] = [
  { kind: 'var', name: 'sum', type: INT, init: lit(0) },
  { kind: 'var', name: 'i', type: INT, init: lit(0) },
  {
    kind: 'while',
    cond: op('<', v('i'), v('n')),
    phase: 'check',
    body: [
      {
        kind: 'if',
        // "골랐는가" 를 루프 조건에 `&&` 로 붙이지 않고 한 겹 포갠다.
        cond: op('==', at('pick', v('i')), lit(1)),
        then: [
          { kind: 'assign', target: v('sum'), expr: op('+', v('sum'), at('nums', v('i'))), phase: 'check' },
        ],
      },
      { kind: 'assign', target: v('i'), expr: op('+', v('i'), lit(1)) },
    ],
  },
  { kind: 'return', expr: v('sum'), phase: 'verdict' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. 후보 세기 — 수 하나가 늘 때마다 두 배. 같은 길이의 루프가 2^n 을 낸다.
// ─────────────────────────────────────────────────────────────────────────────

const candidatesBody: IRStmt[] = [
  { kind: 'var', name: 'total', type: INT, init: lit(1) },
  { kind: 'var', name: 'i', type: INT, init: lit(0) },
  {
    kind: 'while',
    cond: op('<', v('i'), v('n')),
    phase: 'count',
    body: [
      // 곱셈을 쓰지 않는다. 두 배는 제 자신을 한 번 더하는 것이고, 그러면 32비트
      // 벽에 닿을 중간값이 구조적으로 생기지 않는다.
      { kind: 'assign', target: v('total'), expr: op('+', v('total'), v('total')), phase: 'count' },
      { kind: 'assign', target: v('i'), expr: op('+', v('i'), lit(1)) },
    ],
  },
  { kind: 'return', expr: v('total'), phase: 'gap' },
];

export const pNpImperativeIR: IR = {
  id: 'p-np-imperative',
  algorithm: 'pNp',
  paradigm: 'imperative',
  functions: [
    {
      name: 'check',
      params: [
        { name: 'nums', type: INTS },
        { name: 'pick', type: INTS },
        { name: 'n', type: INT },
      ],
      returnType: INT,
      body: checkBody,
    },
    {
      name: 'candidates',
      params: [{ name: 'n', type: INT }],
      returnType: INT,
      body: candidatesBody,
    },
  ],
};

export const pNpIRs: IR[] = [pNpImperativeIR];
