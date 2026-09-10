/**
 * 계층 군집화의 **병합 한 걸음** 학습용 IR — 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def merge_step(x, member, alive, merged, mode):
 *       n = len(member)                                     # phase: scan-pairs
 *       best = -1                                           # phase: scan-pairs
 *       bi = -1                                             # phase: scan-pairs
 *       bj = -1                                             # phase: scan-pairs
 *       for i in range(n):                                  # phase: scan-pairs
 *           if alive[i] == 1:
 *               for j in range(i + 1, n):
 *                   if alive[j] == 1:
 *                       acc = 0                             # phase: point-pair
 *                       cnt = 0                             # phase: point-pair
 *                       for p in range(n):
 *                           if member[p] == i:
 *                               for q in range(n):
 *                                   if member[q] == j:
 *                                       dx = x[p][0] - x[q][0]
 *                                       dy = x[p][1] - x[q][1]
 *                                       d = sqrt(dx * dx + dy * dy)
 *                                       if mode == 0 and (cnt == 0 or d < acc):
 *                                           acc = d          # phase: link-single
 *                                       if mode == 1 and (cnt == 0 or d > acc):
 *                                           acc = d          # phase: link-complete
 *                                       if mode == 2:
 *                                           acc = acc + d    # phase: link-average
 *                                       cnt = cnt + 1
 *                       if mode == 2:
 *                           acc = acc / cnt                  # phase: link-average
 *                       if best < 0 or acc < best:           # phase: pick-closest
 *                           best = acc
 *                           bi = i
 *                           bj = j
 *       for p in range(n):                                   # phase: merge
 *           if member[p] == bj:
 *               member[p] = bi
 *       alive[bj] = 0
 *       merged[0] = bi                                       # phase: report
 *       merged[1] = bj
 *       merged[2] = best
 *       return best
 *
 * ── 세 연결 방식의 차이는 안쪽 루프의 세 줄이다
 *
 * 이 IR 의 존재 이유가 그 세 줄이다. 무리 사이의 거리를 **점쌍 거리의 최솟값**
 * 으로 볼 것인가(`d < acc`), **최댓값**으로 볼 것인가(`d > acc`), **합을 세었다
 * 나눌 것인가**(`acc + d` 뒤의 `acc / cnt`). 바깥의 스무 줄은 셋이 글자 하나
 * 다르지 않고, 나무가 갈리는 자리는 저 세 줄뿐이다. `linkage(mode, i, j)` 같은
 * 이름으로 감싸면 코드 패널이 정확히 그 사실을 못 보인다.
 *
 * ── 펼친 것
 *
 * - **거리** — `sqrt(dx*dx + dy*dy)`. `sqrt` 는 예약 이름 일곱 중 하나라 그냥
 *   부르고 여섯 언어가 제 표기로 옮긴다(`math.sqrt` · `Math.sqrt` · `std::sqrt` ·
 *   `Math.Sqrt`). **제곱 거리로 줄이지 않았다** — 이 값이 곧 화면의 나무 높이라,
 *   제곱이면 자르는 높이가 뜻을 잃는다.
 * - **무리의 소속** — 무리 객체나 인접 행렬을 두지 않고 `member` 배열 하나로
 *   편다. "무리 i" 는 `member[p] == i` 인 점들이고, 병합은 그 값을 갈아 끼우는
 *   일이다. 그것이 이 알고리즘이 실제로 하는 일이다.
 * - **살아 있는 무리** — `alive` 배열. 합쳐진 쪽은 `alive[bj] = 0` 으로 지운다.
 *
 * ── 감싼 것 — 없다
 *
 * `zeros` 류 이름은 쓰지 않는다. `member` · `alive` · `merged` 는 모두 **인자로
 * 받는다**. 호출부가 만들어 넘기므로 여섯 언어 어디서도 없는 이름을 부르지 않는다.
 *
 * ── 이름 고르기
 *
 * 결과를 담는 인자는 `out` 이 자연스럽지만 **C# 의 예약어**라 `merged` 로 적었다
 * (이 저장소의 transpiler 는 식별자를 개명하지 않는다). `merged` 는 길이 셋의
 * 실수 배열이고 `[합친 쪽 번호, 사라진 쪽 번호, 높이]` 다. 높이는 반환값으로도
 * 나가는데, 호출부가 배열을 열어 보지 않고도 한 걸음의 답을 받게 하기 위함이다.
 *
 * `d` 를 `dist` 로 늘리지 않은 것은 이 식이 한 줄 안에 세 번 나오기 때문이고,
 * `acc` 는 "지금까지 모은 것" 이라 세 방식에 다 맞는 유일한 이름이라 골랐다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'scan-pairs' | 'point-pair' | 'link-single' | 'link-complete' |
 *   'link-average' | 'pick-closest' | 'merge' | 'report'
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
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

/** `x[p][0]` — p 번째 점의 가로. 2차원 색인의 중첩이다. */
const px = idx(idx(v('x'), v('p')), lit(0));
/** `x[p][1]` */
const py = idx(idx(v('x'), v('p')), lit(1));
/** `x[q][0]` */
const qx = idx(idx(v('x'), v('q')), lit(0));
/** `x[q][1]` */
const qy = idx(idx(v('x'), v('q')), lit(1));

/**
 * 한 연결 방식의 갱신 한 줄.
 *
 * `mode == m` 이고 조건이 서면 `acc = d`. 셋 중 둘(최소·최대)이 이 꼴이고,
 * 평균만 합을 세는 다른 꼴이라 그것은 아래에 직접 적는다.
 */
const linkPick = (mode: number, op: '<' | '>', phase: string): IRStmt => ({
  kind: 'if',
  phase,
  cond: bin(
    '&&',
    bin('==', v('mode'), lit(mode)),
    bin('||', bin('==', v('cnt'), lit(0)), bin(op, v('d'), v('acc'))),
  ),
  then: [{ kind: 'assign', phase, target: v('acc'), expr: v('d') }],
});

/** 점쌍 하나를 재고 세 방식 중 제 것으로 모으는 안쪽 몸통. */
const pointPairBody: IRStmt[] = [
  { kind: 'var', phase: 'point-pair', name: 'dx', type: tDouble, init: bin('-', px, qx) },
  { kind: 'var', phase: 'point-pair', name: 'dy', type: tDouble, init: bin('-', py, qy) },
  {
    kind: 'var',
    phase: 'point-pair',
    name: 'd',
    type: tDouble,
    init: call('sqrt', [bin('+', bin('*', v('dx'), v('dx')), bin('*', v('dy'), v('dy')))]),
  },
  // ── 나무가 갈리는 세 줄 ────────────────────────────────────────────────
  linkPick(0, '<', 'link-single'),
  linkPick(1, '>', 'link-complete'),
  {
    kind: 'if',
    phase: 'link-average',
    cond: bin('==', v('mode'), lit(2)),
    then: [
      { kind: 'assign', phase: 'link-average', target: v('acc'), expr: bin('+', v('acc'), v('d')) },
    ],
  },
  // ──────────────────────────────────────────────────────────────────────
  { kind: 'assign', phase: 'point-pair', target: v('cnt'), expr: bin('+', v('cnt'), lit(1)) },
];

/** 무리 i 와 무리 j 사이의 거리를 재고, 지금까지의 최선과 견준다. */
const clusterPairBody: IRStmt[] = [
  { kind: 'var', phase: 'point-pair', name: 'acc', type: tDouble, init: lit(0) },
  { kind: 'var', phase: 'point-pair', name: 'cnt', type: tInt, init: lit(0) },
  {
    kind: 'for-range',
    phase: 'point-pair',
    var: 'p',
    from: lit(0),
    to: v('n'),
    inclusive: false,
    body: [
      {
        kind: 'if',
        phase: 'point-pair',
        cond: bin('==', idx(v('member'), v('p')), v('i')),
        then: [
          {
            kind: 'for-range',
            phase: 'point-pair',
            var: 'q',
            from: lit(0),
            to: v('n'),
            inclusive: false,
            body: [
              {
                kind: 'if',
                phase: 'point-pair',
                cond: bin('==', idx(v('member'), v('q')), v('j')),
                then: pointPairBody,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    kind: 'if',
    phase: 'link-average',
    cond: bin('==', v('mode'), lit(2)),
    then: [
      { kind: 'assign', phase: 'link-average', target: v('acc'), expr: bin('/', v('acc'), v('cnt')) },
    ],
  },
  {
    kind: 'if',
    phase: 'pick-closest',
    cond: bin('||', bin('<', v('best'), lit(0)), bin('<', v('acc'), v('best'))),
    then: [
      { kind: 'assign', phase: 'pick-closest', target: v('best'), expr: v('acc') },
      { kind: 'assign', phase: 'pick-closest', target: v('bi'), expr: v('i') },
      { kind: 'assign', phase: 'pick-closest', target: v('bj'), expr: v('j') },
    ],
  },
];

export const hierarchicalMergeIR: IR = {
  id: 'hierarchical',
  algorithm: 'hierarchical',
  paradigm: 'imperative',
  functions: [
    {
      name: 'merge_step',
      params: [
        { name: 'x', type: tDoubleGrid },
        { name: 'member', type: tIntList },
        { name: 'alive', type: tIntList },
        { name: 'merged', type: tDoubleList },
        { name: 'mode', type: tInt },
      ],
      returnType: tDouble,
      body: [
        { kind: 'var', phase: 'scan-pairs', name: 'n', type: tInt, init: len(v('member')) },
        { kind: 'var', phase: 'scan-pairs', name: 'best', type: tDouble, init: lit(-1) },
        { kind: 'var', phase: 'scan-pairs', name: 'bi', type: tInt, init: lit(-1) },
        { kind: 'var', phase: 'scan-pairs', name: 'bj', type: tInt, init: lit(-1) },
        {
          kind: 'for-range',
          phase: 'scan-pairs',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              phase: 'scan-pairs',
              cond: bin('==', idx(v('alive'), v('i')), lit(1)),
              then: [
                {
                  kind: 'for-range',
                  phase: 'scan-pairs',
                  var: 'j',
                  from: bin('+', v('i'), lit(1)),
                  to: v('n'),
                  inclusive: false,
                  body: [
                    {
                      kind: 'if',
                      phase: 'scan-pairs',
                      cond: bin('==', idx(v('alive'), v('j')), lit(1)),
                      then: clusterPairBody,
                    },
                  ],
                },
              ],
            },
          ],
        },
        // 가장 가까운 쌍을 찾았다 — member 를 갈아 끼우고 alive 를 지운다.
        {
          kind: 'for-range',
          phase: 'merge',
          var: 'p',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              phase: 'merge',
              cond: bin('==', idx(v('member'), v('p')), v('bj')),
              then: [
                { kind: 'assign', phase: 'merge', target: idx(v('member'), v('p')), expr: v('bi') },
              ],
            },
          ],
        },
        { kind: 'assign', phase: 'merge', target: idx(v('alive'), v('bj')), expr: lit(0) },
        { kind: 'assign', phase: 'report', target: idx(v('merged'), lit(0)), expr: v('bi') },
        { kind: 'assign', phase: 'report', target: idx(v('merged'), lit(1)), expr: v('bj') },
        { kind: 'assign', phase: 'report', target: idx(v('merged'), lit(2)), expr: v('best') },
        { kind: 'return', phase: 'report', expr: v('best') },
      ],
    },
  ],
};

export const hierarchicalIRs: IR[] = [hierarchicalMergeIR];
