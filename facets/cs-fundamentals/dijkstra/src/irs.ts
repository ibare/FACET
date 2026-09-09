/**
 * 다익스트라 최단 경로 학습용 IR — 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def dijkstra(adj, wgt, src, dist, done):
 *       n = len(adj)                                  # phase: init
 *       INF = 1000000000                              # phase: init
 *       for i in range(n):                            # phase: init
 *           dist[i] = INF                             # phase: init
 *           done[i] = 0                               # phase: init
 *       dist[src] = 0                                 # phase: init
 *       for round_no in range(n):                         # phase: round-begin
 *           u = -1                                    # phase: round-begin
 *           best = INF                                # phase: round-begin
 *           for i in range(n):                        # phase: scan
 *               if done[i] == 0 and dist[i] < best:   # phase: scan
 *                   best = dist[i]                    # phase: pick-min
 *                   u = i                             # phase: pick-min
 *           if u == -1:                               # phase: stop-check
 *               break                                 # phase: stop-check
 *           done[u] = 1                               # phase: settle
 *           for k in range(len(adj[u])):              # phase: relax-check
 *               v = adj[u][k]                         # phase: relax-check
 *               w = wgt[u][k]                         # phase: relax-check
 *               if dist[u] + w < dist[v]:             # phase: relax-check
 *                   dist[v] = dist[u] + w             # phase: relax-apply
 *       return dist                                   # phase: return-dist
 *
 * ── 이름 붙인 호출이 하나도 없다
 *
 * 우선순위 큐를 쓰면 이 코드의 절반이 사라진다. `pq_pop_min()` 한 줄 뒤에는
 * "아직 확정되지 않은 것 중 가장 가까운 것" 을 **어떻게** 찾는지가 없다.
 * 그래서 고르는 일을 안쪽 반복문으로 펼쳐 썼다. `done[i] == 0 and dist[i] < best`
 * 라는 조건 한 줄이 다익스트라의 절반이며, 그것이 코드에 그대로 있어야 한다.
 *
 * 펼쳐 쓴 대가로 **판이 O(V²)** 라는 것도 코드에 드러난다 — 바깥 반복문이 n 번,
 * 그 안의 훑기가 다시 n 번이다. 우선순위 큐가 왜 더 빠른지는 글이 말한다
 * (`description.ts`). 코드가 말해야 하는 것은 무엇을 하는가이지 어떻게 하면
 * 빨라지는가가 아니다.
 *
 * 완화도 마찬가지다. `relax(u, v)` 로 감싸면 `dist[u] + w < dist[v]` 라는 비교와
 * `dist[v] = dist[u] + w` 라는 갱신 — 즉 "편다" 의 전부 — 가 이름 뒤로 숨는다.
 *
 * ── 왜 `dist` 와 `done` 이 인자인가
 *
 * IR 에는 배열을 새로 만드는 노드가 없다 (`IRExpr` 는 lit · var · index · len ·
 * binop · unop · call 뿐이다). 그래서 배열을 얻는 길은 둘뿐이다 — 인자로 받거나
 * `zeros(n)` 같은 이름 붙인 호출로 짓거나. 후자를 쓰면 `ir-interpreter` 가 그
 * 함수를 찾지 못해 **IR 을 실제로 돌려 답을 대조할 수 없다.** 코드 패널에 뜨는
 * 코드가 정말 도는 코드인지 아무도 재지 못하는 것이 이름 하나 줄이는 것보다
 * 비싸다고 봤다. C 계열에서 작업 배열을 밖에서 받는 것은 흔한 표기이기도 하고,
 * 맨 위 `for i in range(n)` 이 그 둘을 통째로 덮어써서 "무한대에서 시작하고
 * 아무것도 확정돼 있지 않다" 를 눈에 보이게 한다.
 *
 * ── INF 를 왜 십억으로 두는가
 *
 * `dist[u] + w` 를 셈할 때 u 가 무한대일 수 있다. 십억 + 무게 열넷은 여전히
 * 32비트 정수 안(약 21억)이라 자바 · C++ · C# 에서 넘치지 않는다. 넘치면
 * 음수가 되어 `dist[u] + w < dist[v]` 가 참이 되고, 닿지도 않은 곳에서 길이
 * 뻗어 나간다.
 *
 * 다만 이 판에서 `u == -1` 은 실제로 걸리지 않는다 — 사양의 그림이 이어져 있어
 * 여섯 정점이 모두 굳는다. 걸리지 않아도 `stop-check` 는 매 회 **판정된다**.
 * 알고리즘도 그 판정 자리에서 phase 를 보내므로 어휘 집합은 어긋나지 않는다 (C3).
 *
 * ── 이름 고르기
 *
 * 여섯 언어를 한꺼번에 통과하는 것으로 골랐다. `next` 는 파이썬 내장이고
 * `new` 는 넷의 예약어라 고른 정점을 `u`, 그 거리를 `best` 로 적었다. 이웃을
 * 훑는 자리는 `i` 가 이미 바깥 훑기에 쓰이므로 `k` 로 두었고, 그 자리가 가리키는
 * 이웃이 `v`, 그 간선의 무게가 `w` 다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'init' | 'round-begin' | 'scan' | 'pick-min' | 'stop-check' |
 *   'settle' | 'relax-check' | 'relax-apply' | 'return-dist'
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
  op: '+' | '-' | '<' | '==' | '&&',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** 무한대 대신 쓰는 큰 수. 32비트 정수 안에서 무게를 더해도 넘치지 않는다. */
const INF_VALUE = 1000000000;

/** `dist[i]` — 훑는 자리의 잠정 거리. */
const distAtI = idx(v('dist'), v('i'));
/** `dist[u]` — 이번에 굳힌 정점까지의 거리. 굳은 뒤로는 바뀌지 않는다. */
const distAtU = idx(v('dist'), v('u'));
/** `dist[v]` — 펴려는 이웃의 지금 잠정 거리. */
const distAtV = idx(v('dist'), v('v'));
/** `dist[u] + w` — u 를 거쳐 v 로 가는 길의 길이. */
const throughU = bin('+', distAtU, v('w'));

/** 안쪽 훑기 — 아직 확정되지 않은 것 중 가장 가까운 것을 고른다. */
const scanForMin: IRStmt = {
  kind: 'for-range',
  phase: 'scan',
  var: 'i',
  from: lit(0),
  to: v('n'),
  inclusive: false,
  body: [
    {
      kind: 'if',
      phase: 'scan',
      cond: bin('&&', bin('==', idx(v('done'), v('i')), lit(0)), bin('<', distAtI, v('best'))),
      then: [
        { kind: 'assign', phase: 'pick-min', target: v('best'), expr: distAtI },
        { kind: 'assign', phase: 'pick-min', target: v('u'), expr: v('i') },
      ],
    },
  ],
};

/** 굳힌 정점의 둘레를 편다 — 이웃마다 더 짧은 길이 열렸는지 본다. */
const relaxNeighbors: IRStmt = {
  kind: 'for-range',
  phase: 'relax-check',
  var: 'k',
  from: lit(0),
  to: len(idx(v('adj'), v('u'))),
  inclusive: false,
  body: [
    {
      kind: 'var',
      phase: 'relax-check',
      name: 'v',
      type: tInt,
      init: idx(idx(v('adj'), v('u')), v('k')),
    },
    {
      kind: 'var',
      phase: 'relax-check',
      name: 'w',
      type: tInt,
      init: idx(idx(v('wgt'), v('u')), v('k')),
    },
    {
      kind: 'if',
      phase: 'relax-check',
      cond: bin('<', throughU, distAtV),
      then: [{ kind: 'assign', phase: 'relax-apply', target: distAtV, expr: throughU }],
    },
  ],
};

export const dijkstraSettleIR: IR = {
  id: 'dijkstra-settle',
  algorithm: 'dijkstra',
  paradigm: 'imperative',
  functions: [
    {
      name: 'dijkstra',
      params: [
        { name: 'adj', type: tIntGrid },
        { name: 'wgt', type: tIntGrid },
        { name: 'src', type: tInt },
        { name: 'dist', type: tIntList },
        { name: 'done', type: tIntList },
      ],
      returnType: tIntList,
      body: [
        { kind: 'var', phase: 'init', name: 'n', type: tInt, init: len(v('adj')) },
        { kind: 'var', phase: 'init', name: 'INF', type: tInt, init: lit(INF_VALUE) },
        {
          kind: 'for-range',
          phase: 'init',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            { kind: 'assign', phase: 'init', target: distAtI, expr: v('INF') },
            { kind: 'assign', phase: 'init', target: idx(v('done'), v('i')), expr: lit(0) },
          ],
        },
        { kind: 'assign', phase: 'init', target: idx(v('dist'), v('src')), expr: lit(0) },
        {
          kind: 'for-range',
          phase: 'round-begin',
          var: 'round_no',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            { kind: 'var', phase: 'round-begin', name: 'u', type: tInt, init: lit(-1) },
            { kind: 'var', phase: 'round-begin', name: 'best', type: tInt, init: v('INF') },
            scanForMin,
            {
              kind: 'if',
              phase: 'stop-check',
              cond: bin('==', v('u'), lit(-1)),
              then: [{ kind: 'break', phase: 'stop-check' }],
            },
            { kind: 'assign', phase: 'settle', target: idx(v('done'), v('u')), expr: lit(1) },
            relaxNeighbors,
          ],
        },
        { kind: 'return', phase: 'return-dist', expr: v('dist') },
      ],
    },
  ],
};

export const dijkstraIRs: IR[] = [dijkstraSettleIR];
