/**
 * ethernet 의 코드 패널 IR — algorithm.ts 의 simulateCsma 와 같은 짜임.
 *
 * IR 은 배열을 만들 수 없으므로 listen · collided · span · state 를 부르는 쪽이 스테이션 수만큼
 * 만들어 건넨다 (span 은 1 로, 나머지는 0 으로). rng 는 1 칸, report 는 3 칸
 * [끝 슬롯, 충돌, 보냄]. 반환은 버린 수.
 * 이름: `window` · `next` · `out` 을 피해 창은 `span`.
 *
 * phase — send · widen · pick-wait · drop (algorithm.ts 와 같은 집합)
 */
import type { IR, IRExpr, IRFunc, IRStmt, IRType } from '@ffacet/core';
import { LCG, MAX_SLOTS, WINDOW_CAP_IN_IR } from './algorithm.js';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '*' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const inc = (name: string, by: IRExpr = lit(1)): IRStmt => set(v(name), bin('+', v(name), by));
const dec = (name: string): IRStmt => set(v(name), bin('-', v(name), lit(1)));

/** 차례 조건 — 색인이 범위 안이라 && 로 이어도 된다 */
const isReady: IRExpr = bin('&&', bin('==', at('state', v('i')), lit(0)), bin('<=', at('listen', v('i')), v('t')));

const overStations = (body: IRStmt[]): IRStmt => ({
  kind: 'for-range',
  var: 'i',
  from: lit(0),
  to: v('stations'),
  inclusive: false,
  body,
});

const csmaRun: IRFunc = {
  name: 'csmaRun',
  params: [
    { name: 'stations', type: INT },
    { name: 'policy', type: INT },
    { name: 'seed', type: INT },
    { name: 'frameSlots', type: INT },
    { name: 'maxAttempts', type: INT },
    { name: 'listen', type: INT_LIST },
    { name: 'collided', type: INT_LIST },
    { name: 'span', type: INT_LIST },
    { name: 'state', type: INT_LIST },
    { name: 'rng', type: INT_LIST },
    { name: 'report', type: INT_LIST },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'state: 0 waiting, 1 sent, 2 dropped' },
    set(at('rng', lit(0)), bin('%', v('seed'), lit(LCG.mod))),
    { kind: 'var', name: 't', type: INT, init: lit(0) },
    { kind: 'var', name: 'finish', type: INT, init: lit(0) },
    { kind: 'var', name: 'collisions', type: INT, init: lit(0) },
    { kind: 'var', name: 'sent', type: INT, init: lit(0) },
    { kind: 'var', name: 'left', type: INT, init: v('stations') },
    {
      kind: 'while',
      cond: bin('&&', bin('>', v('left'), lit(0)), bin('<', v('t'), lit(MAX_SLOTS))),
      body: [
        { kind: 'comment', text: 'count stations whose turn it is on an idle wire' },
        { kind: 'var', name: 'ready', type: INT, init: lit(0) },
        overStations([{ kind: 'if', cond: isReady, then: [inc('ready')] }]),
        {
          kind: 'if',
          cond: bin('==', v('ready'), lit(1)),
          then: [
            { kind: 'comment', text: 'alone: hold the wire for frameSlots slots' },
            overStations([
              {
                kind: 'if',
                cond: isReady,
                then: [set(at('state', v('i')), lit(1), 'send'), dec('left'), inc('sent')],
              },
            ]),
            inc('t', v('frameSlots')),
            set(v('finish'), v('t')),
          ],
          else: [
            {
              kind: 'if',
              cond: bin('>=', v('ready'), lit(2)),
              then: [
                { kind: 'comment', text: 'collision: every ready station backs off' },
                inc('collisions'),
                overStations([
                  {
                    kind: 'if',
                    cond: isReady,
                    then: [
                      set(at('collided', v('i')), bin('+', at('collided', v('i')), lit(1))),
                      {
                        kind: 'if',
                        cond: bin('>=', at('collided', v('i')), v('maxAttempts')),
                        then: [set(at('state', v('i')), lit(2), 'drop'), dec('left')],
                        else: [
                          {
                            kind: 'if',
                            cond: bin('==', v('policy'), lit(1)),
                            then: [
                              set(
                                at('span', v('i')),
                                { kind: 'call', fn: 'min', args: [bin('*', at('span', v('i')), lit(2)), lit(WINDOW_CAP_IN_IR)] },
                                'widen',
                              ),
                            ],
                            else: [set(at('span', v('i')), lit(2))],
                          },
                          set(
                            at('listen', v('i')),
                            bin('+', bin('+', v('t'), lit(1)), { kind: 'call', fn: 'draw', args: [v('rng'), at('span', v('i'))] }),
                            'pick-wait',
                          ),
                        ],
                      },
                    ],
                  },
                ]),
                inc('t'),
                set(v('finish'), v('t')),
              ],
              else: [inc('t')],
            },
          ],
        },
      ],
    },
    set(at('report', lit(0)), v('finish')),
    set(at('report', lit(1)), v('collisions')),
    set(at('report', lit(2)), v('sent')),
    { kind: 'return', expr: bin('-', v('stations'), v('sent')) },
  ],
};

const drawFn: IRFunc = {
  name: 'draw',
  params: [
    { name: 'rng', type: INT_LIST },
    { name: 'span', type: INT },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'linear congruential step; take the upper bits' },
    set(at('rng', lit(0)), bin('%', bin('+', bin('*', lit(LCG.mul), at('rng', lit(0))), lit(LCG.add)), lit(LCG.mod))),
    { kind: 'return', expr: bin('%', bin('//', at('rng', lit(0)), lit(LCG.shift)), v('span')) },
  ],
};

export const ethernetImperativeIR: IR = {
  id: 'ethernet-imperative',
  algorithm: 'ethernet',
  paradigm: 'imperative',
  functions: [csmaRun, drawFn],
};

export const ethernetIRs: IR[] = [ethernetImperativeIR];
