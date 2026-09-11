/**
 * matrix-mul 의 IR — 한 겹을 두 가지로 셈하고, 겹을 재귀로 센다.
 *
 * ── 갈림길: 스트라센의 재귀를 IR 로 펼 수 있는가
 *
 * **반은 된다. 그 반이 어느 쪽인지가 이 파일의 요점이다.**
 *
 * *재귀 자체는 문제가 아니다.* `IR.functions` 는 여러 함수를 담고 `call` 이
 * 그중 아무거나 부를 수 있으며 `ir-interpreter` 의 `call` 은 자기 자신도 부른다
 * (`merge_sort` 가 그 본이다). 그래서 `products` 는 진짜 재귀 함수로 펴진다.
 *
 * *막는 것은 배열이다.* IR 에는 **배열을 새로 만드는 수단이 없다.** 배열 리터럴이
 * 없고, `zeros` 같은 이름은 `types/ir.ts` 가 명시적으로 거부한다 ("어느 언어에도
 * 그 이름이 없는 것은 표기를 옮기는 일이 아니라 없는 것을 지어내는 일"). 배열은
 * **인자로 받는 길뿐**이다.
 *
 * 진짜 스트라센 재귀는 한 겹마다 사분면 넷을 잘라 내고 M₁..M₇ 일곱을 담을 자리를
 * 새로 얻어야 한다. 겹마다 새 배열 열한 개다. 인자로는 받을 수 없다 — 깊이가
 * 손잡이라 몇 개가 필요한지 부르는 쪽도 모른다.
 *
 * 큰 스크래치 배열 하나를 받아 자리를 나눠 쓰는 길은 있다. 택하지 않았다. 그러면
 * 코드 패널이 스트라센 대신 **자리 나누기 셈**을 보이게 되고, 그것은 `types/ir.ts`
 * 가 "코드 패널이 알고리즘 대신 테일러 급수를 보이게 된다" 로 경계한 바로 그
 * 모양이다. 코드 패널을 다는 까닭 자체가 지워진다.
 *
 * ── 그래서 편 것
 *
 * 못 펴는 것은 **행렬을 넷으로 갈라 내려가는 부분**이고, 그것 말고는 다 펴진다.
 *
 *   standard_2x2   한 겹을 표준으로. 결과 배열 `c` 를 인자로 받으니 배열을 만들
 *                  일이 없다. 곱셈을 세어 돌려주므로 여덟이 상수가 아니다.
 *   strassen_2x2   같은 겹을 곱 일곱으로. `m` 을 인자로 받아 일곱을 담고, 거기서
 *                  `c` 를 되맞춘다. **이것이 스트라센의 전부다** — 재귀가 하는
 *                  일은 이 한 겹을 블록 단위로 되풀이하는 것뿐이다.
 *   products       겹을 세는 재귀. `per` 벌로 갈라지고 각 벌이 아래 겹을 되풀이한다.
 *                  8 과 7 을 인자로 받으므로 한 함수가 양쪽을 다 센다.
 *   saved_products 아낀 곱셈. 이 facet 의 주 수치다.
 *
 * 즉 코드 패널이 보이는 것은 **한 겹의 진짜 셈 + 겹을 세는 진짜 재귀**이고,
 * 빠진 것은 그 둘을 잇는 배열 쪼개기뿐이다. `tsne`·`t-digest` 처럼 IR 을 통째로
 * 버리지 않아도 되는 자리라 버리지 않았다.
 *
 * ── 함수 차례
 *
 * `types/ir.ts` 는 "첫 함수가 entry point" 라 적어 두었다. 여기서는 재생 차례대로
 * 놓았다 — 화면이 표준 → 스트라센 → 되맞추기 → 겹 세기로 가므로 코드 패널의
 * phase 하이라이트가 위에서 아래로 흐른다. 그 규약에 기대는 소비자가 저장소에
 * 없어서(`functions[0]` 를 읽는 곳이 한 군데도 없다) 읽는 차례를 택했다. 뜻으로
 * 따지면 entry 는 맨 뒤의 `saved_products` 다.
 *
 * ── 2차원이 없다
 *
 * IR 에 2차원 배열이 없으므로 2×2 블록을 길이 4 의 배열로 눕혀 `a[i*n+j]` 로
 * 짚는다 (`aho-corasick` 이 트라이를 눕힌 것과 같은 수법).
 *
 * ── `&&` 는 쓰지 않았다
 *
 * `ir-interpreter` 의 `&&` 는 짧은 회로가 아니라 오른쪽이 늘 셈해진다. 2 차원을
 * 눕혀 짚는 IR 이라 범위 밖 색인이 특히 위험한데, 여기 조건은 `k == 0` 하나뿐이라
 * 그 함정에 닿지 않는다. 조건을 더하게 되거든 `if` 를 포개어 갈라라.
 *
 * ── 크기
 *
 * 가장 큰 중간값은 `products(7, 8)` 의 2,097,152 다. 여섯 언어의 32비트 정수
 * 어디서도 넘치지 않는다. 깊이를 더 밀면(k=11 에서 8ᵏ ≈ 8.6억) 그때는 넘친다 —
 * 손잡이가 7 에서 멈추는 까닭 중 하나다.
 *
 * phase 어휘는 `algorithm.ts` 와 집합이 완전히 일치한다 (C3):
 *   'standard' | 'strassen' | 'combine' | 'base' | 'recurse'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: { kind: 'int' } };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const len = (name: string): IRExpr => ({ kind: 'len', of: v(name) });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const op = (o: '+' | '-' | '*' | '==', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op: o,
  l,
  r,
});

/** 눕힌 2×2 의 한 칸 — `arr[row * n + col]`. */
const cell = (arr: string, row: IRExpr, col: IRExpr): IRExpr =>
  at(arr, op('+', op('*', row, v('n')), col));

/** 붙박이 자리를 번호로 짚는다 — `a[0]` 은 a₁₁, `a[3]` 은 a₂₂. */
const a = (i: number): IRExpr => at('a', lit(i));
const b = (i: number): IRExpr => at('b', lit(i));
const m = (i: number): IRExpr => at('m', lit(i));

const setM = (i: number, expr: IRExpr): IRStmt => ({
  kind: 'assign',
  target: m(i),
  expr,
  phase: 'strassen',
});

const setC = (i: number, expr: IRExpr): IRStmt => ({
  kind: 'assign',
  target: at('c', lit(i)),
  expr,
  phase: 'combine',
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. 한 겹을 표준으로 — 칸마다 짝을 맞물려 더한다 (조각 `rowTimesColumn` 의 그것)
// ─────────────────────────────────────────────────────────────────────────────

const standardBody: IRStmt[] = [
  { kind: 'comment', text: '2×2 블록을 길이 4 의 배열로 눕혔다 — IR 에 2차원 배열이 없다.' },
  { kind: 'var', name: 'n', type: INT, init: lit(2) },
  { kind: 'var', name: 'mults', type: INT, init: lit(0) },
  {
    kind: 'for-range',
    var: 'i',
    from: lit(0),
    to: v('n'),
    inclusive: false,
    body: [
      {
        kind: 'for-range',
        var: 'j',
        from: lit(0),
        to: v('n'),
        inclusive: false,
        body: [
          { kind: 'var', name: 's', type: INT, init: lit(0) },
          {
            kind: 'for-range',
            var: 'k',
            from: lit(0),
            to: v('n'),
            inclusive: false,
            body: [
              {
                kind: 'assign',
                target: v('s'),
                expr: op(
                  '+',
                  v('s'),
                  op('*', cell('a', v('i'), v('k')), cell('b', v('k'), v('j'))),
                ),
                phase: 'standard',
              },
              {
                kind: 'assign',
                target: v('mults'),
                expr: op('+', v('mults'), lit(1)),
                phase: 'standard',
              },
            ],
          },
          { kind: 'assign', target: cell('c', v('i'), v('j')), expr: v('s') },
        ],
      },
    ],
  },
  { kind: 'comment', text: '여덟은 상수가 아니라 세어 나온 수다.' },
  { kind: 'return', expr: v('mults') },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. 같은 겹을 곱 일곱으로 — 피연산자가 합·차가 되는 대신 곱이 하나 준다
// ─────────────────────────────────────────────────────────────────────────────

const strassenBody: IRStmt[] = [
  { kind: 'comment', text: '곱 일곱. 피연산자는 원소 하나이거나 둘의 합·차다.' },
  setM(0, op('*', op('+', a(0), a(3)), op('+', b(0), b(3)))),
  setM(1, op('*', op('+', a(2), a(3)), b(0))),
  setM(2, op('*', a(0), op('-', b(1), b(3)))),
  setM(3, op('*', a(3), op('-', b(2), b(0)))),
  setM(4, op('*', op('+', a(0), a(1)), b(3))),
  setM(5, op('*', op('-', a(2), a(0)), op('+', b(0), b(1)))),
  setM(6, op('*', op('-', a(1), a(3)), op('+', b(2), b(3)))),
  { kind: 'comment', text: '되맞추기 — 여기에는 곱셈이 하나도 없다.' },
  setC(0, op('+', op('-', op('+', m(0), m(3)), m(4)), m(6))),
  setC(1, op('+', m(2), m(4))),
  setC(2, op('+', m(1), m(3))),
  setC(3, op('+', op('+', op('-', m(0), m(1)), m(2)), m(5))),
  { kind: 'comment', text: '곱은 일곱 — m 의 자리 수가 그것이다.' },
  { kind: 'return', expr: len('m') },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. 겹을 센다 — 여기가 재귀다
// ─────────────────────────────────────────────────────────────────────────────

const productsBody: IRStmt[] = [
  { kind: 'comment', text: '밑바닥에서 블록은 수 하나다. 곱셈도 하나.' },
  {
    kind: 'if',
    phase: 'base',
    cond: op('==', v('k'), lit(0)),
    then: [{ kind: 'return', expr: lit(1), phase: 'base' }],
  },
  { kind: 'comment', text: '한 겹이 per 벌로 갈라지고, 각 벌이 아래 겹을 통째로 되풀이한다.' },
  {
    kind: 'return',
    phase: 'recurse',
    expr: op('*', v('per'), call('products', [op('-', v('k'), lit(1)), v('per')])),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. 아낀 곱셈 — 이 화면의 주 수치
// ─────────────────────────────────────────────────────────────────────────────

const savedBody: IRStmt[] = [
  { kind: 'comment', text: '한 겹에서 여덟이냐 일곱이냐 — 그 하나가 깊이를 타고 불어난다.' },
  {
    kind: 'return',
    expr: op('-', call('products', [v('k'), lit(8)]), call('products', [v('k'), lit(7)])),
  },
];

export const matrixMulImperativeIR: IR = {
  id: 'matrix-mul-imperative',
  algorithm: 'matrixMul',
  paradigm: 'imperative',
  functions: [
    {
      name: 'standard_2x2',
      params: [
        { name: 'a', type: INTS },
        { name: 'b', type: INTS },
        { name: 'c', type: INTS },
      ],
      returnType: INT,
      body: standardBody,
    },
    {
      name: 'strassen_2x2',
      params: [
        { name: 'a', type: INTS },
        { name: 'b', type: INTS },
        { name: 'c', type: INTS },
        { name: 'm', type: INTS },
      ],
      returnType: INT,
      body: strassenBody,
    },
    {
      name: 'products',
      params: [
        { name: 'k', type: INT },
        { name: 'per', type: INT },
      ],
      returnType: INT,
      body: productsBody,
    },
    {
      name: 'saved_products',
      params: [{ name: 'k', type: INT }],
      returnType: INT,
      body: savedBody,
    },
  ],
};

export const matrixMulIRs: IR[] = [matrixMulImperativeIR];
