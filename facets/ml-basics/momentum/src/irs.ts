/**
 * momentum 의 IR — `momentumRun(path, vel, beta, eta, flatFrom, bowlFrom, bottom)`.
 *
 * path · vel 은 부르는 쪽이 길이 steps + 1 로 만들어 [0] 에 처음 w · v 를 넣어 건넨다. 갱신 t 뒤의 w · v 를
 * path[t] · vel[t] 에 쓴다. 구간마다 속도 줄과 자리 줄을 가지 안에 두어 한 phase 가 그 걸음의 두 줄을 함께 켠다 —
 * 평지 가지는 `v = beta * v` 뿐이라 새로 민 몫이 없다는 것이 코드에 보인다.
 * 셈은 algorithm.ts `momentumCore` 와 같은 길이다.
 *
 * phase: mom-slope · mom-flat · mom-bowl (algorithm.ts 와 같은 집합)
 */
import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const D = { kind: 'double' } as const;
const vr = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '<', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });

const moveW = (phase: string): IRStmt => ({ kind: 'assign', target: vr('w'), expr: bin('+', vr('w'), vr('v')), phase });

export const momentumImperativeIR: IR = {
  id: 'momentum-imperative',
  algorithm: 'momentum',
  paradigm: 'imperative',
  functions: [
    {
      name: 'momentumRun',
      params: [
        { name: 'path', type: { kind: 'list', of: D } },
        { name: 'vel', type: { kind: 'list', of: D } },
        { name: 'beta', type: D },
        { name: 'eta', type: D },
        { name: 'flatFrom', type: D },
        { name: 'bowlFrom', type: D },
        { name: 'bottom', type: D },
      ],
      returnType: { kind: 'void' },
      body: [
        { kind: 'var', name: 'w', type: D, init: { kind: 'index', arr: vr('path'), idx: lit(0) } },
        { kind: 'var', name: 'v', type: D, init: { kind: 'index', arr: vr('vel'), idx: lit(0) } },
        {
          kind: 'for-range',
          var: 't',
          from: lit(1),
          to: { kind: 'len', of: vr('path') },
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: bin('<', vr('w'), vr('flatFrom')),
              phase: 'mom-slope',
              then: [
                { kind: 'comment', text: 'slope: g = -1, so -eta * g = +eta' },
                { kind: 'assign', target: vr('v'), expr: bin('+', bin('*', vr('beta'), vr('v')), vr('eta')), phase: 'mom-slope' },
                moveW('mom-slope'),
              ],
              else: [
                {
                  kind: 'if',
                  cond: bin('<', vr('w'), vr('bowlFrom')),
                  phase: 'mom-flat',
                  then: [
                    { kind: 'comment', text: 'flat: g = 0, only the carried part moves w' },
                    { kind: 'assign', target: vr('v'), expr: bin('*', vr('beta'), vr('v')), phase: 'mom-flat' },
                    moveW('mom-flat'),
                  ],
                  else: [
                    { kind: 'comment', text: 'bowl: g = w - bottom' },
                    {
                      kind: 'assign',
                      target: vr('v'),
                      expr: bin('-', bin('*', vr('beta'), vr('v')), bin('*', vr('eta'), bin('-', vr('w'), vr('bottom')))),
                      phase: 'mom-bowl',
                    },
                    moveW('mom-bowl'),
                  ],
                },
              ],
            },
            { kind: 'assign', target: { kind: 'index', arr: vr('path'), idx: vr('t') }, expr: vr('w') },
            { kind: 'assign', target: { kind: 'index', arr: vr('vel'), idx: vr('t') }, expr: vr('v') },
          ],
        },
      ],
    },
  ],
};

export const momentumIRs: IR[] = [momentumImperativeIR];
