/**
 * round-robin-lb 의 IR — 네 고르는 법 · 열린 수 셈 · 치우침 · 옮김을 정수 배열 · 반복 · 조건으로 편다.
 *
 * 진입 함수 `routeRequests(policy, hold, user, serverRing, keyRing, keyHash12, dropIndex, dropTick,
 * alive, endAt, chosen, lastOf, openNow, gapAt) → int` — 옮겨 간 요청 수. 모르는 방식은 −1 (TS 는 던진다).
 * 버퍼(부르는 쪽이 만든다): alive (1 로 채움) · endAt · chosen · lastOf (−1 로 채움) · openNow · gapAt.
 *
 * 해시(h32 = fmix32(FNV-1a 32))는 비트 연산이라 IR 어휘 밖이다 — algorithm 이 셈해 keyRing[] · keyHash12[] 로
 * 건넨다. keyHash12 의 12 는 4 와 3 을 모두 나누는 수라 h mod 4 · h mod 3 을 함께 낸다 (설명 글이 밝힌다).
 *
 * phase: pick-turn · pick-idlest · pick-mod · pick-ring (각 방식이 pick 을 정하는 문) · drop-server.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '%' | '<' | '>' | '>=' | '==' | '!=' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const when = (cond: IRExpr, then: IRStmt[], otherwise?: IRStmt[]): IRStmt =>
  otherwise ? { kind: 'if', cond, then, else: otherwise } : { kind: 'if', cond, then };
const each = (name: string, to: IRExpr, body: IRStmt[]): IRStmt => ({
  kind: 'for-range',
  var: name,
  from: n(0),
  to,
  inclusive: false,
  body,
});
const isAlive = (s: IRExpr): IRExpr => bin('==', at('alive', s), n(1));
const note = (text: string): IRStmt => ({ kind: 'comment', text });

/** 산 서버 가운데 링 자리가 가장 작은 것을 pick 에 — cond 가 있으면 그것이 참인 서버만 본다. */
const ringScan = (cond?: IRExpr): IRStmt => {
  const take: IRStmt = when(bin('==', v('pick'), n(-1)), [set(v('pick'), v('s'), 'pick-ring')], [
    when(bin('<', at('serverRing', v('s')), at('serverRing', v('pick'))), [set(v('pick'), v('s'), 'pick-ring')]),
  ]);
  return each('s', v('serverCount'), [when(isAlive(v('s')), [cond ? when(cond, [take]) : take])]);
};

const pickTurn: IRStmt[] = [
  note('round robin: skip dropped servers, then take the pointed one and advance'),
  { kind: 'while', cond: bin('==', at('alive', v('turn')), n(0)), body: [set(v('turn'), bin('%', bin('+', v('turn'), n(1)), v('serverCount')))] },
  set(v('pick'), v('turn'), 'pick-turn'),
  set(v('turn'), bin('%', bin('+', v('turn'), n(1)), v('serverCount'))),
];

const pickIdlest: IRStmt[] = [
  note('least connections: fewest open among live servers, ties go to the earlier one'),
  each('s', v('serverCount'), [
    when(isAlive(v('s')), [
      when(bin('==', v('pick'), n(-1)), [set(v('pick'), v('s'), 'pick-idlest')], [
        when(bin('<', at('openNow', v('s')), at('openNow', v('pick'))), [set(v('pick'), v('s'), 'pick-idlest')]),
      ]),
    ]),
  ]),
];

const pickMod: IRStmt[] = [
  note('modulo hash: renumber live servers in list order, take the r-th'),
  { kind: 'var', name: 'liveCount', type: INT, init: n(0) },
  each('s', v('serverCount'), [set(v('liveCount'), bin('+', v('liveCount'), at('alive', v('s'))))]),
  { kind: 'var', name: 'r', type: INT, init: bin('%', at('keyHash12', v('k')), v('liveCount')) },
  each('s', v('serverCount'), [
    when(isAlive(v('s')), [
      when(bin('==', v('pick'), n(-1)), [
        when(bin('==', v('r'), n(0)), [set(v('pick'), v('s'), 'pick-mod')]),
        set(v('r'), bin('-', v('r'), n(1))),
      ]),
    ]),
  ]),
];

const pickRing: IRStmt[] = [
  note('ring hash: first live server clockwise from the key, else wrap to the smallest spot'),
  ringScan(bin('>=', at('serverRing', v('s')), at('keyRing', v('k')))),
  when(bin('==', v('pick'), n(-1)), [ringScan()]),
];

const tickBody: IRStmt[] = [
  when(bin('==', v('t'), v('dropTick')), [set(at('alive', v('dropIndex')), n(0), 'drop-server')]),
  note('count connections still open at this tick'),
  each('s', v('serverCount'), [set(at('openNow', v('s')), n(0))]),
  each('j', v('t'), [
    when(bin('>', at('endAt', v('j')), v('t')), [
      set(at('openNow', at('chosen', v('j'))), bin('+', at('openNow', at('chosen', v('j'))), n(1))),
    ]),
  ]),
  { kind: 'var', name: 'k', type: INT, init: at('user', v('t')) },
  { kind: 'var', name: 'pick', type: INT, init: n(-1) },
  when(bin('==', v('policy'), n(0)), pickTurn, [
    when(bin('==', v('policy'), n(1)), pickIdlest, [
      when(bin('==', v('policy'), n(2)), pickMod, [
        when(bin('==', v('policy'), n(3)), pickRing, [{ kind: 'return', expr: n(-1) }]),
      ]),
    ]),
  ]),
  note('moved: this user last went to a different server'),
  when(bin('!=', at('lastOf', v('k')), n(-1)), [
    when(bin('!=', at('lastOf', v('k')), v('pick')), [set(v('moved'), bin('+', v('moved'), n(1)))]),
  ]),
  set(at('lastOf', v('k')), v('pick')),
  set(at('chosen', v('t')), v('pick')),
  set(at('endAt', v('t')), bin('+', v('t'), at('hold', v('t')))),
  set(at('openNow', v('pick')), bin('+', at('openNow', v('pick')), n(1))),
  note('imbalance of this tick: busiest minus idlest live server'),
  { kind: 'var', name: 'hi', type: INT, init: n(-1) },
  { kind: 'var', name: 'lo', type: INT, init: n(-1) },
  each('s', v('serverCount'), [
    when(isAlive(v('s')), [
      when(bin('||', bin('==', v('hi'), n(-1)), bin('>', at('openNow', v('s')), v('hi'))), [set(v('hi'), at('openNow', v('s')))]),
      when(bin('||', bin('==', v('lo'), n(-1)), bin('<', at('openNow', v('s')), v('lo'))), [set(v('lo'), at('openNow', v('s')))]),
    ]),
  ]),
  set(at('gapAt', v('t')), bin('-', v('hi'), v('lo'))),
];

export const roundRobinLbImperativeIR: IR = {
  id: 'round-robin-lb-imperative',
  algorithm: 'roundRobinLb',
  paradigm: 'imperative',
  functions: [
    {
      name: 'routeRequests',
      params: [
        { name: 'policy', type: INT },
        { name: 'hold', type: INTS },
        { name: 'user', type: INTS },
        { name: 'serverRing', type: INTS },
        { name: 'keyRing', type: INTS },
        { name: 'keyHash12', type: INTS },
        { name: 'dropIndex', type: INT },
        { name: 'dropTick', type: INT },
        { name: 'alive', type: INTS },
        { name: 'endAt', type: INTS },
        { name: 'chosen', type: INTS },
        { name: 'lastOf', type: INTS },
        { name: 'openNow', type: INTS },
        { name: 'gapAt', type: INTS },
      ],
      returnType: INT,
      body: [
        note('hashes come from outside: keyRing = ring spot 0..99, keyHash12 = h32 mod 12'),
        { kind: 'var', name: 'serverCount', type: INT, init: { kind: 'len', of: v('serverRing') } },
        { kind: 'var', name: 'turn', type: INT, init: n(0) },
        { kind: 'var', name: 'moved', type: INT, init: n(0) },
        each('t', { kind: 'len', of: v('hold') }, tickBody),
        { kind: 'return', expr: v('moved') },
      ],
    },
  ],
};

export const roundRobinLbIRs: IR[] = [roundRobinLbImperativeIR];
