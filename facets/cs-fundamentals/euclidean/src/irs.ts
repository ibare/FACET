/**
 * euclidean 의 IR — 나머지로 줄이기.
 *
 * 핵심이 `while (b) { a, b = b, a % b }` 라 IR 어휘로 곧게 펴진다. `%` 가
 * `IRBinOp` 에 있고 그 밖에 필요한 것이 없다 — 비트 연산도 예약 수학 이름도
 * 쓰지 않으므로 우회할 자리가 아예 없다. 이름 붙인 호출 뒤로 감추지 않는다.
 *
 * ── 함수가 둘인 까닭
 *
 * 두 함수가 **같은 루프**를 돌고 돌려주는 것만 갈린다. `gcd` 는 남은 수를 주고
 * `division_count` 는 몇 바퀴 돌았는지를 준다. 뒤쪽이 곧 컨트롤바의 `division-count`
 * 이고 손잡이를 밀 때 6 → 8 → 10 → 12 → 14 로 자라는 수다. 화면이 세는 것을 코드도
 * 세는 것이 보여야 두 패널이 같은 물건을 말한다.
 *
 * ── 중간값
 *
 * 큰 값이 생기지 않는다. `a % b` 와 `n + 1` 뿐이고 피연산자는 늘 비음수 정수라
 * 여섯 언어 어디서도 넘치지 않는다 (인터프리터의 `//` 부호 전제와도 어긋나지
 * 않는다 — 여기는 `//` 를 쓰지도 않는다).
 *
 * ── 이름
 *
 * `a` · `b` · `r` · `n` · `gcd` · `division_count` 는 여섯 언어 어디서도 예약어가
 * 아니다. transpiler 가 예약어를 고쳐 주지 않으므로 (bloom-filter 가 `base` 로
 * C# 에서 데였다) 이름은 지을 때 고른다.
 *
 * phase 어휘는 algorithm.ts 와 집합이 완전히 일치한다 (C3):
 *   'remainder' | 'shift' | 'result'
 *
 * `while` 조건과 `n = 0` 에는 phase 를 두지 않았다. 걸음이 거기 머무는 순간이
 * 없어서다 — 없는 순간에 이름을 붙이면 하이라이트가 영영 안 뜨는 어휘가 생긴다.
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };

const PARAMS = [
  { name: 'a', type: INT },
  { name: 'b', type: INT },
];

/** while (b != 0) — 나머지가 0 이 되면 멈춘다. */
const loopCond: IRExpr = {
  kind: 'binop',
  op: '!=',
  l: { kind: 'var', name: 'b' },
  r: { kind: 'lit', value: 0 },
};

/** r = a % b — 이 한 줄이 알고리즘 전부다. */
const remainderStmt: IRStmt = {
  kind: 'var',
  name: 'r',
  type: INT,
  init: { kind: 'binop', op: '%', l: { kind: 'var', name: 'a' }, r: { kind: 'var', name: 'b' } },
  phase: 'remainder',
};

/** a, b = b, r — 짝을 한 칸 민다. IR 에 동시 대입이 없어 r 을 먼저 잡아 둔다. */
const shiftStmts: IRStmt[] = [
  { kind: 'assign', target: { kind: 'var', name: 'a' }, expr: { kind: 'var', name: 'b' }, phase: 'shift' },
  { kind: 'assign', target: { kind: 'var', name: 'b' }, expr: { kind: 'var', name: 'r' }, phase: 'shift' },
];

/** 최대공약수 — 줄이다 남은 수가 곧 답이다. */
const gcdBody: IRStmt[] = [
  {
    kind: 'while',
    cond: loopCond,
    body: [remainderStmt, ...shiftStmts],
  },
  { kind: 'return', expr: { kind: 'var', name: 'a' }, phase: 'result' },
];

/** 같은 루프를 돌되 답이 아니라 바퀴 수를 돌려준다. */
const countBody: IRStmt[] = [
  { kind: 'var', name: 'n', type: INT, init: { kind: 'lit', value: 0 } },
  {
    kind: 'while',
    cond: loopCond,
    body: [
      remainderStmt,
      {
        kind: 'assign',
        target: { kind: 'var', name: 'n' },
        expr: { kind: 'binop', op: '+', l: { kind: 'var', name: 'n' }, r: { kind: 'lit', value: 1 } },
        phase: 'remainder',
      },
      ...shiftStmts,
    ],
  },
  { kind: 'return', expr: { kind: 'var', name: 'n' }, phase: 'result' },
];

export const euclideanImperativeIR: IR = {
  id: 'euclidean-imperative',
  algorithm: 'euclidean',
  paradigm: 'imperative',
  functions: [
    { name: 'gcd', params: PARAMS, returnType: INT, body: gcdBody },
    { name: 'division_count', params: PARAMS, returnType: INT, body: countBody },
  ],
};

export const euclideanIRs: IR[] = [euclideanImperativeIR];
