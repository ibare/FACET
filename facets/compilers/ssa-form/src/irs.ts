/**
 * ssa-form 의 IR — **컴파일 셈만** 편다: `numberVersions` 가 판을, `placePhis` 가 파이를 셈한다.
 *
 * 돌림(인자 a 를 넣고 만든 SSA 를 실행하는 일)은 IR 에 두지 않는다. 돌림은 컴파일러가 아니라 컴파일러가
 * **만든 코드**가 하는 일이고, a 를 바꿔 돌려도 코드 패널의 답(판 · 파이)이 그대로인 것이 이 완제품 주장의
 * 절반이다 ("판은 컴파일 때 정해지고 돌림은 그중 하나를 고른다"). 그래서 돌림 두 걸음에는 phase 가 없고
 * projector 가 코드 패널 강조를 끈다.
 *
 * 매개변수 (부르는 쪽이 만든다 — IR 은 배열을 만들 수 없다)
 * - insBlock[i] 명령의 블록 · readName[i*2+j] 읽는 두 칸의 이름 번호(판 받는 이름이 아니면 -1) ·
 *   writeName[i] 넣는 이름 번호(-1). 이름 번호 = 첫 넣기 차례. pred0[b] · pred1[b] 앞선 블록(블록 번호 차례, 없으면 -1)
 * - cur(블록 수 × 이름 수) · counter(이름 수) · readVer(2 × 명령 수) · writeVer(명령 수) — 0 으로 채워 건넨다
 * - phiBlock · phiName · phiVer(이름 수) · phiArg(2 × 이름 수 — [k*2] 는 pred0 끝 판, [k*2+1] 은 pred1 끝 판)
 *
 * phase 어휘: `rename` · `phi-new` · `phi-same` (algorithm.ts 와 같다).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '*' | '<' | '>=' | '==' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const put = (arr: string, idx: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined
    ? { kind: 'assign', target: at(arr, idx), expr }
    : { kind: 'assign', target: at(arr, idx), expr, phase };
/** 블록 b 의 이름 칸 — b * nNames + name */
const slot = (b: IRExpr, name: IRExpr): IRExpr => bin('+', bin('*', b, v('nNames')), name);

const placePhis = {
  name: 'placePhis',
  params: [
    { name: 'b', type: INT },
    { name: 'start', type: INT },
    { name: 'pred0', type: INTS },
    { name: 'pred1', type: INTS },
    { name: 'nNames', type: INT },
    { name: 'cur', type: INTS },
    { name: 'counter', type: INTS },
    { name: 'phiBlock', type: INTS },
    { name: 'phiName', type: INTS },
    { name: 'phiVer', type: INTS },
    { name: 'phiArg', type: INTS },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'Head versions of block b. One predecessor: copy its end versions (none: 0).' },
    { kind: 'comment', text: 'Two predecessors: per name, a phi only when the two end versions differ.' },
    { kind: 'var', name: 'placed', type: INT, init: n(0) },
    {
      kind: 'for-range',
      var: 'nm',
      from: n(0),
      to: v('nNames'),
      inclusive: false,
      body: [
        {
          kind: 'if',
          cond: bin('<', at('pred1', v('b')), n(0)),
          then: [
            {
              kind: 'if',
              cond: bin('<', at('pred0', v('b')), n(0)),
              then: [put('cur', slot(v('b'), v('nm')), n(0))],
              else: [put('cur', slot(v('b'), v('nm')), at('cur', slot(at('pred0', v('b')), v('nm'))))],
            },
          ],
          else: [
            { kind: 'var', name: 'v0', type: INT, init: at('cur', slot(at('pred0', v('b')), v('nm'))) },
            { kind: 'var', name: 'v1', type: INT, init: at('cur', slot(at('pred1', v('b')), v('nm'))) },
            {
              kind: 'if',
              cond: bin('==', v('v0'), v('v1')),
              then: [
                { kind: 'comment', text: 'Same version from both sides: it passes through, no phi.' },
                put('cur', slot(v('b'), v('nm')), v('v0'), 'phi-same'),
              ],
              else: [
                { kind: 'comment', text: 'Different versions: a phi takes the next number of this name.' },
                put('counter', v('nm'), bin('+', at('counter', v('nm')), n(1)), 'phi-new'),
                { kind: 'var', name: 'k', type: INT, init: bin('+', v('start'), v('placed')) },
                put('phiBlock', v('k'), v('b')),
                put('phiName', v('k'), v('nm')),
                put('phiVer', v('k'), at('counter', v('nm'))),
                put('phiArg', bin('*', v('k'), n(2)), v('v0')),
                put('phiArg', bin('+', bin('*', v('k'), n(2)), n(1)), v('v1')),
                put('cur', slot(v('b'), v('nm')), at('counter', v('nm'))),
                { kind: 'assign', target: v('placed'), expr: bin('+', v('placed'), n(1)) },
              ],
            },
          ],
        },
      ],
    },
    { kind: 'return', expr: v('placed') },
  ],
} satisfies IR['functions'][number];

const numberVersions = {
  name: 'numberVersions',
  params: [
    { name: 'insBlock', type: INTS },
    { name: 'readName', type: INTS },
    { name: 'writeName', type: INTS },
    { name: 'pred0', type: INTS },
    { name: 'pred1', type: INTS },
    { name: 'nNames', type: INT },
    { name: 'cur', type: INTS },
    { name: 'counter', type: INTS },
    { name: 'readVer', type: INTS },
    { name: 'writeVer', type: INTS },
    { name: 'phiBlock', type: INTS },
    { name: 'phiName', type: INTS },
    { name: 'phiVer', type: INTS },
    { name: 'phiArg', type: INTS },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'Blocks in text order, instructions top to bottom.' },
    { kind: 'comment', text: 'Reads (right side) take the current version first, then the write gets a new one.' },
    { kind: 'var', name: 'b', type: INT, init: n(-1) },
    { kind: 'var', name: 'nPhi', type: INT, init: n(0) },
    {
      kind: 'for-range',
      var: 'i',
      from: n(0),
      to: { kind: 'len', of: v('insBlock') },
      inclusive: false,
      body: [
        {
          kind: 'if',
          cond: bin('!=', at('insBlock', v('i')), v('b')),
          then: [
            { kind: 'assign', target: v('b'), expr: at('insBlock', v('i')) },
            {
              kind: 'assign',
              target: v('nPhi'),
              expr: bin('+', v('nPhi'), {
                kind: 'call',
                fn: 'placePhis',
                args: [
                  v('b'),
                  v('nPhi'),
                  v('pred0'),
                  v('pred1'),
                  v('nNames'),
                  v('cur'),
                  v('counter'),
                  v('phiBlock'),
                  v('phiName'),
                  v('phiVer'),
                  v('phiArg'),
                ],
              }),
            },
          ],
        },
        {
          kind: 'for-range',
          var: 'j',
          from: n(0),
          to: n(2),
          inclusive: false,
          body: [
            { kind: 'var', name: 'r', type: INT, init: at('readName', bin('+', bin('*', v('i'), n(2)), v('j'))) },
            {
              kind: 'if',
              cond: bin('>=', v('r'), n(0)),
              then: [put('readVer', bin('+', bin('*', v('i'), n(2)), v('j')), at('cur', slot(v('b'), v('r'))), 'rename')],
            },
          ],
        },
        { kind: 'var', name: 'w', type: INT, init: at('writeName', v('i')) },
        {
          kind: 'if',
          cond: bin('>=', v('w'), n(0)),
          then: [
            put('counter', v('w'), bin('+', at('counter', v('w')), n(1)), 'rename'),
            put('cur', slot(v('b'), v('w')), at('counter', v('w'))),
            put('writeVer', v('i'), at('counter', v('w'))),
          ],
        },
      ],
    },
    { kind: 'return', expr: v('nPhi') },
  ],
} satisfies IR['functions'][number];

export const ssaFormImperativeIR: IR = {
  id: 'ssa-form-imperative',
  algorithm: 'ssaForm',
  paradigm: 'imperative',
  functions: [numberVersions, placePhis],
};

export const ssaFormIRs: IR[] = [ssaFormImperativeIR];
