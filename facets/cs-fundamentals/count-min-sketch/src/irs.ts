/**
 * countMinSketch 의 IR — 넣기와 읽기 두 함수.
 *
 * 핵심 셈이 IR 어휘로 온전히 펴진다. 2차원 배열(`list of list of int`) + 이중
 * 반복문 + `min`(예약 이름)이면 이 자료구조가 하는 일이 다 나온다.
 *
 * **이름 붙인 호출 뒤로 감춘 것은 해시 둘뿐이다.** `IRBinOp` 에 비트 연산이 없어
 * (`+ - * / // %` · 비교 · `&& ||`) `& 0x7FFFFFFF` 나 `^` 를 IR 안에서 쓸 수 없고,
 * 글자를 훑는 수단도 없다. 그래서 `h1` · `h2` 는 IR 이 정의하지 않는 호출로 둔다 —
 * 여섯 transpiler 는 정의되지 않은 이름을 그대로 내보내므로 코드 패널은 온전하고,
 * 감춘 것은 해시의 **속**이지 이 알고리즘의 셈이 아니다.
 *
 *   `h1(key)`     Java `String.hashCode` 를 `& 0x7FFFFFFF` 한 값
 *   `h2(key, r)`  FNV-1a 32bit 를 `& 0x7FFFFFFF` 한 뒤 홀수로 만들고(`| 1`),
 *                 `r` 을 곱해 다시 `& 0x7FFFFFFF` 로 접은 값
 *
 * `r` 이 `h2` 의 인자로 들어간 까닭은 아래 `cellOf` 주석에 적어 두었다.
 *
 * 표는 **인자로 받는다.** `IRExpr` 에 배열 리터럴이 없고(`lit` 은 수·글·참거짓뿐)
 * `zeros` 같은 이름은 예약할 수 없으므로(어느 언어에도 그 이름이 없다), IR 안에서
 * 배열을 만들 길이 아예 없다.
 *
 * phase 어휘는 `algorithm.ts` 와 집합이 완전히 일치해야 한다 (C3) —
 * `hash` · `bump` · `probe` · `take-min` · `answer`.
 */

import type { IR, IRExpr, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };
const TABLE: IRType = { kind: 'list', of: INT_LIST };
const STR_LIST: IRType = { kind: 'list', of: { kind: 'string' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });

/**
 * `(h1(key) % w + h2(key, r) % w) % w` — 이중 해싱으로 줄 r 의 자리를 셈한다.
 *
 * 두 가지를 일부러 이 모양으로 둔다.
 *
 * **`r` 을 `h2` 안으로 넣었다.** 자리 식은 `(h1 + r·h2) mod w` 이고 `r·h2` 는
 * 31 비트 안으로 접어야 하는데(그래야 부호가 돌지 않는다), `IRBinOp` 에 비트
 * 연산이 없다. `x & 0x7FFFFFFF` 는 음이 아닌 `x` 에 대해 `x % 2147483648` 과 같아
 * 산술로도 적을 수 있지만, 그러면 `r * h2` 라는 **중간값**이 먼저 나온다 — 그것이
 * 32bit `int` 를 넘으므로 java · cpp · csharp 에서 접기 전에 이미 넘쳐 버린다.
 * 그래서 접는 일까지 `h2(key, r)` 안에 둔다.
 *
 * **더하기 전에 각 항을 `% w` 로 줄인다.** `(a + s) mod w` 와
 * `((a mod w) + (s mod w)) mod w` 는 음이 아닌 정수에서 같은 값이고, 뒤쪽은 모든
 * 중간값이 `w` 보다 작아 어느 언어에서도 넘치지 않는다. 그냥 `a + s` 로 두면 둘 다
 * 2^31 에 가까워 합이 32bit 를 넘고, 넘친 값에 `% w` 를 하면 음수 자리가 나온다.
 */
const cellOf = (key: IRExpr): IRExpr => ({
  kind: 'binop',
  op: '%',
  l: {
    kind: 'binop',
    op: '+',
    l: {
      kind: 'binop',
      op: '%',
      l: { kind: 'call', fn: 'h1', args: [key] },
      r: v('w'),
    },
    r: {
      kind: 'binop',
      op: '%',
      l: { kind: 'call', fn: 'h2', args: [key, v('r')] },
      r: v('w'),
    },
  },
  r: v('w'),
});

/** `table[r][c]` */
const cellAt: IRExpr = {
  kind: 'index',
  arr: { kind: 'index', arr: v('table'), idx: v('r') },
  idx: v('c'),
};

export const countMinSketchImperativeIR: IR = {
  id: 'count-min-sketch-imperative',
  algorithm: 'countMinSketch',
  paradigm: 'imperative',
  functions: [
    // ── 넣기 — 이중 반복문. 키마다, 줄마다 한 칸씩 오른다.
    {
      name: 'count',
      params: [
        { name: 'table', type: TABLE },
        { name: 'keys', type: STR_LIST },
        { name: 'counts', type: INT_LIST },
        { name: 'w', type: INT },
        { name: 'd', type: INT },
      ],
      returnType: { kind: 'void' },
      body: [
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: { kind: 'len', of: v('keys') },
          inclusive: false,
          body: [
            {
              kind: 'for-range',
              var: 'r',
              from: lit(0),
              to: v('d'),
              inclusive: false,
              body: [
                {
                  kind: 'var',
                  name: 'c',
                  type: INT,
                  init: cellOf({ kind: 'index', arr: v('keys'), idx: v('i') }),
                  phase: 'hash',
                },
                {
                  kind: 'assign',
                  target: cellAt,
                  expr: {
                    kind: 'binop',
                    op: '+',
                    l: cellAt,
                    r: { kind: 'index', arr: v('counts'), idx: v('i') },
                  },
                  phase: 'bump',
                },
              ],
            },
          ],
        },
      ],
    },

    // ── 읽기 — 줄마다 하나씩 읽고 그중 가장 작은 것을 돌려준다.
    {
      name: 'read',
      params: [
        { name: 'table', type: TABLE },
        { name: 'key', type: { kind: 'string' } },
        { name: 'w', type: INT },
        { name: 'd', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'start above every possible count' },
        { kind: 'var', name: 'best', type: INT, init: lit(2147483647) },
        {
          kind: 'for-range',
          var: 'r',
          from: lit(0),
          to: v('d'),
          inclusive: false,
          body: [
            {
              kind: 'var',
              name: 'c',
              type: INT,
              init: cellOf(v('key')),
              phase: 'hash',
            },
            { kind: 'var', name: 'seen', type: INT, init: cellAt, phase: 'probe' },
            {
              kind: 'assign',
              target: v('best'),
              expr: { kind: 'call', fn: 'min', args: [v('best'), v('seen')] },
              phase: 'take-min',
            },
          ],
        },
        { kind: 'comment', text: 'a cell can carry other keys, so this never reads low' },
        { kind: 'return', expr: v('best'), phase: 'answer' },
      ],
    },
  ],
};

export const countMinSketchIRs: IR[] = [countMinSketchImperativeIR];
