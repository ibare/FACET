/**
 * greedyDecoding IR — 표를 걷는 루프와 백만분율 곱셈이 곧 탐욕이다.
 *
 * 낱말은 **번호**(정수)로 건넨다. 번호 차례는 표의 행 차례
 * (`is to learn teach read by doing reading practice daily others more`) 뒤에 끝 표식.
 * 부르는 쪽이 표를 행마다 폭 `width`(= 3) 로 편다 — `nextTok[행 × width + 등수 − 1]`
 * (없으면 −1), `nextProb[…]` (없으면 0).
 *
 * - `greedyWalk(nextTok, nextProb, width, start, firstRank, steps, endTok, picked)` —
 *   글 전체 백만분율을 돌려주고 고른 번호를 `picked` 에 적는다(부르는 쪽이 길이
 *   `steps`, 값 −1 로 만든다). `score × p` 는 지역 변수에 담은 뒤 `// 100`.
 *   그 등수의 후보가 없으면(`tok == -1`) 곧바로 멈춘다 — algorithm 의 멈춤과 같은 자리다.
 *   이 표에서는 걸리지 않는다.
 * - `countRepeats(picked, endTok)` — `picked` 를 −1 까지 훑으며 앞에 나온 번호를 센다
 *   (끝 표식 제외).
 *
 * 이름 — 결과 버퍼는 `picked` 다. `out` 은 C# 예약어라 쓰지 않는다 (S-transpiler).
 * 정수 중간값 최대 `scaled` = 1,000,000 × 40 = 40,000,000 (int32 안). `//` 의 두
 * 피연산자는 늘 음수가 아니다.
 *
 * phase — 'start' | 'pick' | 'score' | 'finish' | 'repeat' (algorithm.ts 와 같다).
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '*' | '//' | '==' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const decl = (name: string, init: IRExpr, phase: string): IRStmt => ({ kind: 'var', name, type: INT, init, phase });
const put = (target: IRExpr, expr: IRExpr, phase: string): IRStmt => ({ kind: 'assign', target, expr, phase });

const greedyWalk: IR['functions'][number] = {
  name: 'greedyWalk',
  params: [
    { name: 'nextTok', type: INTS },
    { name: 'nextProb', type: INTS },
    { name: 'width', type: INT },
    { name: 'start', type: INT },
    { name: 'firstRank', type: INT },
    { name: 'steps', type: INT },
    { name: 'endTok', type: INT },
    { name: 'picked', type: INTS },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'score: whole-sentence probability in millionths' },
    decl('score', n(1_000_000), 'start'),
    decl('cur', v('start'), 'start'),
    {
      kind: 'for-range',
      var: 's',
      from: n(0),
      to: v('steps'),
      inclusive: false,
      phase: 'pick',
      body: [
        { kind: 'comment', text: 'first step takes the chosen rank, every later step takes rank 1' },
        decl('rank', n(1), 'pick'),
        {
          kind: 'if',
          cond: bin('==', v('s'), n(0)),
          then: [put(v('rank'), v('firstRank'), 'pick')],
          phase: 'pick',
        },
        decl('slot', bin('-', bin('+', bin('*', v('cur'), v('width')), v('rank')), n(1)), 'pick'),
        decl('tok', at('nextTok', v('slot')), 'pick'),
        {
          kind: 'if',
          cond: bin('==', v('tok'), n(-1)),
          then: [
            { kind: 'comment', text: 'no candidate at that rank: stop walking' },
            { kind: 'return', expr: v('score'), phase: 'finish' },
          ],
          phase: 'pick',
        },
        decl('scaled', bin('*', v('score'), at('nextProb', v('slot'))), 'score'),
        put(v('score'), bin('//', v('scaled'), n(100)), 'score'),
        put(at('picked', v('s')), v('tok'), 'score'),
        {
          kind: 'if',
          cond: bin('==', v('tok'), v('endTok')),
          then: [
            { kind: 'comment', text: 'the sentence is closed: the remaining steps cost nothing' },
            { kind: 'return', expr: v('score'), phase: 'finish' },
          ],
          phase: 'score',
        },
        put(v('cur'), v('tok'), 'score'),
      ],
    },
    { kind: 'return', expr: v('score'), phase: 'finish' },
  ],
};

const countRepeats: IR['functions'][number] = {
  name: 'countRepeats',
  params: [
    { name: 'picked', type: INTS },
    { name: 'endTok', type: INT },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'count words picked again inside the generated text (the prompt is not counted)' },
    decl('reps', n(0), 'repeat'),
    {
      kind: 'for-range',
      var: 'i',
      from: n(0),
      to: { kind: 'len', of: v('picked') },
      inclusive: false,
      phase: 'repeat',
      body: [
        decl('tok', at('picked', v('i')), 'repeat'),
        { kind: 'if', cond: bin('==', v('tok'), n(-1)), then: [{ kind: 'break', phase: 'repeat' }], phase: 'repeat' },
        {
          kind: 'if',
          cond: bin('!=', v('tok'), v('endTok')),
          phase: 'repeat',
          then: [
            {
              kind: 'for-range',
              var: 'j',
              from: n(0),
              to: v('i'),
              inclusive: false,
              phase: 'repeat',
              body: [
                {
                  kind: 'if',
                  cond: bin('==', at('picked', v('j')), v('tok')),
                  phase: 'repeat',
                  then: [put(v('reps'), bin('+', v('reps'), n(1)), 'repeat'), { kind: 'break', phase: 'repeat' }],
                },
              ],
            },
          ],
        },
      ],
    },
    { kind: 'return', expr: v('reps'), phase: 'repeat' },
  ],
};

export const greedyDecodingImperativeIR: IR = {
  id: 'greedy-decoding-imperative',
  algorithm: 'greedyDecoding',
  paradigm: 'imperative',
  functions: [greedyWalk, countRepeats],
};

export const greedyDecodingIRs: IR[] = [greedyDecodingImperativeIR];
