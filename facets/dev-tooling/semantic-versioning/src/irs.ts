/**
 * semantic-versioning — 코드 패널 IR.
 *
 * 진입 함수 `receive(cur, kind, op, want, locked, bumped) → int`
 *   cur     깔린 버전의 세 수
 *   kind    0 고침 · 1 기능 추가 · 2 호환 깨짐
 *   op      0 = `^` · 1 = `~` (부르는 쪽이 범위 기호를 번호로 바꿔 건넨다 — 문자 비교가 없다)
 *   want    범위의 세 수
 *   locked  잠금 파일이 있는가
 *   bumped  부르는 쪽이 만든 길이 3 버퍼 — 새 버전을 여기 쓴다 (IR 은 배열을 만들 수 없다)
 *   돌려주는 값: 0 거절 · 1 받음 · 2 잠금
 *
 * 알고리즘과 같은 길 — 올림 → 잠금을 범위보다 먼저 → 두 끝 → 댄다.
 * 0.x 특례(`^0.m.p` · `^0.0.p`) 도 upperPart 가 푼다 (데이터에는 없다).
 * 중간값 최대 5 · 비트 연산 없음 · 수학 이름 없음 — 넘침 없다.
 *
 * phase 아홉: bump-patch · bump-minor · bump-major · read-lock · keep-lock · range-ends · compare · accept · reject
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const BOOL: IRType = { kind: 'bool' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, i: number): IRExpr => ({ kind: 'index', arr: v(arr), idx: n(i) });
const bin = (op: '+' | '<' | '>' | '>=' | '==' | '!=' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const ret = (expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'return', expr } : { kind: 'return', expr, phase };
const put = (arr: string, i: number, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined
    ? { kind: 'assign', target: at(arr, i), expr }
    : { kind: 'assign', target: at(arr, i), expr, phase };

/** 한 자리를 견주어 다르면 -1 · 1 을 돌려준다 */
const differs = (a: string, b: string): IRStmt => ({
  kind: 'if',
  cond: bin('!=', v(a), v(b)),
  then: [
    { kind: 'if', cond: bin('<', v(a), v(b)), then: [ret(n(-1))] },
    ret(n(1)),
  ],
});

const compareVersionFn = {
  name: 'compareVersion',
  params: ['a0', 'a1', 'a2', 'b0', 'b1', 'b2'].map((name) => ({ name, type: INT })),
  returnType: INT,
  body: [
    { kind: 'comment', text: 'compare the three numbers in order, as numbers' },
    differs('a0', 'b0'),
    differs('a1', 'b1'),
    differs('a2', 'b2'),
    ret(n(0)),
  ] as IRStmt[],
};

/** part 자리가 그 자리면 value, 아니면 0 */
const partIs = (part: number, value: IRExpr): IRStmt => ({
  kind: 'if',
  cond: bin('==', v('part'), n(part)),
  then: [ret(value)],
});

const upperPartFn = {
  name: 'upperPart',
  params: [
    { name: 'op', type: INT },
    { name: 'major', type: INT },
    { name: 'minor', type: INT },
    { name: 'patch', type: INT },
    { name: 'part', type: INT },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'one digit of the exclusive upper end of the range' },
    {
      kind: 'if',
      cond: bin('==', v('op'), n(0)),
      then: [
        { kind: 'comment', text: 'caret: the leftmost nonzero digit may not change' },
        {
          kind: 'if',
          cond: bin('>', v('major'), n(0)),
          then: [partIs(0, bin('+', v('major'), n(1))), ret(n(0))],
        },
        {
          kind: 'if',
          cond: bin('>', v('minor'), n(0)),
          then: [partIs(1, bin('+', v('minor'), n(1))), ret(n(0))],
        },
        partIs(2, bin('+', v('patch'), n(1))),
        ret(n(0)),
      ],
    },
    { kind: 'comment', text: 'tilde: the minor digit may not change' },
    partIs(0, v('major')),
    partIs(1, bin('+', v('minor'), n(1))),
    ret(n(0)),
  ] as IRStmt[],
};

const upperCall = (part: number): IRExpr => ({
  kind: 'call',
  fn: 'upperPart',
  args: [v('op'), at('want', 0), at('want', 1), at('want', 2), n(part)],
});

const compareCall = (a: [IRExpr, IRExpr, IRExpr], b: [IRExpr, IRExpr, IRExpr]): IRExpr => ({
  kind: 'call',
  fn: 'compareVersion',
  args: [...a, ...b],
});

const bumped3: [IRExpr, IRExpr, IRExpr] = [at('bumped', 0), at('bumped', 1), at('bumped', 2)];

const receiveFn = {
  name: 'receive',
  params: [
    { name: 'cur', type: INT_LIST },
    { name: 'kind', type: INT },
    { name: 'op', type: INT },
    { name: 'want', type: INT_LIST },
    { name: 'locked', type: BOOL },
    { name: 'bumped', type: INT_LIST },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'the publisher raises one digit and zeroes the digits to its right' },
    put('bumped', 0, at('cur', 0)),
    put('bumped', 1, at('cur', 1)),
    put('bumped', 2, at('cur', 2)),
    {
      kind: 'if',
      cond: bin('==', v('kind'), n(2)),
      then: [
        put('bumped', 0, bin('+', at('cur', 0), n(1)), 'bump-major'),
        put('bumped', 1, n(0)),
        put('bumped', 2, n(0)),
      ],
      else: [
        {
          kind: 'if',
          cond: bin('==', v('kind'), n(1)),
          then: [put('bumped', 1, bin('+', at('cur', 1), n(1)), 'bump-minor'), put('bumped', 2, n(0))],
          else: [put('bumped', 2, bin('+', at('cur', 2), n(1)), 'bump-patch')],
        },
      ],
    },
    { kind: 'comment', text: 'the lock file is read before the range' },
    {
      kind: 'if',
      cond: v('locked'),
      phase: 'read-lock',
      then: [ret(n(2), 'keep-lock')],
    },
    { kind: 'comment', text: 'lower end is want itself, upper end is exclusive' },
    { kind: 'var', name: 'hi0', type: INT, init: upperCall(0), phase: 'range-ends' },
    { kind: 'var', name: 'hi1', type: INT, init: upperCall(1), phase: 'range-ends' },
    { kind: 'var', name: 'hi2', type: INT, init: upperCall(2), phase: 'range-ends' },
    {
      kind: 'if',
      cond: bin(
        '&&',
        bin('>=', compareCall(bumped3, [at('want', 0), at('want', 1), at('want', 2)]), n(0)),
        bin('<', compareCall(bumped3, [v('hi0'), v('hi1'), v('hi2')]), n(0)),
      ),
      phase: 'compare',
      then: [ret(n(1), 'accept')],
    },
    ret(n(0), 'reject'),
  ] as IRStmt[],
};

export const semanticVersioningImperativeIR: IR = {
  id: 'semantic-versioning-imperative',
  algorithm: 'semanticVersioning',
  paradigm: 'imperative',
  functions: [receiveFn, compareVersionFn, upperPartFn],
};

export const semanticVersioningIRs: IR[] = [semanticVersioningImperativeIR];
