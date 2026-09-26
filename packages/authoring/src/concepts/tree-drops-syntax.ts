/**
 * treeDropsSyntax 개념 선언.
 *
 * canonical facet 은 `facet:treeDropsSyntax` — 세 줄 장난감 문법(`Expr` · `Term` · `Factor`)이 `(a + 1) * b` 에 지은
 * 파스 나무(노드 18 · 층 9)를 **후위**로 걸으며 안쪽 노드 하나씩 AST 규약(op · pass · paren · leaf)대로 바꾼다.
 * 괄호 잎 둘이 떨어져 나가고, 한 자식 사슬이 사라지고, 연산자 잎이 부모 자리로 올라 노드 이름이 된다.
 * 끝에 AST 는 노드 5 · 층 3, `*` 의 첫 자식이 `+` 다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `parseTreeToAst` 는 괄호 · 문법 손잡이를 돌려 "어떤 괄호가 AST 에 남는가" 를 견준다. 이쪽은 손잡이가 없고
 * 나무 하나를 **한 노드씩 바꾸는 동작**이 주장이다 — 버린 괄호의 일을 모양이 이어받는 순간. 그래서 definition 은
 * postorder · lift · single-child chain · operator becomes the node 를 쥐고, 완제품의 redundant · identical ·
 * left-/right-recursive 를 쓰지 않는다. `derivationTree` 는 나무를 **짓는** 쪽이라 hang · leaves spell 을 가져간다.
 *
 * 전제: 파스 나무는 SLR(1) 표로 읽는 파서가 지은 것을 그대로 받았다 — 주장이 파싱이 아니라 걷어 내기다.
 * 실제 컴파일러는 흔히 파스 나무를 따로 짓지 않고 접는 자리에서 곧바로 AST 노드를 만든다(설명 글이 밝힌다).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const treeDropsSyntaxConcept: FacetConceptSource = {
  id: 'treeDropsSyntax',
  label: 'Parse Tree Stripped to an AST (Grouping Kept as Shape)',
  canonicalFacet: 'facet:treeDropsSyntax',

  surface: {
    definition:
      'Walking a parse tree in postorder discards parenthesis leaves, collapses single-child chains and lifts each operator into its parent node, so the grouping the parentheses expressed survives only as which operator node is the child of which.',
    exemplarKeywords: [
      'parse tree to AST conversion',
      'why the AST has no parentheses',
      'dropping punctuation tokens',
      'collapse unit productions',
      'chain rules Expr → Term → Factor',
      'operator node with two children',
      'bottom-up tree rewriting',
      'postorder traversal',
      '(a + 1) * b',
      'where did the parentheses go',
    ],
  },

  briefing: {
    observable: [
      'The start shows the parse tree for `(a + 1) * b` "as the parser built it — a node for every rule used, a leaf for every token": 18 nodes, 9 levels, with a token strip `( a + 1 ) * b` below and "Tokens kept: 7 / 7".',
      'Reaching a single `a` takes four levels, `Expr → Term → Factor → NAME`, because the grammar writes precedence as layers of rules.',
      'The walk goes in postorder, children before parents, one inner node per step — twelve steps with the start. Each caption names the rule and what happens: "Factor → NAME — the node goes, and its token rises into the empty place: NAME a"; "a node with a single child goes, and what stood below rises one level"; "both parenthesis leaves fall away, and the middle rises into the place"; "the operator leaf rises and becomes the node itself".',
      'By convention the steps split into leaf 3, pass 5, paren 1 and op 2. The Nodes and Levels readouts fall step by step.',
      'At the paren step the two parenthesis leaves drop away; at that moment `+` already holds `a` and `1` as its children. Later `*` rises and takes that `+` node as its first child and `b` as its second.',
      'The end shows an AST of 5 nodes and 3 levels, "Dropped tokens: 2 · First child of *: +" and "Tokens kept: 5 / 7" — the two operators live on as node names, the three names and numbers as leaves.',
      'The grammar is a three-line toy, and the parse tree is supplied as built by an SLR(1) parser; the walk checks it against the rules and the token order rather than trusting it. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the walk by itself, one inner node per step, and stops at the finished AST.',
        'A Replay button and a playback strip sit below. Dragging back to the paren step holds the moment the parentheses vanish while `+` already sits under what will become `*`.',
        'Source, grammar and tree are fixed, so every count and caption can be quoted exactly.',
      ],
    },

    useWhen: [
      'A reader asks how the "add first" meaning of `(a + 1) * b` can survive once the parentheses are thrown away, and the article wants the exact moment the tree shape takes over that job.',
      'The article explains why a compiler keeps an abstract tree rather than the parser\'s tree, and needs the long `Expr → Term → Factor` chains shown collapsing node by node.',
    ],

    avoidWhen: [
      'The reader is meant to compare parenthesised and unparenthesised spellings, or two grammars. One input and one grammar are fixed here.',
      'The subject is building the parse tree from tokens. The tree is given at the start; no parsing is shown.',
      'The article is about evaluating or type-checking the AST. The walk ends with the tree; no values are computed.',
    ],

    contrastWith: [
      {
        concept: 'parseTreeToAst',
        note: 'Turning one parse tree into its AST is the mechanism. Asking which source differences survive that turn, across spellings and grammars, is the comparison built on top of it.',
      },
      {
        concept: 'derivationTree',
        note: 'A derivation tree is built by keeping every rule that was expanded; the AST is what remains after most of that record is thrown away. One adds nodes, the other removes them.',
      },
      {
        concept: 'shiftOrReduce',
        note: 'Each reduction of a bottom-up parser is where a parse-tree node is born, and where real compilers often build the AST node directly. This concept takes the finished tree and asks what of it is dispensable.',
      },
      {
        concept: 'typeFlowsUp',
        note: 'Types are worked out over the AST, from leaves toward the root; the tree first has to exist in that stripped form, which is the step this concept isolates.',
      },
    ],
  },
};
