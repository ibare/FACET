/**
 * rabin-karp 의 IR — 무게 · 창 해시 · 굴리며 훑기.
 *
 * 핵심 셈이 배열·반복·조건으로 온전히 펴진다. 이름 붙인 호출은 `window_hash`
 * 하나뿐이고, 그것은 감추는 것이 아니라 **드러내는** 것이다 — 처음부터 셈하는
 * 길과 굴려서 얻는 길이 같은 값에 이른다는 것이 이 알고리즘의 전부라, 그 "처음
 * 부터" 를 한 자리에 두어야 굴리기와 나란히 읽힌다.
 *
 * ── IR 의 벽을 어떻게 지났는가
 *
 * **`pow` 가 없다.** 예약 수학 이름은 `exp`·`log`·`sqrt`·`abs`·`max`·`min`·
 * `floor` 일곱뿐이고, 그 목록은 "어느 언어에나 있고 이름만 다른" 것만 받는다.
 * 그래서 `radix^(m-1)` 을 **루프로 센다.** 없는 이름을 지어내는 대신 셈을
 * 보이는 쪽이 코드 패널의 몫에도 맞는다.
 *
 * **비트 연산이 없다.** `IRBinOp` 는 `+ - * / // %` · 비교 · `&& ||` 뿐이다.
 * 다행히 이 알고리즘에는 마스크가 필요 없다 — 음수가 나는 자리는 구르기의
 * 뺄셈 하나이고, 그것은 `((x % mod) + mod) % mod` 로 받는다. 이 꼴은 여섯
 * 언어에서 같은 값을 낸다: 파이썬의 `%` 는 이미 비음수라 `+mod` 뒤의 `% mod`
 * 가 되돌리고, 나머지 다섯은 음수 나머지를 `+mod` 가 끌어올린다.
 *
 * **중간값이 32비트를 넘지 않는다.** 여섯 언어 중 셋은 정수 폭이 유한하다.
 * 가장 큰 중간값이 `h * radix` 이고 `h < mod = 1000003`, `radix = 31` 이므로
 * 3.1×10⁷ 이다. `drop` 도 `val * weight ≤ 26 × 10⁶` 로 같은 자리수다. 둘 다
 * 2³¹−1 에 한참 못 미친다 — 그래서 `% 2147483648` 같은 **설명 없는 매직 넘버가
 * 코드 패널에 뜰 일이 없다.** 읽는 사람이 알고리즘 대신 우회를 보게 되는 그
 * 자리를, 법을 작게 잡는 것으로 애초에 없앴다.
 *
 * ── 왜 첫 등장에서 멈추지 않는가
 *
 * `rabin_karp` 는 등장 **횟수**를 돌려준다. 첫 등장에서 돌아가면 만지는 글자가
 * 등장 자리에 좌우되어 이 facet 의 주장(2n 고정)이 성립하지 않는다. 글 전체를
 * 훑는 값을 재는 것이 물음이므로 끝까지 간다. algorithm.ts 도 같다.
 *
 * ── 식별자 (여섯 언어 어디서도 예약어가 아니다)
 *
 * `base` 를 쓰지 않는다 — **C# 예약어**이고 transpiler 는 rename 하지 않는다
 * (S-transpiler). 그래서 밑은 `radix` 다. 같은 까닭으로 `out` 대신 `drop` 을
 * 쓰고, 파이썬 예약어 `from` 대신 `at` 을 쓴다.
 *
 * phase 어휘는 algorithm.ts 의 `emit('phase', …)` 와 집합이 완전히 일치한다 (C3):
 *
 *   'weight' | 'scan' | 'compare' | 'verify' | 'roll' | 'found'
 */

import type { IR, IRBinOp, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const BOOL: IRType = { kind: 'bool' };
const INT_LIST: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const num = (value: number): IRExpr => ({ kind: 'lit', value });
const yes = (value: boolean): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });

/** `x mod mod` — 이 IR 에서 가장 자주 나오는 꼴이라 한 번만 적는다. */
const wrap = (x: IRExpr): IRExpr => bin('%', x, v('mod'));

/**
 * window_hash(s, at, m, radix, mod) — 창 하나를 **처음부터** 셈한다.
 *
 * 찾는 조각과 첫 창에만 쓴다. 굴리기가 덜어 내려는 것이 바로 이 루프다.
 */
const windowHashBody: IRStmt[] = [
  { kind: 'var', name: 'h', type: INT, init: num(0), phase: 'scan' },
  {
    kind: 'for-range',
    var: 'i',
    from: num(0),
    to: v('m'),
    inclusive: false,
    phase: 'scan',
    body: [
      {
        kind: 'assign',
        target: v('h'),
        expr: wrap(bin('+', bin('*', v('h'), v('radix')), idx(v('s'), bin('+', v('at'), v('i'))))),
        phase: 'scan',
      },
    ],
  },
  { kind: 'return', expr: v('h'), phase: 'scan' },
];

/** 확인 — 해시가 같아도 글자를 견준다. 여기가 거짓 양성을 거르는 자리다. */
const verifyBlock: IRStmt[] = [
  { kind: 'var', name: 'same', type: BOOL, init: yes(true), phase: 'verify' },
  {
    kind: 'for-range',
    var: 'j',
    from: num(0),
    to: v('m'),
    inclusive: false,
    phase: 'verify',
    body: [
      {
        kind: 'if',
        phase: 'verify',
        cond: bin(
          '!=',
          idx(v('text'), bin('+', v('start'), v('j'))),
          idx(v('pattern'), v('j')),
        ),
        then: [
          { kind: 'assign', target: v('same'), expr: yes(false), phase: 'verify' },
          { kind: 'break', phase: 'verify' },
        ],
      },
    ],
  },
  {
    kind: 'if',
    cond: v('same'),
    phase: 'found',
    then: [
      { kind: 'assign', target: v('hits'), expr: bin('+', v('hits'), num(1)), phase: 'found' },
    ],
  },
];

/** 구르기 — 앞을 빼고 뒤를 더한다. 만지는 글자는 둘뿐이다. */
const rollBlock: IRStmt[] = [
  {
    kind: 'var',
    name: 'drop',
    type: INT,
    init: wrap(bin('*', idx(v('text'), v('start')), v('weight'))),
    phase: 'roll',
  },
  {
    kind: 'assign',
    target: v('h'),
    expr: wrap(bin('+', wrap(bin('-', v('h'), v('drop'))), v('mod'))),
    phase: 'roll',
  },
  {
    kind: 'assign',
    target: v('h'),
    expr: wrap(
      bin('+', bin('*', v('h'), v('radix')), idx(v('text'), bin('+', v('start'), v('m')))),
    ),
    phase: 'roll',
  },
];

const searchBody: IRStmt[] = [
  { kind: 'var', name: 'n', type: INT, init: len(v('text')) },
  { kind: 'var', name: 'm', type: INT, init: len(v('pattern')) },

  // 무게 — radix^(m-1) mod mod. pow 가 없으므로 곱해 나간다.
  { kind: 'var', name: 'weight', type: INT, init: num(1), phase: 'weight' },
  {
    kind: 'for-range',
    var: 'i',
    from: num(0),
    to: bin('-', v('m'), num(1)),
    inclusive: false,
    phase: 'weight',
    body: [
      {
        kind: 'assign',
        target: v('weight'),
        expr: wrap(bin('*', v('weight'), v('radix'))),
        phase: 'weight',
      },
    ],
  },

  // 처음부터 셈하는 것은 딱 두 번이다 — 찾는 조각과 첫 창.
  {
    kind: 'var',
    name: 'target',
    type: INT,
    phase: 'scan',
    init: {
      kind: 'call',
      fn: 'window_hash',
      args: [v('pattern'), num(0), v('m'), v('radix'), v('mod')],
    },
  },
  {
    kind: 'var',
    name: 'h',
    type: INT,
    phase: 'scan',
    init: {
      kind: 'call',
      fn: 'window_hash',
      args: [v('text'), num(0), v('m'), v('radix'), v('mod')],
    },
  },

  { kind: 'var', name: 'hits', type: INT, init: num(0) },
  { kind: 'var', name: 'start', type: INT, init: num(0) },
  {
    kind: 'while',
    cond: bin('<=', bin('+', v('start'), v('m')), v('n')),
    body: [
      { kind: 'if', cond: bin('==', v('h'), v('target')), phase: 'compare', then: verifyBlock },
      {
        kind: 'if',
        cond: bin('<', bin('+', v('start'), v('m')), v('n')),
        phase: 'roll',
        then: rollBlock,
      },
      { kind: 'assign', target: v('start'), expr: bin('+', v('start'), num(1)) },
    ],
  },
  { kind: 'return', expr: v('hits') },
];

export const rabinKarpImperativeIR: IR = {
  id: 'rabin-karp-imperative',
  algorithm: 'rabinKarp',
  paradigm: 'imperative',
  functions: [
    {
      name: 'window_hash',
      params: [
        { name: 's', type: INT_LIST },
        { name: 'at', type: INT },
        { name: 'm', type: INT },
        { name: 'radix', type: INT },
        { name: 'mod', type: INT },
      ],
      returnType: INT,
      body: windowHashBody,
    },
    {
      name: 'rabin_karp',
      params: [
        { name: 'text', type: INT_LIST },
        { name: 'pattern', type: INT_LIST },
        { name: 'radix', type: INT },
        { name: 'mod', type: INT },
      ],
      returnType: INT,
      body: searchBody,
    },
  ],
};

export const rabinKarpIRs: IR[] = [rabinKarpImperativeIR];
