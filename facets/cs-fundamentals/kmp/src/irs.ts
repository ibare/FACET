/**
 * kmp 의 IR — 표를 세우는 일과, 그 표를 쓰는 훑기와 안 쓰는 훑기.
 *
 * 세 함수가 배열·반복·조건뿐이라 이름 붙인 호출 뒤로 숨을 것이 없다. 큐도 맵도
 * 필요 없고 비트 연산도 쓰지 않는다.
 *
 * ── 왜 두 훑기를 **같은 뼈대**로 적는가
 *
 * `naive_search` 와 `kmp_search` 는 바깥 루프도, 안쪽 견줌 루프도 글자까지 같다.
 * 갈리는 것은 딱 둘이다.
 *
 *   1. 안쪽 루프가 어디서 시작하는가 — 단순은 늘 `0`, KMP 는 `keep` 부터.
 *      `keep` 이 곧 **버리지 않은 것**이다.
 *   2. 몇 칸 미는가 — 단순은 늘 `1`, KMP 는 `k - keep` (맞은 만큼에서 겹침을 뺀 것).
 *
 * 두 조각(`naiveShiftByOne` · `prefixSuffixJump`)이 따로 말한 것이 여기서 두
 * 줄의 차이로 붙는다. 그것을 보이는 것이 이 패널의 몫이라, 굳이 표준 교과서의
 * 글자 단위 형태로 적지 않았다.
 *
 * ── 왜 글자 단위 형태가 아닌가 (수가 갈리는 자리다)
 *
 * 교과서의 KMP 는 글의 **모든 글자**를 훑는다. 그러면 패턴이 더 들어갈 수 없는
 * 마지막 `m-1` 칸까지 읽어 견줌이 몇 번 더 든다 — 화면은 자리 단위로 세는데
 * 코드 패널만 그 꼬리를 더 세면 **두 수가 어긋난다** (실측: 길이 6 에서 77 대 72).
 * 코드 패널이 화면과 다른 수를 말하는 것이 곧 거짓말이므로, 자리 단위로 통일했다.
 * 두 형태의 결과(찾은 자리)는 같고 갈리는 것은 견줌 횟수뿐이다.
 *
 * ── 중간값
 *
 * 가장 큰 중간값은 `start + k` 로 글 길이를 넘지 않는다 (54). 32비트를 넘칠
 * 자리가 없으므로 여섯 언어가 같은 답을 낸다.
 *
 * ── 식별자
 *
 * `text` · `pat` · `fail` · `n` · `m` · `cmp` · `k` · `i` · `start` · `keep`.
 * C# 예약어(`base` · `out` · `ref` · `params` · `lock` · `event` · `string` ·
 * `object`)를 피했다 — transpiler 는 예약어를 고쳐 주지 않는다 (S-transpiler).
 *
 * phase 어휘는 algorithm.ts 와 집합이 완전히 일치한다 (C3):
 *   'build' | 'scan' | 'shift' | 'found'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const STR: IRType = { kind: 'string' };
const INTS: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '<' | '<=' | '>' | '==' | '!=' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: IRExpr, idx: IRExpr): IRExpr => ({ kind: 'index', arr, idx });
const decl = (name: string, type: IRType, init: IRExpr, phase?: string): IRStmt => ({
  kind: 'var',
  name,
  type,
  init,
  phase,
});
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt => ({
  kind: 'assign',
  target,
  expr,
  phase,
});

/** `text[start + k]` — 글에서 지금 보는 글자. */
const textAt = (offset: IRExpr): IRExpr => at(v('text'), offset);

/**
 * 안쪽 견줌 루프. 두 훑기가 이것을 **글자까지 똑같이** 쓴다.
 *
 * `from` 만 다르다 — 단순은 `0`, KMP 는 `keep`. 견줌은 맞은 글자마다 하나,
 * 어긋난 자리에서 하나다.
 */
const compareLoop = (fromExpr: IRExpr): IRStmt[] => [
  decl('k', INT, fromExpr),
  {
    kind: 'while',
    cond: bin('<', v('k'), v('m')),
    body: [
      set(v('cmp'), bin('+', v('cmp'), lit(1)), 'scan'),
      {
        kind: 'if',
        cond: bin('!=', textAt(bin('+', v('start'), v('k'))), at(v('pat'), v('k'))),
        then: [{ kind: 'break' }],
        phase: 'scan',
      },
      set(v('k'), bin('+', v('k'), lit(1)), 'scan'),
    ],
  },
];

/** 단순 방식 — 자리마다 앞에서부터 다시, 어긋나면 한 칸. */
const naiveBody: IRStmt[] = [
  decl('n', INT, { kind: 'len', of: v('text') }),
  decl('m', INT, { kind: 'len', of: v('pat') }),
  decl('cmp', INT, lit(0)),
  decl('start', INT, lit(0)),
  {
    kind: 'while',
    cond: bin('<=', bin('+', v('start'), v('m')), v('n')),
    body: [
      // 여태 맞힌 것을 남기지 않는다. 늘 패턴의 맨 앞부터 다시 견준다.
      ...compareLoop(lit(0)),
      set(v('start'), bin('+', v('start'), lit(1)), 'shift'),
    ],
  },
  { kind: 'return', expr: v('cmp') },
];

/** 실패 함수 — 앞서 정한 값을 되짚어 한 줄로 세운다. */
const buildBody: IRStmt[] = [
  decl('m', INT, { kind: 'len', of: v('pat') }),
  decl('cmp', INT, lit(0)),
  decl('k', INT, lit(0)),
  set(at(v('fail'), lit(0)), lit(0), 'build'),
  decl('i', INT, lit(1)),
  {
    kind: 'while',
    cond: bin('<', v('i'), v('m')),
    body: [
      {
        kind: 'while',
        cond: bin(
          '&&',
          bin('>', v('k'), lit(0)),
          bin('!=', at(v('pat'), v('i')), at(v('pat'), v('k'))),
        ),
        body: [
          set(v('cmp'), bin('+', v('cmp'), lit(1)), 'build'),
          set(v('k'), at(v('fail'), bin('-', v('k'), lit(1))), 'build'),
        ],
        phase: 'build',
      },
      set(v('cmp'), bin('+', v('cmp'), lit(1)), 'build'),
      {
        kind: 'if',
        cond: bin('==', at(v('pat'), v('i')), at(v('pat'), v('k'))),
        then: [set(v('k'), bin('+', v('k'), lit(1)), 'build')],
        phase: 'build',
      },
      set(at(v('fail'), v('i')), v('k'), 'build'),
      set(v('i'), bin('+', v('i'), lit(1))),
    ],
  },
  { kind: 'return', expr: v('cmp') },
];

/** KMP — 앞 `keep` 은 맞은 것으로 두고, 어긋나면 겹친 만큼만 민다. */
const kmpBody: IRStmt[] = [
  decl('n', INT, { kind: 'len', of: v('text') }),
  decl('m', INT, { kind: 'len', of: v('pat') }),
  decl('cmp', INT, lit(0)),
  decl('start', INT, lit(0)),
  decl('keep', INT, lit(0)),
  {
    kind: 'while',
    cond: bin('<=', bin('+', v('start'), v('m')), v('n')),
    body: [
      // 앞 `keep` 글자는 지난 걸음에 이미 맞은 것이다. 다시 보지 않는다.
      ...compareLoop(v('keep')),
      {
        kind: 'if',
        cond: bin('==', v('k'), v('m')),
        then: [
          set(v('keep'), at(v('fail'), bin('-', v('m'), lit(1))), 'found'),
          set(v('start'), bin('+', v('start'), bin('-', v('m'), v('keep'))), 'found'),
        ],
        else: [
          {
            kind: 'if',
            cond: bin('==', v('k'), lit(0)),
            then: [
              // 맞은 것이 없으면 빌릴 겹침도 없다. 그때만 한 칸이다.
              set(v('keep'), lit(0), 'shift'),
              set(v('start'), bin('+', v('start'), lit(1)), 'shift'),
            ],
            else: [
              set(v('keep'), at(v('fail'), bin('-', v('k'), lit(1))), 'shift'),
              set(v('start'), bin('+', v('start'), bin('-', v('k'), v('keep'))), 'shift'),
            ],
            phase: 'shift',
          },
        ],
        phase: 'scan',
      },
    ],
  },
  { kind: 'return', expr: v('cmp') },
];

export const kmpImperativeIR: IR = {
  id: 'kmp-imperative',
  algorithm: 'kmp',
  paradigm: 'imperative',
  functions: [
    {
      name: 'build_table',
      params: [
        { name: 'pat', type: STR },
        { name: 'fail', type: INTS },
      ],
      returnType: INT,
      body: buildBody,
    },
    {
      name: 'naive_search',
      params: [
        { name: 'text', type: STR },
        { name: 'pat', type: STR },
      ],
      returnType: INT,
      body: naiveBody,
    },
    {
      name: 'kmp_search',
      params: [
        { name: 'text', type: STR },
        { name: 'pat', type: STR },
        { name: 'fail', type: INTS },
      ],
      returnType: INT,
      body: kmpBody,
    },
  ],
};

export const kmpIRs: IR[] = [kmpImperativeIR];
