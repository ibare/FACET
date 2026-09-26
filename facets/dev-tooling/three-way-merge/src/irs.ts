/**
 * three-way-merge IR — diff3 의 덩이 판정.
 *
 * 진입 함수 `mergeChunks(baseLines, oursLines, theirsLines, keepOurs, keepTheirs, stats)` 가 충돌 덩이 수를 돌려준다.
 * 줄은 정수 번호 (파일을 base · ours · theirs 차례로 읽으며 처음 나온 글자에 0, 1, 2 …).
 * `keepOurs[i]` = base 줄 i 가 걷는 diff (base → ours) 에서 남김으로 짝 지어진 ours 줄 (0 기반), 없으면 -1.
 * `stats[0]` = 결과 줄 수 (충돌 표식 포함), `stats[1]` = 안정 줄 수.
 *
 * IR 밖에 둔 것 — 걷는 diff 두 번 (짝 배열 만들기) 과 결과 줄 글자 짓기. 걷는 diff 는 LCS 표를 채우는 셈이라
 * 여기 들이면 코드 패널이 덩이 판정보다 표 채우기를 먼저 보인다. 짝 배열은 algorithm 이 셈한 것을 그대로 건넨다.
 *
 * `base` 는 C# 예약어라 `baseLines` 로 쓴다. `&&` 는 짧은 회로가 아니므로 색인 범위 확인은 if 를 중첩한다.
 * phase: `stable` (안정 줄을 세는 문) · `classify` (판정 if 사슬의 머리) · `conflict` (충돌 가지) · `result` (stats 적기).
 * same 가지에는 phase 를 달지 않는다 — 열두 칸에서 나오지 않아 끝내 켜지지 않는 줄이 된다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const BOOL: IRType = { kind: 'bool' };
const LIST: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const b = (value: boolean): IRExpr => ({ kind: 'lit', value });
const op = (o: '+' | '-' | '<' | '>' | '>=' | '!=' | '==' | '||' | '&&', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op: o,
  l,
  r,
});
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const len = (arr: string): IRExpr => ({ kind: 'len', of: v(arr) });
const set = (name: string, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target: v(name), expr, phase } : { kind: 'assign', target: v(name), expr };
const decl = (name: string, type: IRType, init: IRExpr): IRStmt => ({ kind: 'var', name, type, init });
const add = (name: string, expr: IRExpr, phase?: string): IRStmt => set(name, op('+', v(name), expr), phase);
const same = (x: string, xs: string, xe: string, y: string, ys: string, ye: string): IRExpr => ({
  kind: 'call',
  fn: 'sameSlice',
  args: [v(x), v(xs), v(xe), v(y), v(ys), v(ye)],
});
const width = (s: string, e: string): IRExpr => op('-', v(e), v(s));

const mergeChunks: IRStmt[] = [
  { kind: 'comment', text: 'o runs past the last ancestor line: o == n closes the final chunk' },
  decl('n', INT, len('baseLines')),
  decl('po', INT, n(0)),
  decl('pa', INT, n(0)),
  decl('pb', INT, n(0)),
  decl('conflicts', INT, n(0)),
  decl('result', INT, n(0)),
  decl('stable', INT, n(0)),
  {
    kind: 'for-range',
    var: 'o',
    from: n(0),
    to: v('n'),
    inclusive: true,
    body: [
      decl('atEnd', BOOL, op('==', v('o'), v('n'))),
      decl('isStable', BOOL, b(false)),
      decl('eo', INT, v('n')),
      decl('ea', INT, len('oursLines')),
      decl('eb', INT, len('theirsLines')),
      {
        kind: 'if',
        cond: { kind: 'unop', op: '!', x: v('atEnd') },
        then: [
          {
            kind: 'if',
            cond: op('>=', at('keepOurs', v('o')), n(0)),
            then: [
              {
                kind: 'if',
                cond: op('>=', at('keepTheirs', v('o')), n(0)),
                then: [
                  { kind: 'comment', text: 'kept by both sides: a stable line' },
                  set('isStable', b(true)),
                  add('stable', n(1), 'stable'),
                  set('eo', v('o')),
                  set('ea', at('keepOurs', v('o'))),
                  set('eb', at('keepTheirs', v('o'))),
                ],
              },
            ],
          },
        ],
      },
      {
        kind: 'if',
        cond: op('||', v('atEnd'), v('isStable')),
        then: [
          {
            kind: 'if',
            cond: op('||', op('||', op('>', v('eo'), v('po')), op('>', v('ea'), v('pa'))), op('>', v('eb'), v('pb'))),
            then: [
              decl('sameOurs', BOOL, same('baseLines', 'po', 'eo', 'oursLines', 'pa', 'ea')),
              decl('sameTheirs', BOOL, same('baseLines', 'po', 'eo', 'theirsLines', 'pb', 'eb')),
              {
                kind: 'if',
                phase: 'classify',
                cond: op('&&', v('sameOurs'), v('sameTheirs')),
                then: [add('result', width('po', 'eo'))],
                else: [
                  {
                    kind: 'if',
                    cond: v('sameTheirs'),
                    then: [{ kind: 'comment', text: 'only ours changed: take ours' }, add('result', width('pa', 'ea'))],
                    else: [
                      {
                        kind: 'if',
                        cond: v('sameOurs'),
                        then: [
                          { kind: 'comment', text: 'only theirs changed: take theirs' },
                          add('result', width('pb', 'eb')),
                        ],
                        else: [
                          {
                            kind: 'if',
                            cond: same('oursLines', 'pa', 'ea', 'theirsLines', 'pb', 'eb'),
                            then: [
                              { kind: 'comment', text: 'both made the same change' },
                              add('result', width('pa', 'ea')),
                            ],
                            else: [
                              { kind: 'comment', text: 'both changed differently: markers around both sides' },
                              add('conflicts', n(1), 'conflict'),
                              add('result', op('+', op('+', width('pa', 'ea'), width('pb', 'eb')), n(3))),
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            kind: 'if',
            cond: v('isStable'),
            then: [
              add('result', n(1)),
              set('po', op('+', v('eo'), n(1))),
              set('pa', op('+', v('ea'), n(1))),
              set('pb', op('+', v('eb'), n(1))),
            ],
          },
        ],
      },
    ],
  },
  { kind: 'assign', target: at('stats', n(0)), expr: v('result'), phase: 'result' },
  { kind: 'assign', target: at('stats', n(1)), expr: v('stable'), phase: 'result' },
  { kind: 'return', expr: v('conflicts'), phase: 'result' },
];

const sameSlice: IRStmt[] = [
  { kind: 'comment', text: 'lengths first, then one line at a time' },
  { kind: 'if', cond: op('!=', width('xs', 'xe'), width('ys', 'ye')), then: [{ kind: 'return', expr: b(false) }] },
  {
    kind: 'for-range',
    var: 'i',
    from: n(0),
    to: width('xs', 'xe'),
    inclusive: false,
    body: [
      {
        kind: 'if',
        cond: op('!=', at('x', op('+', v('xs'), v('i'))), at('y', op('+', v('ys'), v('i')))),
        then: [{ kind: 'return', expr: b(false) }],
      },
    ],
  },
  { kind: 'return', expr: b(true) },
];

export const threeWayMergeImperativeIR: IR = {
  id: 'three-way-merge-imperative',
  algorithm: 'threeWayMerge',
  paradigm: 'imperative',
  functions: [
    {
      name: 'mergeChunks',
      params: [
        { name: 'baseLines', type: LIST },
        { name: 'oursLines', type: LIST },
        { name: 'theirsLines', type: LIST },
        { name: 'keepOurs', type: LIST },
        { name: 'keepTheirs', type: LIST },
        { name: 'stats', type: LIST },
      ],
      returnType: INT,
      body: mergeChunks,
    },
    {
      name: 'sameSlice',
      params: [
        { name: 'x', type: LIST },
        { name: 'xs', type: INT },
        { name: 'xe', type: INT },
        { name: 'y', type: LIST },
        { name: 'ys', type: INT },
        { name: 'ye', type: INT },
      ],
      returnType: BOOL,
      body: sameSlice,
    },
  ],
};

export const threeWayMergeIRs: IR[] = [threeWayMergeImperativeIR];
