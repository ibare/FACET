/**
 * collision IR — 세는 셈만 둔다.
 *
 * 해시는 IR 에 두지 않는다. 부르는 쪽(algorithm)이 H(<흐름>1..) · H(<흐름>x1..) 를 셈해 배열로 넘긴다.
 * 정해진 문서 찾기가 n 12 에서 해시 4 만 번이라 해석기에서 무겁고, 해시의 IR 은 sha 완제품의 몫이다.
 * seen 버퍼도 부르는 쪽이 0 으로 채운 길이 4096 배열로 만든다 (IR 은 배열을 만들 수 없다).
 *
 * 함수 (첫 함수가 진입점):
 *   pigeonhole(n)                     → 2ⁿ + 1                                  [pigeonhole]
 *   birthdayHalf(n)                   → 50% 입력 수 k (없으면 −1)                [birthday-half]
 *   firstCollision(hashes, n, seen)   → 처음 겹친 입력 번호 (없으면 −1)          [first-collision]
 *   targetHit(targetHash, tries, n)   → 정해진 문서와 겹친 시도 번호 (없으면 −1) [target-hit]
 *   pow2(n)                           → 2ⁿ (phase 없음)
 *
 * 중간값 최대: 해시 ≤ 65535 · size ≤ 4096 — 32 비트와 멀다. 음수 `//` · `%` 없음.
 * 정수를 정수로 나눠 실수를 얻지 않는다 — double 지역 변수에 먼저 담는다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const INT_LIST: IRType = { kind: 'list', of: { kind: 'int' } };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const bin = (op: '+' | '-' | '*' | '/' | '%' | '==' | '>=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const idx = (arr: string, i: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx: i });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const ret = (expr: IRExpr, phase?: string): IRStmt => (phase ? { kind: 'return', expr, phase } : { kind: 'return', expr });
const comment = (text: string): IRStmt => ({ kind: 'comment', text });

export const collisionImperativeIR: IR = {
  id: 'collision-imperative',
  algorithm: 'collision',
  paradigm: 'imperative',
  functions: [
    {
      name: 'pigeonhole',
      params: [{ name: 'n', type: INT }],
      returnType: INT,
      body: [
        comment('N = 2^n slots: the (N+1)-th input must land on a taken slot'),
        ret(bin('+', call('pow2', [v('n')]), lit(1)), 'pigeonhole'),
      ],
    },
    {
      name: 'birthdayHalf',
      params: [{ name: 'n', type: INT }],
      returnType: INT,
      body: [
        comment('smallest k with 1 - prod_{i<k} (N - i) / N >= 0.5'),
        { kind: 'var', name: 'size', type: INT, init: call('pow2', [v('n')]), phase: 'birthday-half' },
        { kind: 'var', name: 'nd', type: DOUBLE, init: v('size'), phase: 'birthday-half' },
        { kind: 'var', name: 'q', type: DOUBLE, init: lit(1.0), phase: 'birthday-half' },
        {
          kind: 'for-range',
          var: 'k',
          from: lit(1),
          to: bin('+', v('size'), lit(1)),
          inclusive: true,
          phase: 'birthday-half',
          body: [
            comment('q = chance that the first k inputs all sit in different slots'),
            {
              kind: 'var',
              name: 'num',
              type: DOUBLE,
              init: bin('+', bin('-', v('size'), v('k')), lit(1)),
              phase: 'birthday-half',
            },
            { kind: 'assign', target: v('q'), expr: bin('/', bin('*', v('q'), v('num')), v('nd')), phase: 'birthday-half' },
            {
              kind: 'if',
              cond: bin('>=', bin('-', lit(1.0), v('q')), lit(0.5)),
              then: [ret(v('k'), 'birthday-half')],
              phase: 'birthday-half',
            },
          ],
        },
        ret(lit(-1), 'birthday-half'),
      ],
    },
    {
      name: 'firstCollision',
      params: [
        { name: 'hashes', type: INT_LIST },
        { name: 'n', type: INT },
        { name: 'seen', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        comment('hashes[i] = H(stream + (i + 1)); seen is a zero-filled buffer of length 4096'),
        { kind: 'var', name: 'size', type: INT, init: call('pow2', [v('n')]), phase: 'first-collision' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: { kind: 'len', of: v('hashes') },
          inclusive: false,
          phase: 'first-collision',
          body: [
            comment('slot = low n bits of the hash'),
            { kind: 'var', name: 'slot', type: INT, init: bin('%', idx('hashes', v('i')), v('size')), phase: 'first-collision' },
            {
              kind: 'if',
              cond: bin('==', idx('seen', v('slot')), lit(1)),
              then: [ret(bin('+', v('i'), lit(1)), 'first-collision')],
              phase: 'first-collision',
            },
            { kind: 'assign', target: idx('seen', v('slot')), expr: lit(1), phase: 'first-collision' },
          ],
        },
        ret(lit(-1), 'first-collision'),
      ],
    },
    {
      name: 'targetHit',
      params: [
        { name: 'targetHash', type: INT },
        { name: 'tries', type: INT_LIST },
        { name: 'n', type: INT },
      ],
      returnType: INT,
      body: [
        comment('the fixed document stays; tries[i] = H(stream + "x" + (i + 1))'),
        { kind: 'var', name: 'size', type: INT, init: call('pow2', [v('n')]), phase: 'target-hit' },
        { kind: 'var', name: 'target', type: INT, init: bin('%', v('targetHash'), v('size')), phase: 'target-hit' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: { kind: 'len', of: v('tries') },
          inclusive: false,
          phase: 'target-hit',
          body: [
            {
              kind: 'if',
              cond: bin('==', bin('%', idx('tries', v('i')), v('size')), v('target')),
              then: [ret(bin('+', v('i'), lit(1)), 'target-hit')],
              phase: 'target-hit',
            },
          ],
        },
        ret(lit(-1), 'target-hit'),
      ],
    },
    {
      name: 'pow2',
      params: [{ name: 'n', type: INT }],
      returnType: INT,
      body: [
        { kind: 'var', name: 'size', type: INT, init: lit(1) },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [{ kind: 'assign', target: v('size'), expr: bin('*', v('size'), lit(2)) }],
        },
        ret(v('size')),
      ],
    },
  ],
};

export const collisionIRs: IR[] = [collisionImperativeIR];
