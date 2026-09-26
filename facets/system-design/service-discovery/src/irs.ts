/**
 * 서비스 디스커버리 IR — 코드 패널이 화면과 같은 답을 낸다.
 *
 * 진입 `discover(expiry, n, deadIdx, stopTick, ticks, beat, calls, lost, last, listed, tally) → int`
 *   lost   1/0 평평한 표 (인스턴스 차례 × 하트비트). 부르는 쪽(algorithm)이 뽑아 건넨다 —
 *          표는 판 머리에 한 번 뽑는 데이터이고, IR 이 보여야 할 것은 만료 판정과 명단 차례다.
 *          그래서 생성기는 IR 에 두지 않는다.
 *   last · listed  길이 n 버퍼 (IR 이 처음 값을 채운다)
 *   tally  길이 3 버퍼 — [죽은 곳에 간 요청, 산 것을 지움, 죽은 인스턴스가 남은 틱]
 *   답 = 죽은 곳에 간 요청. 명단이 빈 채 요청해야 하면 −1 (TS 는 던진다).
 *
 * phase 집합 = { renew, drop, pick } — algorithm 과 같다.
 * 정수만 쓴다. `//` · `%` 는 음이 아닌 값에만. 색인 범위와 읽기를 `&&` 로 잇지 않는다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '%' | '<' | '>=' | '==' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const decl = (name: string, init: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'var', name, type: INT, init, phase } : { kind: 'var', name, type: INT, init };
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const when = (cond: IRExpr, then: IRStmt[], phase?: string): IRStmt =>
  phase ? { kind: 'if', cond, then, phase } : { kind: 'if', cond, then };
const loop = (name: string, from: IRExpr, to: IRExpr, body: IRStmt[], phase?: string): IRStmt =>
  phase
    ? { kind: 'for-range', var: name, from, to, inclusive: false, body, phase }
    : { kind: 'for-range', var: name, from, to, inclusive: false, body };
const note = (text: string): IRStmt => ({ kind: 'comment', text });
const inc = (arr: string, idx: number, phase: string): IRStmt =>
  set(at(arr, n(idx)), bin('+', at(arr, n(idx)), n(1)), phase);

/** 살아 있음: i 가 멈춘 인스턴스이고 tick ≥ stopTick 이면 0 */
const aliveCheck = (phase: string): IRStmt[] => [
  decl('alive', n(1), phase),
  when(bin('==', v('i'), v('deadIdx')), [when(bin('>=', v('tick'), v('stopTick')), [set(v('alive'), n(0), phase)], phase)], phase),
];

const body: IRStmt[] = [
  note('number of heartbeats per instance'),
  decl('nb', bin('//', bin('-', v('ticks'), n(1)), v('beat'))),
  loop('i', n(0), v('n'), [set(at('last', v('i')), n(0)), set(at('listed', v('i')), n(1))]),
  set(at('tally', n(0)), n(0)),
  set(at('tally', n(1)), n(0)),
  set(at('tally', n(2)), n(0)),
  decl('rr', n(0)),
  loop('tick', n(1), v('ticks'), [
    note('heartbeats: a live instance renews its lease unless the beat is lost'),
    when(
      bin('==', bin('%', v('tick'), v('beat')), n(0)),
      [
        loop(
          'i',
          n(0),
          v('n'),
          [
            ...aliveCheck('renew'),
            when(
              bin('==', v('alive'), n(1)),
              [
                decl('k', bin('-', bin('+', bin('*', v('i'), v('nb')), bin('//', v('tick'), v('beat'))), n(1)), 'renew'),
                when(
                  bin('==', at('lost', v('k')), n(0)),
                  [set(at('last', v('i')), v('tick'), 'renew'), set(at('listed', v('i')), n(1), 'renew')],
                  'renew',
                ),
              ],
              'renew',
            ),
          ],
          'renew',
        ),
      ],
      'renew',
    ),
    note('expiry: drop every listed instance silent for expiry ticks or more'),
    loop(
      'i',
      n(0),
      v('n'),
      [
        when(
          bin('==', at('listed', v('i')), n(1)),
          [
            when(
              bin('>=', bin('-', v('tick'), at('last', v('i'))), v('expiry')),
              [
                set(at('listed', v('i')), n(0), 'drop'),
                ...aliveCheck('drop'),
                when(bin('==', v('alive'), n(1)), [inc('tally', 1, 'drop')], 'drop'),
              ],
              'drop',
            ),
          ],
          'drop',
        ),
      ],
      'drop',
    ),
    // 죽은 인스턴스가 남은 틱 — 지움 걸음이 아니라 남아 있는 걸음에 세므로 phase 를 달지 않는다
    note('count ticks the stopped instance is still listed'),
    when(bin('>=', v('tick'), v('stopTick')), [
      when(bin('==', at('listed', v('deadIdx')), n(1)), [
        set(at('tally', n(2)), bin('+', at('tally', n(2)), n(1))),
      ]),
    ]),
    note('requests: the gateway walks the roster in list order'),
    loop(
      'c',
      n(0),
      v('calls'),
      [
        decl('size', n(0), 'pick'),
        loop('i', n(0), v('n'), [set(v('size'), bin('+', v('size'), at('listed', v('i'))), 'pick')], 'pick'),
        when(bin('==', v('size'), n(0)), [{ kind: 'return', expr: n(-1), phase: 'pick' }], 'pick'),
        decl('j', bin('%', v('rr'), v('size')), 'pick'),
        set(v('rr'), bin('+', v('rr'), n(1)), 'pick'),
        decl('seen', n(0), 'pick'),
        decl('chosen', n(-1), 'pick'),
        loop(
          'i',
          n(0),
          v('n'),
          [
            when(
              bin('==', at('listed', v('i')), n(1)),
              [
                when(bin('==', v('seen'), v('j')), [set(v('chosen'), v('i'), 'pick')], 'pick'),
                set(v('seen'), bin('+', v('seen'), n(1)), 'pick'),
              ],
              'pick',
            ),
          ],
          'pick',
        ),
        when(
          bin('==', v('chosen'), v('deadIdx')),
          [when(bin('>=', v('tick'), v('stopTick')), [inc('tally', 0, 'pick')], 'pick')],
          'pick',
        ),
      ],
      'pick',
    ),
  ]),
  { kind: 'return', expr: at('tally', n(0)) },
];

export const serviceDiscoveryImperativeIR: IR = {
  id: 'service-discovery-imperative',
  algorithm: 'serviceDiscovery',
  paradigm: 'imperative',
  functions: [
    {
      name: 'discover',
      params: [
        { name: 'expiry', type: INT },
        { name: 'n', type: INT },
        { name: 'deadIdx', type: INT },
        { name: 'stopTick', type: INT },
        { name: 'ticks', type: INT },
        { name: 'beat', type: INT },
        { name: 'calls', type: INT },
        { name: 'lost', type: INT_LIST },
        { name: 'last', type: INT_LIST },
        { name: 'listed', type: INT_LIST },
        { name: 'tally', type: INT_LIST },
      ],
      returnType: INT,
      body,
    },
  ],
};

export const serviceDiscoveryIRs: IR[] = [serviceDiscoveryImperativeIR];
