/**
 * inlining-tradeoff IR — 한계로 붙여 넣을 함수를 고르고 크기 · 실행을 셈하는 컴파일러 함수.
 *
 * 화면의 세 주소 코드는 입력 자료이고, 이 IR 은 그 프로그램을 **번호 배열로** 받아 읽는다:
 *   - `bodyLen[f]`    피호출 f 의 몸 명령 수 (`return` 포함)
 *   - `siteCallee[j]` main 의 명령 j 가 부르는 피호출 번호 (부르기가 아니면 −1)
 *   - `mainLen`       main 의 명령 수
 *   - `limit`         손잡이 값 (몸 명령 수, `return` 뺌)
 *   - `stats[3]`      0 크기 · 1 실행 · 2 붙인 자리 — 부르는 쪽이 길이 3 으로 만들어 넘긴다
 * 붙인 몸의 글자와 임시 이름을 짓는 것은 IR 로 하지 않는다 (algorithm 몫).
 *
 * phase ↔ 문 (algorithm 과 같은 집합):
 *   - `paste`     한계 안 가지 — 크기 · 실행 · 붙인 자리를 고친다
 *   - `call-kept` 한계 밖 가지 — 부른 자리마다 call + 몸 전부를 실행에 더한다
 *   - `total`     stats 쓰기 · return
 */
import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const INT_LIST = { kind: 'list', of: INT } as const;

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '*' | '<=' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const addTo = (name: string, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined
    ? { kind: 'assign', target: v(name), expr: bin('+', v(name), expr) }
    : { kind: 'assign', target: v(name), expr: bin('+', v(name), expr), phase };

const bodyLenF = at('bodyLen', v('f'));

export const inliningTradeoffImperativeIR: IR = {
  id: 'inlining-tradeoff-imperative',
  algorithm: 'inliningTradeoff',
  paradigm: 'imperative',
  functions: [
    {
      name: 'programCost',
      params: [
        { name: 'bodyLen', type: INT_LIST },
        { name: 'siteCallee', type: INT_LIST },
        { name: 'mainLen', type: INT },
        { name: 'limit', type: INT },
        { name: 'stats', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'size: every instruction kept (definitions stay) · ran: instructions one run of main steps on' },
        { kind: 'var', name: 'size', type: INT, init: v('mainLen') },
        { kind: 'var', name: 'ran', type: INT, init: v('mainLen') },
        { kind: 'var', name: 'pasted', type: INT, init: n(0) },
        {
          kind: 'for-range',
          var: 'f',
          from: n(0),
          to: { kind: 'len', of: v('bodyLen') },
          inclusive: false,
          body: [
            addTo('size', bodyLenF),
            { kind: 'var', name: 'uses', type: INT, init: n(0) },
            {
              kind: 'for-range',
              var: 'j',
              from: n(0),
              to: { kind: 'len', of: v('siteCallee') },
              inclusive: false,
              body: [{ kind: 'if', cond: bin('==', at('siteCallee', v('j')), v('f')), then: [addTo('uses', n(1))] }],
            },
            { kind: 'comment', text: 'inline when the body (without return) fits the limit' },
            {
              kind: 'if',
              cond: bin('<=', bin('-', bodyLenF, n(1)), v('limit')),
              then: [
                { kind: 'comment', text: 'each site: the call line becomes the body, call and return vanish' },
                addTo('size', bin('*', v('uses'), bin('-', bodyLenF, n(2))), 'paste'),
                addTo('ran', bin('*', v('uses'), bin('-', bodyLenF, n(2))), 'paste'),
                addTo('pasted', v('uses'), 'paste'),
              ],
              else: [
                { kind: 'comment', text: 'each site still runs call plus the whole body' },
                addTo('ran', bin('*', v('uses'), bodyLenF), 'call-kept'),
              ],
            },
          ],
        },
        { kind: 'assign', target: at('stats', n(0)), expr: v('size'), phase: 'total' },
        { kind: 'assign', target: at('stats', n(1)), expr: v('ran'), phase: 'total' },
        { kind: 'assign', target: at('stats', n(2)), expr: v('pasted'), phase: 'total' },
        { kind: 'return', expr: v('ran'), phase: 'total' },
      ],
    },
  ],
};

export const inliningTradeoffIRs: IR[] = [inliningTradeoffImperativeIR];
