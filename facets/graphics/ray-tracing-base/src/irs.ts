/**
 * 광선 추적 한 줄 — 명령형 IR.
 *
 * 진입은 `renderRow`. 픽셀마다 광선 하나를 쏘아(`shoot`) 유리 원에 들어가고(`enter`) 나와 벽까지 가고(`exit`),
 * 벽의 점에서 빛으로 그림자 광선을 쏘고(`shadow`), 칸에 띠 번호와 빛/그림자를 적는다(`shade`).
 * phase 집합은 algorithm.ts 와 같다.
 *
 * IR 에는 배열을 만들 수 없어 버퍼를 받는다: `ray` = [x, y, dx, dy] (길이 4), `band` · `lit` (길이 count).
 * 각 · 삼각함수가 없다 — 표시용 각은 TS 에서만 셈한다. 실수 사칙 + sqrt · floor 뿐.
 * 셈할 수 없는 상태는 TS 가 던지고 IR 은 표지를 돌려준다: 전반사 → refract 0 · traceToWall −1,
 * 벽에 못 닿음 → traceToWall −2, 띠 밖 → band −1.0, 진입 함수는 −1.
 * 원 교차 t 와 벽 t 가 같으면 벽 쪽으로 친다 (algorithm 과 같다).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const D: IRType = { kind: 'double' };
const I: IRType = { kind: 'int' };
const LD: IRType = { kind: 'list', of: { kind: 'double' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '/' | '<' | '<=' | '>' | '>=' | '==' | '||' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const neg = (x: IRExpr): IRExpr => ({ kind: 'unop', op: '-', x });
const at = (arr: string, idx: number | IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx: typeof idx === 'number' ? n(idx) : idx });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const decl = (name: string, type: IRType, init: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'var', name, type, init, phase } : { kind: 'var', name, type, init };
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const ret = (expr: IRExpr): IRStmt => ({ kind: 'return', expr });
const note = (text: string): IRStmt => ({ kind: 'comment', text });

/** ε 보다 큰 첫 근, 없으면 −1.0 */
const hitCircleFn = {
  name: 'hitCircle',
  params: [
    { name: 'ox', type: D }, { name: 'oy', type: D }, { name: 'dx', type: D }, { name: 'dy', type: D },
    { name: 'cx', type: D }, { name: 'cy', type: D }, { name: 'radius', type: D },
  ],
  returnType: D,
  body: [
    decl('px', D, bin('-', v('ox'), v('cx'))),
    decl('py', D, bin('-', v('oy'), v('cy'))),
    decl('b', D, bin('+', bin('*', v('px'), v('dx')), bin('*', v('py'), v('dy')))),
    decl('c', D, bin('-', bin('+', bin('*', v('px'), v('px')), bin('*', v('py'), v('py'))), bin('*', v('radius'), v('radius')))),
    decl('disc', D, bin('-', bin('*', v('b'), v('b')), v('c'))),
    note('a negative discriminant misses: decide before sqrt'),
    { kind: 'if', cond: bin('<', v('disc'), n(0.0)), then: [ret(n(-1.0))] },
    decl('s', D, call('sqrt', v('disc'))),
    note('smaller root first, the first one beyond epsilon'),
    decl('tNear', D, bin('-', neg(v('b')), v('s'))),
    { kind: 'if', cond: bin('>', v('tNear'), n(0.0001)), then: [ret(v('tNear'))] },
    decl('tFar', D, bin('+', neg(v('b')), v('s'))),
    { kind: 'if', cond: bin('>', v('tFar'), n(0.0001)), then: [ret(v('tFar'))] },
    ret(n(-1.0)),
  ] as IRStmt[],
};

/** Snell — 법선은 광선이 온 쪽을 본다. 꺾인 단위 방향을 ray[2], ray[3] 에. 전반사 0 */
const refractFn = {
  name: 'refract',
  params: [
    { name: 'dx', type: D }, { name: 'dy', type: D }, { name: 'nx', type: D }, { name: 'ny', type: D },
    { name: 'eta', type: D }, { name: 'ray', type: LD },
  ],
  returnType: I,
  body: [
    decl('cosi', D, neg(bin('+', bin('*', v('dx'), v('nx')), bin('*', v('dy'), v('ny'))))),
    decl('k', D, bin('-', n(1.0), bin('*', bin('*', v('eta'), v('eta')), bin('-', n(1.0), bin('*', v('cosi'), v('cosi')))))),
    note('total internal reflection: cannot happen when passing a circle'),
    { kind: 'if', cond: bin('<', v('k'), n(0.0)), then: [ret(n(0))] },
    decl('a', D, bin('-', bin('*', v('eta'), v('cosi')), call('sqrt', v('k')))),
    decl('rx', D, bin('+', bin('*', v('eta'), v('dx')), bin('*', v('a'), v('nx')))),
    decl('ry', D, bin('+', bin('*', v('eta'), v('dy')), bin('*', v('a'), v('ny')))),
    decl('norm', D, call('sqrt', bin('+', bin('*', v('rx'), v('rx')), bin('*', v('ry'), v('ry'))))),
    set(at('ray', 2), bin('/', v('rx'), v('norm'))),
    set(at('ray', 3), bin('/', v('ry'), v('norm'))),
    ret(n(1)),
  ] as IRStmt[],
};

/** ray = [x, y, dx, dy]. 지난 면 수 (0 · 2), 전반사 −1, 벽에 못 닿음 −2 */
const traceToWallFn = {
  name: 'traceToWall',
  params: [
    { name: 'ox', type: D }, { name: 'oy', type: D }, { name: 'dx', type: D }, { name: 'dy', type: D },
    { name: 'cx', type: D }, { name: 'cy', type: D }, { name: 'radius', type: D }, { name: 'n', type: D },
    { name: 'wallY', type: D }, { name: 'ray', type: LD },
  ],
  returnType: I,
  body: [
    set(at('ray', 0), v('ox')),
    set(at('ray', 1), v('oy')),
    set(at('ray', 2), v('dx')),
    set(at('ray', 3), v('dy')),
    decl('crossed', I, n(0)),
    {
      kind: 'for-range', var: 'hop', from: n(0), to: n(3), inclusive: false,
      body: [
        decl('tHit', D, call('hitCircle', at('ray', 0), at('ray', 1), at('ray', 2), at('ray', 3), v('cx'), v('cy'), v('radius')), 'shoot'),
        { kind: 'if', cond: bin('<', v('tHit'), n(0.0)), then: [{ kind: 'break' }] },
        note('the wall comes first (a tie goes to the wall)'),
        {
          kind: 'if', cond: bin('>', at('ray', 3), n(0.0)),
          then: [
            decl('tWall', D, bin('/', bin('-', v('wallY'), at('ray', 1)), at('ray', 3))),
            { kind: 'if', cond: bin('<=', v('tWall'), v('tHit')), then: [{ kind: 'break' }] },
          ],
        },
        decl('hx', D, bin('+', at('ray', 0), bin('*', v('tHit'), at('ray', 2)))),
        decl('hy', D, bin('+', at('ray', 1), bin('*', v('tHit'), at('ray', 3)))),
        decl('nx', D, bin('/', bin('-', v('hx'), v('cx')), v('radius'))),
        decl('ny', D, bin('/', bin('-', v('hy'), v('cy')), v('radius'))),
        decl('ok', I, n(0)),
        note('the normal faces the side the ray came from'),
        {
          kind: 'if', cond: bin('<', bin('+', bin('*', at('ray', 2), v('nx')), bin('*', at('ray', 3), v('ny'))), n(0.0)),
          then: [set(v('ok'), call('refract', at('ray', 2), at('ray', 3), v('nx'), v('ny'), bin('/', n(1.0), v('n')), v('ray')), 'enter')],
          else: [set(v('ok'), call('refract', at('ray', 2), at('ray', 3), neg(v('nx')), neg(v('ny')), v('n'), v('ray')), 'exit')],
        },
        { kind: 'if', cond: bin('==', v('ok'), n(0)), then: [ret(n(-1))] },
        set(at('ray', 0), v('hx')),
        set(at('ray', 1), v('hy')),
        set(v('crossed'), bin('+', v('crossed'), n(1))),
      ],
    },
    { kind: 'if', cond: bin('<=', at('ray', 3), n(0.0)), then: [ret(n(-2))], phase: 'exit' },
    decl('tEnd', D, bin('/', bin('-', v('wallY'), at('ray', 1)), at('ray', 3)), 'exit'),
    set(at('ray', 0), bin('+', at('ray', 0), bin('*', v('tEnd'), at('ray', 2))), 'exit'),
    set(at('ray', 1), v('wallY'), 'exit'),
    ret(v('crossed')),
  ] as IRStmt[],
};

/** 그림자 광선 — 빛까지 거리 안에서 유리에 닿으면 1 */
const blockedFn = {
  name: 'blocked',
  params: [
    { name: 'px', type: D }, { name: 'py', type: D }, { name: 'lx', type: D }, { name: 'ly', type: D },
    { name: 'cx', type: D }, { name: 'cy', type: D }, { name: 'radius', type: D },
  ],
  returnType: I,
  body: [
    decl('sx', D, bin('-', v('lx'), v('px'))),
    decl('sy', D, bin('-', v('ly'), v('py'))),
    decl('dist', D, call('sqrt', bin('+', bin('*', v('sx'), v('sx')), bin('*', v('sy'), v('sy'))))),
    decl('tHit', D, call('hitCircle', v('px'), v('py'), bin('/', v('sx'), v('dist')), bin('/', v('sy'), v('dist')), v('cx'), v('cy'), v('radius'))),
    { kind: 'if', cond: bin('&&', bin('>', v('tHit'), n(0.0)), bin('<', v('tHit'), v('dist'))), then: [ret(n(1))] },
    ret(n(0)),
  ] as IRStmt[],
};

/** 진입 — band[k] · lit[k] 를 채우고 그림자 칸 수를 돌려준다. 전반사 · 벽 못 닿음은 −1 */
const renderRowFn = {
  name: 'renderRow',
  params: [
    { name: 'eyeX', type: D }, { name: 'eyeY', type: D },
    { name: 'left', type: D }, { name: 'right', type: D }, { name: 'count', type: I }, { name: 'rowY', type: D },
    { name: 'cx', type: D }, { name: 'cy', type: D }, { name: 'radius', type: D }, { name: 'n', type: D },
    { name: 'wallY', type: D }, { name: 'wallLeft', type: D }, { name: 'bandWidth', type: D }, { name: 'bandCount', type: I },
    { name: 'lightX', type: D }, { name: 'lightY', type: D },
    { name: 'ray', type: LD }, { name: 'band', type: LD }, { name: 'lit', type: LD },
  ],
  returnType: I,
  body: [
    decl('shadowed', I, n(0)),
    {
      kind: 'for-range', var: 'k', from: n(0), to: v('count'), inclusive: false,
      body: [
        note('pixel centre: +0.5 inside the pixel'),
        decl('px', D, bin('+', v('left'), bin('/', bin('*', bin('+', v('k'), n(0.5)), bin('-', v('right'), v('left'))), v('count'))), 'shoot'),
        decl('ex', D, bin('-', v('px'), v('eyeX')), 'shoot'),
        decl('ey', D, bin('-', v('rowY'), v('eyeY')), 'shoot'),
        decl('norm', D, call('sqrt', bin('+', bin('*', v('ex'), v('ex')), bin('*', v('ey'), v('ey')))), 'shoot'),
        decl('crossed', I, call('traceToWall', v('eyeX'), v('eyeY'), bin('/', v('ex'), v('norm')), bin('/', v('ey'), v('norm')),
          v('cx'), v('cy'), v('radius'), v('n'), v('wallY'), v('ray')), 'shoot'),
        { kind: 'if', cond: bin('<', v('crossed'), n(0)), then: [ret(n(-1))] },
        {
          kind: 'if', cond: bin('==', call('blocked', at('ray', 0), at('ray', 1), v('lightX'), v('lightY'), v('cx'), v('cy'), v('radius')), n(1)),
          then: [
            set(at('lit', v('k')), n(0.0), 'shade'),
            set(v('shadowed'), bin('+', v('shadowed'), n(1)), 'shadow'),
          ],
          else: [set(at('lit', v('k')), n(1.0), 'shade')],
          phase: 'shadow',
        },
        note('band number on the wall, -1 when off the wall'),
        decl('b', D, call('floor', bin('/', bin('-', at('ray', 0), v('wallLeft')), v('bandWidth'))), 'shade'),
        {
          kind: 'if', cond: bin('||', bin('<', v('b'), n(0.0)), bin('>=', v('b'), v('bandCount'))),
          then: [set(at('band', v('k')), n(-1.0), 'shade')],
          else: [set(at('band', v('k')), v('b'), 'shade')],
          phase: 'shade',
        },
      ],
    },
    ret(v('shadowed')),
  ] as IRStmt[],
};

export const rayTracingBaseImperativeIR: IR = {
  id: 'ray-tracing-base-imperative',
  algorithm: 'rayTracingBase',
  paradigm: 'imperative',
  functions: [renderRowFn, traceToWallFn, hitCircleFn, refractFn, blockedFn],
};

export const rayTracingBaseIRs: IR[] = [rayTracingBaseImperativeIR];
