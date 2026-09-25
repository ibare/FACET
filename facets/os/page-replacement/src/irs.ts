/**
 * page-replacement IR — 교체기 `countFaults` 하나.
 *
 * algorithm.ts 의 `countFaults` 와 한 줄 한 줄 같은 셈이다. 버퍼 셋(`slotPage` · `slotStamp` · `slotMark`)은
 * IR 이 배열을 만들 수 없어 부르는 쪽이 사다리 끝(5) 길이로 만들어 건넨다.
 *
 * phase 어휘 (algorithm.ts 와 정확히 같다) — 걸음마다 하나, **그 걸음에 실제로 도는 줄에만** 단다:
 *   hit-fifo    적중 · FIFO — 바꾸는 것이 없어 다음 참조로 넘어가는 `continue`
 *   hit-lru     적중 · LRU — 마지막 쓴 때를 지금으로
 *   hit-clock   적중 · Clock — 표시를 1 로
 *   fill        폴트 · 빈 프레임을 고름
 *   evict-stamp 폴트 · FIFO/LRU — 때가 가장 이른 프레임을 고름
 *   evict-clock 폴트 · Clock — 바늘이 돌아 표시 0 인 프레임을 고름
 *
 * 사양은 `hit` 하나를 `if policy == …` 두 줄에, `evict` 하나를 두 갈래에 달았다. 그러면 FIFO 적중에 LRU · Clock 줄이,
 * FIFO/LRU 내보냄에 Clock 의 while 줄이 켜진다 — 도는 줄만 켜지도록 정책마다 나눴다.
 * Clock 의 while 본문(표시 지우기)에는 phase 를 두지 않는다 — 바늘이 표시 0 에 곧장 닿는 걸음에서는 돌지 않는 줄이다.
 */
import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const INTS = { kind: 'list', of: INT } as const;

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const idx = (arr: string, i: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx: i });
const bin = (op: '+' | '%' | '<' | '>=' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target, expr } : { kind: 'assign', target, expr, phase };

/** hand = (hand + 1) % frames */
const advanceHand = (phase?: string): IRStmt => set(v('hand'), bin('%', bin('+', v('hand'), lit(1)), v('frames')), phase);

export const pageReplacementImperativeIR: IR = {
  id: 'page-replacement-imperative',
  algorithm: 'pageReplacement',
  paradigm: 'imperative',
  functions: [
    {
      name: 'countFaults',
      params: [
        { name: 'refs', type: INTS },
        { name: 'frames', type: INT },
        { name: 'policy', type: INT },
        { name: 'slotPage', type: INTS },
        { name: 'slotStamp', type: INTS },
        { name: 'slotMark', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'policy: 0 FIFO, 1 LRU, 2 Clock. slotPage -1 means an empty frame' },
        {
          kind: 'for-range',
          var: 's',
          from: lit(0),
          to: v('frames'),
          inclusive: false,
          body: [
            set(idx('slotPage', v('s')), lit(-1)),
            set(idx('slotStamp', v('s')), lit(0)),
            set(idx('slotMark', v('s')), lit(0)),
          ],
        },
        { kind: 'var', name: 'faults', type: INT, init: lit(0) },
        { kind: 'var', name: 'hand', type: INT, init: lit(0) },
        {
          kind: 'for-range',
          var: 'i',
          from: lit(0),
          to: { kind: 'len', of: v('refs') },
          inclusive: false,
          body: [
            { kind: 'var', name: 'page', type: INT, init: idx('refs', v('i')) },
            { kind: 'var', name: 'at', type: INT, init: lit(-1) },
            {
              kind: 'for-range',
              var: 's',
              from: lit(0),
              to: v('frames'),
              inclusive: false,
              body: [{ kind: 'if', cond: bin('==', idx('slotPage', v('s')), v('page')), then: [set(v('at'), v('s'))] }],
            },
            {
              kind: 'if',
              cond: bin('>=', v('at'), lit(0)),
              then: [
                { kind: 'comment', text: 'hit: FIFO keeps the arrival order' },
                {
                  kind: 'if',
                  cond: bin('==', v('policy'), lit(1)),
                  then: [set(idx('slotStamp', v('at')), v('i'), 'hit-lru')],
                },
                {
                  kind: 'if',
                  cond: bin('==', v('policy'), lit(2)),
                  then: [set(idx('slotMark', v('at')), lit(1), 'hit-clock')],
                },
                { kind: 'continue', phase: 'hit-fifo' },
              ],
            },
            { kind: 'comment', text: 'fault: an empty frame first, lowest number first' },
            set(v('faults'), bin('+', v('faults'), lit(1))),
            { kind: 'var', name: 'victim', type: INT, init: lit(-1) },
            {
              kind: 'for-range',
              var: 's',
              from: lit(0),
              to: v('frames'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: bin('==', v('victim'), lit(-1)),
                  then: [
                    {
                      kind: 'if',
                      cond: bin('==', idx('slotPage', v('s')), lit(-1)),
                      then: [set(v('victim'), v('s'), 'fill')],
                    },
                  ],
                },
              ],
            },
            {
              kind: 'if',
              cond: bin('==', v('victim'), lit(-1)),
              then: [
                {
                  kind: 'if',
                  cond: bin('==', v('policy'), lit(2)),
                  then: [
                    { kind: 'comment', text: 'Clock: clear marks until the hand meets a 0' },
                    {
                      kind: 'while',
                      cond: bin('==', idx('slotMark', v('hand')), lit(1)),
                      phase: 'evict-clock',
                      body: [set(idx('slotMark', v('hand')), lit(0)), advanceHand()],
                    },
                    set(v('victim'), v('hand'), 'evict-clock'),
                    advanceHand('evict-clock'),
                  ],
                  else: [
                    { kind: 'comment', text: 'FIFO and LRU: the earliest stamp leaves' },
                    set(v('victim'), lit(0), 'evict-stamp'),
                    {
                      kind: 'for-range',
                      var: 's',
                      from: lit(1),
                      to: v('frames'),
                      inclusive: false,
                      phase: 'evict-stamp',
                      body: [
                        {
                          kind: 'if',
                          cond: bin('<', idx('slotStamp', v('s')), idx('slotStamp', v('victim'))),
                          then: [set(v('victim'), v('s'))],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            { kind: 'comment', text: 'the new page takes that very frame' },
            set(idx('slotPage', v('victim')), v('page')),
            set(idx('slotStamp', v('victim')), v('i')),
            set(idx('slotMark', v('victim')), lit(1)),
          ],
        },
        { kind: 'return', expr: v('faults') },
      ],
    },
  ],
};

export const pageReplacementIRs: IR[] = [pageReplacementImperativeIR];
