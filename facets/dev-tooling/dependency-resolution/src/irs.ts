/**
 * dependency-resolution 의 IR — 두 해결기(중첩 · 한 벌)가 color 를 몇 벌 까는지 셈한다.
 *
 * 진입 함수 `resolve(vers, first, second, solver, used) → int`
 *   - `vers`   공개된 color 를 편 배열 `[M, m, p, M, m, p, …]` (개수는 `len(vers) // 3`)
 *   - `first`  charts 의 범위 `[연산자 번호, M, m, p]` (0 = `^` · 1 = `~`)
 *   - `second` table 의 범위 (같은 꼴)
 *   - `solver` 0 중첩 · 1 한 벌
 *   - `used`   부르는 쪽이 만든 길이 2 버퍼 — charts · table 이 쓰는 버전의 번호(`vers` 안의 자리, 0 부터)
 *   - 돌려주는 값: 벌 수 (0 = 실패)
 *
 * phase 일곱 (algorithm 과 같은 집합): pick-first · check-top · reuse · nest · shared-range · pick-shared · fail.
 *
 * `shared-versions` 계기(두 범위를 함께 채우는 공개 버전 수)는 IR 밖이다 — 두 해결기의 길에 없는 수라서,
 * 코드 패널에 두면 중첩 해결기가 구간을 셈하는 것처럼 보인다. 알고리즘이 따로 셈한다.
 *
 * `maxIn` 은 배열 차례에 기대지 않고 수로 견주어 가장 큰 것을 남긴다 (공개 목록을 섞어도 답이 같다).
 * `&&` 는 짧은 회로가 아니므로 색인 확인과 읽기는 `if` 를 겹쳐 쓴다. 중간값 최대 `3 * i + 2` = 17.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const BOOL: IRType = { kind: 'bool' };
const LIST: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '*' | '//' | '<' | '>' | '>=' | '==' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const intVar = (name: string, init: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'var', name, type: INT, init } : { kind: 'var', name, type: INT, init, phase };
const set = (name: string, expr: IRExpr): IRStmt => ({ kind: 'assign', target: v(name), expr });
const ret = (expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'return', expr } : { kind: 'return', expr, phase };

/** vers[3 * i + k] */
const part = (arr: string, i: IRExpr, k: number): IRExpr => at(arr, bin('+', bin('*', n(3), i), n(k)));

/** compareVersion(vers[i], vers[j]) */
const cmpAt = (i: IRExpr, j: IRExpr): IRExpr =>
  call('compareVersion', part('vers', i, 0), part('vers', i, 1), part('vers', i, 2), part('vers', j, 0), part('vers', j, 1), part('vers', j, 2));

const compareVersionFn = {
  name: 'compareVersion',
  params: ['a0', 'a1', 'a2', 'b0', 'b1', 'b2'].map((name) => ({ name, type: INT })),
  returnType: INT,
  body: [
    { kind: 'comment', text: 'compare three numbers in order, as numbers' },
    ...(
      [
        ['a0', 'b0'],
        ['a1', 'b1'],
        ['a2', 'b2'],
      ] as const
    ).map(
      ([a, b]): IRStmt => ({
        kind: 'if',
        cond: bin('!=', v(a), v(b)),
        then: [
          { kind: 'if', cond: bin('<', v(a), v(b)), then: [ret(n(-1))] },
          ret(n(1)),
        ],
      }),
    ),
    ret(n(0)),
  ],
} satisfies IR['functions'][number];

const upperPartFn = {
  name: 'upperPart',
  params: ['op', 'major', 'minor', 'patch', 'part'].map((name) => ({ name, type: INT })),
  returnType: INT,
  body: [
    { kind: 'comment', text: 'upper end (exclusive); op 1 is tilde: M.(m+1).0' },
    intVar('u0', v('major')),
    intVar('u1', bin('+', v('minor'), n(1))),
    intVar('u2', n(0)),
    {
      kind: 'if',
      cond: bin('==', v('op'), n(0)),
      then: [
        { kind: 'comment', text: 'caret: bump the first non-zero number' },
        {
          kind: 'if',
          cond: bin('>', v('major'), n(0)),
          then: [set('u0', bin('+', v('major'), n(1))), set('u1', n(0))],
          else: [
            {
              kind: 'if',
              cond: bin('>', v('minor'), n(0)),
              then: [set('u0', n(0))],
              else: [set('u0', n(0)), set('u1', n(0)), set('u2', bin('+', v('patch'), n(1)))],
            },
          ],
        },
      ],
    },
    { kind: 'if', cond: bin('==', v('part'), n(0)), then: [ret(v('u0'))] },
    { kind: 'if', cond: bin('==', v('part'), n(1)), then: [ret(v('u1'))] },
    ret(v('u2')),
  ],
} satisfies IR['functions'][number];

const upperOf = (r: string, k: number): IRExpr =>
  call('upperPart', at(r, n(0)), at(r, n(1)), at(r, n(2)), at(r, n(3)), n(k));

const inRangeFn = {
  name: 'inRange',
  params: [
    { name: 'vers', type: LIST },
    { name: 'i', type: INT },
    { name: 'r', type: LIST },
  ],
  returnType: BOOL,
  body: [
    { kind: 'comment', text: 'lower end included, upper end excluded' },
    {
      kind: 'if',
      cond: bin(
        '<',
        call('compareVersion', part('vers', v('i'), 0), part('vers', v('i'), 1), part('vers', v('i'), 2), at('r', n(1)), at('r', n(2)), at('r', n(3))),
        n(0),
      ),
      then: [ret({ kind: 'lit', value: false })],
    },
    intVar('h0', upperOf('r', 0)),
    intVar('h1', upperOf('r', 1)),
    intVar('h2', upperOf('r', 2)),
    {
      kind: 'if',
      cond: bin(
        '>=',
        call('compareVersion', part('vers', v('i'), 0), part('vers', v('i'), 1), part('vers', v('i'), 2), v('h0'), v('h1'), v('h2')),
        n(0),
      ),
      then: [ret({ kind: 'lit', value: false })],
    },
    ret({ kind: 'lit', value: true }),
  ],
} satisfies IR['functions'][number];

/** best 가 비었거나 i 가 더 크면 best = i — 배열 차례에 기대지 않는다 */
const keepLarger = (): IRStmt => ({
  kind: 'if',
  cond: bin('<', v('best'), n(0)),
  then: [set('best', v('i'))],
  else: [{ kind: 'if', cond: bin('>', cmpAt(v('i'), v('best')), n(0)), then: [set('best', v('i'))] }],
});

const count = (): IRExpr => bin('//', { kind: 'len', of: v('vers') }, n(3));

const maxInFn = {
  name: 'maxIn',
  params: [
    { name: 'vers', type: LIST },
    { name: 'r', type: LIST },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'largest published version inside r, by value; -1 if none' },
    intVar('best', n(-1)),
    {
      kind: 'for-range',
      var: 'i',
      from: n(0),
      to: count(),
      inclusive: false,
      body: [{ kind: 'if', cond: call('inRange', v('vers'), v('i'), v('r')), then: [keepLarger()] }],
    },
    ret(v('best')),
  ],
} satisfies IR['functions'][number];

const setUsed = (k: number, expr: IRExpr, phase: string): IRStmt => ({
  kind: 'assign',
  target: at('used', n(k)),
  expr,
  phase,
});

const resolveFn = {
  name: 'resolve',
  params: [
    { name: 'vers', type: LIST },
    { name: 'first', type: LIST },
    { name: 'second', type: LIST },
    { name: 'solver', type: INT },
    { name: 'used', type: LIST },
  ],
  returnType: INT,
  body: [
    {
      kind: 'if',
      cond: bin('==', v('solver'), n(0)),
      then: [
        { kind: 'comment', text: 'nested: the first caller picks, the top copy is never revisited' },
        intVar('top', call('maxIn', v('vers'), v('first')), 'pick-first'),
        { kind: 'if', cond: bin('<', v('top'), n(0)), then: [ret(n(0), 'fail')] },
        setUsed(0, v('top'), 'pick-first'),
        {
          kind: 'if',
          cond: call('inRange', v('vers'), v('top'), v('second')),
          phase: 'check-top',
          then: [setUsed(1, v('top'), 'reuse'), ret(n(1), 'reuse')],
        },
        { kind: 'comment', text: 'top is outside: a second copy goes inside the caller' },
        intVar('inner', call('maxIn', v('vers'), v('second')), 'nest'),
        { kind: 'if', cond: bin('<', v('inner'), n(0)), then: [ret(n(0), 'fail')] },
        setUsed(1, v('inner'), 'nest'),
        ret(n(2), 'nest'),
      ],
    },
    { kind: 'comment', text: 'single: one copy must satisfy both ranges' },
    intVar('lo0', at('first', n(1)), 'shared-range'),
    intVar('lo1', at('first', n(2)), 'shared-range'),
    intVar('lo2', at('first', n(3)), 'shared-range'),
    {
      kind: 'if',
      cond: bin(
        '>',
        call('compareVersion', at('second', n(1)), at('second', n(2)), at('second', n(3)), v('lo0'), v('lo1'), v('lo2')),
        n(0),
      ),
      phase: 'shared-range',
      then: [set('lo0', at('second', n(1))), set('lo1', at('second', n(2))), set('lo2', at('second', n(3)))],
    },
    intVar('hi0', upperOf('first', 0), 'shared-range'),
    intVar('hi1', upperOf('first', 1), 'shared-range'),
    intVar('hi2', upperOf('first', 2), 'shared-range'),
    intVar('up0', upperOf('second', 0), 'shared-range'),
    intVar('up1', upperOf('second', 1), 'shared-range'),
    intVar('up2', upperOf('second', 2), 'shared-range'),
    {
      kind: 'if',
      cond: bin('<', call('compareVersion', v('up0'), v('up1'), v('up2'), v('hi0'), v('hi1'), v('hi2')), n(0)),
      phase: 'shared-range',
      then: [set('hi0', v('up0')), set('hi1', v('up1')), set('hi2', v('up2'))],
    },
    {
      kind: 'if',
      cond: bin('>=', call('compareVersion', v('lo0'), v('lo1'), v('lo2'), v('hi0'), v('hi1'), v('hi2')), n(0)),
      then: [ret(n(0), 'fail')],
    },
    intVar('best', n(-1), 'pick-shared'),
    {
      kind: 'for-range',
      var: 'i',
      from: n(0),
      to: count(),
      inclusive: false,
      phase: 'pick-shared',
      body: [
        {
          kind: 'if',
          cond: bin(
            '>=',
            call('compareVersion', part('vers', v('i'), 0), part('vers', v('i'), 1), part('vers', v('i'), 2), v('lo0'), v('lo1'), v('lo2')),
            n(0),
          ),
          then: [
            {
              kind: 'if',
              cond: bin(
                '<',
                call('compareVersion', part('vers', v('i'), 0), part('vers', v('i'), 1), part('vers', v('i'), 2), v('hi0'), v('hi1'), v('hi2')),
                n(0),
              ),
              then: [keepLarger()],
            },
          ],
        },
      ],
    },
    { kind: 'if', cond: bin('<', v('best'), n(0)), then: [ret(n(0), 'fail')] },
    setUsed(0, v('best'), 'pick-shared'),
    setUsed(1, v('best'), 'pick-shared'),
    ret(n(1), 'pick-shared'),
  ],
} satisfies IR['functions'][number];

export const dependencyResolutionImperativeIR: IR = {
  id: 'dependency-resolution-imperative',
  algorithm: 'dependencyResolution',
  paradigm: 'imperative',
  functions: [resolveFn, compareVersionFn, upperPartFn, inRangeFn, maxInFn],
};

export const dependencyResolutionIRs: IR[] = [dependencyResolutionImperativeIR];
