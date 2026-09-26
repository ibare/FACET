/**
 * 수용 영역 — 맨 위 칸 하나에서 입력까지 기대는 구간을 한 축으로 내린다.
 *
 * 알고리즘은 기대는 칸을 2 차원 합집합으로 모은다. IR 은 한 축 구간 [lo, hi] 를
 * lo ← lo·s, hi ← hi·s + k − 1 로 내린다. 층마다 둘이 같다 (test 가 여섯 조합에서 잠근다).
 *
 * fieldSide(ks, ss, count, top, los, his)
 *   ks · ss  아래 층부터의 층 목록 (합성곱 3 · 1, 풀링 2 · 2), 길이 count
 *   los · his 부르는 쪽이 count 길이로 만든다 — los[i] · his[i] 는 층 i 의 창이 기대는 층 i 아래의 구간
 *   돌려주는 값은 입력에서 기대는 한 변. 정수뿐 · 중간값 최대 17.
 *
 * phase — algorithm.ts 와 정확히 같다: top-cell · descend · field-size
 */
import type { IR } from '@ffacet/core';

const int = { kind: 'int' } as const;
const intList = { kind: 'list', of: { kind: 'int' } } as const;

export const receptiveFieldImperativeIR: IR = {
  id: 'receptive-field-imperative',
  algorithm: 'receptiveField',
  paradigm: 'imperative',
  functions: [
    {
      name: 'fieldSide',
      params: [
        { name: 'ks', type: intList },
        { name: 'ss', type: intList },
        { name: 'count', type: int },
        { name: 'top', type: int },
        { name: 'los', type: intList },
        { name: 'his', type: intList },
      ],
      returnType: int,
      body: [
        { kind: 'comment', text: 'start from the top cell: one cell wide' },
        { kind: 'var', name: 'lo', type: int, init: { kind: 'var', name: 'top' }, phase: 'top-cell' },
        { kind: 'var', name: 'hi', type: int, init: { kind: 'var', name: 'top' }, phase: 'top-cell' },
        { kind: 'comment', text: 'walk down one layer at a time' },
        {
          kind: 'var',
          name: 'i',
          type: int,
          init: { kind: 'binop', op: '-', l: { kind: 'var', name: 'count' }, r: { kind: 'lit', value: 1 } },
          phase: 'descend',
        },
        {
          kind: 'while',
          cond: { kind: 'binop', op: '>=', l: { kind: 'var', name: 'i' }, r: { kind: 'lit', value: 0 } },
          phase: 'descend',
          body: [
            {
              kind: 'assign',
              target: { kind: 'var', name: 'lo' },
              expr: {
                kind: 'binop',
                op: '*',
                l: { kind: 'var', name: 'lo' },
                r: { kind: 'index', arr: { kind: 'var', name: 'ss' }, idx: { kind: 'var', name: 'i' } },
              },
              phase: 'descend',
            },
            {
              kind: 'assign',
              target: { kind: 'var', name: 'hi' },
              expr: {
                kind: 'binop',
                op: '-',
                l: {
                  kind: 'binop',
                  op: '+',
                  l: {
                    kind: 'binop',
                    op: '*',
                    l: { kind: 'var', name: 'hi' },
                    r: { kind: 'index', arr: { kind: 'var', name: 'ss' }, idx: { kind: 'var', name: 'i' } },
                  },
                  r: { kind: 'index', arr: { kind: 'var', name: 'ks' }, idx: { kind: 'var', name: 'i' } },
                },
                r: { kind: 'lit', value: 1 },
              },
              phase: 'descend',
            },
            {
              kind: 'assign',
              target: { kind: 'index', arr: { kind: 'var', name: 'los' }, idx: { kind: 'var', name: 'i' } },
              expr: { kind: 'var', name: 'lo' },
              phase: 'descend',
            },
            {
              kind: 'assign',
              target: { kind: 'index', arr: { kind: 'var', name: 'his' }, idx: { kind: 'var', name: 'i' } },
              expr: { kind: 'var', name: 'hi' },
              phase: 'descend',
            },
            {
              kind: 'assign',
              target: { kind: 'var', name: 'i' },
              expr: { kind: 'binop', op: '-', l: { kind: 'var', name: 'i' }, r: { kind: 'lit', value: 1 } },
              phase: 'descend',
            },
          ],
        },
        { kind: 'comment', text: 'side of the field on the input' },
        {
          kind: 'return',
          expr: {
            kind: 'binop',
            op: '+',
            l: { kind: 'binop', op: '-', l: { kind: 'var', name: 'hi' }, r: { kind: 'var', name: 'lo' } },
            r: { kind: 'lit', value: 1 },
          },
          phase: 'field-size',
        },
      ],
    },
  ],
};

export const receptiveFieldIRs: IR[] = [receptiveFieldImperativeIR];
