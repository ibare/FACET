/**
 * segmentation 의 IR — 배치기 자체. 메모리는 부르는 쪽이 만든 칸 배열로 받는다(-1 = 빈 칸),
 * 덩이는 번호로 받는다. algorithm.ts 의 `segmentationRound` · `findHoleAt` 과 같은 셈이다.
 *
 * phase 는 셋 — `place` · `release` · `reject`. 요청 하나가 한 걸음이라 걸음마다 하나가 켜진다.
 * `findHole` 안에는 phase 를 두지 않는다 (틈을 훑는 줄마다 켜면 걸음 경계 사이에서 덮인다).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: { kind: 'int' } };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '*' | '//' | '<' | '>' | '>=' | '==', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const set = (name: string, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target: v(name), expr, phase } : { kind: 'assign', target: v(name), expr };
const inc = (name: string, phase?: string): IRStmt => set(name, bin('+', v(name), lit(1)), phase);

/** 프레임 f 의 첫 칸 — f * frameKiB */
const frameCell = bin('*', v('f'), v('frameKiB'));

const runRequests: IRStmt[] = [
  { kind: 'comment', text: 'memory[k] holds a block number, -1 means empty' },
  {
    kind: 'for-range',
    var: 'k',
    from: lit(0),
    to: v('cells'),
    inclusive: false,
    body: [{ kind: 'assign', target: at('memory', v('k')), expr: lit(-1) }],
  },
  { kind: 'var', name: 'rejected', type: INT, init: lit(0) },
  {
    kind: 'for-range',
    var: 'r',
    from: lit(0),
    to: { kind: 'len', of: v('kind') },
    inclusive: false,
    body: [
      {
        kind: 'if',
        cond: bin('==', at('kind', v('r')), lit(1)),
        then: [
          { kind: 'comment', text: 'leaving: every cell of that block becomes empty' },
          {
            kind: 'for-range',
            var: 'k',
            from: lit(0),
            to: v('cells'),
            inclusive: false,
            body: [
              {
                kind: 'if',
                cond: bin('==', at('memory', v('k')), at('who', v('r'))),
                then: [{ kind: 'assign', target: at('memory', v('k')), expr: lit(-1), phase: 'release' }],
              },
            ],
          },
        ],
        else: [
          {
            kind: 'if',
            cond: bin('==', v('fit'), lit(3)),
            then: [
              { kind: 'comment', text: 'fixed frames: cut into frame-sized pieces, lowest free frame first' },
              {
                kind: 'var',
                name: 'need',
                type: INT,
                init: bin('//', bin('-', bin('+', at('size', v('r')), v('frameKiB')), lit(1)), v('frameKiB')),
              },
              { kind: 'var', name: 'freeFrames', type: INT, init: lit(0) },
              {
                kind: 'for-range',
                var: 'f',
                from: lit(0),
                to: bin('//', v('cells'), v('frameKiB')),
                inclusive: false,
                body: [
                  {
                    kind: 'if',
                    cond: bin('==', { kind: 'index', arr: v('memory'), idx: frameCell }, lit(-1)),
                    then: [inc('freeFrames')],
                  },
                ],
              },
              {
                kind: 'if',
                cond: bin('<', v('freeFrames'), v('need')),
                then: [inc('rejected', 'reject')],
                else: [
                  {
                    kind: 'for-range',
                    var: 'f',
                    from: lit(0),
                    to: bin('//', v('cells'), v('frameKiB')),
                    inclusive: false,
                    body: [
                      {
                        kind: 'if',
                        cond: bin('>', v('need'), lit(0)),
                        then: [
                          {
                            kind: 'if',
                            cond: bin('==', { kind: 'index', arr: v('memory'), idx: frameCell }, lit(-1)),
                            then: [
                              {
                                kind: 'for-range',
                                var: 'c',
                                from: lit(0),
                                to: v('frameKiB'),
                                inclusive: false,
                                body: [
                                  {
                                    kind: 'assign',
                                    target: { kind: 'index', arr: v('memory'), idx: bin('+', frameCell, v('c')) },
                                    expr: at('who', v('r')),
                                    phase: 'place',
                                  },
                                ],
                              },
                              set('need', bin('-', v('need'), lit(1))),
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
            else: [
              { kind: 'comment', text: 'variable size: put the block at the front of the chosen hole' },
              {
                kind: 'var',
                name: 'at',
                type: INT,
                init: {
                  kind: 'call',
                  fn: 'findHole',
                  args: [v('memory'), v('cells'), at('size', v('r')), v('fit')],
                },
              },
              {
                kind: 'if',
                cond: bin('==', v('at'), lit(-1)),
                then: [inc('rejected', 'reject')],
                else: [
                  {
                    kind: 'for-range',
                    var: 'k',
                    from: v('at'),
                    to: bin('+', v('at'), at('size', v('r'))),
                    inclusive: false,
                    body: [{ kind: 'assign', target: at('memory', v('k')), expr: at('who', v('r')), phase: 'place' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  { kind: 'return', expr: v('rejected') },
];

const findHole: IRStmt[] = [
  { kind: 'comment', text: 'fit 0 first hole, 1 shortest hole, 2 longest hole; equal length keeps the lower address' },
  { kind: 'var', name: 'pick', type: INT, init: lit(-1) },
  { kind: 'var', name: 'pickLen', type: INT, init: lit(0) },
  { kind: 'var', name: 'run', type: INT, init: lit(0) },
  { kind: 'var', name: 'start', type: INT, init: lit(0) },
  { kind: 'comment', text: 'k == cells acts as a wall so the last hole is closed too' },
  {
    kind: 'for-range',
    var: 'k',
    from: lit(0),
    to: v('cells'),
    inclusive: true,
    body: [
      { kind: 'var', name: 'wall', type: INT, init: lit(1) },
      {
        kind: 'if',
        cond: bin('<', v('k'), v('cells')),
        then: [
          {
            kind: 'if',
            cond: bin('==', at('memory', v('k')), lit(-1)),
            then: [set('wall', lit(0))],
          },
        ],
      },
      {
        kind: 'if',
        cond: bin('==', v('wall'), lit(0)),
        then: [
          { kind: 'if', cond: bin('==', v('run'), lit(0)), then: [set('start', v('k'))] },
          inc('run'),
        ],
        else: [
          {
            kind: 'if',
            cond: bin('>=', v('run'), v('want')),
            then: [
              { kind: 'var', name: 'better', type: INT, init: lit(0) },
              {
                kind: 'if',
                cond: bin('==', v('pick'), lit(-1)),
                then: [set('better', lit(1))],
                else: [
                  {
                    kind: 'if',
                    cond: bin('==', v('fit'), lit(1)),
                    then: [{ kind: 'if', cond: bin('<', v('run'), v('pickLen')), then: [set('better', lit(1))] }],
                  },
                  {
                    kind: 'if',
                    cond: bin('==', v('fit'), lit(2)),
                    then: [{ kind: 'if', cond: bin('>', v('run'), v('pickLen')), then: [set('better', lit(1))] }],
                  },
                ],
              },
              {
                kind: 'if',
                cond: bin('==', v('better'), lit(1)),
                then: [set('pick', v('start')), set('pickLen', v('run'))],
              },
            ],
          },
          set('run', lit(0)),
        ],
      },
    ],
  },
  { kind: 'return', expr: v('pick') },
];

export const segmentationImperativeIR: IR = {
  id: 'segmentation-imperative',
  algorithm: 'segmentation',
  paradigm: 'imperative',
  functions: [
    {
      name: 'runRequests',
      params: [
        { name: 'kind', type: INTS },
        { name: 'who', type: INTS },
        { name: 'size', type: INTS },
        { name: 'memory', type: INTS },
        { name: 'cells', type: INT },
        { name: 'fit', type: INT },
        { name: 'frameKiB', type: INT },
      ],
      returnType: INT,
      body: runRequests,
    },
    {
      name: 'findHole',
      params: [
        { name: 'memory', type: INTS },
        { name: 'cells', type: INT },
        { name: 'want', type: INT },
        { name: 'fit', type: INT },
      ],
      returnType: INT,
      body: findHole,
    },
  ],
};

export const segmentationIRs: IR[] = [segmentationImperativeIR];
