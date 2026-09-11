/**
 * zAlgorithm 개념 선언.
 *
 * canonical facet 은 `facet:zAlgorithm` — 완제품이다. 화면이 이은 글 한 줄이다 —
 * 찾는 것 `aabaa` · 칸막이 `$` · 글 열넷. 앞 구간은 색지로 갈라 두고, 칸마다 아래
 * 점선 상자에 값이 앉는다. 겹침 구간 띠와 맨 앞의 거울 띠, 그리고 오른쪽으로만
 * 미끄러지는 점선 끝선이 있다. 값이 찾는 것의 길이와 같은 자리는 글 칸이 물들고
 * 아래에 막대가 놓인다. 손잡이는 글의 반복성(1 · 2 · 3 · 4)이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 `matchLengthPerSpot` 의 주어는 **표를 채우는 일** 이고, 그 avoidWhen 이
 * "다 채운 표로 무엇을 하는가는 이 화면이 아니다" 라고 못박아 두었다. 이쪽
 * definition 의 주어는 **찾기가 그 표에서 떨어져 나오는 방식** 이다 — 찾는 것을 글
 * 앞에 붙이고 둘 어디에도 없는 글자로 가른 뒤, 값이 찾는 것의 길이와 꼭 같은 자리를
 * 거두는 것. 붙이기 · 칸막이 · 같음이라는 판정이 이 개념에만 있고 조각에는 없다.
 *
 * keywords 도 조각이 Z 값 · 거울 자리 · 오른쪽으로만 가는 구간을 이미 가졌으므로
 * 이쪽은 **이어 붙이기와 판정** 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const zAlgorithmConcept: FacetConceptSource = {
  id: 'zAlgorithm',
  label: 'Z-Algorithm (Searching Falls Out of the Table)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:zAlgorithm',

  surface: {
    definition:
      "Finding every occurrence of a pattern by joining it ahead of the text with a character neither contains and collecting the positions whose agreement with the front equals the pattern's length.",
    exemplarKeywords: [
      'Z-algorithm',
      'concatenate pattern, separator and text',
      'string matching read off the Z array',
      'find all occurrences in linear time',
      'the sentinel character',
      'why the separator must occur in neither string',
      'searching reduced to one preprocessing pass',
      'positions whose value equals the pattern length',
      'matching without a failure function',
      'gluing two strings so one measurement answers both',
    ],
  },

  briefing: {
    observable: [
      'Everything happens on one row: the pattern, a divider and the text glued into a single string, with the pattern\'s stretch shaded apart so the join reads as two regions of one thing rather than two strings side by side.',
      'Under every cell a dashed box waits for that position\'s number, so the row and the answers it produces occupy the same coordinates.',
      'A position outside the verified stretch is settled by two markers walking in step, one at the front of the row and one at the position; a position inside it gets its number handed over from a box further left with no markers on screen at all.',
      'The verified stretch is a band with a mirror band of the same width held at the very front, and a dashed vertical line marks its right end — a line that only ever moves rightward.',
      'The divider is named in the opening caption as a character absent from both halves, and no box on the row ever holds a number larger than the pattern is long, so a box holding exactly that length is the whole of the test.',
      'A position that passes the test is announced as a match: the text cells it covers fill in, a bar is drawn beneath them, and the caption says outright that no character was read a second time to establish it.',
      'Three running figures sit under the row — how many numbers were borrowed, how many comparisons that saved, and how many positions were found — and none of them is a count of restarts.',
      'Pushing the handle holds the pattern fixed and changes only the text: occurrences run 1, 2, 3, 4 while borrows run 9 to 14 and comparisons saved run 12 to 22.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a four-position slider for how repetitive the text is, at the first position to begin with, with four fourteen-character texts and the pattern held at five characters throughout.',
        'Cell width is fixed at mount from the longest of the four texts, so positions do not shift when the handle moves and the same cell can be compared across handle positions.',
        'Three readouts beside the handle — borrows, comparisons saved, positions found — all counted during the run.',
        'The code panel shows the collecting routine walking only the numbers, and one condition covering both the outside-the-stretch case and the case where a borrowed value ran out at the edge.',
      ],
    },

    useWhen: [
      'The article presents a table of agreement lengths and then a search, and a reader cannot see what joins them. Gluing the pattern in front of the text and taking the boxes that hold exactly the pattern length is the entire join, and no separate walk over the characters happens once the boxes are filled.',
      'A reader needs a reason for the divider rather than a convention to accept. Nothing is permitted to agree across it, which is why a box holding the pattern length can only mean the pattern itself and never some longer run that merely starts the same way.',
      'The prose wants every occurrence rather than the first, and wants the cost of "every" to be visible. Four positions are reported at the far end of the handle under the same three figures, none of which grows by starting anything over.',
    ],

    avoidWhen: [
      'The subject is how a position inside the verified stretch gets its number, or why that stretch may only travel rightward. Those moves happen here but the argument behind them is not worked out; the number simply arrives.',
      'The article needs a search that reports the first hit and stops. Every position is settled here and the matches are collected afterwards from the finished boxes.',
      'The subject is preparing the text so that later patterns come cheap. The joined string here contains one pattern, and a different pattern means a different joined string and a fresh run.',
      'The article is about how far to move something after a failure. Nothing advances across the row here; each position receives a length and keeps it.',
      'The article uses "Z" for a z-index, a z-score, or a third axis.',
    ],

    contrastWith: [
      {
        concept: 'matchLengthPerSpot',
        note: 'How the numbers are arrived at against what they are then good for: that one is about a measurement feeding on its own earlier answers, while this claims the search is nothing more than reading the finished measurements for one particular value.',
      },
      {
        concept: 'kmp',
        note: 'Both prepare the pattern and then cross the text once, but one consults its lengths during the scan to decide where to resume, while this puts pattern and text into a single string so that measuring and searching are never separate acts.',
      },
      {
        concept: 'prefixSuffixJump',
        note: 'Both are read off a string with no second string involved, but one holds, for each opening piece, the longest length that is at once its head and its tail and exists to fix a distance, while this measures how far each position agrees with the front and makes equality with one length the answer itself.',
      },
      {
        concept: 'suffixArray',
        note: 'Both report every occurrence rather than the first, but one orders the text once and answers whatever pattern is asked of it afterwards, while this builds a string around the one pattern it was given and has to start over for the next.',
      },
    ],
  },
};
