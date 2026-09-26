/**
 * shiftOrReduce 개념 선언.
 *
 * canonical facet 은 `facet:shiftOrReduce` — 층으로 우선순위를 담은 장난감 문법(`Expr → Expr + Term | Term` ·
 * `Term → Term * NUM | NUM`)의 SLR(1) 표(충돌 없음)로 `1 + 2 * 3` 을 아래에서 위로 읽는다. 동작 하나가 한 걸음
 * (12 = 밀기 5 · 접기 5 · 받음 1 + 처음). 걸음 7 에서 꼭대기 `Expr + Term` 이 R1 몸과 맞는데도 다음이 `*` 라 민다.
 * 접기 차례를 거꾸로 읽으면 가장 오른쪽 유도다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `parseConflict` 는 모호한 문법이 한 칸에 두 동작을 넣어 멈추는 장면, 완제품 `lrPrecedence` 는 선언으로 충돌 칸을
 * 정해 차례를 견주는 전체다. 이쪽은 **충돌 없는 표로 도는 기본 동작** — 밀기 · 접기 · 받음과, 몸과 맞아도 미는 한 걸음.
 * 그래서 definition 은 push · fold the top · left-hand nonterminal · accepts · action table 을 쥐고, 형제의
 * ambiguous · two actions · precedence · associativity · declaration 을 쓰지 않는다.
 *
 * 전제: 표는 SLR(1) 로 지었고 LALR(1) · LR(1) 로 지어도 자리 여덟 · 충돌 없음 · 같은 동작 차례다. 표의 자리 번호는
 * 화면에 두지 않는다. 문법은 예로 만든 장난감, 입력은 이미 잘린 토큰 다섯에 파서가 `EOF` 를 붙인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const shiftOrReduceConcept: FacetConceptSource = {
  id: 'shiftOrReduce',
  label: 'Shift or Reduce (Bottom-Up Parser Stack)',
  canonicalFacet: 'facet:shiftOrReduce',

  surface: {
    definition:
      'A bottom-up LR parser, guided by an action table and the next token, either pushes that token onto its stack or folds the top symbols matching a rule body into the rule\'s left-hand nonterminal, accepting once only the start symbol remains.',
    exemplarKeywords: [
      'shift-reduce parsing',
      'bottom-up parser',
      'LR parser stack',
      'handle on top of the stack',
      'action table',
      'SLR(1)',
      'reduce by a rule',
      'accept state',
      'reverse rightmost derivation',
      'how yacc parses',
    ],
  },

  briefing: {
    observable: [
      'Four rules are listed — R1 `Expr → Expr + Term`, R2 `Expr → Term`, R3 `Term → Term * NUM`, R4 `Term → NUM` — above a "Remaining input" row of `NUM 1` · `OP +` · `NUM 2` · `OP *` · `NUM 3` · `EOF` (6), a "Next" marker and a stack column. The start reads "The stack is empty. Next: NUM."',
      'A shift moves the next token from the input onto the top of the stack: "Next: NUM. Shift it onto the stack." A reduce folds the top cells into one symbol: "Next: +. Reduce by R4: the top NUM folds into one Term." Each stack cell is one symbol.',
      'The actions run: shift, reduce R4, reduce R2, shift `+`, shift `2`, reduce R4, shift `*`, shift `3`, reduce R3, reduce R1, accept — eleven actions (5 shifts, 5 reduces, 1 accept), twelve steps with the start. The stack is highest, five cells, at step 8.',
      'At step 7 the stack is `Expr + Term`, whose top three match R1 and whose top one matches R2, yet the parser shifts: "Before the shift, the top matched the body of R1, R2, but next: *. Shift." It is the only shift of the eleven actions made while the top matched a rule body.',
      'Multiplication folds first by R3 (step 9) and only then addition by R1 (step 10). The last step reads "Next: EOF. Only Expr is left on the stack. Accept."',
      'The table behind the actions is SLR(1), with no cell holding two actions; LALR(1) or LR(1) would give the same actions in the same order. Table state numbers are not shown. Read backwards, the reductions R4 · R2 · R4 · R3 · R1 form the rightmost derivation of the input. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'The screen plays the parse by itself, one action per step, and stops at accept.',
        'A Replay button and a playback strip sit below. Dragging back to step 7 holds the one moment the parser shifts although the top of the stack already matches a rule.',
        'Grammar and input are fixed, so every stack state and caption can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces shift-reduce parsing and needs every action of a small parse laid out, with the stack visible after each one.',
      'A reader assumes a bottom-up parser reduces as soon as the top of the stack matches a rule; the step where it shifts `*` instead shows that the next token decides.',
    ],

    avoidWhen: [
      'The article is about parse-table conflicts or ambiguous grammars. This table has none.',
      'The subject is how the LR automaton or item sets are constructed. The table is used, not built on screen.',
      'The topic is top-down parsing with one function per rule. This parser works bottom-up from the tokens.',
    ],

    contrastWith: [
      {
        concept: 'parseConflict',
        note: 'Every cell holding exactly one action is what lets this parser always know whether to shift or reduce. A conflict is a cell holding both, where that knowledge is missing.',
      },
      {
        concept: 'lrPrecedence',
        note: 'A grammar written in layers can make multiplication fold first by itself. With precedence declarations, the grammar can stay flat and ambiguous, and the same kind of decision is written into a few table cells by declaration.',
      },
      {
        concept: 'lookaheadOne',
        note: 'A top-down parser uses the next token to choose which rule to begin. A bottom-up parser uses it to decide whether a rule already on the stack is finished.',
      },
      {
        concept: 'stack',
        note: 'The parser relies on the stack\'s last-in, first-out order: a reduce always takes the most recently pushed symbols, which are the end of the rule body just read.',
      },
    ],
  },
};
