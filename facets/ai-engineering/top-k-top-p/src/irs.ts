/**
 * top-k / top-p 의 코드 패널 IR.
 *
 * 진입 `keptCount(probs, topK, topP)` — k 로 자르고 그 합 M 을 셈한 뒤, 앞 k 개 안에서 누적하며
 * `run × 100 ≥ topP × M` 에 처음 닿는 자리까지 남긴다. 보조 `cutPercent(probs, kept)` 는 잘린 몫을
 * 반올림 백분율로 낸다. 확률은 천분율 정수라 셈이 전부 정수다 — 중간값 최대 100 × 1000.
 *
 * phase 어휘는 algorithm.ts 와 같다: `top-k` · `accumulate` · `cut` · `measure`.
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '>=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, i: string): IRExpr => ({ kind: 'index', arr: v(arr), idx: v(i) });
const decl = (name: string, init: IRExpr, phase: string): IRStmt => ({ kind: 'var', name, type: INT, init, phase });
const set = (name: string, expr: IRExpr, phase: string): IRStmt => ({ kind: 'assign', target: v(name), expr, phase });
const loop = (name: string, to: IRExpr, body: IRStmt[], phase: string): IRStmt => ({
  kind: 'for-range',
  var: name,
  from: lit(0),
  to,
  inclusive: false,
  body,
  phase,
});

export const topKTopPImperativeIR: IR = {
  id: 'top-k-top-p-imperative',
  algorithm: 'topKTopP',
  paradigm: 'imperative',
  functions: [
    {
      name: 'keptCount',
      params: [
        { name: 'probs', type: INT_LIST },
        { name: 'topK', type: INT },
        { name: 'topP', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'probs: per-mille, largest first; topP: percent' },
        // 길이를 int 지역 변수에 먼저 담는다 — C++ 의 std::min(int, size_t) 는 컴파일되지 않는다
        decl('count', { kind: 'len', of: v('probs') }, 'top-k'),
        decl('n', { kind: 'call', fn: 'min', args: [v('topK'), v('count')] }, 'top-k'),
        decl('mass', lit(0), 'top-k'),
        loop('i', v('n'), [set('mass', bin('+', v('mass'), at('probs', 'i')), 'top-k')], 'top-k'),
        decl('kept', v('n'), 'top-k'),
        decl('run', lit(0), 'accumulate'),
        loop(
          'i',
          v('n'),
          [
            set('run', bin('+', v('run'), at('probs', 'i')), 'accumulate'),
            decl('reached', bin('*', v('run'), lit(100)), 'accumulate'),
            decl('need', bin('*', v('topP'), v('mass')), 'accumulate'),
            {
              kind: 'if',
              cond: bin('>=', v('reached'), v('need')),
              then: [set('kept', bin('+', v('i'), lit(1)), 'cut'), { kind: 'break', phase: 'cut' }],
              phase: 'accumulate',
            },
          ],
          'accumulate',
        ),
        { kind: 'return', expr: v('kept'), phase: 'cut' },
      ],
    },
    {
      name: 'cutPercent',
      params: [
        { name: 'probs', type: INT_LIST },
        { name: 'kept', type: INT },
      ],
      returnType: INT,
      body: [
        decl('total', lit(0), 'measure'),
        loop('i', { kind: 'len', of: v('probs') }, [set('total', bin('+', v('total'), at('probs', 'i')), 'measure')], 'measure'),
        decl('left', lit(0), 'measure'),
        loop('i', v('kept'), [set('left', bin('+', v('left'), at('probs', 'i')), 'measure')], 'measure'),
        {
          kind: 'return',
          expr: bin(
            '//',
            bin('+', bin('*', bin('-', v('total'), v('left')), lit(100)), bin('//', v('total'), lit(2))),
            v('total'),
          ),
          phase: 'measure',
        },
      ],
    },
  ],
};

export const topKTopPIRs: IR[] = [topKTopPImperativeIR];
