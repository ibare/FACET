/**
 * register-allocation — 코드 패널: 명령 열에 레지스터를 매기는 **할당기**.
 *
 * 화면의 명령 열(`load t1, a` …)은 입력 자료이고, 이 IR 은 그 열을 번호 배열로 받아 셈하는 컴파일러 함수다.
 * 줄 i 마다 `dst[i]` 정의하는 값 번호(없으면 −1) · `srcA[i]` · `srcB[i]` 읽는 값 번호(없으면 −1).
 * 값 번호 = 임시 번호 − 1 (부르는 쪽이 짓는다). 레지스터 번호 0 … k − 1 (화면 r1 …).
 * 버퍼 `lastUse` · `defLine` · `regOf` · `spilled` (값 수) · `holder` (k) 는 부르는 쪽이 만들어 넘기고
 * IR 이 첫머리에서 채운다. `counts[0]` 밀어냄 · `counts[1]` 되불러옴. 돌려주는 값 = 명령 수.
 * 셈할 수 없으면(밀어낼 값이 없다 · 새 값 자신이 가장 늦게 쓰인다) −1 — 알고리즘이 던지는 자리와 같다.
 *
 * 동률은 번호가 아니라 **정의 줄**로 깬다 — 그래서 값 번호를 섞어도 답이 같다.
 * 간섭 그래프와 칠하기는 두지 않는다 (알고리즘이 셈해 payload 로 — 코드 패널은 할당기 하나).
 *
 * phase ↔ IR 문 (algorithm.ts 와 같은 집합):
 *   take   정의 가지의 `regOf[dst[i]] = r`
 *   evict  정의 가지에서 빈 칸이 없을 때의 `spilled[far] = 1` · `counts[0] += 1`
 *   reload 되불러옴 가지의 `regOf[s] = r` · `counts[1] += 1`
 *   free   풀기 `holder[regOf[…]] = -1`
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '==' | '!=' | '>' | '<' | '>=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const decl = (name: string, init: IRExpr): IRStmt => ({ kind: 'var', name, type: INT, init });
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target, expr } : { kind: 'assign', target, expr, phase };
const when = (cond: IRExpr, then: IRStmt[], otherwise?: IRStmt[]): IRStmt =>
  otherwise === undefined ? { kind: 'if', cond, then } : { kind: 'if', cond, then, else: otherwise };
const loop = (name: string, from: IRExpr, to: IRExpr, body: IRStmt[]): IRStmt => ({
  kind: 'for-range',
  var: name,
  from,
  to,
  inclusive: false,
  body,
});
const note = (text: string): IRStmt => ({ kind: 'comment', text });

/** "가장 먼 값" 고르기 — lastUse 가 크면 바꾸고, 같으면 defLine 이 작으면 바꾼다 */
const pickFar = (): IRStmt[] => [
  when(
    bin('==', v('far'), n(-1)),
    [set(v('far'), v('cand'))],
    [
      when(
        bin('>', at('lastUse', v('cand')), at('lastUse', v('far'))),
        [set(v('far'), v('cand'))],
        [
          when(bin('==', at('lastUse', v('cand')), at('lastUse', v('far'))), [
            when(bin('<', at('defLine', v('cand')), at('defLine', v('far'))), [set(v('far'), v('cand'))]),
          ]),
        ],
      ),
    ],
  ),
];

/** 가장 낮은 빈 칸 — 오름차순으로 돌며 첫 것을 잡는다 */
const lowestFree = (): IRStmt[] => [
  decl('r', n(-1)),
  loop('q', n(0), v('k'), [when(bin('==', v('r'), n(-1)), [when(bin('==', at('holder', v('q')), n(-1)), [set(v('r'), v('q'))])])]),
];

const allocateBody: IRStmt[] = [
  decl('n', { kind: 'len', of: v('dst') }),
  note('reset per-value buffers'),
  loop('w', n(0), v('nVal'), [
    set(at('lastUse', v('w')), n(-1)),
    set(at('defLine', v('w')), n(-1)),
    set(at('regOf', v('w')), n(-1)),
    set(at('spilled', v('w')), n(0)),
  ]),
  note('live ranges: defining line and last reading line of each value'),
  loop('i', n(0), v('n'), [
    when(bin('>=', at('dst', v('i')), n(0)), [set(at('defLine', at('dst', v('i'))), v('i'))]),
    when(bin('>=', at('srcA', v('i')), n(0)), [set(at('lastUse', at('srcA', v('i'))), v('i'))]),
    when(bin('>=', at('srcB', v('i')), n(0)), [set(at('lastUse', at('srcB', v('i'))), v('i'))]),
  ]),
  loop('q', n(0), v('k'), [set(at('holder', v('q')), n(-1))]),
  loop('i', n(0), v('n'), [
    note('(1) reload spilled operands, left operand first'),
    loop('c', n(0), n(2), [
      decl('s', at('srcA', v('i'))),
      when(bin('==', v('c'), n(1)), [set(v('s'), at('srcB', v('i')))]),
      when(bin('>=', v('s'), n(0)), [
        when(bin('==', at('spilled', v('s')), n(1)), [
          ...lowestFree(),
          when(bin('==', v('r'), n(-1)), [
            note('no free register: spill the farthest value this line does not read'),
            decl('far', n(-1)),
            loop('q', n(0), v('k'), [
              decl('cand', at('holder', v('q'))),
              when(bin('!=', v('cand'), at('srcA', v('i'))), [when(bin('!=', v('cand'), at('srcB', v('i'))), pickFar())]),
            ]),
            note('nothing left to spill: cannot allocate'),
            when(bin('==', v('far'), n(-1)), [{ kind: 'return', expr: n(-1) }]),
            set(v('r'), at('regOf', v('far'))),
            set(at('holder', v('r')), n(-1)),
            set(at('regOf', v('far')), n(-1)),
            set(at('spilled', v('far')), n(1)),
            set(at('counts', n(0)), bin('+', at('counts', n(0)), n(1))),
          ]),
          set(at('regOf', v('s')), v('r'), 'reload'),
          set(at('holder', v('r')), v('s')),
          set(at('spilled', v('s')), n(0)),
          set(at('counts', n(1)), bin('+', at('counts', n(1)), n(1)), 'reload'),
        ]),
      ]),
    ]),
    note('(2) free registers whose value is read for the last time here'),
    when(bin('>=', at('srcA', v('i')), n(0)), [
      when(bin('==', at('lastUse', at('srcA', v('i'))), v('i')), [
        set(at('holder', at('regOf', at('srcA', v('i')))), n(-1), 'free'),
      ]),
    ]),
    when(bin('>=', at('srcB', v('i')), n(0)), [
      when(bin('==', at('lastUse', at('srcB', v('i'))), v('i')), [
        when(bin('>=', at('regOf', at('srcB', v('i'))), n(0)), [
          set(at('holder', at('regOf', at('srcB', v('i')))), n(-1), 'free'),
        ]),
      ]),
    ]),
    note('(3) give the defined value the lowest free register'),
    when(bin('>=', at('dst', v('i')), n(0)), [
      ...lowestFree(),
      when(bin('==', v('r'), n(-1)), [
        note('no free register: spill the value whose last read is farthest'),
        decl('far', n(-1)),
        loop('q', n(0), v('k'), [decl('cand', at('holder', v('q'))), ...pickFar()]),
        note('nothing to spill, or the new value itself is read last: cannot allocate'),
        when(bin('==', v('far'), n(-1)), [{ kind: 'return', expr: n(-1) }]),
        when(bin('>', at('lastUse', at('dst', v('i'))), at('lastUse', v('far'))), [{ kind: 'return', expr: n(-1) }]),
        set(v('r'), at('regOf', v('far'))),
        set(at('regOf', v('far')), n(-1)),
        set(at('spilled', v('far')), n(1), 'evict'),
        set(at('counts', n(0)), bin('+', at('counts', n(0)), n(1)), 'evict'),
      ]),
      set(at('regOf', at('dst', v('i'))), v('r'), 'take'),
      set(at('holder', v('r')), at('dst', v('i'))),
    ]),
  ]),
  { kind: 'return', expr: bin('+', v('n'), bin('+', at('counts', n(0)), at('counts', n(1)))) },
];

export const regAllocImperativeIR: IR = {
  id: 'register-allocation-imperative',
  algorithm: 'registerAllocation',
  paradigm: 'imperative',
  functions: [
    {
      name: 'allocate',
      params: [
        { name: 'dst', type: INTS },
        { name: 'srcA', type: INTS },
        { name: 'srcB', type: INTS },
        { name: 'nVal', type: INT },
        { name: 'k', type: INT },
        { name: 'lastUse', type: INTS },
        { name: 'defLine', type: INTS },
        { name: 'regOf', type: INTS },
        { name: 'holder', type: INTS },
        { name: 'spilled', type: INTS },
        { name: 'counts', type: INTS },
      ],
      returnType: INT,
      body: allocateBody,
    },
  ],
};

export const regAllocIRs: IR[] = [regAllocImperativeIR];
