/**
 * copyVsShare IR — 다섯 함수. 첫 함수(passNumber)가 진입점이다.
 *
 * 여섯 언어에서 같은 뜻인 자리에만 IR 을 댄다 — `int` 매개변수는 복사, 목록 매개변수는 공유
 * (cpp transpiler 가 목록 매개변수를 `std::vector<int>&` 로 옮긴다). 지역 목록 대입 · `ref` 매개변수 ·
 * 매개변수에 새 목록 넣기는 한 언어에서 뜻이 갈려 넣지 않는다 (설명 글이 밝힌다).
 *
 * phase 어휘는 algorithm.ts 와 정확히 같다 — num-call · num-read · list-call · list-read ·
 * cell-call · cell-read · copy-write · shared-write. `for-range` 문 자체에는 phase 를 달지 않는다.
 */
import type { IR, IRExpr, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const VOID: IRType = { kind: 'void' };
const INT_LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const cellAt: IRExpr = { kind: 'index', arr: v('cells'), idx: v('at') };

export const copyVsShareImperativeIR: IR = {
  id: 'copy-vs-share-imperative',
  algorithm: 'copyVsShare',
  paradigm: 'imperative',
  functions: [
    {
      name: 'passNumber',
      params: [
        { name: 'level', type: INT },
        { name: 'times', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'for-range',
          var: 'j',
          from: lit(0),
          to: v('times'),
          inclusive: false,
          body: [
            { kind: 'comment', text: 'a copy of level crosses; level itself stays' },
            { kind: 'expr-stmt', expr: { kind: 'call', fn: 'addOne', args: [v('level')] }, phase: 'num-call' },
          ],
        },
        { kind: 'return', expr: v('level'), phase: 'num-read' },
      ],
    },
    {
      name: 'passList',
      params: [
        { name: 'cells', type: INT_LIST },
        { name: 'at', type: INT },
        { name: 'times', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'for-range',
          var: 'j',
          from: lit(0),
          to: v('times'),
          inclusive: false,
          body: [
            { kind: 'comment', text: 'only the address crosses; both names point to one list' },
            {
              kind: 'expr-stmt',
              expr: { kind: 'call', fn: 'addOneAt', args: [v('cells'), v('at')] },
              phase: 'list-call',
            },
          ],
        },
        { kind: 'return', expr: cellAt, phase: 'list-read' },
      ],
    },
    {
      name: 'passCell',
      params: [
        { name: 'cells', type: INT_LIST },
        { name: 'at', type: INT },
        { name: 'times', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'for-range',
          var: 'j',
          from: lit(0),
          to: v('times'),
          inclusive: false,
          body: [
            { kind: 'comment', text: 'the value in the cell is copied, not the list' },
            { kind: 'expr-stmt', expr: { kind: 'call', fn: 'addOne', args: [cellAt] }, phase: 'cell-call' },
          ],
        },
        { kind: 'return', expr: cellAt, phase: 'cell-read' },
      ],
    },
    {
      name: 'addOne',
      params: [{ name: 'x', type: INT }],
      returnType: VOID,
      body: [
        { kind: 'comment', text: "x is a copy; the caller's value does not change" },
        {
          kind: 'assign',
          target: v('x'),
          expr: { kind: 'binop', op: '+', l: v('x'), r: lit(1) },
          phase: 'copy-write',
        },
      ],
    },
    {
      name: 'addOneAt',
      params: [
        { name: 'cells', type: INT_LIST },
        { name: 'at', type: INT },
      ],
      returnType: VOID,
      body: [
        { kind: 'comment', text: "cells names the caller's list; the change stays" },
        {
          kind: 'assign',
          target: cellAt,
          expr: { kind: 'binop', op: '+', l: cellAt, r: lit(1) },
          phase: 'shared-write',
        },
      ],
    },
  ],
};

export const copyVsShareIRs: IR[] = [copyVsShareImperativeIR];
