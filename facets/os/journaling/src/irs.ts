/**
 * 저널링 — 명령형 IR.
 *
 * 함수 하나 `recover(area, block, isEnd, disk, crash)`. 두 줄 모두 같은 함수에 쓰기 열만 달리 넣는다
 * (저널 없는 줄은 area 가 다 0). 부르는 쪽이 쓰기 열을 번호로 바꿔 건넨다:
 *   area[i]  0 = 제자리, 1 = 저널
 *   block[i] 0 bitmap · 1 inode · 2 data, -1 표식
 *   isEnd[i] 1 = 끝 표식
 *   disk     길이 3, 0 으로 채워 건넨다 — 끝난 뒤 다시 켠 뒤의 제자리 (0 old · 1 new)
 *   crash    끊기기 전 적힌 쓰기 수 (쓰기 열 길이를 넘지 않게 부르는 쪽이 줄인다)
 * 돌려주는 값 0 온전 · 옛것, 1 온전 · 새것, 2 어긋남.
 *
 * phase 어휘는 algorithm.ts 와 같다: journal-write · journal-commit · write-home · check-commit · replay · verdict
 */
import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const INT_LIST = { kind: 'list', of: INT } as const;
const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const eq = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '==', l, r });

const writePass: IRStmt = {
  kind: 'for-range',
  var: 'i',
  from: n(0),
  to: v('crash'),
  inclusive: false,
  body: [
    {
      kind: 'if',
      cond: eq(at('area', v('i')), n(0)),
      then: [{ kind: 'assign', target: at('disk', at('block', v('i'))), expr: n(1), phase: 'write-home' }],
      else: [
        {
          kind: 'if',
          cond: eq(at('isEnd', v('i')), n(1)),
          then: [{ kind: 'assign', target: v('committed'), expr: n(1), phase: 'journal-commit' }],
          else: [
            {
              kind: 'assign',
              target: v('logged'),
              expr: { kind: 'binop', op: '+', l: v('logged'), r: n(1) },
              phase: 'journal-write',
            },
          ],
        },
      ],
    },
  ],
};

const replayPass: IRStmt = {
  kind: 'if',
  cond: eq(v('committed'), n(1)),
  phase: 'check-commit',
  then: [
    { kind: 'comment', text: 'commit mark found: write every logged block home again, even if already new' },
    {
      kind: 'for-range',
      var: 'i',
      from: n(0),
      to: v('crash'),
      inclusive: false,
      body: [
        {
          kind: 'if',
          cond: eq(at('area', v('i')), n(1)),
          then: [
            {
              kind: 'if',
              cond: { kind: 'binop', op: '>=', l: at('block', v('i')), r: n(0) },
              then: [{ kind: 'assign', target: at('disk', at('block', v('i'))), expr: n(1), phase: 'replay' }],
            },
          ],
        },
      ],
    },
  ],
};

export const journalingImperativeIR: IR = {
  id: 'journaling-imperative',
  algorithm: 'journaling',
  paradigm: 'imperative',
  functions: [
    {
      name: 'recover',
      params: [
        { name: 'area', type: INT_LIST },
        { name: 'block', type: INT_LIST },
        { name: 'isEnd', type: INT_LIST },
        { name: 'disk', type: INT_LIST },
        { name: 'crash', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'writes before the crash reach the disk; nothing after it does' },
        { kind: 'var', name: 'committed', type: INT, init: n(0) },
        { kind: 'var', name: 'logged', type: INT, init: n(0) },
        writePass,
        { kind: 'comment', text: 'restart: scan the journal for the commit mark' },
        replayPass,
        { kind: 'var', name: 'fresh', type: INT, init: n(0) },
        {
          kind: 'for-range',
          var: 'p',
          from: n(0),
          to: { kind: 'len', of: v('disk') },
          inclusive: false,
          body: [
            {
              kind: 'assign',
              target: v('fresh'),
              expr: { kind: 'binop', op: '+', l: v('fresh'), r: at('disk', v('p')) },
            },
          ],
        },
        { kind: 'comment', text: '0 all old, 1 all new, 2 torn' },
        { kind: 'var', name: 'verdict', type: INT, init: n(2) },
        { kind: 'if', cond: eq(v('fresh'), n(0)), then: [{ kind: 'assign', target: v('verdict'), expr: n(0) }] },
        {
          kind: 'if',
          cond: eq(v('fresh'), { kind: 'len', of: v('disk') }),
          then: [{ kind: 'assign', target: v('verdict'), expr: n(1) }],
        },
        { kind: 'return', expr: v('verdict'), phase: 'verdict' },
      ],
    },
  ],
};

export const journalingIRs: IR[] = [journalingImperativeIR];
