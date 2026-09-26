/**
 * instruction-selection 의 IR — 나무를 번호 배열로 받아 가장 큰 무늬 먼저 덮는 컴파일러 함수.
 *
 * 화면의 나무는 입력 자료이고, 이 IR 은 그 나무를 덮는 명령 선택기다. 마디 종류마다 **큰 무늬부터 if 사슬**로
 * 맞춰 보고 `e` 자리로 재귀한다. 명령 수(stats[0]) · 새 임시 수(stats[1])가 algorithm 과 같다 — 모든 손잡이
 * 조합에서, 마디 번호를 섞어도 (test 가 잠근다). 명령 글자와 산 값 최대는 IR 에 두지 않는다 (algorithm 이 셈해 payload 로).
 *
 * 마디 번호는 부르는 쪽이 짓는다 (전위 차례 0 부터). kind 0 STORE · 1 ADD · 2 MUL · 3 MEM · 4 NAME · 5 NUM,
 * 자식 없으면 −1. hasImm = 모음 ≥ 1 · hasOffset = 모음 ≥ 2 (0/1). NUM 의 값 · NAME 의 이름은 셈에 쓰지 않으니 넘기지 않는다.
 * `&&` 는 짧은 회로가 아니라서 −1 일 수 있는 색인을 읽는 자리는 if 를 중첩한다.
 *
 * phase — 가지마다 첫 문 `stats[0] += 1` 에 붙인다 (고르는 순간이 걸음이다). 냄은 selectCount 의 return.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const VOID: IRType = { kind: 'void' };
const INT_LIST: IRType = { kind: 'list', of: { kind: 'int' } };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const eq = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '==', l, r });

/** stats[i] += 1 */
const bump = (i: number, phase?: string): IRStmt => {
  const s: IRStmt = {
    kind: 'assign',
    target: at('stats', n(i)),
    expr: { kind: 'binop', op: '+', l: at('stats', n(i)), r: n(1) },
  };
  return phase === undefined ? s : { ...s, phase };
};

/** tile(child, kind, kid0, kid1, hasImm, hasOffset, stats); */
const recurse = (child: IRExpr): IRStmt => ({
  kind: 'expr-stmt',
  expr: {
    kind: 'call',
    fn: 'tile',
    args: [child, v('kind'), v('kid0'), v('kid1'), v('hasImm'), v('hasOffset'), v('stats')],
  },
});

const ret: IRStmt = { kind: 'return' };

const kindOfNode = at('kind', v('node'));

const tileBody: IRStmt[] = [
  { kind: 'comment', text: 'maximal munch: at each node try the biggest pattern first' },
  { kind: 'var', name: 'k', type: INT, init: kindOfNode },
  { kind: 'comment', text: 'STORE(NAME x, e) covers 2 nodes; only the value side needs tiles' },
  {
    kind: 'if',
    cond: eq(v('k'), n(0)),
    then: [bump(0, 'tile-store'), recurse(at('kid1', v('node'))), ret],
  },
  {
    kind: 'if',
    cond: eq(v('k'), n(3)),
    then: [
      { kind: 'var', name: 'addr', type: INT, init: at('kid0', v('node')) },
      { kind: 'comment', text: 'MEM(ADD(e, k)) covers 3 nodes, only when the offset is a number' },
      {
        kind: 'if',
        cond: eq(v('hasOffset'), n(1)),
        then: [
          {
            kind: 'if',
            cond: eq(at('kind', v('addr')), n(1)),
            then: [
              {
                kind: 'if',
                cond: eq(at('kind', at('kid1', v('addr'))), n(5)),
                then: [bump(0, 'tile-load-offset'), recurse(at('kid0', v('addr'))), bump(1), ret],
              },
            ],
          },
        ],
      },
      { kind: 'comment', text: 'MEM(e) covers 1 node' },
      bump(0, 'tile-load-mem'),
      recurse(v('addr')),
      bump(1),
      ret,
    ],
  },
  {
    kind: 'if',
    cond: { kind: 'binop', op: '||', l: eq(v('k'), n(1)), r: eq(v('k'), n(2)) },
    then: [
      { kind: 'comment', text: 'ADD(e, k) / MUL(e, k) covers 2 nodes, only when the right child is a number' },
      {
        kind: 'if',
        cond: eq(v('hasImm'), n(1)),
        then: [
          {
            kind: 'if',
            cond: eq(at('kind', at('kid1', v('node'))), n(5)),
            then: [bump(0, 'tile-imm'), recurse(at('kid0', v('node'))), bump(1), ret],
          },
        ],
      },
      { kind: 'comment', text: 'ADD(e, e) / MUL(e, e) covers 1 node' },
      bump(0, 'tile-reg'),
      recurse(at('kid0', v('node'))),
      recurse(at('kid1', v('node'))),
      bump(1),
      ret,
    ],
  },
  {
    kind: 'if',
    cond: eq(v('k'), n(4)),
    then: [bump(0, 'tile-name'), bump(1), ret],
  },
  { kind: 'comment', text: 'NUM k: load the number into a new register' },
  bump(0, 'tile-num'),
  bump(1),
];

export const instructionSelectionImperativeIR: IR = {
  id: 'instruction-selection-imperative',
  algorithm: 'instructionSelection',
  paradigm: 'imperative',
  functions: [
    {
      name: 'selectCount',
      params: [
        { name: 'root', type: INT },
        { name: 'kind', type: INT_LIST },
        { name: 'kid0', type: INT_LIST },
        { name: 'kid1', type: INT_LIST },
        { name: 'hasImm', type: INT },
        { name: 'hasOffset', type: INT },
        { name: 'stats', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'stats[0] = instructions (one per pattern), stats[1] = new temporaries' },
        { kind: 'assign', target: at('stats', n(0)), expr: n(0) },
        { kind: 'assign', target: at('stats', n(1)), expr: n(0) },
        recurse(v('root')),
        { kind: 'return', expr: at('stats', n(0)), phase: 'emit' },
      ],
    },
    {
      name: 'tile',
      params: [
        { name: 'node', type: INT },
        { name: 'kind', type: INT_LIST },
        { name: 'kid0', type: INT_LIST },
        { name: 'kid1', type: INT_LIST },
        { name: 'hasImm', type: INT },
        { name: 'hasOffset', type: INT },
        { name: 'stats', type: INT_LIST },
      ],
      returnType: VOID,
      body: tileBody,
    },
  ],
};

export const instructionSelectionIRs: IR[] = [instructionSelectionImperativeIR];
