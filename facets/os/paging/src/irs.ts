/**
 * paging — 번역기 IR.
 *
 * `countWalks` 는 algorithm.ts 의 `translateAll` 과 한 줄씩 같은 셈이다. TLB 는 부르는 쪽이 만든
 * 버퍼 셋(`slotPage` · `slotFrame` · `slotUsed`, 길이는 사다리 끝 4)으로 받고, 실제 주소는
 * `physical` 버퍼(길이 16)에 적는다. 돌려주는 값은 표를 찾아간 수.
 *
 * phase 어휘 (algorithm 과 같다): `tlb-hit` · `table-walk` — 참조 하나가 걸음 하나라 걸음마다 둘 중
 * 하나가 켜진다. 훑는 줄 · 준비 줄에는 phase 를 달지 않는다 (걸음 경계 사이에서 덮인다).
 *
 * 페이지 크기 4096 은 IR 안의 리터럴이다 (사양의 서명이 그렇다). initialData.pageBytes 와 같은지는
 * 테스트가 잠근다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const ix = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '*' | '//' | '%' | '<' | '>=' | '>' | '==', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const forRange = (name: string, from: IRExpr, to: IRExpr, body: IRStmt[]): IRStmt => ({
  kind: 'for-range',
  var: name,
  from,
  to,
  inclusive: false,
  body,
});

export const pagingImperativeIR: IR = {
  id: 'paging-imperative',
  algorithm: 'paging',
  paradigm: 'imperative',
  functions: [
    {
      name: 'countWalks',
      params: [
        { name: 'addresses', type: INT_LIST },
        { name: 'pageTable', type: INT_LIST },
        { name: 'slots', type: INT },
        { name: 'slotPage', type: INT_LIST },
        { name: 'slotFrame', type: INT_LIST },
        { name: 'slotUsed', type: INT_LIST },
        { name: 'physical', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'empty TLB: -1 marks a free slot' },
        forRange('s', n(0), v('slots'), [
          set(ix('slotPage', v('s')), n(-1)),
          set(ix('slotFrame', v('s')), n(-1)),
          set(ix('slotUsed', v('s')), n(0)),
        ]),
        { kind: 'var', name: 'walks', type: INT, init: n(0) },
        forRange('i', n(0), { kind: 'len', of: v('addresses') }, [
          { kind: 'comment', text: 'split: page is the top hex digit, offset the other three' },
          { kind: 'var', name: 'page', type: INT, init: bin('//', ix('addresses', v('i')), n(4096)) },
          { kind: 'var', name: 'offset', type: INT, init: bin('%', ix('addresses', v('i')), n(4096)) },
          { kind: 'comment', text: 'look in the TLB first' },
          { kind: 'var', name: 'at', type: INT, init: n(-1) },
          forRange('s', n(0), v('slots'), [
            {
              kind: 'if',
              cond: bin('==', ix('slotPage', v('s')), v('page')),
              then: [set(v('at'), v('s'))],
            },
          ]),
          { kind: 'var', name: 'frame', type: INT, init: n(-1) },
          {
            kind: 'if',
            cond: bin('>=', v('at'), n(0)),
            then: [
              { kind: 'comment', text: 'TLB hit: refresh the slot, take its frame' },
              set(ix('slotUsed', v('at')), v('i'), 'tlb-hit'),
              set(v('frame'), ix('slotFrame', v('at')), 'tlb-hit'),
            ],
            else: [
              { kind: 'comment', text: 'miss: walk the page table' },
              set(v('walks'), bin('+', v('walks'), n(1)), 'table-walk'),
              set(v('frame'), ix('pageTable', v('page')), 'table-walk'),
              {
                kind: 'if',
                cond: bin('>', v('slots'), n(0)),
                phase: 'table-walk',
                then: [
                  { kind: 'comment', text: 'lowest free slot, else the least recently used one' },
                  { kind: 'var', name: 'victim', type: INT, init: n(-1) },
                  forRange('s', n(0), v('slots'), [
                    {
                      kind: 'if',
                      cond: bin('==', v('victim'), n(-1)),
                      then: [
                        {
                          kind: 'if',
                          cond: bin('==', ix('slotPage', v('s')), n(-1)),
                          then: [set(v('victim'), v('s'))],
                        },
                      ],
                    },
                  ]),
                  {
                    kind: 'if',
                    cond: bin('==', v('victim'), n(-1)),
                    then: [
                      set(v('victim'), n(0)),
                      forRange('s', n(1), v('slots'), [
                        {
                          kind: 'if',
                          cond: bin('<', ix('slotUsed', v('s')), ix('slotUsed', v('victim'))),
                          then: [set(v('victim'), v('s'))],
                        },
                      ]),
                    ],
                  },
                  set(ix('slotPage', v('victim')), v('page')),
                  set(ix('slotFrame', v('victim')), v('frame')),
                  set(ix('slotUsed', v('victim')), v('i')),
                ],
              },
            ],
          },
          { kind: 'comment', text: 'join: frame number in front of the same offset' },
          set(ix('physical', v('i')), bin('+', bin('*', v('frame'), n(4096)), v('offset'))),
        ],
      ),
        { kind: 'return', expr: v('walks') },
      ],
    },
  ],
};

export const pagingIRs: IR[] = [pagingImperativeIR];
