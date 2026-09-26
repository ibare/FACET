/**
 * keyed-reconciliation 의 IR — (키→옛 자리) 짝짓기와 새 목록 훑기.
 *
 * 배열을 만들지 않는다 — `oldItems` · `newItems` · `usedOut` · `resultOut` 은 전부 매개변수로
 * 받아 읽고 쓸 뿐이다. 맵이 없으므로 키 짝짓기는 선형 탐색으로 편다 (항목이 5개뿐이라
 * O(n^2) 이어도 무방, common-B.md).
 *
 * `resultOut` (길이 4) 에 [고침, 만듦, 지움, 옮김] 을 채운다 — 부르는 쪽이 0 으로 채워 넘긴다.
 *
 * phase 어휘 (algorithm.ts 와 정확히 같다): compare-tag · patch · create · delete · move.
 */
import type { IR, IRBinOp, IRExpr, IRFunc, IRStmt, IRType } from '@ffacet/core';

const STRING_LIST: IRType = { kind: 'list', of: { kind: 'string' } };
const INT_LIST: IRType = { kind: 'list', of: { kind: 'int' } };

const V = (name: string): IRExpr => ({ kind: 'var', name });
const L = (value: number | string | boolean): IRExpr => ({ kind: 'lit', value });
const IDX = (arr: IRExpr, idx: IRExpr): IRExpr => ({ kind: 'index', arr, idx });
const LEN = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const BIN = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const NOT = (x: IRExpr): IRExpr => ({ kind: 'unop', op: '!', x });
const CALL = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

const ASSIGN = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const VARDECL = (name: string, type: IRType, init: IRExpr): IRStmt => ({ kind: 'var', name, type, init });
const IF = (cond: IRExpr, then: IRStmt[], els?: IRStmt[], phase?: string): IRStmt => {
  const stmt: Extract<IRStmt, { kind: 'if' }> = { kind: 'if', cond, then };
  if (els !== undefined) stmt.else = els;
  if (phase !== undefined) stmt.phase = phase;
  return stmt;
};
const FOR = (v: string, from: IRExpr, to: IRExpr, inclusive: boolean, body: IRStmt[]): IRStmt => ({
  kind: 'for-range',
  var: v,
  from,
  to,
  inclusive,
  body,
});
const RET = (): IRStmt => ({ kind: 'return' });
const BREAK = (): IRStmt => ({ kind: 'break' });

const oldItems = V('oldItems');
const newItems = V('newItems');
const sameTag = V('sameTag');
const keyed = V('keyed');
const usedOut = V('usedOut');
const resultOut = V('resultOut');

const reconcileFn: IRFunc = {
  name: 'reconcile',
  params: [
    { name: 'oldItems', type: STRING_LIST },
    { name: 'newItems', type: STRING_LIST },
    { name: 'sameTag', type: { kind: 'bool' } },
    { name: 'keyed', type: { kind: 'bool' } },
    { name: 'usedOut', type: INT_LIST },
    { name: 'resultOut', type: INT_LIST },
  ],
  returnType: { kind: 'void' },
  body: [
    IF(
      NOT(sameTag),
      [
        ASSIGN(IDX(resultOut, L(0)), L(0)),
        ASSIGN(IDX(resultOut, L(1)), BIN('+', BIN('*', L(2), LEN(newItems)), L(1)), 'create'),
        ASSIGN(IDX(resultOut, L(2)), BIN('+', BIN('*', L(2), LEN(oldItems)), L(1)), 'delete'),
        ASSIGN(IDX(resultOut, L(3)), L(0)),
        RET(),
      ],
      undefined,
      'compare-tag',
    ),
    ASSIGN(IDX(resultOut, L(0)), L(0)),
    ASSIGN(IDX(resultOut, L(1)), L(0)),
    ASSIGN(IDX(resultOut, L(2)), L(0)),
    ASSIGN(IDX(resultOut, L(3)), L(0)),
    IF(
      NOT(keyed),
      [
        VARDECL('minLen', { kind: 'int' }, CALL('min', [LEN(oldItems), LEN(newItems)])),
        FOR(
          'i',
          L(0),
          BIN('-', V('minLen'), L(1)),
          true,
          [
            IF(
              BIN('!=', IDX(oldItems, V('i')), IDX(newItems, V('i'))),
              [ASSIGN(IDX(resultOut, L(0)), BIN('+', IDX(resultOut, L(0)), L(1)), 'patch')],
            ),
          ],
        ),
        IF(
          BIN('>', LEN(newItems), LEN(oldItems)),
          [
            ASSIGN(
              IDX(resultOut, L(1)),
              BIN('+', IDX(resultOut, L(1)), BIN('*', L(2), BIN('-', LEN(newItems), LEN(oldItems)))),
              'create',
            ),
          ],
          [
            IF(
              BIN('>', LEN(oldItems), LEN(newItems)),
              [
                ASSIGN(
                  IDX(resultOut, L(2)),
                  BIN('+', IDX(resultOut, L(2)), BIN('*', L(2), BIN('-', LEN(oldItems), LEN(newItems)))),
                  'delete',
                ),
              ],
            ),
          ],
        ),
        RET(),
      ],
    ),
    VARDECL('last', { kind: 'int' }, L(0)),
    FOR(
      'i',
      L(0),
      BIN('-', LEN(newItems), L(1)),
      true,
      [
        VARDECL('found', { kind: 'int' }, L(-1)),
        FOR(
          'j',
          L(0),
          BIN('-', LEN(oldItems), L(1)),
          true,
          [
            IF(
              BIN('==', IDX(usedOut, V('j')), L(0)),
              [
                IF(
                  BIN('==', IDX(oldItems, V('j')), IDX(newItems, V('i'))),
                  [ASSIGN(V('found'), V('j')), BREAK()],
                ),
              ],
            ),
          ],
        ),
        IF(
          BIN('>=', V('found'), L(0)),
          [
            ASSIGN(IDX(usedOut, V('found')), L(1)),
            IF(
              BIN('<', V('found'), V('last')),
              [ASSIGN(IDX(resultOut, L(3)), BIN('+', IDX(resultOut, L(3)), L(1)))],
              [ASSIGN(V('last'), V('found'))],
              'move',
            ),
          ],
          [ASSIGN(IDX(resultOut, L(1)), BIN('+', IDX(resultOut, L(1)), L(2)), 'create')],
        ),
      ],
    ),
    FOR(
      'j',
      L(0),
      BIN('-', LEN(oldItems), L(1)),
      true,
      [
        IF(
          BIN('==', IDX(usedOut, V('j')), L(0)),
          [ASSIGN(IDX(resultOut, L(2)), BIN('+', IDX(resultOut, L(2)), L(2)), 'delete')],
        ),
      ],
    ),
  ],
};

export const keyedReconciliationImperativeIR: IR = {
  id: 'keyed-reconciliation-imperative',
  algorithm: 'keyedReconciliation',
  paradigm: 'imperative',
  functions: [reconcileFn],
};

export const keyedReconciliationIRs: IR[] = [keyedReconciliationImperativeIR];
