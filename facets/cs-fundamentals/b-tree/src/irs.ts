/**
 * b-tree 학습용 IR — 찾기.
 *
 * phase 어휘는 `algorithm.ts` 와 글자 단위로 같아야 한다 (C3):
 *   'scan-keys' | 'found' | 'leaf-miss' | 'descend'
 *
 * 자리 하나가 키를 여럿 담고 자식도 여럿 거느리는데 IR 타입에 그런 어휘가
 * 없다(리스트의 리스트). 그래서 자리 조작만 이름 붙인 call 로 둔다 —
 * `node_key_count(n)` · `node_key(n, i)` · `node_child(n, i)` · `node_is_leaf(n)`.
 *
 * 두 겹 루프는 그대로 드러난다. 바깥이 층을 내려가고 안쪽이 자리 안에서 키를
 * 훑는다 — 그것이 B-트리 찾기의 전부다.
 */

import type { IR, IRExpr, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tBool: IRType = { kind: 'bool' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | boolean): IRExpr => ({ kind: 'lit', value });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

export const bTreeSearchIR: IR = {
  id: 'btree-search',
  algorithm: 'bTree',
  paradigm: 'imperative',
  functions: [
    {
      name: 'btree_search',
      params: [{ name: 'key', type: tInt }],
      returnType: tBool,
      body: [
        { kind: 'var', name: 'node', type: tInt, init: call('btree_root', []) },
        {
          kind: 'while',
          cond: lit(true),
          body: [
            { kind: 'var', name: 'i', type: tInt, init: lit(0) },
            {
              kind: 'while',
              phase: 'scan-keys',
              cond: bin(
                '&&',
                bin('<', v('i'), call('node_key_count', [v('node')])),
                bin('>', v('key'), call('node_key', [v('node'), v('i')])),
              ),
              body: [{ kind: 'assign', target: v('i'), expr: bin('+', v('i'), lit(1)) }],
            },
            {
              kind: 'if',
              phase: 'found',
              cond: bin(
                '&&',
                bin('<', v('i'), call('node_key_count', [v('node')])),
                bin('==', call('node_key', [v('node'), v('i')]), v('key')),
              ),
              then: [{ kind: 'return', expr: lit(true) }],
            },
            {
              kind: 'if',
              phase: 'leaf-miss',
              cond: call('node_is_leaf', [v('node')]),
              then: [{ kind: 'return', expr: lit(false) }],
            },
            {
              kind: 'assign',
              phase: 'descend',
              target: v('node'),
              expr: call('node_child', [v('node'), v('i')]),
            },
          ],
        },
      ],
    },
  ],
};

export const bTreeIRs: IR[] = [bTreeSearchIR];
