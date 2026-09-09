/**
 * 크루스칼 최소 신장 트리 학습용 IR — 함수 셋.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def kruskal(edge_u, edge_v, weight, parent):
 *       n = len(parent)                                  # phase: setup
 *       m = len(weight)                                  # phase: setup
 *       total = 0                                        # phase: setup
 *       for i in range(n):                               # phase: make-set
 *           parent[i] = i                                # phase: make-set
 *       for i in range(1, m):                            # phase: sort-scan
 *           j = i                                        # phase: sort-scan
 *           while j > 0 and weight[j - 1] > weight[j]:   # phase: sort-scan
 *               weight[j - 1], weight[j] = weight[j], weight[j - 1]   # phase: sort-swap
 *               edge_u[j - 1], edge_u[j] = edge_u[j], edge_u[j - 1]   # phase: sort-swap
 *               edge_v[j - 1], edge_v[j] = edge_v[j], edge_v[j - 1]   # phase: sort-swap
 *               j = j - 1                                # phase: sort-swap
 *       for k in range(m):                               # phase: take-edge
 *           ru = find(parent, edge_u[k])                 # phase: find-root
 *           rv = find(parent, edge_v[k])                 # phase: find-root
 *           if ru == rv:                                 # phase: cycle-check
 *               continue                                 # phase: discard
 *           unite(parent, ru, rv)                        # phase: union
 *           total = total + weight[k]                    # phase: accumulate
 *       return total                                     # phase: answer
 *
 *   def find(parent, x):
 *       while parent[x] != x:                            # phase: find-root
 *           x = parent[x]                                # phase: find-root
 *       return x                                         # phase: find-root
 *
 *   def unite(parent, ra, rb):
 *       parent[ra] = rb                                  # phase: union
 *       return rb                                        # phase: union
 *
 * ── 이름 붙인 호출이 없다
 *
 * `find` 와 `unite` 는 이름만 빌린 호출이 아니라 `functions` 에 실제로 정의된
 * 함수다. 그래서 둘도 여섯 언어로 나오고, `runIR(ir, 'kruskal', [...])` 로 IR
 * 전체가 실행된다 — 정의 없는 이름을 하나라도 부르면 인터프리터가 그 자리에서
 * 멈춰 검증이 불가능해진다. 이 IR 이 부르는 이름은 그 둘뿐이고 둘 다 여기 있다.
 *
 * ── 정렬을 펼친 까닭
 *
 * `sort(edges)` 로 감싸는 것이 짧다. 그러나 크루스칼의 첫 문장이 "무게 순으로
 * 줄 세운다" 이고, 감싸는 순간 그 문장이 코드에서 사라진다 — 남는 것은 "이미
 * 줄 서 있는 것을 위에서부터 집는다" 뿐이라 알고리즘의 절반이 화면 밖으로
 * 나간다. 게다가 `sort` 는 정의 없는 이름이 되어 `runIR` 이 못 찾는다.
 *
 * 그래서 이웃끼리 맞바꾸는 삽입 정렬을 펼쳐 썼다. 골라 쓴 까닭이 둘 있다.
 * 하나는 **안정성** — 이웃이 `>` 일 때만 맞바꾸므로 같은 무게는 적힌 차례를
 * 지킨다. 무게가 같은 간선이 둘 있고 (2–4 와 0–3 이 5, 1–2 와 4–5 가 8),
 * 어느 쪽을 먼저 집느냐로 트리 모양이 갈리므로 이것은 취향이 아니라 정의다.
 * 다른 하나는 **자리가 하나도 더 들지 않는다** — 새 배열을 만들려면 `zeros`
 * 같은 이름 붙인 호출이 필요하고, 그러면 위의 규칙이 깨진다.
 *
 * 간선은 세 배열로 나란히 들고 다닌다 (`edge_u` · `edge_v` · `weight`). 구조체나
 * 튜플은 여섯 언어에서 표기가 제각각이라 코드 패널이 언어 소개가 되어 버린다.
 * 맞바꿀 때 세 줄이 나란히 서는 것은 그 값이다 — 한 간선이 세 배열에 걸쳐
 * 있다는 사실이 눈에 보인다.
 *
 * ── `parent` 를 밖에서 받는 까닭
 *
 * 정점 수만큼의 자리를 새로 만드는 일만은 IR 로 쓸 방법이 없다 (배열 생성
 * 노드가 없고, `zeros(n)` 은 정의 없는 이름이다). 그래서 자리는 호출자가 주고,
 * **그 자리를 무엇으로 채우는지**는 IR 안에 남겼다 — `parent[i] = i` 는 유니온
 * 파인드의 시작이지 잡일이 아니다.
 *
 * ── 경로 압축을 넣지 않은 까닭
 *
 * `find` 는 뿌리에 닿을 때까지 올라가기만 한다. 압축을 넣으면 두 줄이 늘고,
 * 그 두 줄이 화면의 주인공을 바꾼다 — 코드 패널을 보는 사람이 "크루스칼" 이
 * 아니라 "유니온 파인드" 를 읽게 된다. 이 저장소에는 그것을 주장하는 자리가
 * 이미 있다 (`union-find` 완제품과 `path-compression` 조각). 여기서 `find` 는
 * "두 끝이 같은 무리인가" 를 묻는 도구로만 서 있으면 된다.
 *
 * ── 이름 고르기
 *
 * `union` 은 C++ 와 C# 의 예약어라 못 쓴다 (transpiler 는 이름을 바꾸지 않고
 * 그대로 낸다). 잇는다는 뜻을 살려 `unite` 로 적었다. `unite` 가 뿌리 둘을
 * 받는 것도 일부러다 — 정점을 받아 안에서 다시 `find` 하면 본체의 `ru`/`rv`
 * 가 무엇에 쓰였는지 흐려진다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'setup' | 'make-set' | 'sort-scan' | 'sort-swap' | 'take-edge' |
 *   'find-root' | 'cycle-check' | 'discard' | 'union' | 'accumulate' | 'answer'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tIntList: IRType = { kind: 'list', of: tInt };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (
  op: '+' | '-' | '*' | '<' | '>' | '==' | '!=' | '&&',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** `j - 1` — 맞바꿀 이웃의 자리. */
const prev = bin('-', v('j'), lit(1));

/** 삽입 정렬의 한 걸음: 세 배열의 `j-1` 과 `j` 를 나란히 맞바꾼다. */
const swapNeighbors = (name: string): IRStmt => ({
  kind: 'swap',
  phase: 'sort-swap',
  a: at(v(name), prev),
  b: at(v(name), v('j')),
});

export const kruskalUnionIR: IR = {
  id: 'kruskal-union',
  algorithm: 'kruskalMst',
  paradigm: 'imperative',
  functions: [
    {
      name: 'kruskal',
      params: [
        { name: 'edge_u', type: tIntList },
        { name: 'edge_v', type: tIntList },
        { name: 'weight', type: tIntList },
        { name: 'parent', type: tIntList },
      ],
      returnType: tInt,
      body: [
        { kind: 'var', phase: 'setup', name: 'n', type: tInt, init: len(v('parent')) },
        { kind: 'var', phase: 'setup', name: 'm', type: tInt, init: len(v('weight')) },
        { kind: 'var', phase: 'setup', name: 'total', type: tInt, init: lit(0) },

        // 각 정점이 제 무리의 뿌리로 선다.
        {
          kind: 'for-range',
          phase: 'make-set',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            { kind: 'assign', phase: 'make-set', target: at(v('parent'), v('i')), expr: v('i') },
          ],
        },

        // 무게 순으로 줄을 세운다. 이웃이 더 무거울 때만 맞바꾸므로
        // 같은 무게는 적힌 차례가 그대로 남는다.
        {
          kind: 'for-range',
          phase: 'sort-scan',
          var: 'i',
          from: lit(1),
          to: v('m'),
          inclusive: false,
          body: [
            { kind: 'var', phase: 'sort-scan', name: 'j', type: tInt, init: v('i') },
            {
              kind: 'while',
              phase: 'sort-scan',
              cond: bin(
                '&&',
                bin('>', v('j'), lit(0)),
                bin('>', at(v('weight'), prev), at(v('weight'), v('j'))),
              ),
              body: [
                swapNeighbors('weight'),
                swapNeighbors('edge_u'),
                swapNeighbors('edge_v'),
                { kind: 'assign', phase: 'sort-swap', target: v('j'), expr: prev },
              ],
            },
          ],
        },

        // 위에서부터 하나씩 집는다.
        {
          kind: 'for-range',
          phase: 'take-edge',
          var: 'k',
          from: lit(0),
          to: v('m'),
          inclusive: false,
          body: [
            {
              kind: 'var',
              phase: 'find-root',
              name: 'ru',
              type: tInt,
              init: call('find', [v('parent'), at(v('edge_u'), v('k'))]),
            },
            {
              kind: 'var',
              phase: 'find-root',
              name: 'rv',
              type: tInt,
              init: call('find', [v('parent'), at(v('edge_v'), v('k'))]),
            },
            {
              kind: 'if',
              phase: 'cycle-check',
              cond: bin('==', v('ru'), v('rv')),
              then: [{ kind: 'continue', phase: 'discard' }],
            },
            {
              kind: 'expr-stmt',
              phase: 'union',
              expr: call('unite', [v('parent'), v('ru'), v('rv')]),
            },
            {
              kind: 'assign',
              phase: 'accumulate',
              target: v('total'),
              expr: bin('+', v('total'), at(v('weight'), v('k'))),
            },
          ],
        },
        { kind: 'return', phase: 'answer', expr: v('total') },
      ],
    },
    {
      name: 'find',
      params: [
        { name: 'parent', type: tIntList },
        { name: 'x', type: tInt },
      ],
      returnType: tInt,
      body: [
        {
          kind: 'while',
          phase: 'find-root',
          cond: bin('!=', at(v('parent'), v('x')), v('x')),
          body: [
            { kind: 'assign', phase: 'find-root', target: v('x'), expr: at(v('parent'), v('x')) },
          ],
        },
        { kind: 'return', phase: 'find-root', expr: v('x') },
      ],
    },
    {
      name: 'unite',
      params: [
        { name: 'parent', type: tIntList },
        { name: 'ra', type: tInt },
        { name: 'rb', type: tInt },
      ],
      returnType: tInt,
      body: [
        { kind: 'assign', phase: 'union', target: at(v('parent'), v('ra')), expr: v('rb') },
        { kind: 'return', phase: 'union', expr: v('rb') },
      ],
    },
  ],
};

export const kruskalMstIRs: IR[] = [kruskalUnionIR];
