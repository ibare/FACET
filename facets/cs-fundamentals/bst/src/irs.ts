/**
 * BST 학습용 IR — 재귀 / 반복 두 구현을 같은 phase 어휘로 동기.
 *
 * phase 어휘 (algorithm.ts 의 emit('phase', ...) 와 동일):
 *   'compare-node' | 'descend-left' | 'descend-right' |
 *   'reach-leaf-miss' | 'hit' | 'insert-new' |
 *   'delete-start' | 'delete-leaf' | 'delete-one-child' |
 *   'delete-successor-descend' | 'delete-value-move'
 *
 * IR 제약상 BST 노드 구조를 타입으로 담을 수 없어 자료구조 조작은
 * named call (`bst_left(n)`, `bst_right(n)`, `bst_value(n)`, `bst_attach_left`,
 * `bst_attach_right`, `bst_set_value`, `bst_remove`) 로 추상화한다.
 * 각 call 은 transpiler 가 언어별로 `fn(args...)` 형태로 그대로 출력.
 *
 * 첫 구현 (기획 부록 (e)) 에서 code-view 블록은 recursive 하나만 참조.
 * iterative 는 paradigm 토글 도입 시 즉시 쓸 수 있도록 같은 phase 로 미리 저장.
 */

import type { IR, IRExpr, IRStmt, IRType } from '@facet/core';

const tInt: IRType = { kind: 'int' };
const tBool: IRType = { kind: 'bool' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | string | boolean): IRExpr => ({ kind: 'lit', value });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (
  op: '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

export const bstRecursiveIR: IR = {
  id: 'bst-recursive',
  algorithm: 'bst',
  paradigm: 'imperative',
  functions: [
    {
      name: 'bst_search',
      params: [
        { name: 'node', type: tInt },
        { name: 'key', type: tInt },
      ],
      returnType: tBool,
      body: [
        {
          kind: 'if',
          cond: call('is_null', [v('node')]),
          then: [
            {
              kind: 'return',
              phase: 'reach-leaf-miss',
              expr: lit(false),
            },
          ],
        },
        {
          kind: 'if',
          phase: 'compare-node',
          cond: bin('==', v('key'), call('bst_value', [v('node')])),
          then: [{ kind: 'return', phase: 'hit', expr: lit(true) }],
        },
        {
          kind: 'if',
          cond: bin('<', v('key'), call('bst_value', [v('node')])),
          then: [
            {
              kind: 'return',
              phase: 'descend-left',
              expr: call('bst_search', [call('bst_left', [v('node')]), v('key')]),
            },
          ],
          else: [
            {
              kind: 'return',
              phase: 'descend-right',
              expr: call('bst_search', [call('bst_right', [v('node')]), v('key')]),
            },
          ],
        },
      ] satisfies IRStmt[],
    },
    {
      name: 'bst_insert',
      params: [
        { name: 'node', type: tInt },
        { name: 'key', type: tInt },
      ],
      returnType: tInt,
      body: [
        {
          kind: 'if',
          cond: call('is_null', [v('node')]),
          then: [
            {
              kind: 'return',
              phase: 'insert-new',
              expr: call('bst_new', [v('key')]),
            },
          ],
        },
        {
          kind: 'if',
          phase: 'compare-node',
          cond: bin('<', v('key'), call('bst_value', [v('node')])),
          then: [
            {
              kind: 'expr-stmt',
              phase: 'descend-left',
              expr: call('bst_attach_left', [
                v('node'),
                call('bst_insert', [call('bst_left', [v('node')]), v('key')]),
              ]),
            },
          ],
          else: [
            {
              kind: 'if',
              cond: bin('>', v('key'), call('bst_value', [v('node')])),
              then: [
                {
                  kind: 'expr-stmt',
                  phase: 'descend-right',
                  expr: call('bst_attach_right', [
                    v('node'),
                    call('bst_insert', [call('bst_right', [v('node')]), v('key')]),
                  ]),
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: v('node') },
      ] satisfies IRStmt[],
    },
    {
      name: 'bst_delete',
      params: [
        { name: 'node', type: tInt },
        { name: 'key', type: tInt },
      ],
      returnType: tInt,
      body: [
        {
          kind: 'if',
          cond: call('is_null', [v('node')]),
          then: [{ kind: 'return', expr: v('node') }],
        },
        {
          kind: 'if',
          phase: 'compare-node',
          cond: bin('<', v('key'), call('bst_value', [v('node')])),
          then: [
            {
              kind: 'expr-stmt',
              phase: 'descend-left',
              expr: call('bst_attach_left', [
                v('node'),
                call('bst_delete', [call('bst_left', [v('node')]), v('key')]),
              ]),
            },
          ],
          else: [
            {
              kind: 'if',
              cond: bin('>', v('key'), call('bst_value', [v('node')])),
              then: [
                {
                  kind: 'expr-stmt',
                  phase: 'descend-right',
                  expr: call('bst_attach_right', [
                    v('node'),
                    call('bst_delete', [call('bst_right', [v('node')]), v('key')]),
                  ]),
                },
              ],
              else: [
                {
                  kind: 'if',
                  phase: 'delete-start',
                  cond: call('is_null', [call('bst_left', [v('node')])]),
                  then: [
                    {
                      kind: 'return',
                      phase: 'delete-leaf',
                      expr: call('bst_right', [v('node')]),
                    },
                  ],
                  else: [
                    {
                      kind: 'if',
                      cond: call('is_null', [call('bst_right', [v('node')])]),
                      then: [
                        {
                          kind: 'return',
                          phase: 'delete-one-child',
                          expr: call('bst_left', [v('node')]),
                        },
                      ],
                      else: [
                        {
                          kind: 'var',
                          phase: 'delete-successor-descend',
                          name: 'successor',
                          type: tInt,
                          init: call('bst_min_node', [call('bst_right', [v('node')])]),
                        },
                        {
                          kind: 'expr-stmt',
                          phase: 'delete-value-move',
                          expr: call('bst_set_value', [
                            v('node'),
                            call('bst_value', [v('successor')]),
                          ]),
                        },
                        {
                          kind: 'expr-stmt',
                          expr: call('bst_attach_right', [
                            v('node'),
                            call('bst_delete', [
                              call('bst_right', [v('node')]),
                              call('bst_value', [v('successor')]),
                            ]),
                          ]),
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: v('node') },
      ] satisfies IRStmt[],
    },
  ],
};

export const bstIterativeIR: IR = {
  id: 'bst-iterative',
  algorithm: 'bst',
  paradigm: 'imperative',
  functions: [
    {
      name: 'bst_search_iter',
      params: [
        { name: 'root', type: tInt },
        { name: 'key', type: tInt },
      ],
      returnType: tBool,
      body: [
        { kind: 'var', name: 'node', type: tInt, init: v('root') },
        {
          kind: 'while',
          cond: bin('!=', v('node'), lit(0)),
          body: [
            {
              kind: 'if',
              phase: 'compare-node',
              cond: bin('==', v('key'), call('bst_value', [v('node')])),
              then: [{ kind: 'return', phase: 'hit', expr: lit(true) }],
            },
            {
              kind: 'if',
              cond: bin('<', v('key'), call('bst_value', [v('node')])),
              then: [
                {
                  kind: 'assign',
                  phase: 'descend-left',
                  target: v('node'),
                  expr: call('bst_left', [v('node')]),
                },
              ],
              else: [
                {
                  kind: 'assign',
                  phase: 'descend-right',
                  target: v('node'),
                  expr: call('bst_right', [v('node')]),
                },
              ],
            },
          ],
        },
        { kind: 'return', phase: 'reach-leaf-miss', expr: lit(false) },
      ] satisfies IRStmt[],
    },
  ],
};

export const bstIRs: IR[] = [bstRecursiveIR, bstIterativeIR];
