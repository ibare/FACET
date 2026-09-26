/**
 * lookaheadOne 개념 선언.
 *
 * canonical facet 은 `facet:lookaheadOne` — 세 줄 원시 프로그램(`let n = 5` · `show n` · `n = 6`)의 토큰 9 를
 * 장난감 문법 다섯 규칙(`Stmts → Stmt Stmts | ε` · `Stmt → let … | show … | NAME = NUM`)으로 재귀 하강한다.
 * 갈래가 둘 이상인 비단말에서 다음 토큰 하나를 **먹지 않고** 들여다보고 갈래를 고르는 것만 걸음이다(8 = 고르기 7 + 처음).
 * 갈래마다 받는 단말(FIRST · 빈 갈래는 FOLLOW)이 미리 적혀 있다. 들여다본 7 · 먹은 9. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `oneFunctionPerRule` 은 규칙 몸을 따라가며 부르고 먹고 돌아오는 흐름이고, 완제품 `recursiveDescent` 는 깊이와
 * 왼쪽 재귀를 견준다. 이쪽은 **고르기 한 가지** — 무엇을 보고 갈래를 정하는가. 그래서 definition 은 LL(1) · peek
 * without consuming · FIRST · FOLLOW · empty alternative · must not overlap 을 쥐고, call · return · depth 를 쓰지 않는다.
 *
 * 전제: 문법은 예로 만든 장난감 문법, 입력은 이미 잘린 토큰 열이며 줄바꿈은 토큰이 아니다. 파서가 끝에 `EOF` 를 붙인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lookaheadOneConcept: FacetConceptSource = {
  id: 'lookaheadOne',
  label: 'One Token of Lookahead Picks the Alternative (LL(1))',
  canonicalFacet: 'facet:lookaheadOne',

  surface: {
    definition:
      'An LL(1) parser picks one of a nonterminal\'s alternatives by peeking at the next token without consuming it, matching it against each alternative\'s FIRST set, or FOLLOW set when the alternative is empty; the sets must not overlap.',
    exemplarKeywords: [
      'LL(1)',
      'lookahead token',
      'peek vs consume',
      'FIRST set',
      'FOLLOW set',
      'epsilon production',
      'predictive parsing',
      'choosing a grammar alternative',
      'no backtracking parser',
      'statement list grammar',
    ],
  },

  briefing: {
    observable: [
      'The source `let n = 5` · `show n` · `n = 6` sits above its nine tokens, numbered #0 to #8, with `EOF` at #9.',
      'Each alternative is listed with the terminals it accepts at its start: R1 `Stmts → Stmt Stmts` takes `let` · `show` · `NAME`, R2 `Stmts → ε` takes `EOF`, R3 `Stmt → let NAME = NUM` takes `let`, R4 `Stmt → show NAME` takes `show`, R5 `Stmt → NAME = NUM` takes `NAME`. No two alternatives of the same nonterminal share a terminal.',
      'The start reads "Start. Reading position: #0" with Looked: 0 and Eaten: 0. Only choosing among two or more alternatives is a step; single-alternative rules, eating tokens and calling functions are not.',
      'Each step names the choice: "Stmts: the next token at #0 is LET let. Branch: R1". Step 2 looks at that same `let` again — `Stmts` chose R1 without eating it, so `Stmt` sees it and picks R3. Tokens eaten since the previous look appear as sunk cells.',
      'The Picks row fills in as R1 · R3 · R1 · R4 · R1 · R5 · R2. The last step reads "Stmts: the next token at #9 is EOF. Branch: R2" and "Empty branch: Stmts ends here."',
      'At the end the counters read Looked: 7 and Eaten: 9 — looking and eating are counted separately and come out different. Eight steps with the start.',
      'The grammar is a toy made for this example; the input is already tokenized and line breaks are not tokens.',
    ],

    screen: {
      affordances: [
        'The screen plays the parse by itself, one choice per step, and stops at the empty branch on `EOF`.',
        'A Replay button and a playback strip sit below. Dragging between steps 1 and 2 shows the same `let` being looked at twice by two different nonterminals.',
        'Program, grammar and accepted-terminal sets are fixed, so every caption and count can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains what the 1 in LL(1) means and needs the next token shown deciding the alternative while staying in the input.',
      'A reader is confused by FOLLOW sets or empty productions; the list ending because `EOF` selects the empty alternative gives the concrete case.',
    ],

    avoidWhen: [
      'The article is about backtracking parsers that try an alternative and undo it. No choice here is ever retried.',
      'The subject is a grammar that is not LL(1), with overlapping alternatives or left recursion. The sets here are disjoint by design.',
      'The topic is bottom-up LR parsing with shift and reduce. This is a top-down parser.',
    ],

    contrastWith: [
      {
        concept: 'oneFunctionPerRule',
        note: 'Following a rule body calls and consumes; picking which body to follow only looks. The two are separate acts, and this concept is about the picking alone.',
      },
      {
        concept: 'recursiveDescent',
        note: 'Deciding by one token works when alternatives start differently. A left-recursive rule and its sibling start alike, so no single token can separate them.',
      },
      {
        concept: 'shiftOrReduce',
        note: 'Both parsers look at one next token, but for different decisions: here it selects which rule to start expanding, there it decides whether to keep reading or to close off a rule already read.',
      },
      {
        concept: 'longestMatchWins',
        note: 'A tokenizer also looks ahead, over characters, to decide where a token ends. Parser lookahead works on whole tokens and decides which rule applies, not where a word stops.',
      },
    ],
  },
};
