/**
 * dns 의 코드 패널 IR — 질문 서른을 차례로 판정해 서버에 보낸 질의 수를 돌려준다.
 *
 * 주소는 번호로 건넨다 (0 = 바뀌기 전 · 1 = 바뀐 뒤). `tally` 는 부르는 쪽이 길이 2 로 만든다
 * ([적중, 옛 답]). IR 은 배열을 만들 수 없고 글자를 견줄 수 없기 때문이다.
 * 만료 판정은 `지금 ≥ 만료` 면 놓침 — 알고리즘 · 조각 cache-ttl 과 같다.
 * `have == 1 && t < expiry` 는 짧은 회로가 아닌 해석기를 위해 if 를 중첩한다.
 *
 * phase 어휘 (algorithm.ts 와 같다): walk-tree · ask-owner · cache-hit · stale-answer
 */
import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const bin = (op: '+' | '*' | '<' | '>=' | '==' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (i: number): IRExpr => ({ kind: 'index', arr: v('tally'), idx: lit(i) });
const set = (name: string, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target: v(name), expr } : { kind: 'assign', target: v(name), expr, phase };

export const dnsImperativeIR: IR = {
  id: 'dns-imperative',
  algorithm: 'dns',
  paradigm: 'imperative',
  functions: [
    {
      name: 'resolveAll',
      params: [
        { name: 'count', type: INT },
        { name: 'every', type: INT },
        { name: 'ttl', type: INT },
        { name: 'change', type: INT },
        { name: 'layers', type: INT },
        { name: 'tally', type: { kind: 'list', of: INT } },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'tally = [cache hits, stale answers]; returns queries sent to servers' },
        { kind: 'var', name: 'queries', type: INT, init: lit(0) },
        { kind: 'var', name: 'have', type: INT, init: lit(0) },
        { kind: 'var', name: 'cached', type: INT, init: lit(-1) },
        { kind: 'var', name: 'expiry', type: INT, init: lit(0) },
        { kind: 'var', name: 'nsKnown', type: INT, init: lit(0) },
        {
          kind: 'for-range',
          var: 'k',
          from: lit(0),
          to: v('count'),
          inclusive: false,
          body: [
            { kind: 'var', name: 't', type: INT, init: bin('*', v('k'), v('every')) },
            { kind: 'comment', text: 'origin: 0 before the change, 1 after' },
            { kind: 'var', name: 'origin', type: INT, init: lit(0) },
            { kind: 'if', cond: bin('>=', v('t'), v('change')), then: [set('origin', lit(1))] },
            { kind: 'comment', text: 'expired when now >= expiry' },
            { kind: 'var', name: 'fresh', type: INT, init: lit(0) },
            {
              kind: 'if',
              cond: bin('==', v('have'), lit(1)),
              then: [{ kind: 'if', cond: bin('<', v('t'), v('expiry')), then: [set('fresh', lit(1))] }],
            },
            {
              kind: 'if',
              cond: bin('==', v('fresh'), lit(1)),
              then: [
                { kind: 'assign', target: at(0), expr: bin('+', at(0), lit(1)), phase: 'cache-hit' },
                {
                  kind: 'if',
                  cond: bin('!=', v('cached'), v('origin')),
                  then: [{ kind: 'assign', target: at(1), expr: bin('+', at(1), lit(1)), phase: 'stale-answer' }],
                },
              ],
              else: [
                {
                  kind: 'if',
                  cond: bin('==', v('nsKnown'), lit(0)),
                  then: [
                    { kind: 'comment', text: 'first miss walks down from the root' },
                    set('queries', bin('+', v('queries'), v('layers')), 'walk-tree'),
                    set('nsKnown', lit(1)),
                  ],
                  else: [
                    { kind: 'comment', text: 'delegation is kept, so ask the owner only' },
                    set('queries', bin('+', v('queries'), lit(1)), 'ask-owner'),
                  ],
                },
                set('have', lit(1)),
                set('cached', v('origin')),
                set('expiry', bin('+', v('t'), v('ttl'))),
              ],
            },
          ],
        },
        { kind: 'return', expr: v('queries') },
      ],
    },
  ],
};

export const dnsIRs: IR[] = [dnsImperativeIR];
