/**
 * BFS 학습용 IR.
 *
 * 표현 코드 (Python-like 가짜코드 — 실제 emit 은 transpiler 가 언어별로 수행):
 *
 *   def bfs(source):
 *       mark_visited(source)
 *       set_distance(source, 0)
 *       queue_push(source)                         # phase: discover-layer
 *       while queue_size() > 0:                    # phase: layer-complete
 *           node = queue_pop()                     # phase: dequeue-node
 *           n = neighbor_count(node)
 *           for i in range(n):
 *               nb = neighbor_at(node, i)
 *               scan_edge(node, nb)                # phase: scan-neighbors
 *               if is_unvisited(nb):               # phase: discover-layer
 *                   mark_visited(nb)
 *                   set_distance(nb, distance_of(node) + 1)
 *                   queue_push(nb)
 *
 * phase 어휘는 algorithm.ts 의 emit('phase', ...) 와 동일해야 한다.
 * (C3: phase 어휘 동기화 — 'dequeue-node' / 'scan-neighbors' /
 *  'discover-layer' / 'layer-complete')
 *
 * IR 는 집합·맵·큐 같은 1차 자료구조를 타입으로 지원하지 않기에
 * BFS 의 자료구조 조작은 named call(queue_push / mark_visited / ...) 로
 * 추상화해 학습 가독성을 유지한다. 각 call 은 transpiler 가
 * `fn(args...)` 형태로 그대로 출력한다.
 */

import type { IR, IRExpr, IRStmt, IRType } from '@facet/core';

const tInt: IRType = { kind: 'int' };
const tVoid: IRType = { kind: 'void' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | string | boolean): IRExpr => ({ kind: 'lit', value });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (
  op: '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

export const bfsIterativeIR: IR = {
  id: 'bfs-iterative',
  algorithm: 'bfs',
  paradigm: 'imperative',
  functions: [
    {
      name: 'bfs',
      params: [{ name: 'source', type: tInt }],
      returnType: tVoid,
      body: [
        { kind: 'expr-stmt', expr: call('mark_visited', [v('source')]) },
        { kind: 'expr-stmt', expr: call('set_distance', [v('source'), lit(0)]) },
        {
          kind: 'expr-stmt',
          phase: 'discover-layer',
          expr: call('queue_push', [v('source')]),
        },
        {
          kind: 'while',
          phase: 'layer-complete',
          cond: bin('>', call('queue_size', []), lit(0)),
          body: [
            {
              kind: 'var',
              phase: 'dequeue-node',
              name: 'node',
              type: tInt,
              init: call('queue_pop', []),
            },
            {
              kind: 'var',
              name: 'n',
              type: tInt,
              init: call('neighbor_count', [v('node')]),
            },
            {
              kind: 'for-range',
              var: 'i',
              from: lit(0),
              to: v('n'),
              inclusive: false,
              body: [
                {
                  kind: 'var',
                  name: 'nb',
                  type: tInt,
                  init: call('neighbor_at', [v('node'), v('i')]),
                },
                {
                  kind: 'expr-stmt',
                  phase: 'scan-neighbors',
                  expr: call('scan_edge', [v('node'), v('nb')]),
                },
                {
                  kind: 'if',
                  phase: 'discover-layer',
                  cond: call('is_unvisited', [v('nb')]),
                  then: [
                    { kind: 'expr-stmt', expr: call('mark_visited', [v('nb')]) },
                    {
                      kind: 'expr-stmt',
                      expr: call('set_distance', [
                        v('nb'),
                        bin('+', call('distance_of', [v('node')]), lit(1)),
                      ]),
                    },
                    { kind: 'expr-stmt', expr: call('queue_push', [v('nb')]) },
                  ],
                },
              ],
            },
          ],
        },
      ] satisfies IRStmt[],
    },
  ],
};

export const bfsIRs: IR[] = [bfsIterativeIR];
