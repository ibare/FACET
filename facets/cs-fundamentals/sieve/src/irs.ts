/**
 * sieve 의 IR — 지우기와 거두기, 함수 둘.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def sieve(mark, limit):
 *       marks = 0
 *       i = 2
 *       while i * i <= limit:              # phase: outer
 *           if mark[i] == 0:               # phase: outer
 *               j = i * i
 *               while j <= limit:          # phase: mark
 *                   mark[j] = 1            # phase: mark
 *                   marks = marks + 1
 *                   j = j + i
 *           i = i + 1
 *       return marks                       # phase: finish
 *
 *   def collect(mark, primes, limit):
 *       count = 0
 *       n = 2
 *       while n <= limit:                  # phase: collect
 *           if mark[n] == 0:
 *               primes[count] = n          # phase: collect
 *               count = count + 1
 *           n = n + 1
 *       return count                       # phase: finish
 *
 * ── 왜 이 알고리즘이 IR 로 곧게 펴지는가
 *
 * 어휘가 배열 · 반복 · 조건 · 대입뿐인데 체는 그것 말고 쓰는 것이 없다. 맵도 큐도
 * 집합도 필요 없고, `mark` 는 0/1 을 담는 배열 하나다. **이름 붙인 호출이 하나도
 * 없다** — 검사가 그것을 전수로 본다.
 *
 * ── `&&` 를 한 번도 쓰지 않는다
 *
 * `ir-interpreter` 의 `&&` 는 짧은 회로가 아니다. 양쪽을 먼저 셈하므로
 * `j <= limit && mark[j] == 0` 꼴을 쓰면 오른쪽 색인이 범위 밖에서도 실제로 읽힌다.
 * 여섯 언어의 `&&` 는 짧은 회로라 **인터프리터에서만 다른 답이 나온다.**
 *
 * 여기서는 그런 식이 애초에 없다. 안쪽 루프의 조건은 `j <= limit` 하나이고,
 * "아직 안 지워졌는가" 는 `if` 로 한 겹 포개어 갈랐다. 체는 두 물음이 서로
 * 다른 층에 있는 알고리즘이라 포개는 편이 원래 모양이기도 하다.
 *
 * ── 32비트
 *
 * 가장 큰 중간값은 `i * i` 다. 손잡이의 끝이 120 이므로 121 을 넘지 않는다.
 * 여섯 언어 어디서도 넘치지 않는다.
 *
 * ── 왜 함수가 둘인가
 *
 * 지우는 일과 거두는 일은 셈이 다르고, 이 화면이 말하는 것은 앞의 것이다. 한
 * 함수에 이어 붙이면 `return` 이 하나뿐이라 둘 중 하나(표시 횟수 또는 소수 개수)를
 * 밖으로 못 낸다. 갈라 두면 둘 다 돌려주고, 코드 패널에서도 "지우개는 √N 에서
 * 멎고, 거두기는 끝까지 간다" 는 두 루프의 길이 차가 그대로 보인다.
 *
 * ── 이름
 *
 * `out` · `base` · `ref` · `params` 는 C# 의 예약어라 쓰지 않는다 (transpiler 는
 * 이름을 고쳐 주지 않는다 — S-transpiler). 그래서 결과 배열은 `primes` 다.
 *
 * phase 어휘는 algorithm.ts 와 집합이 완전히 일치한다 (C3):
 *   'outer' | 'mark' | 'collect' | 'finish'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: { kind: 'int' } };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '*' | '<=' | '==', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op: o,
  l,
  r,
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. 지우기 — 지우개가 되는 수는 제곱이 판을 넘지 않는 것뿐이다
// ─────────────────────────────────────────────────────────────────────────────

const sieveBody: IRStmt[] = [
  { kind: 'var', name: 'marks', type: INT, init: lit(0) },
  { kind: 'var', name: 'i', type: INT, init: lit(2) },
  {
    kind: 'while',
    // 이 한 줄이 이 화면의 주장이다 — 바깥 루프는 √limit 에서 멎는다.
    cond: op('<=', op('*', v('i'), v('i')), v('limit')),
    phase: 'outer',
    body: [
      {
        kind: 'if',
        cond: op('==', at('mark', v('i')), lit(0)),
        phase: 'outer',
        then: [
          // i 보다 작은 소수가 이미 지운 배수는 다시 지나지 않는다.
          { kind: 'var', name: 'j', type: INT, init: op('*', v('i'), v('i')) },
          {
            kind: 'while',
            cond: op('<=', v('j'), v('limit')),
            phase: 'mark',
            body: [
              { kind: 'assign', target: at('mark', v('j')), expr: lit(1), phase: 'mark' },
              { kind: 'assign', target: v('marks'), expr: op('+', v('marks'), lit(1)) },
              { kind: 'assign', target: v('j'), expr: op('+', v('j'), v('i')) },
            ],
          },
        ],
      },
      { kind: 'assign', target: v('i'), expr: op('+', v('i'), lit(1)) },
    ],
  },
  { kind: 'return', expr: v('marks'), phase: 'finish' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. 거두기 — 지워지지 않은 칸이 소수다
// ─────────────────────────────────────────────────────────────────────────────

const collectBody: IRStmt[] = [
  { kind: 'var', name: 'count', type: INT, init: lit(0) },
  { kind: 'var', name: 'n', type: INT, init: lit(2) },
  {
    kind: 'while',
    cond: op('<=', v('n'), v('limit')),
    phase: 'collect',
    body: [
      {
        kind: 'if',
        cond: op('==', at('mark', v('n')), lit(0)),
        then: [
          { kind: 'assign', target: at('primes', v('count')), expr: v('n'), phase: 'collect' },
          { kind: 'assign', target: v('count'), expr: op('+', v('count'), lit(1)) },
        ],
      },
      { kind: 'assign', target: v('n'), expr: op('+', v('n'), lit(1)) },
    ],
  },
  { kind: 'return', expr: v('count'), phase: 'finish' },
];

export const sieveImperativeIR: IR = {
  id: 'sieve-imperative',
  algorithm: 'sieve',
  paradigm: 'imperative',
  functions: [
    {
      name: 'sieve',
      params: [
        { name: 'mark', type: INTS },
        { name: 'limit', type: INT },
      ],
      returnType: INT,
      body: sieveBody,
    },
    {
      name: 'collect',
      params: [
        { name: 'mark', type: INTS },
        { name: 'primes', type: INTS },
        { name: 'limit', type: INT },
      ],
      returnType: INT,
      body: collectBody,
    },
  ],
};

export const sieveIRs: IR[] = [sieveImperativeIR];
