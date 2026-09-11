/**
 * 접미사 배열 학습용 IR — 줄 세우기와, 그 위에서의 이분 탐색.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def suffix_less(text, a, b):
 *       i = 0
 *       while a + i < len(text) and b + i < len(text):
 *           if text[a+i] != text[b+i]:                 # phase: compare-tails
 *               return text[a+i] < text[b+i]
 *           i = i + 1
 *       return len(text) - a < len(text) - b
 *
 *   def build_suffix_array(text, sa):
 *       for i in range(len(text)):
 *           sa[i] = i                                  # phase: cut
 *       for i in range(1, len(text)):
 *           j = i
 *           moving = 1
 *           while j > 0 and moving == 1:
 *               if suffix_less(text, sa[j], sa[j-1]):  # phase: compare-tails
 *                   swap sa[j], sa[j-1]                # phase: place
 *                   j = j - 1
 *               else:
 *                   moving = 0
 *
 *   def prefix_cmp(text, s, pat):
 *       i = 0
 *       while i < len(pat):
 *           if s + i >= len(text): return -1
 *           if text[s+i] != pat[i]:                    # phase: compare-pattern
 *               if text[s+i] < pat[i]: return -1
 *               return 1
 *           i = i + 1
 *       return 0
 *
 *   def count_matches(text, sa, pat):
 *       lo = 0
 *       hi = len(sa)
 *       while lo < hi:
 *           mid = (lo + hi) // 2                       # phase: pick-mid
 *           if prefix_cmp(text, sa[mid], pat) < 0:     # phase: compare-pattern
 *               lo = mid + 1                           # phase: go-right
 *           else:
 *               hi = mid                               # phase: go-left
 *       start = lo                                     # phase: block-start
 *       k = start
 *       scanning = 1
 *       while k < len(sa) and scanning == 1:
 *           if prefix_cmp(text, sa[k], pat) == 0:
 *               k = k + 1                              # phase: extend-block
 *           else:
 *               scanning = 0
 *       return k - start
 *
 * ── `&&` 의 오른쪽이 왼쪽 검사에 기대게 두지 않는다
 *
 * **`ir-interpreter` 의 `&&` 는 짧은 회로가 아니다.** `evalExpr` 의 `case 'binop'`
 * 이 `l` 과 `r` 을 **둘 다 먼저 셈한 뒤** 연산자를 본다. 그래서 흔히 쓰는
 *
 *     while j > 0 and suffix_less(text, sa[j], sa[j-1])      ← 두지 않는다
 *     while k < len(sa) and prefix_cmp(text, sa[k], pat) == 0 ← 두지 않는다
 *
 * 꼴은 경계에서 오른쪽이 그대로 돌아 `sa[-1]` 과 `sa[len]` 을 짚는다. 여섯 언어의
 * 실제 `&&` 는 짧은 회로라 emit 된 코드는 멀쩡하지만, **IR 의 뜻을 정하는 것은
 * 인터프리터**이므로 (그것이 라운드트립 검증의 비교 기준이다) 이 모양 자체를
 * 두지 않는다.
 *
 * 처음에는 저 꼴로 적었고 **검사도 통과했다 — 우연이었다.** `sa[-1]` 이
 * `undefined` 라 `undefined + 0` 이 `NaN` 이 되고, NaN 과의 비교가 모두 false 라
 * 마침 맞는 답이 나왔을 뿐이다. 값 하나가 달랐으면 조용히 틀렸을 자리다.
 *
 * 그래서 경계 검사와 내용 검사를 **정수 플래그로 갈라** 둔다. `&&` 의 양쪽이 모두
 * 순수 산술이라 어느 쪽을 먼저 셈하든 안전하고, 짚는 일은 `if` 안에서만 일어난다.
 * `test/suffix-array.test.ts` 가 이 모양을 구조로 지킨다.
 *
 * ── 글자를 변수에 담지 않는다
 *
 * `a[i] == b[j]` 를 **그 자리에서** 짚어야 java 가 `a.charAt(i) == b.charAt(j)` 로
 * 내어 `char == char` 가 된다. 변수에 담으면 `String tmp = …charAt(…)` 이 되어
 * 컴파일되지 않는다 (IR 에 char 타입이 없어 `transpiler-java` 가 문자열로 본다).
 * 꼬리를 사전 순으로 견주는 셈이 전부 글자 비교라 이 자리를 많이 지나는데,
 * 여기 선언한 변수는 i · j · k · lo · hi · mid · start · moving · scanning 으로
 * **전부 정수**다.
 *
 * ── 정렬을 이름 뒤로 감추지 않는다
 *
 * `sort(sa, key=...)` 한 줄로 적으면 코드 패널이 할 말을 잃는다. 이 화면의 주장이
 * "줄 세워 두면 한 덩어리로 모인다" 인데, **무엇을 기준으로 줄 세웠는지**가 감춰지면
 * 왜 모이는지가 코드에서 사라지기 때문이다. 그래서 꼬리를 색인 배열로 두고 삽입
 * 정렬 + `swap` 으로 펴고, 글자 비교도 `suffix_less` 안의 루프로 편다.
 *
 * ── 배열을 만드는 어휘가 없다
 *
 * IR 에는 배열을 새로 만드는 표현이 없다 (`zeros` 같은 이름은 어느 언어에도 없어
 * 예약 이름에 넣지 않는다는 것이 `types/ir.ts` 의 판정이다). 그래서 `sa` 를
 * **파라미터로 받아** 채운다 — bloom-filter 가 `bits` 를 그렇게 받는 선례를 따른다.
 *
 * ── 문자열을 색인으로 짚는 것은 여섯 언어에서 모두 성립한다
 *
 * `text[i]` 는 python · javascript · typescript · cpp · csharp 이 그대로 내고,
 * java 만 `charAt(i)` 로 갈라 낸다 (`transpiler-java` 가 `inferType` 으로 문자열을
 * 가려 처리한다). `len` 도 `.length` / `.size()` / `.Length` / `.length()` 로 각자
 * 옮긴다. `trie` 의 IR 이 이미 `kind: 'string'` 파라미터를 쓰는 선례다.
 *
 * ── 넘침 걱정이 없다
 *
 * 중간값이 가장 큰 자리가 `(lo + hi) // 2` 인데 `hi` 는 글자 수(11)를 넘지 않는다.
 * 32비트 정수 폭을 가진 세 언어에서도 넘칠 일이 없다.
 *
 * phase 어휘는 `algorithm.ts` 의 `emit('phase', …)` 와 **글자 단위로** 같아야
 * 한다 (C3):
 *
 *   'cut' | 'compare-tails' | 'place' | 'pick-mid' | 'compare-pattern' |
 *   'go-right' | 'go-left' | 'block-start' | 'extend-block'
 *
 * C# 예약어를 식별자로 쓰지 않는다 (`base` · `out` · `ref` · `params` · `lock` ·
 * `event` · `string` · `object`).
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const BOOL: IRType = { kind: 'bool' };
const VOID: IRType = { kind: 'void' };
const STR: IRType = { kind: 'string' };
const INT_LIST: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | boolean): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** text[a + i] — 꼬리 a 의 i 번째 글자. 담아 두지 않고 그 자리에서 짚는다. */
const charAt = (offset: IRExpr): IRExpr => idx(v('text'), bin('+', offset, v('i')));

/** sa[j] 와 그 바로 위 칸. 짚는 일은 `j > 0` 이 이미 확인된 안쪽에서만 한다. */
const saAtJ: IRExpr = idx(v('sa'), v('j'));
const saAboveJ: IRExpr = idx(v('sa'), bin('-', v('j'), lit(1)));

// ─────────────────────────────────────────────────────────────────────────────
// 1. 꼬리 둘을 글자로 견준다.
// ─────────────────────────────────────────────────────────────────────────────

const suffixLessBody: IRStmt[] = [
  { kind: 'var', name: 'i', type: INT, init: lit(0) },
  {
    // `&&` 의 양쪽이 모두 순수 산술이라 둘 다 셈해도 안전하다.
    kind: 'while',
    cond: bin(
      '&&',
      bin('<', bin('+', v('a'), v('i')), len(v('text'))),
      bin('<', bin('+', v('b'), v('i')), len(v('text'))),
    ),
    body: [
      {
        kind: 'if',
        phase: 'compare-tails',
        cond: bin('!=', charAt(v('a')), charAt(v('b'))),
        then: [{ kind: 'return', expr: bin('<', charAt(v('a')), charAt(v('b'))) }],
      },
      { kind: 'assign', target: v('i'), expr: bin('+', v('i'), lit(1)) },
    ],
  },
  // 앞이 끝까지 같으면 짧은 쪽이 먼저다.
  {
    kind: 'return',
    expr: bin('<', bin('-', len(v('text')), v('a')), bin('-', len(v('text')), v('b'))),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. 색인을 사전 순으로 줄 세운다 — 삽입 정렬.
// ─────────────────────────────────────────────────────────────────────────────

const buildBody: IRStmt[] = [
  {
    kind: 'for-range',
    var: 'i',
    from: lit(0),
    to: len(v('text')),
    inclusive: false,
    body: [{ kind: 'assign', phase: 'cut', target: idx(v('sa'), v('i')), expr: v('i') }],
  },
  {
    kind: 'for-range',
    var: 'i',
    from: lit(1),
    to: len(v('text')),
    inclusive: false,
    body: [
      { kind: 'var', name: 'j', type: INT, init: v('i') },
      // 아직 내려갈 자리가 있는가를 담아 두는 표. 이것이 없으면 경계 검사와
      // 내용 검사가 한 `&&` 안에 들어가 sa[-1] 을 짚게 된다 (파일 머리말).
      { kind: 'var', name: 'moving', type: INT, init: lit(1) },
      {
        kind: 'while',
        cond: bin('&&', bin('>', v('j'), lit(0)), bin('==', v('moving'), lit(1))),
        body: [
          {
            kind: 'if',
            phase: 'compare-tails',
            cond: call('suffix_less', [v('text'), saAtJ, saAboveJ]),
            then: [
              { kind: 'swap', phase: 'place', a: saAtJ, b: saAboveJ },
              { kind: 'assign', target: v('j'), expr: bin('-', v('j'), lit(1)) },
            ],
            else: [{ kind: 'assign', target: v('moving'), expr: lit(0) }],
          },
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. 꼬리의 앞머리를 패턴과 견준다. 0 이면 패턴이 이 꼬리의 앞머리다.
// ─────────────────────────────────────────────────────────────────────────────

const prefixCmpBody: IRStmt[] = [
  { kind: 'var', name: 'i', type: INT, init: lit(0) },
  {
    kind: 'while',
    cond: bin('<', v('i'), len(v('pat'))),
    body: [
      // 꼬리가 패턴보다 짧으면 그 꼬리가 앞선다. 이 검사를 지나야 아래에서 짚는다.
      {
        kind: 'if',
        cond: bin('>=', bin('+', v('s'), v('i')), len(v('text'))),
        then: [{ kind: 'return', expr: lit(-1) }],
      },
      {
        kind: 'if',
        phase: 'compare-pattern',
        cond: bin('!=', charAt(v('s')), idx(v('pat'), v('i'))),
        then: [
          {
            kind: 'if',
            cond: bin('<', charAt(v('s')), idx(v('pat'), v('i'))),
            then: [{ kind: 'return', expr: lit(-1) }],
          },
          { kind: 'return', expr: lit(1) },
        ],
      },
      { kind: 'assign', target: v('i'), expr: bin('+', v('i'), lit(1)) },
    ],
  },
  { kind: 'return', expr: lit(0) },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. 이분 탐색으로 덩어리의 첫 자리를 찾고, 앞머리가 같은 동안 나아간다.
// ─────────────────────────────────────────────────────────────────────────────

const countMatchesBody: IRStmt[] = [
  { kind: 'var', name: 'lo', type: INT, init: lit(0) },
  { kind: 'var', name: 'hi', type: INT, init: len(v('sa')) },
  {
    kind: 'while',
    cond: bin('<', v('lo'), v('hi')),
    body: [
      {
        kind: 'var',
        phase: 'pick-mid',
        name: 'mid',
        type: INT,
        init: bin('//', bin('+', v('lo'), v('hi')), lit(2)),
      },
      {
        kind: 'if',
        phase: 'compare-pattern',
        cond: bin('<', call('prefix_cmp', [v('text'), idx(v('sa'), v('mid')), v('pat')]), lit(0)),
        // 가운데 꼬리가 패턴보다 앞선다 — 답은 오른쪽에만 있을 수 있다.
        then: [
          { kind: 'assign', phase: 'go-right', target: v('lo'), expr: bin('+', v('mid'), lit(1)) },
        ],
        // 앞서지 않는다 — 덩어리의 첫 자리가 여기이거나 왼쪽이다.
        else: [{ kind: 'assign', phase: 'go-left', target: v('hi'), expr: v('mid') }],
      },
    ],
  },
  { kind: 'var', phase: 'block-start', name: 'start', type: INT, init: v('lo') },
  { kind: 'var', name: 'k', type: INT, init: v('start') },
  // 아직 덩어리 안인가를 담아 두는 표. 경계 검사(k < len)와 내용 검사(앞머리가
  // 같은가)를 한 `&&` 에 넣으면 끝에서 sa[len] 을 짚는다 (파일 머리말).
  { kind: 'var', name: 'scanning', type: INT, init: lit(1) },
  {
    kind: 'while',
    cond: bin('&&', bin('<', v('k'), len(v('sa'))), bin('==', v('scanning'), lit(1))),
    body: [
      {
        kind: 'if',
        cond: bin('==', call('prefix_cmp', [v('text'), idx(v('sa'), v('k')), v('pat')]), lit(0)),
        then: [
          { kind: 'assign', phase: 'extend-block', target: v('k'), expr: bin('+', v('k'), lit(1)) },
        ],
        else: [{ kind: 'assign', target: v('scanning'), expr: lit(0) }],
      },
    ],
  },
  { kind: 'return', expr: bin('-', v('k'), v('start')) },
];

export const suffixArrayImperativeIR: IR = {
  id: 'suffix-array-imperative',
  algorithm: 'suffixArray',
  paradigm: 'imperative',
  functions: [
    {
      name: 'suffix_less',
      params: [
        { name: 'text', type: STR },
        { name: 'a', type: INT },
        { name: 'b', type: INT },
      ],
      returnType: BOOL,
      body: suffixLessBody,
    },
    {
      name: 'build_suffix_array',
      params: [
        { name: 'text', type: STR },
        { name: 'sa', type: INT_LIST },
      ],
      returnType: VOID,
      body: buildBody,
    },
    {
      name: 'prefix_cmp',
      params: [
        { name: 'text', type: STR },
        { name: 's', type: INT },
        { name: 'pat', type: STR },
      ],
      returnType: INT,
      body: prefixCmpBody,
    },
    {
      name: 'count_matches',
      params: [
        { name: 'text', type: STR },
        { name: 'sa', type: INT_LIST },
        { name: 'pat', type: STR },
      ],
      returnType: INT,
      body: countMatchesBody,
    },
  ],
};

export const suffixArrayIRs: IR[] = [suffixArrayImperativeIR];
