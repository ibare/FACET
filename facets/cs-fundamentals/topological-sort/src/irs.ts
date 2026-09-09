/**
 * 칸(Kahn) 위상 정렬의 학습용 IR — 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def kahn(adj, indeg, queue, order):
 *       n = len(adj)                                # phase: count-indegree
 *       for u in range(n):                          # phase: count-indegree
 *           for i in range(len(adj[u])):            # phase: count-indegree
 *               v = adj[u][i]                       # phase: count-indegree
 *               indeg[v] = indeg[v] + 1             # phase: count-indegree
 *       head = 0                                    # phase: seed-queue
 *       tail = 0                                    # phase: seed-queue
 *       for u in range(n):                          # phase: seed-queue
 *           if indeg[u] == 0:                       # phase: seed-queue
 *               queue[tail] = u                     # phase: enqueue
 *               tail = tail + 1                     # phase: enqueue
 *       while head < tail:                          # phase: pop
 *           u = queue[head]                         # phase: pop
 *           order[head] = u                         # phase: emit-order
 *           head = head + 1                         # phase: pop
 *           for i in range(len(adj[u])):            # phase: relax
 *               v = adj[u][i]                       # phase: relax
 *               indeg[v] = indeg[v] - 1             # phase: relax
 *               if indeg[v] == 0:                   # phase: zero-reached
 *                   queue[tail] = v                 # phase: enqueue
 *                   tail = tail + 1                 # phase: enqueue
 *       if head < n:                                # phase: cycle-check
 *           return -1                               # phase: cycle-check
 *       return head                                 # phase: done
 *
 * ── 큐를 감추지 않는다
 *
 * `queue_push` / `queue_pop` 으로 감싸면 이 알고리즘에서 볼 것이 절반으로 준다.
 * 배열 하나와 `head` · `tail` 두 색인이 전부이며, 그 둘이 어긋나는 폭
 * (`head < tail`) 이 곧 "아직 꺼낼 것이 남았다" 는 말이다. 펼쳐 쓰면 큐가
 * 무엇인지도 코드에 함께 드러난다.
 *
 * `head` 는 두 가지 일을 겸한다 — 다음에 꺼낼 자리이면서 **지금까지 꺼낸 개수**
 * 이기도 하다. 그래서 `order[head] = u` 로 결과의 자리가 정해지고, 마지막
 * `if head < n` 이 곧 고리 판정이 된다. 셈을 세는 변수를 따로 두면 이 사실이
 * 코드에서 사라진다.
 *
 * ── 이름 붙인 호출이 하나도 없다
 *
 * 다른 IR 들은 배열을 만들 때 `zeros(n)` 을 쓴다. 여기서는 쓰지 않았다.
 * IR 에는 배열을 만드는 노드가 없어서 `zeros` 는 어느 언어에도 없는 이름을
 * 그대로 뱉는 자리 표시일 뿐이고, 그러면 `@ffacet/ir-interpreter` 가 IR 을
 * 실행할 수 없다 (인터프리터는 `ir.functions` 안의 함수만 부른다). 코드 패널이
 * 보여 주는 코드와 검사가 실제로 돌리는 코드가 갈리는 것이 배열 만들기 한 줄을
 * 아끼는 것보다 비싸다.
 *
 * 그래서 세 벌의 작업 배열을 **매개변수로 끌어올렸다**. `indeg` · `queue` ·
 * `order` 는 길이 n 의 0 으로 채운 배열로 들어온다 — 부르는 쪽이 마련한다.
 * 잡일을 감춘 것이 아니라 함수 경계 밖으로 민 것이라, 함수 안의 모든 줄은
 * 여섯 언어에서 그대로 도는 진짜 코드다.
 *
 * ── 정점 수는 어디서 오는가
 *
 * `n = len(adj)` 다. 인접 목록은 정점마다 한 줄이므로 줄 수가 곧 정점 수다.
 * 따로 `n` 을 받으면 `adj` 와 어긋날 수 있는 값이 하나 더 생긴다.
 *
 * ── 어느 것을 먼저 꺼내는가
 *
 * 큐는 FIFO 다. 처음에 정점 번호가 작은 것부터 훑어 넣고 (`for u in range(n)`),
 * 인접 목록도 번호 오름차순이라, 이 그래프에서는 꺼내는 차례가 번호 오름차순과
 * 같아진다 (0 · 1 · 2 · 3 · 4 · 5). 일반적으로 FIFO 가 번호 순을 보장하지는
 * 않는다 — 그것까지 맞추려면 큐가 아니라 최소 힙이어야 하고, 그러면 이 facet 이
 * 말하려는 "배열 + 머리·꼬리" 가 사라진다.
 *
 * ── 2차원 배열
 *
 * `adj` 의 타입은 `{ kind: 'list', of: { kind: 'list', of: int } }` 이고
 * `adj[u][i]` 는 `index` 노드 둘의 중첩이다. 여섯 언어가 각자의 표기로 옮긴다 —
 * `int[][]` (Java · C#) · `std::vector<std::vector<int>>` (C++) · `number[][]`
 * (TypeScript) · 표기 없음 (Python · JavaScript).
 *
 * ── 이름 고르기
 *
 * `queue` 는 여섯 언어 어디에서도 예약어가 아니다 (C++ 은 `std::queue` 가 있지만
 * transpiler 가 `using namespace std` 를 쓰지 않는다). `in` 은 파이썬 · C# 의
 * 예약어라 들어오는 화살 수는 `indeg` 로 적었다. 훑는 자리는 `i`, 꺼낸 정점은
 * `u`, 그 뒤를 따르는 정점은 `v` — 그래프 코드의 관용을 그대로 둔다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'count-indegree' | 'seed-queue' | 'enqueue' | 'pop' | 'emit-order' |
 *   'relax' | 'zero-reached' | 'cycle-check' | 'done'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tIntList: IRType = { kind: 'list', of: tInt };
const tIntGrid: IRType = { kind: 'list', of: tIntList };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** `adj[u]` — u 에서 나가는 화살이 닿는 정점들. */
const rowOfU = idx(v('adj'), v('u'));
/** `indeg[v]` — v 로 들어오는, 아직 지워지지 않은 화살의 수. */
const indegOfV = idx(v('indeg'), v('v'));
/** `queue[tail]` — 줄의 끝. 새로 떨어져 나온 것이 여기 놓인다. */
const queueTail = idx(v('queue'), v('tail'));

/**
 * `queue[tail] = x; tail = tail + 1` — 줄의 끝에 하나 놓고 꼬리를 민다.
 *
 * 두 줄이 두 곳(처음 훑을 때 · 0 이 되었을 때)에 똑같이 나오므로 여기서 한 번
 * 만든다. IR 함수로 감싸지 않는 이유는 위 머리말에 적었다 — 감추면 큐가 배열과
 * 색인 둘로 되어 있다는 사실이 코드에서 사라진다.
 */
const pushTail = (x: IRExpr): IRStmt[] => [
  { kind: 'assign', phase: 'enqueue', target: queueTail, expr: x },
  { kind: 'assign', phase: 'enqueue', target: v('tail'), expr: bin('+', v('tail'), lit(1)) },
];

export const topologicalKahnIR: IR = {
  id: 'topological-kahn',
  algorithm: 'topologicalSort',
  paradigm: 'imperative',
  functions: [
    {
      name: 'kahn',
      params: [
        // 인접 목록. adj[u] 는 u 에서 나가는 화살이 닿는 정점 번호들.
        { name: 'adj', type: tIntGrid },
        // 아래 셋은 길이 n 의 0 배열로 들어온다 (부르는 쪽이 마련한다).
        { name: 'indeg', type: tIntList },
        { name: 'queue', type: tIntList },
        { name: 'order', type: tIntList },
      ],
      returnType: tInt,
      body: [
        { kind: 'var', phase: 'count-indegree', name: 'n', type: tInt, init: len(v('adj')) },

        // ── 들어오는 화살을 센다. 화살 하나마다 닿는 쪽의 수가 하나 는다.
        {
          kind: 'for-range',
          phase: 'count-indegree',
          var: 'u',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'for-range',
              phase: 'count-indegree',
              var: 'i',
              from: lit(0),
              to: len(rowOfU),
              inclusive: false,
              body: [
                {
                  kind: 'var',
                  phase: 'count-indegree',
                  name: 'v',
                  type: tInt,
                  init: idx(rowOfU, v('i')),
                },
                {
                  kind: 'assign',
                  phase: 'count-indegree',
                  target: indegOfV,
                  expr: bin('+', indegOfV, lit(1)),
                },
              ],
            },
          ],
        },

        // ── 큐는 배열 하나와 색인 둘이다. head 는 다음에 꺼낼 자리,
        //    tail 은 다음에 놓을 자리. 둘이 같으면 줄이 비어 있다.
        { kind: 'var', phase: 'seed-queue', name: 'head', type: tInt, init: lit(0) },
        { kind: 'var', phase: 'seed-queue', name: 'tail', type: tInt, init: lit(0) },
        {
          kind: 'for-range',
          phase: 'seed-queue',
          var: 'u',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              phase: 'seed-queue',
              cond: bin('==', idx(v('indeg'), v('u')), lit(0)),
              then: pushTail(v('u')),
            },
          ],
        },

        // ── 하나 꺼낼 때마다 그 뒤를 따르는 것들의 수가 하나씩 준다.
        {
          kind: 'while',
          phase: 'pop',
          cond: bin('<', v('head'), v('tail')),
          body: [
            { kind: 'var', phase: 'pop', name: 'u', type: tInt, init: idx(v('queue'), v('head')) },
            // head 는 꺼낸 개수이기도 하므로 결과에서의 자리가 그대로 head 다.
            { kind: 'assign', phase: 'emit-order', target: idx(v('order'), v('head')), expr: v('u') },
            { kind: 'assign', phase: 'pop', target: v('head'), expr: bin('+', v('head'), lit(1)) },
            {
              kind: 'for-range',
              phase: 'relax',
              var: 'i',
              from: lit(0),
              to: len(rowOfU),
              inclusive: false,
              body: [
                { kind: 'var', phase: 'relax', name: 'v', type: tInt, init: idx(rowOfU, v('i')) },
                {
                  kind: 'assign',
                  phase: 'relax',
                  target: indegOfV,
                  expr: bin('-', indegOfV, lit(1)),
                },
                {
                  kind: 'if',
                  phase: 'zero-reached',
                  cond: bin('==', indegOfV, lit(0)),
                  then: pushTail(v('v')),
                },
              ],
            },
          ],
        },

        // ── 꺼낸 수가 정점 수에 못 미치면 고리가 남아 있다는 뜻이다.
        //    남은 것들은 서로가 서로를 막고 있어 영영 0 이 되지 않는다.
        {
          kind: 'if',
          phase: 'cycle-check',
          cond: bin('<', v('head'), v('n')),
          then: [{ kind: 'return', phase: 'cycle-check', expr: lit(-1) }],
        },
        { kind: 'return', phase: 'done', expr: v('head') },
      ],
    },
  ],
};

export const topologicalSortIRs: IR[] = [topologicalKahnIR];
