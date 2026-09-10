/**
 * 의사결정 트리를 기르는 IR — 함수 하나가 스스로를 두 번 부른다.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def growTree(points, label, order, lo, hi, depth, depthLimit, me,
 *                feature, threshold, left, right):
 *       cnt = hi - lo                                          # phase: node-open
 *       a = 0
 *       for j in range(lo, hi):
 *           if label[order[j]] == 0:
 *               a = a + 1
 *       pa = a / cnt                                           # phase: impurity
 *       pb = (cnt - a) / cnt
 *       g = 1 - pa * pa - pb * pb
 *       bestG = 2                                              # phase: depth-check
 *       bestF = -1
 *       bestT = 0
 *       if depth < depthLimit and g > 0:
 *           for axis in range(0, 2):                           # phase: sort-axis
 *               for j in range(lo + 1, hi):
 *                   k = j
 *                   while k > lo and points[axis][order[k]] < points[axis][order[k - 1]]:
 *                       order[k], order[k - 1] = order[k - 1], order[k]
 *                       k = k - 1
 *               la = 0                                         # phase: try-cut
 *               lc = 0
 *               for j in range(lo + 1, hi):
 *                   if label[order[j - 1]] == 0:
 *                       la = la + 1
 *                   lc = lc + 1
 *                   v0 = points[axis][order[j - 1]]
 *                   v1 = points[axis][order[j]]
 *                   if v0 < v1:
 *                       cut = (v0 + v1) / 2
 *                       ra = a - la
 *                       rc = cnt - lc
 *                       pla = la / lc
 *                       plb = (lc - la) / lc
 *                       pra = ra / rc
 *                       prb = (rc - ra) / rc
 *                       gl = 1 - pla * pla - plb * plb
 *                       gr = 1 - pra * pra - prb * prb
 *                       wg = (lc / cnt) * gl + (rc / cnt) * gr
 *                       if wg < bestG:                         # phase: keep-best
 *                           bestG = wg
 *                           bestF = axis
 *                           bestT = cut
 *       if bestF < 0:                                          # phase: leaf
 *           feature[me] = -1
 *           threshold[me] = 0
 *           left[me] = -1
 *           if a * 2 < cnt:
 *               left[me] = -2
 *           right[me] = -1
 *           return me + 1
 *       mid = lo                                               # phase: partition
 *       for j in range(lo, hi):
 *           if points[bestF][order[j]] < bestT:
 *               order[mid], order[j] = order[j], order[mid]
 *               mid = mid + 1
 *       feature[me] = bestF                                    # phase: split
 *       threshold[me] = bestT
 *       left[me] = me + 1
 *       nxt = growTree(points, label, order, lo, mid, depth + 1, depthLimit, me + 1,
 *                      feature, threshold, left, right)        # phase: recurse
 *       right[me] = nxt
 *       return growTree(points, label, order, mid, hi, depth + 1, depthLimit, nxt,
 *                       feature, threshold, left, right)
 *
 * ── 재귀가 곧 나무다
 *
 * 이 IR 의 존재 이유는 재귀다. 한 번 가르는 일 — 후보를 훑고 가장 좋은 것을
 * 고르는 일 — 을 마친 자리에서 **그 자리 그대로 자기 자신을 두 번 부른다.**
 * 나무를 만드는 별도의 자료구조가 없다. 함수가 스스로를 부르는 것이 곧 가지가
 * 갈리는 것이고, 되돌아오는 것이 곧 그 가지가 끝난 것이다.
 *
 * ── 나무를 배열 넷으로 편다
 *
 * `feature[i]` · `threshold[i]` · `left[i]` · `right[i]`. 노드 번호는 전위
 * 순서로 매긴다 — 지금 노드가 `me` 면 왼쪽 자식은 반드시 `me + 1` 이고, 오른쪽
 * 자식 번호는 왼쪽 부분나무를 다 기르고 나서야 알 수 있다. 그래서 `growTree` 는
 * **다음 빈 자리**를 돌려준다. 왼쪽 호출이 돌려준 것이 오른쪽 자식의 번호이고,
 * 오른쪽 호출이 돌려준 것이 이 부분나무 전체가 쓴 끝자리다.
 *
 * 이 되돌림값 하나로 번호를 세는 바깥 상태(카운터 배열)가 없어진다.
 *
 * 잎은 `left[i] < 0` 으로 표시하고 그 자리에 이름표를 담는다 — `-1` 이 A,
 * `-2` 가 B다 (`-1 - 이름표`). 읽는 쪽은 `-left[i] - 1` 로 되돌린다.
 *
 * ── `zeros` 를 쓰지 않는다
 *
 * 배열 넷과 색인 배열 `order` 는 전부 **인자로 받는다.** 어느 언어에도 `zeros`
 * 라는 이름이 없어 그것을 부르면 여섯 언어 어디서도 돌지 않는다. 호출부가
 * 만들어 넘기면 그만이다.
 *
 * ── 자료를 복사하지 않고 색인만 가른다
 *
 * `order` 는 점 번호의 순열이고, 한 노드는 그 안의 구간 `[lo, hi)` 다.
 * 자름이 정해지면 퀵 정렬의 그것과 같은 두 손가락 맞바꾸기로 구간을 제자리에서
 * 두 토막 내고, 두 토막을 각각 자식에게 넘긴다. 점 열여덟을 노드마다 복사하는
 * 대신 번호만 자리를 바꾼다.
 *
 * ── 후보는 줄 세운 뒤 훑는다
 *
 * "이웃한 두 값의 한가운데" 를 구하려면 그 축으로 이웃이 누구인지부터 알아야
 * 한다. 그래서 축마다 구간을 삽입 정렬로 세운 뒤 앞에서 뒤로 한 번 훑는다.
 * 훑는 동안 왼쪽 무리의 크기 `lc` 와 그 안의 A 개수 `la` 가 한 칸씩 자라므로,
 * 후보마다 다시 세지 않고 **한 번의 통과**로 모든 가중 지니가 나온다. 값이
 * 같은 이웃(`v0 == v1`)은 가를 수 없으니 건너뛴다.
 *
 * ── 지니를 감싸지 않는다
 *
 * `1 - pa*pa - pb*pb` 가 세 번 나온다 (지금 노드 · 왼쪽 · 오른쪽). `gini(a, n)`
 * 으로 감싸면 줄은 줄지만 코드 패널이 **섞임을 무엇으로 재는지** 를 말하지
 * 않게 된다. 이 완제품이 말하려는 것이 바로 그 식이라 펼쳐 둔다.
 *
 * ── 수 나눗셈
 *
 * `a` · `cnt` · `la` · `lc` · `ra` · `rc` 는 세는 값인데도 `double` 로 둔다.
 * Java · C++ · C# 에서 정수끼리의 `/` 는 정수 나눗셈이라, `int` 로 두면 비율이
 * 전부 0 이 되어 지니가 0 으로 눌린다. 자리 번호를 셈하는 것이 아니라 비율을
 * 셈하는 값이므로 처음부터 실수로 잡는다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'node-open' | 'impurity' | 'depth-check' | 'sort-axis' | 'try-cut' |
 *   'keep-best' | 'leaf' | 'partition' | 'split' | 'recurse'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const tInt: IRType = { kind: 'int' };
const tDouble: IRType = { kind: 'double' };
const tIntList: IRType = { kind: 'list', of: tInt };
const tDoubleList: IRType = { kind: 'list', of: tDouble };
const tDoubleGrid: IRType = { kind: 'list', of: tDoubleList };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** `order[j]` — 이 노드 구간의 j 번째 자리에 놓인 점 번호. */
const orderAt = (i: IRExpr): IRExpr => idx(v('order'), i);
/** `points[axis][order[i]]` — 지금 보는 축에서 그 점의 좌표. */
const coordAt = (axis: IRExpr, i: IRExpr): IRExpr =>
  idx(idx(v('points'), axis), orderAt(i));
/** `1 - p*p - q*q` — 지니. 감싸지 않고 세 자리에 그대로 펼친다. */
const giniOf = (p: string, q: string): IRExpr =>
  bin('-', bin('-', lit(1), bin('*', v(p), v(p))), bin('*', v(q), v(q)));

const j = v('j');
const jPrev = bin('-', v('j'), lit(1));

/** 축 하나를 삽입 정렬로 세운다 — 이웃을 알아야 한가운데를 구한다. */
const sortAxis: IRStmt = {
  kind: 'for-range',
  phase: 'sort-axis',
  var: 'j',
  from: bin('+', v('lo'), lit(1)),
  to: v('hi'),
  inclusive: false,
  body: [
    { kind: 'var', phase: 'sort-axis', name: 'k', type: tInt, init: j },
    {
      kind: 'while',
      phase: 'sort-axis',
      cond: bin(
        '&&',
        bin('>', v('k'), v('lo')),
        bin(
          '<',
          coordAt(v('axis'), v('k')),
          coordAt(v('axis'), bin('-', v('k'), lit(1))),
        ),
      ),
      body: [
        {
          kind: 'swap',
          phase: 'sort-axis',
          a: orderAt(v('k')),
          b: orderAt(bin('-', v('k'), lit(1))),
        },
        { kind: 'assign', phase: 'sort-axis', target: v('k'), expr: bin('-', v('k'), lit(1)) },
      ],
    },
  ],
};

/** 줄 세운 구간을 한 번 훑으며 이웃 한가운데마다 가중 지니를 잰다. */
const sweepCuts: IRStmt[] = [
  { kind: 'var', phase: 'try-cut', name: 'la', type: tDouble, init: lit(0) },
  { kind: 'var', phase: 'try-cut', name: 'lc', type: tDouble, init: lit(0) },
  {
    kind: 'for-range',
    phase: 'try-cut',
    var: 'j',
    from: bin('+', v('lo'), lit(1)),
    to: v('hi'),
    inclusive: false,
    body: [
      {
        kind: 'if',
        phase: 'try-cut',
        cond: bin('==', idx(v('label'), orderAt(jPrev)), lit(0)),
        then: [
          { kind: 'assign', phase: 'try-cut', target: v('la'), expr: bin('+', v('la'), lit(1)) },
        ],
      },
      { kind: 'assign', phase: 'try-cut', target: v('lc'), expr: bin('+', v('lc'), lit(1)) },
      { kind: 'var', phase: 'try-cut', name: 'v0', type: tDouble, init: coordAt(v('axis'), jPrev) },
      { kind: 'var', phase: 'try-cut', name: 'v1', type: tDouble, init: coordAt(v('axis'), j) },
      {
        kind: 'if',
        phase: 'try-cut',
        cond: bin('<', v('v0'), v('v1')),
        then: [
          {
            kind: 'var',
            phase: 'try-cut',
            name: 'cut',
            type: tDouble,
            init: bin('/', bin('+', v('v0'), v('v1')), lit(2)),
          },
          { kind: 'var', phase: 'try-cut', name: 'ra', type: tDouble, init: bin('-', v('a'), v('la')) },
          { kind: 'var', phase: 'try-cut', name: 'rc', type: tDouble, init: bin('-', v('cnt'), v('lc')) },
          { kind: 'var', phase: 'try-cut', name: 'pla', type: tDouble, init: bin('/', v('la'), v('lc')) },
          {
            kind: 'var',
            phase: 'try-cut',
            name: 'plb',
            type: tDouble,
            init: bin('/', bin('-', v('lc'), v('la')), v('lc')),
          },
          { kind: 'var', phase: 'try-cut', name: 'pra', type: tDouble, init: bin('/', v('ra'), v('rc')) },
          {
            kind: 'var',
            phase: 'try-cut',
            name: 'prb',
            type: tDouble,
            init: bin('/', bin('-', v('rc'), v('ra')), v('rc')),
          },
          { kind: 'var', phase: 'try-cut', name: 'gl', type: tDouble, init: giniOf('pla', 'plb') },
          { kind: 'var', phase: 'try-cut', name: 'gr', type: tDouble, init: giniOf('pra', 'prb') },
          {
            kind: 'var',
            phase: 'try-cut',
            name: 'wg',
            type: tDouble,
            init: bin(
              '+',
              bin('*', bin('/', v('lc'), v('cnt')), v('gl')),
              bin('*', bin('/', v('rc'), v('cnt')), v('gr')),
            ),
          },
          {
            kind: 'if',
            phase: 'keep-best',
            cond: bin('<', v('wg'), v('bestG')),
            then: [
              { kind: 'assign', phase: 'keep-best', target: v('bestG'), expr: v('wg') },
              { kind: 'assign', phase: 'keep-best', target: v('bestF'), expr: v('axis') },
              { kind: 'assign', phase: 'keep-best', target: v('bestT'), expr: v('cut') },
            ],
          },
        ],
      },
    ],
  },
];

const recurseArgs = (
  from: IRExpr,
  to: IRExpr,
  slot: IRExpr,
): IRExpr => ({
  kind: 'call',
  fn: 'growTree',
  args: [
    v('points'),
    v('label'),
    v('order'),
    from,
    to,
    bin('+', v('depth'), lit(1)),
    v('depthLimit'),
    slot,
    v('feature'),
    v('threshold'),
    v('left'),
    v('right'),
  ],
});

export const decisionTreeGrowIR: IR = {
  id: 'decision-tree',
  algorithm: 'decisionTree',
  paradigm: 'imperative',
  functions: [
    {
      name: 'growTree',
      params: [
        { name: 'points', type: tDoubleGrid },
        { name: 'label', type: tIntList },
        { name: 'order', type: tIntList },
        { name: 'lo', type: tInt },
        { name: 'hi', type: tInt },
        { name: 'depth', type: tInt },
        { name: 'depthLimit', type: tInt },
        { name: 'me', type: tInt },
        { name: 'feature', type: tIntList },
        { name: 'threshold', type: tDoubleList },
        { name: 'left', type: tIntList },
        { name: 'right', type: tIntList },
      ],
      returnType: tInt,
      body: [
        // ── 이 노드에 몇이 있고 그중 A 가 몇인가.
        {
          kind: 'var',
          phase: 'node-open',
          name: 'cnt',
          type: tDouble,
          init: bin('-', v('hi'), v('lo')),
        },
        { kind: 'var', phase: 'node-open', name: 'a', type: tDouble, init: lit(0) },
        {
          kind: 'for-range',
          phase: 'node-open',
          var: 'j',
          from: v('lo'),
          to: v('hi'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              phase: 'node-open',
              cond: bin('==', idx(v('label'), orderAt(j)), lit(0)),
              then: [
                { kind: 'assign', phase: 'node-open', target: v('a'), expr: bin('+', v('a'), lit(1)) },
              ],
            },
          ],
        },
        // ── 섞임을 지니로 잰다.
        { kind: 'var', phase: 'impurity', name: 'pa', type: tDouble, init: bin('/', v('a'), v('cnt')) },
        {
          kind: 'var',
          phase: 'impurity',
          name: 'pb',
          type: tDouble,
          init: bin('/', bin('-', v('cnt'), v('a')), v('cnt')),
        },
        { kind: 'var', phase: 'impurity', name: 'g', type: tDouble, init: giniOf('pa', 'pb') },
        // ── 깊이 상한에 닿았거나 이미 순수하면 더 묻지 않는다.
        { kind: 'var', phase: 'depth-check', name: 'bestG', type: tDouble, init: lit(2) },
        { kind: 'var', phase: 'depth-check', name: 'bestF', type: tInt, init: lit(-1) },
        { kind: 'var', phase: 'depth-check', name: 'bestT', type: tDouble, init: lit(0) },
        {
          kind: 'if',
          phase: 'depth-check',
          cond: bin('&&', bin('<', v('depth'), v('depthLimit')), bin('>', v('g'), lit(0))),
          then: [
            {
              kind: 'for-range',
              phase: 'sort-axis',
              var: 'axis',
              from: lit(0),
              to: lit(2),
              inclusive: false,
              body: [sortAxis, ...sweepCuts],
            },
          ],
        },
        // ── 물을 것이 없으면 잎이다. 이름표는 left 자리에 접어 넣는다.
        {
          kind: 'if',
          phase: 'leaf',
          cond: bin('<', v('bestF'), lit(0)),
          then: [
            { kind: 'assign', phase: 'leaf', target: idx(v('feature'), v('me')), expr: lit(-1) },
            { kind: 'assign', phase: 'leaf', target: idx(v('threshold'), v('me')), expr: lit(0) },
            { kind: 'assign', phase: 'leaf', target: idx(v('left'), v('me')), expr: lit(-1) },
            {
              kind: 'if',
              phase: 'leaf',
              cond: bin('<', bin('*', v('a'), lit(2)), v('cnt')),
              then: [
                { kind: 'assign', phase: 'leaf', target: idx(v('left'), v('me')), expr: lit(-2) },
              ],
            },
            { kind: 'assign', phase: 'leaf', target: idx(v('right'), v('me')), expr: lit(-1) },
            { kind: 'return', phase: 'leaf', expr: bin('+', v('me'), lit(1)) },
          ],
        },
        // ── 고른 자름으로 색인 구간을 제자리에서 두 토막 낸다.
        { kind: 'var', phase: 'partition', name: 'mid', type: tInt, init: v('lo') },
        {
          kind: 'for-range',
          phase: 'partition',
          var: 'j',
          from: v('lo'),
          to: v('hi'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              phase: 'partition',
              cond: bin('<', coordAt(v('bestF'), j), v('bestT')),
              then: [
                { kind: 'swap', phase: 'partition', a: orderAt(v('mid')), b: orderAt(j) },
                { kind: 'assign', phase: 'partition', target: v('mid'), expr: bin('+', v('mid'), lit(1)) },
              ],
            },
          ],
        },
        // ── 자름을 적고, 그 자리에서 양쪽을 다시 가른다.
        { kind: 'assign', phase: 'split', target: idx(v('feature'), v('me')), expr: v('bestF') },
        { kind: 'assign', phase: 'split', target: idx(v('threshold'), v('me')), expr: v('bestT') },
        {
          kind: 'assign',
          phase: 'split',
          target: idx(v('left'), v('me')),
          expr: bin('+', v('me'), lit(1)),
        },
        {
          kind: 'var',
          phase: 'recurse',
          name: 'nxt',
          type: tInt,
          init: recurseArgs(v('lo'), v('mid'), bin('+', v('me'), lit(1))),
        },
        { kind: 'assign', phase: 'recurse', target: idx(v('right'), v('me')), expr: v('nxt') },
        {
          kind: 'return',
          phase: 'recurse',
          expr: recurseArgs(v('mid'), v('hi'), v('nxt')),
        },
      ],
    },
  ],
};

export const decisionTreeIRs: IR[] = [decisionTreeGrowIR];
