/**
 * 디스크 스케줄링 IR — 팔이 움직인 실린더 합을 셈한다.
 *
 * 진입 함수 `seekTotal(reqs, done, start, policy, top)`.
 *   reqs    요청 실린더, 온 차례
 *   done    부르는 쪽이 reqs 길이만큼 0 으로 채워 건넨다 (IR 은 배열을 만들 수 없다)
 *   policy  0 FCFS · 1 SSTF · 2 SCAN · 3 LOOK · 4 C-LOOK  (= initialData.policies 의 색인)
 *   top     끝 실린더 (SCAN 이 끝까지 가는 자리)
 * 처음 가는 쪽은 위(up = 1)로 고정한다 — algorithm 도 'up' 만 받는다.
 *
 * phase 어휘 (algorithm.ts 와 같다):
 *   pick-arrival · pick-nearest · pick-ahead · sweep-edge · turn-back · wrap-lowest
 * 거리를 더하는 줄에는 phase 를 달지 않는다 — 걸음마다 덮여 한 번도 켜지지 않는다.
 *
 * 색인 읽기를 `&&` · `||` 로 잇지 않는다 — 인터프리터가 짧은 회로가 아니다. if 를 중첩한다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '<' | '>' | '==' | '>=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const abs = (x: IRExpr): IRExpr => call('abs', x);
const set = (name: string, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target: v(name), expr } : { kind: 'assign', target: v(name), expr, phase };
const decl = (name: string, init: IRExpr): IRStmt => ({ kind: 'var', name, type: INT, init });
const note = (text: string): IRStmt => ({ kind: 'comment', text });

/** 남은 것 가운데 head 에서 가장 가까운 것. 동률이면 번호가 작은 것 */
const nearestFn = {
  name: 'nearest',
  params: [
    { name: 'reqs', type: INT_LIST },
    { name: 'done', type: INT_LIST },
    { name: 'head', type: INT },
  ],
  returnType: INT,
  body: [
    decl('best', n(-1)),
    {
      kind: 'for-range',
      var: 'i',
      from: n(0),
      to: { kind: 'len', of: v('reqs') },
      inclusive: false,
      body: [
        {
          kind: 'if',
          cond: bin('==', at('done', v('i')), n(0)),
          then: [
            {
              kind: 'if',
              cond: bin('<', v('best'), n(0)),
              then: [set('best', v('i'))],
              else: [
                decl('gap', abs(bin('-', at('reqs', v('i')), v('head')))),
                decl('bestGap', abs(bin('-', at('reqs', v('best')), v('head')))),
                {
                  kind: 'if',
                  cond: bin('<', v('gap'), v('bestGap')),
                  then: [set('best', v('i'))],
                  else: [
                    note('tie: the lower cylinder wins'),
                    {
                      kind: 'if',
                      cond: bin('==', v('gap'), v('bestGap')),
                      then: [
                        {
                          kind: 'if',
                          cond: bin('<', at('reqs', v('i')), at('reqs', v('best'))),
                          then: [set('best', v('i'))],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    { kind: 'return', expr: v('best') },
  ],
} satisfies IR['functions'][number];

/** 가는 쪽(up 1 이면 큰 번호 쪽)에 남은 것 가운데 가장 가까운 것. 없으면 -1 */
const aheadFn = {
  name: 'ahead',
  params: [
    { name: 'reqs', type: INT_LIST },
    { name: 'done', type: INT_LIST },
    { name: 'head', type: INT },
    { name: 'up', type: INT },
  ],
  returnType: INT,
  body: [
    decl('best', n(-1)),
    {
      kind: 'for-range',
      var: 'i',
      from: n(0),
      to: { kind: 'len', of: v('reqs') },
      inclusive: false,
      body: [
        {
          kind: 'if',
          cond: bin('==', at('done', v('i')), n(0)),
          then: [
            decl('gap', bin('-', at('reqs', v('i')), v('head'))),
            { kind: 'if', cond: bin('==', v('up'), n(0)), then: [set('gap', bin('-', v('head'), at('reqs', v('i'))))] },
            {
              kind: 'if',
              cond: bin('>', v('gap'), n(0)),
              then: [
                {
                  kind: 'if',
                  cond: bin('<', v('best'), n(0)),
                  then: [set('best', v('i'))],
                  else: [
                    decl('bestGap', bin('-', at('reqs', v('best')), v('head'))),
                    {
                      kind: 'if',
                      cond: bin('==', v('up'), n(0)),
                      then: [set('bestGap', bin('-', v('head'), at('reqs', v('best'))))],
                    },
                    { kind: 'if', cond: bin('<', v('gap'), v('bestGap')), then: [set('best', v('i'))] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    { kind: 'return', expr: v('best') },
  ],
} satisfies IR['functions'][number];

const seekTotalFn = {
  name: 'seekTotal',
  params: [
    { name: 'reqs', type: INT_LIST },
    { name: 'done', type: INT_LIST },
    { name: 'start', type: INT },
    { name: 'policy', type: INT },
    { name: 'top', type: INT },
  ],
  returnType: INT,
  body: [
    decl('head', v('start')),
    decl('up', n(1)),
    decl('total', n(0)),
    {
      kind: 'for-range',
      var: 'step',
      from: n(0),
      to: { kind: 'len', of: v('reqs') },
      inclusive: false,
      body: [
        decl('pick', n(-1)),
        {
          kind: 'if',
          cond: bin('==', v('policy'), n(0)),
          then: [note('FCFS: arrival order'), set('pick', v('step'), 'pick-arrival')],
        },
        {
          kind: 'if',
          cond: bin('==', v('policy'), n(1)),
          then: [note('SSTF: nearest remaining'), set('pick', call('nearest', v('reqs'), v('done'), v('head')), 'pick-nearest')],
        },
        {
          kind: 'if',
          cond: bin('>=', v('policy'), n(2)),
          then: [
            note('SCAN, LOOK, C-LOOK: nearest on the way'),
            set('pick', call('ahead', v('reqs'), v('done'), v('head'), v('up')), 'pick-ahead'),
            {
              kind: 'if',
              cond: bin('<', v('pick'), n(0)),
              then: [
                {
                  kind: 'if',
                  cond: bin('==', v('policy'), n(2)),
                  then: [
                    note('SCAN: run to the edge first'),
                    decl('edge', n(0)),
                    { kind: 'if', cond: bin('==', v('up'), n(1)), then: [set('edge', v('top'))] },
                    set('total', bin('+', v('total'), abs(bin('-', v('edge'), v('head'))))),
                    set('head', v('edge'), 'sweep-edge'),
                  ],
                },
                {
                  kind: 'if',
                  cond: bin('==', v('policy'), n(4)),
                  then: [
                    note('C-LOOK: jump to the lowest remaining'),
                    set('pick', call('ahead', v('reqs'), v('done'), n(-1), n(1)), 'wrap-lowest'),
                  ],
                  else: [
                    note('SCAN, LOOK: turn back'),
                    set('up', bin('-', n(1), v('up'))),
                    set('pick', call('ahead', v('reqs'), v('done'), v('head'), v('up')), 'turn-back'),
                  ],
                },
              ],
            },
          ],
        },
        set('total', bin('+', v('total'), abs(bin('-', at('reqs', v('pick')), v('head'))))),
        set('head', at('reqs', v('pick'))),
        { kind: 'assign', target: at('done', v('pick')), expr: n(1) },
      ],
    },
    { kind: 'return', expr: v('total') },
  ],
} satisfies IR['functions'][number];

export const diskSchedulingImperativeIR: IR = {
  id: 'disk-scheduling-imperative',
  algorithm: 'diskScheduling',
  paradigm: 'imperative',
  functions: [seekTotalFn, nearestFn, aheadFn],
};

export const diskSchedulingIRs: IR[] = [diskSchedulingImperativeIR];
