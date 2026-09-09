/**
 * 강한 연결 요소 (타잔) 학습용 IR — 함수 둘. 이 저장소에서 가장 긴 IR 이다.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def scc(adj, num, low, onstack, stack, comp, nextNum, sp):
 *       n = len(adj)                                   # phase: init
 *       for i in range(0, n):                          # phase: init
 *           num[i] = -1                                # phase: init
 *           low[i] = -1                                # phase: init
 *           onstack[i] = 0                             # phase: init
 *           comp[i] = -1                               # phase: init
 *       nextNum[0] = 0                                 # phase: init
 *       sp[0] = 0                                      # phase: init
 *       for i in range(0, n):                          # phase: root-scan
 *           if num[i] == -1:                           # phase: root-scan
 *               tarjan(adj, i, num, low, onstack, stack, comp, nextNum, sp)  # phase: descend
 *       groups = 0                                     # phase: count-groups
 *       for i in range(0, n):                          # phase: count-groups
 *           if comp[i] == i:                           # phase: count-groups
 *               groups = groups + 1                    # phase: count-groups
 *       return groups                                  # phase: count-groups
 *
 *   def tarjan(adj, u, num, low, onstack, stack, comp, nextNum, sp):
 *       num[u] = nextNum[0]                            # phase: visit
 *       low[u] = nextNum[0]                            # phase: visit
 *       nextNum[0] = nextNum[0] + 1                    # phase: visit
 *       stack[sp[0]] = u                               # phase: push
 *       sp[0] = sp[0] + 1                              # phase: push
 *       onstack[u] = 1                                 # phase: push
 *       for k in range(0, len(adj[u])):                # phase: scan-edge
 *           v = adj[u][k]                              # phase: scan-edge
 *           if num[v] == -1:                           # phase: scan-edge
 *               tarjan(adj, v, ...)                    # phase: descend
 *               if low[v] < low[u]:                    # phase: lift-child
 *                   low[u] = low[v]                    # phase: lift-child
 *           else:
 *               if onstack[v] == 1:                    # phase: back-edge
 *                   if num[v] < low[u]:                # phase: back-edge
 *                       low[u] = num[v]                # phase: back-edge
 *       if low[u] == num[u]:                           # phase: root-check
 *           w = -1                                     # phase: pop-group
 *           while w != u:                              # phase: pop-group
 *               sp[0] = sp[0] - 1                      # phase: pop-group
 *               w = stack[sp[0]]                       # phase: pop-group
 *               onstack[w] = 0                         # phase: pop-group
 *               comp[w] = u                            # phase: pop-group
 *
 * ── 무엇을 펼쳤는가
 *
 * **이름 붙인 호출이 하나도 없다.** `call` 노드는 `tarjan` 자기 자신을 부르는
 * 두 자리뿐이고 그 둘은 알고리즘 자체다. 배열을 만드는 `zeros(n)` 조차 쓰지
 * 않았다 — 아래 "배열은 인자로 받는다" 참조.
 *
 * 가장 크게 값을 하는 자리는 낮은값 갱신의 **두 갈래**다.
 *
 *     if num[v] == -1:      아직 안 가 본 곳 — 내려갔다 와서
 *         low[u] = low[v]       자식이 닿은 곳을 물려받는다
 *     elif onstack[v] == 1: 이미 스택에 있는 곳 — 되짚어 닿았다
 *         low[u] = num[v]       그 자리의 번호를 쓴다   ← low[v] 가 아니다
 *
 * 둘째 갈래가 `low[v]` 가 아니라 `num[v]` 인 것이 이 알고리즘에서 가장 자주
 * 틀리는 자리다. `relax(u, v)` 같은 이름으로 감싸면 두 갈래가 한 이름 뒤로
 * 숨어 코드 패널이 할 말을 잃는다. 그래서 `if` 둘을 그대로 폈다 — `elif` 는
 * IR 에 없으므로 `else` 안의 `if` 로 적었고, 여섯 언어 모두 그 모양으로 나온다.
 *
 * 무리를 꺼내는 대목도 폈다. `while` 로 스택을 위에서부터 떼어 내다 자기
 * 자신에 닿으면 멈춘다. `w = -1` 로 시작해 `while w != u` 를 도는 것은
 * do-while 이 IR 에 없어서다 — 첫 바퀴가 반드시 돌아야 u 자신도 꺼내진다.
 *
 * ── 배열은 인자로 받는다
 *
 * IR 에 배열을 새로 만드는 노드가 없다. `zeros(n)` 을 부르면 `runIR` 이
 * `ir.functions` 안에서 그 이름을 찾지 못해 터진다 (인터프리터는 IR 이 정의한
 * 함수만 부른다). 그래서 `num` · `low` · `onstack` · `stack` · `comp` 를
 * 진입점의 매개변수로 받고, 첫 루프에서 제 손으로 -1 / 0 을 채운다. 부작용은
 * 매개변수가 아홉이 되는 것인데, 그것이 오히려 정직하다 — 타잔이 정점마다
 * 무엇 무엇을 들고 다녀야 하는 알고리즘인지가 서명 한 줄에 다 나온다.
 *
 * ── idx 와 sp 를 어떻게 이어 나르는가  (이 IR 의 어려운 대목)
 *
 * 재귀 전체가 공유해야 하는 값이 둘 있다. 다음에 매길 방문 번호와 스택 꼭대기.
 * IR 에 전역이 없고, 함수는 값을 하나만 돌려준다. 세 길을 두고 골랐다.
 *
 *   (가) 한 배열의 두 칸으로 — `counter[0]` 은 번호, `counter[1]` 은 꼭대기.
 *        칸을 하나 아끼지만 `counter[1]` 이 무엇인지는 코드에 안 적힌다.
 *   (나) 반환값으로 이어 나르기 — `sp = tarjan(...)`. 하나는 되는데 둘은 안 된다.
 *   (다) **한 칸짜리 배열 둘.** `nextNum[0]` · `sp[0]`.  ← 고른 길
 *
 * (다)를 골랐다. 이름이 값의 뜻을 그대로 말하고 (`nextNum[0] = nextNum[0] + 1`
 * 은 "다음 번호를 하나 민다" 로 읽힌다), 여섯 언어 어디서도 특별한 표기가
 * 필요 없다. `[0]` 이라는 군더더기 하나를 무는 대신 "재귀가 함께 쓰는 값은
 * 상자에 담아 돌린다" 는 것이 코드에 보인다 — 파이썬 학습자가 `nonlocal` 로,
 * C++ 학습자가 `int&` 로 푸는 바로 그 문제다.
 *
 * ── 무리에는 번호를 따로 매기지 않는다
 *
 * `comp[w] = u` — 무리의 이름은 그 무리를 처음 만난 자리(뿌리)의 번호다.
 * 이렇게 두면 무리 번호를 세는 상자가 더 필요 없고, 마지막에 `comp[i] == i`
 * 인 자리를 세는 것만으로 무리 개수가 나온다. 뿌리는 언제나 마지막에 꺼내지고
 * 자기 자신을 가리키기 때문이다.
 *
 * ── 이름 고르기
 *
 * 여섯 언어를 한꺼번에 통과하는 것으로 골랐다. `stack` 은 C++ 의 `std::stack`
 * 과 이름이 겹치지만 `using namespace std` 를 쓰지 않으므로 지역 이름으로 성하다.
 * `num` / `low` 는 이 알고리즘의 관용 표기라 그대로 두었고, `onstack` 은
 * 한 단어로 붙여 여섯 언어의 명명 규칙 차이를 피했다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'init' | 'root-scan' | 'descend' | 'visit' | 'push' | 'scan-edge' |
 *   'lift-child' | 'back-edge' | 'root-check' | 'pop-group' | 'count-groups'
 */

import type { IR, IRExpr, IRParam, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tIntList: IRType = { kind: 'list', of: tInt };
const tIntGrid: IRType = { kind: 'list', of: tIntList };
const tVoid: IRType = { kind: 'void' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** 재귀가 함께 쓰는 값 — 한 칸짜리 배열에 담아 돌린다. */
const nextNum = idx(v('nextNum'), lit(0));
const stackTop = idx(v('sp'), lit(0));

/** 지금 자리의 방문 번호와 낮은값. */
const numU = idx(v('num'), v('u'));
const lowU = idx(v('low'), v('u'));
/** 이웃 자리의 방문 번호와 낮은값. */
const numV = idx(v('num'), v('v'));
const lowV = idx(v('low'), v('v'));

/** 두 함수가 함께 들고 다니는 것들. `u` 만 tarjan 쪽에 하나 더 붙는다. */
const carriedParams: IRParam[] = [
  { name: 'num', type: tIntList },
  { name: 'low', type: tIntList },
  { name: 'onstack', type: tIntList },
  { name: 'stack', type: tIntList },
  { name: 'comp', type: tIntList },
  { name: 'nextNum', type: tIntList },
  { name: 'sp', type: tIntList },
];

/** `tarjan(adj, <vertex>, num, low, onstack, stack, comp, nextNum, sp)` */
const tarjanCall = (vertex: IRExpr): IRExpr =>
  call('tarjan', [v('adj'), vertex, ...carriedParams.map((p) => v(p.name))]);

/** 무리를 스택에서 떼어 내는 while 한 바퀴. 자기 자신에 닿으면 멈춘다. */
const popOneOfGroup: IRStmt[] = [
  { kind: 'assign', phase: 'pop-group', target: stackTop, expr: bin('-', stackTop, lit(1)) },
  { kind: 'assign', phase: 'pop-group', target: v('w'), expr: idx(v('stack'), stackTop) },
  { kind: 'assign', phase: 'pop-group', target: idx(v('onstack'), v('w')), expr: lit(0) },
  { kind: 'assign', phase: 'pop-group', target: idx(v('comp'), v('w')), expr: v('u') },
];

export const sccTarjanIR: IR = {
  id: 'scc-tarjan',
  algorithm: 'scc',
  paradigm: 'imperative',
  functions: [
    {
      name: 'scc',
      params: [{ name: 'adj', type: tIntGrid }, ...carriedParams],
      returnType: tInt,
      body: [
        { kind: 'var', phase: 'init', name: 'n', type: tInt, init: len(v('adj')) },
        {
          kind: 'for-range',
          phase: 'init',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            { kind: 'assign', phase: 'init', target: idx(v('num'), v('i')), expr: lit(-1) },
            { kind: 'assign', phase: 'init', target: idx(v('low'), v('i')), expr: lit(-1) },
            { kind: 'assign', phase: 'init', target: idx(v('onstack'), v('i')), expr: lit(0) },
            { kind: 'assign', phase: 'init', target: idx(v('comp'), v('i')), expr: lit(-1) },
          ],
        },
        { kind: 'assign', phase: 'init', target: nextNum, expr: lit(0) },
        { kind: 'assign', phase: 'init', target: stackTop, expr: lit(0) },
        {
          kind: 'for-range',
          phase: 'root-scan',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              phase: 'root-scan',
              cond: bin('==', idx(v('num'), v('i')), lit(-1)),
              then: [{ kind: 'expr-stmt', phase: 'descend', expr: tarjanCall(v('i')) }],
            },
          ],
        },
        { kind: 'var', phase: 'count-groups', name: 'groups', type: tInt, init: lit(0) },
        {
          kind: 'for-range',
          phase: 'count-groups',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              phase: 'count-groups',
              // 뿌리만 자기 자신을 가리킨다. 그 수가 곧 무리의 수다.
              cond: bin('==', idx(v('comp'), v('i')), v('i')),
              then: [
                {
                  kind: 'assign',
                  phase: 'count-groups',
                  target: v('groups'),
                  expr: bin('+', v('groups'), lit(1)),
                },
              ],
            },
          ],
        },
        { kind: 'return', phase: 'count-groups', expr: v('groups') },
      ],
    },
    {
      name: 'tarjan',
      params: [
        { name: 'adj', type: tIntGrid },
        { name: 'u', type: tInt },
        ...carriedParams,
      ],
      returnType: tVoid,
      body: [
        { kind: 'assign', phase: 'visit', target: numU, expr: nextNum },
        { kind: 'assign', phase: 'visit', target: lowU, expr: nextNum },
        { kind: 'assign', phase: 'visit', target: nextNum, expr: bin('+', nextNum, lit(1)) },
        { kind: 'assign', phase: 'push', target: idx(v('stack'), stackTop), expr: v('u') },
        { kind: 'assign', phase: 'push', target: stackTop, expr: bin('+', stackTop, lit(1)) },
        { kind: 'assign', phase: 'push', target: idx(v('onstack'), v('u')), expr: lit(1) },
        {
          kind: 'for-range',
          phase: 'scan-edge',
          var: 'k',
          from: lit(0),
          to: len(idx(v('adj'), v('u'))),
          inclusive: false,
          body: [
            {
              kind: 'var',
              phase: 'scan-edge',
              name: 'v',
              type: tInt,
              init: idx(idx(v('adj'), v('u')), v('k')),
            },
            {
              kind: 'if',
              phase: 'scan-edge',
              cond: bin('==', numV, lit(-1)),
              // 아직 안 가 본 곳 — 내려갔다 와서 자식이 닿은 곳을 물려받는다.
              then: [
                { kind: 'expr-stmt', phase: 'descend', expr: tarjanCall(v('v')) },
                {
                  kind: 'if',
                  phase: 'lift-child',
                  cond: bin('<', lowV, lowU),
                  then: [{ kind: 'assign', phase: 'lift-child', target: lowU, expr: lowV }],
                },
              ],
              // 이미 스택에 있는 곳 — 되짚어 닿았다. 그 자리의 **번호** 를 쓴다.
              else: [
                {
                  kind: 'if',
                  phase: 'back-edge',
                  cond: bin('==', idx(v('onstack'), v('v')), lit(1)),
                  then: [
                    {
                      kind: 'if',
                      phase: 'back-edge',
                      cond: bin('<', numV, lowU),
                      then: [{ kind: 'assign', phase: 'back-edge', target: lowU, expr: numV }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          kind: 'if',
          phase: 'root-check',
          // 뻗어 나간 어디에서도 나보다 위로 못 갔다 — 여기가 무리의 뿌리다.
          cond: bin('==', lowU, numU),
          then: [
            { kind: 'var', phase: 'pop-group', name: 'w', type: tInt, init: lit(-1) },
            { kind: 'while', phase: 'pop-group', cond: bin('!=', v('w'), v('u')), body: popOneOfGroup },
          ],
        },
      ],
    },
  ],
};

export const sccIRs: IR[] = [sccTarjanIR];
