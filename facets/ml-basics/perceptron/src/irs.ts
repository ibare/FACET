/**
 * 퍼셉트론 학습 규칙의 IR — 코드 패널이 여섯 언어로 옮긴다.
 *
 * `algorithm.ts` 의 `perceptronTrain` 과 한 줄씩 같은 셈이다. 정수뿐이라 여섯 언어가 끝자리까지 같다.
 * IR 은 배열을 만들 수 없어 버퍼(w · seen0 · seen1 · seen2 · errs · hit)를 매개변수로 받는다 — 부르는
 * 쪽이 길이(w 3 · seen* maxEpochs + 1 · errs maxEpochs · hit 1)만큼 만든다.
 *
 * 돌려줌: 양수 = 멈춘 에폭 · 음수 = −(되풀이를 찾은 에폭), 짝은 hit[0] · 0 = 상한.
 * phase 어휘: sweep · stop · repeat (algorithm.ts 와 같다).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '-' | '*' | '>' | '==' | '!=' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: o, l, r });
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const wAt = (k: number): IRExpr => at('w', n(k));

/** 에폭 끝 무게가 에폭 k 끝의 무게와 모두 같은가 */
const sameAsSeen = op(
  '&&',
  op('&&', op('==', at('seen0', v('k')), wAt(0)), op('==', at('seen1', v('k')), wAt(1))),
  op('==', at('seen2', v('k')), wAt(2)),
);

export const perceptronImperativeIR: IR = {
  id: 'perceptron-imperative',
  algorithm: 'perceptron',
  paradigm: 'imperative',
  functions: [
    {
      name: 'perceptronTrain',
      params: [
        { name: 'xs1', type: LIST },
        { name: 'xs2', type: LIST },
        { name: 'ys', type: LIST },
        { name: 'w', type: LIST },
        { name: 'seen0', type: LIST },
        { name: 'seen1', type: LIST },
        { name: 'seen2', type: LIST },
        { name: 'errs', type: LIST },
        { name: 'hit', type: LIST },
        { name: 'maxEpochs', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'start from zero weights; epoch 0 remembers them' },
        set(wAt(0), n(0)),
        set(wAt(1), n(0)),
        set(wAt(2), n(0)),
        set(at('seen0', n(0)), n(0)),
        set(at('seen1', n(0)), n(0)),
        set(at('seen2', n(0)), n(0)),
        { kind: 'var', name: 'count', type: INT, init: { kind: 'len', of: v('ys') } },
        {
          kind: 'for-range',
          var: 'ep',
          from: n(1),
          to: v('maxEpochs'),
          inclusive: true,
          body: [
            { kind: 'comment', text: 'one epoch: visit the points in their written order' },
            { kind: 'var', name: 'e', type: INT, init: n(0), phase: 'sweep' },
            {
              kind: 'for-range',
              var: 'i',
              from: n(0),
              to: v('count'),
              inclusive: false,
              phase: 'sweep',
              body: [
                {
                  kind: 'var',
                  name: 's',
                  type: INT,
                  init: op('+', op('+', wAt(0), op('*', wAt(1), at('xs1', v('i')))), op('*', wAt(2), at('xs2', v('i')))),
                  phase: 'sweep',
                },
                { kind: 'comment', text: 'on only when the sum is above zero (a tie is off)' },
                { kind: 'var', name: 'yh', type: INT, init: n(0), phase: 'sweep' },
                { kind: 'if', cond: op('>', v('s'), n(0)), then: [set(v('yh'), n(1), 'sweep')], phase: 'sweep' },
                {
                  kind: 'if',
                  cond: op('!=', v('yh'), at('ys', v('i'))),
                  phase: 'sweep',
                  then: [
                    { kind: 'comment', text: 'wrong: move the weights toward this point' },
                    set(v('e'), op('+', v('e'), n(1)), 'sweep'),
                    { kind: 'var', name: 'd', type: INT, init: op('-', at('ys', v('i')), v('yh')), phase: 'sweep' },
                    set(wAt(0), op('+', wAt(0), v('d')), 'sweep'),
                    set(wAt(1), op('+', wAt(1), op('*', v('d'), at('xs1', v('i')))), 'sweep'),
                    set(wAt(2), op('+', wAt(2), op('*', v('d'), at('xs2', v('i')))), 'sweep'),
                  ],
                },
              ],
            },
            set(at('errs', op('-', v('ep'), n(1))), v('e'), 'sweep'),
            { kind: 'comment', text: 'no point was wrong: the rule stops here' },
            { kind: 'if', cond: op('==', v('e'), n(0)), then: [{ kind: 'return', expr: v('ep'), phase: 'stop' }], phase: 'stop' },
            { kind: 'comment', text: 'weights seen before: the same epochs repeat forever' },
            {
              kind: 'for-range',
              var: 'k',
              from: n(0),
              to: v('ep'),
              inclusive: false,
              phase: 'repeat',
              body: [
                {
                  kind: 'if',
                  cond: sameAsSeen,
                  phase: 'repeat',
                  then: [
                    set(at('hit', n(0)), v('k'), 'repeat'),
                    { kind: 'return', expr: { kind: 'unop', op: '-', x: v('ep') }, phase: 'repeat' },
                  ],
                },
              ],
            },
            set(at('seen0', v('ep')), wAt(0)),
            set(at('seen1', v('ep')), wAt(1)),
            set(at('seen2', v('ep')), wAt(2)),
          ],
        },
        { kind: 'comment', text: 'epoch cap reached' },
        { kind: 'return', expr: n(0) },
      ],
    },
  ],
};

export const perceptronIRs: IR[] = [perceptronImperativeIR];
