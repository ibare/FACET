/**
 * 프림 — 최소 신장 트리를 한 나무로 키우는 학습용 IR. 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def prim(w, start, key, parent, inTree):
 *       n = len(w)                                            # phase: setup
 *       INF = 1000000000                                      # phase: setup
 *       for v in range(0, n):                                 # phase: setup
 *           key[v] = INF                                      # phase: setup
 *           parent[v] = -1                                    # phase: setup
 *           inTree[v] = 0                                     # phase: setup
 *       key[start] = 0                                        # phase: setup
 *       total = 0                                             # phase: setup
 *       for round in range(0, n):                             # phase: scan
 *           u = -1                                            # phase: scan
 *           for v in range(0, n):                             # phase: scan
 *               if inTree[v] == 0 and (u == -1 or key[v] < key[u]):   # phase: scan
 *                   u = v                                     # phase: scan
 *           inTree[u] = 1                                     # phase: attach
 *           total = total + key[u]                            # phase: attach
 *           for v in range(0, n):                             # phase: offer
 *               if w[u][v] > 0 and inTree[v] == 0 and w[u][v] < key[v]:  # phase: offer
 *                   key[v] = w[u][v]                          # phase: offer
 *                   parent[v] = u                             # phase: offer
 *       return total                                          # phase: done
 *
 * ── 왜 우선순위 큐가 없는가
 *
 * 이 코드의 존재 이유는 다익스트라 옆에 놓이는 것이다. 힙을 쓰면 그 대비가
 * 자료구조 뒤로 숨는다. `key` 배열을 두고 매 회 "나무 밖에서 key 가 가장 작은
 * 것" 을 반복문으로 훑으면, 둘의 차이가 **한 줄**로 남는다.
 *
 *   if w[u][v] > 0 and inTree[v] == 0 and w[u][v] < key[v]:   ← 프림
 *   if dist[u] + w[u][v] < dist[v]:                           ← 다익스트라
 *
 * 프림은 **나무에서 그 정점까지의 간선 하나**의 무게를 재고, 다익스트라는
 * **출발점에서의 누적 거리**를 잰다. `dist[u] +` 가 있느냐 없느냐가 최소 신장
 * 트리와 최단 경로를 가른다. 훑어서 고르는 바깥 반복문은 두 알고리즘이 글자까지
 * 같다 — 그래서 그 자리에 힙을 넣지 않았다.
 *
 * ── 이름 붙인 호출이 하나도 없다
 *
 * transpiler 여섯은 `call` 을 `fn(args)` 로 **그대로** 낸다. 그래서 IR 에
 * `zeros(n)` 을 두면 파이썬에도 자바에도 C++ 에도 없는 이름이 코드 패널에
 * 뜨고, 갈려 나온 여섯 코드가 그 언어에서 돌지 않는다. 완제품의 값이 "IR 하나가
 * 여섯 언어로 갈리는 것" 인데 갈려 나온 것이 돌지 않으면 그 값이 깎인다.
 *
 * 그래서 작업 배열 셋 — `key` · `parent` · `inTree` — 을 **인자로 받는다.**
 * 자리는 밖에서 오지만 채우는 일은 코드 안에 그대로 남는다:
 *
 *   for v in range(0, n):
 *       key[v] = INF
 *       parent[v] = -1
 *       inTree[v] = 0
 *
 * 이 세 줄이 "처음엔 아무 데도 닿지 못했고, 아직 나무에 든 것도 없다" 를 말한다.
 * 배열 만들기를 호출로 감쌌으면 이 초기 상태가 코드 패널에서 사라졌을 것이다.
 * 같은 배치의 그래프 완제품들(dijkstra · bellman-ford · floyd-warshall ·
 * topological-sort · kruskal-mst)이 모두 이 모양이다.
 *
 * 서명은 **데이터가 먼저다** — `prim(w, start, key, parent, inTree)`. 작업 배열을
 * 앞에 두면 "표를 받아 첫 줄부터 덮어쓰는 함수" 로 읽힌다.
 *
 * 인접행렬 `w` 도 인자다. `w[u][v] > 0` 이 "간선이 있다" 이고, 이 자료의 무게가
 * 전부 양수라 0 이 빈칸 노릇을 한다. 이 한 식이 이웃 판정과 무게 읽기를 동시에
 * 하므로 `neighbor_at(u, i)` 같은 호출로 감싸지 않았다.
 *
 * ── `parent` 는 죽은 변수가 아니다
 *
 * 함수가 돌려주는 것은 무게 합 하나(39)지만, 실제로 만들어진 나무는 `parent` 에
 * 남는다. `parent[v]` 는 "정점 v 를 나무에 붙인 간선의 반대쪽 끝" 이고, 그것이
 * 곧 최소 신장 트리의 간선 목록이다. 화면이 어느 간선을 굵게 그릴지 아는 근거가
 * 이 두 줄이라, 값을 돌려주지 않는다고 지우면 코드 패널이 그림을 설명하지
 * 못한다.
 *
 * ── 동점 규칙
 *
 * 이 자료는 같은 무게가 여러 번 나온다 (7 이 둘, 5 가 둘, 9 가 둘).
 * `key[v] < key[u]` 가 **엄격 부등호**라 먼저 만난 쪽이 이긴다 — 훑기가 0 부터
 * 오르므로 **동점이면 번호가 작은 정점**이 붙는다. `algorithm.ts` 의 훑기도
 * 같은 순서로 돌고 같은 부등호를 쓴다. 규칙이 코드와 화면에서 갈리면 화면이
 * 거짓을 말한다.
 *
 * 다만 이 자료에서는 같은 무게가 **한 회에서 맞붙지 않는다.** 부등호를 `<=` 로
 * 바꿔도 답이 그대로라는 것을 검사가 재고 있다 — 규칙은 다른 그래프를 위한
 * 것이고, 이 그래프의 최소 신장 트리는 하나뿐이다.
 *
 * ── 마지막 회
 *
 * 바깥 반복은 정점 수 n 만큼 돈다. 첫 회는 출발점을 붙이는데 `key[start]` 가 0
 * 이라 무게 합이 늘지 않고, 나머지 n-1 회가 간선 하나씩을 더한다. 그래서
 * 예외 분기 없이 `total = total + key[u]` 한 줄이면 된다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'setup' | 'scan' | 'attach' | 'offer' | 'done'
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
  op: '+' | '-' | '<' | '>' | '==' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** `w[u][v]` — 지금 나무 안의 u 에서 바깥의 v 로 나가는 간선의 무게. 0 이면 간선 없음. */
const edgeUV = idx(idx(v('w'), v('u')), v('v'));

/** `key[v]` — 나무에서 정점 v 까지 지금까지 알아낸 가장 가벼운 간선 하나의 무게. */
const keyV = idx(v('key'), v('v'));
/** `key[u]` — 지금까지 찾은 후보 중 가장 가벼운 것. */
const keyU = idx(v('key'), v('u'));

export const primGrowIR: IR = {
  id: 'prim-grow',
  algorithm: 'primMst',
  paradigm: 'imperative',
  functions: [
    {
      name: 'prim',
      params: [
        { name: 'w', type: tIntGrid },
        { name: 'start', type: tInt },
        { name: 'key', type: tIntList },
        { name: 'parent', type: tIntList },
        { name: 'inTree', type: tIntList },
      ],
      returnType: tInt,
      body: [
        { kind: 'var', phase: 'setup', name: 'n', type: tInt, init: len(v('w')) },
        { kind: 'var', phase: 'setup', name: 'INF', type: tInt, init: lit(1000000000) },
        {
          kind: 'for-range',
          phase: 'setup',
          var: 'v',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            { kind: 'assign', phase: 'setup', target: keyV, expr: v('INF') },
            {
              kind: 'assign',
              phase: 'setup',
              target: idx(v('parent'), v('v')),
              expr: { kind: 'unop', op: '-', x: lit(1) },
            },
            {
              kind: 'assign',
              phase: 'setup',
              target: idx(v('inTree'), v('v')),
              expr: lit(0),
            },
          ],
        },
        {
          kind: 'assign',
          phase: 'setup',
          target: idx(v('key'), v('start')),
          expr: lit(0),
        },
        { kind: 'var', phase: 'setup', name: 'total', type: tInt, init: lit(0) },
        {
          kind: 'for-range',
          phase: 'scan',
          var: 'round',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'var',
              phase: 'scan',
              name: 'u',
              type: tInt,
              init: { kind: 'unop', op: '-', x: lit(1) },
            },
            {
              kind: 'for-range',
              phase: 'scan',
              var: 'v',
              from: lit(0),
              to: v('n'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  phase: 'scan',
                  cond: bin(
                    '&&',
                    bin('==', idx(v('inTree'), v('v')), lit(0)),
                    bin(
                      '||',
                      bin('==', v('u'), { kind: 'unop', op: '-', x: lit(1) }),
                      bin('<', keyV, keyU),
                    ),
                  ),
                  then: [{ kind: 'assign', phase: 'scan', target: v('u'), expr: v('v') }],
                },
              ],
            },
            {
              kind: 'assign',
              phase: 'attach',
              target: idx(v('inTree'), v('u')),
              expr: lit(1),
            },
            {
              kind: 'assign',
              phase: 'attach',
              target: v('total'),
              expr: bin('+', v('total'), keyU),
            },
            {
              kind: 'for-range',
              phase: 'offer',
              var: 'v',
              from: lit(0),
              to: v('n'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  phase: 'offer',
                  cond: bin(
                    '&&',
                    bin(
                      '&&',
                      bin('>', edgeUV, lit(0)),
                      bin('==', idx(v('inTree'), v('v')), lit(0)),
                    ),
                    bin('<', edgeUV, keyV),
                  ),
                  then: [
                    { kind: 'assign', phase: 'offer', target: keyV, expr: edgeUV },
                    {
                      kind: 'assign',
                      phase: 'offer',
                      target: idx(v('parent'), v('v')),
                      expr: v('u'),
                    },
                  ],
                },
              ],
            },
          ],
        },
        { kind: 'return', phase: 'done', expr: v('total') },
      ] satisfies IRStmt[],
    },
  ],
};

export const primMstIRs: IR[] = [primGrowIR];
