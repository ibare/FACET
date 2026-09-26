/**
 * convolution 의 코드 패널 IR.
 *
 * IR 함수는 배열을 만들 수 없어 두른 격자를 만들지 못한다. 그래서 창이 닿는 칸의 값 v 를 두르는 값 0 으로
 * 두고 입력 안일 때만 img 를 읽는다 — 알고리즘이 명시적으로 만든 두른 격자와 같은 답을 낸다(테스트가 잠근다).
 * 쓰임은 한 축으로 센다(2 차원 쓰임 = 행 쓰임 × 열 쓰임). 출력 버퍼 outGrid · 쓰임 버퍼 cover 는 부르는 쪽이 만든다.
 * 범위 확인은 `if` 를 겹친다 — ir-interpreter 의 `&&` 는 짧은 회로가 아니라 음수 색인을 읽는다.
 *
 * 사양의 매개변수 이름 `out` 은 C# 예약어라 `outGrid` 로 둔다.
 *
 * phase 어휘 (algorithm.ts 와 정확히 같다): output-size · pad-zero · window-sum · cover-count
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '<' | '>=' | '>', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const decl = (name: string, init: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'var', name, type: INT, init } : { kind: 'var', name, type: INT, init, phase };
const range = (name: string, to: IRExpr, body: IRStmt[]): IRStmt => ({
  kind: 'for-range',
  var: name,
  from: n(0),
  to,
  inclusive: false,
  body,
});

/** o = (n + 2·pad − k) // stride + 1 */
const sideExpr: IRExpr = bin('+', bin('//', bin('-', bin('+', v('n'), bin('*', n(2), v('pad'))), v('k')), v('stride')), n(1));

const convolve: IRStmt[] = [
  { kind: 'comment', text: 'output side: floor((n + 2*pad - k) / stride) + 1' },
  decl('o', sideExpr, 'output-size'),
  range('r', v('o'), [
    range('c', v('o'), [
      decl('acc', n(0), 'window-sum'),
      range('i', v('k'), [
        range('j', v('k'), [
          decl('rr', bin('-', bin('+', bin('*', v('r'), v('stride')), v('i')), v('pad')), 'pad-zero'),
          decl('cc', bin('-', bin('+', bin('*', v('c'), v('stride')), v('j')), v('pad')), 'pad-zero'),
          { kind: 'comment', text: 'a cell outside the input reads the padding value 0' },
          decl('cell', n(0), 'pad-zero'),
          {
            kind: 'if',
            cond: bin('>=', v('rr'), n(0)),
            phase: 'pad-zero',
            then: [
              {
                kind: 'if',
                cond: bin('<', v('rr'), v('n')),
                phase: 'pad-zero',
                then: [
                  {
                    kind: 'if',
                    cond: bin('>=', v('cc'), n(0)),
                    phase: 'pad-zero',
                    then: [
                      {
                        kind: 'if',
                        cond: bin('<', v('cc'), v('n')),
                        phase: 'pad-zero',
                        then: [
                          {
                            kind: 'assign',
                            target: v('cell'),
                            expr: at('img', bin('+', bin('*', v('rr'), v('n')), v('cc'))),
                            phase: 'pad-zero',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            kind: 'assign',
            target: v('acc'),
            expr: bin('+', v('acc'), bin('*', v('cell'), at('ker', bin('+', bin('*', v('i'), v('k')), v('j'))))),
            phase: 'window-sum',
          },
        ]),
      ]),
      {
        kind: 'assign',
        target: at('outGrid', bin('+', bin('*', v('r'), v('o')), v('c'))),
        expr: v('acc'),
        phase: 'window-sum',
      },
    ]),
  ]),
  { kind: 'return', expr: v('o'), phase: 'output-size' },
];

const droppedCells: IRStmt[] = [
  decl('o', sideExpr),
  range('x', v('n'), [{ kind: 'assign', target: at('cover', v('x')), expr: n(0) }]),
  { kind: 'comment', text: 'count, along one axis, how many window positions reach each line' },
  range('a', v('o'), [
    range('j', v('k'), [
      decl('line', bin('-', bin('+', bin('*', v('a'), v('stride')), v('j')), v('pad'))),
      {
        kind: 'if',
        cond: bin('>=', v('line'), n(0)),
        then: [
          {
            kind: 'if',
            cond: bin('<', v('line'), v('n')),
            then: [
              {
                kind: 'assign',
                target: at('cover', v('line')),
                expr: bin('+', at('cover', v('line')), n(1)),
                phase: 'cover-count',
              },
            ],
          },
        ],
      },
    ]),
  ]),
  decl('kept', n(0)),
  range('x', v('n'), [
    {
      kind: 'if',
      cond: bin('>', at('cover', v('x')), n(0)),
      then: [{ kind: 'assign', target: v('kept'), expr: bin('+', v('kept'), n(1)) }],
    },
  ]),
  { kind: 'comment', text: 'a cell is dropped when its row or its column is never covered' },
  { kind: 'return', expr: bin('-', bin('*', v('n'), v('n')), bin('*', v('kept'), v('kept'))), phase: 'cover-count' },
];

export const convolutionImperativeIR: IR = {
  id: 'convolution-imperative',
  algorithm: 'convolution',
  paradigm: 'imperative',
  functions: [
    {
      name: 'convolve',
      params: [
        { name: 'img', type: INT_LIST },
        { name: 'n', type: INT },
        { name: 'ker', type: INT_LIST },
        { name: 'k', type: INT },
        { name: 'stride', type: INT },
        { name: 'pad', type: INT },
        { name: 'outGrid', type: INT_LIST },
      ],
      returnType: INT,
      body: convolve,
    },
    {
      name: 'droppedCells',
      params: [
        { name: 'n', type: INT },
        { name: 'k', type: INT },
        { name: 'stride', type: INT },
        { name: 'pad', type: INT },
        { name: 'cover', type: INT_LIST },
      ],
      returnType: INT,
      body: droppedCells,
    },
  ],
};

export const convolutionIRs: IR[] = [convolutionImperativeIR];
