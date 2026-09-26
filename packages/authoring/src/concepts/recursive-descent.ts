/**
 * recursiveDescent 개념 선언.
 *
 * canonical facet 은 `facet:recursiveDescent` — 규칙마다 함수 하나(`parseStmt` · `parseExpr` · `parseAtom`)인 파서가
 * `show (a + 1) + b` 같은 글을 읽는 동안 열린 함수 기둥이 얼마나 깊어지는지 부름 하나를 한 걸음으로 보인다.
 * 손잡이 둘 — 괄호 겹(0~3)과 문법(왼쪽 재귀 없음 · 왼쪽 재귀). 겹 하나에 깊이 +2(3 · 5 · 7 · 9), 부름 +3
 * (4 · 7 · 10 · 13). 왼쪽 재귀로 돌리면 `parseExpr` 만 쌓여 깊이 12 의 한계에서 −1 이 돌아 나오고, 글이 무엇이든
 * 부름 12 · 먹은 토큰 1 이다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `oneFunctionPerRule` 은 규칙이 함수가 되고 흐름이 드나드는 기본 모양 하나, `lookaheadOne` 은 다음 토큰을 들여다보고
 * 갈래를 고르는 한 가지 일이다. 이쪽은 **손잡이로 견주는 것** — 중첩이 깊이를 어떻게 키우는가, 그리고 규칙이 제
 * 이름으로 시작하면 무엇이 무너지는가. 그래서 definition 은 nesting · depth grows · left recursion · limit ·
 * no further tokens 를 쥐고, 조각의 each nonterminal its own function · peek · FIRST 를 쓰지 않는다.
 *
 * 전제 (설명 글 `recursiveDescent.md`):
 *  - 부름 한계 12 는 이 파서가 스스로 둔 지킴 값이다. 실제 언어에서는 한계 없이 호출 스택이 넘친다.
 *  - 왼쪽 재귀 문법은 LL(1) 이 아니어서 적힌 첫 갈래(R2)를 그대로 함수로 옮겼다. 두 문법이 받는 글의 모임은 같지 않지만
 *    화면의 네 글은 둘 다 받는다 — 실패는 글 탓이 아니라 파서 모양 탓이다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 파서 함수들이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const recursiveDescentConcept: FacetConceptSource = {
  id: 'recursiveDescent',
  label: 'Recursive Descent: Call Depth and Left Recursion',
  canonicalFacet: 'facet:recursiveDescent',

  surface: {
    definition:
      'In a recursive-descent parser, call depth tracks the nesting of parentheses, two levels per pair, while a left-recursive rule makes the parser call itself at the same position until a depth limit, consuming no further tokens.',
    exemplarKeywords: [
      'recursive descent parser',
      'left recursion problem',
      'infinite recursion in a parser',
      'stack overflow when parsing',
      'eliminating left recursion',
      'Expr → Expr + Atom',
      'call depth follows nesting depth',
      'deeply nested parentheses',
      'hand-written top-down parser',
      'LL parser limitations',
    ],
  },

  briefing: {
    observable: [
      'The top shows the Source (default `show (a + 1) + b`) as a row of tokens ending in `EOF`, with a "reading" marker under the next token, and the Grammar in force — by default R1 `Stmt → show Expr`, R2 `Expr → Atom + Atom`, R3 `Atom → ( Expr )`, R4 `Atom → NAME`, R5 `Atom → NUM`.',
      'On the left, "Call stack by depth" is a column numbered 1 to 12 with "Limit: 12". Each call opens a function box one level lower — `parseStmt` at depth 1, then `parseExpr`, `parseAtom` — and a "Deepest" mark keeps the maximum reached.',
      'One step is one call; the eating and returning that happened since the previous call ride along in it. Captions read "#2  call parseExpr at depth 2 · ate 1 · returned 0". Eaten tokens leave the input row and drop into the box of the function that ate them; when a function returns, its box is cleared into its caller.',
      'In the default round the parser makes 7 calls, reaches depth 5, eats all 8 tokens and checks `EOF`: "Every token eaten", "parseProgram returns: 8". Nine steps with the start.',
      'Across the Nesting handle, each extra pair of parentheses adds one `parseAtom` and one `parseExpr`: deepest 3 · 5 · 7 · 9 and calls 4 · 7 · 10 · 13 for nesting 0 · 1 · 2 · 3.',
      'With Left recursion the grammar gains R2 `Expr → Expr + Atom` beside R3 `Expr → Atom`, and `parseExpr` begins by calling `parseExpr`. Only `parseExpr` boxes pile up while the reading marker stays just after `show`. At depth 12 the next call is refused — "depth 13 refused", "Call limit hit", "−1 unwinds 12 returns" — and the round ends with "parseProgram returns: -1". Every source gives 12 calls and 1 token eaten, in 14 steps.',
      'Three readouts carry the round: Calls, Deepest and Tokens eaten. The limit of 12 is a guard this parser sets for itself; a real language has no such guard and overflows its call stack instead. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Nesting" with four positions 0 to 3 (starting at 1) and "Grammar" with No left recursion and Left recursion (starting at No left recursion). Each change replays the round.',
        'The move that makes the idea land is stepping Nesting upward to watch the column deepen by two per pair, then switching to Left recursion and watching the column fill to the limit while the reading marker never moves.',
        'The code panel, labelled "Parser functions", starts empty with a "+ Add language" button; the chosen language shows the three parse functions and the `depth > limit` guard, and highlights the function of the current call. It carries the same logic in Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article warns that a grammar rule beginning with its own name breaks a top-down parser, and wants the failure seen as a call column that fills up while not one more token is consumed.',
      'A reader asks how deep a hand-written parser recurses on nested input; stepping the nesting shows the depth rising by a fixed amount per pair of parentheses.',
    ],

    avoidWhen: [
      'The article is about bottom-up or LR parsing, where left recursion is harmless. This parser is top-down only.',
      'The subject is how a parser chooses between alternatives by looking at the next token. The lookahead happens inside `parseAtom` but is not a step and is not singled out.',
      'The topic is error recovery or reporting syntax errors in malformed input. Every source here is valid for both grammars; the only failure is the left-recursive loop.',
    ],

    contrastWith: [
      {
        concept: 'oneFunctionPerRule',
        note: 'Mapping each rule to a function is the design; measuring how deep those functions nest on varied input, and seeing the design fail on a left-recursive rule, is what this concept adds.',
      },
      {
        concept: 'lookaheadOne',
        note: 'Choosing an alternative from one token of lookahead works only when alternatives start differently. A left-recursive rule shares its first tokens with its sibling, so that choice is impossible before the recursion even begins.',
      },
      {
        concept: 'shiftOrReduce',
        note: 'A bottom-up parser builds from the tokens toward the start symbol and handles left-recursive rules without trouble. Top-down descent starts from the start symbol, which is why left recursion sends it into an endless descent.',
      },
      {
        concept: 'recursionSelfCall',
        note: 'Any self-call opens a new invocation. Left recursion is the case where that new invocation receives exactly the same input position, so nothing ever makes progress toward a base case.',
      },
      {
        concept: 'loopVsRecursion',
        note: 'Recursion depth that grows with the input is the cost of recursion in general. In a parser that depth is set by how deeply the source text nests, not by a numeric argument.',
      },
    ],
  },
};
