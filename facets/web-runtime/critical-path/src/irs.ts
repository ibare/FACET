/**
 * critical-path 의 코드 패널 IR.
 *
 * `computeTimeline(attr, preload, out)` 하나 — algorithm.ts 의 `computeTimeline` 과 같은 식으로
 * 자원 요청/도착·실행·첫 장·DOM 완성·글꼴 요청/도착/바뀜·간격까지 열여섯 자리를 채운다. 반복 없이
 * 정수 사칙연산·비교·`max` 뿐이라 IR 로 온전히 편다 (`IR_MATH_BUILTINS` 의 `max` 만 쓴다).
 *
 * **줄바꿈(문단 다시 놓기)은 여기 두지 않는다.** 이 완제품의 핵심 주장(속성 × preload 가 시각을
 * 어떻게 가르는가)과 무관하고, 낱말 폭 계산 값은 손잡이와 무관한 고정 상수(대체 2줄·Brand 3줄)라
 * 여섯 언어로 갈릴 셈이랄 것이 없다 — `algorithm.ts`(순수 TS) 에서만 셈한다.
 *
 * phase 어휘는 `algorithm.ts` 와 정확히 같은 집합이다 (`body-sweep` 은 걸음 경계가 없는 연속
 * 운동이라 어느 쪽에도 없다 — 대응하는 코드 줄이 없어 IR 문장에 얹을 자리가 없다).
 */
import type { IR, IRBinOp, IRExpr, IRStmt, IRType } from '@ffacet/core';

const intT: IRType = { kind: 'int' };
const listIntT: IRType = { kind: 'list', of: intT };
const voidT: IRType = { kind: 'void' };

function lit(value: number): IRExpr {
  return { kind: 'lit', value };
}
function vr(name: string): IRExpr {
  return { kind: 'var', name };
}
function bin(op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr {
  return { kind: 'binop', op, l, r };
}
function idx(arr: IRExpr, i: number): IRExpr {
  return { kind: 'index', arr, idx: lit(i) };
}
function max(a: IRExpr, b: IRExpr): IRExpr {
  return { kind: 'call', fn: 'max', args: [a, b] };
}
function decl(name: string, init: IRExpr, phase?: string): IRStmt {
  return phase ? { kind: 'var', name, type: intT, init, phase } : { kind: 'var', name, type: intT, init };
}
function set(name: string, expr: IRExpr, phase?: string): IRStmt {
  const target = vr(name);
  return phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
}
function setOut(i: number, name: string): IRStmt {
  return { kind: 'assign', target: idx(vr('out'), i), expr: vr(name) };
}

const body: IRStmt[] = [
  { kind: 'comment', text: 'Critical path timeline. Mirrors algorithm.ts computeTimeline().' },

  decl('reqSite', bin('*', bin('+', lit(1), vr('preload')), lit(10)), 'request-site'),
  decl('reqApp', bin('*', bin('+', lit(2), vr('preload')), lit(10)), 'request-app'),
  decl('arriveSite', bin('+', vr('reqSite'), lit(150)), 'site-arrive'),
  decl('arriveApp', bin('+', vr('reqApp'), lit(250)), 'app-arrive'),

  decl('execAppStart', lit(0)),
  decl('execAppEnd', lit(0)),
  decl('stallMs', lit(0)),
  decl('firstPaintAt', lit(0)),
  decl('parseEndAt', lit(0)),
  decl('dclAt', lit(0)),

  {
    kind: 'if',
    cond: bin('==', vr('attr'), lit(0)),
    then: [
      set('execAppStart', vr('arriveApp'), 'app-exec'),
      set('execAppEnd', bin('+', vr('execAppStart'), lit(60)), 'parser-resume'),
      set('stallMs', bin('-', vr('execAppEnd'), vr('reqApp')), 'parser-stop'),
      set('firstPaintAt', max(bin('+', vr('execAppEnd'), lit(10)), vr('arriveSite')), 'first-paint'),
      set('parseEndAt', bin('+', vr('firstPaintAt'), lit(50)), 'parse-end'),
      set('dclAt', vr('parseEndAt'), 'dcl'),
    ],
    else: [
      set('stallMs', lit(0)),
      set('parseEndAt', bin('+', vr('reqApp'), lit(60)), 'parse-end'),
      set('firstPaintAt', max(bin('+', vr('reqApp'), lit(10)), vr('arriveSite')), 'first-paint'),
      set('execAppStart', max(vr('parseEndAt'), vr('arriveApp')), 'app-exec'),
      set('execAppEnd', bin('+', vr('execAppStart'), lit(60))),
      {
        kind: 'if',
        cond: bin('==', vr('attr'), lit(1)),
        then: [set('dclAt', vr('execAppEnd'), 'dcl')],
        else: [set('dclAt', vr('parseEndAt'), 'dcl')],
      },
    ],
  },

  decl('fontReqAt', lit(0)),
  {
    kind: 'if',
    cond: bin('==', vr('preload'), lit(1)),
    then: [set('fontReqAt', lit(10), 'request-font-preload')],
    else: [set('fontReqAt', vr('firstPaintAt'), 'font-needed')],
  },
  decl('fontArriveAt', bin('+', vr('fontReqAt'), lit(300)), 'font-arrive'),

  decl('swapAt', lit(0)),
  decl('fallbackShownMs', lit(0)),
  {
    kind: 'if',
    cond: bin('>', vr('fontArriveAt'), vr('firstPaintAt')),
    then: [
      set('swapAt', vr('fontArriveAt'), 'font-swap'),
      set('fallbackShownMs', bin('-', vr('swapAt'), vr('firstPaintAt'))),
    ],
    else: [set('swapAt', lit(-1), 'font-already-arrived'), set('fallbackShownMs', lit(0))],
  },

  decl('domGapMs', lit(0)),
  decl('domGapType', lit(0)),
  {
    kind: 'if',
    cond: bin('==', vr('attr'), lit(0)),
    then: [set('domGapMs', bin('-', vr('parseEndAt'), vr('firstPaintAt'))), set('domGapType', lit(1))],
    else: [set('domGapMs', bin('-', vr('firstPaintAt'), vr('parseEndAt'))), set('domGapType', lit(0))],
  },

  setOut(0, 'reqSite'),
  setOut(1, 'arriveSite'),
  setOut(2, 'reqApp'),
  setOut(3, 'arriveApp'),
  setOut(4, 'execAppStart'),
  setOut(5, 'execAppEnd'),
  setOut(6, 'parseEndAt'),
  setOut(7, 'firstPaintAt'),
  setOut(8, 'dclAt'),
  setOut(9, 'stallMs'),
  setOut(10, 'fontReqAt'),
  setOut(11, 'fontArriveAt'),
  setOut(12, 'swapAt'),
  setOut(13, 'fallbackShownMs'),
  setOut(14, 'domGapMs'),
  setOut(15, 'domGapType'),
  { kind: 'return' },
];

export const criticalPathImperativeIR: IR = {
  id: 'critical-path-imperative',
  algorithm: 'criticalPath',
  paradigm: 'imperative',
  functions: [
    {
      name: 'computeTimeline',
      params: [
        { name: 'attr', type: intT },
        { name: 'preload', type: intT },
        { name: 'out', type: listIntT },
      ],
      returnType: voidT,
      body,
    },
  ],
};

export const criticalPathIRs: IR[] = [criticalPathImperativeIR];
