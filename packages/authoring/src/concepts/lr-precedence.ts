/**
 * lrPrecedence 개념 선언.
 *
 * canonical facet 은 `facet:lrPrecedence` — 모호한 문법 `E → E + E | E * E | NUM` 의 SLR(1) 표에 생긴 충돌 칸 넷을
 * 우선순위 규칙(yacc 식)으로 정하고, 같은 `1 + 2 * 3 + 4` 를 표 운전기로 밀고 접는다. 손잡이 하나 — 우선순위
 * (`*` 먼저 · `+` 먼저 · 같게 · 왼쪽 · 같게 · 오른쪽). 값 11 · 21 · 13 · 15, 밀기 칸 1 · 1 · 0 · 4, 가장 높은 스택
 * 5 · 5 · 3 · 7. 밀기 7 · 접기 7 은 어느 규칙에서나 같고 달라지는 것은 차례다. 운전기 코드는 한 줄도 바뀌지 않는다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `shiftOrReduce` 는 충돌 없는 표로 밀기 · 접기를 하는 기본 동작, `parseConflict` 는 모호한 문법이 한 칸에 두 동작을
 * 넣어 파서가 멈추는 장면이다. 이쪽은 **선언이 충돌 칸을 정하고, 그 선언을 돌리면 같은 토큰이 다른 차례로 읽힌다**는
 * 견줌이다. 그래서 definition 은 precedence and associativity declarations · settle · reorder · parser code unchanged
 * 를 쥐고, 조각들이 쥔 push · fold · accept · cannot decide · stops 를 쓰지 않는다.
 *
 * 전제 (설명 글 `lrPrecedence.md`):
 *  - 표는 SLR(1) — `E' → E` 와 FOLLOW(E) = { + · * · EOF }, 상태 일곱. LALR(1) · LR(1) 로 지어도 같은 충돌 칸 넷이 남는다.
 *  - 우선순위 풀이는 yacc 식: 접기 규칙의 우선순위 = 몸의 마지막 연산자, 높으면 밀기 · 낮으면 접기 · 같으면 결합 방향.
 *  - 상태 번호는 화면에 두지 않고 충돌 칸은 다 읽은 항목으로 가리킨다.
 *  - 코드 패널은 표를 읽는 운전기 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lrPrecedenceConcept: FacetConceptSource = {
  id: 'lrPrecedence',
  label: 'LR Parsing with Precedence Declarations',
  canonicalFacet: 'facet:lrPrecedence',

  surface: {
    definition:
      'Precedence and associativity declarations settle the conflicting cells in an ambiguous expression grammar\'s LR table; changing the declaration reorders the same shifts and reductions into a different tree and value while the table-driven parser code stays unchanged.',
    exemplarKeywords: [
      'operator precedence in yacc',
      'Bison %left %right',
      'precedence declarations',
      'left associative vs right associative',
      'resolving shift/reduce conflicts',
      'ambiguous expression grammar E → E + E | E * E',
      'LR parser generator',
      'table-driven parser',
      'why multiplication binds tighter',
      'exponent is right associative',
    ],
  },

  briefing: {
    observable: [
      'The Grammar is R1 `E → E + E`, R2 `E → E * E`, R3 `E → NUM`, and the Precedence box states the current rule, for example "+ level 1, left · * level 2, left".',
      'A "Conflict cells" table has four cells, indexed by the completed item (`E → E + E ·` or `E → E * E ·`) and the next token (`+` or `*`). At the start every cell reads "shift / reduce R1" or "shift / reduce R2".',
      'Step 1 settles them — "Precedence sets the conflict cells: shift 1 · reduce 3" under `*` first — and each cell flips to one action. When the parser later reads one of these cells, the cell is outlined and the caption adds "cell set by precedence".',
      'The input row `NUM 1` · `OP +` · `NUM 2` · `OP *` · `NUM 3` · `OP +` · `NUM 4` · `EOF` feeds a stack column. A shift moves a token to the top ("Next 2: shift NUM"); a reduce folds the top cells into one `E` ("Next EOF: reduce R1, value 11"), and each reduce raises a node of the tree drawn beside it with its value.',
      'The round ends with accept and the tree as text: under `*` first, "((1 + (2 * 3)) + 4) = 11". Seventeen steps with the start.',
      'Across the Precedence handle: `+` first gives `((1 + 2) * (3 + 4))` = 21; Equal, left gives `(((1 + 2) * 3) + 4)` = 13 with the stack never above 3; Equal, right gives `(1 + (2 * (3 + 4)))` = 15, shifting everything first to a stack of 7 and then reducing four times in a row at `EOF`.',
      'Four readouts: Shift cells (1 · 1 · 0 · 4 across the four rules), Shifts and Reduces (7 and 7 in every rule), and Max stack (5 · 5 · 3 · 7). Only the order of the same actions changes.',
      'The table is SLR(1); LALR(1) or LR(1) would leave the same four conflict cells, because the conflict comes from the grammar being ambiguous. Resolution follows the yacc convention. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle, "Precedence", with four positions: `* first`, `+ first`, `Equal, left` and `Equal, right` (starting at `* first`). Each change replays the round.',
        'The move that makes the idea land is switching between the four positions while watching the four conflict cells and the final tree: the cells flip, the tree regroups and the value changes, while the shift and reduce totals stay at 7 and 7.',
        'The code panel, labelled "LR table driver", starts empty with a "+ Add language" button. It shows one table-driving loop that is identical for every precedence rule — only the four table entries differ — in Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why a parser generator lets you keep the short ambiguous grammar `E → E + E | E * E` and add `%left` or `%right` lines, and needs to show those lines changing only a few table entries.',
      'A reader wants to see that left versus right associativity is not a property of the operator symbol but a choice made at a handful of table cells, with the same tokens producing 13 or 15.',
    ],

    avoidWhen: [
      'The article is about rewriting the grammar into precedence layers (`Expr` / `Term` / `Factor`) to remove ambiguity. The grammar here stays ambiguous and the table is patched instead.',
      'The subject is how LR tables or item sets are constructed. The table is built behind the scenes; states and items are not walked through.',
      'The topic is precedence climbing or Pratt parsing in a hand-written parser. This parser is table-driven.',
    ],

    contrastWith: [
      {
        concept: 'parseConflict',
        note: 'A conflict is the table cell holding two actions and the parser having no answer there. Precedence declarations are the answer, and comparing different answers is what shows each one\'s effect on grouping and value.',
      },
      {
        concept: 'shiftOrReduce',
        note: 'Shifting and reducing by a conflict-free table is the basic machine. With declarations the machine stays unchanged and only a few of its table entries are chosen by declaration, which is enough to change what it builds.',
      },
      {
        concept: 'parseTreeToAst',
        note: 'Both concern how the same operators group. Precedence declarations decide it at the parse table while the grammar stays ambiguous; the alternative is to write left- or right-recursive rules so the grammar itself fixes the grouping.',
      },
      {
        concept: 'recursiveDescent',
        note: 'An LR parser accepts left-recursive and even ambiguous expression rules once conflicts are settled; a top-down recursive descent cannot use a left-recursive rule at all.',
      },
    ],
  },
};
