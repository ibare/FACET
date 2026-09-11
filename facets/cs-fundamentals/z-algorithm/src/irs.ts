/**
 * z-algorithm 의 IR — Z 배열을 채우고, 그 표에서 등장 자리를 거둔다.
 *
 * 핵심 셈이 배열 · 반복 · 조건뿐이라 이름 붙인 호출 뒤로 숨을 것이 하나도 없다.
 * 함수 **셋**이 나란히 서는 것이 이 패널의 몫이다.
 *
 *   z_array        되빌려 쓰는 빠른 방법. 화면이 재생하는 것이 이것이다.
 *   z_array_naive  되빌리지 않는 곧은 방법. 대비를 위한 것이다.
 *   find_all       그 표에서 등장 자리를 거둔다.
 *
 * 둘째가 있는 까닭은 **아낀 비교가 어디서 오는지 보이게** 하려는 것이다. 앞의
 * 둘은 뼈대가 같고 갈리는 것은 딱 두 덩이다 — 거울에서 빌리는 블록과 구간을
 * 옮기는 블록. 그 둘을 덜어 내면 곧은 방법이 된다.
 *
 * 그리고 `find_all` 이 `z` 만 보고 글을 다시 안 본다는 사실이 **찾기가 표에서
 * 떨어져 나온다** 는 주장을 눈에 보이게 한다.
 *
 * ── 문자열을 그대로 받는다
 *
 * `IRType` 의 `string` 은 여섯 언어가 다 받는다. 색인과 길이를 transpiler 가
 * 자기 표기로 옮긴다 — java 는 `charAt(i)` · `length()`, cpp 는 `[i]` · `size()`,
 * csharp 는 `[i]` · `Length`, 나머지 셋은 `[i]` · `len`/`length`. 글자를 수로
 * 바꿔 `list of int` 로 넘기는 우회를 쓰지 않는 까닭이다 — 그러면 패널이 문자열
 * 알고리즘이 아니라 부호 배열 다루기를 보인다.
 *
 * ── 범위 검사와 글자 비교를 `&&` 로 묶지 않는다
 *
 * 견주는 루프를 `while i + k < n && text[k] == text[i + k]` 로 적고 싶어진다.
 * 조각 `match-length-per-spot` 의 TypeScript 가 바로 그 모양이다. **IR 에서는
 * 그렇게 적으면 안 된다.**
 *
 *   - 여섯 언어는 `&&` · `and` 를 단락 평가하므로 그 형태로도 성한다.
 *   - 그러나 **`ir-interpreter` 는 양쪽을 먼저 셈한다** (`binop` 이 `l` 과 `r`
 *     을 모두 구한 뒤에 연산자를 본다). 앞의 범위 검사가 거짓인 순간에도
 *     `text[i + k]` 를 짚으러 간다.
 *
 * 지금 자바스크립트에서는 범위 밖 색인이 던지지 않고 `undefined` 를 주어 답이
 * 우연히 맞지만, **그것은 인터프리터를 떠받치는 언어의 사정이지 IR 의 뜻이
 * 아니다.** 인터프리터가 IR 의미의 단일 진실 원천이므로 그 우연에 기대지 않는다.
 *
 * 그래서 **범위 검사만 `while` 에 두고 글자 비교는 안으로 넣어 `break` 한다.**
 * 그러면 `text[i + k]` 는 `i + k < n` 이 참일 때만 셈해진다. 코드 패널에서도
 * 이 편이 읽기 낫다.
 *
 * ── 글자를 변수에 담지 않는다
 *
 * `text[k] != text[i + k]` 를 **그 자리에서** 짚는다. 중간 변수에 담으면 java
 * emit 이 `String tmp = text.charAt(…)` 이 되어 `char` 끼리의 비교가 깨진다.
 * IR 에 `char` 타입이 없어 transpiler 가 색인 결과를 `string` 으로 보기 때문이다.
 *
 * ── 갈래 하나로 둘을 덮는다
 *
 * `if i + k > right` 가 "구간 밖" 과 "빌린 것이 구간 끝에 닿았다" 를 한꺼번에
 * 덮는다. 구간 밖이면 `right < i` 라 늘 참이기 때문이다. algorithm.ts 가 같은
 * 식을 적으므로 둘이 어긋날 자리가 없다.
 *
 * ── C# 예약어
 *
 * `base` · `out` · `ref` · `params` · `lock` · `event` · `string` · `object` 를
 * 식별자로 쓰지 않았다. transpiler 는 rename 하지 않는다 (S-transpiler).
 * 여기 이름은 `text` · `z` · `n` · `left` · `right` · `i` · `k` · `mirror` ·
 * `hits` · `count` · `m` 뿐이고 여섯 언어 어디서도 예약어가 아니다.
 *
 * phase 어휘는 algorithm.ts 와 집합이 완전히 일치한다 (C3):
 *   'whole' | 'borrow' | 'scan' | 'window' | 'collect'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const VOID: IRType = { kind: 'void' };
const STR: IRType = { kind: 'string' };
const INT_LIST: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (
  op: '+' | '-' | '*' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: IRExpr, idx: IRExpr): IRExpr => ({ kind: 'index', arr, idx });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });

// ── z_array — 자리마다 맨 앞과 겹치는 길이를 채운다 ─────────────────────────

/** 남은 구간의 길이 `right - i + 1`. 빌릴 수 있는 최대다. */
const remaining: IRExpr = bin('+', bin('-', v('right'), v('i')), lit(1));

const zArrayBody: IRStmt[] = [
  { kind: 'var', name: 'n', type: INT, init: len(v('text')) },
  // 맨 앞 자리는 자기 자신과 견주는 셈이라 정의상 이은 글 전체 길이다.
  { kind: 'assign', target: at(v('z'), lit(0)), expr: v('n'), phase: 'whole' },
  { kind: 'var', name: 'left', type: INT, init: lit(0) },
  { kind: 'var', name: 'right', type: INT, init: lit(-1) },
  { kind: 'var', name: 'i', type: INT, init: lit(1) },
  {
    kind: 'while',
    cond: bin('<', v('i'), v('n')),
    body: [
      { kind: 'var', name: 'k', type: INT, init: lit(0) },
      {
        // 구간 안이면 거울 자리의 답을 빌린다.
        kind: 'if',
        cond: bin('<=', v('i'), v('right')),
        then: [
          { kind: 'var', name: 'mirror', type: INT, init: bin('-', v('i'), v('left')) },
          { kind: 'assign', target: v('k'), expr: at(v('z'), v('mirror')), phase: 'borrow' },
          {
            // 구간 끝을 넘는 몫은 확인된 적이 없으므로 거기까지만 빌린다.
            kind: 'if',
            cond: bin('<', remaining, v('k')),
            then: [{ kind: 'assign', target: v('k'), expr: remaining, phase: 'borrow' }],
          },
        ],
      },
      {
        // 구간 밖이거나, 빌린 것이 구간 끝에 닿았다. 그 너머는 실제로 견준다.
        kind: 'if',
        cond: bin('>', bin('+', v('i'), v('k')), v('right')),
        then: [
          {
            // 범위 검사만 여기 둔다. 글자 비교까지 `&&` 로 묶으면 인터프리터가
            // 오른쪽을 늘 셈해 글의 끝 너머를 짚는다 (위 주석).
            kind: 'while',
            cond: bin('<', bin('+', v('i'), v('k')), v('n')),
            body: [
              {
                // 글자는 그 자리에서 짚는다 — 변수에 담으면 java 가 깨진다.
                kind: 'if',
                cond: bin('!=', at(v('text'), v('k')), at(v('text'), bin('+', v('i'), v('k')))),
                then: [{ kind: 'break', phase: 'scan' }],
                phase: 'scan',
              },
              { kind: 'assign', target: v('k'), expr: bin('+', v('k'), lit(1)), phase: 'scan' },
            ],
            phase: 'scan',
          },
        ],
      },
      { kind: 'assign', target: at(v('z'), v('i')), expr: v('k') },
      {
        // 겹침이 여태보다 오른쪽에 닿았을 때만 구간을 옮긴다. 그래서 오른쪽
        // 끝은 한 번도 뒤로 가지 않고, 그것이 전체가 글 길이에 비례하는 까닭이다.
        kind: 'if',
        cond: bin(
          '&&',
          bin('>', v('k'), lit(0)),
          bin('>', bin('-', bin('+', v('i'), v('k')), lit(1)), v('right')),
        ),
        then: [
          { kind: 'assign', target: v('left'), expr: v('i'), phase: 'window' },
          {
            kind: 'assign',
            target: v('right'),
            expr: bin('-', bin('+', v('i'), v('k')), lit(1)),
            phase: 'window',
          },
        ],
      },
      { kind: 'assign', target: v('i'), expr: bin('+', v('i'), lit(1)) },
    ],
  },
];

// ── z_array_naive — 되빌리지 않는 곧은 방법 ────────────────────────────────
//
// **뼈대가 위와 같다.** 빌리는 블록과 구간을 옮기는 블록 둘만 덜어 내면 이것이
// 된다. 나란히 두는 까닭이 그것이다 — 두 방식이 갈리는 자리가 딱 그 두 덩이라는
// 것이, 그리고 "아낀 비교" 가 어디서 나오는 수인지가 눈에 보인다.
//
// **phase 를 달지 않는다.** 재생하는 것은 빠른 쪽이라, 여기에도 'scan' 을 달면
// 한 걸음에 두 함수가 함께 켜져 어느 쪽이 도는지 흐려진다. 새 phase 를 더하지도
// 않으므로 algorithm 과의 집합 일치는 그대로다 (C3).

const zArrayNaiveBody: IRStmt[] = [
  { kind: 'var', name: 'n', type: INT, init: len(v('text')) },
  { kind: 'assign', target: at(v('z'), lit(0)), expr: v('n') },
  { kind: 'var', name: 'i', type: INT, init: lit(1) },
  {
    kind: 'while',
    cond: bin('<', v('i'), v('n')),
    body: [
      // 자리마다 맨 앞으로 돌아간다 — 여기에 되빌릴 것이 없다.
      { kind: 'var', name: 'k', type: INT, init: lit(0) },
      {
        kind: 'while',
        cond: bin('<', bin('+', v('i'), v('k')), v('n')),
        body: [
          {
            kind: 'if',
            cond: bin('!=', at(v('text'), v('k')), at(v('text'), bin('+', v('i'), v('k')))),
            then: [{ kind: 'break' }],
          },
          { kind: 'assign', target: v('k'), expr: bin('+', v('k'), lit(1)) },
        ],
      },
      { kind: 'assign', target: at(v('z'), v('i')), expr: v('k') },
      { kind: 'assign', target: v('i'), expr: bin('+', v('i'), lit(1)) },
    ],
  },
];

// ── find_all — 표에서 등장 자리가 떨어져 나온다 ─────────────────────────────
//
// 글을 한 글자도 다시 보지 않는다. 보는 것은 `z` 뿐이다.
// 칸막이는 한 글자라고 본다 — 그래서 글의 자리는 `i - m - 1` 이다.

const findAllBody: IRStmt[] = [
  { kind: 'var', name: 'n', type: INT, init: len(v('z')) },
  { kind: 'var', name: 'count', type: INT, init: lit(0) },
  { kind: 'var', name: 'i', type: INT, init: bin('+', v('m'), lit(1)) },
  {
    kind: 'while',
    cond: bin('<', v('i'), v('n')),
    body: [
      {
        // 값이 찾는 것의 길이와 꼭 같은 자리가 등장 자리다. 칸막이가 둘 어디에도
        // 없는 글자라 그보다 큰 값은 나올 수 없다.
        kind: 'if',
        cond: bin('==', at(v('z'), v('i')), v('m')),
        then: [
          {
            kind: 'assign',
            target: at(v('hits'), v('count')),
            expr: bin('-', bin('-', v('i'), v('m')), lit(1)),
            phase: 'collect',
          },
          { kind: 'assign', target: v('count'), expr: bin('+', v('count'), lit(1)), phase: 'collect' },
        ],
        phase: 'collect',
      },
      { kind: 'assign', target: v('i'), expr: bin('+', v('i'), lit(1)) },
    ],
  },
  { kind: 'return', expr: v('count') },
];

export const zAlgorithmImperativeIR: IR = {
  id: 'z-algorithm-imperative',
  algorithm: 'zAlgorithm',
  paradigm: 'imperative',
  functions: [
    {
      name: 'z_array',
      params: [
        { name: 'text', type: STR },
        { name: 'z', type: INT_LIST },
      ],
      returnType: VOID,
      body: zArrayBody,
    },
    {
      name: 'z_array_naive',
      params: [
        { name: 'text', type: STR },
        { name: 'z', type: INT_LIST },
      ],
      returnType: VOID,
      body: zArrayNaiveBody,
    },
    {
      name: 'find_all',
      params: [
        { name: 'z', type: INT_LIST },
        { name: 'm', type: INT },
        { name: 'hits', type: INT_LIST },
      ],
      returnType: INT,
      body: findAllBody,
    },
  ],
};

export const zAlgorithmIRs: IR[] = [zAlgorithmImperativeIR];
