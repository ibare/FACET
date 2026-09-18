/**
 * KV 캐시 — 코드 패널 IR.
 *
 * 걸음 루프 하나에 캐시 갈래 하나. 진입 `kvCompute` 는 셈한 K·V 자리를, 보조
 * `scoreCount` 는 주의 점수 셈(질의 · 키 곱)을 돌려준다. 두 수는 단위가 달라
 * 따로 돌려주고 더하지 않는다.
 *
 * phase 어휘 (algorithm.ts 와 같은 집합): setup · recompute · prefill · append-one · done
 *
 * 정수 중간값 최대 — 2,216 (score, 끔 · 16), 곱 `seen * (seen + 1)` 최대 552 (seen = 23).
 * 32 비트에 넉넉히 들어간다. IR 안의 주석은 영어로 둔다 — 코드 패널에 어느 언어로든 그대로 뜬다.
 * 곱은 지역 변수에 담은 뒤 `// 2` 로 나눈다 (피연산자는 음수가 아니다).
 */

import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '==', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const INT = { kind: 'int' } as const;

const decl = (name: string, init: IRExpr, phase?: string): IRStmt =>
  phase === undefined
    ? { kind: 'var', name, type: INT, init }
    : { kind: 'var', name, type: INT, init, phase };
const put = (name: string, expr: IRExpr, phase: string): IRStmt => ({
  kind: 'assign',
  target: v(name),
  expr,
  phase,
});

const PARAMS = [
  { name: 'prompt', type: INT },
  { name: 'steps', type: INT },
  { name: 'cache', type: INT },
];

/** 걸음 t 가 보는 열의 길이 L = prompt + t − 1 */
const seenDecl: IRStmt = decl('seen', bin('-', bin('+', v('prompt'), v('t')), n(1)));

export const kvCacheImperativeIR: IR = {
  id: 'kv-cache-imperative',
  algorithm: 'kvCache',
  paradigm: 'imperative',
  functions: [
    {
      name: 'kvCompute',
      params: PARAMS,
      returnType: INT,
      body: [
        { kind: 'comment', text: 'K·V positions computed — cache is 0 (off) or 1 (on)' },
        decl('total', n(0), 'setup'),
        {
          kind: 'for-range',
          var: 't',
          from: n(1),
          to: v('steps'),
          inclusive: true,
          body: [
            seenDecl,
            {
              kind: 'if',
              cond: bin('==', v('cache'), n(1)),
              then: [
                {
                  kind: 'if',
                  cond: bin('==', v('t'), n(1)),
                  then: [
                    { kind: 'comment', text: 'first step: compute the whole prompt at once and keep it in the cache' },
                    put('total', bin('+', v('total'), v('prompt')), 'prefill'),
                  ],
                  else: [
                    { kind: 'comment', text: 'later steps: only the one token the previous step produced' },
                    put('total', bin('+', v('total'), n(1)), 'append-one'),
                  ],
                },
              ],
              else: [
                { kind: 'comment', text: 'without a cache: every position so far, all over again' },
                put('total', bin('+', v('total'), v('seen')), 'recompute'),
              ],
            },
          ],
        },
        { kind: 'return', expr: v('total'), phase: 'done' },
      ],
    },
    {
      name: 'scoreCount',
      params: PARAMS,
      returnType: INT,
      body: [
        { kind: 'comment', text: 'attention scores — one query row times one key row (causal mask)' },
        decl('scores', n(0), 'setup'),
        {
          kind: 'for-range',
          var: 't',
          from: n(1),
          to: v('steps'),
          inclusive: true,
          body: [
            seenDecl,
            {
              kind: 'if',
              cond: bin('==', v('cache'), n(1)),
              then: [
                {
                  kind: 'if',
                  cond: bin('==', v('t'), n(1)),
                  then: [
                    decl('promptTri', bin('*', v('prompt'), bin('+', v('prompt'), n(1))), 'prefill'),
                    put('scores', bin('+', v('scores'), bin('//', v('promptTri'), n(2))), 'prefill'),
                  ],
                  else: [
                    { kind: 'comment', text: 'one new query looks at every cached key and its own' },
                    put('scores', bin('+', v('scores'), v('seen')), 'append-one'),
                  ],
                },
              ],
              else: [
                decl('seenTri', bin('*', v('seen'), bin('+', v('seen'), n(1))), 'recompute'),
                put('scores', bin('+', v('scores'), bin('//', v('seenTri'), n(2))), 'recompute'),
              ],
            },
          ],
        },
        { kind: 'return', expr: v('scores'), phase: 'done' },
      ],
    },
  ],
};

export const kvCacheIRs: IR[] = [kvCacheImperativeIR];
