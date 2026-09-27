/**
 * rasterization 의 IR — 두 삼각형을 칸에 채우고 깊이 버퍼 또는 화가 알고리즘으로 가린 뒤, 겹친 칸 가운데
 * 둘째 삼각형(B)이 이긴 칸을 센다. 화면의 계기 `b-wins` 와 같은 답을 낸다.
 *
 * IR 은 배열을 만들 수 없어 버퍼(depth · owner · cover, 길이 w*h)를 부르는 쪽이 만들어 넘긴다.
 * xs · ys · zs 는 길이 6 — 첫 삼각형의 꼭짓점 셋, 이어 둘째의 셋.
 *
 * 표지 (TS 는 던지고 IR 은 표지를 돌려준다):
 *   −1 칸 중심이 모서리 위 · −2 깊이 동률 · −3 무게중심 깊이 동률 · −4 꼭짓점 차례 · −5 모르는 방식
 *
 * phase: cover · interpolate · depth-test · order · paint · count — algorithm.ts 와 같은 집합.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DBL: IRType = { kind: 'double' };
const DBL_LIST: IRType = { kind: 'list', of: DBL };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '/' | '<' | '<=' | '>' | '==' | '||' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const neg = (n: number): IRExpr => ({ kind: 'unop', op: '-', x: lit(n) });
const ret = (expr: IRExpr, phase?: string): IRStmt => (phase ? { kind: 'return', expr, phase } : { kind: 'return', expr });

/** 버퍼 인자 묶음 — drawTriangle 에 그대로 넘긴다 */
const BUFFERS = ['w', 'h', 'depth', 'owner', 'cover'].map(v);

function drawCall(tri: IRExpr, id: IRExpr, useDepth: number, phase: string): IRStmt[] {
  return [
    { kind: 'assign', target: v('s'), expr: call('drawTriangle', [v('xs'), v('ys'), v('zs'), tri, id, lit(useDepth), ...BUFFERS]), phase },
    { kind: 'if', cond: bin('<', v('s'), lit(0)), then: [ret(v('s'))] },
  ];
}

const edgeOf = (a: string, b: string): IRExpr =>
  call('edge', [v(`${a}x`), v(`${a}y`), v(`${b}x`), v(`${b}y`), v('px'), v('py')]);

const renderFn = {
  name: 'render',
  params: [
    { name: 'xs', type: DBL_LIST },
    { name: 'ys', type: DBL_LIST },
    { name: 'zs', type: DBL_LIST },
    { name: 'mode', type: INT },
    { name: 'w', type: INT },
    { name: 'h', type: INT },
    { name: 'depth', type: DBL_LIST },
    { name: 'owner', type: INT_LIST },
    { name: 'cover', type: INT_LIST },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'clear the buffers: depth 1 (far), no owner, no cover' },
    {
      kind: 'for-range',
      var: 'k',
      from: lit(0),
      to: bin('*', v('w'), v('h')),
      inclusive: false,
      body: [
        { kind: 'assign', target: at('depth', v('k')), expr: lit(1) },
        { kind: 'assign', target: at('owner', v('k')), expr: lit(0) },
        { kind: 'assign', target: at('cover', v('k')), expr: lit(0) },
      ],
    },
    { kind: 'var', name: 's', type: INT, init: lit(0) },
    {
      kind: 'if',
      cond: bin('==', v('mode'), lit(0)),
      then: [
        { kind: 'comment', text: 'depth buffer: A then B, keep the nearer depth per cell' },
        ...drawCall(lit(0), lit(1), 1, 'depth-test'),
        ...drawCall(lit(1), lit(2), 1, 'depth-test'),
      ],
      else: [
        {
          kind: 'if',
          cond: bin('==', v('mode'), lit(1)),
          then: [
            { kind: 'comment', text: "painter's: sort whole triangles by centroid depth" },
            {
              kind: 'var',
              name: 'ca',
              type: DBL,
              init: bin('/', bin('+', bin('+', at('zs', lit(0)), at('zs', lit(1))), at('zs', lit(2))), lit(3)),
              phase: 'order',
            },
            {
              kind: 'var',
              name: 'cb',
              type: DBL,
              init: bin('/', bin('+', bin('+', at('zs', lit(3)), at('zs', lit(4))), at('zs', lit(5))), lit(3)),
              phase: 'order',
            },
            { kind: 'if', cond: bin('==', v('ca'), v('cb')), then: [ret(neg(3), 'order')] },
            { kind: 'var', name: 'backTri', type: INT, init: lit(0), phase: 'order' },
            { kind: 'if', cond: bin('>', v('cb'), v('ca')), then: [{ kind: 'assign', target: v('backTri'), expr: lit(1), phase: 'order' }] },
            { kind: 'comment', text: 'far one first, then the near one, no depth comparison' },
            ...drawCall(v('backTri'), bin('+', v('backTri'), lit(1)), 0, 'paint'),
            ...drawCall(bin('-', lit(1), v('backTri')), bin('-', lit(2), v('backTri')), 0, 'paint'),
          ],
          else: [ret(neg(5))],
        },
      ],
    },
    { kind: 'comment', text: 'count shared cells won by B' },
    { kind: 'var', name: 'wins', type: INT, init: lit(0), phase: 'count' },
    {
      kind: 'for-range',
      var: 'k',
      from: lit(0),
      to: bin('*', v('w'), v('h')),
      inclusive: false,
      phase: 'count',
      body: [
        {
          kind: 'if',
          cond: bin('==', at('cover', v('k')), lit(2)),
          phase: 'count',
          then: [
            {
              kind: 'if',
              cond: bin('==', at('owner', v('k')), lit(2)),
              phase: 'count',
              then: [{ kind: 'assign', target: v('wins'), expr: bin('+', v('wins'), lit(1)), phase: 'count' }],
            },
          ],
        },
      ],
    },
    ret(v('wins'), 'count'),
  ],
} satisfies IR['functions'][number];

const drawTriangleFn = {
  name: 'drawTriangle',
  params: [
    { name: 'xs', type: DBL_LIST },
    { name: 'ys', type: DBL_LIST },
    { name: 'zs', type: DBL_LIST },
    { name: 'tri', type: INT },
    { name: 'id', type: INT },
    { name: 'useDepth', type: INT },
    { name: 'w', type: INT },
    { name: 'h', type: INT },
    { name: 'depth', type: DBL_LIST },
    { name: 'owner', type: INT_LIST },
    { name: 'cover', type: INT_LIST },
  ],
  returnType: INT,
  body: [
    { kind: 'var', name: 'i0', type: INT, init: bin('*', v('tri'), lit(3)) },
    { kind: 'var', name: 'ax', type: DBL, init: at('xs', v('i0')) },
    { kind: 'var', name: 'ay', type: DBL, init: at('ys', v('i0')) },
    { kind: 'var', name: 'bx', type: DBL, init: at('xs', bin('+', v('i0'), lit(1))) },
    { kind: 'var', name: 'by', type: DBL, init: at('ys', bin('+', v('i0'), lit(1))) },
    { kind: 'var', name: 'cx', type: DBL, init: at('xs', bin('+', v('i0'), lit(2))) },
    { kind: 'var', name: 'cy', type: DBL, init: at('ys', bin('+', v('i0'), lit(2))) },
    { kind: 'var', name: 'area', type: DBL, init: call('edge', [v('ax'), v('ay'), v('bx'), v('by'), v('cx'), v('cy')]) },
    { kind: 'if', cond: bin('<=', v('area'), lit(0)), then: [ret(neg(4))] },
    {
      kind: 'for-range',
      var: 'r',
      from: lit(0),
      to: v('h'),
      inclusive: false,
      body: [
        {
          kind: 'for-range',
          var: 'c',
          from: lit(0),
          to: v('w'),
          inclusive: false,
          body: [
            { kind: 'comment', text: 'sample the cell at its centre' },
            { kind: 'var', name: 'px', type: DBL, init: bin('+', v('c'), lit(0.5)), phase: 'cover' },
            { kind: 'var', name: 'py', type: DBL, init: bin('+', v('r'), lit(0.5)), phase: 'cover' },
            { kind: 'var', name: 'w0', type: DBL, init: edgeOf('b', 'c'), phase: 'cover' },
            { kind: 'var', name: 'w1', type: DBL, init: edgeOf('c', 'a'), phase: 'cover' },
            { kind: 'var', name: 'w2', type: DBL, init: edgeOf('a', 'b'), phase: 'cover' },
            {
              kind: 'if',
              cond: bin('||', bin('||', bin('==', v('w0'), lit(0)), bin('==', v('w1'), lit(0))), bin('==', v('w2'), lit(0))),
              then: [ret(neg(1), 'cover')],
              phase: 'cover',
            },
            {
              kind: 'if',
              cond: bin('&&', bin('&&', bin('>', v('w0'), lit(0)), bin('>', v('w1'), lit(0))), bin('>', v('w2'), lit(0))),
              phase: 'cover',
              then: [
                { kind: 'var', name: 'k', type: INT, init: bin('+', bin('*', v('r'), v('w')), v('c')), phase: 'cover' },
                { kind: 'assign', target: at('cover', v('k')), expr: bin('+', at('cover', v('k')), lit(1)), phase: 'cover' },
                { kind: 'comment', text: 'barycentric depth, linear in screen space' },
                {
                  kind: 'var',
                  name: 'z',
                  type: DBL,
                  init: bin(
                    '/',
                    bin(
                      '+',
                      bin('+', bin('*', v('w0'), at('zs', v('i0'))), bin('*', v('w1'), at('zs', bin('+', v('i0'), lit(1))))),
                      bin('*', v('w2'), at('zs', bin('+', v('i0'), lit(2)))),
                    ),
                    v('area'),
                  ),
                  phase: 'interpolate',
                },
                {
                  kind: 'if',
                  cond: bin('==', v('useDepth'), lit(1)),
                  phase: 'depth-test',
                  then: [
                    { kind: 'if', cond: bin('==', v('z'), at('depth', v('k'))), then: [ret(neg(2), 'depth-test')], phase: 'depth-test' },
                    {
                      kind: 'if',
                      cond: bin('<', v('z'), at('depth', v('k'))),
                      phase: 'depth-test',
                      then: [
                        { kind: 'assign', target: at('depth', v('k')), expr: v('z'), phase: 'depth-test' },
                        { kind: 'assign', target: at('owner', v('k')), expr: v('id'), phase: 'depth-test' },
                      ],
                    },
                  ],
                  else: [{ kind: 'assign', target: at('owner', v('k')), expr: v('id'), phase: 'paint' }],
                },
              ],
            },
          ],
        },
      ],
    },
    ret(lit(0)),
  ],
} satisfies IR['functions'][number];

const edgeFn = {
  name: 'edge',
  params: ['ax', 'ay', 'bx', 'by', 'px', 'py'].map((name) => ({ name, type: DBL })),
  returnType: DBL,
  body: [
    ret(
      bin('-', bin('*', bin('-', v('bx'), v('ax')), bin('-', v('py'), v('ay'))), bin('*', bin('-', v('by'), v('ay')), bin('-', v('px'), v('ax')))),
    ),
  ],
} satisfies IR['functions'][number];

export const rasterizationImperativeIR: IR = {
  id: 'rasterization-imperative',
  algorithm: 'rasterization',
  paradigm: 'imperative',
  functions: [renderFn, drawTriangleFn, edgeFn],
};

export const rasterizationIRs: IR[] = [rasterizationImperativeIR];
