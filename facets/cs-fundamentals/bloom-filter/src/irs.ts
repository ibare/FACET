/**
 * bloom-filter 의 IR — 넣기와 묻기.
 *
 * 핵심 셈이 IR 어휘로 온전히 펴진다. 비트 배열은 `list of int` 에 0/1 을 쓰면 되므로
 * 비트 연산이 없어도 무방하다.
 *
 * 두 함수가 **같은 루프**를 쓰고 조건만 갈리는 것이 코드에 그대로 드러나는 것이
 * 이 패널의 몫이다 — 넣기는 그 자리에 1 을 쓰고, 묻기는 그 자리가 0 인지 본다.
 *
 * ── 왜 `(h1 + i·h2) % m` 을 그대로 적지 않는가
 *
 * algorithm 은 자바 int 의 셈을 따라 `자리 = (h1 + mask(i·h2)) mod m` 으로 센다
 * (`mask(x) = x & 0x7FFFFFFF`). 그런데 IR 에는 비트 연산이 없고, 산술로 우회해
 * `% 2147483648` 을 쓰면 **`i · h2` 라는 중간값이 먼저 나온다** — 그 값이 32비트
 * `int` 를 넘쳐 java · cpp · csharp 에서 다른 답이 된다. 코드 패널이 그림과 다른
 * 칸을 셈하는 코드를 보이게 되는 자리다.
 *
 * 그래서 **나머지의 분배 법칙으로 접는다.** 각 항을 먼저 `% m` 으로 줄이면 큰
 * 중간값이 아예 생기지 않는다.
 *
 *   자리 = (h1 + mask(i·h2)) mod m
 *        = (h1 + (i·h2 mod 2³¹)) mod m
 *        = (h1 + i·h2) mod m                    ← m 이 2³¹ 을 나누므로 마스크가 지워진다
 *        = ((h1 mod m) + i·(h2 mod m)) mod m     ← IR 이 적는 형태
 *
 * 마스크가 지워지는 것은 **m 이 2 의 거듭제곱**이기 때문이다. 손잡이가 주는 m 은
 * 16 · 32 · 64 셋뿐이고 모두 2³¹ 을 나누므로, `mod 2³¹` 로 잘라 낸 몫은 m 의
 * 배수라 나머지를 바꾸지 못한다. m 에 2 의 거듭제곱이 아닌 값을 더하려면 이 접기를
 * 다시 따져야 한다.
 *
 * 접은 뒤 중간값의 최대는 `k · (m-1)` = 6 · 63 = 378 이다. 여섯 언어 어디서도
 * 넘치지 않고, 18 개 (m, k) 조합 전부에서 algorithm 과 같은 자리를 낸다 (실측).
 *
 * phase 어휘는 algorithm.ts 와 집합이 완전히 일치한다 (C3):
 *   'hash' | 'set-bit' | 'probe' | 'absent' | 'present'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const BOOL: IRType = { kind: 'bool' };
const VOID: IRType = { kind: 'void' };
const BITS: IRType = { kind: 'list', of: { kind: 'int' } };

const BITS_PARAMS = [
  { name: 'bits', type: BITS },
  { name: 'h1', type: INT },
  { name: 'h2', type: INT },
  { name: 'm', type: INT },
  { name: 'k', type: INT },
];

/**
 * start = h1 % m — 첫 자리.
 *
 * `base` 로 두었다가 고쳤다. **C# 에서 `base` 는 예약어**라 그 이름으로는 코드
 * 패널이 컴파일되지 않는 C# 을 보인다 — transpiler 가 예약어를 고쳐 주지 않는다
 * (S-transpiler 는 고치라고 적어 두었으나 csharp 쪽에 그 처리가 없다). 여섯 언어
 * 어디서도 예약어가 아닌 이름이라야 한다.
 */
const startInit: IRExpr = {
  kind: 'binop',
  op: '%',
  l: { kind: 'var', name: 'h1' },
  r: { kind: 'var', name: 'm' },
};

/** stride = h2 % m — 한 걸음의 폭. 줄여 두어야 i 를 곱해도 넘치지 않는다. */
const strideInit: IRExpr = {
  kind: 'binop',
  op: '%',
  l: { kind: 'var', name: 'h2' },
  r: { kind: 'var', name: 'm' },
};

/** slot = (base + i * stride) % m */
const slotExpr: IRExpr = {
  kind: 'binop',
  op: '%',
  l: {
    kind: 'binop',
    op: '+',
    l: { kind: 'var', name: 'start' },
    r: {
      kind: 'binop',
      op: '*',
      l: { kind: 'var', name: 'i' },
      r: { kind: 'var', name: 'stride' },
    },
  },
  r: { kind: 'var', name: 'm' },
};

const bitAtSlot: IRExpr = {
  kind: 'index',
  arr: { kind: 'var', name: 'bits' },
  idx: { kind: 'var', name: 'slot' },
};

/** 두 함수가 똑같이 여는 두 줄. 자리를 셈할 채비다. */
const foldHashes = (): IRStmt[] => [
  { kind: 'var', name: 'start', type: INT, init: startInit, phase: 'hash' },
  { kind: 'var', name: 'stride', type: INT, init: strideInit, phase: 'hash' },
];

/** 넣기 — 자리마다 1 을 쓴다. 이미 1 이어도 1 이 될 뿐이다. */
const insertBody: IRStmt[] = [
  ...foldHashes(),
  {
    kind: 'for-range',
    var: 'i',
    from: { kind: 'lit', value: 0 },
    to: { kind: 'var', name: 'k' },
    inclusive: false,
    body: [
      { kind: 'var', name: 'slot', type: INT, init: slotExpr, phase: 'hash' },
      { kind: 'assign', target: bitAtSlot, expr: { kind: 'lit', value: 1 }, phase: 'set-bit' },
    ],
  },
];

/** 묻기 — 같은 자리를 다시 셈해 하나라도 0 이면 거기서 끝난다. */
const containsBody: IRStmt[] = [
  ...foldHashes(),
  {
    kind: 'for-range',
    var: 'i',
    from: { kind: 'lit', value: 0 },
    to: { kind: 'var', name: 'k' },
    inclusive: false,
    body: [
      { kind: 'var', name: 'slot', type: INT, init: slotExpr, phase: 'hash' },
      {
        kind: 'if',
        cond: { kind: 'binop', op: '==', l: bitAtSlot, r: { kind: 'lit', value: 0 } },
        then: [{ kind: 'return', expr: { kind: 'lit', value: false }, phase: 'absent' }],
        phase: 'probe',
      },
    ],
  },
  { kind: 'return', expr: { kind: 'lit', value: true }, phase: 'present' },
];

export const bloomFilterImperativeIR: IR = {
  id: 'bloom-filter-imperative',
  algorithm: 'bloomFilter',
  paradigm: 'imperative',
  functions: [
    { name: 'insert', params: BITS_PARAMS, returnType: VOID, body: insertBody },
    { name: 'contains', params: BITS_PARAMS, returnType: BOOL, body: containsBody },
  ],
};

export const bloomFilterIRs: IR[] = [bloomFilterImperativeIR];
