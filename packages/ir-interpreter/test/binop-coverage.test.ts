/**
 * `IRBinOp` 의 모든 연산자를 실행기가 다룬다.
 *
 * `'//'`(정수 나눗셈)가 switch 에서 빠져 있었다. 어느 case 에도 걸리지 않으면
 * 함수가 `undefined` 를 돌려주는데, 그것이 다시 산술에 쓰이면 `NaN` 이 되어
 * 조용히 번진다 — 던지지도, 로그를 남기지도 않는다. 그 사이 `'//'` 를 쓰는
 * IR 이 열셋으로 늘어 있었고, 실행기로 IR 을 검증하려 한 사람만 그것을 봤다.
 *
 * transpiler 여섯은 `'//'` 를 각자 옳게 냈으므로 화면은 멀쩡했다. 검증 도구
 * 쪽만 틀린 답을 내고 있었던 셈이라 더 늦게 드러났다.
 *
 * 연산자를 새로 만들면 이 표에 한 줄 보탠다. 표가 `IRBinOp` 전체를 덮는지는
 * 타입이 검사한다 — 빠뜨리면 `Record` 가 컴파일되지 않는다.
 */
import { describe, it, expect } from 'vitest';
import type { IR, IRBinOp } from '@ffacet/core';
import { runIR } from '../src/index.js';

/**
 * 각 연산자를 한 번씩 실제로 굴려 본다. 피연산자는 그 연산자가 받도록 되어 있는
 * 종류로 준다 — 논리 연산자에 수를 넣으면 자바스크립트의 단축 평가가 피연산자를
 * 그대로 돌려주어(7 && 2 === 2) 무엇을 재는지 흐려진다.
 */
const CASES: Record<IRBinOp, { l: number | boolean; r: number | boolean; want: number | boolean }> = {
  '+': { l: 7, r: 2, want: 9 },
  '-': { l: 7, r: 2, want: 5 },
  '*': { l: 7, r: 2, want: 14 },
  '/': { l: 7, r: 2, want: 3.5 },
  '//': { l: 7, r: 2, want: 3 },
  '%': { l: 7, r: 2, want: 1 },
  '<': { l: 7, r: 2, want: false },
  '<=': { l: 7, r: 2, want: false },
  '>': { l: 7, r: 2, want: true },
  '>=': { l: 7, r: 2, want: true },
  '==': { l: 7, r: 2, want: false },
  '!=': { l: 7, r: 2, want: true },
  '&&': { l: true, r: false, want: false },
  '||': { l: true, r: false, want: true },
};

function irFor(op: IRBinOp): IR {
  const c = CASES[op];
  return {
    id: `probe-${op}`,
    algorithm: 'probe',
    paradigm: 'imperative',
    functions: [
      {
        name: 'probe',
        params: [],
        returnType: { kind: 'double' },
        body: [
          {
            kind: 'return',
            expr: {
              kind: 'binop',
              op,
              l: { kind: 'lit', value: c.l },
              r: { kind: 'lit', value: c.r },
            },
          },
        ],
      },
    ],
  };
}

describe('IRBinOp 전수', () => {
  it('모든 연산자가 undefined 가 아닌 값을 낸다', () => {
    const missing: string[] = [];
    for (const op of Object.keys(CASES) as IRBinOp[]) {
      const got = runIR(irFor(op), 'probe', []) as unknown;
      if (got === undefined || (typeof got === 'number' && Number.isNaN(got))) missing.push(op);
    }
    expect(missing).toEqual([]);
  });

  it('각 연산자의 값이 맞는다', () => {
    const wrong: string[] = [];
    for (const [op, c] of Object.entries(CASES) as [IRBinOp, (typeof CASES)[IRBinOp]][]) {
      const got = runIR(irFor(op), 'probe', []) as unknown;
      if (got !== c.want) wrong.push(`${op}: ${String(got)} ≠ ${String(c.want)}`);
    }
    expect(wrong).toEqual([]);
  });
});
