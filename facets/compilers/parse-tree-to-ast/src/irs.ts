/**
 * parse-tree-to-ast 의 코드 패널 IR — 파스 나무의 전위 색인 배열을 받아 AST 규약 넷으로
 * 값과 AST 크기를 셈한다.
 *
 * 걷어 내는 네 규약이 곧 셈의 네 갈래다. AST 를 새 배열로 짓는 것은 IR 로 하지 않는다 (배열을
 * 만들 수 없다) — 알고리즘이 나무를 실제로 고쳐 걷고, IR 은 같은 규약으로 값과 크기를 셈한다.
 * 둘은 다른 길이므로 같아야 한다 (`test/parse-tree-to-ast.test.ts` 가 잠근다).
 *
 * phase 어휘 — leaf · pass · paren · op · value (algorithm.ts 와 같다).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const eq = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '==', l, r });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

const TREE = ['conv', 'kid0', 'kid1', 'kid2'];
const treeArgs = (node: IRExpr): IRExpr[] => [node, ...TREE.map(v)];
const valueArgs = (node: IRExpr): IRExpr[] => [...treeArgs(node), v('leafVal')];
const convIs = (code: number): IRExpr => eq(at('conv', v('node')), n(code));

const valueOfBody: IRStmt[] = [
  { kind: 'comment', text: 'conv: 0 op, 1 pass, 2 paren, 3 leaf, 4 token (never reached)' },
  {
    kind: 'if',
    cond: convIs(0),
    then: [
      { kind: 'comment', text: 'op: the operator leaf becomes the node, children are left and right' },
      {
        kind: 'return',
        expr: {
          kind: 'binop',
          op: '-',
          l: call('valueOf', valueArgs(at('kid0', v('node')))),
          r: call('valueOf', valueArgs(at('kid2', v('node')))),
        },
        phase: 'op',
      },
    ],
  },
  {
    kind: 'if',
    cond: convIs(1),
    then: [
      { kind: 'comment', text: 'pass: the node vanishes, its only child rises' },
      { kind: 'return', expr: call('valueOf', valueArgs(at('kid0', v('node')))), phase: 'pass' },
    ],
  },
  {
    kind: 'if',
    cond: convIs(2),
    then: [
      { kind: 'comment', text: 'paren: drop both parentheses, the middle rises' },
      { kind: 'return', expr: call('valueOf', valueArgs(at('kid1', v('node')))), phase: 'paren' },
    ],
  },
  { kind: 'comment', text: 'leaf: the node vanishes, its token rises' },
  { kind: 'return', expr: at('leafVal', at('kid0', v('node'))), phase: 'leaf' },
];

const astSizeBody: IRStmt[] = [
  {
    kind: 'if',
    cond: convIs(0),
    then: [
      {
        kind: 'return',
        expr: {
          kind: 'binop',
          op: '+',
          l: {
            kind: 'binop',
            op: '+',
            l: n(1),
            r: call('astSize', treeArgs(at('kid0', v('node')))),
          },
          r: call('astSize', treeArgs(at('kid2', v('node')))),
        },
      },
    ],
  },
  { kind: 'if', cond: convIs(1), then: [{ kind: 'return', expr: call('astSize', treeArgs(at('kid0', v('node')))) }] },
  { kind: 'if', cond: convIs(2), then: [{ kind: 'return', expr: call('astSize', treeArgs(at('kid1', v('node')))) }] },
  { kind: 'return', expr: n(1) },
];

export const parseTreeToAstImperativeIR: IR = {
  id: 'parse-tree-to-ast-imperative',
  algorithm: 'parseTreeToAst',
  paradigm: 'imperative',
  functions: [
    {
      name: 'evaluate',
      params: [
        { name: 'root', type: INT },
        { name: 'conv', type: INTS },
        { name: 'kid0', type: INTS },
        { name: 'kid1', type: INTS },
        { name: 'kid2', type: INTS },
        { name: 'leafVal', type: INTS },
        { name: 'sizes', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'parse tree in preorder: kid0..kid2 are child indices, -1 when absent' },
        {
          kind: 'assign',
          target: { kind: 'index', arr: v('sizes'), idx: n(0) },
          expr: call('astSize', treeArgs(v('root'))),
          phase: 'value',
        },
        { kind: 'return', expr: call('valueOf', valueArgs(v('root'))), phase: 'value' },
      ],
    },
    {
      name: 'valueOf',
      params: [
        { name: 'node', type: INT },
        { name: 'conv', type: INTS },
        { name: 'kid0', type: INTS },
        { name: 'kid1', type: INTS },
        { name: 'kid2', type: INTS },
        { name: 'leafVal', type: INTS },
      ],
      returnType: INT,
      body: valueOfBody,
    },
    {
      name: 'astSize',
      params: [
        { name: 'node', type: INT },
        { name: 'conv', type: INTS },
        { name: 'kid0', type: INTS },
        { name: 'kid1', type: INTS },
        { name: 'kid2', type: INTS },
      ],
      returnType: INT,
      body: astSizeBody,
    },
  ],
};

export const parseTreeToAstIRs: IR[] = [parseTreeToAstImperativeIR];
