/**
 * sha — 코드 패널의 IR. 진입 함수 bobAccepts 가 Bob 의 판정을 낸다 (1 받아들임 · 0 버림 · −1 모르는 방식/공격).
 *
 * IR 에는 비트 연산이 없어 XOR · 돌리기 · 곱을 자리 셈으로 편다. 곱은 반드시 쪼갠다 —
 * x × 40503 을 그대로 쓰면 2.65 × 10⁹ 가 되어 java · cpp · C# 의 32 비트에서만 답이 갈린다.
 * 쪼갠 꼴의 중간값 최대는 lo × 40503 + 65280 ≤ 10 393 545 이다. `//` · `%` 는 음수를 만나지 않는다.
 *
 * 문자열 · 버퍼는 부르는 쪽이 만든다 — 글은 바이트 배열로, forged(길이 12) · pair(길이 2) 는 빈 배열로 넘긴다.
 * phase 는 bobAccepts 와 tagOf 의 가지에만 둔다. 도움 함수(foldStream 아래)는 여러 걸음이 함께 쓰는 줄이라 두지 않는다.
 */

import type { IR, IRExpr, IRFunc, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: { kind: 'int' } };

const n = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const bin = (op: '+' | '-' | '*' | '//' | '%' | '<' | '>' | '==' | '!=' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const decl = (name: string, init: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'var', name, type: INT, init, phase } : { kind: 'var', name, type: INT, init };
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const ret = (expr: IRExpr, phase?: string): IRStmt => (phase ? { kind: 'return', expr, phase } : { kind: 'return', expr });
const when = (cond: IRExpr, then: IRStmt[], phase?: string): IRStmt =>
  phase ? { kind: 'if', cond, then, phase } : { kind: 'if', cond, then };
const loop = (name: string, to: IRExpr, body: IRStmt[], phase?: string): IRStmt =>
  phase
    ? { kind: 'for-range', var: name, from: n(0), to, inclusive: false, body, phase }
    : { kind: 'for-range', var: name, from: n(0), to, inclusive: false, body };
const note = (text: string): IRStmt => ({ kind: 'comment', text });

const bobAccepts: IRFunc = {
  name: 'bobAccepts',
  params: [
    { name: 'scheme', type: INT },
    { name: 'attack', type: INT },
    { name: 'key', type: INT },
    { name: 'msg', type: INTS },
    { name: 'msgLen', type: INT },
    { name: 'alt', type: INTS },
    { name: 'altLen', type: INT },
    { name: 'ext', type: INTS },
    { name: 'extLen', type: INT },
    { name: 'forged', type: INTS },
    { name: 'pair', type: INTS },
  ],
  returnType: INT,
  body: [
    note('scheme 0 = H(m), 1 = H(K||m), 2 = HMAC; attack 0 = rewrite, 1 = extend'),
    when(
      bin('||', bin('||', bin('<', v('scheme'), n(0)), bin('>', v('scheme'), n(2))), bin('||', bin('<', v('attack'), n(0)), bin('>', v('attack'), n(1)))),
      [ret(n(-1))],
    ),
    note('Alice computes the tag T and sends (msg, T)'),
    decl('aliceTag', call('tagOf', v('scheme'), v('key'), v('msg'), v('msgLen'), v('pair')), 'alice-tag'),
    decl('claim', n(0)),
    decl('sentLen', n(0)),
    {
      kind: 'if',
      cond: bin('==', v('attack'), n(0)),
      then: [
        note('Mallory rewrites the message and hashes it from IV 0x6a09 without the key'),
        loop('i', v('altLen'), [set(at('forged', v('i')), at('alt', v('i')))], 'forge-rewrite'),
        set(v('sentLen'), v('altLen'), 'forge-rewrite'),
        set(v('claim'), call('foldStream', n(27145), n(0), n(0), v('forged'), v('sentLen'), v('sentLen')), 'forge-hash'),
      ],
      else: [
        note('Mallory glues the original padding and the extension after the message'),
        decl('known', v('msgLen'), 'forge-glue'),
        when(bin('!=', v('scheme'), n(0)), [set(v('known'), bin('+', v('msgLen'), n(2)), 'forge-glue')], 'forge-glue'),
        decl('glue', bin('+', n(3), bin('%', bin('+', v('known'), n(3)), n(2))), 'forge-glue'),
        loop('i', v('msgLen'), [set(at('forged', v('i')), at('msg', v('i')))], 'forge-glue'),
        loop(
          'j',
          v('glue'),
          [set(at('forged', bin('+', v('msgLen'), v('j'))), call('padByte', v('known'), v('known'), v('j')))],
          'forge-glue',
        ),
        loop(
          'j',
          v('extLen'),
          [set(at('forged', bin('+', bin('+', v('msgLen'), v('glue')), v('j'))), at('ext', v('j')))],
          'forge-glue',
        ),
        set(v('sentLen'), bin('+', bin('+', v('msgLen'), v('glue')), v('extLen')), 'forge-glue'),
        note('the tag T is the internal state: keep folding from it'),
        set(
          v('claim'),
          call('foldStream', v('aliceTag'), n(0), n(0), v('ext'), v('extLen'), bin('+', bin('+', v('known'), v('glue')), v('extLen'))),
          'forge-extend',
        ),
      ],
    },
    note('Bob recomputes the tag of what he received'),
    decl('bob', call('tagOf', v('scheme'), v('key'), v('forged'), v('sentLen'), v('pair'))),
    when(bin('==', v('bob'), v('claim')), [ret(n(1), 'bob-verdict')], 'bob-verdict'),
    ret(n(0), 'bob-verdict'),
  ],
};

const tagOf: IRFunc = {
  name: 'tagOf',
  params: [
    { name: 'scheme', type: INT },
    { name: 'key', type: INT },
    { name: 'msg', type: INTS },
    { name: 'msgLen', type: INT },
    { name: 'pair', type: INTS },
  ],
  returnType: INT,
  body: [
    note('27145 = 0x6a09 (IV)'),
    when(bin('==', v('scheme'), n(0)), [
      ret(call('foldStream', n(27145), n(0), n(0), v('msg'), v('msgLen'), v('msgLen')), 'tag-plain'),
    ]),
    when(bin('==', v('scheme'), n(1)), [
      ret(call('foldStream', n(27145), v('key'), n(2), v('msg'), v('msgLen'), bin('+', v('msgLen'), n(2))), 'tag-prefix'),
    ]),
    when(bin('==', v('scheme'), n(2)), [
      note('13878 = 0x3636 (ipad), 23644 = 0x5c5c (opad)'),
      decl(
        'inner',
        call('foldStream', n(27145), call('xor16', v('key'), n(13878)), n(2), v('msg'), v('msgLen'), bin('+', v('msgLen'), n(2))),
        'tag-hmac',
      ),
      set(at('pair', n(0)), bin('//', v('inner'), n(256)), 'tag-hmac'),
      set(at('pair', n(1)), bin('%', v('inner'), n(256)), 'tag-hmac'),
      ret(call('foldStream', n(27145), call('xor16', v('key'), n(23644)), n(2), v('pair'), n(2), n(4)), 'tag-hmac'),
    ]),
    ret(n(-1)),
  ],
};

const foldStream: IRFunc = {
  name: 'foldStream',
  params: [
    { name: 'h', type: INT },
    { name: 'key', type: INT },
    { name: 'keyLen', type: INT },
    { name: 'msg', type: INTS },
    { name: 'msgLen', type: INT },
    { name: 'countedLen', type: INT },
  ],
  returnType: INT,
  body: [
    note('fold (key bytes || msg || padding) two bytes at a time, starting from state h'),
    decl('stream', bin('+', v('keyLen'), v('msgLen'))),
    decl('z', bin('%', bin('+', v('stream'), n(3)), n(2))),
    decl('total', bin('+', bin('+', v('stream'), n(3)), v('z'))),
    decl('s', v('h')),
    decl('m', n(0)),
    decl('i', n(0)),
    {
      kind: 'while',
      cond: bin('<', v('i'), v('total')),
      body: [
        set(
          v('m'),
          bin(
            '+',
            bin('*', call('streamByte', v('key'), v('keyLen'), v('msg'), v('msgLen'), v('countedLen'), v('i')), n(256)),
            call('streamByte', v('key'), v('keyLen'), v('msg'), v('msgLen'), v('countedLen'), bin('+', v('i'), n(1))),
          ),
        ),
        set(v('s'), call('compress', v('s'), v('m'))),
        set(v('i'), bin('+', v('i'), n(2))),
      ],
    },
    ret(v('s')),
  ],
};

const streamByte: IRFunc = {
  name: 'streamByte',
  params: [
    { name: 'key', type: INT },
    { name: 'keyLen', type: INT },
    { name: 'msg', type: INTS },
    { name: 'msgLen', type: INT },
    { name: 'countedLen', type: INT },
    { name: 'i', type: INT },
  ],
  returnType: INT,
  body: [
    note('byte i of (key bytes || msg || padding)'),
    decl('stream', bin('+', v('keyLen'), v('msgLen'))),
    when(bin('<', v('i'), v('keyLen')), [
      when(bin('==', v('i'), n(0)), [ret(bin('//', v('key'), n(256)))]),
      ret(bin('%', v('key'), n(256))),
    ]),
    when(bin('<', v('i'), v('stream')), [ret(at('msg', bin('-', v('i'), v('keyLen'))))]),
    ret(call('padByte', v('stream'), v('countedLen'), bin('-', v('i'), v('stream')))),
  ],
};

const padByte: IRFunc = {
  name: 'padByte',
  params: [
    { name: 'streamLen', type: INT },
    { name: 'countedLen', type: INT },
    { name: 'j', type: INT },
  ],
  returnType: INT,
  body: [
    note('padding: 0x80, then z zero bytes, then the length in bits as 16 bits, high byte first'),
    decl('z', bin('%', bin('+', v('streamLen'), n(3)), n(2))),
    decl('bits', bin('*', v('countedLen'), n(8))),
    when(bin('==', v('j'), n(0)), [ret(n(128))]),
    when(bin('==', v('j'), bin('+', n(1), v('z'))), [ret(bin('//', v('bits'), n(256)))]),
    when(bin('==', v('j'), bin('+', n(2), v('z'))), [ret(bin('%', v('bits'), n(256)))]),
    ret(n(0)),
  ],
};

const compress: IRFunc = {
  name: 'compress',
  params: [
    { name: 'h', type: INT },
    { name: 'm', type: INT },
  ],
  returnType: INT,
  body: [
    note('three rounds of xor, multiply by 0x9e37, rotate left 5; then add the previous state'),
    decl('x', v('h')),
    loop('k', n(3), [
      set(v('x'), call('xor16', v('x'), v('m'))),
      set(v('x'), call('mul9e37', v('x'))),
      set(v('x'), call('rotl5', v('x'))),
    ]),
    ret(bin('%', bin('+', v('x'), v('h')), n(65536))),
  ],
};

const xor16: IRFunc = {
  name: 'xor16',
  params: [
    { name: 'a', type: INT },
    { name: 'b', type: INT },
  ],
  returnType: INT,
  body: [
    decl('r', n(0)),
    decl('place', n(1)),
    loop('k', n(16), [
      set(
        v('r'),
        bin(
          '+',
          v('r'),
          bin(
            '*',
            bin('%', bin('+', bin('%', bin('//', v('a'), v('place')), n(2)), bin('%', bin('//', v('b'), v('place')), n(2))), n(2)),
            v('place'),
          ),
        ),
      ),
      set(v('place'), bin('*', v('place'), n(2))),
    ]),
    ret(v('r')),
  ],
};

const rotl5: IRFunc = {
  name: 'rotl5',
  params: [{ name: 'x', type: INT }],
  returnType: INT,
  body: [
    note('rotate a 16-bit value left by 5: 32 = 2^5, 2048 = 2^11'),
    ret(bin('+', bin('%', bin('*', v('x'), n(32)), n(65536)), bin('//', v('x'), n(2048)))),
  ],
};

const mul9e37: IRFunc = {
  name: 'mul9e37',
  params: [{ name: 'x', type: INT }],
  returnType: INT,
  body: [
    note('x * 0x9e37 mod 2^16, split so every value stays below 2^31: 40503 = 0x9e37, 55 = 0x37'),
    decl('lo', bin('%', v('x'), n(256))),
    decl('hi', bin('//', v('x'), n(256))),
    ret(bin('%', bin('+', bin('*', v('lo'), n(40503)), bin('*', bin('%', bin('*', v('hi'), n(55)), n(256)), n(256))), n(65536))),
  ],
};

export const shaImperativeIR: IR = {
  id: 'sha-imperative',
  algorithm: 'sha',
  paradigm: 'imperative',
  functions: [bobAccepts, tagOf, foldStream, streamByte, padByte, compress, xor16, rotl5, mul9e37],
};

export const shaIRs: IR[] = [shaImperativeIR];
