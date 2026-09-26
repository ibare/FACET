/**
 * mlp-activation IR — `mlpTrain` 이 algorithm.ts 의 같은 이름 함수와 한 줄씩 같은 셈을 한다
 * (sim `mlp_core`). 배열을 만들 수 없으니 무게 · 치우침 · 오차 · 결과 버퍼는 부르는 쪽이 길이만큼 만들어 넘긴다.
 *
 * phase 어휘 (algorithm 과 같다): train (에폭 반복 안의 모든 문) · count (맞힌 수와 손실을 세는 끝 반복).
 * 모르는 활성화 종류에는 −1 을 돌려준다 (맞힌 수는 0 이상이라 겹치지 않는다). TS 쪽은 던진다.
 * ReLU 는 `max(0, z)` 대신 `if z > 0` — 정수 0 과 실수 z 가 섞이면 C++ 의 max 가 막힌다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DBL: IRType = { kind: 'double' };
const LD: IRType = { kind: 'list', of: DBL };
const LI: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '*' | '/' | '<' | '>' | '==' | '||', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const neg = (x: IRExpr): IRExpr => ({ kind: 'unop', op: '-', x });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const decl = (name: string, type: IRType, init: IRExpr): IRStmt => ({ kind: 'var', name, type, init });
const set = (target: IRExpr, expr: IRExpr): IRStmt => ({ kind: 'assign', target, expr });
const loop = (name: string, to: IRExpr, body: IRStmt[]): IRStmt => ({ kind: 'for-range', var: name, from: n(0), to, inclusive: false, body });
const note = (text: string): IRStmt => ({ kind: 'comment', text });

/** 문과 그 안쪽 문 전부에 phase 를 단다 (주석은 phase 를 갖지 않는다). */
function tag(phase: string, stmts: IRStmt[]): IRStmt[] {
  return stmts.map((s): IRStmt => {
    switch (s.kind) {
      case 'comment':
        return s;
      case 'if':
        return { ...s, then: tag(phase, s.then), ...(s.else ? { else: tag(phase, s.else) } : {}), phase };
      case 'for-range':
      case 'while':
        return { ...s, body: tag(phase, s.body), phase };
      default:
        return { ...s, phase };
    }
  });
}

/** z = wa[j] * xs1[i] + wb[j] * xs2[i] + bs[j] */
const zExpr = (): IRExpr =>
  bin('+', bin('+', bin('*', at('wa', v('j')), at('xs1', v('i'))), bin('*', at('wb', v('j')), at('xs2', v('i')))), at('bs', v('j')));

/** p = 1 / (1 + exp(-o)) */
const sigmoidOf = (x: string): IRExpr => bin('/', n(1.0), bin('+', n(1.0), call('exp', neg(v(x)))));

/** o = cs[0] + Σ vs[j] * activate(kind, z) */
const forward = (): IRStmt[] => [
  decl('o', DBL, at('cs', n(0))),
  loop('j', v('hN'), [
    decl('z', DBL, zExpr()),
    set(v('o'), bin('+', v('o'), bin('*', at('vs', v('j')), call('activate', v('kind'), v('z'))))),
  ]),
  decl('p', DBL, sigmoidOf('o')),
];

/** w[j] = w[j] - lr * g / nn */
const step = (arr: string, g: string): IRStmt =>
  set(at(arr, v('j')), bin('-', at(arr, v('j')), bin('/', bin('*', v('lr'), v(g)), v('nn'))));

const trainLoop: IRStmt[] = tag('train', [
  loop('ep', v('epochs'), [
    note('forward pass: error d = sigmoid(o) - y for every point'),
    loop('i', v('n'), [...forward(), set(at('ds', v('i')), bin('-', v('p'), at('ys', v('i'))))]),
    note('each hidden unit: gather its gradient over all points, then update it'),
    loop('j', v('hN'), [
      decl('ga', DBL, n(0.0)),
      decl('gb', DBL, n(0.0)),
      decl('gbias', DBL, n(0.0)),
      decl('gv', DBL, n(0.0)),
      loop('i', v('n'), [
        decl('z', DBL, zExpr()),
        decl('h', DBL, call('activate', v('kind'), v('z'))),
        decl('dh', DBL, call('slope', v('kind'), v('z'))),
        set(v('gv'), bin('+', v('gv'), bin('*', at('ds', v('i')), v('h')))),
        decl('dz', DBL, bin('*', bin('*', at('ds', v('i')), at('vs', v('j'))), v('dh'))),
        set(v('ga'), bin('+', v('ga'), bin('*', v('dz'), at('xs1', v('i'))))),
        set(v('gb'), bin('+', v('gb'), bin('*', v('dz'), at('xs2', v('i'))))),
        set(v('gbias'), bin('+', v('gbias'), v('dz'))),
      ]),
      step('wa', 'ga'),
      step('wb', 'gb'),
      step('bs', 'gbias'),
      step('vs', 'gv'),
    ]),
    note('output bias'),
    decl('gc', DBL, n(0.0)),
    loop('i', v('n'), [set(v('gc'), bin('+', v('gc'), at('ds', v('i'))))]),
    set(at('cs', n(0)), bin('-', at('cs', n(0)), bin('/', bin('*', v('lr'), v('gc')), v('nn')))),
  ]),
]);

const countLoop: IRStmt[] = tag('count', [
  decl('right', INT, n(0)),
  decl('loss', DBL, n(0.0)),
  loop('i', v('n'), [
    ...forward(),
    {
      kind: 'if',
      cond: bin('==', at('ys', v('i')), n(1)),
      then: [set(v('loss'), bin('-', v('loss'), call('log', v('p'))))],
      else: [set(v('loss'), bin('-', v('loss'), call('log', bin('-', n(1.0), v('p')))))],
    },
    decl('guess', INT, n(0)),
    { kind: 'if', cond: bin('>', v('o'), n(0)), then: [set(v('guess'), n(1))] },
    { kind: 'if', cond: bin('==', v('guess'), at('ys', v('i'))), then: [set(v('right'), bin('+', v('right'), n(1)))] },
  ]),
  set(at('stats', n(0)), bin('/', v('loss'), v('nn'))),
  { kind: 'return', expr: v('right') },
]);

/** kind 0 none · 1 ReLU · 2 sigmoid 를 하나씩 명시한다. */
const byKind = (none: IRStmt[], relu: IRStmt[], sigmoid: IRStmt[]): IRStmt[] => [
  { kind: 'if', cond: bin('==', v('kind'), n(0)), then: none },
  { kind: 'if', cond: bin('==', v('kind'), n(1)), then: relu },
  { kind: 'if', cond: bin('==', v('kind'), n(2)), then: sigmoid },
  note('unreachable: mlpTrain rejects any other kind before training'),
  { kind: 'return', expr: n(0.0) },
];

export const mlpActivationImperativeIR: IR = {
  id: 'mlp-activation-imperative',
  algorithm: 'mlpActivation',
  paradigm: 'imperative',
  functions: [
    {
      name: 'mlpTrain',
      params: [
        { name: 'kind', type: INT },
        { name: 'xs1', type: LD },
        { name: 'xs2', type: LD },
        { name: 'ys', type: LI },
        { name: 'wa', type: LD },
        { name: 'wb', type: LD },
        { name: 'bs', type: LD },
        { name: 'vs', type: LD },
        { name: 'cs', type: LD },
        { name: 'ds', type: LD },
        { name: 'stats', type: LD },
        { name: 'epochs', type: INT },
        { name: 'lr', type: DBL },
      ],
      returnType: INT,
      body: [
        note('kind: 0 none, 1 ReLU, 2 sigmoid. Anything else is not an activation.'),
        { kind: 'if', cond: bin('||', bin('<', v('kind'), n(0)), bin('>', v('kind'), n(2))), then: [{ kind: 'return', expr: neg(n(1)) }] },
        decl('n', INT, { kind: 'len', of: v('ys') }),
        decl('hN', INT, { kind: 'len', of: v('vs') }),
        decl('nn', DBL, v('n')),
        note('full-batch gradient descent, one update per epoch'),
        ...trainLoop,
        note('count correct points and the mean cross-entropy'),
        ...countLoop,
      ],
    },
    {
      name: 'activate',
      params: [
        { name: 'kind', type: INT },
        { name: 'z', type: DBL },
      ],
      returnType: DBL,
      body: byKind(
        [{ kind: 'return', expr: v('z') }],
        [{ kind: 'if', cond: bin('>', v('z'), n(0)), then: [{ kind: 'return', expr: v('z') }] }, { kind: 'return', expr: n(0.0) }],
        [{ kind: 'return', expr: sigmoidOf('z') }],
      ),
    },
    {
      name: 'slope',
      params: [
        { name: 'kind', type: INT },
        { name: 'z', type: DBL },
      ],
      returnType: DBL,
      body: byKind(
        [{ kind: 'return', expr: n(1.0) }],
        [{ kind: 'if', cond: bin('>', v('z'), n(0)), then: [{ kind: 'return', expr: n(1.0) }] }, { kind: 'return', expr: n(0.0) }],
        [decl('s', DBL, sigmoidOf('z')), { kind: 'return', expr: bin('*', v('s'), bin('-', n(1.0), v('s'))) }],
      ),
    },
  ],
};

export const mlpActivationIRs: IR[] = [mlpActivationImperativeIR];
