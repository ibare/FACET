/**
 * parseTreeToAst 개념 선언.
 *
 * canonical facet 은 `facet:parseTreeToAst` — 뺄셈 하나와 괄호만 있는 장난감 문법으로 원시 글을 파싱해 다 지은
 * 파스 나무를 매달고, AST 규약 넷(leaf → pass → paren → op)을 한 걸음씩 적용해 AST 로 줄인 뒤 값을 셈한다.
 * 손잡이 둘 — 괄호(`a - b - 1` · `(a - b) - 1` · `((a - b)) - 1` · `a - (b - 1)`)와 문법(왼쪽 재귀 · 오른쪽 재귀).
 * 뜻을 바꾸지 않는 괄호는 파스 나무만 키우고(마디 11 → 15 → 19) AST 는 마디 다섯 그대로, 뜻을 바꾸는 괄호와
 * 문법의 꼴만 AST 의 모양과 값(1 · 3)을 바꾼다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 한 장면씩이다 — 규칙이 한 줄에서 펼쳐지는 차례(`ruleExpands`) · 펼친 자취가 나무가 됨(`derivationTree`) ·
 * 파스 나무 하나를 후위로 걷어 AST 로 바꾸는 한 번(`treeDropsSyntax`). 이쪽은 **손잡이를 돌려 견주는 것**을 맡는다 —
 * 같은 뜻의 글을 괄호만 달리 적거나 문법만 바꾸었을 때 AST 가 같은가 다른가. 그래서 definition 은 redundant
 * parentheses · identical AST · left- vs right-recursive · associativity 쪽 낱말을 쥐고, 조각들이 독점한
 * postorder · lift · single-child · leftmost derivation · sentential form 을 쓰지 않는다.
 *
 * 전제 (설명 글 `parseTreeToAst.md` 가 밝힌 것):
 *  - `a` = 5 · `b` = 3 은 예로 정한 값, 문법은 예로 만든 장난감 문법이다.
 *  - 파스 나무는 문법에서 지은 SLR(1) 표로 얻었다. 두 문법 모두 충돌이 없어 어느 파서로 지어도 나무는 하나다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것 — 나무를 전위 색인 배열로 받아 같은 네 규약으로 값과 AST 마디 수를
 *    셈하는 함수이지, 소재인 뺄셈 글이 아니다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const parseTreeToAstConcept: FacetConceptSource = {
  id: 'parseTreeToAst',
  label: 'Parse Tree vs AST (Which Parentheses Survive)',
  canonicalFacet: 'facet:parseTreeToAst',

  surface: {
    definition:
      'Redundant parentheses make the parse tree taller yet leave the abstract syntax tree identical; only parentheses that regroup, or switching the grammar between left- and right-recursive, change the AST shape and the computed value.',
    exemplarKeywords: [
      'parse tree vs abstract syntax tree',
      'concrete syntax tree vs AST',
      'redundant parentheses',
      'do parentheses appear in the AST',
      'left-recursive vs right-recursive grammar',
      'associativity of subtraction',
      'a - b - 1 vs a - (b - 1)',
      'grammar determines associativity',
      'AST construction in a compiler front end',
      'syntax-directed translation',
    ],
  },

  briefing: {
    observable: [
      'The top shows the Source line, its Tokens (for example `PUNCT (` · `NAME a` · `OP -` · `NAME b` · `PUNCT )` · `OP -` · `NUM 1` · `EOF`) and a Grammar of five rules, each tagged with its AST convention: R1 `Expr → Expr - Term` op, R2 `Expr → Term` pass, R3 `Term → ( Expr )` paren, R4 `Term → NAME` leaf, R5 `Term → NUM` leaf.',
      'A round first hangs the whole parse tree at once — "Parse tree: nodes 15 (inner 8 + leaves 7) · levels 7 · expansions 8" for `(a - b) - 1` — then applies one convention per step, all its nodes together, in the order leaf → pass → paren → op.',
      'Each walk step reports its count: "leaf: nodes removed 3 → nodes left 12", "pass: nodes removed 2 → nodes left 10", "paren: nodes removed 1, parentheses dropped 2 → nodes left 7", "op: operators rising into their nodes 2 → nodes left 5".',
      'The last step evaluates the AST, writing a value beside every node, and ends with "AST nodes 5 · levels 3 · value 1" and `-(-(a, b), 1) = 1`. The default round is seven steps; a source without parentheses has no paren step and takes six.',
      'Across the Parentheses handle, `a - b - 1`, `(a - b) - 1` and `((a - b)) - 1` give parse trees of 11, 15 and 19 nodes but the same five-node AST, landing in the same place with value 1. Only `a - (b - 1)` moves the inner `-` to the right child and gives 3.',
      'With the Grammar handle on Right-recursive (`Expr → Term - Expr`), the unparenthesised source grows its parse tree down to the right instead of the left, and its AST becomes `-(a, -(b, 1))` with value 3 — the same shape as `a - (b - 1)`.',
      'Three readouts track the round: Parse nodes, Tree nodes (shrinking step by step to the AST size), and Dropped tokens (the parentheses removed so far).',
      'The values `a` = 5 and `b` = 3 are fixed examples, and the grammar is a toy with only subtraction and parentheses. The parse tree comes from an SLR(1) table; both grammars are conflict-free, so any parser would build the same tree. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Parentheses" with four positions (`a - b - 1`, `(a - b) - 1`, `((a - b)) - 1`, `a - (b - 1)`, starting at `(a - b) - 1`) and "Grammar" with Left-recursive and Right-recursive (starting at Left-recursive). Each change replays the round.',
        'The move that makes the idea land is stepping through the first three parenthesis positions: the parse tree gains levels while the finished AST does not change at all, and then the fourth position, or the grammar switch, finally changes its shape and value.',
        'The code panel, labelled "Evaluating by the four conventions", starts empty with a "+ Add language" button. The function it shows takes the parse tree as preorder index arrays and computes the value and AST node count by the same four conventions; it is the same logic in Python, JavaScript, TypeScript, Java, C++ and C#, not the subtraction program itself.',
      ],
    },

    useWhen: [
      'The article says the AST keeps only what matters for meaning and needs proof that parentheses which change nothing leave literally no trace, while the ones that regroup do.',
      'A reader wonders where associativity comes from when no parentheses are written; flipping the grammar from left- to right-recursive turns the same text into the other tree and the other value.',
    ],

    avoidWhen: [
      'The article is about operator precedence between different operators such as `+` and `*`. The grammar here has subtraction only, so no precedence question arises.',
      'The subject is how a parser builds the tree step by step from tokens. The parse tree arrives already built; parsing itself is not shown.',
      'The topic is later compiler passes such as type checking or code generation over the AST. The round stops at evaluating the tree.',
    ],

    contrastWith: [
      {
        concept: 'treeDropsSyntax',
        note: 'Stripping a single parse tree down to its AST is the mechanism; comparing several spellings and two grammars is what shows which differences in the source the AST keeps and which it forgets.',
      },
      {
        concept: 'derivationTree',
        note: 'A derivation tree is the full record of which rules produced a sentence. The AST question starts from that record and asks how much of it is syntax only, and why redundant parentheses do not survive.',
      },
      {
        concept: 'ruleExpands',
        note: 'Expanding rules is how a grammar produces a sentence at all; this concept takes the grammar as given and weighs whether its left- or right-recursive form forces one associativity or the other on the tree.',
      },
      {
        concept: 'lrPrecedence',
        note: 'Both decide how the same operators group. Here grouping comes from how the grammar is written; with precedence declarations an ambiguous grammar stays as it is and the parse table is settled instead.',
      },
      {
        concept: 'typeFlowsUp',
        note: 'Type checking is one of the consumers of the AST, working over the tree after syntax-only nodes are gone; this concept is about what that tree contains in the first place.',
      },
    ],
  },
};
