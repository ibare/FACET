/**
 * splitIntoTokens 개념 선언.
 *
 * canonical facet 은 `facet:splitIntoTokens` — 한 줄 원문 `let total =   price*2`(21 글자)를 왼쪽부터 덩이 하나씩
 * 끊는다. 토큰 여섯은 토큰 열에 맞붙고, 빈칸 덩이 셋(길이 1 · 1 · 3)은 버려진다. 토큰 글자 16 + 버린 글자 5 = 21.
 * 스스로 재생하고 멈춘다 (처음 화면을 넣어 열 걸음).
 *
 * ── 묶음 안에서의 자리 (완제품 `tokenization` + 조각 둘)
 *
 * 완제품은 원문을 토큰 카드 줄로 바꾸는 단계 전체(종류 · 주석 · 오류 카드 · 예제 바꾸기)를 쥔다. 형제 조각
 * `longestMatchWins` 는 한 자리에서 규칙들이 겨루는 장면이다. 이쪽의 주장은 하나 — **빈칸은 경계를 정하고 버려진다**.
 * 그래서 definition 은 whitespace · separates · discarded · 빈칸 수와 무관하게 같은 토큰 열 쪽 낱말을 쥐고,
 * 형제가 독점한 longest · rule order · tie 와 완제품의 first stage · smallest meaningful units 를 쓰지 않는다.
 *
 * 전제 (설명 글 `splitIntoTokens.md` 가 밝힌 것): 규칙은 이 장면을 위해 정한 장난감 언어의 것(키워드 열여섯 ·
 * 소문자 이름 · 수 · 연산자). 입력은 한 줄 — 줄 첫머리 빈칸에 뜻이 있는 파이썬 같은 언어는 다루지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const splitIntoTokensConcept: FacetConceptSource = {
  id: 'splitIntoTokens',
  label: 'Whitespace Separates Tokens, Then Is Dropped',
  canonicalFacet: 'facet:splitIntoTokens',

  surface: {
    definition:
      'Whitespace in source code only marks where one token ends and the next begins and is then discarded, so one blank, three blanks, or none at a change of character kind yield the same token stream.',
    exemplarKeywords: [
      'whitespace is ignored by the lexer',
      'insignificant whitespace',
      'free-form syntax',
      'why extra spaces do not matter in code',
      'a=b versus a = b',
      'token stream',
      'lexer skips spaces',
      'delimiters between tokens',
      'lettotal becomes one identifier',
    ],
  },

  briefing: {
    observable: [
      'A source line `let total =   price*2`, 21 characters, sits above an empty token row. Counters read "Tokens" and "Dropped characters".',
      'The line is cut from the left, one chunk per step, nine chunks in all: `LET` [0,3), a blank [3,4), `NAME total` [4,9), a blank [9,10), `OP =` [10,11), a blank run of 3 [11,14), `NAME price` [14,19), `OP *` [19,20), `NUM 2` [20,21).',
      'Each token chunk joins the end of the token row. Each blank run is labelled with its length and falls away — "Dropped; it never reaches the token row."',
      'The run ends with six tokens, `LET · NAME total · OP = · NAME price · OP * · NUM 2`, sitting side by side with no gaps. 16 characters went into tokens and 5 were dropped, adding back to 21.',
      'The three blanks after `=` and the single blank before `total` leave no mark in the token row. `price*2` has no blanks at all and is still cut twice, because the kind of character changes at `*` and at `2`.',
      'The rules belong to a small toy language made up for the example: sixteen keywords such as `let`, `if`, `while`; names that start with a lowercase letter; numbers; operators such as `==`, `>=`, `=`, `*`. The input is a single line.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one chunk per step, ten steps counting the opening view, and stops with the token row complete.',
        'A Replay button and a playback strip sit below it. Holding the step that cuts [11,14) shows the three-blank run being dropped while the token row gains nothing.',
        'The source line is fixed, so an article can quote every range and count exactly.',
      ],
    },

    useWhen: [
      'A beginner asks whether `x=1` and `x   =   1` are different programs, and the article needs to show both collapsing to the same row of tokens.',
      'The article explains that spaces decide boundaries — `let total` is two tokens, `lettotal` would be one name — yet carry no meaning afterwards.',
    ],

    avoidWhen: [
      'The language treats indentation or line breaks as syntax, as Python does. The input here is one line and every blank is dropped.',
      'The subject is how an LLM tokenizer keeps the leading space inside a subword. Here whitespace never becomes a token.',
      'The article is about choosing between two rules that both match at one position. Every cut here has a single obvious reading.',
    ],

    contrastWith: [
      {
        concept: 'tokenization',
        note: 'Tokenization is the whole conversion from characters to a labelled token sequence, with kinds, comments and error tokens. This isolates one fact inside it: blanks set boundaries and leave nothing behind.',
      },
      {
        concept: 'longestMatchWins',
        note: 'Both are about where a token ends. A blank or a change of character kind forces the end outright; the longest-match rule applies only where several rules could end it at different lengths and one has to be chosen.',
      },
      {
        concept: 'spaceIsPartOfIt',
        note: 'A subword tokenizer for language models keeps the gap as part of the following fragment so the text can be rebuilt exactly; a compiler lexer throws the gap away because the program does not need it back.',
      },
    ],
  },
};
