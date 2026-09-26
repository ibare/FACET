/**
 * myers-diff 의 IR — 코드 패널이 여섯 언어로 보이는 Myers 앞으로 찾기.
 *
 * 진입 함수 `myersCost(a, b, v, stats): int` — 값 D 를 돌려준다.
 *   a · b   줄의 정수 번호 (파일을 A 다음 B 차례로 읽으며 처음 나온 글자에 0, 1, 2 …)
 *   v       부르는 쪽이 만든 버퍼, 길이 2 × (n + m + 1) + 1. 대각선 k 는 k + offset 칸
 *   stats   stats[0] = 들른 끝점, stats[1] = 미끄러진 칸 (IR 이 적는다)
 *
 * algorithm 과 같은 답을 낸다 — D · stats 가 계기 `edit-cost` · `endpoints` · `slides` 와 같다.
 * D = 0 은 v[offset + 1] = 0 버퍼 트릭으로 같은 반복에 탄다 (고르기 if 를 지나지만 값을 치르지 않는다).
 *
 * IR 밖에 둔 것:
 *   - 줄 → 번호 바꾸기 — IR 에는 문자열 비교 · 맵이 없다
 *   - 편집 목록 접기(되짚기) — 층마다 V 사진이 필요한데 IR 함수는 배열을 만들 수 없다
 *
 * `&&` 는 ir-interpreter 에서 짧은 회로가 아니라 색인 범위 확인과 읽기를 if 중첩으로 둔다.
 * 가장 큰 값은 버퍼 길이 163 (N = 40, k = 4) — 32 비트 걱정 없음.
 */
import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const BOOL = { kind: 'bool' } as const;
const INT_LIST = { kind: 'list', of: INT } as const;

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bool = (value: boolean): IRExpr => ({ kind: 'lit', value });
const add = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '+', l, r });
const sub = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '-', l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const cmp = (op: '<' | '>=' | '==' | '!=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target, expr } : { kind: 'assign', target, expr, phase };

/** v[k + delta + offset] */
const diag = (delta: number): IRExpr =>
  at('v', add(add(v('k'), n(delta)), v('offset')));

const myersCost: IRStmt[] = [
  { kind: 'var', name: 'n', type: INT, init: { kind: 'len', of: v('a') } },
  { kind: 'var', name: 'm', type: INT, init: { kind: 'len', of: v('b') } },
  { kind: 'comment', text: 'diagonal k lives at v[k + offset]' },
  { kind: 'var', name: 'offset', type: INT, init: add(add(v('n'), v('m')), n(1)) },
  { kind: 'comment', text: 'seed so that D = 0 starts at x = 0' },
  set(at('v', add(v('offset'), n(1))), n(0)),
  set(at('stats', n(0)), n(0)),
  set(at('stats', n(1)), n(0)),
  {
    kind: 'for-range',
    var: 'd',
    from: n(0),
    to: add(v('n'), v('m')),
    inclusive: true,
    body: [
      {
        kind: 'for-range',
        var: 'j',
        from: n(0),
        to: v('d'),
        inclusive: true,
        body: [
          { kind: 'var', name: 'k', type: INT, init: sub({ kind: 'binop', op: '*', l: n(2), r: v('j') }, v('d')) },
          { kind: 'comment', text: 'pay one step: down (insert) or right (delete)' },
          { kind: 'var', name: 'down', type: BOOL, init: bool(false), phase: 'pay' },
          {
            kind: 'if',
            cond: cmp('==', v('k'), { kind: 'unop', op: '-', x: v('d') }),
            then: [set(v('down'), bool(true), 'pay')],
            else: [
              {
                kind: 'if',
                cond: cmp('!=', v('k'), v('d')),
                then: [
                  {
                    kind: 'if',
                    cond: { kind: 'binop', op: '<', l: diag(-1), r: diag(1) },
                    then: [set(v('down'), bool(true), 'pay')],
                    phase: 'pay',
                  },
                ],
                phase: 'pay',
              },
            ],
            phase: 'pay',
          },
          { kind: 'var', name: 'x', type: INT, init: n(0), phase: 'pay' },
          {
            kind: 'if',
            cond: v('down'),
            then: [set(v('x'), diag(1), 'pay')],
            else: [set(v('x'), add(diag(-1), n(1)), 'pay')],
            phase: 'pay',
          },
          { kind: 'var', name: 'y', type: INT, init: sub(v('x'), v('k')), phase: 'pay' },
          set(at('stats', n(0)), add(at('stats', n(0)), n(1)), 'pay'),
          { kind: 'comment', text: 'slide along the diagonal while lines match (free)' },
          { kind: 'var', name: 'going', type: BOOL, init: bool(true), phase: 'slide' },
          {
            kind: 'while',
            cond: v('going'),
            body: [
              set(v('going'), bool(false), 'slide'),
              {
                kind: 'if',
                cond: cmp('<', v('x'), v('n')),
                then: [
                  {
                    kind: 'if',
                    cond: cmp('<', v('y'), v('m')),
                    then: [
                      {
                        kind: 'if',
                        cond: cmp('==', at('a', v('x')), at('b', v('y'))),
                        then: [
                          set(v('x'), add(v('x'), n(1)), 'slide'),
                          set(v('y'), add(v('y'), n(1)), 'slide'),
                          set(at('stats', n(1)), add(at('stats', n(1)), n(1)), 'slide'),
                          set(v('going'), bool(true), 'slide'),
                        ],
                        phase: 'slide',
                      },
                    ],
                    phase: 'slide',
                  },
                ],
                phase: 'slide',
              },
            ],
            phase: 'slide',
          },
          set(at('v', add(v('k'), v('offset'))), v('x'), 'slide'),
          { kind: 'comment', text: 'stop at the end corner (n, m)' },
          {
            kind: 'if',
            cond: cmp('>=', v('x'), v('n')),
            then: [
              {
                kind: 'if',
                cond: cmp('>=', v('y'), v('m')),
                then: [{ kind: 'return', expr: v('d'), phase: 'reach-end' }],
                phase: 'reach-end',
              },
            ],
            phase: 'reach-end',
          },
        ],
      },
    ],
  },
  { kind: 'return', expr: n(-1) },
];

export const myersDiffImperativeIR: IR = {
  id: 'myers-diff-imperative',
  algorithm: 'myersDiff',
  paradigm: 'imperative',
  functions: [
    {
      name: 'myersCost',
      params: [
        { name: 'a', type: INT_LIST },
        { name: 'b', type: INT_LIST },
        { name: 'v', type: INT_LIST },
        { name: 'stats', type: INT_LIST },
      ],
      returnType: INT,
      body: myersCost,
    },
  ],
};

export const myersDiffIRs: IR[] = [myersDiffImperativeIR];
