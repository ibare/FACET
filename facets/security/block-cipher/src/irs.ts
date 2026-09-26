/**
 * block-cipher 의 코드 패널 IR — 한 비트를 바꾼 두 판을 같은 모드 · 같은 열쇠로 잠가 덩어리마다 다른 비트를 센다.
 *
 * IR 에는 비트 연산이 없으므로 16 비트 덩어리를 0/1 배열로 편다. XOR 은 `(a + b) % 2`, 니블 → S-상자 번호는
 * 호너 꼴 `8a + 4b + 2c + d`, 되펼침은 `(s // place) % 2`. 라운드 열쇠를 따로 만들지 않고 라운드 r 의 열쇠 비트 j 를
 * `keyBits[4(r − 1) + j]` 로 주 열쇠에서 바로 읽는다 (창 미끄러짐 그대로 — algorithm.ts 의 roundKey 와 같은 자리).
 *
 * 배열은 부르는 쪽이 만든다: p · p2 · c · c2 (16 × blocks), iv · iv2 · st · tmp (16), keyBits (32), counts (blocks).
 * 모르는 mode · change 는 −1 을 돌려준다 (algorithm 은 던진다). 중간값 최대는 ivVal + b (65535 + blocks) — 32 비트와 멀다.
 *
 * phase: flip-plain · flip-iv · lock-ecb · lock-cbc · lock-ctr · compare (algorithm.ts 와 같다).
 * encryptBlock 안(라운드 열쇠 · S · P)에는 phase 를 달지 않는다 — 상자는 닫힌 채 지나간다.
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST: IRType = { kind: 'list', of: { kind: 'int' } };
const VOID: IRType = { kind: 'void' };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const idx = (arr: string, i: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx: i });
const bin = (op: '+' | '-' | '*' | '//' | '%' | '<' | '==' | '!=' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const add = (l: IRExpr, r: IRExpr) => bin('+', l, r);
const mul = (l: IRExpr, r: IRExpr) => bin('*', l, r);
const xor2 = (l: IRExpr, r: IRExpr) => bin('%', add(l, r), lit(2));
/** 16 * b + j */
const at = (b: IRExpr, j: IRExpr) => add(mul(lit(16), b), j);
const forRange = (name: string, from: IRExpr, to: IRExpr, body: IRStmt[], phase?: string): IRStmt => ({
  kind: 'for-range',
  var: name,
  from,
  to,
  inclusive: false,
  body,
  ...(phase ? { phase } : {}),
});
const assign = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt => ({ kind: 'assign', target, expr, ...(phase ? { phase } : {}) });
const call = (fn: string, args: string[]): IRExpr => ({ kind: 'call', fn, args: args.map(v) });

/** 칸 n 의 비트 k 자리: 4n + k */
const nib = (k: number): IRExpr => add(mul(lit(4), v('n')), lit(k));

const encryptBlock = {
  name: 'encryptBlock',
  params: [
    { name: 'st', type: LIST },
    { name: 'keyBits', type: LIST },
    { name: 'sbox', type: LIST },
    { name: 'perm', type: LIST },
    { name: 'rounds', type: INT },
    { name: 'tmp', type: LIST },
    { name: 'dst', type: LIST },
    { name: 'dOff', type: INT },
  ],
  returnType: VOID,
  body: [
    { kind: 'comment', text: 'round r mixes key bits from position 4(r - 1) of the main key' },
    {
      kind: 'for-range',
      var: 'r',
      from: lit(1),
      to: v('rounds'),
      inclusive: true,
      body: [
        forRange('j', lit(0), lit(16), [
          assign(idx('st', v('j')), xor2(idx('st', v('j')), idx('keyBits', add(mul(lit(4), bin('-', v('r'), lit(1))), v('j'))))),
        ]),
        { kind: 'comment', text: 'S-box on each 4-bit nibble' },
        forRange('n', lit(0), lit(4), [
          {
            kind: 'var',
            name: 'idx4',
            type: INT,
            init: add(
              add(mul(idx('st', nib(0)), lit(8)), mul(idx('st', nib(1)), lit(4))),
              add(mul(idx('st', nib(2)), lit(2)), idx('st', nib(3))),
            ),
          },
          { kind: 'var', name: 'sv', type: INT, init: idx('sbox', v('idx4')) },
          assign(idx('st', nib(0)), bin('%', bin('//', v('sv'), lit(8)), lit(2))),
          assign(idx('st', nib(1)), bin('%', bin('//', v('sv'), lit(4)), lit(2))),
          assign(idx('st', nib(2)), bin('%', bin('//', v('sv'), lit(2)), lit(2))),
          assign(idx('st', nib(3)), bin('%', v('sv'), lit(2))),
        ]),
        {
          kind: 'if',
          cond: bin('<', v('r'), v('rounds')),
          then: [
            { kind: 'comment', text: 'bit at position j moves to position perm[j]' },
            forRange('j', lit(0), lit(16), [assign(idx('tmp', bin('-', idx('perm', v('j')), lit(1))), idx('st', v('j')))]),
            forRange('j', lit(0), lit(16), [assign(idx('st', v('j')), idx('tmp', v('j')))]),
          ],
          else: [
            { kind: 'comment', text: 'last round: no permutation, one more round key' },
            forRange('j', lit(0), lit(16), [
              assign(idx('st', v('j')), xor2(idx('st', v('j')), idx('keyBits', add(mul(lit(4), v('rounds')), v('j'))))),
            ]),
          ],
        },
      ],
    },
    forRange('j', lit(0), lit(16), [assign(idx('dst', add(v('dOff'), v('j'))), idx('st', v('j')))]),
  ],
} satisfies IR['functions'][number];

const blockArgs = ['st', 'keyBits', 'sbox', 'perm', 'rounds', 'tmp', 'c'];
const callBlock: IRStmt[] = [
  { kind: 'var', name: 'off', type: INT, init: mul(lit(16), v('b')) },
];

const encryptMode = {
  name: 'encryptMode',
  params: [
    { name: 'p', type: LIST },
    { name: 'iv', type: LIST },
    { name: 'blocks', type: INT },
    { name: 'mode', type: INT },
    { name: 'rounds', type: INT },
    { name: 'keyBits', type: LIST },
    { name: 'sbox', type: LIST },
    { name: 'perm', type: LIST },
    { name: 'c', type: LIST },
    { name: 'st', type: LIST },
    { name: 'tmp', type: LIST },
  ],
  returnType: INT,
  body: [
    {
      kind: 'if',
      cond: bin('&&', bin('!=', v('mode'), lit(0)), bin('&&', bin('!=', v('mode'), lit(1)), bin('!=', v('mode'), lit(2)))),
      then: [{ kind: 'return', expr: lit(-1) }],
    },
    { kind: 'var', name: 'ivVal', type: INT, init: lit(0) },
    forRange('j', lit(0), lit(16), [assign(v('ivVal'), add(mul(v('ivVal'), lit(2)), idx('iv', v('j'))))]),
    forRange('b', lit(0), v('blocks'), [
      ...callBlock,
      {
        kind: 'if',
        cond: bin('==', v('mode'), lit(0)),
        then: [
          { kind: 'comment', text: 'each block alone' },
          forRange('j', lit(0), lit(16), [assign(idx('st', v('j')), idx('p', at(v('b'), v('j'))))], 'lock-ecb'),
          { kind: 'expr-stmt', expr: { kind: 'call', fn: 'encryptBlock', args: [...blockArgs.map(v), v('off')] }, phase: 'lock-ecb' },
        ],
      },
      {
        kind: 'if',
        cond: bin('==', v('mode'), lit(1)),
        then: [
          { kind: 'comment', text: 'mix in the previous ciphertext block (IV for the first)' },
          {
            kind: 'if',
            cond: bin('==', v('b'), lit(0)),
            then: [forRange('j', lit(0), lit(16), [assign(idx('st', v('j')), xor2(idx('p', v('j')), idx('iv', v('j'))))], 'lock-cbc')],
            else: [
              forRange(
                'j',
                lit(0),
                lit(16),
                [assign(idx('st', v('j')), xor2(idx('p', at(v('b'), v('j'))), idx('c', at(bin('-', v('b'), lit(1)), v('j')))))],
                'lock-cbc',
              ),
            ],
          },
          { kind: 'expr-stmt', expr: { kind: 'call', fn: 'encryptBlock', args: [...blockArgs.map(v), v('off')] }, phase: 'lock-cbc' },
        ],
      },
      {
        kind: 'if',
        cond: bin('==', v('mode'), lit(2)),
        then: [
          { kind: 'comment', text: 'counter IV + b becomes the keystream block' },
          { kind: 'var', name: 'ctr', type: INT, init: bin('%', add(v('ivVal'), v('b')), lit(65536)), phase: 'lock-ctr' },
          { kind: 'var', name: 'place', type: INT, init: lit(32768) },
          forRange('j', lit(0), lit(16), [
            assign(idx('st', v('j')), bin('%', bin('//', v('ctr'), v('place')), lit(2))),
            assign(v('place'), bin('//', v('place'), lit(2))),
          ], 'lock-ctr'),
          { kind: 'expr-stmt', expr: { kind: 'call', fn: 'encryptBlock', args: [...blockArgs.map(v), v('off')] }, phase: 'lock-ctr' },
          forRange('j', lit(0), lit(16), [assign(idx('c', at(v('b'), v('j'))), xor2(idx('p', at(v('b'), v('j'))), idx('c', at(v('b'), v('j')))))], 'lock-ctr'),
        ],
      },
    ]),
    { kind: 'return', expr: lit(0) },
  ],
} satisfies IR['functions'][number];

const modeArgs = (pName: string, ivName: string, cName: string): IRExpr =>
  call('encryptMode', [pName, ivName, 'blocks', 'mode', 'rounds', 'keyBits', 'sbox', 'perm', cName, 'st', 'tmp']);

const diffBits = {
  name: 'diffBits',
  params: [
    { name: 'p', type: LIST },
    { name: 'iv', type: LIST },
    { name: 'change', type: INT },
    { name: 'flipAt', type: INT },
    { name: 'blocks', type: INT },
    { name: 'mode', type: INT },
    { name: 'rounds', type: INT },
    { name: 'keyBits', type: LIST },
    { name: 'sbox', type: LIST },
    { name: 'perm', type: LIST },
    { name: 'p2', type: LIST },
    { name: 'iv2', type: LIST },
    { name: 'c', type: LIST },
    { name: 'c2', type: LIST },
    { name: 'st', type: LIST },
    { name: 'tmp', type: LIST },
    { name: 'counts', type: LIST },
  ],
  returnType: INT,
  body: [
    {
      kind: 'if',
      cond: bin('&&', bin('!=', v('change'), lit(0)), bin('!=', v('change'), lit(1))),
      then: [{ kind: 'return', expr: lit(-1) }],
    },
    forRange('j', lit(0), mul(lit(16), v('blocks')), [assign(idx('p2', v('j')), idx('p', v('j')))]),
    forRange('j', lit(0), lit(16), [assign(idx('iv2', v('j')), idx('iv', v('j')))]),
    { kind: 'comment', text: 'flip one bit: in the first plaintext block, or in the IV' },
    {
      kind: 'if',
      cond: bin('==', v('change'), lit(0)),
      then: [assign(idx('p2', bin('-', v('flipAt'), lit(1))), xor2(idx('p', bin('-', v('flipAt'), lit(1))), lit(1)), 'flip-plain')],
    },
    {
      kind: 'if',
      cond: bin('==', v('change'), lit(1)),
      then: [assign(idx('iv2', bin('-', v('flipAt'), lit(1))), xor2(idx('iv', bin('-', v('flipAt'), lit(1))), lit(1)), 'flip-iv')],
    },
    { kind: 'var', name: 'first', type: INT, init: modeArgs('p', 'iv', 'c') },
    { kind: 'if', cond: bin('==', v('first'), lit(-1)), then: [{ kind: 'return', expr: lit(-1) }] },
    { kind: 'var', name: 'second', type: INT, init: modeArgs('p2', 'iv2', 'c2') },
    { kind: 'if', cond: bin('==', v('second'), lit(-1)), then: [{ kind: 'return', expr: lit(-1) }] },
    { kind: 'comment', text: 'overlay C and C2: count the bits that differ in each block' },
    { kind: 'var', name: 'total', type: INT, init: lit(0), phase: 'compare' },
    forRange(
      'b',
      lit(0),
      v('blocks'),
      [
        forRange('j', lit(0), lit(16), [
          assign(idx('counts', v('b')), add(idx('counts', v('b')), xor2(idx('c', at(v('b'), v('j'))), idx('c2', at(v('b'), v('j')))))),
        ]),
        assign(v('total'), add(v('total'), idx('counts', v('b')))),
      ],
      'compare',
    ),
    { kind: 'return', expr: v('total'), phase: 'compare' },
  ],
} satisfies IR['functions'][number];

export const blockCipherImperativeIR: IR = {
  id: 'block-cipher-imperative',
  algorithm: 'blockCipher',
  paradigm: 'imperative',
  functions: [diffBits, encryptMode, encryptBlock],
};

export const blockCipherIRs: IR[] = [blockCipherImperativeIR];
