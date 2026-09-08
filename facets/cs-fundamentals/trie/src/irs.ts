/**
 * trie 학습용 IR — 글자마다 한 칸 내려가는 찾기.
 *
 * phase 어휘는 `algorithm.ts` 와 글자 단위로 같아야 한다 (C3):
 *   'step-down' | 'no-branch' | 'is-word'
 *
 * 자식은 글자로 찾으므로 배열이 아니라 map 이 필요한데 IR 타입에 그 어휘가
 * 없다. 그래서 자리 이동만 이름 붙인 call 로 둔다 — `trie_child(n, c)` 가
 * 없으면 `-1`. 나머지(글자를 하나씩 집어 내려가는 것)는 그대로 드러난다.
 */

import type { IR, IRExpr, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tBool: IRType = { kind: 'bool' };
const tString: IRType = { kind: 'string' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | string | boolean): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

export const trieSearchIR: IR = {
  id: 'trie-search',
  algorithm: 'trie',
  paradigm: 'imperative',
  functions: [
    {
      name: 'trie_search',
      params: [{ name: 'word', type: tString }],
      returnType: tBool,
      body: [
        { kind: 'var', name: 'node', type: tInt, init: call('trie_root', []) },
        { kind: 'var', name: 'i', type: tInt, init: lit(0) },
        {
          kind: 'while',
          cond: bin('<', v('i'), len(v('word'))),
          body: [
            {
              kind: 'assign',
              phase: 'step-down',
              target: v('node'),
              expr: call('trie_child', [v('node'), idx(v('word'), v('i'))]),
            },
            {
              kind: 'if',
              phase: 'no-branch',
              cond: bin('==', v('node'), lit(-1)),
              then: [{ kind: 'return', expr: lit(false) }],
            },
            { kind: 'assign', target: v('i'), expr: bin('+', v('i'), lit(1)) },
          ],
        },
        { kind: 'return', phase: 'is-word', expr: call('trie_is_end', [v('node')]) },
      ],
    },
  ],
};

export const trieIRs: IR[] = [trieSearchIR];
