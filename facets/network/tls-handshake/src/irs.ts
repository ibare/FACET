/**
 * TLS 핸드셰이크의 IR — 코드 패널이 여섯 언어로 보이는 셈.
 *
 * 진입점 handshake 는 한 판을 끝까지 셈해 1 (열림) 또는 0 (끊김) 을 돌려주고, K 넷을 부르는 쪽이
 * 만들어 건넨 keys[4] 에 쓴다 (-1 = 셈하지 않음). IR 은 글자를 셀 수 없으므로 사슬의 tbs 코드값 합은
 * 알고리즘이 셈해 digests[] 로 건넨다.
 *
 * phase 어휘 (algorithm.ts 와 정확히 같다, 열하나):
 *   client-share · middle-to-server · server-share · server-sign · middle-to-client · chain-check ·
 *   sign-ok · handshake-abort · client-key · server-key · middle-keys
 * 가지 안에 문이 둘이면 phase 는 뒤 문에 단다 — 한 걸음에 하나만 켜진다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };
const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '*' | '%' | '==' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const decl = (name: string, init: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'var', name, type: INT, init, phase } : { kind: 'var', name, type: INT, init };
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const isOne = (name: string): IRExpr => bin('==', v(name), n(1));

const handshake: IRStmt[] = [
  { kind: 'comment', text: 'middle: 0 listens only, 1 intercepts. verify: 0 skip, 1 check chain and signature' },
  decl('middleShare', n(-1)),
  decl('signOk', n(0)),
  decl('clientShare', call('powMod', v('g'), v('a'), v('p')), 'client-share'),
  decl('toServer', v('clientShare')),
  {
    kind: 'if',
    cond: isOne('middle'),
    then: [
      set(v('middleShare'), call('powMod', v('g'), v('m'), v('p'))),
      set(v('toServer'), v('middleShare'), 'middle-to-server'),
    ],
  },
  decl('serverShare', call('powMod', v('g'), v('b'), v('p')), 'server-share'),
  { kind: 'comment', text: 'server signs (value it received, its own share) folded into one number' },
  decl('signature', call('powMod', bin('+', bin('*', v('toServer'), v('p')), v('serverShare')), v('leafD'), v('leafN')), 'server-sign'),
  decl('toClient', v('serverShare')),
  {
    kind: 'if',
    cond: isOne('middle'),
    then: [set(v('toClient'), v('middleShare'), 'middle-to-client')],
  },
  {
    kind: 'if',
    cond: isOne('verify'),
    then: [
      {
        kind: 'if',
        cond: bin('==', call('chainHolds', v('sigs'), v('digests'), v('issuerN'), v('issuerE')), n(0)),
        then: [{ kind: 'return', expr: n(0) }],
        phase: 'chain-check',
      },
      { kind: 'comment', text: 'the signature must open to what the client itself saw' },
      {
        kind: 'if',
        cond: bin(
          '!=',
          call('powMod', v('signature'), v('leafE'), v('leafN')),
          bin('+', bin('*', v('clientShare'), v('p')), v('toClient')),
        ),
        then: [{ kind: 'return', expr: n(0), phase: 'handshake-abort' }],
        else: [set(v('signOk'), n(1), 'sign-ok')],
      },
    ],
  },
  set(at('keys', n(0)), call('powMod', v('toClient'), v('a'), v('p')), 'client-key'),
  set(at('keys', n(1)), call('powMod', v('toServer'), v('b'), v('p')), 'server-key'),
  {
    kind: 'if',
    cond: isOne('middle'),
    then: [
      set(at('keys', n(2)), call('powMod', v('clientShare'), v('m'), v('p'))),
      set(at('keys', n(3)), call('powMod', v('serverShare'), v('m'), v('p')), 'middle-keys'),
    ],
  },
  { kind: 'return', expr: n(1) },
];

const chainHolds: IRStmt[] = [
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: { kind: 'len', of: v('sigs') },
    inclusive: false,
    body: [
      {
        kind: 'if',
        cond: bin(
          '!=',
          call('powMod', at('sigs', v('i')), at('issuerE', v('i')), at('issuerN', v('i'))),
          bin('%', at('digests', v('i')), at('issuerN', v('i'))),
        ),
        then: [{ kind: 'return', expr: n(0) }],
      },
    ],
  },
  { kind: 'return', expr: n(1) },
];

const powModBody: IRStmt[] = [
  decl('r', n(1)),
  {
    kind: 'for-range',
    var: 'i',
    from: n(1),
    to: v('power'),
    inclusive: true,
    body: [set(v('r'), bin('%', bin('*', v('r'), bin('%', v('x'), v('modulus'))), v('modulus')))],
  },
  { kind: 'return', expr: v('r') },
];

const intParams = (...names: string[]) => names.map((name) => ({ name, type: INT }));
const listParams = (...names: string[]) => names.map((name) => ({ name, type: INTS }));

export const tlsHandshakeImperativeIR: IR = {
  id: 'tls-handshake-imperative',
  algorithm: 'tlsHandshake',
  paradigm: 'imperative',
  functions: [
    {
      name: 'handshake',
      params: [
        ...intParams('p', 'g', 'a', 'b', 'm', 'middle', 'verify', 'leafN', 'leafE', 'leafD'),
        ...listParams('sigs', 'digests', 'issuerN', 'issuerE', 'keys'),
      ],
      returnType: INT,
      body: handshake,
    },
    {
      name: 'chainHolds',
      params: listParams('sigs', 'digests', 'issuerN', 'issuerE'),
      returnType: INT,
      body: chainHolds,
    },
    {
      name: 'powMod',
      params: intParams('x', 'power', 'modulus'),
      returnType: INT,
      body: powModBody,
    },
  ],
};

export const tlsHandshakeIRs: IR[] = [tlsHandshakeImperativeIR];
