/**
 * reactive-updates 의 IR — `computeUpdates`.
 *
 * 구독 여부는 매개변수로 받은 평평한 (값×뷰) 0/1 배열(`subs`)을 색인으로 읽을
 * 뿐이다. IR 은 배열을 만들 수 없으므로 `dirtyOut`(다시 그릴 뷰 표시) 과
 * `out`(결과 [looked, rendered])은 부르는 쪽이 만들어 넘긴다.
 *
 * `mode` — 0=줄·곧바로(sub-sync) 1=줄·모아서(sub-batch) 2=훑기(scan). 셋을
 * `if` 셋으로 나란히 두어(else-if 사슬이 아니다) 각 모드가 phase 어휘와
 * 하나씩 짝지어지게 했다 — mode 1·2 의 "다시 그릴 뷰를 찾는" 이중 루프는
 * 셈이 같지만(사양 "mode==2 도 mode==1과 같은 이중 루프로 셈"), phase 를
 * 따로 달기 위해 나눠 적었다.
 */

import type { IR, IRBinOp, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST_INT: IRType = { kind: 'list', of: INT };
const VOID: IRType = { kind: 'void' };

const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const idx = (arr: IRExpr, i: IRExpr): IRExpr => ({ kind: 'index', arr, idx: i });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });

/** `for (i = 0..to-1) { for (w = 0..viewCount-1) { if subs[i*viewCount+w]==1 { <mark> } } }` 꼴. */
function dirtyScanLoop(mark: IRStmt, phase: string): IRStmt {
  return {
    kind: 'for-range',
    var: 'i',
    from: lit(0),
    to: bin('-', len(v('writes')), lit(1)),
    inclusive: true,
    phase,
    body: [
      { kind: 'var', name: 'val', type: INT, init: idx(v('writes'), v('i')) },
      {
        kind: 'for-range',
        var: 'w',
        from: lit(0),
        to: bin('-', v('viewCount'), lit(1)),
        inclusive: true,
        body: [
          {
            kind: 'if',
            cond: bin('==', idx(v('subs'), bin('+', bin('*', v('val'), v('viewCount')), v('w'))), lit(1)),
            then: [mark],
          },
        ],
      },
    ],
  };
}

/** `for (w = 0..viewCount-1) { if <flag>[w]==1 { rendered = rendered+1 } }` — dirty 표를 센다. */
function countDirtyLoop(flag: string, phase: string): IRStmt {
  return {
    kind: 'for-range',
    var: 'w',
    from: lit(0),
    to: bin('-', v('viewCount'), lit(1)),
    inclusive: true,
    phase,
    body: [
      {
        kind: 'if',
        cond: bin('==', idx(v(flag), v('w')), lit(1)),
        then: [{ kind: 'assign', target: v('rendered'), expr: bin('+', v('rendered'), lit(1)) }],
      },
    ],
  };
}

const body: IRStmt[] = [
  { kind: 'comment', text: 'looked/rendered accumulate across this round only' },
  { kind: 'var', name: 'looked', type: INT, init: lit(0), phase: 'read-init' },
  { kind: 'var', name: 'rendered', type: INT, init: lit(0), phase: 'read-init' },

  { kind: 'comment', text: 'mode 0 (sub-sync): count every subscribed view per write, duplicates allowed' },
  {
    kind: 'if',
    cond: bin('==', v('mode'), lit(0)),
    then: [
      dirtyScanLoop(
        { kind: 'assign', target: v('rendered'), expr: bin('+', v('rendered'), lit(1)), phase: 'write-sync' },
        'write-sync',
      ),
    ],
  },

  { kind: 'comment', text: 'mode 1 (sub-batch): mark dirty per write, count the dirty view set once at flush' },
  {
    kind: 'if',
    cond: bin('==', v('mode'), lit(1)),
    then: [
      dirtyScanLoop(
        { kind: 'assign', target: idx(v('dirtyOut'), v('w')), expr: lit(1), phase: 'write-batch' },
        'write-batch',
      ),
      countDirtyLoop('dirtyOut', 'flush-batch'),
    ],
  },

  { kind: 'comment', text: 'mode 2 (scan): same dirty-set counting as batch, plus a fixed 2*valueCount looked cost' },
  {
    kind: 'if',
    cond: bin('==', v('mode'), lit(2)),
    then: [
      dirtyScanLoop(
        { kind: 'assign', target: idx(v('dirtyOut'), v('w')), expr: lit(1), phase: 'write-scan' },
        'write-scan',
      ),
      countDirtyLoop('dirtyOut', 'scan-round'),
      {
        kind: 'assign',
        target: v('looked'),
        expr: bin('*', lit(2), v('valueCount')),
        phase: 'scan-round',
      },
    ],
  },

  { kind: 'assign', target: idx(v('out'), lit(0)), expr: v('looked') },
  { kind: 'assign', target: idx(v('out'), lit(1)), expr: v('rendered') },
];

export const reactiveUpdatesImperativeIR: IR = {
  id: 'reactive-updates-imperative',
  algorithm: 'reactiveUpdates',
  paradigm: 'imperative',
  functions: [
    {
      name: 'computeUpdates',
      params: [
        { name: 'subs', type: LIST_INT },
        { name: 'writes', type: LIST_INT },
        { name: 'mode', type: INT },
        { name: 'valueCount', type: INT },
        { name: 'viewCount', type: INT },
        { name: 'dirtyOut', type: LIST_INT },
        { name: 'out', type: LIST_INT },
      ],
      returnType: VOID,
      body,
    },
  ],
};

export const reactiveUpdatesIRs: IR[] = [reactiveUpdatesImperativeIR];
