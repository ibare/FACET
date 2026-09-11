/**
 * bigO 의 IR — 다항식을 셈하고 항의 자리를 가린다.
 *
 * 복잡도는 알고리즘이 아니라 개념이라 셈할 것이 적다. 그래도 **얕은 대로 펴서
 * 둔다** — 화면이 세는 수를 코드도 세는 것이 보여야 두 패널이 같은 물건을
 * 말한다. 함수 셋이 하는 일은 이렇다.
 *
 *   `total`     호너 셈법으로 f(n) 을 구한다. 화면 머리의 합이 이 값이다.
 *   `term_at`   i 번째 항 하나의 값. 화면 아래 넷의 값이 이 값이다.
 *   `outranked` 최고차항보다 작아진 항의 수. 컨트롤바의 `outranked-count` 다.
 *
 * ── `&&` 를 쓰지 않는다
 *
 * `ir-interpreter` 의 `&&` 는 짧은 회로가 아니라 오른쪽이 늘 셈해진다. 여기서는
 * 피한 것이 아니라 **없다** — 판정이 `term_at(c, n, i) < top` 하나뿐이라 조건을
 * 이을 자리가 애초에 생기지 않는다 (`sieve` 가 그렇게 했다).
 *
 * ── 중간값이 32비트를 넘지 않는 것은 구조가 보장한다
 *
 * 인터프리터는 배정도라 넘쳐도 통과하는데 자바 · C++ · C# 의 `int` 에서는
 * 감긴다. 검사가 원리적으로 못 잡는 벽이라 **값이 아니라 짜임으로** 막는다.
 *
 *   - 호너는 `t = t·n + c[i]` 라 중간값이 **f(n) 을 넘지 않는다.** 거듭제곱을
 *     따로 구해 계수를 곱하는 꼴이면 중간값이 답보다 커질 수 있는데, 호너에는
 *     그런 자리가 없다.
 *   - `term_at` 의 중간값은 그 항의 값이고, 항은 모두 f(n) 이하다.
 *   - 그러므로 이 IR 이 만드는 가장 큰 수는 **사다리 끝의 f(n)** 하나다.
 *     `[1, 5, 100, 1000]` 과 n = 100 에서 1,061,000 이고 상한의 0.05% 다.
 *
 * `test/big-o.test.ts` 의 "32비트" 가 이 구조를 잠근다 — 사다리를 늘리거나
 * 계수를 키워 f(n) 이 상한에 닿으면 그 검사가 먼저 깨진다.
 *
 * ── 이름
 *
 * `c` · `n` · `i` · `j` · `t` · `v` · `k` · `top` · `total` · `term_at` ·
 * `outranked` 는 여섯 언어 어디서도 예약어가 아니다. transpiler 가 예약어를
 * 고쳐 주지 않으므로 (bloom-filter 가 `base` 로 C# 에서 데였다) 이름은 지을 때
 * 고른다.
 *
 * phase 어휘는 algorithm.ts 와 집합이 완전히 일치한다 (C3):
 *   'evaluate' | 'compare' | 'result'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '<', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});

/** 계수 배열과 입력 크기. 세 함수가 모두 이 둘로 시작한다. */
const BASE_PARAMS = [
  { name: 'c', type: INTS },
  { name: 'n', type: INT },
];

/**
 * f(n) — 호너 셈법.
 *
 * `t = t·n + c[i]` 를 계수 수만큼 돌면 그것이 곧 다항식이다. 거듭제곱을 따로
 * 구하지 않으므로 중간값이 답을 넘지 않는다.
 */
const totalBody: IRStmt[] = [
  { kind: 'var', name: 't', type: INT, init: lit(0) },
  {
    kind: 'for-range',
    var: 'i',
    from: lit(0),
    to: { kind: 'len', of: v('c') },
    inclusive: false,
    body: [
      {
        kind: 'assign',
        target: v('t'),
        expr: bin('+', bin('*', v('t'), v('n')), { kind: 'index', arr: v('c'), idx: v('i') }),
        phase: 'evaluate',
      },
    ],
  },
  { kind: 'return', expr: v('t'), phase: 'result' },
];

/**
 * 항 하나의 값 — `c[i] · n^(deg−i)`.
 *
 * 차수를 따로 받지 않는다. 계수 배열의 길이가 곧 차수 + 1 이라 남은 자리 수가
 * 지수다.
 */
const termAtBody: IRStmt[] = [
  {
    kind: 'var',
    name: 'v',
    type: INT,
    init: { kind: 'index', arr: v('c'), idx: v('i') },
    phase: 'evaluate',
  },
  {
    kind: 'for-range',
    var: 'j',
    from: lit(0),
    to: bin('-', bin('-', { kind: 'len', of: v('c') }, lit(1)), v('i')),
    inclusive: false,
    body: [
      { kind: 'assign', target: v('v'), expr: bin('*', v('v'), v('n')), phase: 'evaluate' },
    ],
  },
  { kind: 'return', expr: v('v'), phase: 'result' },
];

/** 최고차항보다 작아진 항의 수. 0 에서 시작해 셋까지 찬다. */
const outrankedBody: IRStmt[] = [
  {
    kind: 'var',
    name: 'top',
    type: INT,
    init: { kind: 'call', fn: 'term_at', args: [v('c'), v('n'), lit(0)] },
    phase: 'evaluate',
  },
  { kind: 'var', name: 'k', type: INT, init: lit(0) },
  {
    kind: 'for-range',
    var: 'i',
    from: lit(1),
    to: { kind: 'len', of: v('c') },
    inclusive: false,
    body: [
      {
        kind: 'if',
        cond: bin('<', { kind: 'call', fn: 'term_at', args: [v('c'), v('n'), v('i')] }, v('top')),
        then: [
          { kind: 'assign', target: v('k'), expr: bin('+', v('k'), lit(1)), phase: 'compare' },
        ],
        phase: 'compare',
      },
    ],
  },
  { kind: 'return', expr: v('k'), phase: 'result' },
];

export const bigOImperativeIR: IR = {
  id: 'big-o-imperative',
  algorithm: 'bigO',
  paradigm: 'imperative',
  functions: [
    { name: 'total', params: BASE_PARAMS, returnType: INT, body: totalBody },
    {
      name: 'term_at',
      params: [...BASE_PARAMS, { name: 'i', type: INT }],
      returnType: INT,
      body: termAtBody,
    },
    { name: 'outranked', params: BASE_PARAMS, returnType: INT, body: outrankedBody },
  ],
};

export const bigOIRs: IR[] = [bigOImperativeIR];
