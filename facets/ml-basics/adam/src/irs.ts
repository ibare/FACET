/**
 * adam 의 IR — 두 갱신 규칙이 path 버퍼에 걸음마다 (a, b) 를 쓴다.
 *
 * path (double 목록, 길이 2·(steps + 1)) = [a0, b0, a1, b1, …]. [0] · [1] 에 처음이 있고
 * 갱신 t 뒤 (a, b) 를 path[2t] · path[2t + 1] 에 쓴다. IR 은 배열을 만들 수 없어 부르는 쪽이 버퍼를 건넨다.
 * r 은 double — 10.0 / r 이 정수 나눗셈이 되지 않게.
 *
 * 첫 함수가 진입점이다 (기본 규칙이 Adam 이라 adamRun 이 먼저).
 * 갱신 몸통 줄은 모두 한 phase 로 묶는다 — 걸음 경계 사이에는 마지막 phase 하나만 켜지므로
 * 몸통을 여러 phase 로 쪼개면 앞 줄들이 한 번도 켜지지 않는다.
 * 간 몫은 IR 이 셈하지 않는다 — path 에서 algorithm 이 셈한다.
 *
 * phase 어휘: adam-step · gd-step (algorithm.ts 와 같다).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const DOUBLE: IRType = { kind: 'double' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '/' | '//', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const idx = (arr: string, i: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx: i });
const sqrt = (x: IRExpr): IRExpr => ({ kind: 'call', fn: 'sqrt', args: [x] });

const decl = (name: string, init: IRExpr): IRStmt => ({ kind: 'var', name, type: DOUBLE, init });
const set = (name: string, expr: IRExpr, phase: string): IRStmt => ({ kind: 'assign', target: v(name), expr, phase });
const setAt = (i: IRExpr, expr: IRExpr, phase: string): IRStmt => ({
  kind: 'assign',
  target: idx('path', i),
  expr,
  phase,
});

/** 2t · 2t + 1 */
const evenSlot = bin('*', n(2), v('t'));
const oddSlot = bin('+', bin('*', n(2), v('t')), n(1));

/** 갱신 수 = len(path) // 2 − 1 — for t in 1 ‥ len(path) // 2 (끝 제외) */
const loopEnd: IRExpr = bin('//', { kind: 'len', of: v('path') }, n(2));

/** 머리 — a, b 를 path 에서 읽고 두 축의 기울기 계수를 둔다 */
const head: IRStmt[] = [
  { kind: 'comment', text: 'loss L = 5*a^2 + (5/r)*b^2, gradient g = (10*a, (10/r)*b)' },
  decl('a', idx('path', n(0))),
  decl('b', idx('path', n(1))),
  decl('ca', n(10.0)),
  decl('cb', bin('/', n(10.0), v('r'))),
];

/** m ← β1·m + (1 − β1)·g */
const firstMoment = (m: string, g: string): IRExpr =>
  bin('+', bin('*', v('beta1'), v(m)), bin('*', bin('-', n(1), v('beta1')), v(g)));
/** v ← β2·v + (1 − β2)·g·g */
const secondMoment = (s: string, g: string): IRExpr =>
  bin('+', bin('*', v('beta2'), v(s)), bin('*', bin('*', bin('-', n(1), v('beta2')), v(g)), v(g)));
/** w ← w − η·(m/(1 − p1)) / (√(v/(1 − p2)) + ε) */
const adamMove = (w: string, m: string, s: string): IRExpr =>
  bin(
    '-',
    v(w),
    bin(
      '/',
      bin('*', v('eta'), bin('/', v(m), bin('-', n(1), v('p1')))),
      bin('+', sqrt(bin('/', v(s), bin('-', n(1), v('p2')))), v('eps')),
    ),
  );

const ADAM = 'adam-step';
const GD = 'gd-step';

export const adamImperativeIR: IR = {
  id: 'adam-imperative',
  algorithm: 'adam',
  paradigm: 'imperative',
  functions: [
    {
      name: 'adamRun',
      params: [
        { name: 'path', type: { kind: 'list', of: DOUBLE } },
        { name: 'r', type: DOUBLE },
        { name: 'eta', type: DOUBLE },
        { name: 'beta1', type: DOUBLE },
        { name: 'beta2', type: DOUBLE },
        { name: 'eps', type: DOUBLE },
      ],
      returnType: { kind: 'void' },
      body: [
        ...head,
        decl('ma', n(0)),
        decl('mb', n(0)),
        decl('va', n(0)),
        decl('vb', n(0)),
        { kind: 'comment', text: 'p1, p2 hold beta1^t and beta2^t by repeated product' },
        decl('p1', n(1)),
        decl('p2', n(1)),
        {
          kind: 'for-range',
          var: 't',
          from: n(1),
          to: loopEnd,
          inclusive: false,
          body: [
            { kind: 'var', name: 'ga', type: DOUBLE, init: bin('*', v('ca'), v('a')), phase: ADAM },
            { kind: 'var', name: 'gb', type: DOUBLE, init: bin('*', v('cb'), v('b')), phase: ADAM },
            set('ma', firstMoment('ma', 'ga'), ADAM),
            set('mb', firstMoment('mb', 'gb'), ADAM),
            set('va', secondMoment('va', 'ga'), ADAM),
            set('vb', secondMoment('vb', 'gb'), ADAM),
            set('p1', bin('*', v('p1'), v('beta1')), ADAM),
            set('p2', bin('*', v('p2'), v('beta2')), ADAM),
            { kind: 'comment', text: 'each axis divides by its own gradient size sqrt(v_hat)' },
            set('a', adamMove('a', 'ma', 'va'), ADAM),
            set('b', adamMove('b', 'mb', 'vb'), ADAM),
            setAt(evenSlot, v('a'), ADAM),
            setAt(oddSlot, v('b'), ADAM),
          ],
        },
      ],
    },
    {
      name: 'gdRun',
      params: [
        { name: 'path', type: { kind: 'list', of: DOUBLE } },
        { name: 'r', type: DOUBLE },
        { name: 'eta', type: DOUBLE },
      ],
      returnType: { kind: 'void' },
      body: [
        ...head,
        {
          kind: 'for-range',
          var: 't',
          from: n(1),
          to: loopEnd,
          inclusive: false,
          body: [
            { kind: 'comment', text: 'one learning rate for both axes' },
            set('a', bin('-', v('a'), bin('*', bin('*', v('eta'), v('ca')), v('a'))), GD),
            set('b', bin('-', v('b'), bin('*', bin('*', v('eta'), v('cb')), v('b'))), GD),
            setAt(evenSlot, v('a'), GD),
            setAt(oddSlot, v('b'), GD),
          ],
        },
      ],
    },
  ],
};

export const adamIRs: IR[] = [adamImperativeIR];
