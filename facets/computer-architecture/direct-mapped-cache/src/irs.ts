/**
 * 직접 사상 캐시의 IR — `ir:direct-mapped-cache-imperative`.
 *
 * ── 왜 캐시 상태를 매개변수로 받는가
 *
 * 이 셈은 "각 자리에 어떤 태그가 앉아 있는가" 를 들고 있어야 한다. 그런데
 * **IR 함수는 배열을 만들 수 없다.** `IRExpr` 는 `lit|var|index|len|binop|unop|call`
 * 뿐이고 `IRStmt` 에도 배열을 짓는 문이 없다 — `kind: 'list'` 는 타입에만 있다.
 * 없는 것을 지어내는 이름(`zeros` 따위)을 예약 목록에 더하는 것도 막혀 있다
 * (`types/ir.ts` 의 `IR_MATH_BUILTINS` 주석).
 *
 * 두 갈래가 있었다. (가) IR 이 인덱스·태그·히트 판정만 맡고 전체 시늉은 화면이
 * 한다. (나) 상태 배열을 **매개변수로 받아** IR 이 끝까지 센다.
 *
 * **(나) 를 골랐다.** 이 화면의 주장은 "여덟 줄을 넘는 순간 미스율이 절벽처럼
 * 무너진다" 이고, 그 절벽은 낱낱의 히트 판정이 아니라 **세 바퀴를 다 돌고 난
 * 합계**에서만 보인다. (가) 로 자르면 코드 패널에 남는 것이 `% 줄수` 와
 * `// 줄수` 뿐이라, 정작 이 facet 이 말하려는 것을 코드가 말하지 못한다.
 * 상태 배열을 인자로 받는 것은 여섯 언어 어디서나 자연스러운 꼴이고
 * (`int[] slots` · `list[int]` · `std::vector<int>&`), 호출하는 쪽이 빈 캐시를
 * 건네는 것도 캐시를 비우는 일과 뜻이 맞는다.
 *
 * 빈 자리는 `-1` 로 표한다. `tagOf` 는 늘 0 이상이므로 `-1` 과 같아질 수 없다.
 *
 * ── 32비트 천장
 *
 * 이 facet 의 수는 작다. 배열 크기 상한이 16 · 바퀴 3 이므로 접근은 최대 48,
 * 미스도 최대 48 이다. 가장 큰 중간값은 `missRate` 의 `misses * 100` = **4800**
 * 이고, 32비트 정수의 천장(2^31-1 = 2,147,483,647) 에서 44 만 배 아래다.
 * 자바·C#·C++ 의 `int` 로 옮겨도 넘칠 길이 없다.
 *
 * **다만 그 근거가 사양에만 있으면 다음 사람이 배열 사다리를 늘릴 때 아무도
 * 막지 않는다.** 그래서 `test/direct-mapped-cache.test.ts` 가 여섯 손잡이 값
 * 전부에서 실제 중간값을 재어 천장 아래임을 잠근다. 사다리가 늘면 그 검사가
 * 먼저 깨진다.
 *
 * ── 나눗셈
 *
 * `double` → `int` 슬롯은 자바·C# 에서 컴파일되지 않는다 (S-transpiler). 그래서
 * 실수가 끼어들 자리를 아예 두지 않았다 — 나눗셈은 전부 **정수 나눗셈 `//`** 이고
 * 피연산자는 모두 0 이상이라 내림과 절단이 갈리지 않는다. 미스율도 실수 대신
 * **백분율 정수**로 센다: `(misses * 100 + accesses // 2) // accesses` 가 곧
 * 반올림이다.
 *
 * 예약 수학 이름(`exp`·`log`·`sqrt`·`abs`·`max`·`min`·`floor`)은 하나도 쓰지
 * 않는다. 비트 연산도 쓰지 않는다 — `IRBinOp` 에 없고, 여기 필요한 것은 `%` 와
 * `//` 로 충분하다 (줄 수가 2의 거듭제곱이라 비트로도 되지만, 그러면 자리 수가
 * 2의 거듭제곱일 때만 맞는 코드가 되어 오히려 덜 정직하다).
 *
 * ── 짧은 회로
 *
 * `ir-interpreter` 의 `&&` 는 오른쪽을 늘 셈한다. 그래서 조건을 잇지 않았다 —
 * 이 IR 에 `&&` 는 한 번도 나오지 않고, 갈림이 필요한 자리는 `if` 하나로 끝난다.
 *
 * ── 이름
 *
 * 여섯 언어의 예약어를 피한다 (S-transpiler). 특히 C# 의 `base`·`out`·`ref`·
 * `params`·`object`·`string`, 파이썬의 `pass`·`from`·`lambda`, 자바의 `final` 을
 * 피했다 — "한 바퀴" 를 `pass` 가 아니라 `sweep` 이라 부르는 까닭이다.
 *
 * ── phase 어휘 (algorithm.ts 와 집합이 정확히 같아야 한다 — C3)
 *
 *   index · probe · hit · miss · sweep · split · rate
 */

import type { IR, IRFunc, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: { kind: 'int' } };

/** 줄 번호에서 앉을 자리를 낸다 — `줄번호 % 자리수`. */
const slotOf: IRFunc = {
  name: 'slotOf',
  params: [
    { name: 'lineNo', type: INT },
    { name: 'slotCount', type: INT },
  ],
  returnType: INT,
  body: [
    {
      kind: 'return',
      expr: { kind: 'binop', op: '%', l: { kind: 'var', name: 'lineNo' }, r: { kind: 'var', name: 'slotCount' } },
      phase: 'index',
    },
  ],
};

/** 줄 번호에서 태그를 낸다 — `줄번호 // 자리수`. 같은 자리를 노리는 줄들을 가른다. */
const tagOf: IRFunc = {
  name: 'tagOf',
  params: [
    { name: 'lineNo', type: INT },
    { name: 'slotCount', type: INT },
  ],
  returnType: INT,
  body: [
    {
      kind: 'return',
      expr: { kind: 'binop', op: '//', l: { kind: 'var', name: 'lineNo' }, r: { kind: 'var', name: 'slotCount' } },
      phase: 'index',
    },
  ],
};

/**
 * 한 줄을 건드린다. 히트면 1, 미스면 0 을 돌려주고 미스면 그 자리를 빼앗는다.
 *
 * `slots` 는 자리마다 앉아 있는 태그. 빈 자리는 `-1`.
 */
const touch: IRFunc = {
  name: 'touch',
  params: [
    { name: 'slots', type: INT_LIST },
    { name: 'lineNo', type: INT },
    { name: 'slotCount', type: INT },
  ],
  returnType: INT,
  body: [
    {
      kind: 'var',
      name: 'slot',
      type: INT,
      init: {
        kind: 'call',
        fn: 'slotOf',
        args: [{ kind: 'var', name: 'lineNo' }, { kind: 'var', name: 'slotCount' }],
      },
      phase: 'index',
    },
    {
      kind: 'var',
      name: 'tag',
      type: INT,
      init: {
        kind: 'call',
        fn: 'tagOf',
        args: [{ kind: 'var', name: 'lineNo' }, { kind: 'var', name: 'slotCount' }],
      },
      phase: 'index',
    },
    {
      kind: 'var',
      name: 'seen',
      type: INT,
      init: { kind: 'index', arr: { kind: 'var', name: 'slots' }, idx: { kind: 'var', name: 'slot' } },
      phase: 'probe',
    },
    {
      kind: 'if',
      cond: { kind: 'binop', op: '==', l: { kind: 'var', name: 'seen' }, r: { kind: 'var', name: 'tag' } },
      then: [{ kind: 'return', expr: { kind: 'lit', value: 1 }, phase: 'hit' }],
      phase: 'probe',
    },
    {
      kind: 'assign',
      target: { kind: 'index', arr: { kind: 'var', name: 'slots' }, idx: { kind: 'var', name: 'slot' } },
      expr: { kind: 'var', name: 'tag' },
      phase: 'miss',
    },
    { kind: 'return', expr: { kind: 'lit', value: 0 }, phase: 'miss' },
  ],
};

/** 배열을 `sweeps` 바퀴 돌며 미스를 센다. */
const sweepAll: IRFunc = {
  name: 'sweepAll',
  params: [
    { name: 'slots', type: INT_LIST },
    { name: 'lineCount', type: INT },
    { name: 'slotCount', type: INT },
    { name: 'sweeps', type: INT },
  ],
  returnType: INT,
  body: [
    { kind: 'var', name: 'misses', type: INT, init: { kind: 'lit', value: 0 }, phase: 'sweep' },
    {
      kind: 'for-range',
      var: 'sweepNo',
      from: { kind: 'lit', value: 0 },
      to: { kind: 'var', name: 'sweeps' },
      inclusive: false,
      phase: 'sweep',
      body: [
        {
          kind: 'for-range',
          var: 'lineNo',
          from: { kind: 'lit', value: 0 },
          to: { kind: 'var', name: 'lineCount' },
          inclusive: false,
          phase: 'sweep',
          body: [
            {
              kind: 'var',
              name: 'ok',
              type: INT,
              init: {
                kind: 'call',
                fn: 'touch',
                args: [
                  { kind: 'var', name: 'slots' },
                  { kind: 'var', name: 'lineNo' },
                  { kind: 'var', name: 'slotCount' },
                ],
              },
              phase: 'probe',
            },
            {
              kind: 'if',
              cond: { kind: 'binop', op: '==', l: { kind: 'var', name: 'ok' }, r: { kind: 'lit', value: 0 } },
              then: [
                {
                  kind: 'assign',
                  target: { kind: 'var', name: 'misses' },
                  expr: { kind: 'binop', op: '+', l: { kind: 'var', name: 'misses' }, r: { kind: 'lit', value: 1 } },
                  phase: 'miss',
                },
              ],
              phase: 'miss',
            },
          ],
        },
      ],
    },
    { kind: 'return', expr: { kind: 'var', name: 'misses' }, phase: 'sweep' },
  ],
};

/**
 * 밀려서 난 미스.
 *
 * 첫 바퀴에 모든 줄을 한 번씩 건드리므로 "한 번은 올려야 하는" 미스는 정확히
 * 배열의 줄 수만큼이다. 나머지가 전부 밀려난 것이다.
 */
const conflictMisses: IRFunc = {
  name: 'conflictMisses',
  params: [
    { name: 'misses', type: INT },
    { name: 'lineCount', type: INT },
  ],
  returnType: INT,
  body: [
    {
      kind: 'return',
      expr: { kind: 'binop', op: '-', l: { kind: 'var', name: 'misses' }, r: { kind: 'var', name: 'lineCount' } },
      phase: 'split',
    },
  ],
};

/** 미스율을 백분율 정수로. `+ accesses // 2` 가 반올림이다. */
const missRate: IRFunc = {
  name: 'missRate',
  params: [
    { name: 'misses', type: INT },
    { name: 'accesses', type: INT },
  ],
  returnType: INT,
  body: [
    {
      kind: 'return',
      expr: {
        kind: 'binop',
        op: '//',
        l: {
          kind: 'binop',
          op: '+',
          l: { kind: 'binop', op: '*', l: { kind: 'var', name: 'misses' }, r: { kind: 'lit', value: 100 } },
          r: { kind: 'binop', op: '//', l: { kind: 'var', name: 'accesses' }, r: { kind: 'lit', value: 2 } },
        },
        r: { kind: 'var', name: 'accesses' },
      },
      phase: 'rate',
    },
  ],
};

/**
 * 함수 차례는 **부르기 전에 정의되도록** 놓는다. C++ 은 앞선 선언이 없으면
 * 컴파일되지 않고, transpiler 는 전방 선언을 내지 않는다.
 */
export const directMappedCacheImperativeIR: IR = {
  id: 'direct-mapped-cache-imperative',
  algorithm: 'directMappedCache',
  paradigm: 'imperative',
  functions: [slotOf, tagOf, touch, sweepAll, conflictMisses, missRate],
};

export const directMappedCacheIRs: IR[] = [directMappedCacheImperativeIR];
