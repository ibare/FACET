/**
 * 방화벽 — 코드 패널 IR.
 *
 * 화면과 같은 셈이다 (algorithm.ts `firstMatch` · `firewallRound`). 주소는 옥텟 배열로 편다 —
 * 규칙은 `번호 × 4 + 옥텟`, 패킷은 `패킷 번호 × 4 + 옥텟`. 32 비트 정수 한 칸으로 두면 java · C# 에서 넘친다.
 * `any` 주소는 0.0.0.0/0, `any` 프로토콜 · 포트는 −1, `tcp` 는 6 으로 부르는 쪽이 바꿔 건넨다.
 * `order[j]` = 자리 j 에 선 규칙 번호 — 손잡이가 바꾸는 것은 이 배열 하나다.
 *
 * 인터프리터의 `&&` 는 짧은 회로가 아니라 칸마다 `ok` 를 내리는 꼴로 둔다. 중간값은 255 를 넘지 않는다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const BOOL: IRType = { kind: 'bool' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const b = (value: boolean): IRExpr => ({ kind: 'lit', value });
const ix = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '-' | '*' | '//' | '<=' | '>=' | '>' | '==' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op: o,
  l,
  r,
});
const not = (x: IRExpr): IRExpr => ({ kind: 'unop', op: '!', x });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const setOk = (value: boolean): IRStmt => ({ kind: 'assign', target: v('ok'), expr: b(value) });

const ruleParams = ['order', 'proto', 'src', 'srcLen', 'dst', 'dstLen', 'port', 'pProto', 'pSrc', 'pDst', 'pPort'];

const prefixMatch = {
  name: 'prefixMatch',
  params: [
    { name: 'addr', type: INTS },
    { name: 'ao', type: INT },
    { name: 'net', type: INTS },
    { name: 'no', type: INT },
    { name: 'k', type: INT },
  ],
  returnType: BOOL,
  body: [
    { kind: 'comment', text: 'compare the first k bits of addr[ao..ao+3] and net[no..no+3]' },
    {
      kind: 'for-range',
      var: 'i',
      from: n(0),
      to: n(4),
      inclusive: false,
      body: [
        { kind: 'var', name: 'left', type: INT, init: op('-', v('k'), op('*', n(8), v('i'))) },
        { kind: 'if', cond: op('<=', v('left'), n(0)), then: [{ kind: 'return', expr: b(true) }] },
        {
          kind: 'if',
          cond: op('>=', v('left'), n(8)),
          then: [
            {
              kind: 'if',
              cond: op('!=', ix('addr', op('+', v('ao'), v('i'))), ix('net', op('+', v('no'), v('i')))),
              then: [{ kind: 'return', expr: b(false) }],
            },
          ],
          else: [
            { kind: 'comment', text: 'partial octet: compare the quotients by 2^(8 - left)' },
            { kind: 'var', name: 'd', type: INT, init: n(1) },
            {
              kind: 'for-range',
              var: 's',
              from: n(0),
              to: op('-', n(8), v('left')),
              inclusive: false,
              body: [{ kind: 'assign', target: v('d'), expr: op('*', v('d'), n(2)) }],
            },
            {
              kind: 'if',
              cond: op(
                '!=',
                op('//', ix('addr', op('+', v('ao'), v('i'))), v('d')),
                op('//', ix('net', op('+', v('no'), v('i'))), v('d')),
              ),
              then: [{ kind: 'return', expr: b(false) }],
            },
          ],
        },
      ],
    },
    { kind: 'return', expr: b(true) },
  ],
} satisfies IR['functions'][number];

const firstMatch = {
  name: 'firstMatch',
  params: [...ruleParams.map((name) => ({ name, type: INTS })), { name: 'p', type: INT }],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'walk the list from the top; stop at the first rule whose four fields all match' },
    {
      kind: 'for-range',
      var: 'j',
      from: n(0),
      to: { kind: 'len', of: v('order') },
      inclusive: false,
      body: [
        { kind: 'var', name: 'r', type: INT, init: ix('order', v('j')) },
        { kind: 'var', name: 'ok', type: BOOL, init: b(true) },
        { kind: 'comment', text: '-1 means any' },
        {
          kind: 'if',
          cond: op('>=', ix('proto', v('r')), n(0)),
          then: [
            { kind: 'if', cond: op('!=', ix('proto', v('r')), ix('pProto', v('p'))), then: [setOk(false)] },
          ],
        },
        {
          kind: 'if',
          cond: v('ok'),
          then: [
            {
              kind: 'if',
              cond: not(
                call('prefixMatch', [
                  v('pSrc'),
                  op('*', n(4), v('p')),
                  v('src'),
                  op('*', n(4), v('r')),
                  ix('srcLen', v('r')),
                ]),
              ),
              then: [setOk(false)],
            },
          ],
        },
        {
          kind: 'if',
          cond: v('ok'),
          then: [
            {
              kind: 'if',
              cond: not(
                call('prefixMatch', [
                  v('pDst'),
                  op('*', n(4), v('p')),
                  v('dst'),
                  op('*', n(4), v('r')),
                  ix('dstLen', v('r')),
                ]),
              ),
              then: [setOk(false)],
            },
          ],
        },
        {
          kind: 'if',
          cond: v('ok'),
          then: [
            {
              kind: 'if',
              cond: op('>=', ix('port', v('r')), n(0)),
              then: [
                { kind: 'if', cond: op('!=', ix('port', v('r')), ix('pPort', v('p'))), then: [setOk(false)] },
              ],
            },
          ],
        },
        {
          kind: 'if',
          cond: v('ok'),
          then: [{ kind: 'return', expr: op('+', v('j'), n(1)), phase: 'stop-first' }],
        },
      ],
    },
    { kind: 'return', expr: n(0) },
  ],
} satisfies IR['functions'][number];

const runAll = {
  name: 'runAll',
  params: [...ruleParams.map((name) => ({ name, type: INTS })), { name: 'depth', type: INTS }, { name: 'hits', type: INTS }],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'depth[p] = position of the first matching rule, hits[r] = times rule r matched first' },
    {
      kind: 'for-range',
      var: 'p',
      from: n(0),
      to: { kind: 'len', of: v('pPort') },
      inclusive: false,
      body: [
        {
          kind: 'var',
          name: 'dep',
          type: INT,
          init: call('firstMatch', [...ruleParams.map((name) => v(name)), v('p')]),
        },
        { kind: 'assign', target: ix('depth', v('p')), expr: v('dep') },
        {
          kind: 'if',
          cond: op('>', v('dep'), n(0)),
          then: [
            {
              kind: 'assign',
              target: ix('hits', ix('order', op('-', v('dep'), n(1)))),
              expr: op('+', ix('hits', ix('order', op('-', v('dep'), n(1)))), n(1)),
            },
          ],
        },
      ],
    },
    { kind: 'comment', text: 'a rule that never matched first is dead: rules above it catch everything it would' },
    { kind: 'var', name: 'dead', type: INT, init: n(0) },
    {
      kind: 'for-range',
      var: 'j',
      from: n(0),
      to: { kind: 'len', of: v('order') },
      inclusive: false,
      body: [
        {
          kind: 'if',
          cond: op('==', ix('hits', ix('order', v('j'))), n(0)),
          then: [{ kind: 'assign', target: v('dead'), expr: op('+', v('dead'), n(1)) }],
          phase: 'check-never-first',
        },
      ],
    },
    { kind: 'return', expr: v('dead') },
  ],
} satisfies IR['functions'][number];

export const firewallImperativeIR: IR = {
  id: 'firewall-imperative',
  algorithm: 'firewall',
  paradigm: 'imperative',
  functions: [runAll, firstMatch, prefixMatch],
};

export const firewallIRs: IR[] = [firewallImperativeIR];
