/**
 * 깊이 우선 탐색의 학습용 IR — 재귀 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def dfs(adj, visited, node):
 *       visited[node] = 1                       # phase: mark
 *       for i in range(len(adj[node])):         # phase: scan
 *           nb = adj[node][i]                   # phase: scan
 *           if visited[nb] == 0:                # phase: check
 *               dfs(adj, visited, nb)           # phase: descend
 *       return                                  # phase: ascend
 *
 * ── 재귀가 이 IR 의 전부다
 *
 * `dfs` 가 자기를 부른다. 그것 하나로 "한 갈래를 끝까지 파고들었다가 막히면
 * 되짚어 나온다" 가 코드에 다 들어 있다. 명시 스택(배열 + 꼭대기 색인)으로
 * 펴 쓰면 while 한 겹과 push/pop 두 줄이 늘면서 **부르는 일과 돌아오는 일이
 * 같은 루프의 두 대입문**이 되어 버린다. 이 알고리즘의 성격이 거기서 사라진다.
 * 자료구조를 펴 쓰라는 지침(스택은 배열 + 꼭대기 색인)은 자료구조가 주인공일
 * 때의 말이고, 여기서 주인공은 호출 스택 자체라 언어의 호출 스택을 쓰는 것이
 * 곧 펼쳐 쓰는 것이다.
 *
 * ── 이름 붙인 호출은 `dfs` 자신뿐이다
 *
 * `zeros(n)` 도 `max(a, b)` 도 없다. 인접 목록을 `list of list of int` 로 두면
 * 이웃 수는 `len(adj[node])` 로 나오고, 방문 표시는 `visited[node] = 1` 로 나온다.
 * 배열을 새로 만들 일이 없으므로 — `visited` 를 매개변수로 받으므로 — 언어마다
 * 표기가 갈리는 잡일이 하나도 남지 않는다. 여섯 언어가 IR 을 글자 그대로 옮긴다.
 *
 * `visited` 를 밖에서 받는 것은 회피가 아니다. IR 에는 전역이 없고, 재귀 호출이
 * 같은 표를 나눠 보아야 한다는 것 자체가 이 알고리즘의 성질이다 — "이미 본
 * 자리" 는 한 갈래의 사정이 아니라 걸음 전체의 사정이다. 매개변수로 드러나면
 * 그 공유가 코드에서 보인다.
 *
 * ── 돌아오는 일에는 줄이 없다 — 그래서 한 줄을 두었다
 *
 * 이 완제품의 어려운 대목이다. 재귀 호출이 끝나 함수가 반환되는 것은 화면에서
 * 뚜렷한 사건(프레임이 빠지고, 정점이 굳고, 되짚은 간선에 화살이 붙는다)인데
 * 소스에는 대응하는 줄이 없다. void 함수는 그냥 본문이 끝날 뿐이다.
 *
 * 셋을 놓고 골랐다.
 *
 *   1. 아무 줄도 짚지 않는다 — 재생 중 가장 극적인 순간에 코드 패널이 비고,
 *      algorithm 의 phase 집합에만 'ascend' 가 있어 C3 의 집합 등치가 깨진다.
 *   2. `for` 줄을 짚는다 — 거짓말이다. "아직 훑는 중" 이라고 말하는 줄인데
 *      실제로는 훑기가 끝나 함수를 떠나는 순간이다.
 *   3. **함수 끝에 `return` 을 명시로 한 줄 둔다** ← 이것을 골랐다.
 *
 * void 함수의 마지막 `return` 은 어느 언어에서도 없어도 되는 줄이지만 틀린 줄은
 * 아니다. 여섯 언어가 모두 낸다 (`return` · `return;`). 그리고 그 줄이 가리키는
 * 것이 정확히 "이 부름이 끝나고 부른 쪽으로 돌아간다" 이다 — 화면에서 프레임이
 * 빠지는 그 순간이다. 없어도 되는 줄을 굳이 적어 두는 것이 이 알고리즘을
 * 배우는 자리에서는 오히려 정직하다. 부름과 돌아옴이 서로 다른 사건이라면
 * 코드에도 서로 다른 줄이 있어야 한다.
 *
 * ── 왜 방문 차례를 IR 이 돌려주지 않는가
 *
 * `order[seq] = node` 와 `seq` 를 함수 안팎으로 실어 나르면 IR 이 방문 차례를
 * 직접 뱉게 만들 수 있다 (CLRS 의 discovery time 이 그것이다). 그러나 여섯 줄짜리
 * 알고리즘에 매개변수 둘과 줄 셋이 더 붙고, `seq = dfs(...)` 가 되면서 "돌아오는
 * 일" 이 값을 넘기는 일로 읽힌다. 돌아오는 일은 값이 아니라 **제어**의 사건이다.
 * 그래서 IR 은 `visited` 만 채우고, 차례는 `algorithm.ts` 가 셈해 화면에 준다.
 * 검사는 IR 이 채운 `visited` 와 algorithm 이 셈한 방문 집합이 같은지를 잰다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'mark' | 'scan' | 'check' | 'descend' | 'ascend'
 */

import type { IR, IRExpr, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tIntList: IRType = { kind: 'list', of: tInt };
const tIntGrid: IRType = { kind: 'list', of: tIntList };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });

/** `adj[node]` — 지금 정점의 이웃 목록. 길이가 곧 이웃 수다. */
const myNeighbors = idx(v('adj'), v('node'));
/** `adj[node][i]` — 그 목록의 i 번째. 목록의 차례가 곧 보는 차례다. */
const ithNeighbor = idx(myNeighbors, v('i'));

export const dfsRecursiveIR: IR = {
  id: 'dfs-recursive',
  algorithm: 'dfs',
  paradigm: 'imperative',
  functions: [
    {
      name: 'dfs',
      params: [
        { name: 'adj', type: tIntGrid },
        { name: 'visited', type: tIntList },
        { name: 'node', type: tInt },
      ],
      returnType: { kind: 'void' },
      body: [
        // 들어오자마자 표시한다. 표시가 늦으면 같은 정점에 두 번 들어간다.
        {
          kind: 'assign',
          phase: 'mark',
          target: idx(v('visited'), v('node')),
          expr: lit(1),
        },
        {
          kind: 'for-range',
          phase: 'scan',
          var: 'i',
          from: lit(0),
          to: { kind: 'len', of: myNeighbors },
          inclusive: false,
          body: [
            {
              kind: 'var',
              phase: 'scan',
              name: 'nb',
              type: tInt,
              init: ithNeighbor,
            },
            {
              kind: 'if',
              phase: 'check',
              cond: { kind: 'binop', op: '==', l: idx(v('visited'), v('nb')), r: lit(0) },
              then: [
                // 여기서 함수가 자기를 부른다. 이 한 줄이 "파고든다" 이고,
                // 이 줄이 끝나야 다음 이웃으로 넘어간다 — 그 사이에 하위
                // 갈래가 통째로 다녀온다.
                {
                  kind: 'expr-stmt',
                  phase: 'descend',
                  expr: { kind: 'call', fn: 'dfs', args: [v('adj'), v('visited'), v('nb')] },
                },
              ],
            },
          ],
        },
        // 없어도 도는 줄. 있어야 "돌아오는 일" 에 짚을 자리가 생긴다 (위 머리말).
        { kind: 'return', phase: 'ascend' },
      ],
    },
  ],
};

export const dfsIRs: IR[] = [dfsRecursiveIR];
