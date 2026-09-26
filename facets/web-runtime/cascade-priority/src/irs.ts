/**
 * cascade-priority 의 IR — 명시도 셈과 오른쪽에서 왼쪽으로의 선택자 맞춤.
 *
 * `spec` 은 단순 선택자 부분들(태그/클래스/아이디)을 매개변수 배열로 받아 개수를 세는
 * 반복·조건뿐이다. `match_rtl` 은 오른쪽 끝(요소 자신)부터 견주고, 이어 조상 배열을
 * 색인으로 하나씩 읽어 올라가며 문자열 비교(`==`)만 한다 — 내부에서 `compoundMatches` 를
 * 불러 "부분 선택자 하나가 노드 하나의 자질을 모두 채우는가" 를 확인한다.
 *
 * 셋 다 배열을 짓지 않는다 — 매개변수로 받은 것을 색인으로 읽을 뿐이다. 선택자 문자열
 * 자체를 쪼개는 일(`split` 등)은 algorithm.ts 가 미리 해, 이미 쪼갠 태그/클래스/아이디
 * 배열을 넘긴다.
 */

import type { IR } from '@ffacet/core';

const strList = { kind: 'list' as const, of: { kind: 'string' as const } };
const strListList = { kind: 'list' as const, of: strList };

export const cascadePriorityImperativeIR: IR = {
  id: 'cascade-priority-imperative',
  algorithm: 'cascadePriority',
  paradigm: 'imperative',
  functions: [
    {
      name: 'spec',
      params: [{ name: 'parts', type: strList }],
      returnType: { kind: 'int' },
      body: [
        { kind: 'var', name: 'idCount', type: { kind: 'int' }, init: { kind: 'lit', value: 0 } },
        { kind: 'var', name: 'classCount', type: { kind: 'int' }, init: { kind: 'lit', value: 0 } },
        { kind: 'var', name: 'tagCount', type: { kind: 'int' }, init: { kind: 'lit', value: 0 } },
        {
          kind: 'for-range',
          var: 'i',
          from: { kind: 'lit', value: 0 },
          to: { kind: 'len', of: { kind: 'var', name: 'parts' } },
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: {
                kind: 'binop',
                op: '==',
                l: { kind: 'index', arr: { kind: 'var', name: 'parts' }, idx: { kind: 'var', name: 'i' } },
                r: { kind: 'lit', value: 'id' },
              },
              then: [
                {
                  kind: 'assign',
                  target: { kind: 'var', name: 'idCount' },
                  expr: { kind: 'binop', op: '+', l: { kind: 'var', name: 'idCount' }, r: { kind: 'lit', value: 1 } },
                },
              ],
            },
            {
              kind: 'if',
              cond: {
                kind: 'binop',
                op: '==',
                l: { kind: 'index', arr: { kind: 'var', name: 'parts' }, idx: { kind: 'var', name: 'i' } },
                r: { kind: 'lit', value: 'class' },
              },
              then: [
                {
                  kind: 'assign',
                  target: { kind: 'var', name: 'classCount' },
                  expr: { kind: 'binop', op: '+', l: { kind: 'var', name: 'classCount' }, r: { kind: 'lit', value: 1 } },
                },
              ],
            },
            {
              kind: 'if',
              cond: {
                kind: 'binop',
                op: '==',
                l: { kind: 'index', arr: { kind: 'var', name: 'parts' }, idx: { kind: 'var', name: 'i' } },
                r: { kind: 'lit', value: 'tag' },
              },
              then: [
                {
                  kind: 'assign',
                  target: { kind: 'var', name: 'tagCount' },
                  expr: { kind: 'binop', op: '+', l: { kind: 'var', name: 'tagCount' }, r: { kind: 'lit', value: 1 } },
                },
              ],
            },
          ],
        },
        {
          kind: 'return',
          expr: {
            kind: 'binop',
            op: '+',
            l: {
              kind: 'binop',
              op: '+',
              l: { kind: 'binop', op: '*', l: { kind: 'var', name: 'idCount' }, r: { kind: 'lit', value: 100 } },
              r: { kind: 'binop', op: '*', l: { kind: 'var', name: 'classCount' }, r: { kind: 'lit', value: 10 } },
            },
            r: { kind: 'var', name: 'tagCount' },
          },
          phase: 'specDone',
        },
      ],
    },
    {
      name: 'compoundMatches',
      params: [
        { name: 'reqs', type: strList },
        { name: 'features', type: strList },
      ],
      returnType: { kind: 'int' },
      body: [
        { kind: 'var', name: 'allOk', type: { kind: 'bool' }, init: { kind: 'lit', value: true } },
        {
          kind: 'for-range',
          var: 'i',
          from: { kind: 'lit', value: 0 },
          to: { kind: 'len', of: { kind: 'var', name: 'reqs' } },
          inclusive: false,
          body: [
            { kind: 'var', name: 'found', type: { kind: 'bool' }, init: { kind: 'lit', value: false } },
            {
              kind: 'for-range',
              var: 'j',
              from: { kind: 'lit', value: 0 },
              to: { kind: 'len', of: { kind: 'var', name: 'features' } },
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: {
                    kind: 'binop',
                    op: '==',
                    l: { kind: 'index', arr: { kind: 'var', name: 'features' }, idx: { kind: 'var', name: 'j' } },
                    r: { kind: 'index', arr: { kind: 'var', name: 'reqs' }, idx: { kind: 'var', name: 'i' } },
                  },
                  then: [{ kind: 'assign', target: { kind: 'var', name: 'found' }, expr: { kind: 'lit', value: true } }],
                },
              ],
            },
            {
              kind: 'if',
              cond: { kind: 'unop', op: '!', x: { kind: 'var', name: 'found' } },
              then: [{ kind: 'assign', target: { kind: 'var', name: 'allOk' }, expr: { kind: 'lit', value: false } }],
            },
          ],
        },
        {
          kind: 'if',
          cond: { kind: 'var', name: 'allOk' },
          then: [{ kind: 'return', expr: { kind: 'lit', value: 1 } }],
          phase: 'filterCheck',
        },
        { kind: 'return', expr: { kind: 'lit', value: 0 }, phase: 'filterCheck' },
      ],
    },
    {
      name: 'match_rtl',
      params: [
        { name: 'compounds', type: strListList },
        { name: 'chain', type: strListList },
      ],
      returnType: { kind: 'int' },
      body: [
        {
          kind: 'if',
          cond: {
            kind: 'binop',
            op: '==',
            l: {
              kind: 'call',
              fn: 'compoundMatches',
              args: [
                { kind: 'index', arr: { kind: 'var', name: 'compounds' }, idx: { kind: 'lit', value: 0 } },
                { kind: 'index', arr: { kind: 'var', name: 'chain' }, idx: { kind: 'lit', value: 0 } },
              ],
            },
            r: { kind: 'lit', value: 0 },
          },
          then: [{ kind: 'return', expr: { kind: 'lit', value: 0 } }],
        },
        { kind: 'var', name: 'compoundIdx', type: { kind: 'int' }, init: { kind: 'lit', value: 1 } },
        { kind: 'var', name: 'chainIdx', type: { kind: 'int' }, init: { kind: 'lit', value: 1 } },
        { kind: 'var', name: 'ok', type: { kind: 'bool' }, init: { kind: 'lit', value: true } },
        {
          kind: 'while',
          cond: {
            kind: 'binop',
            op: '<',
            l: { kind: 'var', name: 'compoundIdx' },
            r: { kind: 'len', of: { kind: 'var', name: 'compounds' } },
          },
          body: [
            { kind: 'var', name: 'found', type: { kind: 'bool' }, init: { kind: 'lit', value: false } },
            {
              kind: 'while',
              cond: {
                kind: 'binop',
                op: '<',
                l: { kind: 'var', name: 'chainIdx' },
                r: { kind: 'len', of: { kind: 'var', name: 'chain' } },
              },
              body: [
                {
                  kind: 'if',
                  cond: {
                    kind: 'binop',
                    op: '==',
                    l: {
                      kind: 'call',
                      fn: 'compoundMatches',
                      args: [
                        { kind: 'index', arr: { kind: 'var', name: 'compounds' }, idx: { kind: 'var', name: 'compoundIdx' } },
                        { kind: 'index', arr: { kind: 'var', name: 'chain' }, idx: { kind: 'var', name: 'chainIdx' } },
                      ],
                    },
                    r: { kind: 'lit', value: 1 },
                  },
                  then: [
                    { kind: 'assign', target: { kind: 'var', name: 'found' }, expr: { kind: 'lit', value: true } },
                    {
                      kind: 'assign',
                      target: { kind: 'var', name: 'chainIdx' },
                      expr: { kind: 'binop', op: '+', l: { kind: 'var', name: 'chainIdx' }, r: { kind: 'lit', value: 1 } },
                    },
                    { kind: 'break' },
                  ],
                  phase: 'ancestorSearch',
                },
                {
                  kind: 'assign',
                  target: { kind: 'var', name: 'chainIdx' },
                  expr: { kind: 'binop', op: '+', l: { kind: 'var', name: 'chainIdx' }, r: { kind: 'lit', value: 1 } },
                },
              ],
            },
            {
              kind: 'if',
              cond: { kind: 'unop', op: '!', x: { kind: 'var', name: 'found' } },
              then: [{ kind: 'assign', target: { kind: 'var', name: 'ok' }, expr: { kind: 'lit', value: false } }, { kind: 'break' }],
            },
            {
              kind: 'assign',
              target: { kind: 'var', name: 'compoundIdx' },
              expr: { kind: 'binop', op: '+', l: { kind: 'var', name: 'compoundIdx' }, r: { kind: 'lit', value: 1 } },
            },
          ],
        },
        {
          kind: 'if',
          cond: { kind: 'var', name: 'ok' },
          then: [{ kind: 'return', expr: { kind: 'lit', value: 1 } }],
        },
        { kind: 'return', expr: { kind: 'lit', value: 0 } },
      ],
    },
  ],
};

export const cascadePriorityIRs: IR[] = [cascadePriorityImperativeIR];
