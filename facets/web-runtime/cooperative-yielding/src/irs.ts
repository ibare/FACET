/**
 * IR — `cooperative-yielding-imperative`.
 *
 * `computeSchedule` 는 algorithm.ts 의 두 갈래(태스크 줄 · 마이크로태스크 줄)를 정수
 * 산수만으로 다시 편 것이다. 배열을 만들지 않는다 — `clickTimes` 는 부르는 쪽이
 * 채워 건네고, `waits` · `stats` 는 부르는 쪽이 길이만큼 만들어 건넨 버퍼에 쓰기만
 * 한다. 프레임 경계 비교는 나눗셈 대신 교차곱(`(lastBoundary+1)*1000 < target*60`)
 * 으로 정수만 쓴다. phase 어휘는 algorithm.ts 와 정확히 같다: `chunk` · `click` ·
 * `render` (모두 sleep 직전에 설 수 있는 자리에만 달았다 — `done` 은 조각 완료 판정과
 * 같은 코드 자리라 `chunk` 를 함께 쓴다).
 */
import type { IR, IRBinOp, IRExpr, IRStmt, IRType } from '@ffacet/core';

const T_INT: IRType = { kind: 'int' };
const T_BOOL: IRType = { kind: 'bool' };
const T_LIST_INT: IRType = { kind: 'list', of: T_INT };

const lit = (value: number | string | boolean): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });

const decl = (name: string, type: IRType, init: IRExpr): IRStmt => ({ kind: 'var', name, type, init });
const assign = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt => ({ kind: 'assign', target, expr, phase });
const ifS = (cond: IRExpr, then: IRStmt[], els?: IRStmt[]): IRStmt => ({ kind: 'if', cond, then, else: els });
const whileS = (cond: IRExpr, body: IRStmt[]): IRStmt => ({ kind: 'while', cond, body });
const forR = (name: string, from: IRExpr, to: IRExpr, body: IRStmt[]): IRStmt => ({
  kind: 'for-range',
  var: name,
  from,
  to,
  inclusive: false,
  body,
});
const ret = (expr: IRExpr): IRStmt => ({ kind: 'return', expr });
const comment = (text: string): IRStmt => ({ kind: 'comment', text });

const CHUNK = 'chunk';
const CLICK = 'click';
const RENDER = 'render';

/** 렌더 기회 — 지금 boundary 를 지났으면 화면을 dom 에 맞춘다. 셋(마이크로태스크 끝 / 태스크 끝 / idle) 이 같은 모양을 공유한다. */
function renderCheckAtBoundary(kExpr: IRExpr): IRStmt[] {
  return [
    assign(v('k'), kExpr),
    ifS(bin('>', v('k'), v('lastBoundary')), [
      assign(v('lastBoundary'), v('k')),
      ifS(bin('!=', v('screen'), v('dom')), [
        assign(v('renders'), bin('+', v('renders'), lit(1)), RENDER),
        assign(v('screen'), v('dom'), RENDER),
      ]),
    ]),
  ];
}

/** idle 로 waitTarget 까지 기다리는 동안 지나가는 경계마다 본다. waitTarget 자신과 겹치는 경계는 그 태스크 몫이라 뺀다(교차곱 비교). */
function idleRenderLoop(): IRStmt {
  return whileS(
    bin('<', bin('*', bin('+', v('lastBoundary'), lit(1)), lit(1000)), bin('*', v('waitTarget'), lit(60))),
    [
      assign(v('lastBoundary'), bin('+', v('lastBoundary'), lit(1))),
      ifS(bin('!=', v('screen'), v('dom')), [
        assign(v('renders'), bin('+', v('renders'), lit(1)), RENDER),
        assign(v('screen'), v('dom'), RENDER),
      ]),
    ],
  );
}

const body: IRStmt[] = [
  comment('rows advance in fixed-size chunks; MS_PER_100 = 12, TOTAL = 500, click cost = 2ms, floor level = 5, floor delay = 4ms'),
  decl('chunkMs', T_INT, bin('//', bin('*', v('chunkSize'), lit(12)), lit(100))),
  decl('numChunks', T_INT, bin('//', lit(500), v('chunkSize'))),
  decl('t', T_INT, lit(0)),
  decl('level', T_INT, lit(0)),
  decl('dom', T_INT, lit(0)),
  decl('screen', T_INT, lit(0)),
  decl('lastBoundary', T_INT, lit(0)),
  decl('clickIdx', T_INT, lit(0)),
  decl('renders', T_INT, lit(0)),
  decl('floorHits', T_INT, lit(0)),
  decl('doneAt', T_INT, lit(0)),
  decl('scheduledNext', T_INT, lit(0)),
  decl('scheduledActive', T_BOOL, lit(true)),
  decl('k', T_INT, lit(0)),
  decl('target', T_INT, lit(0)),
  decl('waitTarget', T_INT, lit(0)),
  decl('arrival', T_INT, lit(0)),
  decl('wait', T_INT, lit(0)),
  decl('delay', T_INT, lit(0)),
  decl('nextClickAt', T_INT, lit(0)),

  ifS(
    v('viaMicro'),
    [
      comment('microtask queue: every chunk runs inside the same task, no yielding'),
      forR('i', lit(0), v('numChunks'), [
        assign(v('dom'), bin('+', v('dom'), v('chunkSize')), CHUNK),
        assign(v('t'), bin('+', v('t'), v('chunkMs')), CHUNK),
      ]),
      assign(v('doneAt'), v('t'), CHUNK),
      ...renderCheckAtBoundary(bin('//', bin('*', v('t'), lit(60)), lit(1000))),
      whileS(bin('<', v('clickIdx'), lit(3)), [
        assign(v('nextClickAt'), idx(v('clickTimes'), v('clickIdx'))),
        assign(v('target'), v('nextClickAt')),
        assign(v('waitTarget'), v('target')),
        ifS(bin('>', v('t'), v('waitTarget')), [assign(v('waitTarget'), v('t'))]),
        idleRenderLoop(),
        assign(v('arrival'), idx(v('clickTimes'), v('clickIdx'))),
        assign(v('t'), v('waitTarget')),
        assign(v('wait'), bin('-', v('t'), v('arrival'))),
        assign(idx(v('waits'), v('clickIdx')), v('wait'), CLICK),
        assign(v('t'), bin('+', v('t'), lit(2))),
        assign(v('clickIdx'), bin('+', v('clickIdx'), lit(1))),
        ...renderCheckAtBoundary(bin('//', bin('*', v('t'), lit(60)), lit(1000))),
      ]),
    ],
    [
      comment('task queue: every chunk re-queues itself as a fresh task'),
      whileS(bin('||', v('scheduledActive'), bin('<', v('clickIdx'), lit(3))), [
        ifS(
          bin('<', v('clickIdx'), lit(3)),
          [assign(v('nextClickAt'), idx(v('clickTimes'), v('clickIdx')))],
          [assign(v('nextClickAt'), lit(1000000))],
        ),
        ifS(
          v('scheduledActive'),
          [ifS(bin('<', v('scheduledNext'), v('nextClickAt')), [assign(v('target'), v('scheduledNext'))], [assign(v('target'), v('nextClickAt'))])],
          [assign(v('target'), v('nextClickAt'))],
        ),
        assign(v('waitTarget'), v('target')),
        ifS(bin('>', v('t'), v('waitTarget')), [assign(v('waitTarget'), v('t'))]),
        idleRenderLoop(),
        ifS(
          bin('&&', v('scheduledActive'), bin('<=', v('scheduledNext'), v('nextClickAt'))),
          [
            comment('run the chunk task'),
            assign(v('t'), v('waitTarget')),
            ifS(bin('<', v('t'), v('scheduledNext')), [assign(v('t'), v('scheduledNext'))]),
            assign(v('dom'), bin('+', v('dom'), v('chunkSize')), CHUNK),
            assign(v('t'), bin('+', v('t'), v('chunkMs')), CHUNK),
            ...renderCheckAtBoundary(bin('//', bin('*', v('t'), lit(60)), lit(1000))),
            ifS(
              bin('<', v('dom'), lit(500)),
              [
                assign(v('delay'), lit(0)),
                ifS(bin('>', v('level'), lit(5)), [assign(v('delay'), lit(4))]),
                ifS(bin('>', v('delay'), lit(0)), [assign(v('floorHits'), bin('+', v('floorHits'), lit(1)))]),
                assign(v('scheduledNext'), bin('+', v('t'), v('delay')), CHUNK),
                assign(v('level'), bin('+', v('level'), lit(1)), CHUNK),
              ],
              [assign(v('scheduledActive'), lit(false), CHUNK), assign(v('doneAt'), v('t'), CHUNK)],
            ),
          ],
          [
            comment('run the click task'),
            assign(v('arrival'), idx(v('clickTimes'), v('clickIdx'))),
            assign(v('t'), v('waitTarget')),
            ifS(bin('<', v('t'), v('arrival')), [assign(v('t'), v('arrival'))]),
            assign(v('wait'), bin('-', v('t'), v('arrival'))),
            assign(idx(v('waits'), v('clickIdx')), v('wait'), CLICK),
            assign(v('t'), bin('+', v('t'), lit(2))),
            assign(v('clickIdx'), bin('+', v('clickIdx'), lit(1))),
            ...renderCheckAtBoundary(bin('//', bin('*', v('t'), lit(60)), lit(1000))),
          ],
        ),
      ]),
      ifS(bin('!=', v('screen'), v('dom')), [
        assign(v('lastBoundary'), bin('+', v('lastBoundary'), lit(1)), RENDER),
        assign(v('t'), bin('//', bin('*', v('lastBoundary'), lit(1000)), lit(60)), RENDER),
        assign(v('renders'), bin('+', v('renders'), lit(1)), RENDER),
        assign(v('screen'), v('dom'), RENDER),
      ]),
    ],
  ),

  assign(idx(v('stats'), lit(0)), v('renders')),
  assign(idx(v('stats'), lit(1)), v('floorHits')),
  ret(v('doneAt')),
];

export const cooperativeYieldingImperativeIR: IR = {
  id: 'cooperative-yielding-imperative',
  algorithm: 'cooperativeYielding',
  paradigm: 'imperative',
  functions: [
    {
      name: 'computeSchedule',
      params: [
        { name: 'chunkSize', type: T_INT },
        { name: 'viaMicro', type: T_BOOL },
        { name: 'clickTimes', type: T_LIST_INT },
        { name: 'waits', type: T_LIST_INT },
        { name: 'stats', type: T_LIST_INT },
      ],
      returnType: T_INT,
      body,
    },
  ],
};

export const cooperativeYieldingIRs: IR[] = [cooperativeYieldingImperativeIR];
