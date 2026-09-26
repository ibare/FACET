/**
 * derivationTree 개념 선언.
 *
 * canonical facet 은 `facet:derivationTree` — `let x = a + b + 1` 을 장난감 문법 다섯 규칙으로 가장 왼쪽 유도한다.
 * 펼친 기호는 지우지 않고 그 자리에 남기며, 규칙의 몸을 그 아래 자식으로 매단다. 마지막에 잎을 왼쪽부터 읽어
 * 토큰 8 과 짝짓는다. 다 지은 나무는 노드 15 · 층 6, 왼쪽 재귀 때문에 `Expr` 세 개가 왼쪽 아래로 사슬진다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `ruleExpands` 는 한 줄이 제자리에서 부푸는 **차례**를 말하고 지난 줄을 남기지 않는다. 이쪽은 그 자취를 모은
 * **모양**을 말한다 — 잎이 문장을 이루고, 가지가 기우는 방향이 묶는 방향이다. 그래서 definition 은 hang beneath ·
 * leaves read left to right · left-leaning 을 쥐고, `ruleExpands` 의 sentential form · replaced · reintroduces ·
 * any length 를 쓰지 않는다. `treeDropsSyntax` · `parseTreeToAst` 의 AST · parentheses 도 쓰지 않는다.
 *
 * 전제: 문법은 예로 만든 장난감 문법, 입력은 이미 잘린 토큰 열. 유도는 알고리즘이 문법과 토큰 열에서 직접 찾는다.
 * 가장 오른쪽 유도로 매달아도 같은 나무가 된다(설명 글이 밝힌다 — 화면은 가장 왼쪽 유도 하나만 보인다).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const derivationTreeConcept: FacetConceptSource = {
  id: 'derivationTree',
  label: 'Derivation Tree (Every Expansion Kept)',
  canonicalFacet: 'facet:derivationTree',

  surface: {
    definition:
      'A derivation tree keeps each expanded grammar symbol in place and hangs its rule body beneath it as children, so its leaves read left to right spell the input and its left-leaning branches record that addition associates to the left.',
    exemplarKeywords: [
      'derivation tree',
      'parse tree from a grammar',
      'concrete syntax tree',
      'leaves spell the sentence',
      'yield of a parse tree',
      'left-recursive rule Expr → Expr + Term',
      'left associativity in the tree shape',
      'context-free grammar tree',
      'interior node per rule',
      'let x = a + b + 1',
    ],
  },

  briefing: {
    observable: [
      'The five rules are listed at the top — R1 `Stmt → let NAME = Expr`, R2 `Expr → Expr + Term`, R3 `Expr → Term`, R4 `Term → NAME`, R5 `Term → NUM` — beside the source `let x = a + b + 1` and a row of eight Tokens.',
      'The start is a single root `Stmt` ("Start symbol: Stmt", "Nodes: 1"). Each step hangs one rule body beneath one node: "Rule R1: hang its body under Stmt" adds `let NAME = Expr` and the count goes to 5.',
      'The expanded node is never erased. Two R2 steps hang `Expr + Term` under `Expr` and then again under its first child, so three `Expr` nodes form a chain leaning down to the left; the deepest one then gets R3 and the three `Term` nodes get R4, R4 and R5.',
      'Each node sits horizontally at the middle of the tokens it will finally cover, so once it hangs it never moves.',
      'The last step reads the leaves left to right — "Leaves, left to right: let NAME = NAME + NAME + NUM" — and pairs them with the tokens: "Tokens matched: 8 / 8".',
      'The finished tree has 15 nodes (7 inner, 8 leaves) and 6 levels. The most deeply hung `a + b` groups first and `+ 1` attaches to its result — left-to-right addition is written into the shape. Nine steps with the start.',
      'The grammar is a toy made for this example and the input is already tokenized. The derivation is leftmost; a rightmost derivation would hang the same tree in a different order, which the screen does not show.',
    ],

    screen: {
      affordances: [
        'The screen plays the derivation by itself, one rule body per step, and stops after the leaves are matched to the tokens.',
        'A Replay button and a playback strip sit below. Dragging back through the two R2 steps shows the `Expr` chain growing to the left.',
        'Grammar, source and tokens are fixed, so every rule, count and caption can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces parse trees and needs to show that the tree is nothing more than the record of which rule was applied where, with the original sentence readable along its leaves.',
      'A reader asks how a grammar encodes that `a + b + 1` means `(a + b) + 1`; the left-leaning chain of `Expr` nodes makes the grouping visible without any parentheses.',
    ],

    avoidWhen: [
      'The article is about simplifying a parse tree into an abstract syntax tree. Nothing is removed here; every symbol stays.',
      'The subject is how a parser chooses rules from the input, by lookahead or by a table. The derivation is found up front; no parsing decision is on display.',
      'The topic is ambiguity or two possible trees for one sentence. The grammar here yields exactly one tree.',
    ],

    contrastWith: [
      {
        concept: 'ruleExpands',
        note: 'Expanding the leftmost nonterminal is the step-by-step order of a derivation, with each earlier line forgotten. The tree is what that order leaves behind when nothing is forgotten, and it is the same whatever order produced it.',
      },
      {
        concept: 'treeDropsSyntax',
        note: 'Building a derivation tree only ever adds nodes, one per rule used. Turning it into an AST is the reverse movement, discarding what only the grammar needed.',
      },
      {
        concept: 'parseTreeToAst',
        note: 'The derivation tree fixes grouping through the grammar\'s shape. Comparing it with the AST asks how much of that tree is syntax only, and whether redundant parentheses leave anything behind.',
      },
      {
        concept: 'parseConflict',
        note: 'One grammar giving one tree is the normal case this concept assumes. An ambiguous grammar admits two trees for the same tokens, which is what makes a parse table fail to decide.',
      },
    ],
  },
};
