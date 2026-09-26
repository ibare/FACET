/**
 * roc-imbalance 의 IR — 세기뿐이다 (곱 · 합 · 비교 · 정수 나눗셈).
 *
 *   confusion(pos, neg, mult, th, cells) → int
 *     cells 는 길이 8 의 int 버퍼 (부르는 쪽이 만든다 — IR 은 배열을 만들 수 없다):
 *       0 TP · 1 FN · 2 FP · 3 TN · 4 TPR% · 5 FPR% · 6 정밀도% · 7 정확도%
 *     돌려주는 값 = 정밀도% (TP + FP = 0 이면 −1 — TS 쪽은 던진다)
 *     음성은 `for c in 0..mult−1: for q in neg` 로 센다 (겹친 더미를 배열로 만들지 않는다)
 *   aucPercent(pos, neg, mult) → int — 짝 셈, 차례 양성 i → 겹 c → 음성 q
 *
 * 사양은 버퍼 이름을 `out` 으로 적었으나 C# 예약어라 `cells` 로 둔다.
 * 중간값 최대: AUC 합 2·10·100 = 2000, ×100 = 200000 — 32 비트와 멀다.
 * 백분율은 algorithm 의 pct 와 같은 식 `(x * 100 + n // 2) // n` — x · n 은 음이 아닌 정수.
 *
 * phase 어휘 (algorithm.ts 와 같다): call · rates · auc · precision · accuracy
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const DOUBLE: IRType = { kind: 'double' };
const DOUBLES: IRType = { kind: 'list', of: DOUBLE };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '>=' | '>' | '==' | '<=', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const len = (of: string): IRExpr => ({ kind: 'len', of: v(of) });
/** (x * 100 + d // 2) // d */
const percent = (x: IRExpr, d: IRExpr): IRExpr => bin('//', bin('+', bin('*', x, n(100)), bin('//', d, n(2))), d);
const inc = (name: string, by: number, phase: string): IRStmt => ({
  kind: 'assign',
  target: v(name),
  expr: bin('+', v(name), n(by)),
  phase,
});
const put = (slot: number, expr: IRExpr, phase: string): IRStmt => ({
  kind: 'assign',
  target: at('cells', n(slot)),
  expr,
  phase,
});

export const rocImbalanceImperativeIR: IR = {
  id: 'roc-imbalance-imperative',
  algorithm: 'rocImbalance',
  paradigm: 'imperative',
  functions: [
    {
      name: 'confusion',
      params: [
        { name: 'pos', type: DOUBLES },
        { name: 'neg', type: DOUBLES },
        { name: 'mult', type: INT },
        { name: 'th', type: DOUBLE },
        { name: 'cells', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'called positive = score >= threshold' },
        { kind: 'var', name: 'tp', type: INT, init: n(0), phase: 'call' },
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: len('pos'),
          inclusive: false,
          phase: 'call',
          body: [{ kind: 'if', cond: bin('>=', at('pos', v('i')), v('th')), then: [inc('tp', 1, 'call')], phase: 'call' }],
        },
        { kind: 'comment', text: 'the negative list stacked mult times' },
        { kind: 'var', name: 'fp', type: INT, init: n(0), phase: 'call' },
        {
          kind: 'for-range',
          var: 'c',
          from: n(0),
          to: v('mult'),
          inclusive: false,
          phase: 'call',
          body: [
            {
              kind: 'for-range',
              var: 'q',
              from: n(0),
              to: len('neg'),
              inclusive: false,
              phase: 'call',
              body: [
                { kind: 'if', cond: bin('>=', at('neg', v('q')), v('th')), then: [inc('fp', 1, 'call')], phase: 'call' },
              ],
            },
          ],
        },
        { kind: 'var', name: 'p', type: INT, init: len('pos'), phase: 'call' },
        { kind: 'var', name: 'n', type: INT, init: bin('*', len('neg'), v('mult')), phase: 'call' },
        put(0, v('tp'), 'call'),
        put(1, bin('-', v('p'), v('tp')), 'call'),
        put(2, v('fp'), 'call'),
        put(3, bin('-', v('n'), v('fp')), 'call'),
        { kind: 'comment', text: 'TPR = TP / P, FPR = FP / N (rounded percent)' },
        put(4, percent(v('tp'), v('p')), 'rates'),
        put(5, percent(v('fp'), v('n')), 'rates'),
        { kind: 'comment', text: 'precision = TP / (TP + FP); -1 when nothing is called positive' },
        { kind: 'var', name: 'called', type: INT, init: bin('+', v('tp'), v('fp')), phase: 'precision' },
        { kind: 'var', name: 'prec', type: INT, init: n(-1), phase: 'precision' },
        {
          kind: 'if',
          cond: bin('>', v('called'), n(0)),
          then: [{ kind: 'assign', target: v('prec'), expr: percent(v('tp'), v('called')), phase: 'precision' }],
          phase: 'precision',
        },
        put(6, v('prec'), 'precision'),
        { kind: 'comment', text: 'accuracy = (TP + TN) / all' },
        put(7, percent(bin('+', v('tp'), at('cells', n(3))), bin('+', v('p'), v('n'))), 'accuracy'),
        { kind: 'return', expr: v('prec'), phase: 'accuracy' },
      ],
    },
    {
      name: 'aucPercent',
      params: [
        { name: 'pos', type: DOUBLES },
        { name: 'neg', type: DOUBLES },
        { name: 'mult', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'every (positive, negative) pair: 2 if the positive scores higher, 1 if equal' },
        { kind: 'var', name: 'wins', type: INT, init: n(0), phase: 'auc' },
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: len('pos'),
          inclusive: false,
          phase: 'auc',
          body: [
            {
              kind: 'for-range',
              var: 'c',
              from: n(0),
              to: v('mult'),
              inclusive: false,
              phase: 'auc',
              body: [
                {
                  kind: 'for-range',
                  var: 'q',
                  from: n(0),
                  to: len('neg'),
                  inclusive: false,
                  phase: 'auc',
                  body: [
                    {
                      kind: 'if',
                      cond: bin('>', at('pos', v('i')), at('neg', v('q'))),
                      then: [inc('wins', 2, 'auc')],
                      else: [
                        {
                          kind: 'if',
                          cond: bin('==', at('pos', v('i')), at('neg', v('q'))),
                          then: [inc('wins', 1, 'auc')],
                          phase: 'auc',
                        },
                      ],
                      phase: 'auc',
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          kind: 'var',
          name: 'pairs2',
          type: INT,
          init: bin('*', bin('*', bin('*', n(2), len('pos')), len('neg')), v('mult')),
          phase: 'auc',
        },
        { kind: 'return', expr: percent(v('wins'), v('pairs2')), phase: 'auc' },
      ],
    },
  ],
};

export const rocImbalanceIRs: IR[] = [rocImbalanceImperativeIR];
