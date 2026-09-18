/**
 * 구조체 정렬 — 코드 패널 IR.
 *
 * 진입 `structSize(sizes, pack)` 는 구조체 크기를, 보조 `countMisaligned(sizes, pack)` 는
 * 어긋난 필드 수를 낸다. 필드 순서는 **부르는 쪽이 sizes 를 재배치해** 건넨다 —
 * IR 은 배열을 만들 수 없고 정렬할 까닭도 없다.
 *
 * 올림은 `(offset + align − 1) // align * align`. 피연산자는 늘 0 이상이라 `//` · `%` 가
 * 여섯 언어에서 같게 셈한다. 중간값의 최대는 구조체 크기 32 다.
 *
 * phase 어휘 (algorithm.ts 와 같은 집합): 'begin' | 'place' | 'misalign' | 'tail'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '%' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop', op, l, r,
});
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const at = (arr: string, idx: string): IRExpr => ({ kind: 'index', arr: v(arr), idx: v(idx) });
const decl = (name: string, init: IRExpr, phase: string): IRStmt => ({
  kind: 'var', name, type: INT, init, phase,
});
const put = (name: string, expr: IRExpr, phase: string): IRStmt => ({
  kind: 'assign', target: v(name), expr, phase,
});

/** (x + a − 1) // a * a — x 를 a 의 배수로 올린다. */
const roundUp = (x: IRExpr, a: IRExpr): IRExpr =>
  bin('*', bin('//', bin('-', bin('+', x, a), n(1)), a), a);

export const structAlignmentImperativeIR: IR = {
  id: 'struct-alignment-imperative',
  algorithm: 'structAlignment',
  paradigm: 'imperative',
  functions: [
    {
      name: 'structSize',
      params: [
        { name: 'sizes', type: INT_LIST },
        { name: 'pack', type: INT },
      ],
      returnType: INT,
      body: [
        decl('offset', n(0), 'begin'),
        decl('structAlign', n(1), 'begin'),
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: { kind: 'len', of: v('sizes') },
          inclusive: false,
          body: [
            decl('align', call('min', at('sizes', 'i'), v('pack')), 'place'),
            put('offset', roundUp(v('offset'), v('align')), 'place'),
            put('offset', bin('+', v('offset'), at('sizes', 'i')), 'place'),
            put('structAlign', call('max', v('structAlign'), v('align')), 'place'),
          ],
        },
        decl('size', roundUp(v('offset'), v('structAlign')), 'tail'),
        { kind: 'return', expr: v('size'), phase: 'tail' },
      ],
    },
    {
      name: 'countMisaligned',
      params: [
        { name: 'sizes', type: INT_LIST },
        { name: 'pack', type: INT },
      ],
      returnType: INT,
      body: [
        decl('offset', n(0), 'begin'),
        decl('count', n(0), 'begin'),
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: { kind: 'len', of: v('sizes') },
          inclusive: false,
          body: [
            decl('align', call('min', at('sizes', 'i'), v('pack')), 'place'),
            put('offset', roundUp(v('offset'), v('align')), 'place'),
            {
              kind: 'if',
              cond: bin('!=', bin('%', v('offset'), at('sizes', 'i')), n(0)),
              then: [put('count', bin('+', v('count'), n(1)), 'misalign')],
              phase: 'misalign',
            },
            put('offset', bin('+', v('offset'), at('sizes', 'i')), 'place'),
          ],
        },
        { kind: 'return', expr: v('count'), phase: 'tail' },
      ],
    },
  ],
};

export const structAlignmentIRs: IR[] = [structAlignmentImperativeIR];
