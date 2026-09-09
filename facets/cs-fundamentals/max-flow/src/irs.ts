/**
 * 에드몬즈-카프 최대 유량 IR — 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def max_flow(cap, source, sink, parent, queue):
 *       n = len(cap)                                   # phase: setup
 *       flow = 0                                       # phase: setup
 *       while True:                                    # phase: reset-search
 *           for i in range(n):                         # phase: reset-search
 *               parent[i] = -1                         # phase: reset-search
 *           parent[source] = source                    # phase: reset-search
 *           head = 0                                   # phase: reset-search
 *           tail = 0                                   # phase: reset-search
 *           queue[tail] = source                       # phase: reset-search
 *           tail = tail + 1                            # phase: reset-search
 *           while head < tail:                         # phase: bfs-pop
 *               u = queue[head]                        # phase: bfs-pop
 *               head = head + 1                        # phase: bfs-pop
 *               for w in range(n):                     # phase: probe-edge
 *                   if parent[w] == -1 and cap[u][w] > 0:   # phase: probe-edge
 *                       parent[w] = u                  # phase: discover
 *                       queue[tail] = w                # phase: discover
 *                       tail = tail + 1                # phase: discover
 *           if parent[sink] == -1:                     # phase: no-path
 *               break                                  # phase: no-path
 *           f = cap[parent[sink]][sink]                # phase: bottleneck
 *           v = sink                                   # phase: bottleneck
 *           while v != source:                         # phase: bottleneck
 *               u = parent[v]                          # phase: bottleneck
 *               if cap[u][v] < f:                      # phase: bottleneck
 *                   f = cap[u][v]                      # phase: bottleneck
 *               v = u                                  # phase: bottleneck
 *           v = sink                                   # phase: push-flow
 *           while v != source:                         # phase: push-flow
 *               u = parent[v]                          # phase: push-flow
 *               cap[u][v] = cap[u][v] - f              # phase: push-flow
 *               cap[v][u] = cap[v][u] + f              # phase: add-residual
 *               v = u                                  # phase: add-residual
 *           flow = flow + f                            # phase: accumulate
 *       return flow                                    # phase: done
 *
 * ── `cap[v][u] = cap[v][u] + f` 가 이 알고리즘의 전부다
 *
 * 흘린 만큼 반대 방향에 되돌릴 폭이 생긴다. 뒤에 찾은 길이 그 폭을 타면 앞서
 * 흘린 것이 밀려난다. 그 한 줄이 없으면 "더 찾을 길이 없다" 가 "최대에 닿았다"
 * 를 뜻하지 못한다. 그래서 `push(u, v, f)` 같은 이름으로 감싸지 않고 2차원 배열
 * 갱신 두 줄을 그대로 펼쳤다 — 코드 패널에서 `- f` 와 `+ f` 가 나란히 보이는
 * 것이 이 facet 이 말하려는 것 자체다.
 *
 * ── 이름 붙인 호출이 하나도 없다
 *
 * `zeros2(n, n)` 도 `min(a, b)` 도 쓰지 않았다.
 *
 * 배열은 전부 인자로 받는다 (`cap` · `parent` · `queue`). IR 에 배열 생성 노드가
 * 없어 `zeros2` 를 부르면 `ir-interpreter` 가 그 함수를 찾지 못해 IR 을 실제로
 * 돌려 보는 검증이 불가능해진다. 작업 배열을 부르는 쪽이 준비하는 형태는
 * 여섯 언어 모두에서 자연스럽다.
 *
 * 병목을 `min` 으로 접지 않은 것은 그것이 잡일이 아니라 알고리즘이기 때문이다 —
 * "경로를 거슬러 오르며 가장 좁은 관을 찾는다" 는 while + if 로 펼쳐야 보인다.
 *
 * ── 큐도 감싸지 않는다
 *
 * `queue.push(w)` / `queue.pop(0)` 는 언어마다 이름이 다르고, 무엇보다 그것을
 * 쓰면 "왜 깊이 우선이 아니라 너비 우선인가" 가 코드에서 사라진다. 배열 하나와
 * 머리(`head`) · 꼬리(`tail`) 색인 둘로 펼쳤다. `head` 가 앞에서 꺼내고 `tail`
 * 이 뒤에 붙이므로 먼저 발견한 것이 먼저 나온다 — 그래서 찾아지는 길이 언제나
 * 간선 수가 가장 적은 길이고, 그것이 에드몬즈-카프가 다항 시간인 까닭이다.
 * `head` 를 `tail - 1` 로 바꾸면 깊이 우선이 된다는 것도 이 형태라야 보인다.
 *
 * ── 방문 표시를 따로 두지 않는다
 *
 * `visited` 배열 대신 `parent[w] == -1` 로 판정한다. 출발점만 `parent[source]
 * = source` 로 미리 채워 두면 자기 자신으로 되돌아가지 않는다. 배열 하나가
 * 줄고, "부모가 정해졌다 = 이미 닿았다" 가 한 줄에 드러난다.
 *
 * ── 이름 고르기
 *
 * 여섯 언어를 한꺼번에 통과하는 것으로 골랐다. C# 은 바깥 블록에서 쓰는 이름을
 * 안쪽 블록이 다시 선언하면 컴파일이 막히므로 (CS0136), 너비 우선 탐색이 훑는
 * 이웃을 `v` 가 아니라 `w` 로 두어 경로를 거슬러 오르는 `v` 와 갈랐다. 그래서
 * 되돌릴 폭을 만드는 대목은 교과서 표기 그대로 `cap[v][u] = cap[v][u] + f` 로
 * 남는다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'setup' | 'reset-search' | 'bfs-pop' | 'probe-edge' | 'discover' |
 *   'no-path' | 'bottleneck' | 'push-flow' | 'add-residual' |
 *   'accumulate' | 'done'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tIntList: IRType = { kind: 'list', of: tInt };
const tIntGrid: IRType = { kind: 'list', of: tIntList };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | boolean): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const bin = (
  op: '+' | '-' | '<' | '>' | '==' | '!=' | '&&',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** `cap[u][w]` — 지금 훑는 이웃으로 가는 관에 남은 여유. */
const capUW = idx(idx(v('cap'), v('u')), v('w'));
/** `cap[u][v]` — 경로에서 앞 자리로부터 이 자리로 오는 관의 여유. */
const capUV = idx(idx(v('cap'), v('u')), v('v'));
/** `cap[v][u]` — 그 관의 반대 방향. 되돌릴 폭이 쌓이는 자리. */
const capVU = idx(idx(v('cap'), v('v')), v('u'));
/** `parent[sink]` — 도착점의 부모. -1 이면 이번 탐색은 길을 못 찾았다. */
const parentSink = idx(v('parent'), v('sink'));

const bfsBody: IRStmt[] = [
  { kind: 'var', phase: 'bfs-pop', name: 'u', type: tInt, init: idx(v('queue'), v('head')) },
  { kind: 'assign', phase: 'bfs-pop', target: v('head'), expr: bin('+', v('head'), lit(1)) },
  {
    kind: 'for-range',
    phase: 'probe-edge',
    var: 'w',
    from: lit(0),
    to: v('n'),
    inclusive: false,
    body: [
      {
        kind: 'if',
        phase: 'probe-edge',
        cond: bin(
          '&&',
          bin('==', idx(v('parent'), v('w')), lit(-1)),
          bin('>', capUW, lit(0)),
        ),
        then: [
          { kind: 'assign', phase: 'discover', target: idx(v('parent'), v('w')), expr: v('u') },
          { kind: 'assign', phase: 'discover', target: idx(v('queue'), v('tail')), expr: v('w') },
          { kind: 'assign', phase: 'discover', target: v('tail'), expr: bin('+', v('tail'), lit(1)) },
        ],
      },
    ],
  },
];

const roundBody: IRStmt[] = [
  // ── 지난 탐색의 흔적을 지운다. 부모가 정해졌는지가 곧 방문 표시다.
  {
    kind: 'for-range',
    phase: 'reset-search',
    var: 'i',
    from: lit(0),
    to: v('n'),
    inclusive: false,
    body: [
      { kind: 'assign', phase: 'reset-search', target: idx(v('parent'), v('i')), expr: lit(-1) },
    ],
  },
  { kind: 'assign', phase: 'reset-search', target: idx(v('parent'), v('source')), expr: v('source') },
  { kind: 'var', phase: 'reset-search', name: 'head', type: tInt, init: lit(0) },
  { kind: 'var', phase: 'reset-search', name: 'tail', type: tInt, init: lit(0) },
  { kind: 'assign', phase: 'reset-search', target: idx(v('queue'), v('tail')), expr: v('source') },
  { kind: 'assign', phase: 'reset-search', target: v('tail'), expr: bin('+', v('tail'), lit(1)) },

  // ── 너비 우선. head 가 앞에서 꺼내고 tail 이 뒤에 붙이므로 간선 수가 가장
  //    적은 길이 먼저 닿는다.
  { kind: 'while', phase: 'bfs-pop', cond: bin('<', v('head'), v('tail')), body: bfsBody },

  {
    kind: 'if',
    phase: 'no-path',
    cond: bin('==', parentSink, lit(-1)),
    then: [{ kind: 'break', phase: 'no-path' }],
  },

  // ── 병목. 경로를 거슬러 오르며 가장 좁은 관을 찾는다.
  {
    kind: 'var',
    phase: 'bottleneck',
    name: 'f',
    type: tInt,
    init: idx(idx(v('cap'), parentSink), v('sink')),
  },
  { kind: 'var', phase: 'bottleneck', name: 'v', type: tInt, init: v('sink') },
  {
    kind: 'while',
    phase: 'bottleneck',
    cond: bin('!=', v('v'), v('source')),
    body: [
      { kind: 'var', phase: 'bottleneck', name: 'u', type: tInt, init: idx(v('parent'), v('v')) },
      {
        kind: 'if',
        phase: 'bottleneck',
        cond: bin('<', capUV, v('f')),
        then: [{ kind: 'assign', phase: 'bottleneck', target: v('f'), expr: capUV }],
      },
      { kind: 'assign', phase: 'bottleneck', target: v('v'), expr: v('u') },
    ],
  },

  // ── 흘리고 되돌린다. 이 두 줄이 이 알고리즘의 전부다.
  { kind: 'assign', phase: 'push-flow', target: v('v'), expr: v('sink') },
  {
    kind: 'while',
    phase: 'push-flow',
    cond: bin('!=', v('v'), v('source')),
    body: [
      { kind: 'var', phase: 'push-flow', name: 'u', type: tInt, init: idx(v('parent'), v('v')) },
      { kind: 'assign', phase: 'push-flow', target: capUV, expr: bin('-', capUV, v('f')) },
      { kind: 'assign', phase: 'add-residual', target: capVU, expr: bin('+', capVU, v('f')) },
      { kind: 'assign', phase: 'add-residual', target: v('v'), expr: v('u') },
    ],
  },

  { kind: 'assign', phase: 'accumulate', target: v('flow'), expr: bin('+', v('flow'), v('f')) },
];

export const maxFlowEdmondsKarpIR: IR = {
  id: 'max-flow-edmonds-karp',
  algorithm: 'maxFlow',
  paradigm: 'imperative',
  functions: [
    {
      name: 'max_flow',
      params: [
        { name: 'cap', type: tIntGrid },
        { name: 'source', type: tInt },
        { name: 'sink', type: tInt },
        { name: 'parent', type: tIntList },
        { name: 'queue', type: tIntList },
      ],
      returnType: tInt,
      body: [
        { kind: 'var', phase: 'setup', name: 'n', type: tInt, init: len(v('cap')) },
        { kind: 'var', phase: 'setup', name: 'flow', type: tInt, init: lit(0) },
        { kind: 'while', phase: 'reset-search', cond: lit(true), body: roundBody },
        { kind: 'return', phase: 'done', expr: v('flow') },
      ],
    },
  ],
};

export const maxFlowIRs: IR[] = [maxFlowEdmondsKarpIR];
