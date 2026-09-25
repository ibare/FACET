/**
 * ARP 물음 세기 — 코드 패널용 IR.
 *
 * IR 에는 문자열 비교가 없어 IP 는 부르는 쪽이 옥텟 배열로 바꿔 건넨다.
 *   arpRun(src, dst, gateway, routerIn, routeNext, prefixOctets, sends, cache, known, report) → 방송 수
 *     src · dst · gateway 는 4 칸. routerIn · routeNext 는 routes 차례로 짝을 이룬 4·R 칸 — 라우터 r 이
 *     물음을 받는 쪽 IP 와 넘길 다음 홉 IP. countHops 는 게이트웨이에서 시작해 routerIn 에서 묻는 IP 의
 *     주인을 찾아 routeNext 로 넘어가는 사슬을 따른다 (배열 차례에 기대지 않는다).
 *     known 은 1 + R 칸 0 (홉마다 "이미 물었다"), report 3 칸 [방송, 표에서, 프레임]
 *   countHops(...) → 홉 수 (같은 망 1, 닿지 않으면 −1) — MAC 쌍 수와 같다. −1 이면 arpRun 도 −1 을
 *     돌려준다. 여섯 언어에서 던질 수 없으므로 algorithm 의 arpIrArgs 가 닿는 길을 먼저 확인해 던진다
 *
 * 표의 줄 내용은 셈하지 않는다 — 화면의 계기 넷과 첫 물음의 IP(countHops 의 가지)가 알고리즘과 같다.
 * phase (algorithm.ts 와 같다): pick-next-hop · broadcast-ask · from-table
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST: IRType = { kind: 'list', of: INT };
const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '<' | '==' | '!=' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const inc = (name: string, by: IRExpr, phase?: string): IRStmt =>
  phase
    ? { kind: 'assign', target: v(name), expr: bin('+', v(name), by), phase }
    : { kind: 'assign', target: v(name), expr: bin('+', v(name), by) };

const ADDR = ['src', 'dst', 'gateway', 'routerIn', 'routeNext', 'prefixOctets'];

export const arpImperativeIR: IR = {
  id: 'arp-imperative',
  algorithm: 'arp',
  paradigm: 'imperative',
  functions: [
    {
      name: 'arpRun',
      params: [
        { name: 'src', type: LIST },
        { name: 'dst', type: LIST },
        { name: 'gateway', type: LIST },
        { name: 'routerIn', type: LIST },
        { name: 'routeNext', type: LIST },
        { name: 'prefixOctets', type: INT },
        { name: 'sends', type: INT },
        { name: 'cache', type: INT },
        { name: 'known', type: LIST },
        { name: 'report', type: LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'one hop per link: the sender of each hop asks for the next IP on that link' },
        { kind: 'var', name: 'hops', type: INT, init: call('countHops', ADDR.map(v)) },
        { kind: 'comment', text: 'unreachable: report nothing and return -1 (the caller checks the path first)' },
        { kind: 'if', cond: bin('<', v('hops'), n(0)), then: [{ kind: 'return', expr: n(-1) }] },
        { kind: 'var', name: 'asks', type: INT, init: n(0) },
        { kind: 'var', name: 'hits', type: INT, init: n(0) },
        {
          kind: 'for-range',
          var: 's',
          from: n(0),
          to: v('sends'),
          inclusive: false,
          body: [
            {
              kind: 'for-range',
              var: 'j',
              from: n(0),
              to: v('hops'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: bin('&&', bin('==', v('cache'), n(1)), bin('==', at('known', v('j')), n(1))),
                  then: [
                    { kind: 'comment', text: 'the MAC is already in the table: no broadcast' },
                    inc('hits', n(1), 'from-table'),
                  ],
                  else: [
                    { kind: 'comment', text: 'broadcast "who has this IP?" and take the reply' },
                    inc('asks', n(1), 'broadcast-ask'),
                    {
                      kind: 'if',
                      cond: bin('==', v('cache'), n(1)),
                      then: [{ kind: 'assign', target: at('known', v('j')), expr: n(1) }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { kind: 'assign', target: at('report', n(0)), expr: v('asks') },
        { kind: 'assign', target: at('report', n(1)), expr: v('hits') },
        { kind: 'comment', text: 'frames on the wire: data frames plus a request and a reply per broadcast' },
        {
          kind: 'assign',
          target: at('report', n(2)),
          expr: bin('+', bin('*', v('sends'), v('hops')), bin('*', n(2), v('asks'))),
        },
        { kind: 'return', expr: v('asks') },
      ],
    },
    {
      name: 'countHops',
      params: [
        { name: 'src', type: LIST },
        { name: 'dst', type: LIST },
        { name: 'gateway', type: LIST },
        { name: 'routerIn', type: LIST },
        { name: 'routeNext', type: LIST },
        { name: 'prefixOctets', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'same network: ask for the destination itself, otherwise for the gateway' },
        {
          kind: 'if',
          cond: bin('==', call('samePrefix', [v('src'), v('dst'), v('prefixOctets')]), n(1)),
          then: [{ kind: 'return', expr: n(1) }],
          phase: 'pick-next-hop',
        },
        { kind: 'comment', text: 'cur = -1 means the gateway is asked; otherwise routeNext of router cur is asked' },
        { kind: 'var', name: 'routers', type: INT, init: bin('//', { kind: 'len', of: v('routeNext') }, n(4)) },
        { kind: 'var', name: 'cur', type: INT, init: n(-1) },
        { kind: 'var', name: 'hops', type: INT, init: n(1) },
        {
          kind: 'for-range',
          var: 'step',
          from: n(0),
          to: v('routers'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: bin('==', call('askMatches', [v('cur'), v('gateway'), v('routeNext'), v('dst'), n(0)]), n(1)),
              then: [{ kind: 'return', expr: v('hops') }],
            },
            { kind: 'comment', text: 'the router that owns the asked IP forwards to its next hop' },
            { kind: 'var', name: 'owner', type: INT, init: n(-1) },
            {
              kind: 'for-range',
              var: 'r',
              from: n(0),
              to: v('routers'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: bin('==', v('owner'), n(-1)),
                  then: [
                    {
                      kind: 'if',
                      cond: bin(
                        '==',
                        call('askMatches', [v('cur'), v('gateway'), v('routeNext'), v('routerIn'), bin('*', v('r'), n(4))]),
                        n(1),
                      ),
                      then: [{ kind: 'assign', target: v('owner'), expr: v('r') }],
                    },
                  ],
                },
              ],
            },
            { kind: 'if', cond: bin('==', v('owner'), n(-1)), then: [{ kind: 'return', expr: n(-1) }] },
            { kind: 'assign', target: v('cur'), expr: v('owner') },
            inc('hops', n(1)),
          ],
        },
        {
          kind: 'if',
          cond: bin('==', call('askMatches', [v('cur'), v('gateway'), v('routeNext'), v('dst'), n(0)]), n(1)),
          then: [{ kind: 'return', expr: v('hops') }],
        },
        { kind: 'return', expr: n(-1) },
      ],
    },
    {
      name: 'samePrefix',
      params: [
        { name: 'x', type: LIST },
        { name: 'y', type: LIST },
        { name: 'count', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: v('count'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: bin('!=', at('x', v('i')), at('y', v('i'))),
              then: [{ kind: 'return', expr: n(0) }],
            },
          ],
        },
        { kind: 'return', expr: n(1) },
      ],
    },
    {
      name: 'askMatches',
      params: [
        { name: 'cur', type: INT },
        { name: 'gateway', type: LIST },
        { name: 'routeNext', type: LIST },
        { name: 'other', type: LIST },
        { name: 'offset', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'for-range',
          var: 'k',
          from: n(0),
          to: n(4),
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: bin(
                '!=',
                call('askOctet', [v('cur'), v('gateway'), v('routeNext'), v('k')]),
                at('other', bin('+', v('offset'), v('k'))),
              ),
              then: [{ kind: 'return', expr: n(0) }],
            },
          ],
        },
        { kind: 'return', expr: n(1) },
      ],
    },
    {
      name: 'askOctet',
      params: [
        { name: 'cur', type: INT },
        { name: 'gateway', type: LIST },
        { name: 'routeNext', type: LIST },
        { name: 'k', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'if', cond: bin('<', v('cur'), n(0)), then: [{ kind: 'return', expr: at('gateway', v('k')) }] },
        { kind: 'return', expr: at('routeNext', bin('+', bin('*', v('cur'), n(4)), v('k'))) },
      ],
    },
  ],
};

export const arpIRs: IR[] = [arpImperativeIR];
