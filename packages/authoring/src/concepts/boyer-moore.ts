/**
 * boyerMoore 개념 선언.
 *
 * canonical facet 은 `facet:boyerMoore` — 완제품이다. 자연어 77자가 움직이지 않는
 * 줄로 깔리고 패턴이 한 덩어리 슬래브로 그 아래를 미끄러진다. 나쁜 문자 표를 따로
 * 그리지 않는 것이 이 화면의 결정이다 — 어긋난 글자에서 패턴 안 같은 글자의 마지막
 * 칸으로 선이 내려가고, 그 선의 가로 폭이 곧 밀 거리다. 읽은 칸에는 점이 남아
 * 끝에 가서 점 없는 칸들이 점선으로 흐려진다. 손잡이는 패턴 길이(2 · 4 · 6 · 8)다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 둘이 각각 반쪽이다. `matchFromBack` 은 **견주는 방향**을, `badCharSkip` 은
 * **미는 거리의 출처**를 주어로 삼고, 둘 다 상대의 말을 definition 에서 비워 두었다.
 * 이쪽 definition 의 주어는 **그 둘을 합친 검색**이고, 주장은 조각 어느 쪽도 셀 수
 * 없는 것이다 — **패턴이 길어지면 평균 점프가 길어진다.** 그래서 definition 에
 * "combining" 과 "average" 가 들어가고, 조각들에는 그 두 낱말이 없다.
 *
 * keywords 도 겹치지 않게 갈랐다. 조각들이 규칙 이름(bad character rule · last
 * occurrence table)과 방향 어휘(right-to-left · Boyer-Moore scan order)를 이미
 * 가졌으므로, 이쪽은 **쓰는 자리와 계측** 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const boyerMooreConcept: FacetConceptSource = {
  id: 'boyerMoore',
  label: 'Boyer-Moore (A Longer Pattern Searches Faster)',
  canonicalFacet: 'facet:boyerMoore',

  surface: {
    definition:
      'A backward-comparing search whose jump distance is set by the character that failed, so the average jump lengthens as the pattern grows and most of the text is never examined.',
    exemplarKeywords: [
      'Boyer-Moore',
      'searching a long text for a word',
      'the longer the pattern the faster the search',
      'average skip distance',
      'how much of a text can a search afford to ignore',
      'grep-style substring search',
      'why string search beats reading everything',
      'substring search over ordinary prose',
      'fewer steps than the text has characters',
      'what two skip rules add up to together',
    ],
  },

  briefing: {
    observable: [
      'Three large readouts stand above the text — the average jump, the pattern length, and how many characters were never read — and the first is the one the handle moves, from 1.78 cells at two characters to 5.83 at eight.',
      'The text is a fixed row with a position number over every tenth cell, and a dot appears beneath a cell the moment it is compared and stays there for the rest of the run.',
      'The pattern travels below as one framed slab while a cursor walks it from its right end leftward, so the pairs light in the order they are actually consulted.',
      'No skip table is drawn anywhere. When a comparison fails, a line drops out of the failing text cell, runs along a rail between the rows, and ends at the pattern cell holding that same character last; the number of cells it spans is written on it.',
      'When the pattern holds no such character the line ends in a dashed empty box just off the slab\'s left edge, marked as absent, and the span it covers is the whole length of the pattern.',
      'The slab does not move until the line has landed, so the distance is seen being looked up rather than announced, and each move leaves a segment in a trail band drawn at the text\'s own coordinates.',
      'That trail band is what the handle rewrites: a two-character pattern leaves eighteen fine segments across the same prose, an eight-character one leaves six broad ones.',
      'At the end the slab rises against an alignment where every character agrees, and then every cell without a dot fades to a dashed outline, so what was never read is exactly what is left standing empty.',
      'The closing tally at the starting position names nine jumps averaging 5.56 cells, fifteen comparisons, and sixty-two of the seventy-seven characters never read.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a four-position slider for the pattern length, at six to begin with. Each position is a different word that genuinely occurs in the text.',
        'Four readouts sit beside the handle — jumps, cells jumped, comparisons, and unread characters — so the average shown above the text can be checked against the two numbers it comes from.',
        'The code panel writes the skip table out as an array indexed by character code rather than hiding it behind a lookup, which is the same distance the line on screen measures.',
        'The text is fixed at seventy-seven characters of ordinary prose and the run ends at the first full match, so an article can name the position the pattern is found at.',
      ],
    },

    useWhen: [
      'The article states that a search can finish without reading the text and a reader has no way to check it. Fifteen dotted cells out of seventy-seven, with the other sixty-two left standing as faded dashed outlines once the run ends, is that statement converted into something countable.',
      'The prose has introduced the backward comparison and the skip rule as separate ideas and now needs them to be one method. Neither half moves the slab alone here — the cursor has to fail before a line can be drawn, and the line has to land before the slab can slide.',
      'A reader expects a longer pattern to cost more and has to be shown the reverse. The handle runs from two characters to eight over the same prose while the average jump climbs from under two cells to nearly six, so length works for the searcher rather than against.',
    ],

    avoidWhen: [
      'The subject is the rule that reasons about the tail already matched, or the full method that takes whichever of two rules moves further. One rule decides every jump here.',
      'The article needs a worst case or a guarantee. This runs on prose where the rule does well, and a text drawn from one repeated character would collapse every jump to a single cell with nothing on screen to say so.',
      'The article needs every occurrence, or a count of them. The run ends at the first full match.',
      'The subject is preparation done over the text — sorted suffixes, an automaton, an index that serves whatever pattern is asked later. Nothing is prepared here beyond a reading of the pattern itself.',
      'The article means jumping through a sorted collection by comparing values, or skipping records in a query. What is skipped here is text that was never looked at, and the distance comes from a character that disagreed.',
    ],

    contrastWith: [
      {
        concept: 'matchFromBack',
        note: 'The direction and what the direction is worth: that one settles which end an alignment is decided from, while this carries the decision across a whole text and counts what it leaves unread.',
      },
      {
        concept: 'badCharSkip',
        note: 'The rule and its yield: that one settles how far a single failure may move the pattern, while this asks what those distances average out to once the pattern is made longer.',
      },
      {
        concept: 'kmp',
        note: 'Two ways to spend less on one pattern: one keeps whatever a mismatch already matched so no character is read twice, while this reads less of the text at all and makes no promise about the text it does read.',
      },
      {
        concept: 'naiveShiftByOne',
        note: 'Both sweep one pattern across one text, but one touches every character on the way and advances a single cell whatever went wrong, while this leaves most characters untouched and lets the failure fix the distance.',
      },
    ],
  },
};
