/**
 * 벨만-포드 완화 반복의 학습용 IR — 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def bellman_ford(edge_from, edge_to, weight, dist, source):
 *       n = len(dist)                                    # phase: setup
 *       m = len(weight)                                  # phase: setup
 *       INF = 1000000000                                 # phase: setup
 *       for i in range(0, n):                            # phase: setup
 *           dist[i] = INF                                # phase: setup
 *       dist[source] = 0                                 # phase: setup
 *       for pass_no in range(1, n - 1 + 1):              # phase: pass
 *           for e in range(0, m):                        # phase: inspect
 *               u = edge_from[e]                         # phase: inspect
 *               v = edge_to[e]                           # phase: inspect
 *               w = weight[e]                            # phase: inspect
 *               if dist[u] != INF and dist[u] + w < dist[v]:   # phase: inspect
 *                   dist[v] = dist[u] + w                # phase: relax
 *       for e in range(0, m):                            # phase: final-check
 *           u = edge_from[e]                             # phase: final-check
 *           v = edge_to[e]                               # phase: final-check
 *           w = weight[e]                                # phase: final-check
 *           if dist[u] != INF and dist[u] + w < dist[v]: # phase: final-check
 *               return True                              # phase: final-check
 *       return False                                     # phase: done
 *
 * ── 이름 붙인 호출이 하나도 없다
 *
 * 간선을 "정점별 이웃 목록" 이 아니라 **세 배열** (`edge_from` · `edge_to` ·
 * `weight`) 로 두었다. 그래서 안쪽 반복문이 그냥 간선 번호 `e` 를 훑고,
 * 완화 조건도 갱신식도 전부 펼쳐진 첨자 셈으로 남는다. `relax(u, v, w)` 로
 * 감싸면 "펴는 일이란 윗값 + 무게가 아랫값보다 작으면 아랫값을 그것으로
 * 바꾸는 것" 이라는 사실이 코드에서 사라진다 — 이 알고리즘은 그 한 줄이
 * 전부다.
 *
 * `zeros(n)` 같은 배열 만들기조차 쓰지 않았다. IR 에는 배열을 만드는 노드가
 * 없어서 그것만은 이름 붙인 호출이 될 수밖에 없는데, 그러면 (1) 이 사양이
 * 금한 named call 이 하나 생기고 (2) ir-interpreter 에는 그런 내장 함수가
 * 없어 IR 이 실행 불가능해진다. 그래서 **거리표를 밖에서 받는다.** 여섯 언어
 * 모두 리스트/배열을 참조로 넘기므로 (C++ 만 `std::vector<int>&` 로 명시,
 * 나머지는 원래 참조) 호출한 쪽이 채워진 `dist` 를 그대로 본다.
 * `n = len(dist)` 이라 **거리표의 길이가 곧 정점 수** 이기도 하다.
 *
 * ── 반환값은 음수 고리 여부다
 *
 * n-1 바퀴를 돌고 나서 **한 바퀴를 더** 돈다. 거기서 또 줄어드는 간선이 하나라도
 * 있으면 아무리 돌아도 끝나지 않는다는 뜻이므로 `true` 를 낸다. 이 검사가 없으면
 * 그냥 느린 완화 반복문이지 벨만-포드가 아니다. 그래서 마지막 반복문은 앞의 것과
 * 조건이 글자 하나 다르지 않게 같고, 다른 것은 **줄이는 대신 알린다** 는 점뿐이다.
 * 코드 패널에서 두 반복문을 나란히 보는 것이 이 알고리즘을 설명한다.
 *
 * ── 무한대
 *
 * `INF = 1000000000`. 언어마다 무한대 표기가 갈리고 (`float('inf')` ·
 * `Integer.MAX_VALUE` · `INT_MAX`) 정수 표에 실수를 섞으면 타입이 흐려지므로
 * 32비트 정수에 넉넉히 들어가는 큰 값 하나로 둔다. 그리고 `dist[u] != INF` 를
 * 앞세워 **아직 닿지 않은 정점에서는 펴지 않는다** — 이것을 빠뜨리면
 * `INF + w` 가 `INF` 보다 작아져 닿지도 않은 곳에서 거리가 새어 나온다.
 *
 * ── 이름 고르기
 *
 * `from` 은 파이썬 예약어라 `edge_from` / `edge_to` 로 갈랐다. 바퀴 번호는
 * `pass` 가 파이썬 예약어라 `pass_no`. `u` · `v` · `w` 는 이 분야에서 원어
 * 그대로 통용되는 표기라 줄이지 않고 그대로 둔다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'setup' | 'pass' | 'inspect' | 'relax' | 'final-check' | 'done'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tBool: IRType = { kind: 'bool' };
const tIntList: IRType = { kind: 'list', of: tInt };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | boolean): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** `dist[u]` — 간선의 꼬리까지 지금까지 안 거리. */
const distU = idx(v('dist'), v('u'));
/** `dist[v]` — 간선의 머리까지 지금까지 안 거리. */
const distV = idx(v('dist'), v('v'));
/** `dist[u] + w` — 이 간선을 타고 갔을 때의 거리. */
const throughEdge = bin('+', distU, v('w'));
/**
 * `dist[u] != INF && dist[u] + w < dist[v]`
 *
 * 완화 조건. 앞 절은 "꼬리에 아직 못 닿았으면 펴지 않는다", 뒤 절은
 * "이 간선을 타면 더 짧은가". 마지막 한 바퀴도 **같은 조건** 을 쓴다.
 */
const relaxable = bin('&&', bin('!=', distU, v('INF')), bin('<', throughEdge, distV));

/** 간선 하나를 꺼내 `u` · `v` · `w` 로 펼치는 세 줄. 두 반복문이 같은 셋을 쓴다. */
const unpackEdge = (phase: string): IRStmt[] => [
  { kind: 'var', phase, name: 'u', type: tInt, init: idx(v('edge_from'), v('e')) },
  { kind: 'var', phase, name: 'v', type: tInt, init: idx(v('edge_to'), v('e')) },
  { kind: 'var', phase, name: 'w', type: tInt, init: idx(v('weight'), v('e')) },
];

export const bellmanFordRelaxIR: IR = {
  id: 'bellman-ford-relax',
  algorithm: 'bellmanFord',
  paradigm: 'imperative',
  functions: [
    {
      name: 'bellman_ford',
      params: [
        { name: 'edge_from', type: tIntList },
        { name: 'edge_to', type: tIntList },
        { name: 'weight', type: tIntList },
        { name: 'dist', type: tIntList },
        { name: 'source', type: tInt },
      ],
      returnType: tBool,
      body: [
        { kind: 'var', phase: 'setup', name: 'n', type: tInt, init: len(v('dist')) },
        { kind: 'var', phase: 'setup', name: 'm', type: tInt, init: len(v('weight')) },
        { kind: 'var', phase: 'setup', name: 'INF', type: tInt, init: lit(1000000000) },
        {
          kind: 'for-range',
          phase: 'setup',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            { kind: 'assign', phase: 'setup', target: idx(v('dist'), v('i')), expr: v('INF') },
          ],
        },
        { kind: 'assign', phase: 'setup', target: idx(v('dist'), v('source')), expr: lit(0) },
        {
          // 정점 수보다 한 번 적게 돈다. 가장 긴 최단 경로도 간선 n-1 개를 넘지
          // 않으므로, 한 바퀴에 적어도 한 겹씩은 확정된다.
          kind: 'for-range',
          phase: 'pass',
          var: 'pass_no',
          from: lit(1),
          to: bin('-', v('n'), lit(1)),
          inclusive: true,
          body: [
            {
              kind: 'for-range',
              phase: 'inspect',
              var: 'e',
              from: lit(0),
              to: v('m'),
              inclusive: false,
              body: [
                ...unpackEdge('inspect'),
                {
                  kind: 'if',
                  phase: 'inspect',
                  cond: relaxable,
                  then: [
                    { kind: 'assign', phase: 'relax', target: distV, expr: throughEdge },
                  ],
                },
              ],
            },
          ],
        },
        {
          // 한 바퀴 더. 여기서도 줄어드는 간선이 있으면 음수 고리가 있다.
          kind: 'for-range',
          phase: 'final-check',
          var: 'e',
          from: lit(0),
          to: v('m'),
          inclusive: false,
          body: [
            ...unpackEdge('final-check'),
            {
              kind: 'if',
              phase: 'final-check',
              cond: relaxable,
              then: [{ kind: 'return', phase: 'final-check', expr: lit(true) }],
            },
          ],
        },
        { kind: 'return', phase: 'done', expr: lit(false) },
      ] satisfies IRStmt[],
    },
  ],
};

export const bellmanFordIRs: IR[] = [bellmanFordRelaxIR];
