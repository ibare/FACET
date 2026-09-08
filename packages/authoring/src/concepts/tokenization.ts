/**
 * tokenization 개념 선언.
 *
 * canonical facet 은 `facet:tokenization` — 위 입력 띠에서 글자를 묶고 아래 출력열로
 * 토큰 카드를 떨구는 stage view + 종류 범례.
 *
 * reactive 다. 예제를 바꿔가며 재생하는 방식이라 replay / reset 컨트롤을 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const tokenizationConcept: FacetConceptSource = {
  id: 'tokenization',
  label: 'Tokenization (Lexical Analysis)',
  domain: 'compilers',
  canonicalFacet: 'facet:tokenization',

  surface: {
    definition:
      'The first stage of a compiler, scanning source text left to right and cutting it into the smallest meaningful units, taking the longest run that still forms one.',
    exemplarKeywords: [
      'tokenization',
      'lexical analysis',
      'lexer',
      'scanner',
      'token',
      'maximal munch',
      'keyword versus identifier',
      'whitespace and comments',
      'compiler front end',
      'parsing pipeline',
    ],
  },

  briefing: {
    observable: [
      'A gaze moves left to right one character at a time and fuses same-kind characters into a growing segment. Nothing is decided until the segment can no longer extend.',
      'The moment it cannot extend, the run closes and falls to the output row as a card carrying both its text and its kind — the decision is a single visible beat.',
      'Whitespace and comments are consumed but never become cards; they sink into grey, which is what "leaves only traces" means.',
      'An unrecognized character lands as a red card rather than stopping the scan, so error handling is shown as a token kind rather than as a crash.',
      'Eight kinds are colour-coded in a legend: keyword, identifier, number, operator, punctuation, string, error, swallowed.',
      'Several example sources are available, and each shows a different cut — one with a comment, one with a two-character operator.',
      'When the scan finishes, the total token count is reported.',
    ],

    screen: {
      affordances: [
        'The reader can step through examples: Next example, Replay and Reset, plus a speed slider.',
        'The example with a comment is the one to point at when the article explains why some characters never become tokens.',
        'The moment worth slowing down is a run that could have closed earlier but kept extending — that is maximal munch, and it is visible only while the segment grows.',
      ],
    },

    useWhen: [
      'The article is about the longest match rule, which only shows when a shorter token would also have been valid and loses.',
      'The reader should see that this stage neither understands nor validates — it only cuts, and the pieces mean nothing yet.',
    ],


    avoidWhen: [
      'The article is about parsing, grammars, or syntax trees. This stage produces a flat sequence of tokens and has no structure above them.',
      'The subject is regular expressions as a language feature. The scanner uses that idea internally but nothing on screen represents a pattern.',
      'The point is semantic analysis or type checking. Those come after and are not represented here.',
    ],

    contrastWith: [
      {
        concept: 'conditionalStatement',
        note: 'Both show a decision resolving in one beat, but a conditional decides which path runs while tokenization decides where one thing ends and the next begins.',
      },
    ],
  },
};
