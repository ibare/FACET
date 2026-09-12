/**
 * cache-replacement 의 IR — 무엇을 버릴지 고르는 일을 코드로 보인다.
 *
 * ── 왜 캐시 상태를 매개변수로 받는가
 *
 * 칸마다의 줄 번호와 두 시각은 배열로 들고 있어야 하는데, **IR 은 배열을 만들
 * 수 없다.** `IRExpr` 는 `lit|var|index|len|binop|unop|call` 뿐이고 `IRStmt` 에도
 * 배열을 짓는 문이 없다 (`kind: 'list'` 는 타입에만 있다). 예약 수학 이름에
 * `zeros` 류를 더하는 길은 `IR_MATH_BUILTINS` 의 주석이 막아 두었다 — 어느
 * 언어에도 그 이름이 없어 표기를 옮기는 일이 아니라 없는 것을 지어내는 일이
 * 되기 때문이다.
 *
 * 그래서 **상태 배열을 매개변수로 받는** 쪽을 골랐다. `countMisses` 는 접근열
 * `lines` 와 함께 빈 캐시(`tag` 는 -1 로, `used` · `loaded` 는 0 으로 채워진
 * 길이 4 짜리 배열 셋)를 받아 그 자리에서 고쳐 쓴다. IR 이 셈할 범위를 좁히는
 * 쪽 — 이를테면 한 번의 축출만 셈하게 하는 것 — 도 있었으나, 그러면 **미스 수가
 * 코드에서 사라진다.** 이 화면의 주장은 "정책만 바꿨는데 미스가 5·6·7 로 갈린다"
 * 이고 그 수를 내는 것이 곧 이 코드가 할 말이다.
 *
 * ── 32비트 천장
 *
 * 이 IR 의 수는 전부 작다. 자리 번호는 칸 수(4) 미만, 시각은 접근열 길이(11)
 * 미만, 미스 수는 접근열 길이 이하다. 곱셈도 누승도 없고 가장 큰 값이
 * `misses + 1` 이라 int 로 넘칠 길이 없다. **그 근거는 접근열 길이와 칸 수가
 * 작다는 것 하나에 걸려 있으므로**, `test/cache-replacement.test.ts` 가
 * `initialData` 의 그 두 수를 직접 재어 구조를 잠근다.
 *
 * ── 어휘를 피해 간 자리
 *
 * - `&&` 를 쓰지 않는다. `ir-interpreter` 의 `&&` 는 짧은 회로가 아니라 오른쪽이
 *   늘 셈해진다. "빈 칸이 있는가" 와 "그 칸의 시각이 더 작은가" 를 한 조건으로
 *   이으면 범위 밖 색인에서 터지므로, 그 자리마다 `if` 를 중첩했다.
 * - 나눗셈이 없어 `//` 도 `double` 도 닿지 않는다. 모든 슬롯이 int 다.
 * - 이름은 여섯 언어의 예약어를 피했다 (`tag` · `used` · `loaded` · `lines` ·
 *   `line` · `misses` · `victim` · `best` · `cur` · `slot` · `useLoad` ·
 *   `pickMax`). C# 의 `base` · `out` · `object`, 파이썬의 `pass` · `from`,
 *   자바의 `final` 은 하나도 쓰지 않았다.
 *
 * ── 두 축이 코드에서 보인다
 *
 * 세 정책을 세 함수로 쓰지 않았다. `clockOf` 가 **어느 시각을 읽을지**(`useLoad`)
 * 를, `chooseVictim` 이 **가장 작은 것을 고를지 큰 것을 고를지**(`pickMax`) 를
 * 인자로 받는다. 그 둘을 갈아 끼우는 것이 곧 정책을 갈아 끼우는 것이다.
 *
 *   lru   useLoad 0, pickMax 0
 *   mru   useLoad 0, pickMax 1
 *   fifo  useLoad 1, pickMax 0
 *
 * phase 어휘는 `algorithm.ts` 와 집합이 정확히 같다 (C3):
 *   'probe' | 'hit' | 'choose-victim' | 'install' | 'done'
 */

import type { IR, IRBinOp, IRExpr, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, i: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx: i });
const len = (name: string): IRExpr => ({ kind: 'len', of: v(name) });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

export const cacheReplacementImperativeIR: IR = {
  id: 'cache-replacement-imperative',
  algorithm: 'cacheReplacement',
  paradigm: 'imperative',
  functions: [
    {
      // entry point. 접근열을 돌며 미스를 센다.
      name: 'countMisses',
      params: [
        { name: 'lines', type: INTS },
        { name: 'tag', type: INTS },
        { name: 'used', type: INTS },
        { name: 'loaded', type: INTS },
        { name: 'useLoad', type: INT },
        { name: 'pickMax', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'misses', type: INT, init: lit(0), phase: 'probe' },
        {
          kind: 'for-range',
          var: 't',
          from: lit(0),
          to: len('lines'),
          inclusive: false,
          phase: 'probe',
          body: [
            { kind: 'var', name: 'line', type: INT, init: at('lines', v('t')), phase: 'probe' },
            {
              kind: 'var',
              name: 'slot',
              type: INT,
              init: call('findSlot', [v('tag'), v('line')]),
              phase: 'probe',
            },
            {
              kind: 'if',
              cond: bin('<', v('slot'), lit(0)),
              phase: 'probe',
              then: [
                {
                  kind: 'assign',
                  target: v('misses'),
                  expr: bin('+', v('misses'), lit(1)),
                  phase: 'probe',
                },
                {
                  kind: 'var',
                  name: 'victim',
                  type: INT,
                  init: call('chooseVictim', [
                    v('tag'),
                    v('used'),
                    v('loaded'),
                    v('useLoad'),
                    v('pickMax'),
                  ]),
                  phase: 'choose-victim',
                },
                { kind: 'assign', target: at('tag', v('victim')), expr: v('line'), phase: 'install' },
                { kind: 'assign', target: at('loaded', v('victim')), expr: v('t'), phase: 'install' },
                { kind: 'assign', target: at('used', v('victim')), expr: v('t'), phase: 'install' },
              ],
              else: [
                // 적중. 마지막 사용 시각만 새로 적는다 — 적재 시각은 그대로다.
                // fifo 가 lru 와 갈리는 곳이 바로 여기다.
                { kind: 'assign', target: at('used', v('slot')), expr: v('t'), phase: 'hit' },
              ],
            },
          ],
        },
        { kind: 'return', expr: v('misses'), phase: 'done' },
      ],
    },
    {
      // 버릴 자리를 고른다. 두 축(useLoad · pickMax)이 정책을 가른다.
      name: 'chooseVictim',
      params: [
        { name: 'tag', type: INTS },
        { name: 'used', type: INTS },
        { name: 'loaded', type: INTS },
        { name: 'useLoad', type: INT },
        { name: 'pickMax', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: '빈 칸이 있으면 아직 버릴 것이 없다.' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: len('tag'),
          inclusive: false,
          phase: 'choose-victim',
          body: [
            {
              kind: 'if',
              cond: bin('==', at('tag', v('i')), lit(-1)),
              phase: 'choose-victim',
              then: [{ kind: 'return', expr: v('i'), phase: 'choose-victim' }],
            },
          ],
        },
        { kind: 'comment', text: '다 찼다. 정책이 읽는 시각만 보고 그 끝을 고른다.' },
        { kind: 'var', name: 'best', type: INT, init: lit(0), phase: 'choose-victim' },
        {
          kind: 'var',
          name: 'bestClock',
          type: INT,
          init: call('clockOf', [v('used'), v('loaded'), lit(0), v('useLoad')]),
          phase: 'choose-victim',
        },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(1),
          to: len('tag'),
          inclusive: false,
          phase: 'choose-victim',
          body: [
            {
              kind: 'var',
              name: 'cur',
              type: INT,
              init: call('clockOf', [v('used'), v('loaded'), v('i'), v('useLoad')]),
              phase: 'choose-victim',
            },
            {
              kind: 'if',
              cond: bin('==', v('pickMax'), lit(1)),
              phase: 'choose-victim',
              then: [
                {
                  kind: 'if',
                  cond: bin('>', v('cur'), v('bestClock')),
                  phase: 'choose-victim',
                  then: [
                    { kind: 'assign', target: v('best'), expr: v('i'), phase: 'choose-victim' },
                    {
                      kind: 'assign',
                      target: v('bestClock'),
                      expr: v('cur'),
                      phase: 'choose-victim',
                    },
                  ],
                },
              ],
              else: [
                {
                  kind: 'if',
                  cond: bin('<', v('cur'), v('bestClock')),
                  phase: 'choose-victim',
                  then: [
                    { kind: 'assign', target: v('best'), expr: v('i'), phase: 'choose-victim' },
                    {
                      kind: 'assign',
                      target: v('bestClock'),
                      expr: v('cur'),
                      phase: 'choose-victim',
                    },
                  ],
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: v('best'), phase: 'choose-victim' },
      ],
    },
    {
      // 첫째 축 — 어느 시각을 읽는가.
      name: 'clockOf',
      params: [
        { name: 'used', type: INTS },
        { name: 'loaded', type: INTS },
        { name: 'i', type: INT },
        { name: 'useLoad', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'if',
          cond: bin('==', v('useLoad'), lit(1)),
          phase: 'choose-victim',
          then: [{ kind: 'return', expr: at('loaded', v('i')), phase: 'choose-victim' }],
        },
        { kind: 'return', expr: at('used', v('i')), phase: 'choose-victim' },
      ],
    },
    {
      // 어떤 칸이 지금 이 줄을 담고 있는가. 없으면 -1.
      name: 'findSlot',
      params: [
        { name: 'tag', type: INTS },
        { name: 'line', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: len('tag'),
          inclusive: false,
          phase: 'probe',
          body: [
            {
              kind: 'if',
              cond: bin('==', at('tag', v('i')), v('line')),
              phase: 'probe',
              then: [{ kind: 'return', expr: v('i'), phase: 'probe' }],
            },
          ],
        },
        { kind: 'return', expr: lit(-1), phase: 'probe' },
      ],
    },
  ],
};

export const cacheReplacementIRs: IR[] = [cacheReplacementImperativeIR];
