/**
 * 플로이드-워셜 학습용 IR — 함수 하나. 이름 붙인 호출이 **하나도 없다.**
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def floydWarshall(src, dst, cost, dist):
 *       n = len(dist)                                   # phase: build-table
 *       INF = 1000000000                                # phase: build-table
 *       for i in range(n):                              # phase: build-table
 *           for j in range(n):                          # phase: build-table
 *               if i == j:                              # phase: build-table
 *                   dist[i][j] = 0                      # phase: build-table
 *               else:
 *                   dist[i][j] = INF                    # phase: build-table
 *       for e in range(len(src)):                       # phase: add-edges
 *           dist[src[e]][dst[e]] = cost[e]              # phase: add-edges
 *       for k in range(n):                              # phase: pick-pivot
 *           for i in range(n):                          # phase: pick-pivot
 *               for j in range(n):                      # phase: pick-pivot
 *                   if i == j:                          # phase: probe
 *                       continue                        # phase: probe
 *                   if dist[i][k] + dist[k][j] < dist[i][j]:   # phase: probe
 *                       dist[i][j] = dist[i][k] + dist[k][j]   # phase: rewrite
 *       return dist                                     # phase: done
 *
 * ── 감싼 것이 없다
 *
 * `dist[i][k] + dist[k][j] < dist[i][j]` 가 이 알고리즘의 전부다. `through(i,k,j)`
 * 같은 것으로 감싸면 코드 패널이 할 말을 잃는다 — 가운데를 거쳐 가는 길이 두
 * 칸의 합이라는 사실, 그것과 지금 칸을 견준다는 사실이 전부 이름 뒤로 숨는다.
 * 그래서 완화 조건도 갱신식도 펼쳐 썼고, 두 식이 글자까지 같은 것도 그대로
 * 두었다 (합을 변수에 담아 두 번 쓰지 않았다 — 같은 식이 두 줄에 서 있는 것이
 * "물어보고 나서 그대로 옮겨 적는다" 는 뜻이다).
 *
 * 그 결과 `IRExpr` 중 `call` 이 한 번도 나오지 않는다. 2차원 색인
 * (`index` 안에 다시 `index`) 과 `binop` 만으로 알고리즘 전체가 선다.
 *
 * ── 표는 왜 매개변수인가
 *
 * IR 에는 배열을 새로 만드는 표현이 없다 (`IRExpr` 는 lit · var · index · len ·
 * binop · unop · call 뿐이다). 그래서 `zeros2(n, n)` 같은 이름 붙인 호출을
 * 쓰거나, 표를 밖에서 받거나 둘 중 하나인데 — 여기서는 받는 쪽을 골랐다.
 * `dist` 는 n×n 자리만 잡힌 표이고 안에 무엇이 들었는지는 상관없다. 첫 이중
 * 반복문이 전부 덮어쓴다.
 *
 * 덕분에 "자기 자신까지는 0, 나머지는 무한" 이라는 이 알고리즘의 시작 규약이
 * 코드 안에 남았다. `zeros2` 로 감쌌으면 그것이 호출 이름 뒤로 사라졌을 것이다.
 *
 * ── 무한을 어떻게 두는가
 *
 * `INF = 1000000000` — 큰 수 하나다. 더하기 전에 "둘 다 무한이 아닌가" 를 묻는
 * 줄은 **두지 않았다.** 두 무한의 합이 2×10^9 이라 32비트 정수 상한
 * (2,147,483,647) 을 넘지 않고, 어떤 칸도 INF 보다 커질 수 없으므로
 * `INF + INF < dist[i][j]` 는 결코 참이 되지 않는다. 즉 넘침도 없고 헛된
 * 갱신도 없다. 검사 줄은 이 크기에서 순수한 군더더기이고, 조건 한 줄이
 * 알고리즘의 전부인 코드에서 군더더기 한 줄은 값이 비싸다.
 *
 * 크기를 키우면 (예: 2^31-1) 이야기가 달라진다 — 그때는 검사 줄이 정직해진다.
 * 이 선택은 `description.ts` 에도 적어 두었다.
 *
 * ── 자기 자신 칸을 건너뛰는 까닭
 *
 * `dist[i][i]` 는 0 이고 이 그래프에 음수 무게가 없으므로 결코 줄지 않는다.
 * 답이 이미 정해진 자리 스물다섯(대각선 다섯 × 가운데 다섯)을 빼면 물음이
 * 125 에서 100 으로 준다. `continue` 두 줄이 그 사실을 코드에 남긴다.
 *
 * ── 이름 고르기
 *
 * 여섯 언어를 한꺼번에 통과하는 것으로 골랐다. 간선의 출발을 `from` 이라 하면
 * 파이썬에서 예약어라 `src` / `dst` / `cost` 로 적었다. transpiler 는 변수명을
 * 그대로 내보내므로 이름 하나가 여섯 언어에서 동시에 성해야 한다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'build-table' | 'add-edges' | 'pick-pivot' | 'probe' | 'rewrite' | 'done'
 *
 * 세 겹 반복문의 머리 세 줄은 'pick-pivot' 을 단다. 가운데를 세우는 일과 그
 * 가운데로 모든 쌍을 훑기 시작하는 일이 한 걸음이기 때문이고, 그래야 100 번
 * 이어지는 'probe' 가 조건 한 줄만 짚는다.
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
  op: '+' | '-' | '<' | '==',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** `dist[i][j]` — 지금 묻고 있는 칸. i 에서 j 로 가는, 지금까지 알아낸 거리. */
const here = idx(idx(v('dist'), v('i')), v('j'));
/** `dist[i][k]` — 출발점에서 가운데까지. */
const toPivot = idx(idx(v('dist'), v('i')), v('k'));
/** `dist[k][j]` — 가운데에서 도착점까지. */
const fromPivot = idx(idx(v('dist'), v('k')), v('j'));
/** `dist[i][k] + dist[k][j]` — 가운데를 거쳐 가는 길. 이 식이 알고리즘의 전부다. */
const through = bin('+', toPivot, fromPivot);

export const floydWarshallTripleIR: IR = {
  id: 'floyd-warshall-triple',
  algorithm: 'floydWarshall',
  paradigm: 'imperative',
  functions: [
    {
      name: 'floydWarshall',
      // 데이터가 앞, 긁어 쓸 표가 뒤다. 처음에는 `dist` 를 맨 앞에 두었는데,
      // 그러면 코드 패널의 첫 줄이 "n×n 표를 받아 n×n 표를 돌려주는데 받은 것을
      // 첫 줄부터 덮어쓰는 함수" 로 읽힌다 — 무엇을 마련해 두고 불러야 하는지
      // 서명이 답하지 못한다. 순서만 돌려도 그 첫인상이 달라진다.
      params: [
        { name: 'src', type: tIntList },
        { name: 'dst', type: tIntList },
        { name: 'cost', type: tIntList },
        { name: 'dist', type: tIntGrid },
      ],
      returnType: tIntGrid,
      body: [
        { kind: 'var', phase: 'build-table', name: 'n', type: tInt, init: len(v('dist')) },
        {
          kind: 'var',
          phase: 'build-table',
          name: 'INF',
          type: tInt,
          init: lit(1000000000),
        },
        {
          kind: 'for-range',
          phase: 'build-table',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'for-range',
              phase: 'build-table',
              var: 'j',
              from: lit(0),
              to: v('n'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  phase: 'build-table',
                  cond: bin('==', v('i'), v('j')),
                  then: [
                    { kind: 'assign', phase: 'build-table', target: here, expr: lit(0) },
                  ],
                  else: [
                    { kind: 'assign', phase: 'build-table', target: here, expr: v('INF') },
                  ],
                },
              ],
            },
          ],
        },
        {
          kind: 'for-range',
          phase: 'add-edges',
          var: 'e',
          from: lit(0),
          to: len(v('src')),
          inclusive: false,
          body: [
            {
              kind: 'assign',
              phase: 'add-edges',
              target: idx(idx(v('dist'), idx(v('src'), v('e'))), idx(v('dst'), v('e'))),
              expr: idx(v('cost'), v('e')),
            },
          ],
        },
        {
          kind: 'for-range',
          phase: 'pick-pivot',
          var: 'k',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'for-range',
              phase: 'pick-pivot',
              var: 'i',
              from: lit(0),
              to: v('n'),
              inclusive: false,
              body: [
                {
                  kind: 'for-range',
                  phase: 'pick-pivot',
                  var: 'j',
                  from: lit(0),
                  to: v('n'),
                  inclusive: false,
                  body: [
                    {
                      kind: 'if',
                      phase: 'probe',
                      cond: bin('==', v('i'), v('j')),
                      then: [{ kind: 'continue', phase: 'probe' }],
                    },
                    {
                      kind: 'if',
                      phase: 'probe',
                      cond: bin('<', through, here),
                      then: [
                        { kind: 'assign', phase: 'rewrite', target: here, expr: through },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { kind: 'return', phase: 'done', expr: v('dist') },
      ] satisfies IRStmt[],
    },
  ],
};

export const floydWarshallIRs: IR[] = [floydWarshallTripleIR];
