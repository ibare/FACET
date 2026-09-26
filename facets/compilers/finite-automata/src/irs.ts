/**
 * finite-automata 의 코드 패널 — **DFA 걷기**만 둔다.
 *
 * 부분집합 구성은 IR 에 두지 않는다. 덩이를 0/1 행으로 펴 버퍼에 쓰면 IR 로도 지을 수 있지만, 그러면 코드 패널이
 * 구성 기계가 되어 이 facet 의 반쪽 — "걷는 걸음은 k 와 상관없이 글자 수 그대로" — 가 가려진다. 코드 패널은 지어진
 * 표만 읽는 운전기다: 알고리즘이 지은 DFA 를 배열로 넘기고 IR 은 표만 읽는다. 화면의 DFA 자리 수는 IR 밖(알고리즘)의
 * 셈이고, 코드 패널이 내는 답(받음 · 멈춘 자리 · 걸은 길)은 화면과 같다 (test 가 열여섯 조합 전부를 잠근다).
 *
 * 인자:
 *   delta     편 1차 배열 — delta[s * 2 + c] (글자 번호 a 0 · b 1)
 *   accepting 0/1 — 덩이 s 가 NFA 받는 자리를 품으면 1
 *   word      글자 번호 배열
 *   path      길이 = 글자 수 + 1 (부르는 쪽이 만든다) — 걸은 덩이 번호를 적는다
 *
 * phase: follow-edge (글자 하나에 옮김 하나) · verdict (멈춘 자리로 판정)
 */
import type { IR, IRExpr, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };
const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });

export const finiteAutomataImperativeIR: IR = {
  id: 'finite-automata-imperative',
  algorithm: 'finiteAutomata',
  paradigm: 'imperative',
  functions: [
    {
      name: 'accepts',
      params: [
        { name: 'delta', type: INTS },
        { name: 'accepting', type: INTS },
        { name: 'word', type: INTS },
        { name: 'path', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'walk the built DFA, then judge by the one state it stopped in' },
        {
          kind: 'var',
          name: 'stop',
          type: INT,
          init: { kind: 'call', fn: 'walkDfa', args: [v('delta'), v('word'), v('path')] },
        },
        { kind: 'return', expr: at('accepting', v('stop')), phase: 'verdict' },
      ],
    },
    {
      name: 'walkDfa',
      params: [
        { name: 'delta', type: INTS },
        { name: 'word', type: INTS },
        { name: 'path', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'one letter, one transition: the step count is the word length' },
        { kind: 'var', name: 'cur', type: INT, init: lit(0) },
        { kind: 'assign', target: at('path', lit(0)), expr: lit(0) },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: { kind: 'len', of: v('word') },
          inclusive: false,
          body: [
            {
              kind: 'assign',
              target: v('cur'),
              expr: at(
                'delta',
                { kind: 'binop', op: '+', l: { kind: 'binop', op: '*', l: v('cur'), r: lit(2) }, r: at('word', v('i')) },
              ),
              phase: 'follow-edge',
            },
            {
              kind: 'assign',
              target: at('path', { kind: 'binop', op: '+', l: v('i'), r: lit(1) }),
              expr: v('cur'),
            },
          ],
        },
        { kind: 'return', expr: v('cur') },
      ],
    },
  ],
};

export const finiteAutomataIRs: IR[] = [finiteAutomataImperativeIR];
