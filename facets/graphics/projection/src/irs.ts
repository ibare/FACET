/**
 * 카메라와 투영 — IR (명령형).
 *
 * 진입 widthRatio: 두 상자(꼭짓점 vx/vy/vz 의 0..7 = front, 8..15 = back)를 저마다 boxWidth 로
 * 자르고 비춰 폭을 재고, 앞/뒤 비를 돌려준다. 못 셈하면 −1 (TS 쪽은 던진다).
 * boxWidth: lookAt → 모서리마다 두 끝을 카메라 좌표로(seg[0..2] · seg[3..5]) → 가까운 면 자르기
 * → 투영(persp 1 원근 · 0 직교, 그 밖은 −1) → x′ 최대 − 최소.
 *
 * 실수는 double, 색인은 int. 삼각함수가 없으니 초점 focal = 1/tan(fov/2) 은 algorithm 이 넘긴다.
 * IR 은 배열을 만들 수 없어 axes(9) · seg(6) 버퍼를 부르는 쪽이 만든다.
 * toCamera 는 seg 의 어느 끝을 채울지 at(0 또는 3)으로 받는다 — 한 끝씩 채우는 차례는 사양과 같다.
 * phase: view · clip · project · compare (algorithm 과 같다)
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const BOOL: IRType = { kind: 'bool' };
const VOID: IRType = { kind: 'void' };
const LD: IRType = { kind: 'list', of: DOUBLE };
const LI: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const b = (value: boolean): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const at0 = (arr: string, i: number): IRExpr => at(arr, n(i));
const op = (o: '+' | '-' | '*' | '/' | '<' | '<=' | '>' | '==' | '||' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op: o,
  l,
  r,
});
const neg = (x: IRExpr): IRExpr => ({ kind: 'unop', op: '-', x });
const not = (x: IRExpr): IRExpr => ({ kind: 'unop', op: '!', x });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const sum3 = (a: IRExpr, bb: IRExpr, c: IRExpr): IRExpr => op('+', op('+', a, bb), c);

function decl(name: string, type: IRType, init: IRExpr, phase?: string): IRStmt {
  return phase ? { kind: 'var', name, type, init, phase } : { kind: 'var', name, type, init };
}
function set(target: IRExpr, expr: IRExpr, phase?: string): IRStmt {
  return phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
}
function ret(expr: IRExpr, phase?: string): IRStmt {
  return phase ? { kind: 'return', expr, phase } : { kind: 'return', expr };
}

/** seg[i] = seg[j] + along * (seg[i] - seg[j]) */
function slide(i: number, j: number): IRStmt {
  return set(at0('seg', i), op('+', at0('seg', j), op('*', v('along'), op('-', at0('seg', i), at0('seg', j)))), 'clip');
}

const BOX_PARAMS = [
  { name: 'vx', type: LD },
  { name: 'vy', type: LD },
  { name: 'vz', type: LD },
  { name: 'first', type: INT },
  { name: 'ea', type: LI },
  { name: 'eb', type: LI },
  { name: 'eye', type: LD },
  { name: 'target', type: LD },
  { name: 'up', type: LD },
  { name: 'focal', type: DOUBLE },
  { name: 'near', type: DOUBLE },
  { name: 'half', type: DOUBLE },
  { name: 'persp', type: INT },
  { name: 'axes', type: LD },
  { name: 'seg', type: LD },
];

const boxArgs = (first: IRExpr): IRExpr[] => [
  v('vx'), v('vy'), v('vz'), first, v('ea'), v('eb'), v('eye'), v('target'), v('up'),
  v('focal'), v('near'), v('half'), v('persp'), v('axes'), v('seg'),
];

const toCameraCall = (vertex: IRExpr, slot: number): IRStmt => ({
  kind: 'expr-stmt',
  expr: call('toCamera', [v('axes'), v('eye'), at('vx', vertex), at('vy', vertex), at('vz', vertex), v('seg'), n(slot)]),
  phase: 'view',
});

export const projectionImperativeIR: IR = {
  id: 'projection-imperative',
  algorithm: 'projection',
  paradigm: 'imperative',
  functions: [
    {
      name: 'widthRatio',
      params: BOX_PARAMS.filter((p) => p.name !== 'first'),
      returnType: DOUBLE,
      body: [
        decl('front', DOUBLE, call('boxWidth', boxArgs(n(0)))),
        decl('back', DOUBLE, call('boxWidth', boxArgs(n(8)))),
        { kind: 'comment', text: 'a box that cannot be measured gives -1' },
        {
          kind: 'if',
          cond: op('||', op('<', v('front'), n(0)), op('<=', v('back'), n(0))),
          then: [ret(neg(n(1)), 'compare')],
          phase: 'compare',
        },
        ret(op('/', v('front'), v('back')), 'compare'),
      ],
    },
    {
      name: 'boxWidth',
      params: BOX_PARAMS,
      returnType: DOUBLE,
      body: [
        {
          kind: 'if',
          cond: op('<', call('lookAt', [v('eye'), v('target'), v('up'), v('axes')]), n(0)),
          then: [ret(neg(n(1)), 'view')],
          phase: 'view',
        },
        decl('has', BOOL, b(false)),
        decl('lo', DOUBLE, n(0)),
        decl('hi', DOUBLE, n(0)),
        {
          kind: 'for-range',
          var: 'e',
          from: n(0),
          to: { kind: 'len', of: v('ea') },
          inclusive: false,
          body: [
            { kind: 'comment', text: 'both ends of the edge in camera space: seg[0..2] and seg[3..5]' },
            toCameraCall(op('+', v('first'), at('ea', v('e'))), 0),
            toCameraCall(op('+', v('first'), at('eb', v('e'))), 3),
            { kind: 'comment', text: 'depth is -z; the near plane keeps depth > near' },
            decl('da', DOUBLE, neg(at0('seg', 2)), 'clip'),
            decl('db', DOUBLE, neg(at0('seg', 5)), 'clip'),
            {
              kind: 'if',
              cond: op('||', op('==', v('da'), v('near')), op('==', v('db'), v('near'))),
              then: [ret(neg(n(1)), 'clip')],
              phase: 'clip',
            },
            {
              kind: 'if',
              cond: op('&&', op('<', v('da'), v('near')), op('<', v('db'), v('near'))),
              then: [{ kind: 'continue', phase: 'clip' }],
              phase: 'clip',
            },
            {
              kind: 'if',
              cond: op('<', v('da'), v('near')),
              then: [
                decl('along', DOUBLE, op('/', op('-', v('db'), v('near')), op('-', v('db'), v('da'))), 'clip'),
                slide(0, 3),
                slide(1, 4),
                slide(2, 5),
              ],
              else: [
                {
                  kind: 'if',
                  cond: op('<', v('db'), v('near')),
                  then: [
                    decl('along', DOUBLE, op('/', op('-', v('da'), v('near')), op('-', v('da'), v('db'))), 'clip'),
                    slide(3, 0),
                    slide(4, 1),
                    slide(5, 2),
                  ],
                  phase: 'clip',
                },
              ],
              phase: 'clip',
            },
            {
              kind: 'for-range',
              var: 'k',
              from: n(0),
              to: n(2),
              inclusive: false,
              phase: 'project',
              body: [
                decl('x', DOUBLE, at('seg', op('*', v('k'), n(3))), 'project'),
                decl('z', DOUBLE, at('seg', op('+', op('*', v('k'), n(3)), n(2))), 'project'),
                decl('sx', DOUBLE, n(0), 'project'),
                {
                  kind: 'if',
                  cond: op('==', v('persp'), n(1)),
                  then: [set(v('sx'), op('/', op('*', v('focal'), v('x')), neg(v('z'))), 'project')],
                  else: [
                    {
                      kind: 'if',
                      cond: op('==', v('persp'), n(0)),
                      then: [set(v('sx'), op('/', v('x'), v('half')), 'project')],
                      else: [ret(neg(n(1)), 'project')],
                      phase: 'project',
                    },
                  ],
                  phase: 'project',
                },
                {
                  kind: 'if',
                  cond: not(v('has')),
                  then: [set(v('lo'), v('sx'), 'project'), set(v('hi'), v('sx'), 'project'), set(v('has'), b(true), 'project')],
                  else: [
                    { kind: 'if', cond: op('<', v('sx'), v('lo')), then: [set(v('lo'), v('sx'), 'project')], phase: 'project' },
                    { kind: 'if', cond: op('>', v('sx'), v('hi')), then: [set(v('hi'), v('sx'), 'project')], phase: 'project' },
                  ],
                  phase: 'project',
                },
              ],
            },
          ],
        },
        { kind: 'if', cond: not(v('has')), then: [ret(neg(n(1)), 'project')], phase: 'project' },
        ret(op('-', v('hi'), v('lo')), 'project'),
      ],
    },
    {
      name: 'lookAt',
      params: [
        { name: 'eye', type: LD },
        { name: 'target', type: LD },
        { name: 'up', type: LD },
        { name: 'axes', type: LD },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'forward f = normalize(target - eye)' },
        decl('fx', DOUBLE, op('-', at0('target', 0), at0('eye', 0)), 'view'),
        decl('fy', DOUBLE, op('-', at0('target', 1), at0('eye', 1)), 'view'),
        decl('fz', DOUBLE, op('-', at0('target', 2), at0('eye', 2)), 'view'),
        decl('fl', DOUBLE, call('sqrt', [sum3(op('*', v('fx'), v('fx')), op('*', v('fy'), v('fy')), op('*', v('fz'), v('fz')))]), 'view'),
        { kind: 'if', cond: op('==', v('fl'), n(0)), then: [ret(neg(n(1)), 'view')], phase: 'view' },
        set(v('fx'), op('/', v('fx'), v('fl')), 'view'),
        set(v('fy'), op('/', v('fy'), v('fl')), 'view'),
        set(v('fz'), op('/', v('fz'), v('fl')), 'view'),
        { kind: 'comment', text: 'right r = normalize(f x up)' },
        decl('rx', DOUBLE, op('-', op('*', v('fy'), at0('up', 2)), op('*', v('fz'), at0('up', 1))), 'view'),
        decl('ry', DOUBLE, op('-', op('*', v('fz'), at0('up', 0)), op('*', v('fx'), at0('up', 2))), 'view'),
        decl('rz', DOUBLE, op('-', op('*', v('fx'), at0('up', 1)), op('*', v('fy'), at0('up', 0))), 'view'),
        decl('rl', DOUBLE, call('sqrt', [sum3(op('*', v('rx'), v('rx')), op('*', v('ry'), v('ry')), op('*', v('rz'), v('rz')))]), 'view'),
        { kind: 'if', cond: op('==', v('rl'), n(0)), then: [ret(neg(n(1)), 'view')], phase: 'view' },
        set(v('rx'), op('/', v('rx'), v('rl')), 'view'),
        set(v('ry'), op('/', v('ry'), v('rl')), 'view'),
        set(v('rz'), op('/', v('rz'), v('rl')), 'view'),
        set(at0('axes', 0), v('rx'), 'view'),
        set(at0('axes', 1), v('ry'), 'view'),
        set(at0('axes', 2), v('rz'), 'view'),
        { kind: 'comment', text: 'true up u = r x f' },
        set(at0('axes', 3), op('-', op('*', v('ry'), v('fz')), op('*', v('rz'), v('fy'))), 'view'),
        set(at0('axes', 4), op('-', op('*', v('rz'), v('fx')), op('*', v('rx'), v('fz'))), 'view'),
        set(at0('axes', 5), op('-', op('*', v('rx'), v('fy')), op('*', v('ry'), v('fx'))), 'view'),
        set(at0('axes', 6), v('fx'), 'view'),
        set(at0('axes', 7), v('fy'), 'view'),
        set(at0('axes', 8), v('fz'), 'view'),
        ret(n(1), 'view'),
      ],
    },
    {
      name: 'toCamera',
      params: [
        { name: 'axes', type: LD },
        { name: 'eye', type: LD },
        { name: 'px', type: DOUBLE },
        { name: 'py', type: DOUBLE },
        { name: 'pz', type: DOUBLE },
        { name: 'seg', type: LD },
        { name: 'slot', type: INT },
      ],
      returnType: VOID,
      body: [
        decl('dx', DOUBLE, op('-', v('px'), at0('eye', 0)), 'view'),
        decl('dy', DOUBLE, op('-', v('py'), at0('eye', 1)), 'view'),
        decl('dz', DOUBLE, op('-', v('pz'), at0('eye', 2)), 'view'),
        set(
          at('seg', v('slot')),
          sum3(op('*', at0('axes', 0), v('dx')), op('*', at0('axes', 1), v('dy')), op('*', at0('axes', 2), v('dz'))),
          'view',
        ),
        set(
          at('seg', op('+', v('slot'), n(1))),
          sum3(op('*', at0('axes', 3), v('dx')), op('*', at0('axes', 4), v('dy')), op('*', at0('axes', 5), v('dz'))),
          'view',
        ),
        { kind: 'comment', text: 'the camera looks down -z, so depth = -z' },
        set(
          at('seg', op('+', v('slot'), n(2))),
          neg(sum3(op('*', at0('axes', 6), v('dx')), op('*', at0('axes', 7), v('dy')), op('*', at0('axes', 8), v('dz')))),
          'view',
        ),
      ],
    },
  ],
};

export const projectionIRs: IR[] = [projectionImperativeIR];
