/**
 * parseConflict 개념 선언.
 *
 * canonical facet 은 `facet:parseConflict` — 규칙 둘뿐인 모호한 문법 `Expr → Expr - Expr | NUM` 의 SLR(1) 표로
 * `5 - 3 - 1` 을 읽는다. 걸음 6 에서 스택 `Expr - Expr` · 다음 `-` 의 칸에 접기 R1 과 밀기가 함께 들어 파서가 멈춘다.
 * 두 동작을 각각 끝까지 따라가면 `(5 - 3) - 1` = 1 과 `5 - (3 - 1)` = 3 — 노드 10 · 잎도 같고 묶음 하나가 값을 바꾼다.
 * 9 걸음, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `shiftOrReduce` 는 충돌 없는 표의 기본 동작이고, 완제품 `lrPrecedence` 는 선언으로 충돌 칸을 정해 결과를 견준다.
 * 이쪽은 **고르지 않는다** — 한 칸에서 두 갈래가 벌어지고 파서가 정하지 못한다는 것까지. 그래서 definition 은
 * ambiguous grammar · two actions in one cell · cannot decide · two groupings · two values 를 쥐고,
 * precedence · associativity · declaration · reorder 를 쓰지 않는다.
 *
 * 전제: 표는 SLR(1)(상태 5), 이 문법에서는 LALR(1) 표와 같다. LALR(1) · LR(1) 로 지어도 같은 칸에서 같은 충돌이 난다 —
 * 문법이 모호해서다. 두 갈래는 "골랐다면" 의 결과이고 실제 파서는 멈춰 아무것도 받지 않았다(설명 글이 밝힌다).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const parseConflictConcept: FacetConceptSource = {
  id: 'parseConflict',
  label: 'Parse Conflict (Two Actions in One Table Cell)',
  canonicalFacet: 'facet:parseConflict',

  surface: {
    definition:
      'An ambiguous grammar makes LR table construction place both a reduce and a shift in one cell, so the parser cannot decide there; following each action splits the same tokens into two groupings with two different values.',
    exemplarKeywords: [
      'shift/reduce conflict',
      'ambiguous grammar',
      'grammar ambiguity',
      'yacc conflict warning',
      'Bison shift/reduce conflicts',
      'Expr → Expr - Expr',
      '(5 - 3) - 1 vs 5 - (3 - 1)',
      'two parse trees for one input',
      'LR(1) conflict',
      'why subtraction needs associativity',
    ],
  },

  briefing: {
    observable: [
      'The grammar is R1 `Expr → Expr - Expr` and R2 `Expr → NUM`. The Source `5 - 3 - 1` sits above a Stack and a "Remaining input" row of `NUM 5` · `OP -` · `NUM 3` · `OP -` · `NUM 1` · `EOF` with a "next" marker. The start reads "Nothing done yet. Remaining input: 6".',
      'Steps 1 to 5 follow the table: a shift moves a token cell from the input to the stack ("Next 5: shift. Stack cells: 1"), a reduce gathers the body cells into one left-hand symbol. After step 5 the stack is `Expr - Expr` and the next token is `-`.',
      'Step 6 is the conflict. A "Table cell · next -" box holds two actions, each with the item that produced it: reduce R1 from `Expr → Expr - Expr ·` and shift from `Expr → Expr · - Expr`. The caption counts "Actions in one cell: 2". Had the next token been `EOF`, the cell would hold the reduce alone.',
      'Step 7, "If chosen: reduce R1", runs the six remaining actions and builds a tree leaning left: `(5 - 3) - 1 = 1`.',
      'Step 8, "If chosen: shift", runs its six remaining actions and builds a tree leaning right: `5 - (3 - 1) = 3`. The end reads "Groupings: (5 - 3) - 1 · 5 - (3 - 1). Values: 1 · 3". Nine steps with the start.',
      'Both trees have 10 nodes (5 inner, 5 leaves) and the same leaves `5 - 3 - 1`; only the grouping differs, and it changes the value. The two branches are what the parser would do if it chose — the parser itself stopped at step 6 and accepted nothing.',
      'The table is SLR(1); for this grammar it equals the LALR(1) table, and LR(1) gives the same conflict at the same cell, because the grammar itself is ambiguous. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself: five ordinary actions, the conflict, then the two hypothetical branches side by side, and stops.',
        'A Replay button and a playback strip sit below. Dragging back to step 6 holds the single cell with its two actions and their items.',
        'Grammar and input are fixed, so both groupings and both values can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains what a shift/reduce conflict warning from yacc or Bison actually means, and needs the one table cell where two actions meet.',
      'A reader thinks ambiguity is harmless because both readings use the same tokens; the two groupings of `5 - 3 - 1` giving 1 and 3 show it is not.',
    ],

    avoidWhen: [
      'The article is about how precedence or associativity declarations settle a conflict. Nothing is settled here; both branches are shown and neither is chosen.',
      'The subject is reduce/reduce conflicts. The conflict here is between a shift and a reduce.',
      'The topic is a grammar that parses without conflicts. The whole point is the cell that has two actions.',
    ],

    contrastWith: [
      {
        concept: 'lrPrecedence',
        note: 'The conflict is the question the table cannot answer; precedence and associativity declarations supply the answer. Leaving it open is what shows that both answers are legitimate parses with different meanings.',
      },
      {
        concept: 'shiftOrReduce',
        note: 'Shift-reduce parsing works because each cell names one action. A conflict is the failure of that assumption at a single cell, caused by the grammar rather than by the input.',
      },
      {
        concept: 'derivationTree',
        note: 'An unambiguous grammar gives a sentence exactly one derivation tree. Ambiguity means two trees for the same tokens, and a parse table must then hold two actions somewhere.',
      },
      {
        concept: 'parseTreeToAst',
        note: 'Rewriting the grammar so that its recursion goes only one way is one cure for this ambiguity; that choice of left- or right-recursive rules is what fixes the grouping and the value.',
      },
    ],
  },
};
