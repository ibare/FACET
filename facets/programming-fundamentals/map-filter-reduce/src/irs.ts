/**
 * map-filter-reduce 의 IR — 세 단계가 **속에서** 하는 반복.
 *
 * 화면은 `filter(marks, x => x > 4)` 처럼 함수를 값으로 넘기는 모습을 보이고, 코드 패널은 같은 셈을 반복으로
 * 편다. IR 에는 함수 값이 없어 넘기는 함수(`x > threshold` · `x * x` · `+`)는 반복 몸에 박혀 있다.
 *
 * 진입 함수 `pipeline(marks, kept, squares, threshold)` — 버퍼 `kept` · `squares` 는 부르는 쪽이 marks 길이로
 * 만든다 (IR 함수는 배열을 만들지 못한다). 돌아온 뒤 kept · squares 의 앞 k 칸이 filter 뒤 · map 뒤이고,
 * 반환값이 reduce 의 답이다. reduce 의 시작값은 0 (initialData.start 와 같다 — 테스트가 잠근다).
 *
 * phase 집합 = test · keep · map · fold · answer (algorithm.ts 와 정확히 같다).
 * 중간값 최대 216 — 32 비트 안.
 */
import type { IR, IRExpr, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST_INT: IRType = { kind: 'list', of: INT };
const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });

export const mapFilterReduceImperativeIR: IR = {
  id: 'map-filter-reduce-imperative',
  algorithm: 'mapFilterReduce',
  paradigm: 'imperative',
  functions: [
    {
      name: 'pipeline',
      params: [
        { name: 'marks', type: LIST_INT },
        { name: 'kept', type: LIST_INT },
        { name: 'squares', type: LIST_INT },
        { name: 'threshold', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'filter keeps x > threshold, map squares, reduce sums from 0' },
        { kind: 'var', name: 'n', type: INT, init: { kind: 'call', fn: 'filterInto', args: [v('marks'), v('kept'), v('threshold')] } },
        { kind: 'expr-stmt', expr: { kind: 'call', fn: 'mapInto', args: [v('kept'), v('squares'), v('n')] } },
        { kind: 'var', name: 'result', type: INT, init: { kind: 'call', fn: 'reduceSum', args: [v('squares'), v('n')] } },
        { kind: 'return', expr: v('result'), phase: 'answer' },
      ],
    },
    {
      name: 'filterInto',
      params: [
        { name: 'xs', type: LIST_INT },
        { name: 'kept', type: LIST_INT },
        { name: 'threshold', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'keep the value as is, in the original order' },
        { kind: 'var', name: 'n', type: INT, init: lit(0) },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: { kind: 'len', of: v('xs') },
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: { kind: 'binop', op: '>', l: at('xs', v('i')), r: v('threshold') },
              phase: 'test',
              then: [
                { kind: 'assign', target: at('kept', v('n')), expr: at('xs', v('i')), phase: 'keep' },
                { kind: 'assign', target: v('n'), expr: { kind: 'binop', op: '+', l: v('n'), r: lit(1) } },
              ],
            },
          ],
        },
        { kind: 'return', expr: v('n') },
      ],
    },
    {
      name: 'mapInto',
      params: [
        { name: 'kept', type: LIST_INT },
        { name: 'squares', type: LIST_INT },
        { name: 'n', type: INT },
      ],
      returnType: { kind: 'void' },
      body: [
        { kind: 'comment', text: 'same count, same slot, new value' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'assign',
              target: at('squares', v('i')),
              expr: { kind: 'binop', op: '*', l: at('kept', v('i')), r: at('kept', v('i')) },
              phase: 'map',
            },
          ],
        },
      ],
    },
    {
      name: 'reduceSum',
      params: [
        { name: 'squares', type: LIST_INT },
        { name: 'n', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'fold from the front, starting at 0' },
        { kind: 'var', name: 'acc', type: INT, init: lit(0) },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: v('n'),
          inclusive: false,
          body: [
            {
              kind: 'assign',
              target: v('acc'),
              expr: { kind: 'binop', op: '+', l: v('acc'), r: at('squares', v('i')) },
              phase: 'fold',
            },
          ],
        },
        { kind: 'return', expr: v('acc') },
      ],
    },
  ],
};

export const mapFilterReduceIRs: IR[] = [mapFilterReduceImperativeIR];
