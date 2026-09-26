/**
 * certificate IR — 받는 쪽의 확인과 서명 · 위조의 셈.
 *
 * 요약의 16 비트 해시값 h16 은 부르는 쪽(알고리즘)이 셈해 인자로 준다 — tbs 글자를 바이트로 바꾸는 문자열 셈과
 * 해시의 안쪽은 IR 에 들이지 않는다. `mod n` 으로 줄이는 것은 IR 안에 있다.
 * 공격자의 찾기(곱하기의 역원 · 겹치는 짝)는 IR 에 없다 — 역원은 확장 유클리드가 음수를 거쳐 여섯 언어의 `//` · `%` 가 갈린다.
 *
 * 함수 (전부 int)
 *   receive(mode, docNumber, h16, sig, issuerN, issuerE, storeN, storeE) — 1 저장소에서 막힘 · 2 서명 확인에서 막힘 · 3 통과 · 모르는 mode −1
 *   signedValue(mode, docNumber, h16, n) — mode 0 문서 번호 (n 이상이면 −1) · 1 h16 % n · 그 밖 −1
 *   sign(mode, docNumber, h16, n, d) — signedValue^d mod n · 서명받는 수가 없으면 −1
 *   forge(forgery, s1, s2, n) — 0 (s1 × s2) % n · 1 · 2 · 3 s1 · 그 밖 −1
 *   modPow(b, e, m) — 제곱-곱하기, 곱할 때마다 mod
 *
 * phase: store · verify (receive) · sign (sign) · forge (forge) — algorithm.ts 와 같다.
 * 중간값 최대: 가짜 n 4661 아래 두 수의 곱 (< 4661² ≈ 2.2 × 10⁷) — 32 비트 안.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '%' | '==' | '!=' | '<' | '>' | '>=' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const ret = (expr: IRExpr, phase?: string): IRStmt => (phase ? { kind: 'return', expr, phase } : { kind: 'return', expr });
const MINUS_ONE: IRExpr = { kind: 'unop', op: '-', x: n(1) };

export const certificateImperativeIR: IR = {
  id: 'certificate-imperative',
  algorithm: 'certificate',
  paradigm: 'imperative',
  functions: [
    {
      name: 'receive',
      params: [
        { name: 'mode', type: INT },
        { name: 'docNumber', type: INT },
        { name: 'h16', type: INT },
        { name: 'sig', type: INT },
        { name: 'issuerN', type: INT },
        { name: 'issuerE', type: INT },
        { name: 'storeN', type: INT },
        { name: 'storeE', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'the issuer key that came with the certificate must be the one in the trust store' },
        {
          kind: 'if',
          cond: bin('||', bin('!=', v('issuerN'), v('storeN')), bin('!=', v('issuerE'), v('storeE'))),
          then: [ret(n(1))],
          phase: 'store',
        },
        {
          kind: 'var',
          name: 'expected',
          type: INT,
          init: call('signedValue', v('mode'), v('docNumber'), v('h16'), v('issuerN')),
        },
        { kind: 'if', cond: bin('<', v('expected'), n(0)), then: [ret(MINUS_ONE)] },
        { kind: 'comment', text: 'open the signature with the public exponent e' },
        {
          kind: 'var',
          name: 'recovered',
          type: INT,
          init: call('modPow', v('sig'), v('issuerE'), v('issuerN')),
          phase: 'verify',
        },
        {
          kind: 'if',
          cond: bin('!=', v('recovered'), v('expected')),
          then: [ret(n(2))],
          phase: 'verify',
        },
        ret(n(3)),
      ],
    },
    {
      name: 'signedValue',
      params: [
        { name: 'mode', type: INT },
        { name: 'docNumber', type: INT },
        { name: 'h16', type: INT },
        { name: 'n', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'mode 0: the document number itself, which must be below n' },
        {
          kind: 'if',
          cond: bin('==', v('mode'), n(0)),
          then: [{ kind: 'if', cond: bin('>=', v('docNumber'), v('n')), then: [ret(MINUS_ONE)] }, ret(v('docNumber'))],
        },
        { kind: 'comment', text: 'mode 1: the digest, the hash reduced mod n' },
        { kind: 'if', cond: bin('==', v('mode'), n(1)), then: [ret(bin('%', v('h16'), v('n')))] },
        ret(MINUS_ONE),
      ],
    },
    {
      name: 'sign',
      params: [
        { name: 'mode', type: INT },
        { name: 'docNumber', type: INT },
        { name: 'h16', type: INT },
        { name: 'n', type: INT },
        { name: 'd', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'm', type: INT, init: call('signedValue', v('mode'), v('docNumber'), v('h16'), v('n')) },
        { kind: 'if', cond: bin('<', v('m'), n(0)), then: [ret(MINUS_ONE)] },
        { kind: 'comment', text: 'sign with the private exponent d' },
        ret(call('modPow', v('m'), v('d'), v('n')), 'sign'),
      ],
    },
    {
      name: 'forge',
      params: [
        { name: 'forgery', type: INT },
        { name: 's1', type: INT },
        { name: 's2', type: INT },
        { name: 'n', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'forgedSig', type: INT, init: MINUS_ONE },
        { kind: 'comment', text: 'multiply: the product of two signatures is a signature on the product' },
        {
          kind: 'if',
          cond: bin('==', v('forgery'), n(0)),
          then: [{ kind: 'assign', target: v('forgedSig'), expr: bin('%', bin('*', v('s1'), v('s2')), v('n')), phase: 'forge' }],
        },
        { kind: 'comment', text: 'colliding pair, key swap, fake root: move the one signature over' },
        {
          kind: 'if',
          cond: bin('==', v('forgery'), n(1)),
          then: [{ kind: 'assign', target: v('forgedSig'), expr: v('s1'), phase: 'forge' }],
        },
        {
          kind: 'if',
          cond: bin('==', v('forgery'), n(2)),
          then: [{ kind: 'assign', target: v('forgedSig'), expr: v('s1'), phase: 'forge' }],
        },
        {
          kind: 'if',
          cond: bin('==', v('forgery'), n(3)),
          then: [{ kind: 'assign', target: v('forgedSig'), expr: v('s1'), phase: 'forge' }],
        },
        ret(v('forgedSig')),
      ],
    },
    {
      name: 'modPow',
      params: [
        { name: 'b', type: INT },
        { name: 'e', type: INT },
        { name: 'm', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'var', name: 'result', type: INT, init: bin('%', n(1), v('m')) },
        { kind: 'var', name: 'x', type: INT, init: bin('%', v('b'), v('m')) },
        { kind: 'var', name: 'k', type: INT, init: v('e') },
        {
          kind: 'while',
          cond: bin('>', v('k'), n(0)),
          body: [
            {
              kind: 'if',
              cond: bin('==', bin('%', v('k'), n(2)), n(1)),
              then: [{ kind: 'assign', target: v('result'), expr: bin('%', bin('*', v('result'), v('x')), v('m')) }],
            },
            { kind: 'assign', target: v('x'), expr: bin('%', bin('*', v('x'), v('x')), v('m')) },
            { kind: 'assign', target: v('k'), expr: bin('//', v('k'), n(2)) },
          ],
        },
        ret(v('result')),
      ],
    },
  ],
};

export const certificateIRs: IR[] = [certificateImperativeIR];
