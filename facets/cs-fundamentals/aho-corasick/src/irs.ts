/**
 * aho-corasick 의 IR — 나무 짓기 · 링크 잇기 · 한 번 훑기.
 *
 * ── 왜 트라이를 배열로 펴는가
 *
 * IR 의 어휘는 배열 · 반복 · 조건 · 대입 · 함수뿐이다. 맵도 큐도 집합도 없다.
 * 그래서 트라이를 `노드 × 알파벳` 2차원 배열 하나로 펴고, 2차원이 없으므로
 * `next[node * alpha + c]` 로 한 줄에 눕힌다.
 *
 * 없어서 그런 것만은 아니다. 펴면 **실패 링크가 배열 색인으로 드러난다** —
 * `fail[v]` 는 "어느 마디로 건너뛰는가" 를 가리키는 수 하나이고, 코드 패널에서
 * 그것이 `next` 와 똑같은 모양의 배열 접근으로 보인다. 자료구조를 이름 붙인
 * 호출 뒤로 감췄다면 `trie.fail(node)` 한 줄이 되어 아무것도 보이지 않았을 것이다.
 *
 * ── 왜 알파벳을 좁게 잡는가
 *
 * 열 하나가 글자 하나다. 유니코드 전체를 잡으면 `next` 가 마디마다 수십만 칸이
 * 되고, 코드 패널은 알고리즘 대신 빈 칸 셈을 보이게 된다. 글과 패턴에 쓰인
 * 글자만 모아 번호를 매기면 이 화면에서 열은 다섯이다.
 *
 * ── 너비 우선인데 큐가 없다
 *
 * 실패 링크는 얕은 마디부터 정해야 한다 — 깊은 마디의 링크는 그 부모의 링크를
 * 타고 올라가 찾기 때문이다. 그 차례가 곧 너비 우선이고, 보통은 큐를 쓴다.
 * **IR 에 큐가 없으므로 배열 하나(`order`)와 머리·꼬리 색인 둘로 편다.**
 * 펴 놓고 보면 필요했던 것은 자료구조가 아니라 **차례**였음이 드러난다 —
 * `order` 는 마디를 담는 그릇일 뿐이고 `head`/`tail` 이 차례를 진다.
 *
 * 접미사 조회로 정의 그대로 셈하는 길(조각 `fail-link` 가 고른 쪽)도 있었으나
 * 여기서는 택하지 않았다. 그쪽은 글자열을 잘라 견주는 셈이라 문자열 연산이
 * 필요하고, 이 IR 은 글도 패턴도 **글자 번호의 배열**로 받기 때문이다.
 *
 * ── 32비트
 *
 * 가장 큰 중간값은 `node * alpha + c` 다. 이 화면에서 마디는 열여섯, 알파벳은
 * 다섯이라 80 을 넘지 않는다. 여섯 언어 어디서도 넘치지 않는다.
 *
 * ── `&&` 는 짧은 회로가 아니다 (인터프리터 한정)
 *
 * `ir-interpreter` 의 `binop` 은 `&&` 여도 **양쪽을 먼저 셈한다**. 그러니
 * `a != 0 && next[a * alpha + c] == -1` 꼴에서 왼쪽이 거짓일 때도 오른쪽 색인이
 * 실제로 읽힌다. 여섯 언어의 `&&` 는 짧은 회로라, 오른쪽이 범위 밖이면
 * **인터프리터에서만 다른 답이 나온다.**
 *
 * 여기 두 루프(`link_fails` 의 f 올라가기 · `scan_text` 의 미끄러지기)가 정확히
 * 그 모양인데 안전하다. 막는 값이 **0(뿌리)** 이기 때문이다 — 왼쪽이 거짓이면
 * 색인은 `next[0 * alpha + c]` 이고 그것은 뿌리의 줄이라 언제나 범위 안이다.
 *
 * **막는 값을 -1 같은 없음 표시로 바꾸면 이 성질이 깨진다** (`next[-alpha + c]`).
 * 가드를 고치려거든 오른쪽 색인이 그때도 범위 안인지 먼저 따져라. 범위 밖이
 * 나올 수밖에 없으면 `if` 를 포개어 갈라야 한다.
 *
 * ── 이름
 *
 * `goto` 는 C++ · C# · Java 의 예약어라 쓰지 않는다 (transpiler 는 이름을 고쳐
 * 주지 않는다 — S-transpiler). `out` · `base` · `ref` · `params` 도 마찬가지다.
 * 그래서 전이표는 `next`, 끝나는 패턴은 `ends`, 찾은 자리는 `spots` 다.
 *
 * phase 어휘는 algorithm.ts 와 집합이 완전히 일치한다 (C3):
 *   'extend' | 'link' | 'read' | 'slide' | 'hit'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const VOID: IRType = { kind: 'void' };
const INTS: IRType = { kind: 'list', of: { kind: 'int' } };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '-' | '*' | '==' | '!=' | '<' | '&&' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op: o,
  l,
  r,
});

/** 길이 없다는 표시. algorithm.ts 와 같은 값이다. */
const NONE = lit(-1);

/** `next[node * alpha + c]` — 편 2차원 배열의 한 칸. */
const cell = (node: IRExpr, c: IRExpr): IRExpr =>
  at('next', op('+', op('*', node, v('alpha')), c));

// ─────────────────────────────────────────────────────────────────────────────
// 1. 나무 짓기 — 같은 앞머리는 같은 마디가 된다
// ─────────────────────────────────────────────────────────────────────────────

const buildBody: IRStmt[] = [
  { kind: 'var', name: 'nodes', type: INT, init: lit(1), phase: 'extend' },
  {
    kind: 'for-range',
    var: 'p',
    from: lit(0),
    to: v('count'),
    inclusive: false,
    body: [
      { kind: 'var', name: 'cur', type: INT, init: lit(0) },
      {
        kind: 'for-range',
        var: 'j',
        from: lit(0),
        to: at('span', v('p')),
        inclusive: false,
        body: [
          {
            kind: 'var',
            name: 'c',
            type: INT,
            init: at('syms', op('+', at('start', v('p')), v('j'))),
          },
          { kind: 'var', name: 'nxt', type: INT, init: cell(v('cur'), v('c')) },
          {
            kind: 'if',
            cond: op('==', v('nxt'), NONE),
            then: [
              {
                kind: 'assign',
                target: cell(v('cur'), v('c')),
                expr: v('nodes'),
                phase: 'extend',
              },
              { kind: 'assign', target: v('cur'), expr: v('nodes') },
              { kind: 'assign', target: v('nodes'), expr: op('+', v('nodes'), lit(1)) },
            ],
            else: [{ kind: 'assign', target: v('cur'), expr: v('nxt') }],
          },
        ],
      },
      { kind: 'assign', target: at('ends', v('cur')), expr: v('p') },
    ],
  },
  { kind: 'return', expr: v('nodes') },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. 링크 잇기 — 어긋나면 어디로 건너뛰는가
// ─────────────────────────────────────────────────────────────────────────────

const linkBody: IRStmt[] = [
  { kind: 'var', name: 'head', type: INT, init: lit(0) },
  { kind: 'var', name: 'tail', type: INT, init: lit(0) },
  // 뿌리의 자식들은 물러날 곳이 뿌리뿐이다. 여기서 차례가 시작된다.
  {
    kind: 'for-range',
    var: 'c',
    from: lit(0),
    to: v('alpha'),
    inclusive: false,
    body: [
      { kind: 'var', name: 'child', type: INT, init: cell(lit(0), v('c')) },
      {
        kind: 'if',
        cond: op('!=', v('child'), NONE),
        then: [
          { kind: 'assign', target: at('fail', v('child')), expr: lit(0) },
          { kind: 'assign', target: at('order', v('tail')), expr: v('child') },
          { kind: 'assign', target: v('tail'), expr: op('+', v('tail'), lit(1)) },
        ],
      },
    ],
  },
  {
    kind: 'while',
    cond: op('<', v('head'), v('tail')),
    phase: 'link',
    body: [
      { kind: 'var', name: 'u', type: INT, init: at('order', v('head')) },
      { kind: 'assign', target: v('head'), expr: op('+', v('head'), lit(1)) },
      {
        kind: 'for-range',
        var: 'c',
        from: lit(0),
        to: v('alpha'),
        inclusive: false,
        body: [
          { kind: 'var', name: 'child', type: INT, init: cell(v('u'), v('c')) },
          {
            kind: 'if',
            cond: op('!=', v('child'), NONE),
            then: [
              { kind: 'var', name: 'f', type: INT, init: at('fail', v('u')) },
              // 부모가 물러날 곳에서 같은 글자를 찾아 올라간다.
              {
                kind: 'while',
                cond: op('&&', op('!=', v('f'), lit(0)), op('==', cell(v('f'), v('c')), NONE)),
                body: [{ kind: 'assign', target: v('f'), expr: at('fail', v('f')) }],
              },
              { kind: 'var', name: 'w', type: INT, init: cell(v('f'), v('c')) },
              {
                kind: 'if',
                cond: op('||', op('==', v('w'), NONE), op('==', v('w'), v('child'))),
                then: [{ kind: 'assign', target: at('fail', v('child')), expr: lit(0) }],
                else: [
                  { kind: 'assign', target: at('fail', v('child')), expr: v('w'), phase: 'link' },
                ],
              },
              { kind: 'assign', target: at('order', v('tail')), expr: v('child') },
              { kind: 'assign', target: v('tail'), expr: op('+', v('tail'), lit(1)) },
            ],
          },
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. 한 번 훑기 — 읽는 자리는 왼쪽으로 가지 않는다
// ─────────────────────────────────────────────────────────────────────────────

const scanBody: IRStmt[] = [
  { kind: 'var', name: 'cur', type: INT, init: lit(0) },
  { kind: 'var', name: 'found', type: INT, init: lit(0) },
  {
    kind: 'for-range',
    var: 'i',
    from: lit(0),
    to: { kind: 'len', of: v('text') },
    inclusive: false,
    body: [
      { kind: 'var', name: 'c', type: INT, init: at('text', v('i')), phase: 'read' },
      // 이을 길이 없으면 링크를 타고 물러난다. `i` 는 그대로다 — 여기가 한 번
      // 훑기의 전부다.
      {
        kind: 'while',
        cond: op('&&', op('!=', v('cur'), lit(0)), op('==', cell(v('cur'), v('c')), NONE)),
        body: [{ kind: 'assign', target: v('cur'), expr: at('fail', v('cur')), phase: 'slide' }],
      },
      { kind: 'var', name: 'nxt', type: INT, init: cell(v('cur'), v('c')) },
      {
        kind: 'if',
        cond: op('==', v('nxt'), NONE),
        then: [{ kind: 'assign', target: v('cur'), expr: lit(0) }],
        else: [{ kind: 'assign', target: v('cur'), expr: v('nxt') }],
        phase: 'read',
      },
      // 한 마디가 여러 패턴의 끝일 수 있다. 링크를 따라 올라가며 다 거둔다.
      { kind: 'var', name: 'u', type: INT, init: v('cur') },
      {
        kind: 'while',
        cond: op('!=', v('u'), lit(0)),
        body: [
          {
            kind: 'if',
            cond: op('!=', at('ends', v('u')), NONE),
            then: [
              { kind: 'assign', target: at('hits', v('found')), expr: at('ends', v('u')), phase: 'hit' },
              { kind: 'assign', target: at('spots', v('found')), expr: v('i') },
              { kind: 'assign', target: v('found'), expr: op('+', v('found'), lit(1)) },
            ],
          },
          { kind: 'assign', target: v('u'), expr: at('fail', v('u')) },
        ],
      },
    ],
  },
  { kind: 'return', expr: v('found') },
];

export const ahoCorasickImperativeIR: IR = {
  id: 'aho-corasick-imperative',
  algorithm: 'ahoCorasick',
  paradigm: 'imperative',
  functions: [
    {
      name: 'build_trie',
      params: [
        { name: 'next', type: INTS },
        { name: 'ends', type: INTS },
        { name: 'syms', type: INTS },
        { name: 'start', type: INTS },
        { name: 'span', type: INTS },
        { name: 'alpha', type: INT },
        { name: 'count', type: INT },
      ],
      returnType: INT,
      body: buildBody,
    },
    {
      name: 'link_fails',
      params: [
        { name: 'next', type: INTS },
        { name: 'fail', type: INTS },
        { name: 'order', type: INTS },
        { name: 'alpha', type: INT },
      ],
      returnType: VOID,
      body: linkBody,
    },
    {
      name: 'scan_text',
      params: [
        { name: 'next', type: INTS },
        { name: 'fail', type: INTS },
        { name: 'ends', type: INTS },
        { name: 'text', type: INTS },
        { name: 'alpha', type: INT },
        { name: 'hits', type: INTS },
        { name: 'spots', type: INTS },
      ],
      returnType: INT,
      body: scanBody,
    },
  ],
};

export const ahoCorasickIRs: IR[] = [ahoCorasickImperativeIR];
