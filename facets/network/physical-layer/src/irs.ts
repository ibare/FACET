/**
 * physical-layer 의 코드 패널 IR — 틀에 담고(stuff) · 부호로 싣고(encode) · 뒤집힘과 가장 긴 평평을 세고 ·
 * 받는 쪽이 되찾는다(receive).
 *
 * IR 은 배열을 만들 수 없어 wire · half · got · report 는 부르는 쪽이 길이만큼 만들어 건넨다.
 * 비트 연산이 없어 XOR 0x20 은 산술(32 의 자리가 1 이면 -32, 아니면 +32), 비트 뽑기는 128 에서 반씩 나눈다.
 * 중간값은 바이트 255 · 반 칸 192 를 넘지 않는다 (32 비트 걱정 없음).
 *
 * phase 어휘 (algorithm.ts 와 같다 — 일곱):
 *   stuff · longest-flat · open-frame · keep-byte · escape · restore-byte · close-frame
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '%' | '<' | '==' | '!=' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const inc = (name: string): IRStmt => set(v(name), bin('+', v(name), n(1)));
const decl = (name: string, init: IRExpr): IRStmt => ({ kind: 'var', name, type: INT, init });

/** 32 의 자리가 1 인가 — XOR 0x20 을 산술로 */
const has32 = (b: IRExpr): IRExpr => bin('==', bin('%', bin('//', b, n(32)), n(2)), n(1));

export const physicalLayerImperativeIR: IR = {
  id: 'physical-layer-imperative',
  algorithm: 'physicalLayer',
  paradigm: 'imperative',
  functions: [
    {
      name: 'physicalLayer',
      params: [
        { name: 'data', type: LIST },
        { name: 'scheme', type: INT },
        { name: 'wire', type: LIST },
        { name: 'half', type: LIST },
        { name: 'got', type: LIST },
        { name: 'report', type: LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'frame the payload, put it on the line, then read it back' },
        decl('w', call('stuff', v('data'), v('wire'))),
        decl('h', call('encode', v('wire'), v('w'), v('scheme'), v('half'))),
        set(at('report', n(0)), v('w')),
        set(at('report', n(1)), call('countTransitions', v('half'), v('h'))),
        { kind: 'comment', text: 'longest flat run in half cells, reported in bit times' },
        set(at('report', n(2)), bin('//', call('longestFlat', v('half'), v('h')), n(2))),
        decl('perBit', n(1)),
        { kind: 'if', cond: bin('==', v('scheme'), n(2)), then: [set(v('perBit'), n(2))] },
        set(at('report', n(3)), bin('*', bin('*', n(8), v('w')), v('perBit'))),
        { kind: 'return', expr: call('receive', v('wire'), v('w'), v('got')) },
      ],
    },
    {
      name: 'stuff',
      params: [
        { name: 'data', type: LIST },
        { name: 'wire', type: LIST },
      ],
      returnType: INT,
      body: [
        decl('w', n(0)),
        set(at('wire', v('w')), n(126)),
        inc('w'),
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: { kind: 'len', of: v('data') },
          inclusive: false,
          phase: 'stuff',
          body: [
            decl('b', at('data', v('i'))),
            {
              kind: 'if',
              cond: bin('||', bin('==', v('b'), n(126)), bin('==', v('b'), n(125))),
              then: [
                { kind: 'comment', text: 'escape: 7D, then the byte with bit 0x20 flipped' },
                set(at('wire', v('w')), n(125)),
                inc('w'),
                {
                  kind: 'if',
                  cond: has32(v('b')),
                  then: [set(at('wire', v('w')), bin('-', v('b'), n(32)))],
                  else: [set(at('wire', v('w')), bin('+', v('b'), n(32)))],
                },
                inc('w'),
              ],
              else: [set(at('wire', v('w')), v('b')), inc('w')],
            },
          ],
        },
        set(at('wire', v('w')), n(126)),
        inc('w'),
        { kind: 'return', expr: v('w') },
      ],
    },
    {
      name: 'bitAt',
      params: [
        { name: 'b', type: INT },
        { name: 'k', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'most significant bit first' },
        decl('d', n(128)),
        {
          kind: 'for-range',
          var: 'j',
          from: n(0),
          to: v('k'),
          inclusive: false,
          body: [set(v('d'), bin('//', v('d'), n(2)))],
        },
        { kind: 'return', expr: bin('%', bin('//', v('b'), v('d')), n(2)) },
      ],
    },
    {
      name: 'encode',
      params: [
        { name: 'wire', type: LIST },
        { name: 'w', type: INT },
        { name: 'scheme', type: INT },
        { name: 'half', type: LIST },
      ],
      returnType: INT,
      body: [
        decl('h', n(0)),
        { kind: 'comment', text: 'NRZI starts low' },
        decl('level', n(0)),
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: v('w'),
          inclusive: false,
          body: [
            {
              kind: 'for-range',
              var: 'k',
              from: n(0),
              to: n(8),
              inclusive: false,
              body: [
                decl('bit', call('bitAt', at('wire', v('i')), v('k'))),
                {
                  kind: 'if',
                  cond: bin('==', v('scheme'), n(0)),
                  then: [
                    { kind: 'comment', text: 'NRZ: 1 is high' },
                    set(at('half', v('h')), v('bit')),
                    set(at('half', bin('+', v('h'), n(1))), v('bit')),
                  ],
                  else: [
                    {
                      kind: 'if',
                      cond: bin('==', v('scheme'), n(1)),
                      then: [
                        { kind: 'comment', text: 'NRZI: a 1 flips the level at the start of the bit' },
                        {
                          kind: 'if',
                          cond: bin('==', v('bit'), n(1)),
                          then: [set(v('level'), bin('-', n(1), v('level')))],
                        },
                        set(at('half', v('h')), v('level')),
                        set(at('half', bin('+', v('h'), n(1))), v('level')),
                      ],
                      else: [
                        { kind: 'comment', text: 'Manchester: 1 is low then high, 0 is high then low' },
                        set(at('half', v('h')), bin('-', n(1), v('bit'))),
                        set(at('half', bin('+', v('h'), n(1))), v('bit')),
                      ],
                    },
                  ],
                },
                set(v('h'), bin('+', v('h'), n(2))),
              ],
            },
          ],
        },
        { kind: 'return', expr: v('h') },
      ],
    },
    {
      name: 'countTransitions',
      params: [
        { name: 'half', type: LIST },
        { name: 'h', type: INT },
      ],
      returnType: INT,
      body: [
        decl('c', n(0)),
        {
          kind: 'for-range',
          var: 'i',
          from: n(1),
          to: v('h'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: bin('!=', at('half', v('i')), at('half', bin('-', v('i'), n(1)))),
              then: [inc('c')],
            },
          ],
        },
        { kind: 'return', expr: v('c') },
      ],
    },
    {
      name: 'longestFlat',
      params: [
        { name: 'half', type: LIST },
        { name: 'h', type: INT },
      ],
      returnType: INT,
      body: [
        decl('run', n(1)),
        decl('best', n(1)),
        {
          kind: 'for-range',
          var: 'i',
          from: n(1),
          to: v('h'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: bin('==', at('half', v('i')), at('half', bin('-', v('i'), n(1)))),
              then: [inc('run')],
              else: [set(v('run'), n(1))],
            },
            set(v('best'), call('max', v('best'), v('run')), 'longest-flat'),
          ],
        },
        { kind: 'return', expr: v('best') },
      ],
    },
    {
      name: 'receive',
      params: [
        { name: 'wire', type: LIST },
        { name: 'w', type: INT },
        { name: 'got', type: LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'state 0 before the frame, 1 inside, 2 right after an escape' },
        decl('state', n(0)),
        decl('g', n(0)),
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: v('w'),
          inclusive: false,
          body: [
            decl('b', at('wire', v('i'))),
            {
              kind: 'if',
              cond: bin('==', v('state'), n(0)),
              then: [
                { kind: 'if', cond: bin('!=', v('b'), n(126)), then: [{ kind: 'return', expr: n(-1) }] },
                set(v('state'), n(1), 'open-frame'),
              ],
              else: [
                {
                  kind: 'if',
                  cond: bin('==', v('state'), n(1)),
                  then: [
                    { kind: 'if', cond: bin('==', v('b'), n(126)), then: [{ kind: 'return', expr: v('g'), phase: 'close-frame' }] },
                    {
                      kind: 'if',
                      cond: bin('==', v('b'), n(125)),
                      then: [set(v('state'), n(2), 'escape')],
                      else: [set(at('got', v('g')), v('b'), 'keep-byte'), inc('g')],
                    },
                  ],
                  else: [
                    {
                      kind: 'if',
                      cond: has32(v('b')),
                      then: [set(at('got', v('g')), bin('-', v('b'), n(32)))],
                      else: [set(at('got', v('g')), bin('+', v('b'), n(32)))],
                      phase: 'restore-byte',
                    },
                    inc('g'),
                    set(v('state'), n(1)),
                  ],
                },
              ],
            },
          ],
        },
        { kind: 'comment', text: 'the frame never closed' },
        { kind: 'return', expr: n(-1) },
      ],
    },
  ],
};

export const physicalLayerIRs: IR[] = [physicalLayerImperativeIR];
