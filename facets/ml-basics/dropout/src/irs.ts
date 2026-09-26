/**
 * dropout 의 IR — 코드 패널이 여섯 언어로 옮기는 셈. `algorithm.ts` 의 `dropoutRun` · `maskedOutput` ·
 * `expectedOutput` 과 한 줄씩 같다 (갈고리만 없다).
 *
 * phase 어휘 (algorithm.ts 와 같다): expect · drop · spread
 *
 * 버퍼는 부르는 쪽이 만든다 — ys(마스크 수만큼) · stats(3: 기댓값 · 표본 평균 · 흩어짐) · offs(2: 쉰 칸 · 쉰 몫 %).
 * 모르는 되살림 종류(0 · 1 밖)에는 −999.0 을 돌려준다 (정상 y 는 −0.80 … 2.97 — 겹치지 않는다. TS 는 던진다).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const LIST_D: IRType = { kind: 'list', of: DOUBLE };
const LIST_I: IRType = { kind: 'list', of: INT };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const ref = (name: string): IRExpr => ({ kind: 'var', name });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: ref(arr), idx });
const len = (name: string): IRExpr => ({ kind: 'len', of: ref(name) });
const bin = (op: '+' | '-' | '*' | '/' | '//' | '>=' | '==' | '!=' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const note = (text: string): IRStmt => ({ kind: 'comment', text });

/** 되살림 종류가 0 · 1 이 아니면 표지를 돌려준다. */
const guard = (phase: string): IRStmt => ({
  kind: 'if',
  cond: bin('&&', bin('!=', ref('rescale'), lit(0)), bin('!=', ref('rescale'), lit(1))),
  then: [{ kind: 'return', expr: lit(-999.0), phase }],
  phase,
});

/** 켬이면 x / (1 − p), 끔이면 x. */
const rescaled = (x: string, phase: string): IRStmt[] => [
  {
    kind: 'if',
    cond: bin('==', ref('rescale'), lit(1)),
    then: [{ kind: 'return', expr: bin('/', ref(x), bin('-', lit(1.0), ref('p'))), phase }],
    phase,
  },
  { kind: 'return', expr: ref(x), phase },
];

export const dropoutImperativeIR: IR = {
  id: 'dropout-imperative',
  algorithm: 'dropout',
  paradigm: 'imperative',
  functions: [
    {
      name: 'dropoutRun',
      params: [
        { name: 'h', type: LIST_D },
        { name: 'v', type: LIST_D },
        { name: 'us', type: LIST_D },
        { name: 'p', type: DOUBLE },
        { name: 'rescale', type: INT },
        { name: 'ys', type: LIST_D },
        { name: 'stats', type: LIST_D },
        { name: 'offs', type: LIST_I },
      ],
      returnType: DOUBLE,
      body: [
        note('expected value by arithmetic, not from the samples'),
        {
          kind: 'assign',
          target: at('stats', lit(0)),
          expr: call('expectedOutput', [ref('h'), ref('v'), ref('p'), ref('rescale')]),
          phase: 'expect',
        },
        note('one forward pass per mask; offs[0] counts dropped units'),
        { kind: 'assign', target: at('offs', lit(0)), expr: lit(0), phase: 'drop' },
        {
          kind: 'for-range',
          var: 'k',
          from: lit(0),
          to: len('ys'),
          inclusive: false,
          body: [
            {
              kind: 'assign',
              target: at('ys', ref('k')),
              expr: call('maskedOutput', [
                ref('h'),
                ref('v'),
                ref('us'),
                ref('k'),
                ref('p'),
                ref('rescale'),
                ref('offs'),
              ]),
              phase: 'drop',
            },
          ],
          phase: 'drop',
        },
        note('sample mean and spread (population standard deviation) of the outputs'),
        { kind: 'var', name: 'total', type: DOUBLE, init: lit(0.0), phase: 'spread' },
        {
          kind: 'for-range',
          var: 'k',
          from: lit(0),
          to: len('ys'),
          inclusive: false,
          body: [
            { kind: 'assign', target: ref('total'), expr: bin('+', ref('total'), at('ys', ref('k'))), phase: 'spread' },
          ],
          phase: 'spread',
        },
        { kind: 'var', name: 'count', type: INT, init: len('ys'), phase: 'spread' },
        { kind: 'var', name: 'mean', type: DOUBLE, init: bin('/', ref('total'), ref('count')), phase: 'spread' },
        { kind: 'var', name: 'q', type: DOUBLE, init: lit(0.0), phase: 'spread' },
        {
          kind: 'for-range',
          var: 'k',
          from: lit(0),
          to: len('ys'),
          inclusive: false,
          body: [
            {
              kind: 'assign',
              target: ref('q'),
              expr: bin(
                '+',
                ref('q'),
                bin('*', bin('-', at('ys', ref('k')), ref('mean')), bin('-', at('ys', ref('k')), ref('mean'))),
              ),
              phase: 'spread',
            },
          ],
          phase: 'spread',
        },
        { kind: 'assign', target: at('stats', lit(1)), expr: ref('mean'), phase: 'spread' },
        {
          kind: 'assign',
          target: at('stats', lit(2)),
          expr: call('sqrt', [bin('/', ref('q'), ref('count'))]),
          phase: 'spread',
        },
        note('dropped share as a rounded whole percent'),
        { kind: 'var', name: 'n', type: INT, init: bin('*', len('h'), len('ys')), phase: 'spread' },
        {
          kind: 'assign',
          target: at('offs', lit(1)),
          expr: bin('//', bin('+', bin('*', at('offs', lit(0)), lit(100)), bin('//', ref('n'), lit(2))), ref('n')),
          phase: 'spread',
        },
        { kind: 'return', expr: ref('mean'), phase: 'spread' },
      ],
    },
    {
      name: 'maskedOutput',
      params: [
        { name: 'h', type: LIST_D },
        { name: 'v', type: LIST_D },
        { name: 'us', type: LIST_D },
        { name: 'k', type: INT },
        { name: 'p', type: DOUBLE },
        { name: 'rescale', type: INT },
        { name: 'offs', type: LIST_I },
      ],
      returnType: DOUBLE,
      body: [
        guard('drop'),
        { kind: 'var', name: 's', type: DOUBLE, init: lit(0.0), phase: 'drop' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: len('h'),
          inclusive: false,
          body: [
            note('unit i stays on when its draw is at least p'),
            {
              kind: 'if',
              cond: bin('>=', at('us', bin('+', bin('*', len('h'), ref('k')), ref('i'))), ref('p')),
              then: [
                {
                  kind: 'assign',
                  target: ref('s'),
                  expr: bin('+', ref('s'), bin('*', at('h', ref('i')), at('v', ref('i')))),
                  phase: 'drop',
                },
              ],
              else: [
                {
                  kind: 'assign',
                  target: at('offs', lit(0)),
                  expr: bin('+', at('offs', lit(0)), lit(1)),
                  phase: 'drop',
                },
              ],
              phase: 'drop',
            },
          ],
          phase: 'drop',
        },
        note('inverted dropout: the units left on make up for the dropped ones'),
        ...rescaled('s', 'drop'),
      ],
    },
    {
      name: 'expectedOutput',
      params: [
        { name: 'h', type: LIST_D },
        { name: 'v', type: LIST_D },
        { name: 'p', type: DOUBLE },
        { name: 'rescale', type: INT },
      ],
      returnType: DOUBLE,
      body: [
        guard('expect'),
        { kind: 'var', name: 'e', type: DOUBLE, init: lit(0.0), phase: 'expect' },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: len('h'),
          inclusive: false,
          body: [
            {
              kind: 'assign',
              target: ref('e'),
              expr: bin('+', ref('e'), bin('*', bin('*', bin('-', lit(1.0), ref('p')), at('h', ref('i'))), at('v', ref('i')))),
              phase: 'expect',
            },
          ],
          phase: 'expect',
        },
        ...rescaled('e', 'expect'),
      ],
    },
  ],
};

export const dropoutIRs: IR[] = [dropoutImperativeIR];
