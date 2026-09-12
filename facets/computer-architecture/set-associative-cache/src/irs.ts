/**
 * 집합 연관 캐시의 IR — 미스 세기.
 *
 * ── 캐시 상태를 매개변수로 받는 까닭
 *
 * IR 함수는 배열을 **만들 수 없다.** `IRExpr` 는 `lit|var|index|len|binop|unop|call`
 * 뿐이고 `IRStmt` 에도 배열을 짓는 문이 없다 (`kind: 'list'` 는 **타입**에만 있다).
 * 그러니 "빈 캐시를 하나 만들어 돌린다" 는 원리적으로 쓸 수 없다.
 *
 * 두 갈래가 있었다 — (가) IR 이 셈할 범위를 집합 수·집합 번호·태그와 한 집합
 * 안에서의 탐색·축출로 좁히고 접근열 순회는 IR 밖에 두는 것, (나) 상태 배열을
 * 매개변수로 받아 접근열까지 IR 이 도는 것. **(나)를 골랐다.** 이 완제품의 주장이
 * "연관도를 바꾸면 미스가 이렇게 달라진다" 이고, 그 수를 IR 이 내지 못하면 코드
 * 패널이 화면과 다른 말을 하게 된다. 상태 배열 둘(`tags` · `stamps`)을 부르는
 * 쪽이 마련해 넘기면 그 벽을 넘지 않고도 미스 수까지 IR 안에서 셈해진다.
 *
 * 빈 칸 표시도 그래서 밖에 있다. `tags` 는 -1 로 채워 넘기고 `stamps` 는 0 으로
 * 채워 넘긴다. 태그는 늘 0 이상이라 -1 과 같아질 일이 없고, 쓰인 시각은 1 부터
 * 오르므로 0 인 칸이 곧 "아직 아무도 안 앉은 칸" 이다. 그 덕에 `victimWay` 는
 * 빈 칸 검사를 따로 두지 않고 **가장 오래된 것** 하나만 고르면 된다 — 빈 칸의
 * 시각 0 이 언제나 최솟값이기 때문이다.
 *
 * ── 32비트 천장
 *
 * 이 IR 이 다루는 수는 전부 작다. 주소는 256 이하, 줄 번호는 16 이하, 태그는
 * 16 이하, 칸 번호 `first + w` 는 7 이하, 시각 `clock` 은 접근 횟수(15) 이하,
 * 미스 수도 15 이하다. 가장 큰 중간값은 `si * ways` = 7 이라 자바·C++·C# 의
 * `int` 에서도 여유가 넘친다. 곱이 커질 자리가 아예 없으므로 나머지 분배 같은
 * 접기도 필요 없다. 검사(`test/set-associative-cache.test.ts`)가 이 구조를
 * 잠근다 — IR 안의 모든 수 리터럴이 작은 범위 안에 있는지, 돌린 뒤 배열의 값이
 * 경계를 넘지 않는지 본다.
 *
 * ── 그 밖에 지킨 것
 *
 * - 나눗셈은 전부 정수 나눗셈 `//` 다. `/` 를 쓰면 파이썬에서 실수가 되어 색인이
 *   터지고, 여섯 언어의 답이 갈린다.
 * - `&&` 를 쓰지 않는다. `ir-interpreter` 의 `&&` 는 짧은 회로가 아니라 오른쪽이
 *   늘 셈해지므로, 집합 안을 훑으며 "자리가 있고 그 자리가 비었는가" 를 한 줄로
 *   묻는 순간 범위 밖 색인에서 터진다. 조건을 이을 자리는 `if` 중첩으로 푼다.
 * - `pow` 는 예약 이름에 없다. 쓰지 않는다. 쓰는 예약 이름은 `min` 하나다.
 * - 이름은 여섯 언어의 예약어를 피한다. 특히 `set` (C# 문맥 키워드) 과 `base` ·
 *   `out` (C# 예약어) 을 변수·함수 이름으로 쓰지 않았다 — 집합 번호는 `si`,
 *   묶음의 첫 칸은 `first` 다.
 *
 * ── phase 어휘 (C3 — algorithm.ts 의 phase payload 와 집합이 정확히 같다)
 *   'sets' | 'decode' | 'probe' | 'count' | 'evict' | 'fill' | 'touch' | 'done'
 */

import type { IR, IRBinOp, IRExpr, IRFunc, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

/** 묶음 안 `w` 번째 칸의 전체 칸 번호. */
const slotOf = (): IRExpr => bin('+', v('first'), v('w'));

/**
 * 접근열을 끝까지 돌며 미스를 센다 — entry point.
 *
 * `tags` 와 `stamps` 는 부르는 쪽이 마련한 칸 수 길이의 배열이다 (위 머리말).
 * 둘 다 제자리에서 갱신되므로, 돌고 나면 캐시의 마지막 모습도 함께 남는다.
 */
const countMisses: IRFunc = {
  name: 'countMisses',
  params: [
    { name: 'tags', type: INTS },
    { name: 'stamps', type: INTS },
    { name: 'addrs', type: INTS },
    { name: 'rounds', type: INT },
    { name: 'slots', type: INT },
    { name: 'ways', type: INT },
    { name: 'lineBytes', type: INT },
  ],
  returnType: INT,
  body: [
    {
      kind: 'var',
      name: 'sets',
      type: INT,
      init: call('setCount', v('slots'), v('ways')),
      phase: 'sets',
    },
    { kind: 'var', name: 'clock', type: INT, init: n(0), phase: 'sets' },
    { kind: 'var', name: 'misses', type: INT, init: n(0), phase: 'sets' },
    {
      kind: 'for-range',
      var: 'r',
      from: n(0),
      to: v('rounds'),
      inclusive: false,
      phase: 'decode',
      body: [
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: { kind: 'len', of: v('addrs') },
          inclusive: false,
          phase: 'decode',
          body: [
            {
              kind: 'assign',
              target: v('clock'),
              expr: bin('+', v('clock'), n(1)),
              phase: 'decode',
            },
            {
              kind: 'var',
              name: 'addr',
              type: INT,
              init: at(v('addrs'), v('i')),
              phase: 'decode',
            },
            {
              kind: 'var',
              name: 'si',
              type: INT,
              init: call('setIndexOf', v('addr'), v('lineBytes'), v('sets')),
              phase: 'decode',
            },
            {
              kind: 'var',
              name: 'tg',
              type: INT,
              init: call('tagOf', v('addr'), v('lineBytes'), v('sets')),
              phase: 'decode',
            },
            {
              kind: 'var',
              name: 'first',
              type: INT,
              init: bin('*', v('si'), v('ways')),
              phase: 'probe',
            },
            {
              kind: 'var',
              name: 'w',
              type: INT,
              init: call('findWay', v('tags'), v('first'), v('ways'), v('tg')),
              phase: 'probe',
            },
            {
              kind: 'if',
              cond: bin('<', v('w'), n(0)),
              phase: 'count',
              then: [
                {
                  kind: 'assign',
                  target: v('misses'),
                  expr: bin('+', v('misses'), n(1)),
                  phase: 'count',
                },
                {
                  kind: 'assign',
                  target: v('w'),
                  expr: call('victimWay', v('stamps'), v('first'), v('ways')),
                  phase: 'evict',
                },
                {
                  kind: 'assign',
                  target: at(v('tags'), slotOf()),
                  expr: v('tg'),
                  phase: 'fill',
                },
              ],
            },
            {
              kind: 'assign',
              target: at(v('stamps'), slotOf()),
              expr: v('clock'),
              phase: 'touch',
            },
          ],
        },
      ],
    },
    { kind: 'return', expr: v('misses'), phase: 'done' },
  ],
};

/** 칸 수와 연관도에서 집합 수를 낸다. 칸이 늘지 않으므로 묶음이 넓어지면 집합이 준다. */
const setCount: IRFunc = {
  name: 'setCount',
  params: [
    { name: 'slots', type: INT },
    { name: 'ways', type: INT },
  ],
  returnType: INT,
  body: [{ kind: 'return', expr: bin('//', v('slots'), v('ways')), phase: 'sets' }],
};

/** 주소가 속한 줄 번호. 한 줄이 `lineBytes` 바이트를 덮는다. */
const lineOf: IRFunc = {
  name: 'lineOf',
  params: [
    { name: 'addr', type: INT },
    { name: 'lineBytes', type: INT },
  ],
  returnType: INT,
  body: [{ kind: 'return', expr: bin('//', v('addr'), v('lineBytes')), phase: 'decode' }],
};

/** 줄 번호를 집합 수로 나눈 나머지 — 이 줄이 앉을 묶음. */
const setIndexOf: IRFunc = {
  name: 'setIndexOf',
  params: [
    { name: 'addr', type: INT },
    { name: 'lineBytes', type: INT },
    { name: 'sets', type: INT },
  ],
  returnType: INT,
  body: [
    {
      kind: 'return',
      expr: bin('%', call('lineOf', v('addr'), v('lineBytes')), v('sets')),
      phase: 'decode',
    },
  ],
};

/** 집합 번호로 가려지지 않는 윗부분 — 같은 묶음 안에서 줄을 가르는 이름표. */
const tagOf: IRFunc = {
  name: 'tagOf',
  params: [
    { name: 'addr', type: INT },
    { name: 'lineBytes', type: INT },
    { name: 'sets', type: INT },
  ],
  returnType: INT,
  body: [
    {
      kind: 'return',
      expr: bin('//', call('lineOf', v('addr'), v('lineBytes')), v('sets')),
      phase: 'decode',
    },
  ],
};

/**
 * 한 묶음 안을 처음부터 끝까지 훑어 태그를 찾는다. 없으면 -1.
 *
 * 연관도를 올려 얻는 것의 값이 여기 있고 치르는 값도 여기 있다 — 이 루프가
 * 도는 횟수가 곧 `ways` 다.
 */
const findWay: IRFunc = {
  name: 'findWay',
  params: [
    { name: 'tags', type: INTS },
    { name: 'first', type: INT },
    { name: 'ways', type: INT },
    { name: 'tag', type: INT },
  ],
  returnType: INT,
  body: [
    {
      kind: 'for-range',
      var: 'w',
      from: n(0),
      to: v('ways'),
      inclusive: false,
      phase: 'probe',
      body: [
        {
          kind: 'if',
          cond: bin('==', at(v('tags'), slotOf()), v('tag')),
          phase: 'probe',
          then: [{ kind: 'return', expr: v('w'), phase: 'probe' }],
        },
      ],
    },
    { kind: 'return', expr: n(-1), phase: 'probe' },
  ],
};

/**
 * 밀어낼 칸 — 가장 오래 안 쓰인 것 (LRU).
 *
 * 빈 칸은 시각이 0 이라 언제나 최솟값이다. 그래서 "빈 자리가 있는가" 를 따로
 * 묻지 않아도 빈 자리가 먼저 골라진다. 예약 이름 `min` 으로 가장 오래된 시각을
 * 먼저 구하고, 그 시각을 가진 첫 칸을 돌려준다.
 */
const victimWay: IRFunc = {
  name: 'victimWay',
  params: [
    { name: 'stamps', type: INTS },
    { name: 'first', type: INT },
    { name: 'ways', type: INT },
  ],
  returnType: INT,
  body: [
    { kind: 'var', name: 'oldest', type: INT, init: at(v('stamps'), v('first')), phase: 'evict' },
    {
      kind: 'for-range',
      var: 'w',
      from: n(1),
      to: v('ways'),
      inclusive: false,
      phase: 'evict',
      body: [
        {
          kind: 'assign',
          target: v('oldest'),
          expr: call('min', v('oldest'), at(v('stamps'), slotOf())),
          phase: 'evict',
        },
      ],
    },
    {
      kind: 'for-range',
      var: 'w',
      from: n(0),
      to: v('ways'),
      inclusive: false,
      phase: 'evict',
      body: [
        {
          kind: 'if',
          cond: bin('==', at(v('stamps'), slotOf()), v('oldest')),
          phase: 'evict',
          then: [{ kind: 'return', expr: v('w'), phase: 'evict' }],
        },
      ],
    },
    { kind: 'return', expr: n(0), phase: 'evict' },
  ],
};

export const setAssociativeCacheImperativeIR: IR = {
  id: 'set-associative-cache-imperative',
  algorithm: 'setAssociativeCache',
  paradigm: 'imperative',
  functions: [countMisses, setCount, lineOf, setIndexOf, tagOf, findWay, victimWay],
};

export const setAssociativeCacheIRs: IR[] = [setAssociativeCacheImperativeIR];

/** 이 IR 이 쓰는 phase 어휘. algorithm.ts 와 검사가 함께 본다 (C3). */
export const SET_ASSOCIATIVE_CACHE_PHASES: readonly string[] = [
  'sets',
  'decode',
  'probe',
  'count',
  'evict',
  'fill',
  'touch',
  'done',
];

/** IR 안의 문 하나를 훑는 방문자 — 검사가 32비트 천장 근거를 잠글 때 쓴다. */
export function walkIRStatements(stmts: IRStmt[], visit: (s: IRStmt) => void): void {
  for (const s of stmts) {
    visit(s);
    if (s.kind === 'if') {
      walkIRStatements(s.then, visit);
      if (s.else) walkIRStatements(s.else, visit);
    } else if (s.kind === 'for-range' || s.kind === 'while') {
      walkIRStatements(s.body, visit);
    }
  }
}
