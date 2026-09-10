/**
 * k-평균의 **한 걸음** IR — 함수 하나.
 *
 * 진입점이 한 판 전체가 아니라 한 걸음(할당 한 번 + 갱신 한 번)인 것이 이 IR 의
 * 모양을 정한다. 돌려주는 것은 **중심이 옮긴 거리의 합**이고, 그것이 0 이면
 * 멎은 것이다. 호출부가 0 이 나올 때까지 되부르는 것이 곧 k-평균이다.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def kmeans_step(x, assign, c, counts, sums):
 *       n = len(x)                                               # phase: begin-round
 *       k = len(c)                                               # phase: begin-round
 *       for i in range(0, n):                                    # phase: measure
 *           best = 0                                             # phase: measure
 *           bestsq = (x[i][0]-c[0][0])*(x[i][0]-c[0][0]) + (x[i][1]-c[0][1])*(x[i][1]-c[0][1])
 *           for j in range(1, k):                                # phase: measure
 *               dsq = (x[i][0]-c[j][0])*(x[i][0]-c[j][0]) + (x[i][1]-c[j][1])*(x[i][1]-c[j][1])
 *               if dsq < bestsq:                                 # phase: pick-nearest
 *                   bestsq = dsq                                 # phase: pick-nearest
 *                   best = j                                     # phase: pick-nearest
 *           assign[i] = best                                     # phase: assign
 *       for j in range(0, k):                                    # phase: gather
 *           counts[j] = 0
 *           sums[j][0] = 0
 *           sums[j][1] = 0
 *       for i in range(0, n):                                    # phase: gather
 *           g = assign[i]
 *           counts[g] = counts[g] + 1
 *           sums[g][0] = sums[g][0] + x[i][0]
 *           sums[g][1] = sums[g][1] + x[i][1]
 *       moved = 0                                                # phase: move-center
 *       for j in range(0, k):                                    # phase: move-center
 *           if counts[j] > 0:                                    # phase: move-center
 *               nx = sums[j][0] / counts[j]
 *               ny = sums[j][1] / counts[j]
 *               moved = moved + sqrt((nx-c[j][0])*(nx-c[j][0]) + (ny-c[j][1])*(ny-c[j][1]))
 *               c[j][0] = nx
 *               c[j][1] = ny
 *       return moved                                             # phase: settle-check
 *
 * ── 제곱근을 부르지 않는 자리와 부르는 자리
 *
 * 가장 가까운 중심을 고를 때는 **제곱 그대로 견준다.** 제곱근은 음 아닌 수에서
 * 단조 증가라 `a < b` 와 `sqrt(a) < sqrt(b)` 가 같은 답을 낸다 — 가장 가까운
 * 것이 바뀌지 않는다. 그래서 안쪽 루프에는 `sqrt` 가 없고 이름도 `bestsq` ·
 * `dsq` 로 "제곱" 임을 달고 있다. 열두 점 × 중심 다섯이면 걸음마다 예순 번을
 * 재는 자리라, 안 불러도 되는 것을 부르지 않는 것이 이 알고리즘의 실제 모습이다.
 *
 * `sqrt` 는 **딱 한 번** 나온다 — 중심이 옮긴 거리를 더하는 자리다. 거기서는
 * 순서가 아니라 **크기 자체**가 답이다. 제곱을 더하면 "얼마나 옮겼나" 가 아니라
 * 다른 수가 되고, 멎음의 문턱을 사람이 읽을 수 없게 된다. 같은 코드 안에서
 * 한쪽은 부르지 않고 한쪽은 부르는 것이 그 차이를 보인다.
 *
 * ── 이름 붙인 호출은 `sqrt` 하나뿐이다
 *
 * `sqrt` 는 `IR_MATH_BUILTINS` 의 예약 이름이라 여섯 언어가 자기 표기로 옮긴다
 * (`math.sqrt` · `Math.sqrt` · `std::sqrt` · `Math.Sqrt`). 그 밖에는 아무것도
 * 감싸지 않았다.
 *
 * - **거리를 `dist(a, b)` 로 감싸지 않았다.** `(x[i][0]-c[j][0])*(x[i][0]-c[j][0])`
 *   를 펴 두어야 "제곱을 그대로 더한다" 가 코드에 보인다. 감싸는 순간 이 IR 이
 *   할 말의 절반이 이름 뒤로 숨는다.
 * - **`min` 을 부르지 않았다.** 가장 가까운 중심은 값이 아니라 **색인**이 필요하다.
 *   `min` 은 값만 주므로 안쪽 루프로 펴서 `bestsq` 와 `best` 를 함께 갱신한다.
 *   이 되풀이가 "가장 가까운 것을 고른다" 의 전부다.
 * - **`zeros(n)` 을 쓰지 않았다.** 어느 언어에도 그 이름이 없다. 셈에 쓰는
 *   `counts` 와 `sums` 는 **인자로 받는다** — 호출부가 만들어 넘긴다.
 *
 * ── 빈 무리
 *
 * `counts[j] > 0` 인 무리만 옮긴다. 아무 점도 잡지 못한 중심은 **그 자리에 둔다** —
 * 0 으로 나누지 않으려는 것이기도 하고, 그 중심이 사라지지 않는다는 사실 자체가
 * "k 는 주어지는 것" 이라는 이 개념의 성질이기도 하다.
 *
 * ── 2차원 좌표
 *
 * 점 하나가 `x[i][0]` · `x[i][1]` 이다. `x` 의 타입은
 * `{ kind: 'list', of: { kind: 'list', of: double } }` 이고 `sums` 도 같다.
 * 여섯 언어가 각자의 표기로 옮긴다 — `double[][]` (Java · C#) ·
 * `std::vector<std::vector<double>>` (C++) · `number[][]` (TypeScript) ·
 * 표기 없음 (Python · JavaScript).
 *
 * ── 이름 고르기
 *
 * 여섯 언어를 한꺼번에 통과하는 것으로 골랐다. 무리 번호를 담는 지역 변수는
 * 바깥 루프의 `j` 와 겹치지 않게 `g` 로 두었고, 새 중심 좌표는 `nx` · `ny` 다
 * (`new` 는 넷에서 예약어다).
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'begin-round' | 'measure' | 'pick-nearest' | 'assign' |
 *   'gather' | 'move-center' | 'settle-check'
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
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (
  op: '+' | '-' | '*' | '/' | '<' | '>',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** `x[i][d]` — 점 i 의 d 번째 좌표. */
const point = (d: number): IRExpr => idx(idx(v('x'), v('i')), lit(d));
/** `c[<centre>][d]` — 중심의 좌표. */
const centre = (which: IRExpr, d: number): IRExpr => idx(idx(v('c'), which), lit(d));

/**
 * `(x[i][d]-c[j][d])*(x[i][d]-c[j][d])` — 한 축의 차이를 제곱한 것.
 *
 * 같은 뺄셈을 두 번 적는다. `t = a - b; t * t` 로 줄일 수도 있지만, 코드 패널이
 * 보여야 하는 것은 **차이를 제곱해 더한다** 는 한 덩어리이고 임시 변수는 그것을
 * 두 줄로 쪼갠다.
 */
const axisSq = (which: IRExpr, d: number): IRExpr => {
  const diff = bin('-', point(d), centre(which, d));
  return bin('*', diff, diff);
};

/** `(dx)*(dx) + (dy)*(dy)` — 점 i 와 중심 사이의 **제곱** 거리. sqrt 는 없다. */
const distSq = (which: IRExpr): IRExpr => bin('+', axisSq(which, 0), axisSq(which, 1));

/** `(nx-c[j][0])*(nx-c[j][0]) + (ny-c[j][1])*(ny-c[j][1])` — 중심이 옮긴 제곱 거리. */
const moveSq = (): IRExpr => {
  const dx = bin('-', v('nx'), centre(v('j'), 0));
  const dy = bin('-', v('ny'), centre(v('j'), 1));
  return bin('+', bin('*', dx, dx), bin('*', dy, dy));
};

/** 안쪽 루프 — 중심 하나마다 재고, 더 가까우면 색인째 갈아 끼운다. */
const scanCentres: IRStmt = {
  kind: 'for-range',
  var: 'j',
  from: lit(1),
  to: v('k'),
  inclusive: false,
  phase: 'measure',
  body: [
    { kind: 'var', name: 'dsq', type: tDouble, init: distSq(v('j')), phase: 'measure' },
    {
      kind: 'if',
      cond: bin('<', v('dsq'), v('bestsq')),
      phase: 'pick-nearest',
      then: [
        { kind: 'assign', target: v('bestsq'), expr: v('dsq'), phase: 'pick-nearest' },
        { kind: 'assign', target: v('best'), expr: v('j'), phase: 'pick-nearest' },
      ],
    },
  ],
};

/** 첫 몸짓 — 점마다 가장 가까운 중심에 붙는다. */
const assignStep: IRStmt = {
  kind: 'for-range',
  var: 'i',
  from: lit(0),
  to: v('n'),
  inclusive: false,
  phase: 'measure',
  body: [
    { kind: 'var', name: 'best', type: tInt, init: lit(0), phase: 'measure' },
    { kind: 'var', name: 'bestsq', type: tDouble, init: distSq(lit(0)), phase: 'measure' },
    scanCentres,
    { kind: 'assign', target: idx(v('assign'), v('i')), expr: v('best'), phase: 'assign' },
  ],
};

/** 무리마다 개수와 좌표 합을 비운다. */
const clearTallies: IRStmt = {
  kind: 'for-range',
  var: 'j',
  from: lit(0),
  to: v('k'),
  inclusive: false,
  phase: 'gather',
  body: [
    { kind: 'assign', target: idx(v('counts'), v('j')), expr: lit(0), phase: 'gather' },
    { kind: 'assign', target: idx(idx(v('sums'), v('j')), lit(0)), expr: lit(0), phase: 'gather' },
    { kind: 'assign', target: idx(idx(v('sums'), v('j')), lit(1)), expr: lit(0), phase: 'gather' },
  ],
};

/** 점을 한 번 훑으며 제 무리의 개수와 합에 보탠다. */
const addTallies: IRStmt = {
  kind: 'for-range',
  var: 'i',
  from: lit(0),
  to: v('n'),
  inclusive: false,
  phase: 'gather',
  body: [
    { kind: 'var', name: 'g', type: tInt, init: idx(v('assign'), v('i')), phase: 'gather' },
    {
      kind: 'assign',
      target: idx(v('counts'), v('g')),
      expr: bin('+', idx(v('counts'), v('g')), lit(1)),
      phase: 'gather',
    },
    {
      kind: 'assign',
      target: idx(idx(v('sums'), v('g')), lit(0)),
      expr: bin('+', idx(idx(v('sums'), v('g')), lit(0)), point(0)),
      phase: 'gather',
    },
    {
      kind: 'assign',
      target: idx(idx(v('sums'), v('g')), lit(1)),
      expr: bin('+', idx(idx(v('sums'), v('g')), lit(1)), point(1)),
      phase: 'gather',
    },
  ],
};

/** 둘째 몸짓 — 중심이 제 무리의 평균으로 옮겨 간다. 빈 무리는 그대로 둔다. */
const moveStep: IRStmt = {
  kind: 'for-range',
  var: 'j',
  from: lit(0),
  to: v('k'),
  inclusive: false,
  phase: 'move-center',
  body: [
    {
      kind: 'if',
      cond: bin('>', idx(v('counts'), v('j')), lit(0)),
      phase: 'move-center',
      then: [
        {
          kind: 'var',
          name: 'nx',
          type: tDouble,
          init: bin('/', idx(idx(v('sums'), v('j')), lit(0)), idx(v('counts'), v('j'))),
          phase: 'move-center',
        },
        {
          kind: 'var',
          name: 'ny',
          type: tDouble,
          init: bin('/', idx(idx(v('sums'), v('j')), lit(1)), idx(v('counts'), v('j'))),
          phase: 'move-center',
        },
        {
          kind: 'assign',
          target: v('moved'),
          // 여기서만 sqrt 를 부른다 — 순서가 아니라 옮긴 크기 자체가 답이라서다.
          expr: bin('+', v('moved'), call('sqrt', [moveSq()])),
          phase: 'move-center',
        },
        { kind: 'assign', target: centre(v('j'), 0), expr: v('nx'), phase: 'move-center' },
        { kind: 'assign', target: centre(v('j'), 1), expr: v('ny'), phase: 'move-center' },
      ],
    },
  ],
};

/** k-평균 한 걸음. 돌려주는 값이 0 이면 멎은 것이다. */
export const kmeansStepIR: IR = {
  id: 'kmeans',
  algorithm: 'kmeans',
  paradigm: 'imperative',
  functions: [
    {
      name: 'kmeans_step',
      params: [
        { name: 'x', type: tDoubleGrid },
        { name: 'assign', type: tIntList },
        { name: 'c', type: tDoubleGrid },
        { name: 'counts', type: tIntList },
        { name: 'sums', type: tDoubleGrid },
      ],
      returnType: tDouble,
      body: [
        { kind: 'var', name: 'n', type: tInt, init: len(v('x')), phase: 'begin-round' },
        { kind: 'var', name: 'k', type: tInt, init: len(v('c')), phase: 'begin-round' },
        assignStep,
        clearTallies,
        addTallies,
        { kind: 'var', name: 'moved', type: tDouble, init: lit(0), phase: 'move-center' },
        moveStep,
        { kind: 'return', expr: v('moved'), phase: 'settle-check' },
      ],
    },
  ],
};

export const kmeansIRs: IR[] = [kmeansStepIR];
